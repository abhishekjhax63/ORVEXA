import "server-only";

import type { AiCapability, AiUrgencyBand } from "@prisma/client";

import { optionalEnv } from "@/lib/env";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDER_PROFILES,
  providerProfile,
  type AiProviderId,
  type AiProviderProfile,
} from "@/lib/ai/capabilities";
import { DEFAULT_ESCALATION_POLICY, isUrgencyBand, type AiEscalationPolicy } from "@/lib/ai/safety";

/**
 * Server-side AI configuration.
 *
 * Follows the same rule as the maps, email and SMS integrations: a capability
 * that has no credentials configured reports itself as unavailable. It never
 * falls back to a canned answer, and no code path may describe an unconfigured
 * deployment as if it had produced a real assessment.
 *
 * Nothing in this module is importable from a Client Component, so an API key
 * cannot reach the browser bundle even by accident.
 */

export type AiProviderConfig = {
  provider: AiProviderId;
  apiKey: string;
  /** Overrides the provider's default model. */
  model: string;
  /**
   * Speech-to-text model. Configured separately from `model` because a chat or
   * vision model cannot be sent to the transcription endpoint — the two live on
   * different endpoints with different model lists.
   */
  transcribeModel: string;
  /** Provider-side organisation/project routing, when the account needs it. */
  organization: string | null;
  baseUrl: string;
  profile: AiProviderProfile;
};

const DEFAULT_BASE_URL: Record<AiProviderId, string> = {
  openai: "https://api.openai.com/v1",
};

const DEFAULT_TRANSCRIBE_MODEL: Record<AiProviderId, string> = {
  openai: "whisper-1",
};

export function getAiProviderConfig(): AiProviderConfig | undefined {
  const requested = optionalEnv("AI_PROVIDER")?.trim().toLowerCase() || (optionalEnv("OPENAI_API_KEY") ? "openai" : undefined);
  if (!requested) return undefined;
  if (!(AI_PROVIDER_IDS as readonly string[]).includes(requested)) return undefined;
  const provider = requested as AiProviderId;

  const apiKey = optionalEnv("AI_PROVIDER_API_KEY") || optionalEnv("OPENAI_API_KEY");
  if (!apiKey) return undefined;

  return {
    provider,
    apiKey,
    model: optionalEnv("OPENAI_MODEL") ?? optionalEnv("AI_PROVIDER_MODEL") ?? AI_PROVIDER_PROFILES[provider].defaultModel,
    transcribeModel: optionalEnv("AI_PROVIDER_TRANSCRIBE_MODEL") ?? DEFAULT_TRANSCRIBE_MODEL[provider],
    organization: optionalEnv("AI_PROVIDER_ORGANIZATION") ?? null,
    baseUrl: (optionalEnv("AI_PROVIDER_BASE_URL") ?? DEFAULT_BASE_URL[provider]).replace(/\/+$/, ""),
    profile: providerProfile(provider),
  };
}

export function isAiConfigured(): boolean {
  return getAiProviderConfig() !== undefined;
}

/** Label for the provider in use, or an explicit "not configured" string. */
export function aiProviderLabel(): string {
  const config = getAiProviderConfig();
  return config ? config.profile.label : "no AI provider";
}

/**
 * Capability report for the deployment in front of a user.
 *
 * Returned for both configured and unconfigured deployments: when nothing is
 * configured every capability reads as unavailable, which is what the workspace
 * shows instead of an empty chat box.
 */
export function aiCapabilityReport(): {
  configured: boolean;
  provider: AiProviderId | null;
  providerLabel: string;
  available: AiCapability[];
  unavailable: { capability: AiCapability; reason: string }[];
} {
  const config = getAiProviderConfig();
  if (!config) {
    const all: AiCapability[] = ["TEXT", "VISION_IMAGE", "VIDEO", "AUDIO_TRANSCRIPTION", "DOCUMENT"];
    return {
      configured: false,
      provider: null,
      providerLabel: "No provider configured",
      available: [],
      unavailable: all.map((capability) => ({
        capability,
        reason: "No AI provider is configured on this deployment, so nothing can be analysed.",
      })),
    };
  }

  const all: AiCapability[] = ["TEXT", "VISION_IMAGE", "VIDEO", "AUDIO_TRANSCRIPTION", "DOCUMENT"];
  const unavailable = all
    .filter((capability) => !config.profile.native.includes(capability))
    .map((capability) => ({
      capability,
      reason:
        config.profile.unsupportedReason[capability] ??
        `The configured provider does not declare support for ${capability.toLowerCase().replace("_", " ")}.`,
    }));

  return {
    configured: true,
    provider: config.provider,
    providerLabel: config.profile.label,
    available: [...config.profile.native],
    unavailable,
  };
}

// ---------------------------------------------------------------------------
// Escalation policy
//
// The policy shape and the safe defaults live in `src/lib/ai/safety.ts` so the
// pure safety layer can be reasoned about and unit-tested without any
// environment access. This module only maps environment variables onto it.
// ---------------------------------------------------------------------------

function bandFromEnv(name: string, fallback: AiUrgencyBand): AiUrgencyBand {
  const value = optionalEnv(name)?.trim().toUpperCase();
  return value && isUrgencyBand(value) ? value : fallback;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = optionalEnv(name)?.trim().toLowerCase();
  if (value === undefined) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

export function getAiEscalationPolicy(): AiEscalationPolicy {
  return {
    redFlagFloorBand: bandFromEnv("AI_RED_FLAG_FLOOR_BAND", DEFAULT_ESCALATION_POLICY.redFlagFloorBand),
    reviewRequiredAtOrAbove: bandFromEnv("AI_REVIEW_REQUIRED_AT", DEFAULT_ESCALATION_POLICY.reviewRequiredAtOrAbove),
    blockShareUntilReviewed: boolFromEnv("AI_BLOCK_SHARE_UNTIL_REVIEWED", DEFAULT_ESCALATION_POLICY.blockShareUntilReviewed),
    autoOfferEmergencyRoute: boolFromEnv("AI_AUTO_OFFER_EMERGENCY_ROUTE", DEFAULT_ESCALATION_POLICY.autoOfferEmergencyRoute),
    alwaysIncludeEnglishSafetyLine: boolFromEnv(
      "AI_ALWAYS_SHOW_ENGLISH_SAFETY_LINE",
      DEFAULT_ESCALATION_POLICY.alwaysIncludeEnglishSafetyLine,
    ),
  };
}

// ---------------------------------------------------------------------------
// Retention policy
// ---------------------------------------------------------------------------

export type AiRetentionPolicy = {
  conversationDays: number;
  uploadDays: number;
  /** Days an assistant reply is kept when the user never saves the assessment. */
  unsavedAssessmentDays: number;
  /** Whether transcripts of voice notes are stored at all beyond the turn. */
  storeVoiceTranscripts: boolean;
  /** Days a clinician share link stays valid. */
  shareLinkDays: number;
};

function daysFromEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 3650);
}

export function getAiRetentionPolicy(): AiRetentionPolicy {
  return {
    conversationDays: daysFromEnv("AI_CONVERSATION_RETENTION_DAYS", 90),
    uploadDays: daysFromEnv("AI_UPLOAD_RETENTION_DAYS", 30),
    unsavedAssessmentDays: daysFromEnv("AI_UNSAVED_ASSESSMENT_RETENTION_DAYS", 7),
    storeVoiceTranscripts: boolFromEnv("AI_STORE_VOICE_TRANSCRIPTS", true),
    shareLinkDays: daysFromEnv("AI_SHARE_LINK_DAYS", 14),
  };
}

export function retentionDeadline(days: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Private object storage
// ---------------------------------------------------------------------------

export type ObjectStorageConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
};

/**
 * Private bucket credentials.
 *
 * Separate bucket from any public asset bucket, and separate credentials from
 * anything the browser holds: this key can read every patient's upload, so it
 * stays on the server and is never prefixed with `NEXT_PUBLIC_`.
 */
export function getObjectStorageConfig(): ObjectStorageConfig | undefined {
  const url = optionalEnv("SUPABASE_URL") ?? optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = optionalEnv("AI_UPLOAD_BUCKET") ?? "orvexa-ai-uploads";
  if (!url || !serviceRoleKey) return undefined;
  return { url, serviceRoleKey, bucket };
}

export function isObjectStorageConfigured(): boolean {
  return getObjectStorageConfig() !== undefined;
}

// ---------------------------------------------------------------------------
// Malware scanning
// ---------------------------------------------------------------------------

export type MalwareScanConfig = {
  endpoint: string;
  secret: string;
};

/**
 * Upload scanning is delegated to a scanner service.
 *
 * There is no in-process fallback: if no scanner is configured, files are
 * recorded with `SKIPPED` and the UI says the file was not scanned. Pretending a
 * file was scanned is worse than admitting it was not.
 */
export function getMalwareScanConfig(): MalwareScanConfig | undefined {
  const endpoint = optionalEnv("AI_MALWARE_SCAN_URL");
  const secret = optionalEnv("AI_MALWARE_SCAN_SECRET");
  if (!endpoint || !secret) return undefined;
  return { endpoint, secret };
}

export function isMalwareScanConfigured(): boolean {
  return getMalwareScanConfig() !== undefined;
}

// ---------------------------------------------------------------------------
// Clinical review pathway
// ---------------------------------------------------------------------------

export type AiReviewConfig = {
  /** Address a review request is delivered to. Absent means the queue is in-app only. */
  reviewerInbox: string | undefined;
  /** Whether the platform can page a reviewer out of hours. */
  outOfHoursPaging: boolean;
};

export function getAiReviewConfig(): AiReviewConfig {
  return {
    reviewerInbox: optionalEnv("AI_CLINICAL_REVIEW_INBOX"),
    outOfHoursPaging: boolFromEnv("AI_CLINICAL_REVIEW_OUT_OF_HOURS", false),
  };
}

// ---------------------------------------------------------------------------
// Clinician share links
// ---------------------------------------------------------------------------

/**
 * Secret used to key the HMAC of a share token.
 *
 * Only the digest is stored, so a database dump cannot be replayed as a working
 * link. There is deliberately no fallback secret: a hardcoded default would mean
 * every deployment that forgot to set one signed its links with a value an
 * attacker also has, which is worse than refusing to share. Without it, sharing
 * reports itself as unconfigured and the button says so.
 */
export function getShareLinkSecret(): string | undefined {
  const secret = optionalEnv("AI_SHARE_LINK_SECRET");
  return secret && secret.length >= 32 ? secret : undefined;
}

export function isShareLinkConfigured(): boolean {
  return getShareLinkSecret() !== undefined;
}

/**
 * Human-readable summary of the live policy, shown on the workspace's honesty
 * panel so a reviewer can confirm what this build is actually configured to do.
 */
export function describeAiPolicy(): {
  provider: string;
  configured: boolean;
  escalation: AiEscalationPolicy;
  retention: AiRetentionPolicy;
  malwareScanning: boolean;
  clinicalReviewInbox: boolean;
} {
  return {
    provider: aiProviderLabel(),
    configured: isAiConfigured(),
    escalation: getAiEscalationPolicy(),
    retention: getAiRetentionPolicy(),
    malwareScanning: isMalwareScanConfigured(),
    clinicalReviewInbox: getAiReviewConfig().reviewerInbox !== undefined,
  };
}
