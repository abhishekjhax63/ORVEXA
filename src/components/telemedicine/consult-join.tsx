"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Clock, LoaderCircle, TriangleAlert, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatConsultInstant } from "@/lib/telemedicine/format";

/**
 * The landing surface behind a consultation join link.
 *
 * ## What this page is allowed to claim
 *
 * Opening the link proves possession of the token and asks the server to
 * exchange it for a real provider meeting token. Only the provider's own
 * confirmed response makes a room openable, and the copy here repeats exactly
 * what the server returned — including `providerConfirmed: false`, a provider
 * failure, an expired link, or the sandbox notice.
 *
 * ## Presence is not a call
 *
 * Entering the waiting room records that a participant arrived. It does not
 * connect a call, and nothing on this page says a consultation has started.
 */

export type ConsultGrant = {
  appointmentId: string;
  reference: string;
  viewer: "PATIENT" | "CLINICIAN";
  sessionStatus: string;
  provider: string;
  providerConfirmed: boolean;
  isSandbox: boolean;
  roomUrl: string | null;
  token: string | null;
  tokenExpiresAt: string | null;
  roomExpiresAt: string | null;
  notice: string;
};

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, payload };
}

export function ConsultJoin({ token }: { token: string }) {
  const [busy, setBusy] = useState<null | "waiting-room" | "join">(null);
  const [grant, setGrant] = useState<ConsultGrant | null>(null);
  const [enteredWaitingRoom, setEnteredWaitingRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const joinUrl = `/api/consult/${encodeURIComponent(token)}`;

  async function enterWaitingRoom() {
    setBusy("waiting-room");
    setError(null);
    const { response, payload } = await postJson(joinUrl, { action: "waiting_room" });
    setBusy(null);
    if (!response.ok) {
      setError((payload?.error as string | undefined) ?? "The waiting room could not be entered.");
      return;
    }
    setEnteredWaitingRoom(true);
  }

  async function join() {
    setBusy("join");
    setError(null);
    const { response, payload } = await postJson(joinUrl, { action: "join" });
    setBusy(null);
    if (!response.ok || payload?.ok !== true) {
      setError((payload?.error as string | undefined) ?? "A join link could not be issued for this consultation.");
      return;
    }
    setGrant({
      appointmentId: String(payload.appointmentId ?? ""),
      reference: String(payload.reference ?? ""),
      viewer: payload.viewer === "CLINICIAN" ? "CLINICIAN" : "PATIENT",
      sessionStatus: String(payload.sessionStatus ?? ""),
      provider: String(payload.provider ?? ""),
      providerConfirmed: payload.providerConfirmed === true,
      isSandbox: payload.isSandbox === true,
      roomUrl: (payload.roomUrl as string | null) ?? null,
      token: (payload.token as string | null) ?? null,
      tokenExpiresAt: (payload.tokenExpiresAt as string | null) ?? null,
      roomExpiresAt: (payload.roomExpiresAt as string | null) ?? null,
      notice: String(payload.notice ?? ""),
    });
  }

  const serverConfirmedRoom = grant !== null && grant.providerConfirmed && !grant.isSandbox;
  const callableUrl = serverConfirmedRoom ? grant.roomUrl ?? grant.token : null;

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          This link is personal to you and expires quickly. It reaches the consultation named on the page and nothing
          else — if you are not a participant on that consultation, the link will be refused.
        </p>

        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm font-medium text-emergency">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        {enteredWaitingRoom ? (
          <p className="flex items-center gap-2 text-sm">
            <CircleCheck aria-hidden className="size-4 text-success" />
            Your arrival is recorded. That records presence — it does not connect a call.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null || enteredWaitingRoom}
            onClick={() => void enterWaitingRoom()}
          >
            {busy === "waiting-room" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Clock aria-hidden />}
            Enter the waiting room
          </Button>
          <Button type="button" variant="gradient" disabled={busy !== null} onClick={() => void join()}>
            {busy === "join" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Video aria-hidden />}
            Join the consultation
          </Button>
        </div>
      </div>

      {grant ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={serverConfirmedRoom ? "success" : grant.isSandbox ? "warning" : "warning"}>
              {grant.isSandbox
                ? "Sandbox"
                : serverConfirmedRoom
                  ? "Provider confirmed the room"
                  : "Provider did not confirm the room"}
            </Badge>
            <Badge variant="neutral">Session: {grant.sessionStatus || "unknown"}</Badge>
            {grant.viewer === "CLINICIAN" ? <Badge variant="outline">Joining as clinician</Badge> : null}
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">{grant.notice}</p>

          {grant.roomExpiresAt ? (
            <p className="text-xs text-muted-foreground">
              The room closes {formatConsultInstant(grant.roomExpiresAt) ?? "shortly"}.
              {grant.tokenExpiresAt
                ? ` This link expires ${formatConsultInstant(grant.tokenExpiresAt) ?? "shortly"}.`
                : ""}
            </p>
          ) : null}

          {callableUrl ? (
            <Button asChild variant="gradient">
              <a href={callableUrl}>Open the secure room</a>
            </Button>
          ) : (
            <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-xs leading-relaxed">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
              No call can be placed from this link.{" "}
              {grant.isSandbox
                ? "No video provider is configured on this deployment, so this is a sandbox rehearsal only."
                : "The video provider has not confirmed the room, so there is no room to open yet."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
