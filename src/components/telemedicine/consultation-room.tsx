"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  LoaderCircle,
  LogOut,
  RefreshCw,
  TriangleAlert,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatConsultInstant } from "@/lib/telemedicine/format";

/**
 * The consultation room, as the participant sees it.
 *
 * ## What this component is not allowed to say
 *
 * It never states that a call is connected, in progress or successful. The only
 * claims it makes are the ones a server response supports: the video provider
 * confirmed a room exists (or did not), a short-lived join link was issued (or
 * was not), and the provider's own room URL is where the call would be held.
 *
 * ## Sandbox honesty
 *
 * When no video provider is configured the session is a sandbox rehearsal:
 * `roomUrl` is null, the notice says so verbatim, and there is no button that
 * pretends to place a call.
 */

export type RoomAvailability = {
  available: boolean;
  label: string;
  isSandbox: boolean;
  isLive: boolean;
  notice: string;
};

type Props = {
  appointmentId: string;
  appointmentStatus: string;
  canOpenRoom: boolean;
  sessionStatus: string | null;
  sessionFailureReason: string | null;
  joinWindowOpensAtIso: string | null;
  roomExpiresAtIso: string | null;
  availability: RoomAvailability;
  notice: string;
};

type IssuedLink = {
  linkUrl: string;
  expiresAt: string | null;
  isSandbox: boolean;
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

export function ConsultationRoom({
  appointmentId,
  appointmentStatus,
  canOpenRoom,
  sessionStatus,
  sessionFailureReason,
  joinWindowOpensAtIso,
  roomExpiresAtIso,
  availability,
  notice,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "open" | "reconnect" | "end">(null);
  const [link, setLink] = useState<IssuedLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ended, setEnded] = useState(false);

  const joinWindow = formatConsultInstant(joinWindowOpensAtIso);
  const roomExpiry = formatConsultInstant(roomExpiresAtIso);

  async function issueLink(reconnect: boolean) {
    setBusy(reconnect ? "reconnect" : "open");
    setError(null);
    setCopied(false);

    if (!reconnect) {
      const created = await postJson("/api/telemedicine/sessions", { appointmentId });
      if (!created.response.ok) {
        setError(
          (created.payload?.error as string | undefined) ??
            "The consultation room could not be opened. Nothing was connected.",
        );
        setBusy(null);
        return;
      }
      // Presence only — this opens nothing and moves no state.
      await postJson("/api/telemedicine/sessions/waiting-room", { appointmentId });
    }

    const joined = await postJson("/api/telemedicine/sessions/join", { appointmentId, reconnect });
    if (!joined.response.ok) {
      setError(
        (joined.payload?.error as string | undefined) ??
          "A join link could not be issued, so no room was opened.",
      );
      setBusy(null);
      return;
    }

    setLink({
      linkUrl: String(joined.payload?.linkUrl ?? ""),
      expiresAt: (joined.payload?.expiresAt as string | undefined) ?? null,
      isSandbox: joined.payload?.isSandbox === true,
      notice: String(joined.payload?.notice ?? ""),
    });
    setBusy(null);
    router.refresh();
  }

  async function endConsultation() {
    setBusy("end");
    setError(null);
    const result = await postJson("/api/telemedicine/sessions/end", { appointmentId });
    if (!result.response.ok) {
      setError((result.payload?.error as string | undefined) ?? "The consultation room could not be closed.");
      setBusy(null);
      return;
    }
    setEnded(true);
    setLink(null);
    setBusy(null);
    router.refresh();
  }

  if (appointmentStatus === "CANCELLED" || appointmentStatus === "NO_SHOW") {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        This consultation was not held, so there is no room to open. The record stays on this page for your history.
      </div>
    );
  }

  if (appointmentStatus === "PENDING") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-5">
        <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-medium">Waiting for the clinician to confirm</p>
          <p className="mt-1 text-muted-foreground">
            A consultation room can be opened once the clinician confirms this appointment. You will be issued a join
            link shortly before the appointment time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={availability.available ? "success" : "warning"}>{availability.label}</Badge>
        {sessionStatus ? <Badge variant="neutral">Session: {sessionStatus}</Badge> : null}
        {roomExpiry && sessionStatus && ["READY", "ACTIVE"].includes(sessionStatus) ? (
          <Badge variant="outline">Room closes {roomExpiry}</Badge>
        ) : null}
      </div>

      <p className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
        {notice || availability.notice}
      </p>

      {sessionStatus === "FAILED" ? (
        <p className="flex items-start gap-2 rounded-xl border border-emergency/40 bg-emergency-soft p-3.5 text-xs leading-relaxed text-emergency">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {sessionFailureReason ??
            "The video provider refused or failed, so no room was opened. The appointment itself is unaffected."}
        </p>
      ) : null}

      {ended ? (
        <p className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3.5 text-sm">
          <CircleCheck aria-hidden className="size-4 text-success" />
          This consultation room has been closed.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm font-medium text-emergency">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {link ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-medium">Your join link is ready</p>
          <p className="text-xs text-muted-foreground">
            It expires {formatConsultInstant(link.expiresAt) ?? "when the room closes"} and works only for you. Opening
            it exchanges it for a short-lived meeting token from the video provider.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {availability.available && !link.isSandbox ? (
              <Button asChild variant="gradient">
                <a href={link.linkUrl}>
                  <Video aria-hidden />
                  Open the secure room
                </a>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <a href={link.linkUrl}>Open the join page</a>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(link.linkUrl)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              <Copy aria-hidden />
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void issueLink(true)}>
              {busy === "reconnect" ? <LoaderCircle aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
              Reconnect
            </Button>
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void endConsultation()}>
              {busy === "end" ? <LoaderCircle aria-hidden className="animate-spin" /> : <LogOut aria-hidden />}
              End consultation
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="gradient"
            disabled={!canOpenRoom || busy !== null}
            onClick={() => void issueLink(false)}
          >
            {busy === "open" ? <LoaderCircle aria-hidden className="animate-spin" /> : <Video aria-hidden />}
            Open the consultation room
          </Button>
          {!canOpenRoom ? (
            <p className="text-xs text-muted-foreground">
              {joinWindow
                ? `The waiting room opens ${joinWindow}.`
                : "The waiting room is not open for this consultation yet."}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Opening the room asks the video provider to confirm it exists. Nothing is connected until you and the
              clinician actually join.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
