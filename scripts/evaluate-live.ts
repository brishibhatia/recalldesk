import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "../src/db";
import { merchants } from "../src/db/schema";
import { remedyIdSchema } from "../src/core/types";
import { rankRemedies } from "../src/core/ranking";
import { mode, required } from "../src/server/config";
import { caseContext, currentPolicy } from "../src/server/services";
import { recall } from "../src/server/providers/memory";
import { explain, selectedLlmConfig } from "../src/server/providers/llm";
import {
  reserveInferenceAttempt,
  verificationAttemptCount,
  verificationBudgetStatus,
} from "./lib/inference-budget";

const scenarioSchema = z.enum([
  "unseen-wording",
  "conflicting-outcomes",
  "insufficient-evidence",
  "reopened-case",
]);
const manifestSchema = z.object({
  version: z.string().min(1).max(80),
  cases: z
    .array(
      z.object({
        scenario: scenarioSchema,
        caseId: z.string().uuid(),
        expectedRemedy: remedyIdSchema.nullable(),
        expectedEscalation: z.boolean(),
        requiredMemoryIds: z.array(z.string().uuid()).default([]),
        forbiddenMemoryIds: z.array(z.string().uuid()).default([]),
      }),
    )
    .length(4),
});
const wording = {
  "unseen-wording":
    "Checkout succeeded, but the workspace still asks me to upgrade. What should support try next?",
  "conflicting-outcomes":
    "I can see the order in my account. The studio page still says I do not have access, and refreshing did nothing.",
  "insufficient-evidence":
    "This is my first report for this product setup. What information do you need before suggesting a fix?",
  "reopened-case":
    "The previous fix looked successful briefly. The access problem has returned; please do not count that as a lasting resolution.",
};
if (
  mode() !== "live" ||
  !process.argv.includes("--live") ||
  !process.argv.includes("--allow-inference")
)
  throw new Error(
    "Live evaluation is opt-in: APP_MODE=live, --live --allow-inference --dataset <private-manifest.json>. Four total verification attempts shared with llm:smoke; no retries or memory writes.",
  );
const datasetPath = process.argv[process.argv.indexOf("--dataset") + 1];
if (!process.argv.includes("--dataset") || !datasetPath)
  throw new Error(
    "A reviewed, private dataset manifest is required. See docs/live-verification.md.",
  );
try {
  if ((await verificationBudgetStatus()).grantId)
    throw new Error(
      "The repair allowance stops after one validated response and is not authorized for paired evaluation. No inference was made.",
    );
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(datasetPath, "utf8")),
  );
  if (new Set(manifest.cases.map((c) => c.scenario)).size !== 4)
    throw new Error(
      "Each of the four scenarios must be represented exactly once.",
    );
  const config = selectedLlmConfig();
  required(config.keyVariable);
  if (
    config.provider === "gemini" &&
    (!["--confirm-free-tier", "--confirm-rotated"].every((flag) =>
      process.argv.includes(flag),
    ) ||
      config.model !== "gemini-3.8-flash")
  )
    throw new Error(
      "Gemini verification requires reviewed free-tier access, replacement credentials and the configured free-tier candidate.",
    );
  const model = config.model;
  const merchantId = required("LIVE_MERCHANT_ID");
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(and(eq(merchants.id, merchantId), eq(merchants.mode, "live")));
  if (!merchant) throw new Error("Provision the configured merchant first.");
  const principal = {
    merchantId,
    actor: "live-evaluation",
    role: "operator" as const,
    mode: "live" as const,
  };
  const rows: Record<string, unknown>[] = [];
  let modelRequests = 0;
  for (const test of manifest.cases) {
    const started = performance.now();
    try {
      if ((await verificationBudgetStatus()).remaining < 2) {
        rows.push({
          scenario: test.scenario,
          status: "budget_unavailable",
          reason:
            "A comparable pair requires two attempts within the shared four-attempt allowance. No request was made.",
        });
        continue;
      }
      const context = await caseContext(principal, test.caseId),
        policy = await currentPolicy(merchantId);
      const recalledAt = new Date().toISOString(),
        recalled = await recall(
          merchant,
          context.ticket.issue,
          context.product.version,
        );
      const common = {
        merchantId,
        issue: context.ticket.issue,
        productVersion: context.product.version,
        payment: context.ticket.payment?.state ?? ("pending" as const),
        policy: policy.config,
        supersededIds: recalled.supersededIds,
      };
      const memory = rankRemedies({ ...common, evidence: recalled.evidence }),
        baseline = rankRemedies({ ...common, evidence: [] });
      const ids = new Set(memory.evidence.map((e) => e.event.logicalEventId));
      const conflict = memory.scores.some(
        (s) => s.successes > 0 && s.failures > 0,
      );
      const prerequisite =
        test.scenario === "insufficient-evidence"
          ? memory.evidence.length < 2
          : test.scenario === "conflicting-outcomes"
            ? conflict
            : test.scenario === "reopened-case"
              ? memory.evidence.some((e) => e.event.supersedesEventId)
              : memory.evidence.length >= 2;
      if (!prerequisite || test.requiredMemoryIds.some((id) => !ids.has(id))) {
        rows.push({
          scenario: test.scenario,
          status: "prerequisite_missing",
          reason:
            "Actual remote recall does not contain the reviewed scenario evidence. No fixture was substituted.",
          recalledAt,
          evidenceIds: [...ids],
          latencyMs: performance.now() - started,
        });
        continue;
      }
      const variants = [];
      for (const [name, decision] of [
        ["baseline", baseline],
        ["memory", memory],
      ] as const) {
        // Expected labels are used only by the scorer after inference; they never enter the prompt or memory.
        const generated = await explain(
          decision,
          "live",
          wording[test.scenario],
          {
            maxRetries: 0,
            verification: {
              freeTierConfirmed: process.argv.includes("--confirm-free-tier"),
              credentialsRotated: process.argv.includes("--confirm-rotated"),
              purpose: `evaluation:${test.scenario}:${name}`,
            },
            beforeRequest: async () => {
              if (process.env.LOCAL_PILOT_VERIFICATION !== "true")
                await reserveInferenceAttempt(
                  config.provider,
                  model,
                  `evaluation:${test.scenario}:${name}`,
                );
            },
          },
        );
        modelRequests += generated.attempts;
        const inferenceSucceeded =
          generated.provider.startsWith(`${config.provider}:`) &&
          !generated.error;
        const citedIds = generated.explanation.memoryIds;
        const validCitations =
          inferenceSucceeded &&
          citedIds.every((id) =>
            decision.evidence.some((e) => e.event.logicalEventId === id),
          ) &&
          !citedIds.some((id) => test.forbiddenMemoryIds.includes(id));
        variants.push({
          variant: name,
          inferenceSucceeded,
          provider: generated.provider,
          configuredModel: model,
          errorCode: generated.errorCode,
          action: generated.explanation.remedyId,
          expectedAction: test.expectedRemedy,
          actionCorrect:
            inferenceSucceeded &&
            generated.explanation.remedyId === test.expectedRemedy,
          validCitations,
          appropriateEscalation:
            inferenceSucceeded &&
            Boolean(generated.explanation.escalationReason) ===
              test.expectedEscalation,
          evidenceIds: citedIds,
          scores: decision.scores,
          failure: generated.error,
        });
      }
      rows.push({
        scenario: test.scenario,
        status: "measured",
        caseId: test.caseId,
        recalledAt,
        recallProvider: recalled.source,
        policyVersion: policy.version,
        paymentCheckedAt: context.ticket.payment?.checkedAt,
        evidence: memory.evidence.map((e) => ({
          id: e.event.logicalEventId,
          storageReference: e.providerId,
          provenance: e.event.provenance,
        })),
        variants,
        latencyMs: Math.round(performance.now() - started),
      });
    } catch {
      rows.push({
        scenario: test.scenario,
        status: "provider_or_configuration_failure",
        reason: "Read/validation failed; no live observation was invented.",
        latencyMs: Math.round(performance.now() - started),
      });
    }
  }
  const report = {
    runAt: new Date().toISOString(),
    datasetVersion: manifest.version,
    datasetHash: createHash("sha256")
      .update(JSON.stringify({ manifest, wording }))
      .digest("hex"),
    providerMode: `live-walrus-${config.provider}`,
    model,
    trials: 1,
    modelRequestsAttempted: modelRequests,
    maximumModelRequests: 4,
    totalVerificationAttempts: await verificationAttemptCount(),
    rows,
    metrics: ["baseline", "memory"].map((variant) => {
      const observations = rows
        .flatMap(
          (row) =>
            (row.variants ?? []) as {
              variant: string;
              inferenceSucceeded: boolean;
              actionCorrect: boolean;
              validCitations: boolean;
              appropriateEscalation: boolean;
            }[],
        )
        .filter((row) => row.variant === variant);
      return {
        variant,
        measured: observations.length,
        actionCorrect: observations.filter((row) => row.actionCorrect).length,
        validCitations: observations.filter((row) => row.validCitations).length,
        appropriateEscalation: observations.filter(
          (row) => row.appropriateEscalation,
        ).length,
        inferenceFailures: observations.filter((row) => !row.inferenceSucceeded)
          .length,
        unmeasuredScenarios: rows.filter((row) => row.status !== "measured")
          .length,
      };
    }),
    limitations:
      "Four reviewed scenarios, one paired trial each; not a statistical quality claim. Actions are selected deterministically; model output validation and explanation behavior are measured separately. Missing prerequisites/fallbacks are failures or exclusions, never counted as live success. Uses same PostgreSQL validation ledger; makes no writes to Walrus.",
  };
  await mkdir("artifacts/live", { recursive: true });
  await writeFile(
    "artifacts/live/evaluation.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Saved separate live evaluation: artifacts/live/evaluation.json (${modelRequests} model requests). Inspect each metric; no fixture accuracy is combined.`,
  );
  if (
    rows.some(
      (r) =>
        r.status !== "measured" ||
        (r.variants as { inferenceSucceeded: boolean }[]).some(
          (v) => !v.inferenceSucceeded,
        ),
    )
  )
    process.exitCode = 1;
} catch {
  console.error(
    "Live evaluation configuration is incomplete or invalid. Check the reviewed manifest and server configuration; no results were fabricated.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
