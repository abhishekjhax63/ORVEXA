import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/guards";
import { getAiProvider } from "@/lib/ai/service";
import { sniffContainerType } from "@/lib/ai/validation";
import { readLimitedRequestText } from "@/lib/security/request-body";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 7 * 1024 * 1024;
const MIME_CONTAINER: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to use Sakha AI." }, { status: 401 });

  const limit = await consumeRateLimit("aiTurn", `user:${user.id}`, RATE_LIMITS.aiTurn);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Sakha AI is handling a lot of requests from your account. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Image is too large. Choose an image up to 5 MB." }, { status: 413 });
  }

  let body: unknown;
  try {
    const result = await readLimitedRequestText(request, MAX_BODY_BYTES);
    if (!result.ok) {
      return NextResponse.json({ error: "Image is too large. Choose an image up to 5 MB." }, { status: 413 });
    }
    body = JSON.parse(result.text);
  } catch {
    return NextResponse.json({ error: "Send a valid image question." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Send a valid image question." }, { status: 400 });
  }

  const { question, image } = body as { question?: unknown; image?: unknown };
  if (typeof question !== "string" || !question.trim() || question.trim().length > 2000) {
    return NextResponse.json({ error: "Add a question of up to 2,000 characters." }, { status: 400 });
  }
  if (typeof image !== "string") {
    return NextResponse.json({ error: "Attach a JPEG, PNG, or WebP image." }, { status: 400 });
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match) {
    return NextResponse.json({ error: "That image format is not supported. Use JPEG, PNG, or WebP." }, { status: 415 });
  }

  const mimeType = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Choose a non-empty image up to 5 MB." }, { status: 413 });
  }
  if (bytes.toString("base64") !== match[2]) {
    return NextResponse.json({ error: "That image could not be decoded. Choose a valid JPEG, PNG, or WebP file." }, { status: 415 });
  }
  if (sniffContainerType(bytes.subarray(0, 64)) !== MIME_CONTAINER[mimeType]) {
    return NextResponse.json({ error: "The image contents do not match its file type." }, { status: 415 });
  }

  const provider = getAiProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Image understanding is unavailable. Configure the server-side AI provider and vision model." },
      { status: 503 },
    );
  }
  if (!provider.supports("VISION_IMAGE")) {
    return NextResponse.json({ error: "The configured AI provider cannot analyse images." }, { status: 503 });
  }

  const result = await provider.visionQuestion({
    question: question.trim(),
    mimeType,
    dataUrl: image,
  });
  if (!result.result.ok) {
    const error = result.result.error;
    const status = error.kind === "rate_limited" ? 429 : error.kind === "timeout" ? 504 : 502;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ reply: result.result.data.text });
}
