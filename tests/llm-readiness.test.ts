import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  queries: [] as { table: string; where?: unknown }[],
  inserts: [] as Record<string, unknown>[],
  selectedLlmConfig: vi.fn(),
  checkLlmAccess: vi.fn(),
  tatumClient: vi.fn(),
  memoryClient: vi.fn(),
  completedMainnetCount: vi.fn(),
  close: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("../src/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  return {
    db: {
      execute: vi.fn().mockResolvedValue([]),
      select: () => ({
        from: (table: Parameters<typeof getTableName>[0]) => {
          const name = getTableName(table);
          const query: { table: string; where?: unknown } = { table: name };
          mocks.queries.push(query);
          const builder = {
            where: (where: unknown) => {
              query.where = where;
              return builder;
            },
            orderBy: () => builder,
            groupBy: () => builder,
            limit: () => builder,
            then: (
              resolve: (rows: Record<string, unknown>[]) => unknown,
              reject?: (reason: unknown) => unknown,
            ) => Promise.resolve(mocks.rows[name] ?? []).then(resolve, reject),
          };
          return builder;
        },
      }),
      insert: (table: Parameters<typeof getTableName>[0]) => ({
        values: async (row: Record<string, unknown>) => {
          mocks.inserts.push(row);
          const name = getTableName(table);
          mocks.rows[name] = [
            { ...row, createdAt: new Date() },
            ...(mocks.rows[name] ?? []),
          ];
        },
      }),
    },
  };
});
vi.mock("../src/server/providers/llm", async () => ({
  safeLlmFailure: (await import("../src/server/providers/llm-config"))
    .safeLlmFailure,
  selectedLlmConfig: mocks.selectedLlmConfig,
  checkLlmAccess: mocks.checkLlmAccess,
}));
vi.mock("../src/server/providers/tatum", () => ({
  tatumClient: mocks.tatumClient,
}));
vi.mock("../src/server/providers/memory", () => ({
  memoryClient: mocks.memoryClient,
  completedMainnetCount: mocks.completedMainnetCount,
}));

import { checkProviders, readiness } from "../src/server/readiness";
import { LlmFailure } from "../src/server/providers/llm-config";

const merchantId = "b1000000-0000-4000-8000-000000000001";
const owner = `0x${"1".repeat(64)}`;
const accountId = `0x${"2".repeat(64)}`;
const principal = {
  merchantId,
  actor: "readiness-test",
  mode: "live" as const,
  role: "operator" as const,
};

function configuredEvidence(model = "gemini-3.8-flash") {
  return {
    provider: "gemini",
    configuredModel: model,
    model,
    credentialsConfigured: true,
    modelAccessible: true,
    inferenceVerified: false,
  };
}

function inferenceQuery() {
  const query = mocks.queries.find(
    (entry) => entry.table === "recommendations",
  );
  expect(query?.where).toBeDefined();
  return new PgDialect().sqlToQuery(query!.where as SQL);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries.length = 0;
  mocks.inserts.length = 0;
  mocks.rows = {
    merchants: [
      {
        id: merchantId,
        mode: "live",
        namespace: "test-readiness",
        memoryAccountId: accountId,
        memoryOwnerAddress: owner,
      },
    ],
    provider_checks: [
      {
        merchantId,
        provider: "llm",
        state: "configured",
        message: "Authenticated model metadata is accessible.",
        evidence: configuredEvidence(),
        createdAt: new Date(),
      },
    ],
    worker_heartbeats: [],
    memory_jobs: [],
    recommendations: [],
  };
  mocks.selectedLlmConfig.mockReturnValue({
    provider: "gemini",
    model: "gemini-3.8-flash",
    keyVariable: "GEMINI_API_KEY",
  });
  mocks.checkLlmAccess.mockResolvedValue({
    state: "configured",
    message:
      "Authenticated model metadata is accessible; inference is unverified.",
    evidence: configuredEvidence(),
  });
  mocks.tatumClient.mockReturnValue({
    client: {
      ledgerService: {
        getServiceInfo: () => ({
          response: Promise.resolve({
            chain: "mainnet",
            chainId: "test-chain",
          }),
        }),
      },
      getObject: async () => ({
        object: {
          type: "0x1::account::MemWalAccount",
          json: { owner },
        },
      }),
    },
    close: mocks.close,
  });
  mocks.memoryClient.mockReturnValue({
    health: async () => ({ write_ready: true, version: "test" }),
    recall: async () => ({ results: [] }),
    destroy: mocks.destroy,
  });
  mocks.completedMainnetCount.mockResolvedValue(0);
  vi.stubEnv("MEMWAL_ACCOUNT_ID", accountId);
  vi.stubEnv("LLM_PROVIDER", "gemini");
  vi.stubEnv("LLM_MODEL", "gemini-3.8-flash");
  vi.stubEnv("GEMINI_API_KEY", "synthetic-readiness-key-never-valid");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-unused-key-never-valid");
  vi.stubEnv("ALLOW_MAINNET_WRITES", "false");
});

afterEach(() => vi.unstubAllEnvs());

describe("provider-aware readiness without network or database access", () => {
  it("stores selected Gemini model access separately from successful inference", async () => {
    const result = await checkProviders(principal);
    expect(mocks.checkLlmAccess).toHaveBeenCalledTimes(1);
    expect(mocks.inserts.find((row) => row.provider === "llm")).toMatchObject({
      merchantId,
      state: "configured",
      evidence: {
        provider: "gemini",
        configuredModel: "gemini-3.8-flash",
        modelAccessible: true,
        inferenceVerified: false,
      },
    });
    expect(result.liveInference).toBeNull();
    expect(result.mainnetCount).toBe(0);
    expect(result.mainnetWritesEnabled).toBe(false);
    expect(JSON.stringify(result)).not.toContain(
      "synthetic-readiness-key-never-valid",
    );
    expect(JSON.stringify(result)).not.toContain(
      "synthetic-unused-key-never-valid",
    );
  });

  it("demo readiness never initializes an external provider even when configured", async () => {
    mocks.rows.provider_checks = [];
    const result = await checkProviders({ ...principal, mode: "demo" });
    expect(mocks.checkLlmAccess).not.toHaveBeenCalled();
    expect(mocks.tatumClient).not.toHaveBeenCalled();
    expect(mocks.memoryClient).not.toHaveBeenCalled();
    expect(mocks.selectedLlmConfig).not.toHaveBeenCalled();
    expect(
      result.providers.every((provider) => provider.state === "simulated"),
    ).toBe(true);
    expect(result.liveInference).toBeNull();
    expect(
      mocks.queries.some((query) => query.table === "recommendations"),
    ).toBe(false);
  });

  it("requires the merchant, exact active Gemini model and no provider error for inference evidence", async () => {
    await readiness(principal);
    const query = inferenceQuery();
    expect(query.sql).toContain('"recommendations"."merchant_id"');
    expect(query.params).toContain(merchantId);
    expect(query.params).toContain("gemini:gemini-3.8-flash");
    expect(query.sql).toMatch(/"provider_error"\s+is null/i);
    expect(query.sql).not.toMatch(/\blike\b/i);
    expect(query.params).not.toContain("deterministic-safety-fallback");
    expect(query.params).not.toContain("openai:gemini-3.8-flash");
  });

  it("keeps quota exhaustion visible and does not claim successful inference", async () => {
    mocks.checkLlmAccess.mockResolvedValue({
      state: "quota_exhausted",
      message: "Provider quota is exhausted. No inference was attempted.",
      evidence: {
        ...configuredEvidence(),
        modelAccessible: false,
        errorCode: "QUOTA_EXHAUSTED",
      },
    });
    const result = await checkProviders(principal);
    expect(
      result.providers.find((row) => row.provider === "llm"),
    ).toMatchObject({
      state: "quota_exhausted",
    });
    expect(result.liveInference).toBeNull();
    expect(JSON.stringify(result)).not.toContain("apiKey");
  });

  it("accepts a canonical model alias only from current authenticated metadata", async () => {
    mocks.rows.provider_checks[0].evidence = {
      ...configuredEvidence(),
      model: "models/gemini-3.8-flash-001",
    };
    await readiness(principal);
    const query = inferenceQuery();
    expect(query.params).toContain("gemini:gemini-3.8-flash");
    expect(query.params).toContain("gemini:gemini-3.8-flash-001");
    expect(query.params).not.toContain("gemini:models/gemini-3.8-flash-001");
  });

  it("does not reuse old provider/model access or inference evidence after switching configuration", async () => {
    mocks.rows.provider_checks[0].evidence = {
      ...configuredEvidence(),
      model: "models/gemini-3.8-flash-001",
    };
    mocks.selectedLlmConfig.mockReturnValue({
      provider: "openai",
      model: "test-structured-model",
      keyVariable: "OPENAI_API_KEY",
    });
    const result = await readiness(principal);
    expect(
      result.providers.find((row) => row.provider === "llm"),
    ).toMatchObject({
      state: "disconnected",
      evidence: null,
    });
    expect(inferenceQuery().params).toEqual([
      merchantId,
      "openai:test-structured-model",
    ]);
    expect(result.liveInference).toBeNull();
  });

  it("does not select any successful inference when provider configuration is invalid", async () => {
    mocks.selectedLlmConfig.mockImplementation(() => {
      throw new LlmFailure("UNSUPPORTED_PROVIDER");
    });
    const result = await readiness(principal);
    expect(result.liveInference).toBeNull();
    expect(result.llmConfiguration).toBeNull();
    expect(
      result.providers.find((provider) => provider.provider === "llm"),
    ).toMatchObject({
      state: "failed",
      evidence: { errorCode: "UNSUPPORTED_PROVIDER" },
    });
    expect(
      result.providers.find((provider) => provider.provider === "llm")?.message,
    ).toContain("Select gemini or openai");
    expect(
      mocks.queries.some((query) => query.table === "recommendations"),
    ).toBe(false);
  });
  it("reports missing model configuration explicitly without reusing stale success", async () => {
    mocks.selectedLlmConfig.mockImplementation(() => {
      throw new LlmFailure("MISSING_CONFIGURATION");
    });
    const result = await readiness(principal);
    expect(
      result.providers.find((provider) => provider.provider === "llm"),
    ).toMatchObject({
      state: "disconnected",
      evidence: { errorCode: "MISSING_CONFIGURATION", modelAccessible: false },
    });
    expect(result.liveInference).toBeNull();
  });
});
