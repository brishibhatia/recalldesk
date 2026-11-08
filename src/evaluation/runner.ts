import { createHash } from "node:crypto";
import { db } from "../db";
import { evaluations } from "../db/schema";
import { canonicalAddress, verifyTransaction } from "../core/payment";
import {
  rankRemedies,
  templateExplanation,
  validateExplanation,
} from "../core/ranking";
import { DEFAULT_POLICY } from "../server/fixtures";
import {
  DATASET_VERSION,
  EVAL_MERCHANT,
  evaluationOrder,
  heldout,
  learning,
} from "./dataset";

export function evaluate() {
  const start = performance.now();
  const rows = heldout.map((test) => {
    const check = verifyTransaction(
      evaluationOrder,
      {
        digest: `sample-eval:${test.id}`,
        network: test.variation === "network" ? "wrong-network" : "sample",
        success: test.variation !== "execution",
        checkpoint: "sample-checkpoint",
        executedAt: "2026-10-25T12:00:00.000Z",
        payer:
          test.variation === "payer"
            ? canonicalAddress("0xbad")
            : evaluationOrder.expectedPayer,
        recipient:
          test.variation === "recipient"
            ? canonicalAddress("0xbad")
            : evaluationOrder.recipient,
        coinType:
          test.variation === "asset"
            ? "0x3::sample::OTHER"
            : evaluationOrder.coinType,
        amount:
          test.variation === "amount"
            ? "9007199254740992"
            : evaluationOrder.amount,
        decimals: 9,
        supported: test.variation !== "shape",
      },
      evaluationOrder.customerId,
      "sample-tatum",
    );
    const payment = test.paymentOverride ?? check.state;
    const common = {
      merchantId: EVAL_MERCHANT,
      issue: test.issue,
      productVersion: "studio-2.1",
      policy: test.policy ?? DEFAULT_POLICY,
      payment,
      supersededIds: new Set(test.superseded),
    };
    const baseline = rankRemedies({ ...common, evidence: [] }),
      memory = rankRemedies({ ...common, evidence: learning });
    const output = validateExplanation(templateExplanation(memory), memory);
    const citationValid = output.memoryIds.every((id) =>
      memory.evidence.some((e) => e.event.logicalEventId === id),
    );
    const failedRemedies = new Set(
      memory.evidence
        .filter((e) => e.event.outcome === "failed")
        .map((e) => e.event.remedy),
    );
    return {
      id: test.id,
      title: test.title,
      expected: test.expected,
      baseline: baseline.chosen,
      memory: memory.chosen,
      baselineCorrect: baseline.chosen === test.expected,
      memoryCorrect: memory.chosen === test.expected,
      paymentState: payment,
      paymentCode: check.code,
      citationValid,
      evidenceIds: output.memoryIds,
      baselineRepeatsFailed:
        baseline.chosen !== null && failedRemedies.has(baseline.chosen),
      memoryRepeatsFailed:
        memory.chosen !== null && failedRemedies.has(memory.chosen),
      unsupportedApproval: payment !== "verified" && memory.chosen !== null,
      failureReason:
        memory.chosen !== test.expected
          ? "Selected remedy differs from the held-out expected action"
          : null,
    };
  });
  return {
    version: DATASET_VERSION,
    datasetHash: createHash("sha256")
      .update(JSON.stringify({ learning, heldout }))
      .digest("hex"),
    runAt: new Date().toISOString(),
    providerMode: "synthetic-deterministic",
    model: "sample-template-v1",
    trials: 1,
    learningCount: learning.length,
    heldoutCount: rows.length,
    latencyMs: Math.round((performance.now() - start) * 100) / 100,
    providerFailures: 0,
    baselineCorrect: rows.filter((r) => r.baselineCorrect).length,
    memoryCorrect: rows.filter((r) => r.memoryCorrect).length,
    baselineRepeatsFailed: rows.filter((r) => r.baselineRepeatsFailed).length,
    memoryRepeatsFailed: rows.filter((r) => r.memoryRepeatsFailed).length,
    unsupportedApprovals: rows.filter((r) => r.unsupportedApproval).length,
    invalidCitations: rows.filter((r) => !r.citationValid).length,
    rows,
    limitations:
      "Fixed small synthetic dataset; one deterministic trial. Measures policy/payment/ranking behavior, not real-world LLM quality, causal improvement, live provider reliability or network latency. Allocation and tenant attacks are covered by database integration tests.",
  };
}
export async function runEvaluation(merchantId: string) {
  const report = evaluate();
  const [run] = await db
    .insert(evaluations)
    .values({
      merchantId,
      datasetVersion: report.version,
      datasetHash: report.datasetHash,
      report,
    })
    .returning();
  return run;
}
