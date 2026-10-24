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
import { X, Minus, SendHorizontal, Bot, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Configurable name ───────────────────────────────────────────────────────
/** Change this string (or wire it to an env var) to rebrand the assistant. */
export const CHATBOT_NAME = "Sakha AI";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Image URLs returned by the provider – rendered only when present. */
  images?: string[];
  error?: boolean;
}

// ─── Suggested prompts ────────────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  "How do I book a doctor appointment?",
  "What are the emergency SOS steps?",
  "Find nearby hospitals",
  "How does telemedicine work?",
];

// ─── Image card ───────────────────────────────────────────────────────────────
// Image card – uses a plain <img> for provider-returned image URLs.
function ImageCard({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  return (
    <div className="mt-2 rounded-lg overflow-hidden border bg-muted/40">
      {state === "error" ? (
        <div className="flex items-center justify-center h-20 text-xs text-muted-foreground px-2">
          Image unavailable
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={cn("w-full object-contain max-h-48 transition-opacity", state === "loading" && "opacity-0")}
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
        />
      )}
      {state === "loading" && (
        <div className="h-20 animate-pulse bg-muted" />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SakhaAI() {
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

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

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    const userMsg: ChatMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    atBottomRef.current = true;

    try {
      const res = await fetch("/api/assistant/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.reply ?? "No response received.",
        images: Array.isArray(data.images) ? data.images : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
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
    // Find the last user message and re-send it
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      // Remove the last error assistant message
      setMessages((prev) => {
        const copy = [...prev];
        const lastIdx = copy.map((m) => m.error).lastIndexOf(true);
        if (lastIdx !== -1) copy.splice(lastIdx, 1);
        return copy;
      });
      sendMessage(lastUser.content);
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
            {loading ? "Typing…" : "Healthcare assistant · Demo mode"}
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
                  ⚕️ I provide general information only — not medical diagnosis. For emergencies, use the SOS button.
                </p>
                <div className="pt-1 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Suggested:</p>
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="block w-full text-left rounded-lg border border-border/50 px-3 py-2 text-sm hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : msg.error
                        ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-sm"
                        : "bg-muted text-foreground rounded-bl-sm",
                  )}
                >
                  {msg.content.split("\n").map((line, li) => (
                    <p key={li} className={li > 0 ? "mt-1" : undefined}>{line}</p>
                  ))}
                  {msg.images && msg.images.map((src, ii) => (
                    <ImageCard key={ii} src={src} alt={`Response image ${ii + 1}`} />
                  ))}
                  {msg.error && (
                    <button
                      onClick={retryLast}
                      className="mt-1 flex items-center gap-1 text-xs underline hover:no-underline"
                    >
                      <RefreshCw className="h-3 w-3" /> Retry
                    </button>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2 flex gap-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="block h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Scroll-to-bottom button */}
          <AnimatePresence>
            {showScrollBtn && (
              <motion.button
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                onClick={scrollToBottom}
                aria-label="Scroll to latest message"
                className="absolute bottom-20 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
              >
                <ChevronDown className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Input */}
          <div className="shrink-0 border-t bg-muted/30 p-3 flex gap-2 items-end">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-grow up to ~5 rows
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKey}
              disabled={loading}
              placeholder="Type a message… (Enter to send)"
              aria-label="Chat message input"
              className={cn(
                "flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                "disabled:opacity-50 min-h-[40px] max-h-[120px] overflow-y-auto",
              )}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              size="icon"
              className="shrink-0 rounded-xl h-10 w-10"
              aria-label="Send message"
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </div>
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
