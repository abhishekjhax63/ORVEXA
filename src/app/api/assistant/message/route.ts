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
  // ── Authentication ───────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

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
    // Inform the user without revealing server internals.
    return NextResponse.json({
      reply:
        "Sakha AI is not yet configured on this deployment. Please add the BLUESMINDS_API_KEY environment variable.",
    });
  }

  // ── Call the BluesMinds API ───────────────────────────────────────────────
  try {
    const response = await fetch(`${BLUESMINDS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: BLUESMINDS_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
        // Reasonable defaults – no streaming for now so the whole response is
        // received before we return it to the client.
        max_tokens: 512,
        temperature: 0.7,
      }),
      // 30-second timeout via AbortSignal
      signal: AbortSignal.timeout(30_000),
    });

    // ── Handle provider-level errors ───────────────────────────────────────
    if (response.status === 401) {
      // Do NOT echo the key or any token detail.
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
        { reply: "Sakha AI encountered an error. Please try again." },
        { status: 200 },
      );
    }

    // ── Parse the OpenAI-compatible response ───────────────────────────────
    const data = await response.json();
    const reply: string =
      data?.choices?.[0]?.message?.content?.trim() ??
      "No response received from Sakha AI.";

    // Image support: the current BluesMinds model (gpt-oss-20b) is a text
    // model and does not return image URLs. If a future model adds image
    // content parts, parse them here. For now we pass an empty array so the
    // UI is ready for it.
    const images: string[] = [];

    return NextResponse.json({ reply, images });
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
