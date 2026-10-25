import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/guards";
import { optionalEnv } from "@/lib/env";
import { readLimitedRequestText } from "@/lib/security/request-body";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

const BRAVE_IMAGE_SEARCH_URL = "https://api.search.brave.com/res/v1/images/search";

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to use Sakha AI image search." }, { status: 401 });

  const limit = await consumeRateLimit("aiImageSearch", `user:${user.id}`, RATE_LIMITS.aiImageSearch);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Image search is receiving many requests from your account. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let query: unknown;
  try {
    const text = await readLimitedRequestText(request, 8 * 1024);
    if (!text.ok) return NextResponse.json({ error: "Search query is too long." }, { status: 413 });
    const body = JSON.parse(text.text) as { query?: unknown };
    query = body.query;
  } catch {
    return NextResponse.json({ error: "Send a valid image search query." }, { status: 400 });
  }
  if (typeof query !== "string" || !query.trim() || query.trim().length > 160) {
    return NextResponse.json({ error: "Enter a search of up to 160 characters." }, { status: 400 });
  }

  const provider = optionalEnv("IMAGE_SEARCH_PROVIDER")?.toLowerCase();
  const apiKey = optionalEnv("IMAGE_SEARCH_API_KEY");
  if (provider !== "brave" || !apiKey) {
    return NextResponse.json(
      { error: "Image search is not configured. The site operator must configure the server-side Brave image-search provider." },
      { status: 503 },
    );
  }

  const url = new URL(BRAVE_IMAGE_SEARCH_URL);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("count", "12");
  url.searchParams.set("safesearch", "moderate");
  url.searchParams.set("country", "IN");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return NextResponse.json({ error: "Image search could not reach its provider. Try again." }, { status: 502 });
  }

  if (response.status === 429) {
    return NextResponse.json(
      { error: "The image-search provider is rate-limiting requests. Try again later." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }
  if (!response.ok) {
    console.error(`[SakhaAI] Image-search provider returned HTTP ${response.status}`);
    return NextResponse.json({ error: "Image search failed at its provider. Try again later." }, { status: 502 });
  }

  let results: unknown[];
  try {
    const data = (await response.json()) as { results?: unknown };
    results = Array.isArray(data.results) ? data.results : [];
  } catch {
    return NextResponse.json({ error: "Image search returned an unreadable response." }, { status: 502 });
  }

  const images = results
    .map((item) => {
      const result = asRecord(item);
      if (!result) return null;
      const thumbnail = asRecord(result.thumbnail);
      const metaUrl = asRecord(result.meta_url);
      const thumbnailUrl = safeHttpsUrl(thumbnail?.src);
      const sourceUrl = safeHttpsUrl(result.page_fetched) ??
        (typeof metaUrl?.netloc === "string"
          ? safeHttpsUrl(`${typeof metaUrl.scheme === "string" ? metaUrl.scheme : "https"}://${metaUrl.netloc}`)
          : null);
      if (!thumbnailUrl || !sourceUrl) return null;
      return {
        title: typeof result.title === "string" ? result.title.slice(0, 240) : "Image result",
        source: typeof result.source === "string" ? result.source.slice(0, 120) : new URL(sourceUrl).hostname,
        thumbnailUrl,
        sourceUrl,
      };
    })
    .filter((image): image is NonNullable<typeof image> => image !== null)
    .slice(0, 12);

  return NextResponse.json({ images });
}
