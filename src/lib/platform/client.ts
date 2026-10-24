/**
 * The browser side of the console API routes.
 *
 * Client-safe and deliberately thin: it turns the endpoints' `{ ok: true, … }`
 * envelope into a discriminated result and carries the server's refusal back
 * to the form verbatim. It decides nothing — every permission check, rate
 * limit and validation rule lives on the server, and a 401/403/429 that comes
 * back is shown to the operator rather than swallowed.
 *
 * There is no optimistic path. An approval that has not been accepted by the
 * server has not happened, and the console must never imply otherwise.
 */

export type ConsoleApiFailure = {
  ok: false;
  status: number;
  error: string;
  fieldErrors?: Record<string, string>;
  retryAfterSeconds?: number;
};

export type ConsoleApiResult<T> = { ok: true; data: T } | ConsoleApiFailure;

const NETWORK_FAILURE: ConsoleApiFailure = {
  ok: false,
  status: 0,
  error: "The request could not be sent. Check your connection and try again.",
};

async function readResponse<T>(response: Response): Promise<ConsoleApiResult<T>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      status: response.status,
      error: "The server returned a response that could not be read.",
    };
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  if (response.ok && body.ok === true) return { ok: true, data: body as T };

  return {
    ok: false,
    status: response.status,
    error: typeof body.error === "string" ? body.error : "That request could not be completed.",
    fieldErrors: (body.fieldErrors as Record<string, string> | undefined) ?? undefined,
    retryAfterSeconds: typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : undefined,
  };
}

export async function postConsoleJson<T>(url: string, body?: unknown): Promise<ConsoleApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: "POST",
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    return await readResponse<T>(response);
  } catch {
    return NETWORK_FAILURE;
  }
}

export async function deleteConsoleJson<T>(url: string): Promise<ConsoleApiResult<T>> {
  try {
    return await readResponse<T>(await fetch(url, { method: "DELETE" }));
  } catch {
    return NETWORK_FAILURE;
  }
}
