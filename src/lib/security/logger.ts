import "server-only";

/**
 * Structured logging for the server.
 *
 * ## What this is for
 *
 * An incident is investigated from logs. That works only if a log line carries
 * enough to correlate it with a request and with the other lines the same
 * request produced — and only if the line does not itself become a leak.
 *
 * ## What is never logged
 *
 * No clinical content, no symptom text, no message bodies, no document contents,
 * no tokens, no passwords and no request bodies. A `detail` is a short,
 * operator-chosen summary such as "video provider returned 502", never a payload
 * lifted from the request. Where an identifier is genuinely needed for
 * correlation it is passed through `redactId`, which keeps a stable prefix and a
 * short suffix so two lines can be tied together without the full identifier
 * being reconstructible from the log.
 *
 * ## Health information
 *
 * Nothing in this module accepts a `Record<string, unknown>` and blindly prints
 * it. `metadata` is typed to primitives, so an object cannot be smuggled in, and
 * `logOperationalEvent` is the only entry point the console services use.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export type LogEntry = {
  level: LogLevel;
  /** Dotted event name, e.g. `platform.export.completed`. */
  event: string;
  message: string;
  /** Correlation id for the request that produced the line. */
  requestId?: string | null;
  /** Stable prefix + short suffix. Never a raw identifier. */
  subject?: string | null;
  metadata?: LogFields;
  durationMs?: number;
  error?: unknown;
  at: string;
};

/**
 * Keeps the first four characters and the last two so lines about the same
 * subject correlate, while the identifier itself is not recoverable.
 */
export function redactId(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "…";
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

function serialiseError(error: unknown): LogFields | undefined {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      errorName: error.name,
      // The message only. A stack trace can carry request data in its frames,
      // and the message is what the operator needs to triage.
      errorMessage: error.message.slice(0, 500),
    };
  }
  return { errorName: "NonError", errorMessage: String(error).slice(0, 500) };
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minimumLevel(): LogLevel {
  const configured = process.env.ORVEXA_LOG_LEVEL?.toLowerCase();
  if (configured === "debug" || configured === "info" || configured === "warn" || configured === "error") {
    return configured;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Emits one line of NDJSON to stdout.
 *
 * NDJSON rather than pretty text because the platform is deployed to a log
 * collector: a line that is already a JSON object needs no parser that can be
 * confused by a newline inside a message.
 */
export function log(entry: Omit<LogEntry, "at">): void {
  if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[minimumLevel()]) return;

  const payload: Record<string, unknown> = {
    at: new Date().toISOString(),
    level: entry.level,
    event: entry.event,
    message: entry.message,
    ...(entry.requestId ? { requestId: entry.requestId } : {}),
    ...(entry.subject ? { subject: entry.subject } : {}),
    ...(entry.durationMs !== undefined ? { durationMs: Math.round(entry.durationMs) } : {}),
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
    ...(serialiseError(entry.error) ?? {}),
  };

  const line = JSON.stringify(payload);
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Convenience wrapper used across the platform services.
 *
 * `subject` is passed through `redactId` so a caller cannot accidentally log a
 * full identifier by passing one.
 */
export function logOperationalEvent(
  level: LogLevel,
  event: string,
  message: string,
  options: {
    requestId?: string | null;
    subject?: string | null;
    metadata?: LogFields;
    durationMs?: number;
    error?: unknown;
  } = {},
): void {
  log({
    level,
    event,
    message,
    requestId: options.requestId ?? null,
    subject: redactId(options.subject),
    metadata: options.metadata,
    durationMs: options.durationMs,
    error: options.error,
  });
}

/** Times a block and logs it, so a slow call is visible without a profiler. */
export async function withTiming<T>(
  event: string,
  run: () => Promise<T>,
  options: { requestId?: string | null; subject?: string | null; metadata?: LogFields } = {},
): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    logOperationalEvent("info", event, "completed", { ...options, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    logOperationalEvent("error", `${event}.failed`, "failed", {
      ...options,
      durationMs: Date.now() - started,
      error,
    });
    throw error;
  }
}
