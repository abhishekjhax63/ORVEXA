import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

/**
 * POST /api/assistant/message
 *
 * Body:    { content: string }
 * Returns: { reply: string; images?: string[] }
 *
 * Provider: BluesMinds (OpenAI-compatible API)
 * Base URL: https://api.bluesminds.com/v1
 * Model:    openai/gpt-oss-20b
 *
 * SECURITY
 * ─────────
 * • The API key is read only from `BLUESMINDS_API_KEY` (server-side env).
 * • It is never logged, returned in responses, or exposed to the browser.
 * • `NEXT_PUBLIC_*` variables are NOT used for credentials.
 */

const BLUESMINDS_BASE_URL =
  process.env.BLUESMINDS_BASE_URL ?? "https://api.bluesminds.com/v1";
const BLUESMINDS_MODEL =
  process.env.BLUESMINDS_MODEL ?? "openai/gpt-oss-20b";

/** Maximum characters accepted per message to guard against abuse. */
const MAX_MESSAGE_LENGTH = 2000;

/**
 * System prompt shaping Sakha AI's healthcare assistant persona.
 * Adjust without code changes by setting SAKHA_SYSTEM_PROMPT env var.
 */
const SYSTEM_PROMPT =
  process.env.SAKHA_SYSTEM_PROMPT ??
  `You are Sakha AI, the friendly healthcare assistant for ORVEXA — India's integrated health platform.
You help users navigate ORVEXA's features: hospital search, doctor appointments, diagnostics, pharmacy, insurance, and telemedicine.
You provide general health education and guidance. You do NOT diagnose medical conditions or replace a qualified clinician.
For emergencies, always direct the user to call emergency services or use the ORVEXA SOS button.
Keep answers clear, warm, and concise. Never make up clinical facts.`;

export async function POST(request: Request) {
<<<<<<< HEAD
  // ── Authentication / Guest session ─────────────────────────────────────────
  // Sakha AI assists both registered users and new visitors navigating ORVEXA.
  const user = await getCurrentUser().catch(() => null);
=======
  // ── Authentication ───────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to use Sakha AI." }, { status: 401 });
  }
>>>>>>> 00c6be6 (Updated project features)

  // ── Parse and validate body ──────────────────────────────────────────────
  let content: string;
  try {
    const body = await request.json();
    content = typeof body?.content === "string" ? body.content.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!content) {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
      { status: 400 },
    );
  }

  // ── Check API key ────────────────────────────────────────────────────────
  const apiKey = process.env.BLUESMINDS_API_KEY;
  if (!apiKey) {
<<<<<<< HEAD
    return NextResponse.json({
      reply:
        "Sakha AI is not yet configured on this deployment. Please set the BLUESMINDS_API_KEY environment variable.",
    });
=======
    return NextResponse.json(
      { error: "Sakha AI is not configured on this deployment." },
      { status: 503 },
    );
  }

  const limit = await consumeRateLimit("aiTurn", `user:${user.id}`, RATE_LIMITS.aiTurn);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Sakha AI is handling a lot of requests from your account. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
>>>>>>> 00c6be6 (Updated project features)
  }

  // ── Call the BluesMinds API ───────────────────────────────────────────────
  try {
    const userContext = user ? ` (User: ${user.fullName})` : "";
    const response = await fetch(`${BLUESMINDS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: BLUESMINDS_MODEL,
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}${userContext}` },
          { role: "user", content },
        ],
        // gpt-oss-20b generates reasoning tokens first; 1500 gives ample headroom
        max_tokens: 1500,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    // ── Handle provider-level errors ───────────────────────────────────────
    if (response.status === 401) {
      console.error("[SakhaAI] Authentication failed with BluesMinds API");
      return NextResponse.json(
        { error: "AI provider authentication failed" },
        { status: 502 },
      );
    }
    if (response.status === 429) {
      return NextResponse.json(
        { error: "Sakha AI is receiving many requests right now. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": "30" } },
      );
    }
    if (!response.ok) {
      console.error(`[SakhaAI] Provider returned HTTP ${response.status}`);
      return NextResponse.json(
<<<<<<< HEAD
        { reply: "Sakha AI encountered an error from the provider. Please try again." },
        { status: 200 },
=======
        { error: "Sakha AI encountered an error. Please try again." },
        { status: 502 },
>>>>>>> 00c6be6 (Updated project features)
      );
    }

    // ── Parse the OpenAI-compatible response ───────────────────────────────
<<<<<<< HEAD
    const data = await response.json();
    const choice = data?.choices?.[0];
    const rawContent: string | null = choice?.message?.content;
    const reasoningContent: string | null = choice?.message?.reasoning_content ?? choice?.message?.reasoning;
=======
    const data = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const reply = data.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      return NextResponse.json(
        { error: "Sakha AI did not return a response. Please try again." },
        { status: 502 },
      );
    }
>>>>>>> 00c6be6 (Updated project features)

    // Use content if available; fallback if empty
    let reply = (rawContent && rawContent.trim()) ? rawContent.trim() : "";
    if (!reply && reasoningContent && reasoningContent.trim()) {
      reply = reasoningContent.trim();
    }
    if (!reply) {
      reply = "I'm here to help you navigate ORVEXA. Please ask any question about hospitals, doctors, medicine delivery, or emergency care!";
    }

<<<<<<< HEAD
    // Image support: parse any images returned in the message payload or embedded in markdown
    const images: { url: string; alt?: string }[] = [];

    // 1. Check if provider returned structured images in message
    if (Array.isArray(choice?.message?.images)) {
      for (const img of choice.message.images) {
        if (typeof img === "string" && img.startsWith("http")) {
          images.push({ url: img, alt: "Medical visual reference" });
        } else if (img && typeof img === "object" && typeof img.url === "string") {
          images.push({ url: img.url, alt: img.alt || "Medical visual reference" });
        }
      }
    }

    // 2. Extract markdown images: ![alt](url)
    const mdImageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s\)]+)\)/g;
    let match;
    while ((match = mdImageRegex.exec(reply)) !== null) {
      images.push({ url: match[2], alt: match[1] || "Reference image" });
    }

    return NextResponse.json({
      reply,
      images: images.length > 0 ? images.map((i) => i.url) : undefined,
    });
=======
    return NextResponse.json({ reply: reply.trim(), images });
>>>>>>> 00c6be6 (Updated project features)
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Sakha AI took too long to respond. Please try again." },
        { status: 504 },
      );
    }
    console.error("[SakhaAI] Provider request failed", err instanceof Error ? err.name : "unknown error");
    return NextResponse.json(
      { error: "Sakha AI could not be reached. Please try again." },
      { status: 502 },
    );
  }
}
