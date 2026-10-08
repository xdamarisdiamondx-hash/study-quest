/**
 * The fetch wrapper that turns a failed edit into a queued one (P20).
 *
 * Scope, deliberately narrow: **edits and removals** (PUT / PATCH / DELETE) to
 * this origin's API are filed in the outbox when the network itself fails —
 * fetch rejecting *or* a gateway answering 500/502/503/504, which at the
 * client is the same event: the write did not land and we cannot know more.
 * They are answered with a synthetic 202 so the student keeps working. All
 * three methods are idempotent (a replay re-derives the same final state), so
 * re-sending after the server recovers is safe even if it had applied the
 * write before dying. Creates and actions (POST) stay online-only: they return
 * ids, XP and server-made decisions the UI cannot honestly fabricate, and a
 * queued create would invent an id the student's data never had. Every API
 * response is also watched for the PIN gate's 423, which re-locks the app
 * mid-session.
 */

export interface EnqueueInput {
  method: string;
  path: string;
  body: string | null;
}

export interface OfflineFetchOptions {
  /** The browser's real fetch, unwrapped. */
  fetch: typeof fetch;
  enqueue(write: EnqueueInput): Promise<void>;
  /** Origin the app is served from; injectable so tests need no DOM. */
  base?: string;
}

/** The methods the outbox may carry — edits and removals, never creates. */
const QUEUED_METHODS = new Set(["PUT", "PATCH", "DELETE"]);

/**
 * 5xx from a gateway or a dying server — indistinguishable at the client from
 * "the network ate my write". 500 included on purpose: vite's proxy answers
 * 500 when the API refuses the connection, and all queued methods are
 * idempotent so a replay is safe whether or not the original landed.
 */
const GATEWAY_FAILURES = new Set([500, 502, 503, 504]);

function originOf(base: string): string {
  try {
    return new URL(base).origin;
  } catch {
    return base;
  }
}

/**
 * The request body as queueable JSON text, or `undefined` when this request
 * cannot be queued (a Blob or FormData body, or a Request whose body we would
 * have to consume to read).
 */
function readBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): string | null | undefined {
  if (init?.body !== undefined && init.body !== null) {
    return typeof init.body === "string" ? init.body : undefined;
  }
  if (input instanceof Request) return undefined;
  return null;
}

export function createOfflineFetch(options: OfflineFetchOptions): typeof fetch {
  const { enqueue } = options;
  const base =
    options.base ?? (typeof location !== "undefined" ? location.href : "http://localhost/");
  const origin = originOf(base);

  return async function offlineFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let url: URL;
    try {
      url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        base,
      );
    } catch {
      return options.fetch(input, init);
    }

    const isApi = url.origin === origin && url.pathname.startsWith("/api/");
    if (!isApi) return options.fetch(input, init);

    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    let res: Response;
    try {
      res = await options.fetch(input, init);
    } catch (err) {
      const aborted =
        init?.signal?.aborted === true || (input instanceof Request && input.signal.aborted);
      // Only a network-level failure (fetch rejects edits with a TypeError) may be
      // queued. An abort or anything thrown by our own code is surfaced as-is.
      const networkFailure = err instanceof TypeError;
      const body = QUEUED_METHODS.has(method) ? readBody(input, init) : undefined;

      if (aborted || !networkFailure || body === undefined) throw err;

      await enqueue({ method, path: url.pathname + url.search, body });
      return new Response(JSON.stringify({ queued: true }), {
        status: 202,
        headers: { "content-type": "application/json", "x-sq-queued": "1" },
      });
    }

    // 423: the LAN PIN gate closed while the app was open — re-lock the UI.
    if (res.status === 423 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("sq:lan-locked"));
    }

    // A gateway saying "the server is down" is a failed write, not an answer:
    // queue it like a rejection. The response body (if any) is discarded — the
    // synthetic 202 below replaces it, exactly as the TypeError path does.
    if (GATEWAY_FAILURES.has(res.status)) {
      const body = QUEUED_METHODS.has(method) ? readBody(input, init) : undefined;
      if (body !== undefined) {
        await enqueue({ method, path: url.pathname + url.search, body });
        return new Response(JSON.stringify({ queued: true }), {
          status: 202,
          headers: { "content-type": "application/json", "x-sq-queued": "1" },
        });
      }
    }
    return res;
  } as typeof fetch;
}
