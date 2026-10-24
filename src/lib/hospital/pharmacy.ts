import "server-only";

import type {
  HospitalStockAlertStatus,
  HospitalStockAlertType,
  HospitalStockItemKind,
  Prisma,
  StockMovementType,
} from "@prisma/client";

import type { Permission } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import {
  type HospitalResult,
  HospitalFailure,
  hospitalFail,
  hospitalOk,
  isUniqueViolation,
  reserveHospitalReference,
} from "@/lib/hospital/errors";
import {
  type HospitalContext,
  actingStaffName,
  assertHospitalScope,
} from "@/lib/hospital/tenant";
import { recordAuditEvent } from "@/lib/security/audit";

/**
 * Hospital pharmacy: stock, movements, expiry alerts and dispensing.
 *
 * ## The rules this file holds
 *
 * Every stock figure is a stored column, never a computed guess. A stock level
 * only changes inside a transaction that also writes the `HospitalStockMovement`
 * proving it: a `quantityOnHand` that cannot be reconstructed from its movements
 * is treated as a bug, so `createStockItem` writes an opening movement rather
 * than letting an opening balance sit on the row untouched.
 *
 * ## Why every failure inside a transaction throws `HospitalFailure`
 *
 * Prisma's interactive transaction callback cannot return "the stock is short"
 * as an ordinary value without the caller having to unwrap two unions. Instead
 * the callback throws a `HospitalFailure` and the outer function catches it and
 * converts it to the shared `HospitalResult` failure arm. The tenant helpers and
 * the reference allocator already throw for the same reason; this keeps one
 * unwinding path for every expected condition.
 */

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/**
 * How close to expiry a batch must be before a `NEAR_EXPIRY` alert is raised.
 * A stored expiry date is the only input: this is a window applied to a real
 * date, not an assumption about shelf life.
 */
export const STOCK_EXPIRY_ALERT_WINDOW_DAYS = 90;

const STOCK_ITEM_SELECT = {
  id: true,
  pharmacyUnitId: true,
  itemKind: true,
  code: true,
  name: true,
  description: true,
  unit: true,
  dosageForm: true,
  strengthLabel: true,
  batchNumber: true,
  expiryDate: true,
  quantityOnHand: true,
  reorderLevel: true,
  unitCostPaise: true,
  sellingPricePaise: true,
  taxRateBp: true,
  location: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HospitalStockItemSelect;

type StockItemRow = Prisma.HospitalStockItemGetPayload<{ select: typeof STOCK_ITEM_SELECT }>;

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export type StockItemSummary = {
  id: string;
  pharmacyUnitId: string | null;
  itemKind: HospitalStockItemKind;
  code: string;
  name: string;
  description: string | null;
  unit: string;
  dosageForm: string | null;
  strengthLabel: string | null;
  batchNumber: string | null;
  expiryDate: Date | null;
  quantityOnHand: number;
  reorderLevel: number;
  unitCostPaise: number | null;
  sellingPricePaise: number | null;
  taxRateBp: number;
  location: string | null;
  isActive: boolean;
  /** Derived from the stored expiry date only, so a list can badge a batch. */
  isExpired: boolean;
  isNearExpiry: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type StockMovementSummary = {
  id: string;
  stockItemId: string;
  type: StockMovementType;
  quantityDelta: number;
  balanceAfter: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  performedById: string;
  performedByName: string | null;
  occurredAt: Date;
};

export type StockAlertSummary = {
  id: string;
  stockItemId: string;
  type: HospitalStockAlertType;
  status: HospitalStockAlertStatus;
  detail: string | null;
  threshold: number | null;
  detectedAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
};

export type DispenseSummary = {
  id: string;
  reference: string;
  patientId: string;
  pharmacyUnitId: string | null;
  admissionId: string | null;
  prescriptionId: string | null;
  status: string;
  dispensedById: string | null;
  dispensedByName: string | null;
  dispensedAt: Date | null;
  notes: string | null;
  items: {
    stockItemId: string;
    nameSnapshot: string;
    batchNumber: string | null;
    expiryDate: Date | null;
    quantity: number;
    unitPricePaise: number | null;
  }[];
};

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type StockItemFilter = {
  query?: string;
  itemKind?: HospitalStockItemKind;
  pharmacyUnitId?: string;
  /** Only items at or below their reorder level. */
  lowStockOnly?: boolean;
  /** Only batches whose stored expiry falls within this many days. */
  expiringWithinDays?: number;
  includeInactive?: boolean;
  take?: number;
};

export type CreateStockItemInput = {
  code: string;
  name: string;
  itemKind?: HospitalStockItemKind;
  unit?: string;
  dosageForm?: string | null;
  strengthLabel?: string | null;
  description?: string | null;
  pharmacyUnitId?: string | null;
  supplierId?: string | null;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  reorderLevel?: number;
  unitCostPaise?: number | null;
  sellingPricePaise?: number | null;
  taxRateBp?: number;
  location?: string | null;
  /** Opening balance, written with a `RECEIPT` movement so it is reconstructible. */
  openingQuantity?: number;
};

export type StockReceiptInput = {
  stockItemId: string;
  quantity: number;
  batchNumber?: string | null;
  expiresAt?: Date | null;
  unitCostPaise?: number | null;
  reason: string;
};

export type StockAdjustmentInput = {
  stockItemId: string;
  /** The counted level. The movement records the delta from the stored level. */
  newQuantity: number;
  reason: string;
};

/** Outbound movement kinds a manual issue may carry. */
export type StockIssueType = Extract<StockMovementType, "DISPENSE" | "TRANSFER_OUT" | "EXPIRY_WRITE_OFF">;

export type StockIssueInput = {
  stockItemId: string;
  quantity: number;
  type: StockIssueType;
  reason: string;
  referenceType?: string | null;
  referenceId?: string | null;
};

export type StockMovementFilter = {
  stockItemId?: string;
  type?: StockMovementType;
  from?: Date;
  to?: Date;
  take?: number;
};

export type DispenseInput = {
  patientId: string;
  pharmacyUnitId?: string | null;
  admissionId?: string | null;
  prescriptionId?: string | null;
  notes?: string | null;
  /**
   * Caller-supplied key so a double tap resolves to the same dispense. The
   * `@@unique([hospitalId, idempotencyKey])` constraint turns a race into a
   * `duplicate_dispense` failure instead of a second stock deduction.
   */
  idempotencyKey: string;
  items: { stockItemId: string; quantity: number }[];
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/**
 * Reports a missing in-hospital permission.
 *
 * The shared error vocabulary has no dedicated "forbidden" code, so a caller
 * who lacks the permission is answered with `no_membership` — the same signal the
 * tenant layer gives somebody who is not a member of the hospital at all, and the
 * caller renders one "ask an administrator" message for both. The real gate is
 * still the route guard, which calls `requireHospitalContext` before these
 * functions; this is the belt to that guard's braces.
 */
function deny(context: HospitalContext, permission: Permission): HospitalFailure | null {
  return context.permissions.has(permission)
    ? null
    : new HospitalFailure("no_membership", "Your role does not include this action. Ask a hospital administrator.");
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function toStockItemSummary(row: StockItemRow, now: Date): StockItemSummary {
  const expiry = row.expiryDate;
  const windowMs = STOCK_EXPIRY_ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const isExpired = expiry !== null && expiry.getTime() < now.getTime();
  const isNearExpiry =
    expiry !== null && !isExpired && expiry.getTime() <= now.getTime() + windowMs;
  return {
    id: row.id,
    pharmacyUnitId: row.pharmacyUnitId,
    itemKind: row.itemKind,
    code: row.code,
    name: row.name,
    description: row.description,
    unit: row.unit,
    dosageForm: row.dosageForm,
    strengthLabel: row.strengthLabel,
    batchNumber: row.batchNumber,
    expiryDate: row.expiryDate,
    quantityOnHand: row.quantityOnHand,
    reorderLevel: row.reorderLevel,
    unitCostPaise: row.unitCostPaise,
    sellingPricePaise: row.sellingPricePaise,
    taxRateBp: row.taxRateBp,
    location: row.location,
    isActive: row.isActive,
    isExpired,
    isNearExpiry,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Applies a target stock level and records the movement that explains it.
 *
 * The item is re-read inside the caller's transaction with the hospital scope in
 * the `where`, so the level the delta is measured against is the stored level at
 * the moment of the write. A target below zero is refused rather than clamped:
 * stock quietly going negative is how a count stops meaning anything.
 */
async function applyStockLevel(
  tx: Prisma.TransactionClient,
  context: HospitalContext,
  input: {
    stockItemId: string;
    nextQuantity: number;
    type: StockMovementType;
    reason: string;
    referenceType?: string | null;
    referenceId?: string | null;
    itemUpdate?: Prisma.HospitalStockItemUpdateManyMutationInput;
  },
): Promise<{ before: number; after: number; movementId: string }> {
  const item = await tx.hospitalStockItem.findFirst({
    where: { id: input.stockItemId, hospitalId: context.hospitalId },
    select: { id: true, quantityOnHand: true },
  });
  if (!item) throw new HospitalFailure("not_found", "That stock item is not in this hospital's inventory.");
  if (input.nextQuantity < 0) {
    throw new HospitalFailure(
      "insufficient_stock",
      `There are ${item.quantityOnHand} on hand, so the level cannot become ${input.nextQuantity}.`,
    );
  }

  const updated = await tx.hospitalStockItem.updateMany({
    where: { id: item.id, hospitalId: context.hospitalId },
    data: { quantityOnHand: input.nextQuantity, ...(input.itemUpdate ?? {}) },
  });
  if (updated.count !== 1) {
    throw new HospitalFailure("conflict", "The stock item changed while it was being updated. Please try again.");
  }

  const movement = await tx.hospitalStockMovement.create({
    data: {
      hospitalId: context.hospitalId,
      stockItemId: item.id,
      type: input.type,
      quantityDelta: input.nextQuantity - item.quantityOnHand,
      balanceAfter: input.nextQuantity,
      reason: input.reason,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      performedById: context.user.id,
      performedByName: actingStaffName(context),
    },
    select: { id: true },
  });

  return { before: item.quantityOnHand, after: input.nextQuantity, movementId: movement.id };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listStockItems(
  context: HospitalContext,
  filter: StockItemFilter = {},
): Promise<StockItemSummary[]> {
  const now = new Date();
  const where: Prisma.HospitalStockItemWhereInput = { hospitalId: context.hospitalId };
  if (!filter.includeInactive) where.isActive = true;
  if (filter.itemKind) where.itemKind = filter.itemKind;
  if (filter.pharmacyUnitId) where.pharmacyUnitId = filter.pharmacyUnitId;
  if (filter.query) {
    where.OR = [
      { name: { contains: filter.query, mode: "insensitive" } },
      { code: { contains: filter.query, mode: "insensitive" } },
      { batchNumber: { contains: filter.query, mode: "insensitive" } },
    ];
  }
  if (filter.expiringWithinDays !== undefined) {
    where.expiryDate = { lte: new Date(now.getTime() + filter.expiringWithinDays * 24 * 60 * 60 * 1000) };
  }

  const rows = await prisma.hospitalStockItem.findMany({
    where,
    orderBy: { name: "asc" },
    take: filter.take ?? 200,
    select: STOCK_ITEM_SELECT,
  });

  const summaries = rows.map((row) => toStockItemSummary(row, now));
  return filter.lowStockOnly ? summaries.filter((row) => row.quantityOnHand <= row.reorderLevel) : summaries;
}

export async function listStockMovements(
  context: HospitalContext,
  filter: StockMovementFilter = {},
): Promise<StockMovementSummary[]> {
  const where: Prisma.HospitalStockMovementWhereInput = { hospitalId: context.hospitalId };
  if (filter.stockItemId) where.stockItemId = filter.stockItemId;
  if (filter.type) where.type = filter.type;
  if (filter.from || filter.to) {
    where.occurredAt = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) };
  }

  return prisma.hospitalStockMovement.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: filter.take ?? 200,
    select: {
      id: true,
      stockItemId: true,
      type: true,
      quantityDelta: true,
      balanceAfter: true,
      reason: true,
      referenceType: true,
      referenceId: true,
      performedById: true,
      performedByName: true,
      occurredAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Stock items
// ---------------------------------------------------------------------------

/**
 * Adds a stock line and, when an opening balance is given, the movement that
 * accounts for it.
 */
export async function createStockItem(
  context: HospitalContext,
  input: CreateStockItemInput,
): Promise<HospitalResult<StockItemSummary>> {
  const denied = deny(context, "hospital.pharmacy_manage");
  if (denied) return hospitalFail(denied.code, denied.message);

  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) return hospitalFail("validation", "A stock item needs a code and a name.");
  if (input.reorderLevel !== undefined && !isNonNegativeInt(input.reorderLevel)) {
    return hospitalFail("validation", "The reorder level must be a whole number of zero or more.");
  }
  if (input.taxRateBp !== undefined && (!isNonNegativeInt(input.taxRateBp) || input.taxRateBp > 10_000)) {
    return hospitalFail("validation", "The tax rate must be between 0 and 10000 basis points.");
  }
  if (input.openingQuantity !== undefined && !isNonNegativeInt(input.openingQuantity)) {
    return hospitalFail("validation", "The opening quantity must be a whole number of zero or more.");
  }
  if (input.unitCostPaise !== undefined && input.unitCostPaise !== null && !isNonNegativeInt(input.unitCostPaise)) {
    return hospitalFail("validation", "The unit cost must be a non-negative whole number of paise.");
  }
  if (
    input.sellingPricePaise !== undefined &&
    input.sellingPricePaise !== null &&
    !isNonNegativeInt(input.sellingPricePaise)
  ) {
    return hospitalFail("validation", "The selling price must be a non-negative whole number of paise.");
  }

  const opening = input.openingQuantity ?? 0;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.hospitalStockItem.create({
        data: {
          hospitalId: context.hospitalId,
          code,
          name,
          itemKind: input.itemKind ?? "MEDICINE",
          unit: input.unit ?? "unit",
          dosageForm: input.dosageForm ?? null,
          strengthLabel: input.strengthLabel ?? null,
          description: input.description ?? null,
          pharmacyUnitId: input.pharmacyUnitId ?? null,
          supplierId: input.supplierId ?? null,
          batchNumber: input.batchNumber ?? null,
          expiryDate: input.expiryDate ?? null,
          reorderLevel: input.reorderLevel ?? 0,
          unitCostPaise: input.unitCostPaise ?? null,
          sellingPricePaise: input.sellingPricePaise ?? null,
          taxRateBp: input.taxRateBp ?? 0,
          location: input.location ?? null,
          quantityOnHand: opening,
        },
        select: STOCK_ITEM_SELECT,
      });

      // The opening balance is a movement, not a number that appears from
      // nowhere, so the level is reconstructible from the trail from day one.
      if (opening > 0) {
        await applyStockLevel(tx, context, {
          stockItemId: item.id,
          nextQuantity: opening,
          type: "RECEIPT",
          reason: "Opening balance",
        });
      }

      return item;
    });

    await recordAuditEvent({
      action: "hospital.stock_item_created",
      entityType: "hospital_stock_item",
      entityId: created.id,
      actorUserId: context.user.id,
      hospitalId: context.hospitalId,
      metadata: { code, name, itemKind: created.itemKind, openingQuantity: opening },
    });

    return hospitalOk(toStockItemSummary(created, new Date()));
  } catch (error) {
    if (isUniqueViolation(error)) return hospitalFail("duplicate", `A stock item with the code ${code} already exists.`);
    if (error instanceof HospitalFailure) return hospitalFail(error.code, error.message);
    throw error;
  }
}

/** Receives stock into an item, optionally updating the batch and its cost. */
export async function recordStockReceipt(
  context: HospitalContext,
  input: StockReceiptInput,
): Promise<HospitalResult<StockMovementSummary>> {
  const denied = deny(context, "hospital.pharmacy_manage");
  if (denied) return hospitalFail(denied.code, denied.message);
  if (!isPositiveInt(input.quantity)) return hospitalFail("validation", "A receipt must add at least one unit.");
  if (input.unitCostPaise !== undefined && input.unitCostPaise !== null && !isNonNegativeInt(input.unitCostPaise)) {
    return hospitalFail("validation", "The unit cost must be a non-negative whole number of paise.");
  }

  try {
    const movement = await prisma.$transaction(async (tx) => {
      const item = await tx.hospitalStockItem.findFirst({
        where: { id: input.stockItemId, hospitalId: context.hospitalId },
        select: { quantityOnHand: true },
      });
      if (!item) throw new HospitalFailure("not_found", "That stock item is not in this hospital's inventory.");

      const itemUpdate: Prisma.HospitalStockItemUpdateManyMutationInput = {};
      if (input.batchNumber !== undefined) itemUpdate.batchNumber = input.batchNumber;
      if (input.expiresAt !== undefined) itemUpdate.expiryDate = input.expiresAt;
      if (input.unitCostPaise !== undefined) itemUpdate.unitCostPaise = input.unitCostPaise;

      const applied = await applyStockLevel(tx, context, {
        stockItemId: input.stockItemId,
        nextQuantity: item.quantityOnHand + input.quantity,
        type: "RECEIPT",
        reason: input.reason,
        itemUpdate,
      });

      return tx.hospitalStockMovement.findFirstOrThrow({
        where: { id: applied.movementId, hospitalId: context.hospitalId },
        select: {
          id: true,
          stockItemId: true,
          type: true,
          quantityDelta: true,
          balanceAfter: true,
          reason: true,
          referenceType: true,
          referenceId: true,
          performedById: true,
          performedByName: true,
          occurredAt: true,
        },
      });
    });

    await recordAuditEvent({
      action: "hospital.stock_adjusted",
      entityType: "hospital_stock_item",
      entityId: movement.stockItemId,
      actorUserId: context.user.id,
      hospitalId: context.hospitalId,
      metadata: { movementId: movement.id, type: "RECEIPT", delta: movement.quantityDelta, balanceAfter: movement.balanceAfter },
    });

    return hospitalOk(movement);
  } catch (error) {
    if (error instanceof HospitalFailure) return hospitalFail(error.code, error.message);
    throw error;
  }
}

/** Sets a stock level to a counted figure, recording the delta as an adjustment. */
export async function adjustStockLevel(
  context: HospitalContext,
  input: StockAdjustmentInput,
): Promise<HospitalResult<StockMovementSummary>> {
  const denied = deny(context, "hospital.pharmacy_manage");
  if (denied) return hospitalFail(denied.code, denied.message);
  if (!isNonNegativeInt(input.newQuantity)) {
    return hospitalFail("validation", "The counted quantity must be a whole number of zero or more.");
  }

  try {
    const movement = await prisma.$transaction(async (tx) => {
      const applied = await applyStockLevel(tx, context, {
        stockItemId: input.stockItemId,
        nextQuantity: input.newQuantity,
        type: "ADJUSTMENT",
        reason: input.reason,
      });

      return tx.hospitalStockMovement.findFirstOrThrow({
        where: { id: applied.movementId, hospitalId: context.hospitalId },
        select: {
          id: true,
          stockItemId: true,
          type: true,
          quantityDelta: true,
          balanceAfter: true,
          reason: true,
          referenceType: true,
          referenceId: true,
          performedById: true,
          performedByName: true,
          occurredAt: true,
        },
      });
    });

    await recordAuditEvent({
      action: "hospital.stock_adjusted",
      entityType: "hospital_stock_item",
      entityId: movement.stockItemId,
      actorUserId: context.user.id,
      hospitalId: context.hospitalId,
      metadata: { movementId: movement.id, type: "ADJUSTMENT", delta: movement.quantityDelta, balanceAfter: movement.balanceAfter },
    });

    return hospitalOk(movement);
  } catch (error) {
    if (error instanceof HospitalFailure) return hospitalFail(error.code, error.message);
    throw error;
  }
}

/** Issues stock out without a prescription — to a ward, a write-off or a transfer. */
export async function recordStockIssue(
  context: HospitalContext,
  input: StockIssueInput,
): Promise<HospitalResult<StockMovementSummary>> {
  const denied = deny(context, "hospital.pharmacy_manage");
  if (denied) return hospitalFail(denied.code, denied.message);
  if (!isPositiveInt(input.quantity)) return hospitalFail("validation", "An issue must remove at least one unit.");

  try {
    const movement = await prisma.$transaction(async (tx) => {
      const item = await tx.hospitalStockItem.findFirst({
        where: { id: input.stockItemId, hospitalId: context.hospitalId },
        select: { quantityOnHand: true },
      });
      if (!item) throw new HospitalFailure("not_found", "That stock item is not in this hospital's inventory.");
      if (item.quantityOnHand < input.quantity) {
        throw new HospitalFailure(
          "insufficient_stock",
          `Only ${item.quantityOnHand} are on hand, so ${input.quantity} cannot be issued.`,
        );
      }

      const applied = await applyStockLevel(tx, context, {
        stockItemId: input.stockItemId,
        nextQuantity: item.quantityOnHand - input.quantity,
        type: input.type,
        reason: input.reason,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
      });

      return tx.hospitalStockMovement.findFirstOrThrow({
        where: { id: applied.movementId, hospitalId: context.hospitalId },
        select: {
          id: true,
          stockItemId: true,
          type: true,
          quantityDelta: true,
          balanceAfter: true,
          reason: true,
          referenceType: true,
          referenceId: true,
          performedById: true,
          performedByName: true,
          occurredAt: true,
        },
      });
    });

    await recordAuditEvent({
      action: "hospital.stock_adjusted",
      entityType: "hospital_stock_item",
      entityId: movement.stockItemId,
      actorUserId: context.user.id,
      hospitalId: context.hospitalId,
      metadata: { movementId: movement.id, type: movement.type, delta: movement.quantityDelta, balanceAfter: movement.balanceAfter },
    });

    return hospitalOk(movement);
  } catch (error) {
    if (error instanceof HospitalFailure) return hospitalFail(error.code, error.message);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

function alertCondition(
  item: { quantityOnHand: number; reorderLevel: number; expiryDate: Date | null },
  now: Date,
): { type: HospitalStockAlertType; detail: string; threshold: number }[] {
  const conditions: { type: HospitalStockAlertType; detail: string; threshold: number }[] = [];

  // Out of stock subsumes low stock: an item at zero is not "below its reorder
  // level" as well, it is simply gone, and reporting both would be noise.
  if (item.quantityOnHand <= 0) {
    conditions.push({ type: "OUT_OF_STOCK", detail: "No stock on hand.", threshold: 0 });
  } else if (item.reorderLevel > 0 && item.quantityOnHand <= item.reorderLevel) {
    conditions.push({
      type: "LOW_STOCK",
      detail: `${item.quantityOnHand} on hand at or below the reorder level of ${item.reorderLevel}.`,
      threshold: item.reorderLevel,
    });
  }

  if (item.expiryDate) {
    const windowMs = STOCK_EXPIRY_ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (item.expiryDate.getTime() < now.getTime()) {
      conditions.push({ type: "EXPIRED", detail: `Expired on ${item.expiryDate.toISOString().slice(0, 10)}.`, threshold: 0 });
    } else if (item.expiryDate.getTime() <= now.getTime() + windowMs) {
      conditions.push({
        type: "NEAR_EXPIRY",
        detail: `Expires on ${item.expiryDate.toISOString().slice(0, 10)}.`,
        threshold: STOCK_EXPIRY_ALERT_WINDOW_DAYS,
      });
    }
  }

  return conditions;
}

/**
 * Derives alert rows from the stored levels and expiry dates.
 *
 * Idempotent by design: an item whose condition has already raised a live alert
 * (open or acknowledged) has that row refreshed rather than duplicated, so
 * running this on a schedule does not fill the screen with the same warning.
 */
export async function detectStockAlerts(
  context: HospitalContext,
): Promise<HospitalResult<{ raised: number; refreshed: number; resolved: number }>> {
  const denied = deny(context, "hospital.pharmacy_manage");
  if (denied) return hospitalFail(denied.code, denied.message);

  const now = new Date();
  const items = await prisma.hospitalStockItem.findMany({
    where: { hospitalId: context.hospitalId, isActive: true },
    select: { id: true, quantityOnHand: true, reorderLevel: true, expiryDate: true },
  });

  let raised = 0;
  let refreshed = 0;
  let resolved = 0;

  for (const item of items) {
    const wanted = alertCondition(item, now);
    const wantedTypes = wanted.map((condition) => condition.type);

    const live = await prisma.hospitalStockAlert.findMany({
      where: {
        hospitalId: context.hospitalId,
        stockItemId: item.id,
        status: { in: ["OPEN", "ACKNOWLEDGED"] },
      },
      select: { id: true, type: true, detail: true, threshold: true },
    });

    for (const condition of wanted) {
      const existing = live.find((alert) => alert.type === condition.type);
      if (existing) {
        if (existing.detail !== condition.detail || existing.threshold !== condition.threshold) {
          await prisma.hospitalStockAlert.updateMany({
            where: { id: existing.id, hospitalId: context.hospitalId },
            data: { detail: condition.detail, threshold: condition.threshold },
          });
          refreshed += 1;
        }
        continue;
      }

      await prisma.hospitalStockAlert.create({
        data: {
          hospitalId: context.hospitalId,
          stockItemId: item.id,
          type: condition.type,
          status: "OPEN",
          detail: condition.detail,
          threshold: condition.threshold,
        },
      });
      raised += 1;
    }

    // A condition that no longer holds is closed by the same sweep, so a screen
    // reading live alerts never shows one that has already been fixed.
    for (const alert of live) {
      if (!wantedTypes.includes(alert.type)) {
        await prisma.hospitalStockAlert.updateMany({
          where: { id: alert.id, hospitalId: context.hospitalId },
          data: { status: "RESOLVED", resolvedAt: now },
        });
        resolved += 1;
      }
    }
  }

  return hospitalOk({ raised, refreshed, resolved });
}

export async function listStockAlerts(
  context: HospitalContext,
  filter: { status?: HospitalStockAlertStatus; type?: HospitalStockAlertType } = {},
): Promise<StockAlertSummary[]> {
  return prisma.hospitalStockAlert.findMany({
    where: {
      hospitalId: context.hospitalId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.type ? { type: filter.type } : {}),
    },
    orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      stockItemId: true,
      type: true,
      status: true,
      detail: true,
      threshold: true,
      detectedAt: true,
      acknowledgedAt: true,
      resolvedAt: true,
    },
  });
}

export async function acknowledgeStockAlert(
  context: HospitalContext,
  alertId: string,
  note?: string,
): Promise<HospitalResult<StockAlertSummary>> {
  const denied = deny(context, "hospital.pharmacy_manage");
  if (denied) return hospitalFail(denied.code, denied.message);

  const alert = await prisma.hospitalStockAlert.findUnique({
    where: { id: alertId },
    select: { id: true, hospitalId: true, status: true },
  });
  if (!alert) return hospitalFail("not_found", "That stock alert could not be found.");
  await assertHospitalScope({
    context,
    rowHospitalId: alert.hospitalId,
    entityType: "hospital_stock_alert",
    entityId: alert.id,
  });
  if (alert.status === "RESOLVED") {
    return hospitalFail("already_finalised", "That alert has already been resolved.");
  }

  const updated = await prisma.hospitalStockAlert.updateMany({
    where: { id: alert.id, hospitalId: context.hospitalId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    data: { status: "ACKNOWLEDGED", acknowledgedById: context.user.id, acknowledgedAt: new Date() },
  });
  if (updated.count !== 1) {
    return hospitalFail("conflict", "The alert changed while it was being acknowledged. Please try again.");
  }

  await recordAuditEvent({
    action: "hospital.stock_alert_acknowledged",
    entityType: "hospital_stock_alert",
    entityId: alert.id,
    actorUserId: context.user.id,
    hospitalId: context.hospitalId,
    metadata: { note: note ?? null },
  });

  const summary = await prisma.hospitalStockAlert.findFirstOrThrow({
    where: { id: alert.id, hospitalId: context.hospitalId },
    select: {
      id: true,
      stockItemId: true,
      type: true,
      status: true,
      detail: true,
      threshold: true,
      detectedAt: true,
      acknowledgedAt: true,
      resolvedAt: true,
    },
  });
  return hospitalOk(summary);
}

export async function resolveStockAlert(
  context: HospitalContext,
  alertId: string,
  note?: string,
): Promise<HospitalResult<StockAlertSummary>> {
  const denied = deny(context, "hospital.pharmacy_manage");
  if (denied) return hospitalFail(denied.code, denied.message);

  const alert = await prisma.hospitalStockAlert.findUnique({
    where: { id: alertId },
    select: { id: true, hospitalId: true, status: true },
  });
  if (!alert) return hospitalFail("not_found", "That stock alert could not be found.");
  await assertHospitalScope({
    context,
    rowHospitalId: alert.hospitalId,
    entityType: "hospital_stock_alert",
    entityId: alert.id,
  });

  if (alert.status !== "RESOLVED") {
    const updated = await prisma.hospitalStockAlert.updateMany({
      where: { id: alert.id, hospitalId: context.hospitalId },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    if (updated.count !== 1) {
      return hospitalFail("conflict", "The alert changed while it was being resolved. Please try again.");
    }
  }

  await recordAuditEvent({
    action: "hospital.stock_alert_resolved",
    entityType: "hospital_stock_alert",
    entityId: alert.id,
    actorUserId: context.user.id,
    hospitalId: context.hospitalId,
    metadata: { note: note ?? null },
  });

  const summary = await prisma.hospitalStockAlert.findFirstOrThrow({
    where: { id: alert.id, hospitalId: context.hospitalId },
    select: {
      id: true,
      stockItemId: true,
      type: true,
      status: true,
      detail: true,
      threshold: true,
      detectedAt: true,
      acknowledgedAt: true,
      resolvedAt: true,
    },
  });
  return hospitalOk(summary);
}

// ---------------------------------------------------------------------------
// Dispensing
// ---------------------------------------------------------------------------

type DispenseOutcome =
  | { kind: "dispensed"; summary: DispenseSummary }
  | { kind: "duplicate"; existingDispenseId: string; reason: string };

/**
 * Dispenses medication against a prescription.
 *
 * One transaction re-reads each stock line, refuses a short line, refuses an
 * expired batch and refuses a second dispense against a prescription that has
 * already been served, then deducts the stock with a movement per item and
 * writes the dispense header and items together. A double tap is stopped by the
 * `@@unique([hospitalId, idempotencyKey])` constraint, which surfaces here as
 * `duplicate_dispense` rather than a second deduction.
 */
export async function dispenseMedication(
  context: HospitalContext,
  input: DispenseInput,
): Promise<HospitalResult<DispenseSummary>> {
  const denied = deny(context, "hospital.dispense");
  if (denied) return hospitalFail(denied.code, denied.message);
  if (!input.idempotencyKey.trim()) return hospitalFail("validation", "A dispense needs an idempotency key.");
  if (input.items.length === 0) return hospitalFail("validation", "A dispense must name at least one stock item.");
  if (input.items.some((line) => !isPositiveInt(line.quantity))) {
    return hospitalFail("validation", "Every dispensed line must have a whole quantity of at least one.");
  }

  const now = new Date();

  try {
    const outcome = await prisma.$transaction(async (tx): Promise<DispenseOutcome> => {
      const itemIds = [...new Set(input.items.map((line) => line.stockItemId))];
      const items = await tx.hospitalStockItem.findMany({
        where: { id: { in: itemIds }, hospitalId: context.hospitalId },
        select: {
          id: true,
          name: true,
          batchNumber: true,
          expiryDate: true,
          quantityOnHand: true,
          sellingPricePaise: true,
        },
      });
      const byId = new Map(items.map((item) => [item.id, item]));

      for (const line of input.items) {
        const item = byId.get(line.stockItemId);
        if (!item) throw new HospitalFailure("not_found", "A dispensed stock item is not in this hospital's inventory.");
        if (item.expiryDate && item.expiryDate.getTime() < now.getTime()) {
          throw new HospitalFailure(
            "item_expired",
            `${item.name} is from a batch that expired on ${item.expiryDate.toISOString().slice(0, 10)} and cannot be dispensed.`,
          );
        }
        if (item.quantityOnHand < line.quantity) {
          throw new HospitalFailure(
            "insufficient_stock",
            `Only ${item.quantityOnHand} of ${item.name} are on hand, so ${line.quantity} cannot be dispensed.`,
          );
        }
      }

      // A second dispense against the same prescription is refused, not merely
      // discouraged: a prescription served twice is a clinical error.
      if (input.prescriptionId) {
        const already = await tx.hospitalDispenseItem.findFirst({
          where: {
            stockItemId: { in: itemIds },
            dispense: {
              hospitalId: context.hospitalId,
              prescriptionId: input.prescriptionId,
              status: { not: "CANCELLED" },
            },
          },
          select: { dispenseId: true },
        });
        if (already) {
          return {
            kind: "duplicate",
            existingDispenseId: already.dispenseId,
            reason: "That prescription has already been dispensed. Cancel the earlier dispense before serving it again.",
          };
        }
      }

      const reference = await reserveHospitalReference(tx, "dispense", (candidate) =>
        tx.hospitalDispense.findFirst({
          where: { hospitalId: context.hospitalId, reference: candidate },
          select: { id: true },
        }),
      );

      const header = await tx.hospitalDispense.create({
        data: {
          hospitalId: context.hospitalId,
          pharmacyUnitId: input.pharmacyUnitId ?? null,
          patientId: input.patientId,
          admissionId: input.admissionId ?? null,
          prescriptionId: input.prescriptionId ?? null,
          reference,
          status: "DISPENSED",
          idempotencyKey: input.idempotencyKey.trim(),
          dispensedById: context.user.id,
          dispensedByName: actingStaffName(context),
          dispensedAt: now,
          notes: input.notes ?? null,
        },
        select: { id: true, reference: true },
      });

      const dispensedItems: DispenseSummary["items"] = [];

      for (const line of input.items) {
        const item = byId.get(line.stockItemId);
        if (!item) throw new HospitalFailure("not_found", "A dispensed stock item is not in this hospital's inventory.");

        await tx.hospitalDispenseItem.create({
          data: {
            dispenseId: header.id,
            stockItemId: item.id,
            nameSnapshot: item.name,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            quantity: line.quantity,
            unitPricePaise: item.sellingPricePaise,
          },
        });

        await applyStockLevel(tx, context, {
          stockItemId: item.id,
          nextQuantity: item.quantityOnHand - line.quantity,
          type: "DISPENSE",
          reason: `Dispensed on ${header.reference}`,
          referenceType: "hospital_dispense",
          referenceId: header.id,
        });

        dispensedItems.push({
          stockItemId: item.id,
          nameSnapshot: item.name,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          quantity: line.quantity,
          unitPricePaise: item.sellingPricePaise,
        });
      }

      return {
        kind: "dispensed",
        summary: {
          id: header.id,
          reference: header.reference,
          patientId: input.patientId,
          pharmacyUnitId: input.pharmacyUnitId ?? null,
          admissionId: input.admissionId ?? null,
          prescriptionId: input.prescriptionId ?? null,
          status: "DISPENSED",
          dispensedById: context.user.id,
          dispensedByName: actingStaffName(context),
          dispensedAt: now,
          notes: input.notes ?? null,
          items: dispensedItems,
        },
      };
    });

    if (outcome.kind === "duplicate") {
      await recordAuditEvent({
        action: "hospital.dispense_duplicate_suppressed",
        entityType: "hospital_dispense",
        entityId: outcome.existingDispenseId,
        actorUserId: context.user.id,
        hospitalId: context.hospitalId,
        metadata: { reason: outcome.reason, prescriptionId: input.prescriptionId ?? null },
      });
      return hospitalFail("duplicate_dispense", outcome.reason);
    }

    await recordAuditEvent({
      action: "hospital.dispense_created",
      entityType: "hospital_dispense",
      entityId: outcome.summary.id,
      actorUserId: context.user.id,
      hospitalId: context.hospitalId,
      metadata: {
        reference: outcome.summary.reference,
        patientId: input.patientId,
        prescriptionId: input.prescriptionId ?? null,
        lines: outcome.summary.items.length,
      },
    });

    return hospitalOk(outcome.summary);
  } catch (error) {
    if (error instanceof HospitalFailure) return hospitalFail(error.code, error.message);
    if (isUniqueViolation(error)) {
      const existing = await prisma.hospitalDispense.findFirst({
        where: { hospitalId: context.hospitalId, idempotencyKey: input.idempotencyKey.trim() },
        select: { id: true },
      });
      await recordAuditEvent({
        action: "hospital.dispense_duplicate_suppressed",
        entityType: "hospital_dispense",
        entityId: existing?.id ?? null,
        actorUserId: context.user.id,
        hospitalId: context.hospitalId,
        metadata: { reason: "idempotency_key_reused", idempotencyKey: input.idempotencyKey },
      });
      return hospitalFail("duplicate_dispense", "That dispense has already been recorded.");
    }
    throw error;
  }
}

/** Reverses a dispense, returning the stock with compensating movements. */
export async function cancelDispense(
  context: HospitalContext,
  dispenseId: string,
  reason: string,
): Promise<HospitalResult<{ id: string; reference: string; status: string }>> {
  const denied = deny(context, "hospital.dispense");
  if (denied) return hospitalFail(denied.code, denied.message);
  if (!reason.trim()) return hospitalFail("validation", "Record why the dispense is being cancelled.");

  const header = await prisma.hospitalDispense.findUnique({
    where: { id: dispenseId },
    select: { id: true, hospitalId: true, status: true },
  });
  if (!header) return hospitalFail("not_found", "That dispense could not be found.");
  await assertHospitalScope({
    context,
    rowHospitalId: header.hospitalId,
    entityType: "hospital_dispense",
    entityId: header.id,
  });
  if (header.status === "CANCELLED") {
    return hospitalFail("already_finalised", "That dispense has already been cancelled.");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.hospitalDispense.findFirst({
        where: { id: header.id, hospitalId: context.hospitalId },
        select: { id: true, reference: true, status: true, notes: true },
      });
      if (!current) throw new HospitalFailure("not_found", "That dispense could not be found.");
      // The status is re-read inside the transaction so two cancellations racing
      // cannot both credit the stock back.
      if (current.status === "CANCELLED") {
        throw new HospitalFailure("already_finalised", "That dispense has already been cancelled.");
      }

      const items = await tx.hospitalDispenseItem.findMany({
        where: { dispenseId: current.id },
        select: { stockItemId: true, quantity: true },
      });

      for (const item of items) {
        const stock = await tx.hospitalStockItem.findFirst({
          where: { id: item.stockItemId, hospitalId: context.hospitalId },
          select: { quantityOnHand: true },
        });
        if (!stock) throw new HospitalFailure("not_found", "A dispensed stock item is no longer in the inventory.");

        await applyStockLevel(tx, context, {
          stockItemId: item.stockItemId,
          nextQuantity: stock.quantityOnHand + item.quantity,
          type: "RETURN",
          reason: `Dispense ${current.reference} cancelled: ${reason}`,
          referenceType: "hospital_dispense",
          referenceId: current.id,
        });
      }

      const updated = await tx.hospitalDispense.updateMany({
        where: { id: current.id, hospitalId: context.hospitalId, status: { not: "CANCELLED" } },
        data: {
          status: "CANCELLED",
          notes: current.notes ? `${current.notes}\nCancelled: ${reason}` : `Cancelled: ${reason}`,
        },
      });
      if (updated.count !== 1) {
        throw new HospitalFailure("conflict", "The dispense changed while it was being cancelled. Please try again.");
      }

      return { id: current.id, reference: current.reference, status: "CANCELLED" };
    });

    await recordAuditEvent({
      action: "hospital.dispense_cancelled",
      entityType: "hospital_dispense",
      entityId: result.id,
      actorUserId: context.user.id,
      hospitalId: context.hospitalId,
      metadata: { reference: result.reference, reason },
    });

    return hospitalOk(result);
  } catch (error) {
    if (error instanceof HospitalFailure) return hospitalFail(error.code, error.message);
    throw error;
  }
}
