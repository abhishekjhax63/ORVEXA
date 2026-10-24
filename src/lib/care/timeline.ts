import "server-only";

import type { HealthRecordSource, HealthTimelineEventKind, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Appending to the personal health timeline.
 *
 * ## Why this is one tiny function and not a service of its own
 *
 * Every module in the care workspace produces things that belong on a person's
 * timeline: an appointment was booked, an allergy was recorded, a vaccination
 * happened, a report was filed. If each of those modules wrote its own
 * `HealthTimelineEvent` row, the rule that makes the timeline worth trusting —
 * that it is a *view* of the record and never a second copy of it — would be
 * restated in a dozen places and would eventually differ in one of them. So the
 * rule lives here, once, and every other module calls it.
 *
 * ## The safety rule this module holds
 *
 * The timeline is append-only and derived. An event is written as a side effect
 * of the write it describes, by a service that has just changed the underlying
 * record, and it carries `refType`/`refId` pointing back at the row that is the
 * source of truth — so a reader can always open the real record rather than a
 * snapshot of it. Nothing on the timeline is ever authored directly by a client:
 * there is no schema anywhere that lets a request post a timeline event.
 *
 * ## Why it never throws
 *
 * A missing timeline row is a cosmetic loss; the clinical write it describes is
 * not. If the insert fails, the failure is logged and reported as `null` so a
 * timeline problem can never fail the operation that actually mattered. This is
 * the same trade-off the audit writer makes, for the same reason.
 */

/**
 * The slice of the Prisma client this helper needs.
 *
 * Typed as a `Pick` of the transaction client so the same helper works both
 * standalone (with `prisma`) and inside `prisma.$transaction`, which is where a
 * clinical write needs it: the record and its timeline event must either both
 * exist or neither. `PrismaClient` satisfies this structurally, so the default
 * argument is simply the shared handle.
 */
export type TimelineClient = Pick<Prisma.TransactionClient, "healthTimelineEvent">;

export async function appendTimelineEvent(
  input: {
    ownerUserId: string;
    familyMemberId?: string | null;
    kind: HealthTimelineEventKind;
    source: HealthRecordSource;
    title: string;
    summary?: string | null;
    occurredAt: Date;
    refType?: string | null;
    refId?: string | null;
    documentId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  client: TimelineClient = prisma,
): Promise<{ id: string } | null> {
  try {
    const row = await client.healthTimelineEvent.create({
      data: {
        ownerUserId: input.ownerUserId,
        familyMemberId: input.familyMemberId ?? null,
        kind: input.kind,
        source: input.source,
        title: input.title,
        summary: input.summary ?? null,
        occurredAt: input.occurredAt,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        documentId: input.documentId ?? null,
        metadata: input.metadata,
      },
      select: { id: true },
    });
    return { id: row.id };
  } catch (error) {
    console.error("[care] failed to append timeline event", input.kind, error);
    return null;
  }
}
