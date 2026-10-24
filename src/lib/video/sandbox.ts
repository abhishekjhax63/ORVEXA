import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getAuthSecret, isProduction } from "@/lib/env";

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
 * The sandbox video provider.
 *
 * It exists so the booking, waiting-room and follow-up workflow is exercisable
 * end to end before a video account exists. It creates no external room and
 * moves no media.
 *
 * Three rules make that safe rather than misleading:
 *
 *  1. **It refuses to run in production.** A production deployment with no video
 *     provider configured reports video as unavailable; it does not fall back to
 *     pretending. This is the single most important line in the file.
 *  2. **Every room it returns is stamped `isSandbox` and `confirmed: false`.** A
 *     session built on it can never present itself as a real call, and the
 *     service treats `isSandbox` — not `providerConfirmed` — as the reason it may
 *     still advance.
 *  3. **Its join tokens are signed** with a key derived from `AUTH_SECRET` and a
 *     version tag unique to the sandbox, so a sandbox token can never be mistaken
 *     for a provider token and vice versa.
 */

const SIGNING_CONTEXT = "orvexa.sandbox.video.v1";
const SANDBOX_LIVE_REFUSAL =
  "Video calling is not configured on this deployment. The built-in sandbox provider refuses to run in a production build, so no room was opened.";

function signingKey(): string | null {
  try {
    return createHmac("sha256", getAuthSecret()).update(SIGNING_CONTEXT).digest("hex");
  } catch {
    return null;
  }
}

function sign(payload: string): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac("sha256", key).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** The exact string a sandbox join token signs. Binds token to room and role. */
export function sandboxTokenPayload(input: {
  providerRoomId: string;
  userName: string;
  isOwner: boolean;
  expiresAt: number;
}): string {
  return [input.providerRoomId, input.userName, input.isOwner ? "owner" : "guest", String(input.expiresAt)].join("|");
}

/** Produces a genuine sandbox token, used by the rehearsal page's server action. */
export function signSandboxToken(input: {
  providerRoomId: string;
  userName: string;
  isOwner: boolean;
  expiresAt: number;
}): string | null {
  const signature = sign(sandboxTokenPayload(input));
  if (!signature) return null;
  return `sbx_vt_${Buffer.from(
    JSON.stringify({ ...input, signature }),
  ).toString("base64url")}`;
}

/** Reads back a sandbox token this module issued. Returns null on any mismatch. */
export function verifySandboxToken(
  token: string,
): { providerRoomId: string; userName: string; isOwner: boolean; expiresAt: number } | null {
  if (!token.startsWith("sbx_vt_")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token.slice("sbx_vt_".length), "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const candidate = parsed as {
    providerRoomId?: unknown;
    userName?: unknown;
    isOwner?: unknown;
    expiresAt?: unknown;
    signature?: unknown;
  };
  if (
    typeof candidate.providerRoomId !== "string" ||
    typeof candidate.userName !== "string" ||
    typeof candidate.isOwner !== "boolean" ||
    typeof candidate.expiresAt !== "number" ||
    typeof candidate.signature !== "string"
  ) {
    return null;
  }
  const expected = sign(
    sandboxTokenPayload({
      providerRoomId: candidate.providerRoomId,
      userName: candidate.userName,
      isOwner: candidate.isOwner,
      expiresAt: candidate.expiresAt,
    }),
  );
  if (!expected || !safeEqual(candidate.signature, expected)) return null;
  return {
    providerRoomId: candidate.providerRoomId,
    userName: candidate.userName,
    isOwner: candidate.isOwner,
    expiresAt: candidate.expiresAt,
  };
}

export function createSandboxVideoProvider(): VideoProvider {
  return {
    id: "SANDBOX",
    label: "Sandbox consultation room",
    isLive: false,
    createsRealRooms: false,
    canVerifyWebhooks: false,

    async createRoom(request: VideoRoomRequest): Promise<VideoResult<VideoRoom>> {
      if (isProduction()) return videoFailure<VideoRoom>("not_configured", { message: SANDBOX_LIVE_REFUSAL });

      const providerRoomId = `sbx_room_${request.sessionId}`;
      return {
        ok: true,
        data: {
          provider: "SANDBOX",
          providerRoomId,
          // No external room exists, so there is no URL to hand out.
          roomUrl: null,
          name: request.roomName,
          expiresAt: request.expiresAt,
          // Deliberately not confirmed: nothing external confirmed anything.
          confirmed: false,
          isSandbox: true,
          summary: {
            sessionId: request.sessionId,
            note: "Sandbox room. Nothing external was created and no media moves.",
          },
        },
      };
    },

    async createToken(request: VideoTokenRequest): Promise<VideoResult<VideoToken>> {
      if (isProduction()) return videoFailure<VideoToken>("not_configured", { message: SANDBOX_LIVE_REFUSAL });

      const token = signSandboxToken({
        providerRoomId: request.providerRoomId,
        userName: request.userName,
        isOwner: request.isOwner,
        expiresAt: request.expiresAt.getTime(),
      });
      if (!token) {
        return videoFailure<VideoToken>("not_configured", {
          message: "The sandbox provider could not sign a token, so no join link was issued.",
        });
      }

      return { ok: true, data: { token, expiresAt: request.expiresAt, isSandbox: true } };
    },

    async deleteRoom(): Promise<VideoResult<{ deleted: boolean }>> {
      if (isProduction()) return videoFailure<{ deleted: boolean }>("not_configured", { message: SANDBOX_LIVE_REFUSAL });
      // There is nothing external to delete; saying so is the honest answer.
      return { ok: true, data: { deleted: false } };
    },

    verifyWebhookSignature(): { verified: boolean; reason: string } {
      return {
        verified: false,
        reason: "The sandbox video provider sends no callbacks; a sandbox session never reports a call connected.",
      };
    },
  };
}

/** A short, non-guessable opaque room name. Never derived from patient details. */
export function sandboxRoomName(): string {
  return `orvexa-sandbox-${randomBytes(9).toString("base64url")}`;
}
