"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, Paperclip, RefreshCw, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatConsultInstant } from "@/lib/telemedicine/format";
import { CONSULTATION_MESSAGE_KIND_COPY } from "@/lib/telemedicine/labels";
import { cn } from "@/lib/utils";

/**
 * The clinician–patient chat for one consultation.
 *
 * The chat is part of the consultation record: it is readable only by the two
 * parties and its window is derived from the appointment on the server, so
 * nothing here can extend it. An instruction written in chat is presented as an
 * instruction — never as a prescription.
 */

/**
 * One message as the chat route returns it.
 *
 * `senderUserId`, `senderRole` and `senderLabel` are nullable because a
 * platform-written `SYSTEM` notice has no human author — the type says so
 * rather than pretending every row has one.
 */
export type ChatMessage = {
  id: string;
  senderUserId: string | null;
  senderRole: string | null;
  senderLabel: string | null;
  kind: string;
  body: string;
  attachmentName: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
};

type Props = {
  appointmentId: string;
  party: "PATIENT" | "CLINICIAN";
  viewerUserId: string;
  counterpartLabel: string;
  isOpen: boolean;
  closesAtIso: string | null;
  closedReason: string | null;
  notice: string;
  initialMessages: ChatMessage[];
};

type Attachment = { key: string; fileName: string; malwareScan: string; malwareScanDetail: string };

export function ConsultationChat({
  appointmentId,
  viewerUserId,
  counterpartLabel,
  isOpen,
  closesAtIso,
  closedReason,
  notice,
  initialMessages,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/telemedicine/${encodeURIComponent(appointmentId)}/chat`);
    if (!response.ok) return;
    const payload = (await response.json().catch(() => null)) as { chat?: { messages?: ChatMessage[] } } | null;
    if (payload?.chat?.messages) setMessages(payload.chat.messages);
    void fetch(`/api/telemedicine/${encodeURIComponent(appointmentId)}/chat/read`, { method: "POST" });
  }, [appointmentId]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, [isOpen, refresh]);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === "function") {
      endRef.current.scrollIntoView({ block: "end" });
    }
  }, [messages.length]);

  async function send(body: string, attachment?: Attachment) {
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/telemedicine/${encodeURIComponent(appointmentId)}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appointmentId,
          kind: attachment ? "ATTACHMENT" : "TEXT",
          body,
          attachmentKey: attachment?.key,
          attachmentName: attachment?.fileName,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: ChatMessage; error?: string }
        | null;
      if (!response.ok || !payload?.ok || !payload.message) {
        setError(payload?.error ?? "That message could not be sent.");
        return false;
      }
      setMessages((current) => [...current, payload.message as ChatMessage]);
      return true;
    } catch {
      setError("That message could not be sent. Check your connection and try again.");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function uploadAndSend() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setScanNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `/api/telemedicine/${encodeURIComponent(appointmentId)}/chat/attachments`,
        { method: "POST", body: form },
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; attachment?: Attachment; error?: string }
        | null;
      if (!response.ok || !payload?.ok || !payload.attachment) {
        setError(payload?.error ?? "That file could not be attached.");
        return;
      }
      setScanNotice(
        payload.attachment.malwareScan === "CLEAN"
          ? "The file was scanned and cleared before it was stored."
          : payload.attachment.malwareScan === "SKIPPED"
            ? "No malware scanner is configured here, so the file was stored without a scan."
            : `Scan verdict: ${payload.attachment.malwareScan}.`,
      );
      const sent = await send(draft.trim() || payload.attachment.fileName, payload.attachment);
      if (sent) {
        setDraft("");
        if (fileRef.current) fileRef.current.value = "";
      }
    } finally {
      setUploading(false);
    }
  }

  async function openAttachment(message: ChatMessage) {
    setError(null);
    const response = await fetch(
      `/api/telemedicine/${encodeURIComponent(appointmentId)}/chat/attachments/${encodeURIComponent(message.id)}`,
    );
    const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response.ok || !payload?.url) {
      setError(payload?.error ?? "That file could not be opened.");
      return;
    }
    window.open(payload.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <p className="text-sm font-semibold">Chat with {counterpartLabel}</p>
          <p className="text-xs text-muted-foreground">
            {isOpen
              ? closesAtIso
                ? `Open until ${formatConsultInstant(closesAtIso)}`
                : "Open"
              : "Closed"}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => void refresh()} aria-label="Refresh chat">
          <RefreshCw aria-hidden />
        </Button>
      </div>

      <p className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
        {notice}
      </p>

      <div className="max-h-96 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((message) => {
            const mine = message.senderUserId === viewerUserId;
            const copy = CONSULTATION_MESSAGE_KIND_COPY[
              message.kind as keyof typeof CONSULTATION_MESSAGE_KIND_COPY
            ];
            return (
              <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-sm",
                    mine ? "border-primary/30 bg-primary-soft" : "border-border bg-background",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 pb-1">
                    <span className="text-xs font-semibold">{message.senderLabel ?? "ORVEXA"}</span>
                    {copy ? <Badge variant={copy.tone}>{copy.label}</Badge> : null}
                    <span className="text-[0.65rem] text-muted-foreground">
                      {formatConsultInstant(message.createdAt)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
                  {message.kind === "ATTACHMENT" ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="mt-1 justify-start px-0"
                      onClick={() => void openAttachment(message)}
                    >
                      <Paperclip aria-hidden />
                      {message.attachmentName ?? "Attachment"}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 px-4 pb-2 text-sm font-medium text-emergency">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      {scanNotice ? (
        <p className="px-4 pb-2 text-xs text-muted-foreground">{scanNotice}</p>
      ) : null}

      {isOpen ? (
        <div className="space-y-3 border-t border-border p-4">
          <label htmlFor="consultation-message" className="sr-only">
            Message
          </label>
          <Textarea
            id="consultation-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={4000}
            placeholder="Write a message. Do not share information you would not want in your consultation record."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={sending || draft.trim().length === 0}
              onClick={() => {
                void send(draft.trim()).then((sent) => {
                  if (sent) setDraft("");
                });
              }}
            >
              {sending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              Send
            </Button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={() => void uploadAndSend()}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <LoaderCircle aria-hidden className="animate-spin" /> : <Paperclip aria-hidden />}
              Attach a file
            </Button>
          </div>
        </div>
      ) : (
        <p className="border-t border-border p-4 text-sm text-muted-foreground">
          {closedReason ?? "This consultation's chat is closed. Messages already sent stay readable."}
        </p>
      )}
    </div>
  );
}
