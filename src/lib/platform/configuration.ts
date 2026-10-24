import "server-only";

import type { FeatureFlag, PlatformSetting, PlatformSettingCategory } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  actingOperatorLabel,
  recordPlatformAction,
  type PlatformContext,
} from "@/lib/platform/console";
import { platformFail, platformOk, type PlatformResult } from "@/lib/platform/errors";
import { sanitiseMultiline, sanitiseSingleLine } from "@/lib/security/sanitize";
import {
  PLATFORM_SETTING_CATEGORY_BY_KEY,
  PLATFORM_SETTING_KEYS,
  parsePlatformSettingValue,
  type FeatureFlagInput,
  type NotificationTemplateInput,
  type PlatformSettingKey,
  type PlatformSettingWriteInput,
  type RegionEntryInput,
  type ServiceCategoryInput,
} from "@/lib/validation/platform";

/**
 * Platform configuration: the settings, flags and catalogues an administrator
 * can change without a deployment.
 *
 * ## A setting is read, not stored blind
 *
 * `PlatformSetting.value` is `Json`, and the only thing that keeps it honest is
 * that every write goes through `parsePlatformSettingValue`, which validates the
 * value against the schema its key promises. A row a hand-run SQL statement
 * wrote with the wrong shape is not trusted either: `listPlatformSettings`
 * re-parses on read and reports an unreadable value as invalid rather than
 * rendering it as configuration.
 *
 * ## A flag defaults to off
 *
 * `enabled` is false and `rolloutPercent` is 0 on creation, so a flag that has
 * just been made cannot switch a half-built feature on for everybody. The key is
 * immutable: an edit form that also renames the flag is refused rather than
 * silently orphaning the key everything else reads.
 *
 * ## Catalogue entries are entries, not blobs
 *
 * Service categories, supported regions and notification templates are all
 * stored inside three settings, but the console edits them one at a time. The
 * helpers below read the array, change one member, re-validate the whole array
 * and write it back — so the stored value is always a complete, valid document,
 * never a partial patch of one.
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type PlatformSettingView = {
  key: PlatformSettingKey;
  category: PlatformSettingCategory;
  label: string;
  description: string | null;
  /** The parsed value, or null when the setting has never been written. */
  value: unknown;
  configured: boolean;
  /** False when the stored value no longer matches the schema its key promises. */
  isValid: boolean;
  invalidReason: string | null;
  updatedAt: Date | null;
  updatedByLabel: string | null;
};

const SETTING_LABELS: Record<PlatformSettingKey, string> = {
  "service_catalogue.categories": "Bookable service categories",
  "regions.supported": "Supported regions",
  "notifications.templates": "Notification templates",
  "security.session_policy": "Session policy",
  "operations.maintenance_window": "Maintenance window",
};

function toSettingView(row: PlatformSetting | null, key: PlatformSettingKey): PlatformSettingView {
  const category = PLATFORM_SETTING_CATEGORY_BY_KEY[key];
  if (!row) {
    return {
      key,
      category,
      label: SETTING_LABELS[key],
      description: null,
      value: null,
      configured: false,
      isValid: true,
      invalidReason: null,
      updatedAt: null,
      updatedByLabel: null,
    };
  }

  const parsed = parsePlatformSettingValue(key, row.value);
  return {
    key,
    category,
    label: row.label || SETTING_LABELS[key],
    description: row.description,
    value: parsed.ok ? parsed.value : null,
    configured: true,
    isValid: parsed.ok,
    invalidReason: parsed.ok ? null : parsed.message,
    updatedAt: row.updatedAt,
    updatedByLabel: null,
  };
}

/**
 * Every known setting, including the ones never written.
 *
 * The console shows the whole configurable surface rather than only the rows
 * that exist, because "this knob has never been set" is information an operator
 * needs — it explains why a value is falling back to a code default.
 */
export async function listPlatformSettings(): Promise<PlatformSettingView[]> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: [...PLATFORM_SETTING_KEYS] } },
    include: { updatedBy: { select: { fullName: true } } },
  });

  const byKey = new Map(rows.map((row) => [row.key, row]));
  return PLATFORM_SETTING_KEYS.map((key) => {
    const view = toSettingView(byKey.get(key) ?? null, key);
    const row = byKey.get(key);
    return row ? { ...view, updatedByLabel: row.updatedBy?.fullName ?? null } : view;
  });
}

/** The parsed value for one setting, or null when unset or unreadable. */
export async function getPlatformSettingValue(key: PlatformSettingKey): Promise<unknown | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key }, select: { value: true } });
  if (!row) return null;
  const parsed = parsePlatformSettingValue(key, row.value);
  return parsed.ok ? parsed.value : null;
}

async function writeSettingValue(input: {
  context: PlatformContext;
  key: PlatformSettingKey;
  value: unknown;
  label?: string | null;
  description?: string | null;
}): Promise<PlatformResult<PlatformSettingView>> {
  const { context, key } = input;

  const parsed = parsePlatformSettingValue(key, input.value);
  if (!parsed.ok) {
    return platformFail("setting_value_invalid", parsed.message);
  }

  const category = PLATFORM_SETTING_CATEGORY_BY_KEY[key];
  const label = input.label ? sanitiseSingleLine(input.label, 160) : SETTING_LABELS[key];
  const description = input.description ? sanitiseMultiline(input.description, 600) : null;

  const row = await prisma.platformSetting.upsert({
    where: { key },
    create: {
      key,
      category,
      label,
      description,
      value: parsed.value as never,
      updatedById: context.user.id,
    },
    update: {
      label,
      description,
      value: parsed.value as never,
      updatedById: context.user.id,
    },
    include: { updatedBy: { select: { fullName: true } } },
  });

  const action =
    category === "NOTIFICATIONS"
      ? "platform.notification_template_updated"
      : category === "REGIONS"
        ? "platform.region_list_updated"
        : "platform.setting_updated";

  await recordPlatformAction({
    context,
    action,
    entityType: "platform_setting",
    entityId: row.id,
    metadata: { settingKey: key, category },
  });

  const view = toSettingView(row, key);
  return platformOk({ ...view, updatedByLabel: row.updatedBy?.fullName ?? null });
}

/** Writes a whole setting, validating the value against its key's schema. */
export async function updatePlatformSetting(input: {
  context: PlatformContext;
  data: PlatformSettingWriteInput;
}): Promise<PlatformResult<PlatformSettingView>> {
  return writeSettingValue({
    context: input.context,
    key: input.data.key,
    value: input.data.value,
    label: input.data.label,
    description: input.data.description,
  });
}

// ---------------------------------------------------------------------------
// Catalogue entries — service categories, regions, notification templates
// ---------------------------------------------------------------------------

async function readArray<T>(key: PlatformSettingKey, field: string): Promise<T[]> {
  const value = await getPlatformSettingValue(key);
  if (!value || typeof value !== "object") return [];
  const candidate = (value as Record<string, unknown>)[field];
  return Array.isArray(candidate) ? (candidate as T[]) : [];
}

export type ServiceCategory = {
  key: string;
  name: string;
  vertical: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
};

export async function listServiceCategories(): Promise<ServiceCategory[]> {
  return readArray<ServiceCategory>("service_catalogue.categories", "categories");
}

/**
 * Adds or replaces one service category, matched on `key`.
 *
 * A replace rather than an append: two categories sharing a key would make
 * "which one is live" unanswerable, so the second write wins deliberately.
 */
export async function upsertServiceCategory(input: {
  context: PlatformContext;
  data: ServiceCategoryInput;
}): Promise<PlatformResult<ServiceCategory[]>> {
  const categories = await listServiceCategories();
  const next = categories.filter((entry) => entry.key !== input.data.key);
  next.push({
    key: input.data.key,
    name: input.data.name,
    vertical: input.data.vertical,
    description: input.data.description,
    isActive: input.data.isActive,
    sortOrder: input.data.sortOrder,
  });
  next.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const written = await writeSettingValue({
    context: input.context,
    key: "service_catalogue.categories",
    value: { categories: next },
  });
  if (!written.ok) return platformFail(written.code, written.message);
  return platformOk(next);
}

export async function removeServiceCategory(input: {
  context: PlatformContext;
  key: string;
}): Promise<PlatformResult<ServiceCategory[]>> {
  const categories = await listServiceCategories();
  const next = categories.filter((entry) => entry.key !== input.key);
  if (next.length === categories.length) {
    return platformFail("not_found", "That service category is not configured.");
  }
  const written = await writeSettingValue({
    context: input.context,
    key: "service_catalogue.categories",
    value: { categories: next },
  });
  if (!written.ok) return platformFail(written.code, written.message);
  return platformOk(next);
}

export type SupportedRegion = { code: string; name: string; isActive: boolean; notes?: string };

export async function listSupportedRegions(): Promise<SupportedRegion[]> {
  return readArray<SupportedRegion>("regions.supported", "regions");
}

export async function upsertSupportedRegion(input: {
  context: PlatformContext;
  data: RegionEntryInput;
}): Promise<PlatformResult<SupportedRegion[]>> {
  const regions = await listSupportedRegions();
  const next = regions.filter((entry) => entry.code !== input.data.code);
  next.push({
    code: input.data.code,
    name: input.data.name,
    isActive: input.data.isActive,
    notes: input.data.notes,
  });
  next.sort((a, b) => a.code.localeCompare(b.code));

  const written = await writeSettingValue({
    context: input.context,
    key: "regions.supported",
    value: { regions: next },
  });
  if (!written.ok) return platformFail(written.code, written.message);
  return platformOk(next);
}

export async function removeSupportedRegion(input: {
  context: PlatformContext;
  code: string;
}): Promise<PlatformResult<SupportedRegion[]>> {
  const regions = await listSupportedRegions();
  const next = regions.filter((entry) => entry.code !== input.code);
  if (next.length === regions.length) {
    return platformFail("not_found", "That region is not configured.");
  }
  const written = await writeSettingValue({
    context: input.context,
    key: "regions.supported",
    value: { regions: next },
  });
  if (!written.ok) return platformFail(written.code, written.message);
  return platformOk(next);
}

export type NotificationTemplate = {
  key: string;
  channel: string;
  locale: string;
  subject?: string;
  body: string;
  isActive: boolean;
};

export async function listNotificationTemplates(): Promise<NotificationTemplate[]> {
  return readArray<NotificationTemplate>("notifications.templates", "templates");
}

export async function upsertNotificationTemplate(input: {
  context: PlatformContext;
  data: NotificationTemplateInput;
}): Promise<PlatformResult<NotificationTemplate[]>> {
  const templates = await listNotificationTemplates();
  const next = templates.filter(
    (entry) => !(entry.key === input.data.key && entry.channel === input.data.channel),
  );
  next.push({
    key: input.data.key,
    channel: input.data.channel,
    locale: input.data.locale,
    subject: input.data.subject,
    body: input.data.body,
    isActive: input.data.isActive,
  });
  next.sort((a, b) => a.key.localeCompare(b.key) || a.channel.localeCompare(b.channel));

  const written = await writeSettingValue({
    context: input.context,
    key: "notifications.templates",
    value: { templates: next },
  });
  if (!written.ok) return platformFail(written.code, written.message);
  return platformOk(next);
}

export async function removeNotificationTemplate(input: {
  context: PlatformContext;
  key: string;
  channel: string;
}): Promise<PlatformResult<NotificationTemplate[]>> {
  const templates = await listNotificationTemplates();
  const next = templates.filter(
    (entry) => !(entry.key === input.key && entry.channel === input.channel),
  );
  if (next.length === templates.length) {
    return platformFail("not_found", "That notification template is not configured.");
  }
  const written = await writeSettingValue({
    context: input.context,
    key: "notifications.templates",
    value: { templates: next },
  });
  if (!written.ok) return platformFail(written.code, written.message);
  return platformOk(next);
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export type FeatureFlagView = {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  environments: string[];
  updatedAt: Date;
  updatedByLabel: string | null;
};

function toFlagView(row: FeatureFlag & { updatedBy?: { fullName: string } | null }): FeatureFlagView {
  return {
    id: row.id,
    key: row.key,
    description: row.description,
    enabled: row.enabled,
    rolloutPercent: row.rolloutPercent,
    environments: row.environments,
    updatedAt: row.updatedAt,
    updatedByLabel: row.updatedBy?.fullName ?? null,
  };
}

export async function listFeatureFlags(): Promise<FeatureFlagView[]> {
  const rows = await prisma.featureFlag.findMany({
    include: { updatedBy: { select: { fullName: true } } },
    orderBy: { key: "asc" },
  });
  return rows.map(toFlagView);
}

/**
 * Creates a flag, or updates the one named by `flagId`.
 *
 * `flagId` is optional so the same handler serves create and edit. When it is
 * given and the stored key differs from the submitted one, the write is refused:
 * renaming a flag would leave every `isEnabled(key)` call site reading a key
 * that no longer exists, and the failure would look like the feature breaking
 * rather than the flag being renamed.
 */
export async function upsertFeatureFlag(input: {
  context: PlatformContext;
  flagId?: string | null;
  data: FeatureFlagInput;
}): Promise<PlatformResult<FeatureFlagView>> {
  const { context, data } = input;

  if (input.flagId) {
    const existing = await prisma.featureFlag.findUnique({
      where: { id: input.flagId },
      select: { id: true, key: true },
    });
    if (!existing) return platformFail("flag_not_found", "That feature flag no longer exists.");
    if (existing.key !== data.key) {
      return platformFail(
        "flag_key_immutable",
        "A feature flag's key cannot be changed once it exists. Create a new flag instead.",
      );
    }

    const row = await prisma.featureFlag.update({
      where: { id: existing.id },
      data: {
        description: sanitiseSingleLine(data.description, 400),
        enabled: data.enabled,
        rolloutPercent: data.rolloutPercent,
        environments: data.environments,
        updatedById: context.user.id,
      },
      include: { updatedBy: { select: { fullName: true } } },
    });

    await recordPlatformAction({
      context,
      action: "platform.feature_flag_updated",
      entityType: "feature_flag",
      entityId: row.id,
      metadata: {
        flagKey: row.key,
        enabled: row.enabled,
        rolloutPercent: row.rolloutPercent,
        environments: row.environments.join(","),
      },
    });

    return platformOk(toFlagView(row));
  }

  const clash = await prisma.featureFlag.findUnique({ where: { key: data.key }, select: { id: true } });
  if (clash) {
    return platformFail("flag_key_exists", "A feature flag with that key already exists.");
  }

  const row = await prisma.featureFlag.create({
    data: {
      key: data.key,
      description: sanitiseSingleLine(data.description, 400),
      enabled: data.enabled,
      rolloutPercent: data.rolloutPercent,
      environments: data.environments,
      updatedById: context.user.id,
    },
    include: { updatedBy: { select: { fullName: true } } },
  });

  await recordPlatformAction({
    context,
    action: "platform.feature_flag_updated",
    entityType: "feature_flag",
    entityId: row.id,
    metadata: {
      flagKey: row.key,
      created: true,
      enabled: row.enabled,
      rolloutPercent: row.rolloutPercent,
      operator: actingOperatorLabel(context),
    },
  });

  return platformOk(toFlagView(row));
}
