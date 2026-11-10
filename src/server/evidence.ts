import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import * as s from "../db/schema";
import { rankRemedies, templateExplanation } from "../core/ranking";
import type { Principal } from "./auth";
import { AppError } from "./config";
import { caseDetails } from "./services";

export async function compareCase(p: Principal, caseId: string) {
  if (p.role !== "operator")
    throw new AppError("FORBIDDEN", "Merchant access required.", 403);
  const detail = await caseDetails(p, caseId);
  if (!("order" in detail))
    throw new AppError("FORBIDDEN", "Merchant access required.", 403);
  const recommendation = detail.recommendations[0];
  if (
    !recommendation ||
    recommendation.caseRevision !== detail.ticket.revision ||
    recommendation.decision.policyVersion !== detail.policy.version
  )
    throw new AppError(
      "STALE_RECOMMENDATION",
      "Generate a fresh recommendation before comparing the two paths.",
      409,
    );
  const common = {
    merchantId: p.merchantId,
    issue: detail.ticket.issue,
    productVersion: detail.product.version,
    payment: detail.ticket.payment?.state ?? ("pending" as const),
    policy: detail.policy.config,
  };
  const baseline = rankRemedies({ ...common, evidence: [] });
  // Replay the exact validated evidence selected for this snapshot. No second retrieval, model, or payment change.
  const memory = rankRemedies({
    ...common,
    evidence: recommendation.decision.evidence,
  });
  return {
    comparedAt: new Date().toISOString(),
    recommendationId: recommendation.id,
    policyVersion: detail.policy.version,
    paymentCheckedAt: detail.ticket.payment?.checkedAt ?? null,
    baseline,
    memory,
    difference: templateExplanation(memory).memoryDifference,
    scope:
      "Deterministic replay of one recommendation snapshot. Both paths use the same payment and current policy; only access to its retrieved evidence differs.",
  };
}

/** Explicit projection: never export customer names, conversation text, payer addresses, cookies or credentials. */
export async function evidenceReport(p: Principal, caseId: string) {
  if (p.role !== "operator")
    throw new AppError("FORBIDDEN", "Merchant access required.", 403);
  const detail = await caseDetails(p, caseId);
  if (!("order" in detail))
    throw new AppError("FORBIDDEN", "Merchant access required.", 403);
  const records = await db
    .select({ event: s.memories, job: s.jobs })
    .from(s.memories)
    .innerJoin(
      s.jobs,
      and(
        eq(s.jobs.eventId, s.memories.id),
        eq(s.jobs.merchantId, p.merchantId),
      ),
    )
    .where(eq(s.memories.merchantId, p.merchantId));
  const latest = detail.recommendations[0];
  const referenced = new Set(
    latest?.decision.evidence.map((e) => e.event.logicalEventId) ?? [],
  );
  const [evaluation] = await db
    .select()
    .from(s.evaluations)
    .where(eq(s.evaluations.merchantId, p.merchantId))
    .orderBy(desc(s.evaluations.createdAt))
    .limit(1);
  const payment = detail.ticket.payment;
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    mode: p.mode,
    case: {
      id: detail.ticket.id,
      reference: detail.ticket.reference,
      issue: detail.ticket.issue,
      productVersion: detail.product.version,
    },
    labels:
      p.mode === "demo"
        ? [
            "Synthetic cases",
            "Simulated payment, memory and model providers",
            "Real local application state",
          ]
        : [
            "Live provider configuration",
            "Synthetic case content is labeled on individual memories",
            "Completed storage is a relayer completion signal",
          ],
    payment: payment
      ? {
          state: payment.state,
          code: payment.code,
          provider: payment.provider,
          checkedAt: payment.checkedAt,
          network: payment.network ?? detail.order.network,
          digest: payment.digest,
          checkpoint: payment.checkpoint ?? null,
          amount: payment.amount ?? null,
          coinType: payment.coinType ?? null,
          passedChecks:
            payment.state === "verified"
              ? [
                  "network",
                  "successful execution and checkpoint",
                  "recipient",
                  "canonical asset",
                  "integer amount and decimals",
                  "pre-associated payer and order",
                  "order time window",
                  "unique receipt allocation",
                ]
              : [],
          checkNote:
            payment.state === "verified"
              ? "All required checks passed at the recorded verification time."
              : "Verification did not pass; individual partial checks are not asserted.",
        }
      : null,
    memoryWrites: records
      .filter((r) => r.event.caseId === caseId || referenced.has(r.event.id))
      .map(({ event, job }) => ({
        logicalEventId: event.id,
        sourceCase: event.payload.caseRef,
        sourceCaseId: event.caseId,
        attemptId: event.attemptId,
        remedy: event.payload.remedy,
        outcome: event.payload.outcome,
        provenance: event.payload.provenance,
        productVersion: event.payload.productVersion,
        policyVersion: event.payload.policyVersion,
        observedAt: event.payload.observedAt,
        status: job.status,
        completedAt: job.completedAt,
        providerJobId: job.providerJobId,
        storageReference: job.providerMemoryId,
        supersededBy: event.supersededBy,
        usedInDecision: referenced.has(event.id),
        realMainnetCompleted:
          p.mode === "live" &&
          job.status === "completed" &&
          job.receipt?.network === "mainnet",
      })),
    recall: latest
      ? {
          recommendationId: latest.id,
          snapshotAt: latest.createdAt,
          source: latest.recallSource,
          evidence: latest.decision.evidence.map((e) => ({
            logicalEventId: e.event.logicalEventId,
            storageReference: e.providerId,
            source: e.source,
            caseRef: e.event.caseRef,
          })),
          limitation: latest.decision.limitation,
        }
      : null,
    decision: latest
      ? {
          currentPolicyVersion: detail.policy.version,
          recordedPolicyVersion: latest.decision.policyVersion,
          current:
            latest.caseRevision === detail.ticket.revision &&
            latest.decision.policyVersion === detail.policy.version,
          policyAllowedRemedies: detail.policy.config.allowed,
          baseline: latest.decision.baseline,
          selected: latest.decision.chosen,
          scores: latest.decision.scores,
          explanation: templateExplanation(latest.decision),
          explanationProvider: latest.provider,
          inferenceSucceeded:
            /^(?:gemini|openai):[a-zA-Z0-9._:/-]+$/.test(latest.provider) &&
            latest.providerError === null,
          explanationModel: /^(?:gemini|openai):/.test(latest.provider)
            ? latest.provider.slice(latest.provider.indexOf(":") + 1)
            : null,
          providerError: latest.providerError,
        }
      : null,
    evaluation: evaluation
      ? {
          id: evaluation.id,
          datasetVersion: evaluation.datasetVersion,
          datasetHash: evaluation.datasetHash,
          createdAt: evaluation.createdAt,
          report: evaluation.report,
        }
      : null,
    redaction:
      "Customer identity, payer address, conversation text, access capabilities and model-written free text omitted. Transaction and storage references remain public evidence identifiers. Explanation is reconstructed deterministically from the recorded decision.",
  };
}
