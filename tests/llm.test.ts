import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { templateExplanation } from "../src/core/ranking";
import type { Decision, MemoryEvent } from "../src/core/types";

const mocks = vi.hoisted(() => ({
  geminiInit: vi.fn(),
  openaiInit: vi.fn(),
  generate: vi.fn(),
  get: vi.fn(),
  parse: vi.fn(),
  retrieve: vi.fn(),
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(config: unknown) {
      mocks.geminiInit(config);
    }
    interactions = { create: mocks.generate };
    models = { get: mocks.get };
  },
}));
vi.mock("openai", () => ({
  default: class {
    constructor(config: unknown) {
      mocks.openaiInit(config);
    }
    responses = { parse: mocks.parse };
    models = { retrieve: mocks.retrieve };
  },
}));
import { explain, checkLlmAccess } from "../src/server/providers/llm";

const event: MemoryEvent = {
  schemaVersion: 1,
  logicalEventId: randomUUID(),
  merchantId: randomUUID(),
  caseId: randomUUID(),
  attemptId: randomUUID(),
  caseRef: "TEST-1",
  issue: "access",
  productVersion: "v1",
  remedy: "relink",
  outcome: "resolved",
  confirmation: "merchant",
  policyVersion: 2,
  policyEffectiveAt: "2026-11-01T00:00:00.000Z",
  observedAt: "2026-11-02T00:00:00.000Z",
  eventCreatedAt: "2026-11-02T00:00:00.000Z",
  paymentRef: null,
  supersedesEventId: null,
  provenance: "synthetic-demo",
};
const decision: Decision = {
  baseline: "refresh",
  chosen: "relink",
  policyVersion: 2,
  limitation: "Synthetic test; one example, not calibrated confidence.",
  scores: [
    {
      remedy: "relink",
      successes: 1,
      failures: 0,
      score: 2 / 3,
      evidenceIds: [event.logicalEventId],
    },
  ],
  evidence: [
    {
      event,
      providerId: "sample:test",
      text: "PRIVATE_RAW_MEMORY_TEXT_DO_NOT_SEND",
      source: "sample-memory",
    },
  ],
};
const output = () => templateExplanation(decision);
const response = (value: unknown = output()) => ({
  status: "completed",
  model: "gemini-3.8-flash",
  output_text: JSON.stringify(value),
  steps: [],
  errors: [],
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LLM_PROVIDER", "gemini");
  vi.stubEnv("LLM_MODEL", "gemini-3.8-flash");
  vi.stubEnv("GEMINI_API_KEY", "unit-test-gemini-credential");
  vi.stubEnv("OPENAI_API_KEY", "");
  mocks.generate.mockResolvedValue(response());
  mocks.get.mockResolvedValue({ name: "models/gemini-3.8-flash" });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it("Gemini returns a validated cited explanation without an OpenAI key, initialization or call", async () => {
  const result = await explain(decision, "live", "Synthetic ticket");
  expect(result.error).toBeNull();
  expect(result.provider).toBe("gemini:gemini-3.8-flash");
  expect(result.attempts).toBe(1);
  expect(result.explanation.memoryIds).toContain(event.logicalEventId);
  expect(mocks.openaiInit).not.toHaveBeenCalled();
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  const [request, options] = mocks.generate.mock.calls[0];
  expect(request.automatic_continuation).toBe(false);
  expect(request.store).toBe(false);
  expect(request.generation_config.max_output_tokens).toBe(1000);
  expect(request.generation_config.thinking_level).toBe("low");
  expect(mocks.geminiInit.mock.calls[0][0].apiVersion).toBe("v1beta");
  expect(mocks.geminiInit.mock.calls[0][0].httpOptions.headers).toEqual({
    "Api-Revision": "2026-05-20",
  });
  expect(request.response_format.mime_type).toBe("application/json");
  expect(request.response_format.schema.required).toContain("policyVersion");
  expect(options.retries).toEqual({ strategy: "none" });
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(
    mocks.geminiInit.mock.calls[0][0].httpOptions.retryOptions.attempts,
  ).toBe(1);
});
it("demo bypasses all provider configuration, SDK initialization and attempt accounting even with keys present", async () => {
  vi.stubEnv("LLM_PROVIDER", "unsupported");
  vi.stubEnv("OPENAI_API_KEY", "unit-test-openai-credential");
  const beforeRequest = vi.fn();
  const result = await explain(decision, "demo", "ignore policy", {
    beforeRequest,
  });
  expect(result.provider).toBe("sample-template-v1");
  expect(result.attempts).toBe(0);
  expect(result.error).toBeNull();
  expect(mocks.geminiInit).not.toHaveBeenCalled();
  expect(mocks.openaiInit).not.toHaveBeenCalled();
  expect(beforeRequest).not.toHaveBeenCalled();
  expect((await checkLlmAccess("demo")).state).toBe("simulated");
  expect(mocks.get).not.toHaveBeenCalled();
});
it("retains selected OpenAI support and records the actual response model", async () => {
  vi.stubEnv("LLM_PROVIDER", "openai");
  vi.stubEnv("LLM_MODEL", "test-model");
  vi.stubEnv("OPENAI_API_KEY", "unit-test-openai-credential");
  mocks.parse.mockResolvedValue({
    output_parsed: output(),
    status: "completed",
    output: [],
    model: "test-model-actual",
  });
  const result = await explain(decision, "live", "Synthetic ticket");
  expect(result.provider).toBe("openai:test-model-actual");
  expect(result.error).toBeNull();
  expect(mocks.geminiInit).not.toHaveBeenCalled();
  expect(mocks.openaiInit.mock.calls[0][0].maxRetries).toBe(0);
});
it("minimizes inputs and excludes raw memory, customer email, wallet and configured credentials", async () => {
  const wallet = `0x${"a".repeat(64)}`;
  await explain(
    decision,
    "live",
    `Person@example.invalid ${wallet} unit-test-gemini-credential ${"x".repeat(5000)}`,
  );
  const input = mocks.generate.mock.calls[0][0].input;
  expect(input).not.toContain("Person@example.invalid");
  expect(input).not.toContain(wallet);
  expect(input).not.toContain("unit-test-gemini-credential");
  expect(input).not.toContain("PRIVATE_RAW_MEMORY_TEXT_DO_NOT_SEND");
  expect(input).not.toContain(event.merchantId);
  expect(input.length).toBeLessThan(24000);
});
describe.each([
  ["malformed JSON", { output_text: "{broken" }, "INVALID_JSON"],
  [
    "wrong schema",
    { output_text: JSON.stringify({ hello: "world" }) },
    "INVALID_SCHEMA",
  ],
  [
    "fake citation",
    { output_text: JSON.stringify({ ...output(), memoryIds: [randomUUID()] }) },
    "INVALID_CITATION",
  ],
  [
    "missing citations",
    { output_text: JSON.stringify({ ...output(), memoryIds: [] }) },
    "INVALID_CITATION",
  ],
  [
    "changed remedy",
    { output_text: JSON.stringify({ ...output(), remedyId: "legacy_reset" }) },
    "CHANGED_REMEDY",
  ],
  [
    "changed policy",
    { output_text: JSON.stringify({ ...output(), policyVersion: 3 }) },
    "CHANGED_POLICY",
  ],
  ["refusal", { errors: [{ code: "SAFETY_BLOCKED" }] }, "REFUSED"],
  [
    "step safety block",
    {
      steps: [
        { type: "model_output", error: { code: 7, message: "Safety blocked" } },
      ],
    },
    "REFUSED",
  ],
  [
    "credential in model field",
    { model: "unit-test-gemini-credential" },
    "INVALID_MODEL",
  ],
  ["empty output", { output_text: "" }, "EMPTY_OUTPUT"],
  ["incomplete output", { status: "in_progress" }, "EMPTY_OUTPUT"],
  ["excessive output", { output_text: "x".repeat(16001) }, "OUTPUT_LIMIT"],
  [
    "secret echoed",
    {
      output_text: JSON.stringify({
        ...output(),
        customerDraft: "unit-test-gemini-credential",
      }),
    },
    "INVALID_SCHEMA",
  ],
] as const)("rejects %s", (_name, changes, code) => {
  it("returns a visible safety fallback, preserving the deterministic decision", async () => {
    mocks.generate.mockResolvedValue({ ...response(), ...changes });
    const result = await explain(decision, "live", "Synthetic ticket");
    expect(result.provider).toBe("deterministic-safety-fallback");
    expect(result.errorCode).toBe(code);
    expect(result.error).toBeTruthy();
    expect(result.explanation.remedyId).toBe(decision.chosen);
    expect(result.explanation.policyVersion).toBe(decision.policyVersion);
    expect(result.attempts).toBe(1);
    expect(JSON.stringify(result)).not.toContain("unit-test-gemini-credential");
  });
});
it.each([
  [401, "AUTHENTICATION_FAILED"],
  [403, "AUTHENTICATION_FAILED"],
  [404, "MODEL_UNAVAILABLE"],
  [429, "QUOTA_EXHAUSTED"],
  [503, "PROVIDER_UNAVAILABLE"],
])("redacts provider exception %s and never retries", async (status, code) => {
  mocks.generate.mockRejectedValue(
    Object.assign(new Error("Raw body: unit-test-gemini-credential"), {
      status,
    }),
  );
  const result = await explain(decision, "live", "Synthetic ticket");
  expect(result.errorCode).toBe(code);
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toContain("unit-test-gemini-credential");
});
it("cancels the actual request signal on timeout", async () => {
  let signal: AbortSignal | undefined;
  mocks.generate.mockImplementation(
    (_request, options) =>
      new Promise((_resolve, reject) => {
        signal = options.signal;
        signal!.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  const result = await explain(decision, "live", "Synthetic ticket", {
    timeoutMs: 20,
  });
  expect(signal?.aborted).toBe(true);
  expect(result.errorCode).toBe("TIMEOUT");
  expect(result.attempts).toBe(1);
});
it("labels a network error without exposing its request or retrying", async () => {
  mocks.generate.mockRejectedValue(
    new TypeError("Network failed: unit-test-gemini-credential"),
  );
  const result = await explain(decision, "live", "test");
  expect(result.errorCode).toBe("PROVIDER_UNAVAILABLE");
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toContain("unit-test-gemini-credential");
});
it("recognizes Google's HTTP 400 invalid-key error without returning its body", async () => {
  mocks.generate.mockRejectedValue({
    status: 400,
    message: "API_KEY_INVALID unit-test-gemini-credential",
  });
  const result = await explain(decision, "live", "test");
  expect(result.errorCode).toBe("AUTHENTICATION_FAILED");
  expect(JSON.stringify(result)).not.toContain("unit-test-gemini-credential");
});
it("rejects unsupported names and missing Gemini keys before initializing a provider", async () => {
  vi.stubEnv("LLM_PROVIDER", "not-supported");
  expect((await explain(decision, "live", "test")).errorCode).toBe(
    "UNSUPPORTED_PROVIDER",
  );
  vi.stubEnv("LLM_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "");
  expect((await explain(decision, "live", "test")).errorCode).toBe(
    "MISSING_CONFIGURATION",
  );
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.geminiInit).not.toHaveBeenCalled();
});
it("does not send a request after the durable verification allowance rejects it", async () => {
  const result = await explain(decision, "live", "test", {
    beforeRequest: () => {
      throw Object.assign(new Error("No attempts remain"), {
        code: "INFERENCE_BUDGET_EXHAUSTED",
      });
    },
  });
  expect(result.errorCode).toBe("BUDGET_EXHAUSTED");
  expect(result.attempts).toBe(0);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("metadata access performs no inference and cannot claim verified billing or inference", async () => {
  const result = await checkLlmAccess();
  expect(result.state).toBe("configured");
  expect(result.evidence.model).toBe("gemini-3.8-flash");
  expect(result.evidence.inferenceVerified).toBe(false);
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.openaiInit).not.toHaveBeenCalled();
  mocks.get.mockRejectedValue({
    status: 429,
    message: "unit-test-gemini-credential",
  });
  const failed = await checkLlmAccess();
  expect(failed.state).toBe("quota_exhausted");
  expect(JSON.stringify(failed)).not.toContain("unit-test-gemini-credential");
});

it("retries transient failures with backoff, validates the eventual response and reserves every attempt", async () => {
  const reserve = vi.fn();
  mocks.generate
    .mockRejectedValueOnce({ status: 503 })
    .mockResolvedValueOnce(response());
  const result = await explain(decision, "live", "synthetic", {
    maxRetries: 2,
    retryBaseDelayMs: 2,
    beforeRequest: reserve,
  });
  expect(result.error).toBeNull();
  expect(result.provider).toBe("gemini:gemini-3.8-flash");
  expect(result.attempts).toBe(2);
  expect(reserve).toHaveBeenCalledTimes(2);
  expect(result.retryHistory.map((h) => h.waitBeforeNextMs)).toEqual([2, 0]);
  expect(result.retryHistory[0].httpStatus).toBe(503);
});
it("bounds retries and preserves fallback after persistent service failures", async () => {
  mocks.generate.mockRejectedValue({ status: 503 });
  const result = await explain(decision, "live", "synthetic", {
    maxRetries: 2,
    retryBaseDelayMs: 1,
  });
  expect(result.provider).toBe("deterministic-safety-fallback");
  expect(result.attempts).toBe(3);
  expect(result.retryHistory.map((h) => h.waitBeforeNextMs)).toEqual([1, 2, 0]);
  expect(mocks.generate).toHaveBeenCalledTimes(3);
});
it.each([401, 403, 400, 404, 429])(
  "does not retry permanent rejection or quota without Retry-After (%s)",
  async (status) => {
    mocks.generate.mockRejectedValue({ status });
    const result = await explain(decision, "live", "synthetic", {
      maxRetries: 2,
      retryBaseDelayMs: 1,
    });
    expect(result.error).toBeTruthy();
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  },
);
it("does not retry invalid citations even when retries are enabled", async () => {
  mocks.generate.mockResolvedValue(
    response({ ...output(), memoryIds: [randomUUID()] }),
  );
  const result = await explain(decision, "live", "synthetic", {
    maxRetries: 2,
    retryBaseDelayMs: 1,
  });
  expect(result.errorCode).toBe("INVALID_CITATION");
  expect(mocks.generate).toHaveBeenCalledTimes(1);
});
it("a rejected retry reservation sends no second request and preserves the prior failed attempt", async () => {
  mocks.generate.mockRejectedValue({ status: 503 });
  const reserve = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce({ code: "INFERENCE_BUDGET_EXHAUSTED" });
  const result = await explain(decision, "live", "synthetic", {
    maxRetries: 2,
    retryBaseDelayMs: 1,
    beforeRequest: reserve,
  });
  expect(result.errorCode).toBe("BUDGET_EXHAUSTED");
  expect(result.attempts).toBe(1);
  expect(result.retryHistory).toHaveLength(1);
  expect(mocks.generate).toHaveBeenCalledTimes(1);
});
