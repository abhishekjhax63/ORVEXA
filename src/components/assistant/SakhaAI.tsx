"use client";

/**
 * SakhaAI – Floating healthcare chatbot for ORVEXA.
 *
 * Architecture:
 *  - Floating launcher button (bottom-right, above SOS button).
 *  - Animated chat panel using Framer Motion (already a dependency).
 *  - Sends messages to /api/assistant/message (server-side, key never exposed).
 *  - Reduced-motion: MotionConfig in AppProviders already gates this globally.
 *  - Image responses: rendered when the API returns `images: string[]`.
 *  - Healthcare aware: disclaimer shown in empty state.
 */

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, SendHorizontal, Bot, RefreshCw, ChevronDown, Search, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Configurable name ───────────────────────────────────────────────────────
/** Change this string (or wire it to an env var) to rebrand the assistant. */
export const CHATBOT_NAME = "Sakha AI";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  imageAttached?: boolean;
  error?: boolean;
}

type ImageSearchResult = {
  title: string;
  source: string;
  thumbnailUrl: string;
  sourceUrl: string;
};

function isImageSearchResult(value: unknown): value is ImageSearchResult {
  if (!value || typeof value !== "object") return false;
  const image = value as Record<string, unknown>;
  if (
    typeof image.title !== "string" ||
    typeof image.source !== "string" ||
    typeof image.thumbnailUrl !== "string" ||
    typeof image.sourceUrl !== "string"
  ) {
    return false;
  }
  try {
    return new URL(image.thumbnailUrl).protocol === "https:" && new URL(image.sourceUrl).protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Suggested prompts ────────────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  "How do I book a doctor appointment?",
  "What are the emergency SOS steps?",
  "Find nearby hospitals",
  "How does telemedicine work?",
];

<<<<<<< HEAD
// ─── Image card ───────────────────────────────────────────────────────────────
// Image card – uses a plain <img> for provider-returned image URLs.
function ImageCard({ src, alt }: { src: string; alt: string }) {
=======
// ─── Image search result ──────────────────────────────────────────────────────
function ImageResultCard({ image }: { image: ImageSearchResult }) {
>>>>>>> 00c6be6 (Updated project features)
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  return (
    <a
      href={image.sourceUrl}
      target="_blank"
      rel="noreferrer noopener"
      className="overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {state === "error" ? (
        <div className="flex h-24 items-center justify-center px-2 text-xs text-muted-foreground">
          Image unavailable
        </div>
      ) : (
        // Remote provider thumbnails are dynamic hosts and are not configured for next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.thumbnailUrl}
          alt={image.title}
          loading="lazy"
          className={cn("h-24 w-full object-cover", state === "loading" && "animate-pulse bg-muted")}
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
        />
      )}
      <span className="block space-y-1 p-2">
        <span className="line-clamp-2 block text-xs font-medium">{image.title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">Source: {image.source}</span>
      </span>
    </a>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SakhaAI() {
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"chat" | "search">("chat");
  const [selectedImage, setSelectedImage] = useState<{ file: File; preview: string } | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<{ content: string; image: File | null } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ImageSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  useEffect(() => {
    return () => {
      if (selectedImage) URL.revokeObjectURL(selectedImage.preview);
    };
  }, [selectedImage]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (atBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && !minimised) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open, minimised]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    atBottomRef.current = nearBottom;
    setShowScrollBtn(!nearBottom);
  }

  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }

  function chooseImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setComposerError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setComposerError("Choose a non-empty image up to 5 MB.");
      return;
    }
    setComposerError(null);
    setSelectedImage({ file, preview: URL.createObjectURL(file) });
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image read failed")));
      reader.onerror = () => reject(new Error("Image read failed"));
      reader.readAsDataURL(file);
    });
  }

  async function sendMessage(text?: string, imageFile = selectedImage?.file ?? null, retry = false) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    setComposerError(null);
    setRetryRequest({ content, image: imageFile });
    if (!retry) {
      setMessages((prev) => [...prev, { role: "user", content, imageAttached: Boolean(imageFile) }]);
    }
    setLoading(true);
    atBottomRef.current = true;

    try {
      const res = await fetch(imageFile ? "/api/assistant/vision" : "/api/assistant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          imageFile
            ? { question: content, image: await fileToDataUrl(imageFile) }
            : { content },
        ),
      });

      const data = (await res.json().catch(() => null)) as
        | { reply?: unknown; error?: unknown }
        | null;
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              typeof data?.error === "string"
                ? data.error
                : "Sakha AI could not answer right now. Please try again.",
            error: true,
          },
        ]);
        return;
      }
      if (typeof data?.reply !== "string" || !data.reply.trim()) {
        throw new Error("Sakha AI did not return a response.");
      }
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.reply.trim(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setRetryRequest(null);
      setSelectedImage(null);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function retryLast() {
    if (retryRequest) {
      setMessages((prev) => {
        const copy = [...prev];
        const lastIdx = copy.map((m) => m.error).lastIndexOf(true);
        if (lastIdx !== -1) copy.splice(lastIdx, 1);
        return copy;
      });
      void sendMessage(retryRequest.content, retryRequest.image, true);
    }
  }

  async function searchImages(query = searchQuery) {
    const value = query.trim();
    if (!value || searchLoading) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const response = await fetch("/api/assistant/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: value }),
      });
      const data = (await response.json().catch(() => null)) as
        | { images?: unknown; error?: unknown }
        | null;
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Image search failed. Try again.");
      }
      setSearchResults(Array.isArray(data?.images) ? data.images.filter(isImageSearchResult) : []);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Image search failed. Try again.");
    } finally {
      setSearchLoading(false);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

// ─── Glowing launcher with gentle floating and shimmer effect ───────────────
  const launcher = (
    <motion.button
      key="launcher"
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: 1,
        y: [0, -6, 0],
      }}
      transition={{
        y: {
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        },
        scale: { type: "spring", stiffness: 300, damping: 20 },
      }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => { setOpen(true); setMinimised(false); }}
      aria-label={`Open ${CHATBOT_NAME}`}
      className={cn(
        // Position: bottom-right, comfortable elevation above mobile navbars
        "fixed bottom-6 right-6 z-40 sm:bottom-8 sm:right-8",
        "flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full",
        "bg-gradient-to-tr from-teal-600 via-cyan-600 to-teal-500 text-white",
        // Glowing border effect
        "ring-2 ring-cyan-300/60 shadow-[0_0_24px_rgba(6,182,212,0.45)]",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/50",
        "overflow-hidden cursor-pointer",
      )}
    >
      <Bot className="h-7 w-7 text-white drop-shadow" aria-hidden />

      {/* Shimmer sweep animation */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-full h-[200%] w-[200%] rotate-45 bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform animate-[shimmer_3.5s_infinite] motion-reduce:hidden"
      />

      {/* Subtle pulsing aura */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-cyan-400/50 animate-ping opacity-30 motion-reduce:hidden"
        style={{ animationDuration: "3s" }}
      />
    </motion.button>
  );

  // ─── Chat panel ───────────────────────────────────────────────────────────
  const panel = (
    <motion.div
      key="panel"
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className={cn(
        "fixed z-50",
        // Mobile: full-width bottom sheet
        "bottom-0 right-0 left-0",
        // Desktop: floating panel
        "sm:bottom-6 sm:right-6 sm:left-auto sm:w-[380px]",
        "flex flex-col bg-background border border-border/60",
        "rounded-t-2xl sm:rounded-2xl shadow-2xl",
        // Glowing border
        "ring-1 ring-primary/20",
        minimised ? "h-14" : "h-[520px] sm:h-[560px]",
        "overflow-hidden transition-[height] duration-200",
      )}
      role="dialog"
      aria-label={`${CHATBOT_NAME} chat`}
      aria-modal="false"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/20">
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{CHATBOT_NAME}</p>
          <p className="text-[11px] opacity-70 leading-tight">
            {loading ? "Working…" : "Healthcare information · Not a diagnosis"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full hover:bg-primary-foreground/20 text-primary-foreground"
          onClick={() => setMinimised((m) => !m)}
          aria-label={minimised ? "Restore chat" : "Minimise chat"}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full hover:bg-primary-foreground/20 text-primary-foreground"
          onClick={() => setOpen(false)}
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body – hidden when minimised */}
      {!minimised && (
        <>
          <div className="flex shrink-0 gap-2 border-b p-2" role="tablist" aria-label="Sakha AI modes">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "chat"}
              onClick={() => setMode("chat")}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                mode === "chat" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              Chat
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "search"}
              onClick={() => setMode("search")}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                mode === "search" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              Image search
            </button>
          </div>

          {mode === "search" ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Search educational illustrations, anatomy, medical equipment, and general images. Image rights remain
                  with their creators; check the source terms before reuse.
                </p>
                {searchLoading ? (
                  <div className="mt-4 grid grid-cols-2 gap-3" aria-label="Searching images" aria-live="polite">
                    {Array.from({ length: 6 }, (_, index) => (
                      <div key={index} className="h-36 animate-pulse rounded-xl bg-muted" />
                    ))}
                  </div>
                ) : searchError ? (
                  <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm" role="alert">
                    <p>{searchError}</p>
                    <button
                      type="button"
                      onClick={() => void searchImages()}
                      className="mt-2 flex items-center gap-1 text-xs font-medium underline"
                    >
                      <RefreshCw className="size-3" aria-hidden /> Retry search
                    </button>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {searchResults.map((image) => (
                      <ImageResultCard key={`${image.sourceUrl}-${image.thumbnailUrl}`} image={image} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    Enter a query to find image results. Search requires an image-search provider configured by the site
                    operator.
                  </p>
                )}
              </div>
              <form
                className="flex shrink-0 gap-2 border-t bg-muted/30 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchImages();
                }}
              >
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  maxLength={160}
                  placeholder="Search images…"
                  aria-label="Search images"
                  className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  disabled={searchLoading}
                />
                <Button type="submit" disabled={searchLoading || !searchQuery.trim()} size="icon" aria-label="Search images">
                  <Search aria-hidden />
                </Button>
              </form>
            </>
          ) : (
            <>
              {/* Messages */}
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth"
              >
                {messages.length === 0 && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Hi! I&apos;m <strong>{CHATBOT_NAME}</strong>. I can help you navigate ORVEXA, answer general healthcare questions, and find features.
                    </p>
                    <p className="text-xs text-muted-foreground/70 italic">
                      I provide general information only—not a diagnosis. For emergencies, call 108 or seek urgent care.
                    </p>
                    <div className="space-y-1 pt-1">
                      <p className="text-xs font-medium text-muted-foreground">Suggested:</p>
                      {SUGGESTED_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => void sendMessage(prompt, null)}
                          className="block w-full rounded-lg border border-border/50 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                        msg.role === "user"
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : msg.error
                            ? "rounded-bl-sm border border-destructive/20 bg-destructive/10 text-destructive"
                            : "rounded-bl-sm bg-muted text-foreground",
                      )}
                    >
                      {msg.content.split("\n").map((line, li) => (
                        <p key={li} className={li > 0 ? "mt-1" : undefined}>{line}</p>
                      ))}
                      {msg.imageAttached && <p className="mt-1 text-xs opacity-80">Image attached</p>}
                      {msg.error && (
                        <button
                          onClick={retryLast}
                          className="mt-1 flex items-center gap-1 text-xs underline hover:no-underline"
                        >
                          <RefreshCw className="size-3" /> Retry
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start" aria-live="polite" aria-label="Sakha AI is responding">
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-4 py-2">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="block size-2 animate-bounce rounded-full bg-muted-foreground/50"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <AnimatePresence>
                {showScrollBtn && (
                  <motion.button
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    onClick={scrollToBottom}
                    aria-label="Scroll to latest message"
                    className="absolute bottom-20 right-4 z-10 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
                  >
                    <ChevronDown className="size-4" />
                  </motion.button>
                )}
              </AnimatePresence>

              <div className="shrink-0 border-t bg-muted/30 p-3">
                {selectedImage ? (
                  <div className="mb-2 flex items-center gap-3 rounded-xl border bg-background p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedImage.preview} alt="Selected image preview" className="size-14 rounded-lg object-cover" />
                    <span className="min-w-0 flex-1 truncate text-xs">{selectedImage.file.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedImage(null)}
                      className="rounded-full p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label="Remove attached image"
                      disabled={loading}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                ) : null}
                {composerError ? <p className="mb-2 text-xs text-destructive" role="alert">{composerError}</p> : null}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={chooseImage}
                  className="sr-only"
                  aria-label="Choose an image to ask Sakha AI about"
                />
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={loading}
                    aria-label="Attach an image"
                    title="Attach an image"
                  >
                    <ImagePlus aria-hidden />
                  </Button>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    onKeyDown={handleKey}
                    disabled={loading}
                    placeholder={selectedImage ? "Ask about this image…" : "Type a message… (Enter to send)"}
                    aria-label="Chat message input"
                    className={cn(
                      "min-h-[40px] max-h-[120px] min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-input bg-background px-3 py-2 text-sm",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      "disabled:opacity-50",
                    )}
                  />
                  <Button
                    onClick={() => void sendMessage()}
                    disabled={loading || !input.trim()}
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-xl"
                    aria-label="Send message"
                  >
                    <SendHorizontal aria-hidden />
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </motion.div>
  );

  return (
    <AnimatePresence mode="wait">
      {open ? panel : launcher}
    </AnimatePresence>
  );
}
