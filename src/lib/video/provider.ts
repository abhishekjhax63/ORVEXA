import "server-only";

/**
 * The replaceable video-provider interface.
 *
 * ## Why this exists
 *
 * A consultation has to be bookable, joinable and rejoinable before a video
 * account exists. Rather than writing Daily calls into the session service and
 * stubbing them in tests, the service talks to `VideoProvider` and nothing above
 * this file knows a vendor name, an endpoint or a payload shape.
 *
 * Two implementations ship:
 *
 *  - `sandbox` — a real, working stand-in that opens no room and moves no media.
 *    It needs no keys. Every room it returns is stamped `isSandbox`, and it
 *    refuses to run in a production build, so a rehearsal can never be mistaken
 *    for a consultation.
 *  - `daily` — Daily.co. Selected only when `DAILY_API_KEY` is present.
 *
 * ## The one rule that governs this file
 *
 * **Nothing here reports a room as created, or a call as connected, without the
 * provider's own response saying so.** `createRoom` returns `confirmed: true`
 * only when the provider returned a room with an id and a URL. A failure is a
 * first-class outcome and is rendered as such; there is deliberately no fallback
 * that hands a patient a plausible-looking but non-existent room.
 *
 * ## Secrets
 *
 * `apiKey` and `webhookSecret` never leave the server. A join token is minted
 * per participant, per session, and is short-lived; the caller stores only its
 * HMAC. An error returned from this interface never carries a key, a token or a
 * raw upstream payload.
 */

export type VideoProviderId = "DAILY" | "SANDBOX";

export type VideoErrorKind =
  | "not_configured"
  | "invalid_request"
  | "timeout"
  | "network_error"
  | "provider_error"
  | "signature_invalid"
  | "forbidden"
  | "unsupported";

export type VideoError = {
  kind: VideoErrorKind;
  /** Safe to render. Never contains a key, a token or a raw provider payload. */
  message: string;
  /** Upstream HTTP status, when there was one. */
  status?: number;
  /** Provider's own error code, when it gave one. */
  providerCode?: string;
};

export type VideoResult<T> = { ok: true; data: T } | { ok: false; error: VideoError };

export const VIDEO_ERROR_COPY: Record<VideoErrorKind, string> = {
  not_configured:
    "Video calling is not configured on this deployment, so a consultation room cannot be opened here. The appointment itself is unaffected.",
  invalid_request: "The video request was rejected before it was sent.",
  timeout: "The video service did not respond in time, so no room was opened. You can try again.",
  network_error: "The video service could not be reached, so no room was opened. You can try again.",
  provider_error: "The video service returned an error, so no room was opened.",
  signature_invalid: "The video callback could not be verified as coming from the provider, so it was refused.",
  forbidden: "This session may not be opened with the configured video service.",
  unsupported: "This operation is not supported by the configured video provider.",
};

export function videoFailure<T>(
  kind: VideoErrorKind,
  extra?: { status?: number; providerCode?: string; message?: string },
): VideoResult<T> {
  return {
    ok: false,
    error: {
      kind,
      message: extra?.message ?? VIDEO_ERROR_COPY[kind],
      status: extra?.status,
      providerCode: extra?.providerCode,
    },
  };
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export type VideoRoomRequest = {
  /** Our own session id. Used as a stable, non-guessable room name component. */
  sessionId: string;
  /** The name the provider is asked to create. Callers pass an opaque name. */
  roomName: string;
  /** When the room should stop admitting participants. */
  expiresAt: Date;
  /** Optional human label, shown inside the provider's own UI where supported. */
  label?: string;
  /** Upper bound on simultaneous participants. Two is the norm. */
  maxParticipants?: number;
};

export type VideoRoom = {
  provider: VideoProviderId;
  providerRoomId: string;
  /** Where a browser goes to join. `null` for a sandbox room. */
  roomUrl: string | null;
  /** The provider's own room name, echoed back. */
  name: string;
  expiresAt: Date;
  /**
   * True only when the provider's response confirmed the room exists. A sandbox
   * room is `false`: it exists as a rehearsal, not as a callable room.
   */
  confirmed: boolean;
  /** True for a rehearsal. Never presented as a real consultation. */
  isSandbox: boolean;
  /** Provider response summary, with anything secret removed. */
  summary: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Join tokens
// ---------------------------------------------------------------------------

export type VideoTokenRequest = {
  /** The provider's own room id, as returned by `createRoom`. */
  providerRoomId: string;
  /** Display name shown to the other participant. */
  userName: string;
  /** Room owners may admit and remove participants; a patient is not an owner. */
  isOwner: boolean;
  expiresAt: Date;
};

export type VideoToken = {
  /** The meeting token. Short-lived; the caller stores only its HMAC. */
  token: string;
  expiresAt: Date;
  isSandbox: boolean;
};

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

export interface VideoProvider {
  readonly id: VideoProviderId;
  readonly label: string;
  /** False for anything that cannot carry a real consultation. */
  readonly isLive: boolean;
  /** True only when the provider actually opens an external room. */
  readonly createsRealRooms: boolean;
  /** True when this provider can prove an inbound callback really came from it. */
  readonly canVerifyWebhooks: boolean;

  /**
   * Opens a room. `confirmed` is set from the provider's own response — never
   * assumed. A provider that is not configured or fails returns a `VideoResult`
   * failure, and the caller must leave the session where it is.
   */
  createRoom(request: VideoRoomRequest): Promise<VideoResult<VideoRoom>>;

  /** Mints a short-lived join token for one participant. */
  createToken(request: VideoTokenRequest): Promise<VideoResult<VideoToken>>;

  /** Closes a room early. Optional: an unsupported provider says so. */
  deleteRoom?(providerRoomId: string): Promise<VideoResult<{ deleted: boolean }>>;

  /** Signature check only. Returns a verdict, never throws. */
  verifyWebhookSignature(input: { rawBody: string; signatureHeader: string | null }): {
    verified: boolean;
    reason: string;
  };
}
