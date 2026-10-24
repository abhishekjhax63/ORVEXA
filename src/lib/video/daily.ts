import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { VideoProviderConfig } from "@/lib/env";

import {
  videoFailure,
  type VideoProvider,
  type VideoResult,
  type VideoRoom,
  type VideoRoomRequest,
  type VideoToken,
  type VideoTokenRequest,
} from "./provider";

/**
 * The Daily.co video provider.
 *
 * It is selected only when `DAILY_API_KEY` is present (see
 * `getVideoProviderConfig`), so a half-configured provider can never create a
 * session and then fail at join, in front of a waiting patient.
 *
 * ## Confirmation is taken from Daily, never assumed
 *
 * `createRoom` returns `confirmed: true` only when Daily's own response carried
 * a room id *and* a URL. A 4xx, a 5xx, a timeout or an unreadable body each
 * produce a distinct failure and leave the caller's session exactly where it
 * was. There is no path here that invents a room URL.
 *
 * ## What is never logged
 *
 * Only the HTTP status is logged on failure. Never the API key, never the
 * request body (which names participants) and never the response body.
 */

const CALL_TIMEOUT_MS = 15_000;

type DailyConfig = Extract<VideoProviderConfig, { mode: "daily" }>;

function readString(body: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function readNumber(body: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

async function callDaily(
  config: DailyConfig,
  path: string,
  init: { method: "POST" | "DELETE"; body?: Record<string, unknown>; signal?: AbortSignal },
): Promise<VideoResult<{ status: number; body: Record<string, unknown> }>> {
  const base = config.baseUrl.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetch(`${base}${path.startsWith("/") ? "" : "/"}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: init.signal ?? AbortSignal.timeout(CALL_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    console.error("[video] Daily could not be reached", name || "unknown error");
    return name === "TimeoutError" || name === "AbortError"
      ? videoFailure("timeout")
      : videoFailure("network_error");
  }

  if (!response.ok) {
    // The status is safe; the body is not logged, because it can name participants.
    console.error(`[video] Daily returned ${response.status}`);
    return videoFailure("provider_error", { status: response.status });
  }

  // A DELETE may legitimately return an empty body.
  if (response.status === 204) return { ok: true, data: { status: response.status, body: {} } };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return videoFailure("provider_error", {
      status: response.status,
      message: "The video service returned an unreadable answer, so no room was opened.",
    });
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return videoFailure("provider_error", {
      status: response.status,
      message: "The video service returned an unexpected answer, so no room was opened.",
    });
  }

  return { ok: true, data: { status: response.status, body: body as Record<string, unknown> } };
}

export function createDailyVideoProvider(config: DailyConfig): VideoProvider {
  return {
    id: "DAILY",
    label: "Daily.co",
    isLive: config.isLive,
    createsRealRooms: true,
    canVerifyWebhooks: Boolean(config.webhookSecret),

    async createRoom(request: VideoRoomRequest): Promise<VideoResult<VideoRoom>> {
      const result = await callDaily(config, "/rooms", {
        method: "POST",
        body: {
          name: request.roomName,
          privacy: "private",
          properties: {
            // Daily accepts `exp` as a unix timestamp in seconds.
            exp: Math.floor(request.expiresAt.getTime() / 1000),
            max_participants: request.maxParticipants ?? 2,
            enable_chat: true,
            enable_screenshare: false,
            start_video_off: false,
            start_audio_off: false,
          },
        },
      });

      if (!result.ok) return result;

      const body = result.data.body;
      const providerRoomId = readString(body, "id", "name");
      const roomUrl = readString(body, "url");

      // Confirmation requires both an id and a URL from Daily's own response.
      if (!providerRoomId || !roomUrl) {
        return videoFailure<VideoRoom>("provider_error", {
          status: result.data.status,
          message:
            "The video service did not return a usable room, so no consultation room was created and nothing was handed to the patient.",
        });
      }

      const exp = readNumber(body, "exp");
      return {
        ok: true,
        data: {
          provider: "DAILY",
          providerRoomId,
          roomUrl,
          name: readString(body, "name") ?? request.roomName,
          expiresAt: exp ? new Date(exp * 1000) : request.expiresAt,
          // Daily answered with a room; that is the only confirmation we accept.
          confirmed: true,
          isSandbox: false,
          summary: { id: providerRoomId, created_at: readString(body, "created_at") },
        },
      };
    },

    async createToken(request: VideoTokenRequest): Promise<VideoResult<VideoToken>> {
      const result = await callDaily(config, "/meeting-tokens", {
        method: "POST",
        body: {
          properties: {
            room_name: request.providerRoomId,
            user_name: request.userName,
            is_owner: request.isOwner,
            exp: Math.floor(request.expiresAt.getTime() / 1000),
          },
        },
      });

      if (!result.ok) return result;

      const token = readString(result.data.body, "token");
      if (!token) {
        return videoFailure<VideoToken>("provider_error", {
          status: result.data.status,
          message: "The video service did not return a join token, so no join link was issued.",
        });
      }

      return { ok: true, data: { token, expiresAt: request.expiresAt, isSandbox: false } };
    },

    async deleteRoom(providerRoomId: string): Promise<VideoResult<{ deleted: boolean }>> {
      const result = await callDaily(config, `/rooms/${encodeURIComponent(providerRoomId)}`, { method: "DELETE" });
      if (!result.ok) return result;
      return { ok: true, data: { deleted: true } };
    },

    /**
     * Verifies Daily's callback signature over the exact raw body.
     *
     * The caller must read the body with `await request.text()` and pass that
     * string here, so the bytes verified are the bytes parsed. Without a
     * configured `DAILY_WEBHOOK_SECRET` every callback is refused rather than
     * trusted, because an unsigned payload is indistinguishable from a forgery.
     */
    verifyWebhookSignature(input: { rawBody: string; signatureHeader: string | null }): {
      verified: boolean;
      reason: string;
    } {
      if (!config.webhookSecret) {
        return {
          verified: false,
          reason: "No Daily callback secret is configured on this deployment, so this callback was refused.",
        };
      }
      if (!input.signatureHeader) {
        return { verified: false, reason: "This callback did not carry a signature." };
      }

      const expected = createHmac("sha256", config.webhookSecret).update(input.rawBody, "utf8").digest("base64");
      const provided = input.signatureHeader.replace(/^v\d+=/i, "").trim();

      const expectedBuffer = Buffer.from(expected, "utf8");
      const providedBuffer = Buffer.from(provided, "utf8");
      if (expectedBuffer.length !== providedBuffer.length || expectedBuffer.length === 0) {
        return { verified: false, reason: "This callback's signature could not be verified." };
      }
      if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
        return { verified: false, reason: "This callback's signature could not be verified." };
      }
      return { verified: true, reason: "Signature verified." };
    },
  };
}
