import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Decision } from "../src/core/types";
import { templateExplanation } from "../src/core/ranking";

const mocks = vi.hoisted(() => ({
  geminiInit: vi.fn(),
  openaiInit: vi.fn(),
  generate: vi.fn(),
  reserve: vi.fn(),
  success: vi.fn(),
  used: 0,
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(config: unknown) {
      mocks.geminiInit(config);
    }
    interactions = { create: mocks.generate };
  },
}));
vi.mock("openai", () => ({
  default: class {
    constructor(config: unknown) {
      mocks.openaiInit(config);
    }
  },
}));
vi.mock("../src/server/providers/inference-budget", () => ({
  reserveInferenceAttempt: mocks.reserve,
  markVerificationSuccess: mocks.success,
}));
import { explain } from "../src/server/providers/llm";

const decision: Decision = {
  chosen: "refresh",
  baseline: "refresh",
  policyVersion: 1,
  limitation: "Synthetic test with no prior outcomes.",
  evidence: [],
  scores: [
    {
      remedy: "refresh",
      successes: 0,
      failures: 0,
      score: 0.5,
      evidenceIds: [],
    },
  ],
};
const verifiedCli = {
  verification: {
    freeTierConfirmed: true,
    credentialsRotated: true,
    purpose: "synthetic-cli-check",
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.used = 0;
  vi.stubEnv("LOCAL_PILOT_VERIFICATION", "true");
  vi.stubEnv("PILOT_FREE_TIER_CONFIRMED", "false");
  vi.stubEnv("PILOT_CREDENTIALS_ROTATED", "false");
  vi.stubEnv("ALLOW_MAINNET_WRITES", "false");
  vi.stubEnv("LLM_PROVIDER", "gemini");
  vi.stubEnv("LLM_MODEL", "gemini-3.8-flash");
  vi.stubEnv("GEMINI_API_KEY", "unit-test-pilot-key");
  vi.stubEnv("OPENAI_API_KEY", "");
  mocks.reserve.mockImplementation(async () => {
    if (mocks.used >= 4)
      throw Object.assign(new Error("Mocked shared allowance exhausted"), {
        code: "INFERENCE_BUDGET_EXHAUSTED",
      });
    return ++mocks.used;
  });
  mocks.generate.mockResolvedValue({
    status: "completed",
    model: "gemini-3.8-flash",
    steps: [],
    errors: [],
    output_text: JSON.stringify(templateExplanation(decision)),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it("blocks an unconfirmed application recommendation before SDK initialization or budget reservation", async () => {
  const result = await explain(decision, "live", "Synthetic support message");
  expect(result.errorCode).toBe("VERIFICATION_REQUIRED");
  expect(result.provider).toBe("deterministic-safety-fallback");
  expect(result.attempts).toBe(0);
  expect(mocks.geminiInit).not.toHaveBeenCalled();
  expect(mocks.openaiInit).not.toHaveBeenCalled();
  expect(mocks.reserve).not.toHaveBeenCalled();
  expect(mocks.generate).not.toHaveBeenCalled();
});

it.each([
  { freeTierConfirmed: true, credentialsRotated: false },
  { freeTierConfirmed: false, credentialsRotated: true },
])("requires both attestations for a CLI call: %j", async (confirmation) => {
  const result = await explain(decision, "live", "Synthetic input", {
    verification: { ...confirmation, purpose: "partial-confirmation" },
  });
  expect(result.errorCode).toBe("VERIFICATION_REQUIRED");
  expect(mocks.geminiInit).not.toHaveBeenCalled();
  expect(mocks.reserve).not.toHaveBeenCalled();
});

it("shares four admitted requests between CLI attestations and application calls, then blocks the fifth", async () => {
  const first = await explain(decision, "live", "Synthetic smoke", verifiedCli);
  expect(first.error).toBeNull();
  expect(mocks.success).toHaveBeenCalledWith("gemini", "gemini-3.8-flash");
  expect(mocks.reserve).toHaveBeenNthCalledWith(
    1,
    "gemini",
    "gemini-3.8-flash",
    "synthetic-cli-check",
  );
  vi.stubEnv("PILOT_FREE_TIER_CONFIRMED", "true");
  vi.stubEnv("PILOT_CREDENTIALS_ROTATED", "true");
  for (let i = 0; i < 3; i++) {
    const result = await explain(
      decision,
      "live",
      "Synthetic application request",
    );
    expect(result.error).toBeNull();
    expect(result.attempts).toBe(1);
  }
  expect(mocks.reserve).toHaveBeenLastCalledWith(
    "gemini",
    "gemini-3.8-flash",
    "application-recommendation",
  );
  const refused = await explain(
    decision,
    "live",
    "Fifth synthetic request",
    verifiedCli,
  );
  expect(refused.errorCode).toBe("BUDGET_EXHAUSTED");
  expect(refused.attempts).toBe(0);
  expect(refused.provider).toBe("deterministic-safety-fallback");
  expect(mocks.used).toBe(4);
  expect(mocks.generate).toHaveBeenCalledTimes(4);
  expect(mocks.openaiInit).not.toHaveBeenCalled();
});

it("consumes attempts for failed responses and never refunds them or retries", async () => {
  mocks.generate.mockRejectedValueOnce({
    status: 429,
    message: "unit-test-pilot-key",
  });
  expect(
    (await explain(decision, "live", "Synthetic quota failure", verifiedCli))
      .errorCode,
  ).toBe("QUOTA_EXHAUSTED");
  mocks.generate.mockResolvedValueOnce({
    status: "completed",
    model: "gemini-3.8-flash",
    steps: [],
    errors: [],
    output_text: "{invalid",
  });
  expect(
    (
      await explain(
        decision,
        "live",
        "Synthetic malformed response",
        verifiedCli,
      )
    ).errorCode,
  ).toBe("INVALID_JSON");
  expect(
    (await explain(decision, "live", "Third request", verifiedCli)).error,
  ).toBeNull();
  expect(
    (await explain(decision, "live", "Fourth request", verifiedCli)).error,
  ).toBeNull();
  expect(
    (await explain(decision, "live", "Fifth request", verifiedCli)).errorCode,
  ).toBe("BUDGET_EXHAUSTED");
  expect(mocks.used).toBe(4);
  expect(mocks.generate).toHaveBeenCalledTimes(4);
});

it.each([
  ["LLM_PROVIDER", "openai"],
  ["LLM_MODEL", "unreviewed-model"],
  ["ALLOW_MAINNET_WRITES", "true"],
])(
  "blocks prohibited pilot configuration %s=%s even with CLI confirmations",
  async (key, value) => {
    vi.stubEnv(key, value);
    const result = await explain(
      decision,
      "live",
      "Synthetic input",
      verifiedCli,
    );
    expect(result.errorCode).toBe("VERIFICATION_REQUIRED");
    expect(result.attempts).toBe(0);
    expect(mocks.geminiInit).not.toHaveBeenCalled();
    expect(mocks.openaiInit).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  },
);

it("demo bypasses all pilot gates, SDKs and budgets even with invalid configuration", async () => {
  vi.stubEnv("LLM_PROVIDER", "unsupported");
  vi.stubEnv("ALLOW_MAINNET_WRITES", "true");
  const result = await explain(decision, "demo", "Synthetic demo");
  expect(result.provider).toBe("sample-template-v1");
  expect(result.error).toBeNull();
  expect(result.attempts).toBe(0);
  expect(mocks.geminiInit).not.toHaveBeenCalled();
  expect(mocks.openaiInit).not.toHaveBeenCalled();
  expect(mocks.reserve).not.toHaveBeenCalled();
});

it("leaves non-pilot live inference governed by its existing caller, without the pilot allowance", async () => {
  vi.stubEnv("LOCAL_PILOT_VERIFICATION", "false");
  const beforeRequest = vi.fn();
  const result = await explain(
    decision,
    "live",
    "Synthetic normal configuration",
    { beforeRequest },
  );
  expect(result.error).toBeNull();
  expect(beforeRequest).toHaveBeenCalledOnce();
  expect(mocks.reserve).not.toHaveBeenCalled();
  expect(mocks.generate).toHaveBeenCalledOnce();
});
