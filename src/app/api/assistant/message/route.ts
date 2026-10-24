import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";

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
  // ── Authentication / Guest session ─────────────────────────────────────────
  // Sakha AI assists both registered users and new visitors navigating ORVEXA.
  const user = await getCurrentUser().catch(() => null);

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
    return NextResponse.json({
      reply:
        "Sakha AI is not yet configured on this deployment. Please set the BLUESMINDS_API_KEY environment variable.",
    });
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
        { reply: "Sakha AI is receiving many requests right now. Please try again in a moment." },
        { status: 200 },
      );
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(`[SakhaAI] Provider error ${response.status}: ${text.slice(0, 200)}`);
      return NextResponse.json(
        { reply: "Sakha AI encountered an error from the provider. Please try again." },
        { status: 200 },
      );
    }

    // ── Parse the OpenAI-compatible response ───────────────────────────────
    const data = await response.json();
    const choice = data?.choices?.[0];
    const rawContent: string | null = choice?.message?.content;
    const reasoningContent: string | null = choice?.message?.reasoning_content ?? choice?.message?.reasoning;

    // Use content if available; fallback if empty
    let reply = (rawContent && rawContent.trim()) ? rawContent.trim() : "";
    if (!reply && reasoningContent && reasoningContent.trim()) {
      reply = reasoningContent.trim();
    }
    if (!reply) {
      reply = "I'm here to help you navigate ORVEXA. Please ask any question about hospitals, doctors, medicine delivery, or emergency care!";
    }

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
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json(
        { reply: "Sakha AI took too long to respond. Please try again." },
        { status: 200 },
      );
    }
    // Generic network or parse error – do not leak details.
    console.error("[SakhaAI] Unexpected error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { reply: "Something went wrong. Please try again." },
      { status: 200 },
    );
  }
}
