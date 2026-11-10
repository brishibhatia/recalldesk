import { createServer } from "node:http";
import { once } from "node:events";
import { expect, it } from "vitest";
import { GoogleGenAI } from "@google/genai";
import {
  cancellableLlmFetch,
  untilAborted,
  type LlmTransportDiagnostic,
} from "../src/server/providers/llm-transport";
import {
  safeLlmDiagnostic,
  safeLlmFailure,
} from "../src/server/providers/llm-config";

it.each([false, true])(
  "cancels the real Gemini SDK HTTP connection, including partial body=%s",
  async (partialBody) => {
    let requests = 0;
    let requestPath = "";
    let contentLength: string | undefined;
    let apiRevision: string | string[] | undefined;
    let receivedInput = "";
    let disconnected = false;
    const server = createServer((_req, res) => {
      requests++;
      requestPath = _req.url ?? "";
      contentLength = _req.headers["content-length"];
      apiRevision = _req.headers["api-revision"];
      _req.on("data", (chunk) => {
        receivedInput += chunk.toString();
      });
      res.on("close", () => {
        disconnected = true;
      });
      if (partialBody) {
        res.writeHead(200, { "content-type": "application/json" });
        res.write('{"status":');
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("Test server unavailable");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 350);
    const client = new GoogleGenAI({
      apiKey: "synthetic-local-test",
      apiVersion: "v1beta",
      enterprise: false,
      httpOptions: {
        headers: { "Api-Revision": "2026-05-20" },
        baseUrl: `http://127.0.0.1:${address.port}`,
        fetch: cancellableLlmFetch(controller.signal),
        retryOptions: { attempts: 1 },
      },
    });
    try {
      const request = client.interactions.create(
        {
          model: "gemini-3.8-flash",
          input: "synthetic",
          store: false,
          automatic_continuation: false,
        },
        {
          signal: controller.signal,
          retries: { strategy: "none" },
          timeout_ms: 350,
        },
      );
      await expect(untilAborted(request, controller.signal)).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(requests).toBe(1);
      expect(requestPath).toBe("/v1beta/interactions");
      expect(apiRevision).toBe("2026-05-20");
      expect(Number(contentLength)).toBeGreaterThan(0);
      expect(JSON.parse(receivedInput).input).toBe("synthetic");
      expect(disconnected).toBe(true);
    } finally {
      clearTimeout(timer);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

it("redacts unexpected SDK diagnostics and distinguishes rejected request schemas", () => {
  const error = {
    status: 400,
    name: "BadRequestError",
    message: "response_format rejected PRIVATE_TOKEN",
    body: "PRIVATE_TOKEN",
  };
  expect(safeLlmFailure(error).code).toBe("INVALID_REQUEST");
  expect(safeLlmDiagnostic(error)).toEqual({
    httpStatus: 400,
    category: "BadRequestError",
    schemaRelated: true,
  });
  expect(JSON.stringify(safeLlmDiagnostic(error))).not.toContain(
    "PRIVATE_TOKEN",
  );
});

it("captures Retry-After without retaining response headers or provider bodies", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(429, { "retry-after": "2", "x-private-value": "do-not-retain" });
    res.end("private provider message");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing test server");
  const diagnostic: LlmTransportDiagnostic = { requests: 0, httpStatus: null, headersAfterMs: null };
  try {
    const response = await cancellableLlmFetch(AbortSignal.timeout(1000), diagnostic)(`http://127.0.0.1:${address.port}`);
    await response.body?.cancel();
    expect(diagnostic.retryAfterMs).toBe(2000);
    expect(diagnostic.httpStatus).toBe(429);
    expect(JSON.stringify(diagnostic)).not.toContain("private");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
