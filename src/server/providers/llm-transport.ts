/** Attach our deadline to the actual fetch, including response-body consumption. */
export type LlmTransportDiagnostic = {
  requests: number;
  httpStatus: number | null;
  headersAfterMs: number | null;
  requestBodyBytes?: number;
  apiPath?: string;
  retryAfterMs?: number;
};
export function cancellableLlmFetch(
  signal: AbortSignal,
  diagnostic?: LlmTransportDiagnostic,
): typeof fetch {
  return async (input, init) => {
    const started = performance.now();
    if (diagnostic) diagnostic.requests++;
    const requestSignal =
      init?.signal ?? (input instanceof Request ? input.signal : null);
    const combined = requestSignal
      ? AbortSignal.any([signal, requestSignal])
      : signal;
    // The Interactions SDK constructs a stream-backed Request. Materialize this
    // already bounded JSON body so Node sends a finite Content-Length rather
    // than chunked request framing; retain the exact SDK payload/auth headers.
    let response: Response;
    if (input instanceof Request && input.method === "POST" && !init?.body) {
      const body = await untilAborted(input.text(), combined);
      if (Buffer.byteLength(body) > 65536)
        throw new Error("LLM request exceeds transport limit");
      if (diagnostic) {
        diagnostic.requestBodyBytes = Buffer.byteLength(body);
        diagnostic.apiPath =
          new URL(input.url).pathname === "/v1beta/interactions"
            ? "/v1beta/interactions"
            : "other";
      }
      response = await fetch(input.url, {
        method: input.method,
        headers: input.headers,
        body,
        redirect: "error",
        signal: combined,
      });
    } else {
      response = await fetch(input, { ...init, signal: combined });
    }
    if (diagnostic) {
      diagnostic.httpStatus = response.status;
      diagnostic.headersAfterMs = Math.round(performance.now() - started);
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter && retryAfter.length < 100) {
        const seconds = Number(retryAfter);
        const delay = Number.isFinite(seconds)
          ? seconds * 1000
          : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(delay) && delay >= 0)
          diagnostic.retryAfterMs = Math.ceil(delay);
      }
    }
    return response;
  };
}

/** Also bound SDK response processing if its promise ignores an aborted transport. */
export function untilAborted<T>(
  request: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(new DOMException("Request deadline exceeded", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    request
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
