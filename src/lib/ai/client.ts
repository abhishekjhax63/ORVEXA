import type { UnavailableStateView } from "@/lib/ai/view";

/**
 * The browser side of the AI endpoints.
 *
 * Client-safe and deliberately thin: it turns the endpoints' `{ ok: true, … }`
 * / `{ ok: false, error }` envelope into a discriminated result, and it never
 * decides anything medical. Every rule about what an assessment may contain
 * lives on the server; this module only carries it back.
 *
 * A network failure is reported as a failure. There is no offline queue and no
 * cached assessment, because a stale or invented medical answer is worse than
 * an honest "could not reach the assistant".
 */

export type AiApiFailure = {
  ok: false;
  status: number;
  error: string;
  fieldErrors?: Record<string, string>;
  retryAfterSeconds?: number;
  /** Present on a 503: the assistant could not run, with the honesty panel. */
  unavailable?: UnavailableStateView;
};

export type AiApiResult<T> = { ok: true; data: T } | AiApiFailure;

const NETWORK_FAILURE: AiApiFailure = {
  ok: false,
  status: 0,
  error: "The request could not be sent. Check your connection and try again.",
};

async function readResponse<T>(response: Response): Promise<AiApiResult<T>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, status: response.status, error: "The assistant returned a response that could not be read." };
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  if (response.ok && body.ok === true) {
    return { ok: true, data: body as T };
  }

  return {
    ok: false,
    status: response.status,
    error: typeof body.error === "string" ? body.error : "That request could not be completed.",
    fieldErrors: (body.fieldErrors as Record<string, string> | undefined) ?? undefined,
    retryAfterSeconds: typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : undefined,
    unavailable: body.unavailable as UnavailableStateView | undefined,
  };
}

export async function postAiJson<T>(url: string, body: unknown): Promise<AiApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return await readResponse<T>(response);
  } catch {
    return NETWORK_FAILURE;
  }
}

export async function postAiForm<T>(url: string, form: FormData): Promise<AiApiResult<T>> {
  try {
    const response = await fetch(url, { method: "POST", body: form });
    return await readResponse<T>(response);
  } catch {
    return NETWORK_FAILURE;
  }
}

export async function deleteAi<T>(url: string, body?: unknown): Promise<AiApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: "DELETE",
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    return await readResponse<T>(response);
  } catch {
    return NETWORK_FAILURE;
  }
}
