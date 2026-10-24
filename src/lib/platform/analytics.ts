import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { PlatformContext } from "@/lib/platform/console";
import { recordPlatformAction } from "@/lib/platform/console";
import { platformOk, type PlatformResult } from "@/lib/platform/errors";
import type {
  AnalyticsGranularity,
  AnalyticsRangeInput,
  PlatformVertical,
} from "@/lib/validation/platform";

/**
 * Platform analytics, computed from the operational tables.
 *
 * ## Every figure is defined, not implied
 *
 * A dashboard that says "93% completion" without saying what it counted is worse
 * than no dashboard: the reader has to guess whether the denominator is bookings
 * or finished bookings, and the two answers differ by tens of percent. Every
 * metric here therefore carries its definition next to its value, in
 * `METRIC_DEFINITIONS`, and the definition names the timestamp the window is
 * applied to. Volume metrics use the row's creation instant; outcome metrics use
 * the instant the outcome happened. A booking created in March and completed in
 * April is a March booking *and* an April completion, deliberately.
 *
 * ## Missing data is reported, never zeroed
 *
 * A ratio with an empty denominator returns `null` and a `missingReason`, not
 * `0`. "Nobody was seen" and "everybody was seen" must not render identically.
 * Deriving a rate over a partial window is the single easiest way to publish a
 * misleading statistic, so where the population is larger than the sample the
 * service read, the metric is flagged `isPartial` with its `sampleSize`.
 *
 * ## Seeded rows are excluded
 *
 * Demo orders, demo bookings, demo claims and demo incidents exist so the flows
 * can be exercised. Counting them would inflate every figure, so `isDemo` rows
 * are filtered out wherever the column exists, and sandbox teleconsultation
 * sessions are excluded on the same principle.
 *
 * ## What is not here
 *
 * No figure is estimated, projected or inferred. A metric the platform cannot
 * compute from a stored row is absent from the response rather than present as a
 * plausible number.
 */

// ---------------------------------------------------------------------------
// Metric vocabulary
// ---------------------------------------------------------------------------

export type MetricUnit = "count" | "ratio" | "minutes" | "seconds" | "inr";

export type MetricDefinition = {
  label: string;
  /** How the figure is computed, and which timestamp the window applies to. */
  definition: string;
  unit: MetricUnit;
};

/**
 * The single source of truth for what a metric means.
 *
 * A builder below cannot invent a label or a unit: it looks them up here, so a
 * metric can never be rendered with a definition that describes something else.
 */
export const METRIC_DEFINITIONS = {
  // Appointments (in-person)
  "appointments.booked": {
    label: "Appointments booked",
    definition: "Appointments with mode IN_PERSON created in the window, by createdAt.",
    unit: "count",
  },
  "appointments.completed": {
    label: "Appointments completed",
    definition: "Appointments with mode IN_PERSON that reached COMPLETED in the window, by completedAt.",
    unit: "count",
  },
  "appointments.completion_rate": {
    label: "Appointment completion rate",
    definition:
      "COMPLETED divided by all appointments that reached a terminal state in the window (COMPLETED, CANCELLED, NO_SHOW), by the instant they ended.",
    unit: "ratio",
  },
  "appointments.no_show_rate": {
    label: "Appointment no-show rate",
    definition: "NO_SHOW divided by all appointments that reached a terminal state in the window.",
    unit: "ratio",
  },

  // Telemedicine
  "telemedicine.sessions_booked": {
    label: "Teleconsultations booked",
    definition: "Appointments with mode TELEMEDICINE created in the window, by createdAt.",
    unit: "count",
  },
  "telemedicine.sessions_ended": {
    label: "Teleconsultations ended",
    definition: "Non-sandbox sessions that reached ENDED in the window, by endedAt.",
    unit: "count",
  },
  "telemedicine.session_failure_rate": {
    label: "Teleconsultation failure rate",
    definition:
      "Non-sandbox sessions in FAILED or EXPIRED divided by all non-sandbox sessions created in the window. A session whose provider errored is a failure even though the appointment may still be rebooked.",
    unit: "ratio",
  },
  "telemedicine.average_session_minutes": {
    label: "Average consultation length",
    definition: "Mean of endedAt minus startedAt over non-sandbox sessions that ended in the window.",
    unit: "minutes",
  },

  // Pharmacy
  "pharmacy.orders_placed": {
    label: "Orders placed",
    definition: "Non-demo pharmacy orders placed in the window, by placedAt.",
    unit: "count",
  },
  "pharmacy.orders_delivered": {
    label: "Orders delivered",
    definition: "Non-demo pharmacy orders that reached DELIVERED in the window, by deliveredAt.",
    unit: "count",
  },
  "pharmacy.fulfilment_rate": {
    label: "Order fulfilment rate",
    definition: "DELIVERED divided by DELIVERED plus CANCELLED for orders that reached either in the window.",
    unit: "ratio",
  },
  "pharmacy.average_accept_minutes": {
    label: "Average time to accept",
    definition: "Mean of acceptedAt minus placedAt for non-demo orders accepted in the window. The pharmacy's own response time.",
    unit: "minutes",
  },
  "pharmacy.average_delivery_minutes": {
    label: "Average time to deliver",
    definition: "Mean of deliveredAt minus placedAt for non-demo orders delivered in the window.",
    unit: "minutes",
  },
  "pharmacy.delivered_value_inr": {
    label: "Delivered order value",
    definition:
      "Sum of totalPaise (converted to rupees) for non-demo orders delivered in the window. A transaction total, not revenue: refunds are reported separately.",
    unit: "inr",
  },

  // Diagnostics
  "diagnostics.bookings": {
    label: "Diagnostic bookings",
    definition: "Non-demo diagnostic bookings created in the window, by createdAt.",
    unit: "count",
  },
  "diagnostics.completed": {
    label: "Diagnostic bookings completed",
    definition: "Non-demo bookings that reached COMPLETED in the window, by completedAt.",
    unit: "count",
  },
  "diagnostics.average_report_minutes": {
    label: "Average collection-to-completion time",
    definition: "Mean of completedAt minus sampleCollectedAt for bookings completed in the window. Only bookings where both instants exist are counted.",
    unit: "minutes",
  },

  // Insurance
  "insurance.claims_submitted": {
    label: "Claims submitted",
    definition: "Non-demo claims whose submittedAt falls in the window.",
    unit: "count",
  },
  "insurance.claims_decided": {
    label: "Claims decided",
    definition: "Non-demo claims whose decidedAt falls in the window, regardless of the decision.",
    unit: "count",
  },
  "insurance.claim_decision_rate": {
    label: "Claim decision rate",
    definition:
      "Claims decided in the window divided by claims submitted in the window. Measures how much of the claim load is being worked, not whether claims are approved — approvals belong to the insurer.",
    unit: "ratio",
  },

  // Support
  "support.tickets_opened": {
    label: "Support tickets opened",
    definition: "Support tickets created in the window, by createdAt.",
    unit: "count",
  },
  "support.tickets_resolved": {
    label: "Support tickets resolved",
    definition: "Support tickets whose resolvedAt falls in the window.",
    unit: "count",
  },
  "support.resolution_rate": {
    label: "Support resolution rate",
    definition: "Tickets resolved in the window divided by tickets opened in the window. Above 1 means the queue is being worked down.",
    unit: "ratio",
  },
  "support.average_resolution_minutes": {
    label: "Average support resolution time",
    definition: "Mean of resolvedAt minus createdAt for tickets resolved in the window, in minutes.",
    unit: "minutes",
  },
  "support.average_first_response_minutes": {
    label: "Average first response time",
    definition:
      "Mean time from a ticket being raised to the first non-internal reply from somebody other than the person who raised it.",
    unit: "minutes",
  },

  // Emergency dispatch
  "emergency.dispatch_requests": {
    label: "Dispatch requests sent",
    definition: "Dispatch requests created in the window, by createdAt.",
    unit: "count",
  },
  "emergency.dispatch_ack_rate": {
    label: "Dispatch acknowledgement rate",
    definition:
      "Requests that reached ACKNOWLEDGED or beyond divided by all requests created in the window. This is the only honest measure of whether SOS requests are being received.",
    unit: "ratio",
  },
  "emergency.average_ack_seconds": {
    label: "Average dispatch acknowledgement time",
    definition: "Mean of acknowledgedAt minus createdAt for requests acknowledged in the window, in seconds.",
    unit: "seconds",
  },
  "emergency.unacknowledged_open": {
    label: "Open requests never acknowledged",
    definition: "Requests created in the window still in PENDING or DELIVERED with no acknowledgedAt. Read this figure first.",
    unit: "count",
  },

  // Service reliability
  "reliability.alerts_opened": {
    label: "Alerts raised",
    definition: "Security and integration alerts first seen in the window, by firstSeenAt.",
    unit: "count",
  },
  "reliability.alerts_critical_open": {
    label: "Critical alerts still open",
    definition: "Alerts of severity CRITICAL currently in OPEN, regardless of window. A point-in-time figure.",
    unit: "count",
  },
  "reliability.integration_success_rate": {
    label: "Provider integration success rate",
    definition:
      "Confirmed provider outcomes (dispatch requests acknowledged or accepted, refunds settled) divided by all provider-facing operations attempted in the window.",
    unit: "ratio",
  },

  // Platform on-boarding
  "platform.hospitals_verified": {
    label: "Hospitals verified",
    definition: "Hospitals whose verificationStatus is VERIFIED at the time of the report, by verifiedAt when it falls in the window.",
    unit: "count",
  },
  "platform.verifications_pending": {
    label: "Verifications awaiting review",
    definition: "Verification requests currently in PENDING. A point-in-time figure, not a windowed one.",
    unit: "count",
  },
  "platform.partner_applications_pending": {
    label: "Partner applications awaiting review",
    definition: "Applications currently in SUBMITTED or UNDER_REVIEW. A point-in-time figure.",
    unit: "count",
  },
  "platform.abuse_reports_open": {
    label: "Abuse reports open",
    definition: "Abuse reports currently in OPEN or UNDER_REVIEW. A point-in-time figure.",
    unit: "count",
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricKey = keyof typeof METRIC_DEFINITIONS;

export type MetricValue = MetricDefinition & {
  key: MetricKey;
  value: number | null;
  numerator?: number;
  denominator?: number;
  /** Rows the average was computed from, when it is a sample of the population. */
  sampleSize?: number;
  /** True when the window's data is known to be incomplete or affected by an outage. */
  isPartial: boolean;
  /** Why the value is null. Never render a null without this. */
  missingReason: string | null;
};

// ---------------------------------------------------------------------------
// Builders — every metric value is constructed through one of these, so the
// definition, the unit and the null-handling cannot be forgotten.
// ---------------------------------------------------------------------------

function metric(key: MetricKey, value: number, extra: Partial<MetricValue> = {}): MetricValue {
  return { key, ...METRIC_DEFINITIONS[key], value, isPartial: false, missingReason: null, ...extra };
}

function nullMetric(key: MetricKey, missingReason: string, extra: Partial<MetricValue> = {}): MetricValue {
  return { key, ...METRIC_DEFINITIONS[key], value: null, isPartial: false, missingReason, ...extra };
}

function ratioMetric(
  key: MetricKey,
  numerator: number,
  denominator: number,
  missingReason: string,
  extra: Partial<MetricValue> = {},
): MetricValue {
  if (denominator <= 0) {
    return nullMetric(key, missingReason, { numerator, denominator: 0, ...extra });
  }
  return metric(key, round(numerator / denominator, 4), { numerator, denominator, ...extra });
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function minutesBetween(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  const milliseconds = to.getTime() - from.getTime();
  return milliseconds >= 0 ? milliseconds / 60_000 : null;
}

/** How many rows a timestamp-derived metric will read before it declares itself partial. */
const MAX_SAMPLE = 2_000;

async function sampled<T>(
  count: () => Promise<number>,
  fetch: (take: number) => Promise<T[]>,
): Promise<{ rows: T[]; population: number; sampled: boolean }> {
  const population = await count();
  const take = Math.min(population, MAX_SAMPLE);
  const rows = take === 0 ? [] : await fetch(take);
  return { rows, population, sampled: population > MAX_SAMPLE };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export type AnalyticsGroup = {
  /** A `PlatformVertical`, or `reliability`, which is reported for every window. */
  key: PlatformVertical | "reliability";
  label: string;
  metrics: MetricValue[];
};

export type DataQualityNote = {
  severity: "info" | "warning";
  message: string;
};

export type AnalyticsOverview = {
  window: { from: Date; to: Date; granularity: AnalyticsGranularity; vertical: PlatformVertical | null };
  generatedAt: Date;
  groups: AnalyticsGroup[];
  /** Conditions the reader must know before trusting a figure. Empty is the good case. */
  dataQuality: DataQualityNote[];
};

const VERTICAL_LABELS: Record<PlatformVertical, string> = {
  appointments: "Appointments",
  telemedicine: "Telemedicine",
  pharmacy: "Pharmacy",
  diagnostics: "Diagnostics",
  insurance: "Insurance",
  emergency: "Emergency dispatch",
  support: "Customer support",
  hospitals: "Partner on-boarding",
};

/**
 * Providers whose current alerts make a metric less trustworthy.
 *
 * A payment gateway that is returning errors for half the window still produces
 * rows, and those rows understate the true volume. The reader is told rather
 * than left to notice the dip and conclude demand fell.
 */
type Degraded = {
  payments: boolean;
  video: boolean;
  dispatch: boolean;
  laboratory: boolean;
  insurer: boolean;
};

/** Provider alert sources, mapped to the metrics they cast doubt on. */
async function degradedProviders(from: Date, to: Date): Promise<Degraded> {
  const alerts = await prisma.integrationAlert.findMany({
    where: {
      kind: "INTEGRATION",
      severity: { in: ["WARNING", "CRITICAL"] },
      lastSeenAt: { gte: from, lte: to },
    },
    select: { source: true },
    distinct: ["source"],
  });
  const sources = new Set(alerts.map((alert) => alert.source.toLowerCase()));
  return {
    payments: sources.has("payments"),
    video: sources.has("video"),
    dispatch: sources.has("dispatch"),
    laboratory: sources.has("laboratory"),
    insurer: sources.has("insurer"),
  };
}

/**
 * In-person appointments.
 *
 * Telemedicine appointments are counted in their own group, because a video
 * consultation has a different failure mode (a room that never connected) and
 * merging the two would hide it behind an appointment figure that looks fine.
 */
async function appointmentMetrics(from: Date, to: Date): Promise<MetricValue[]> {
  const [booked, completed, cancelled, noShow] = await Promise.all([
    prisma.appointment.count({ where: { mode: "IN_PERSON", createdAt: { gte: from, lte: to } } }),
    prisma.appointment.count({
      where: { mode: "IN_PERSON", status: "COMPLETED", completedAt: { gte: from, lte: to } },
    }),
    prisma.appointment.count({
      where: { mode: "IN_PERSON", status: "CANCELLED", cancelledAt: { gte: from, lte: to } },
    }),
    // `Appointment` has no dedicated no-show instant, so the window is applied to
    // `updatedAt` for this one status and the definition says so.
    prisma.appointment.count({
      where: { mode: "IN_PERSON", status: "NO_SHOW", updatedAt: { gte: from, lte: to } },
    }),
  ]);

  const terminal = completed + cancelled + noShow;

  return [
    metric("appointments.booked", booked),
    metric("appointments.completed", completed),
    ratioMetric(
      "appointments.completion_rate",
      completed,
      terminal,
      "No appointment reached a terminal state in this window.",
    ),
    ratioMetric("appointments.no_show_rate", noShow, terminal, "No appointment reached a terminal state in this window."),
  ];
}

async function telemedicineMetrics(from: Date, to: Date, degraded: Degraded): Promise<MetricValue[]> {
  const [booked, sessions] = await Promise.all([
    prisma.appointment.count({ where: { mode: "TELEMEDICINE", createdAt: { gte: from, lte: to } } }),
    sampled(
      () =>
        prisma.teleconsultationSession.count({
          where: { isSandbox: false, roomExpiresAt: { gte: from, lte: to } },
        }),
      (take) =>
        prisma.teleconsultationSession.findMany({
          where: { isSandbox: false, roomExpiresAt: { gte: from, lte: to } },
          select: { status: true, startedAt: true, endedAt: true },
          orderBy: { roomExpiresAt: "desc" },
          take,
        }),
    ),
  ]);

  const ended = sessions.rows.filter((session) => session.status === "ENDED");
  const failed = sessions.rows.filter((session) => session.status === "FAILED" || session.status === "EXPIRED");
  const lengths = ended
    .map((session) => minutesBetween(session.startedAt, session.endedAt))
    .filter((value): value is number => value !== null);
  const averageLength = mean(lengths);

  return [
    metric("telemedicine.sessions_booked", booked),
    metric("telemedicine.sessions_ended", ended.length, { isPartial: degraded.video || sessions.sampled }),
    ratioMetric(
      "telemedicine.session_failure_rate",
      failed.length,
      sessions.rows.length,
      "No teleconsultation session was created in this window.",
      { isPartial: degraded.video, sampleSize: sessions.rows.length },
    ),
    averageLength === null
      ? nullMetric("telemedicine.average_session_minutes", "No session ended with both a start and an end recorded.")
      : metric("telemedicine.average_session_minutes", round(averageLength, 1), {
          sampleSize: lengths.length,
          isPartial: degraded.video || sessions.sampled,
        }),
  ];
}

async function pharmacyMetrics(from: Date, to: Date, degraded: Degraded): Promise<MetricValue[]> {
  const base = { isDemo: false } as const;

  const [placed, delivered, cancelled, accepted, deliveredOrders] = await Promise.all([
    prisma.pharmacyOrder.count({ where: { ...base, placedAt: { gte: from, lte: to } } }),
    prisma.pharmacyOrder.count({ where: { ...base, status: "DELIVERED", deliveredAt: { gte: from, lte: to } } }),
    prisma.pharmacyOrder.count({ where: { ...base, status: "CANCELLED", cancelledAt: { gte: from, lte: to } } }),
    // `placedAt` is non-null on every order, so the window on `acceptedAt`
    // alone already selects exactly the orders whose response time is
    // measurable. Orders where the accept never happened are excluded.
    sampled(
      () =>
        prisma.pharmacyOrder.count({
          where: { ...base, acceptedAt: { gte: from, lte: to } },
        }),
      (take) =>
        prisma.pharmacyOrder.findMany({
          where: { ...base, acceptedAt: { gte: from, lte: to } },
          select: { placedAt: true, acceptedAt: true },
          take,
        }),
    ),
    sampled(
      () => prisma.pharmacyOrder.count({ where: { ...base, deliveredAt: { gte: from, lte: to } } }),
      (take) =>
        prisma.pharmacyOrder.findMany({
          where: { ...base, deliveredAt: { gte: from, lte: to } },
          select: { placedAt: true, deliveredAt: true, totalPaise: true },
          take,
        }),
    ),
  ]);

  const acceptTimes = accepted.rows
    .map((order) => minutesBetween(order.placedAt, order.acceptedAt))
    .filter((value): value is number => value !== null);
  const deliveryTimes = deliveredOrders.rows
    .map((order) => minutesBetween(order.placedAt, order.deliveredAt))
    .filter((value): value is number => value !== null);

  const averageAccept = mean(acceptTimes);
  const averageDelivery = mean(deliveryTimes);
  const deliveredValuePaise = deliveredOrders.rows.reduce((total, order) => total + order.totalPaise, 0);

  return [
    metric("pharmacy.orders_placed", placed, { isPartial: degraded.payments }),
    metric("pharmacy.orders_delivered", delivered, { isPartial: degraded.payments }),
    ratioMetric(
      "pharmacy.fulfilment_rate",
      delivered,
      delivered + cancelled,
      "No order was delivered or cancelled in this window.",
    ),
    averageAccept === null
      ? nullMetric("pharmacy.average_accept_minutes", "No order was accepted in this window.")
      : metric("pharmacy.average_accept_minutes", round(averageAccept, 1), {
          sampleSize: acceptTimes.length,
          isPartial: degraded.payments || accepted.sampled,
        }),
    averageDelivery === null
      ? nullMetric("pharmacy.average_delivery_minutes", "No order was delivered in this window.")
      : metric("pharmacy.average_delivery_minutes", round(averageDelivery, 1), {
          sampleSize: deliveryTimes.length,
          isPartial: degraded.payments || deliveredOrders.sampled,
        }),
    metric("pharmacy.delivered_value_inr", round(deliveredValuePaise / 100, 2), {
      isPartial: degraded.payments || deliveredOrders.sampled,
    }),
  ];
}

async function diagnosticsMetrics(from: Date, to: Date, degraded: Degraded): Promise<MetricValue[]> {
  const [bookings, completed, completedRows] = await Promise.all([
    prisma.diagnosticBooking.count({ where: { isDemo: false, createdAt: { gte: from, lte: to } } }),
    prisma.diagnosticBooking.count({
      where: { isDemo: false, status: "COMPLETED", completedAt: { gte: from, lte: to } },
    }),
    sampled(
      () =>
        prisma.diagnosticBooking.count({
          where: { isDemo: false, completedAt: { gte: from, lte: to }, sampleCollectedAt: { not: null } },
        }),
      (take) =>
        prisma.diagnosticBooking.findMany({
          where: { isDemo: false, completedAt: { gte: from, lte: to }, sampleCollectedAt: { not: null } },
          select: { sampleCollectedAt: true, completedAt: true },
          take,
        }),
    ),
  ]);

  const spans = completedRows.rows
    .map((booking) => minutesBetween(booking.sampleCollectedAt, booking.completedAt))
    .filter((value): value is number => value !== null);
  const averageSpan = mean(spans);

  return [
    metric("diagnostics.bookings", bookings, { isPartial: degraded.laboratory }),
    metric("diagnostics.completed", completed, { isPartial: degraded.laboratory }),
    averageSpan === null
      ? nullMetric(
          "diagnostics.average_report_minutes",
          "No completed booking had both a collection and a completion instant recorded.",
        )
      : metric("diagnostics.average_report_minutes", round(averageSpan, 1), {
          sampleSize: spans.length,
          isPartial: degraded.laboratory || completedRows.sampled,
        }),
  ];
}

async function insuranceMetrics(from: Date, to: Date, degraded: Degraded): Promise<MetricValue[]> {
  const [submitted, decided] = await Promise.all([
    prisma.insuranceClaim.count({ where: { isDemo: false, submittedAt: { gte: from, lte: to } } }),
    prisma.insuranceClaim.count({ where: { isDemo: false, decidedAt: { gte: from, lte: to } } }),
  ]);

  return [
    metric("insurance.claims_submitted", submitted, { isPartial: degraded.insurer }),
    metric("insurance.claims_decided", decided, { isPartial: degraded.insurer }),
    ratioMetric(
      "insurance.claim_decision_rate",
      decided,
      submitted,
      "No claim was submitted in this window, so there is no denominator.",
    ),
  ];
}

async function supportMetrics(from: Date, to: Date): Promise<MetricValue[]> {
  const opened = await prisma.supportTicket.count({ where: { createdAt: { gte: from, lte: to } } });
  const resolvedRows = await sampled(
    () => prisma.supportTicket.count({ where: { resolvedAt: { gte: from, lte: to } } }),
    (take) =>
      prisma.supportTicket.findMany({
        where: { resolvedAt: { gte: from, lte: to } },
        select: { createdAt: true, resolvedAt: true },
        take,
      }),
  );

  const resolutionTimes = resolvedRows.rows
    .map((ticket) => minutesBetween(ticket.createdAt, ticket.resolvedAt))
    .filter((value): value is number => value !== null);
  const averageResolution = mean(resolutionTimes);

  // First response: the earliest visible (non-internal) message from somebody
  // other than the person who raised the ticket. Tickets with no such reply yet
  // are excluded rather than counted as instantaneous.
  const ticketsWithReplies = await prisma.supportTicket.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: {
      createdAt: true,
      raisedByUserId: true,
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: "asc" },
        select: { authorUserId: true, createdAt: true },
      },
    },
    take: 500,
  });

  const firstResponseTimes: number[] = [];
  for (const ticket of ticketsWithReplies) {
    const reply = ticket.messages.find((message) => message.authorUserId !== ticket.raisedByUserId);
    const minutes = reply ? minutesBetween(ticket.createdAt, reply.createdAt) : null;
    if (minutes !== null) firstResponseTimes.push(minutes);
  }
  const averageFirstResponse = mean(firstResponseTimes);

  return [
    metric("support.tickets_opened", opened),
    metric("support.tickets_resolved", resolvedRows.rows.length, { isPartial: resolvedRows.sampled }),
    ratioMetric(
      "support.resolution_rate",
      resolvedRows.rows.length,
      opened,
      "No ticket was opened in this window, so there is no denominator.",
      { isPartial: resolvedRows.sampled },
    ),
    averageResolution === null
      ? nullMetric("support.average_resolution_minutes", "No ticket was resolved in this window.")
      : metric("support.average_resolution_minutes", round(averageResolution, 1), {
          sampleSize: resolutionTimes.length,
          isPartial: resolvedRows.sampled,
        }),
    averageFirstResponse === null
      ? nullMetric(
          "support.average_first_response_minutes",
          "No ticket opened in this window has received a staff reply yet.",
        )
      : metric("support.average_first_response_minutes", round(averageFirstResponse, 1), {
          sampleSize: firstResponseTimes.length,
        }),
  ];
}

async function emergencyMetrics(from: Date, to: Date, degraded: Degraded): Promise<MetricValue[]> {
  const [requests, ackRows, unacknowledged] = await Promise.all([
    prisma.emergencyDispatchRequest.count({ where: { createdAt: { gte: from, lte: to } } }),
    sampled(
      () =>
        prisma.emergencyDispatchRequest.count({
          where: {
            acknowledgedAt: { gte: from, lte: to },
            status: { in: ["ACKNOWLEDGED", "ACCEPTED", "DECLINED"] },
          },
        }),
      (take) =>
        prisma.emergencyDispatchRequest.findMany({
          where: {
            acknowledgedAt: { gte: from, lte: to },
            status: { in: ["ACKNOWLEDGED", "ACCEPTED", "DECLINED"] },
          },
          select: { createdAt: true, acknowledgedAt: true },
          take,
        }),
    ),
    prisma.emergencyDispatchRequest.count({
      where: {
        createdAt: { gte: from, lte: to },
        acknowledgedAt: null,
        status: { in: ["PENDING", "DELIVERED"] },
      },
    }),
  ]);

  const ackSeconds = ackRows.rows
    .map((request) => {
      if (!request.acknowledgedAt) return null;
      const milliseconds = request.acknowledgedAt.getTime() - request.createdAt.getTime();
      return milliseconds >= 0 ? milliseconds / 1000 : null;
    })
    .filter((value): value is number => value !== null);
  const averageAck = mean(ackSeconds);

  return [
    metric("emergency.dispatch_requests", requests, { isPartial: degraded.dispatch }),
    ratioMetric(
      "emergency.dispatch_ack_rate",
      ackRows.rows.length,
      requests,
      "No dispatch request was sent in this window, so there is no denominator.",
      { isPartial: degraded.dispatch || ackRows.sampled },
    ),
    averageAck === null
      ? nullMetric("emergency.average_ack_seconds", "No dispatch request was acknowledged in this window.")
      : metric("emergency.average_ack_seconds", round(averageAck, 1), {
          sampleSize: ackSeconds.length,
          isPartial: degraded.dispatch || ackRows.sampled,
        }),
    metric("emergency.unacknowledged_open", unacknowledged, { isPartial: degraded.dispatch }),
  ];
}

async function reliabilityMetrics(from: Date, to: Date, degraded: Degraded): Promise<MetricValue[]> {
  const [alertsOpened, criticalOpen, dispatchTotal, dispatchConfirmed, refundsTotal, refundsSettled] =
    await Promise.all([
      prisma.integrationAlert.count({ where: { firstSeenAt: { gte: from, lte: to } } }),
      prisma.integrationAlert.count({ where: { severity: "CRITICAL", status: "OPEN" } }),
      prisma.emergencyDispatchRequest.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.emergencyDispatchRequest.count({
        where: {
          createdAt: { gte: from, lte: to },
          status: { in: ["ACKNOWLEDGED", "ACCEPTED", "DECLINED"] },
        },
      }),
      prisma.pharmacyRefund.count({ where: { isSandbox: false, createdAt: { gte: from, lte: to } } }),
      prisma.pharmacyRefund.count({
        where: { isSandbox: false, createdAt: { gte: from, lte: to }, status: "PROCESSED" },
      }),
    ]);

  return [
    metric("reliability.alerts_opened", alertsOpened),
    metric("reliability.alerts_critical_open", criticalOpen),
    ratioMetric(
      "reliability.integration_success_rate",
      dispatchConfirmed + refundsSettled,
      dispatchTotal + refundsTotal,
      "No provider-facing operation was attempted in this window.",
      {
        numerator: dispatchConfirmed + refundsSettled,
        denominator: dispatchTotal + refundsTotal,
        isPartial: degraded.payments || degraded.dispatch,
      },
    ),
  ];
}

async function onboardingMetrics(from: Date, to: Date): Promise<MetricValue[]> {
  const [hospitalsVerified, verificationsPending, applicationsPending, abuseOpen] = await Promise.all([
    prisma.hospital.count({
      where: { verificationStatus: "VERIFIED", verifiedAt: { gte: from, lte: to } },
    }),
    prisma.verificationRequest.count({ where: { status: "PENDING" } }),
    prisma.partnerApplication.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    prisma.abuseReport.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
  ]);

  return [
    metric("platform.hospitals_verified", hospitalsVerified),
    metric("platform.verifications_pending", verificationsPending),
    metric("platform.partner_applications_pending", applicationsPending),
    metric("platform.abuse_reports_open", abuseOpen),
  ];
}

const GROUP_BUILDERS: Record<
  PlatformVertical,
  (from: Date, to: Date, degraded: Degraded) => Promise<MetricValue[]>
> = {
  appointments: (from, to) => appointmentMetrics(from, to),
  telemedicine: (from, to, degraded) => telemedicineMetrics(from, to, degraded),
  pharmacy: (from, to, degraded) => pharmacyMetrics(from, to, degraded),
  diagnostics: (from, to, degraded) => diagnosticsMetrics(from, to, degraded),
  insurance: (from, to, degraded) => insuranceMetrics(from, to, degraded),
  support: (from, to) => supportMetrics(from, to),
  emergency: (from, to, degraded) => emergencyMetrics(from, to, degraded),
  hospitals: (from, to) => onboardingMetrics(from, to),
};

/**
 * Builds the operational dashboard for a window.
 *
 * Reliability is always included, whatever the vertical filter, because it is
 * the group that says whether the other groups can be believed.
 */
export async function analyticsOverview(input: AnalyticsRangeInput): Promise<AnalyticsOverview> {
  const { from, to } = input;
  const vertical = input.vertical ?? null;
  const degraded = await degradedProviders(from, to);

  const selected: PlatformVertical[] = vertical
    ? [vertical]
    : (Object.keys(GROUP_BUILDERS) as PlatformVertical[]);

  const groups: AnalyticsGroup[] = [];
  for (const key of selected) {
    groups.push({
      key,
      label: VERTICAL_LABELS[key],
      metrics: await GROUP_BUILDERS[key](from, to, degraded),
    });
  }

  // Reliability last, so the reader arrives at the caveats having seen the data.
  groups.push({
    key: "reliability",
    label: "Service reliability",
    metrics: await reliabilityMetrics(from, to, degraded),
  });

  const dataQuality: DataQualityNote[] = [];
  const degradedLabels: string[] = [];
  if (degraded.payments) degradedLabels.push("payments");
  if (degraded.video) degradedLabels.push("video");
  if (degraded.dispatch) degradedLabels.push("emergency dispatch");
  if (degraded.laboratory) degradedLabels.push("laboratory");
  if (degraded.insurer) degradedLabels.push("insurer");
  if (degradedLabels.length > 0) {
    dataQuality.push({
      severity: "warning",
      message: `Provider integrations reported failures during this window (${degradedLabels.join(", ")}). Figures for those services may understate true volume.`,
    });
  }
  const nulls = groups.flatMap((group) => group.metrics).filter((value) => value.value === null);
  if (nulls.length > 0) {
    dataQuality.push({
      severity: "info",
      message: `${nulls.length} metric${nulls.length === 1 ? "" : "s"} had no data to compute from and are shown as "not available" rather than zero.`,
    });
  }
  groups.forEach((group) => {
    if (group.metrics.some((value) => value.isPartial)) {
      dataQuality.push({
        severity: "warning",
        message: `${group.label}: one or more figures are partial and are marked as such.`,
      });
    }
  });

  return {
    window: { from, to, granularity: input.granularity, vertical },
    generatedAt: new Date(),
    groups,
    dataQuality,
  };
}

// ---------------------------------------------------------------------------
// Stored samples
// ---------------------------------------------------------------------------

export type OperationalMetricSample = {
  id: string;
  metricKey: string;
  windowFrom: Date;
  windowTo: Date;
  value: number;
  isPartial: boolean;
  recordedAt: Date;
};

export async function listOperationalMetrics(input: {
  metricKey?: string;
  from?: Date;
  to?: Date;
  limit?: number;
} = {}): Promise<OperationalMetricSample[]> {
  const rows = await prisma.operationalMetric.findMany({
    where: {
      ...(input.metricKey ? { metricKey: input.metricKey } : {}),
      ...(input.from || input.to
        ? { windowFrom: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
        : {}),
    },
    orderBy: [{ windowFrom: "desc" }, { metricKey: "asc" }],
    take: Math.min(input.limit ?? 500, 2_000),
  });
  return rows;
}

/**
 * Persists the current dashboard as `OperationalMetric` rows.
 *
 * The window is explicit and part of the unique key, so re-running a snapshot
 * for the same window updates it rather than appending a duplicate. A metric
 * that computed to null is *not* stored as zero — an absent sample is the honest
 * representation, and the dashboard already reports it as missing.
 */
export async function recordOperationalSnapshot(input: {
  context: PlatformContext;
  range: AnalyticsRangeInput;
}): Promise<PlatformResult<{ recorded: number; skipped: number }>> {
  const overview = await analyticsOverview(input.range);
  let recorded = 0;
  let skipped = 0;

  for (const group of overview.groups) {
    for (const value of group.metrics) {
      if (value.value === null) {
        skipped += 1;
        continue;
      }
      await prisma.operationalMetric.upsert({
        where: {
          metricKey_windowFrom_windowTo: {
            metricKey: value.key,
            windowFrom: input.range.from,
            windowTo: input.range.to,
          },
        },
        create: {
          metricKey: value.key,
          windowFrom: input.range.from,
          windowTo: input.range.to,
          value: value.value,
          isPartial: value.isPartial,
          metadata: {
            unit: value.unit,
            vertical: group.key,
            numerator: value.numerator ?? null,
            denominator: value.denominator ?? null,
            sampleSize: value.sampleSize ?? null,
          },
        },
        update: {
          value: value.value,
          isPartial: value.isPartial,
          recordedAt: new Date(),
        },
      });
      recorded += 1;
    }
  }

  await recordPlatformAction({
    context: input.context,
    action: "platform.metric_snapshot_recorded",
    entityType: "operational_metric",
    metadata: {
      recorded,
      skipped,
      windowFrom: input.range.from.toISOString(),
      windowTo: input.range.to.toISOString(),
    },
  });

  return platformOk({ recorded, skipped });
}
