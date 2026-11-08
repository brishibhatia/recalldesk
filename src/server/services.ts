import { randomUUID } from "node:crypto";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "../db";
import * as s from "../db/schema";
import {
  issueSchema,
  policySchema,
  remedyIdSchema,
  type MemoryEvent,
} from "../core/types";
import { canonicalAddress, canonicalCoin } from "../core/payment";
import { rankRemedies } from "../core/ranking";
import { AppError } from "./config";
import { hash, newToken, type Principal } from "./auth";
import { fixturePayment } from "./fixtures";
import { verifyTatum } from "./providers/tatum";
import { memoryText, recall } from "./providers/memory";
import { explain } from "./providers/llm";
import { fulfillApprovedAttempt, productAccess } from "./fulfillment";

export const actionSchema = z.object({
  action: z.enum([
    "create_case",
    "create_order",
    "verify",
    "recommend",
    "approve",
    "attempt",
    "outcome",
    "reopen",
    "escalate",
    "reject",
    "request_evidence",
    "message",
    "policy",
    "support_access",
    "revoke_access",
  ]),
  commandId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
  revision: z.number().int().nonnegative().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type Action = z.infer<typeof actionSchema>;
export async function currentPolicy(
  merchantId: string,
  tx: Tx | typeof db = db,
) {
  const [policy] = await tx
    .select()
    .from(s.policies)
    .where(
      and(
        eq(s.policies.merchantId, merchantId),
        lte(s.policies.effectiveAt, new Date()),
      ),
    )
    .orderBy(desc(s.policies.version))
    .limit(1);
  if (!policy)
    throw new AppError(
      "POLICY_MISSING",
      "Configure a current policy before handling cases.",
      409,
    );
  return policy;
}
export async function caseContext(
  p: Principal,
  caseId: string,
  tx: Tx | typeof db = db,
) {
  const [row] = await tx
    .select({
      ticket: s.cases,
      order: s.orders,
      product: s.products,
      customer: s.customers,
    })
    .from(s.cases)
    .innerJoin(
      s.orders,
      and(
        eq(s.cases.orderId, s.orders.id),
        eq(s.orders.merchantId, p.merchantId),
      ),
    )
    .innerJoin(
      s.products,
      and(
        eq(s.orders.productId, s.products.id),
        eq(s.products.merchantId, p.merchantId),
      ),
    )
    .innerJoin(
      s.customers,
      and(
        eq(s.orders.customerId, s.customers.id),
        eq(s.customers.merchantId, p.merchantId),
      ),
    )
    .where(and(eq(s.cases.id, caseId), eq(s.cases.merchantId, p.merchantId)));
  if (!row || (p.role === "customer" && row.order.id !== p.orderId))
    throw new AppError("NOT_FOUND", "Case not found in your workspace.", 404);
  return row;
}
export async function command(
  p: Principal,
  input: Action,
  fn: (tx: Tx) => Promise<Record<string, unknown>>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${p.merchantId}))`,
    );
    const [prior] = await tx
      .select()
      .from(s.commands)
      .where(
        and(
          eq(s.commands.id, input.commandId),
          eq(s.commands.merchantId, p.merchantId),
        ),
      );
    if (prior) return prior.result;
    const result = await fn(tx);
    await tx
      .insert(s.commands)
      .values({ id: input.commandId, merchantId: p.merchantId, result });
    await tx
      .insert(s.auditEvents)
      .values({
        merchantId: p.merchantId,
        actor: p.actor,
        action: input.action,
        reference: input.caseId ?? String(result.id ?? "workspace"),
      });
    return result;
  });
}
function assertRevision(actual: number, expected: number | undefined) {
  if (expected !== actual)
    throw new AppError(
      "STALE_CASE",
      "This case changed. Reload it before making another decision.",
      409,
    );
}
export async function performAction(p: Principal, raw: unknown) {
  const input = actionSchema.parse(raw);
  if (
    p.role === "customer" &&
    !["create_case", "message"].includes(input.action)
  )
    throw new AppError(
      "FORBIDDEN",
      "Only merchant operators can perform that action.",
      403,
    );
  if (input.action === "create_order")
    return command(p, input, async (tx) => {
      const data = z
        .object({
          reference: z
            .string()
            .min(3)
            .max(40)
            .regex(/^[A-Za-z0-9_-]+$/),
          customer: z.string().min(1).max(80),
          expectedPayer: z.string().max(66).nullable(),
          coinType: z.string().min(5).max(200),
          amount: z.string().regex(/^[1-9]\d{0,76}$/),
          decimals: z.number().int().min(0).max(30),
        })
        .parse(input.data);
      const [merchant] = await tx
        .select()
        .from(s.merchants)
        .where(eq(s.merchants.id, p.merchantId));
      const [product] = await tx
        .select()
        .from(s.products)
        .where(eq(s.products.merchantId, p.merchantId))
        .limit(1);
      const [customer] = await tx
        .insert(s.customers)
        .values({ merchantId: p.merchantId, label: data.customer })
        .returning();
      const [order] = await tx
        .insert(s.orders)
        .values({
          merchantId: p.merchantId,
          customerId: customer.id,
          productId: product.id,
          reference: data.reference,
          expectedPayer: data.expectedPayer
            ? canonicalAddress(data.expectedPayer)
            : null,
          recipient: merchant.recipient,
          coinType: canonicalCoin(data.coinType),
          amount: data.amount,
          decimals: data.decimals,
          network: p.mode === "demo" ? "sample" : "mainnet",
          createdAt: new Date(Date.now() - (p.mode === "demo" ? 3600000 : 0)),
          expiresAt: new Date(Date.now() + 86400000),
        })
        .returning();
      return { id: order.id };
    });
  if (input.action === "create_case")
    return command(p, input, async (tx) => {
      const data = z
        .object({
          orderId: z.string().uuid(),
          title: z.string().min(3).max(160),
          issue: issueSchema,
          message: z.string().min(1).max(4000),
          scenario: z
            .enum([
              "valid",
              "wrong-recipient",
              "wrong-asset",
              "wrong-buyer",
              "unavailable",
              "unknown",
              "failed",
              "injection",
            ])
            .optional(),
        })
        .parse(input.data);
      const [order] = await tx
        .select()
        .from(s.orders)
        .where(
          and(
            eq(s.orders.id, data.orderId),
            eq(s.orders.merchantId, p.merchantId),
          ),
        );
      if (!order || (p.role === "customer" && order.id !== p.orderId))
        throw new AppError("NOT_FOUND", "Order not found.", 404);
      const [ticket] = await tx
        .insert(s.cases)
        .values({
          merchantId: p.merchantId,
          orderId: order.id,
          reference: `RD-${randomUUID().slice(0, 8).toUpperCase()}`,
          title: data.title,
          issue: data.issue,
          demoScenario: p.mode === "demo" ? (data.scenario ?? "valid") : null,
        })
        .returning();
      await tx
        .insert(s.messages)
        .values({
          merchantId: p.merchantId,
          caseId: ticket.id,
          role: "customer",
          body: data.message,
        });
      return { id: ticket.id };
    });
  if (input.action === "policy")
    return command(p, input, async (tx) => {
      const old = await currentPolicy(p.merchantId, tx),
        data = policySchema.parse({ ...input.data, version: old.version + 1 });
      await tx
        .insert(s.policies)
        .values({
          merchantId: p.merchantId,
          version: data.version,
          config: data,
        });
      return { version: data.version };
    });
  if (input.action === "support_access") {
    // Tokens are returned once and only hashes persist; this operation intentionally avoids commands.response.
    const orderId = z.string().uuid().parse(input.data.orderId);
    const [order] = await db
      .select()
      .from(s.orders)
      .where(
        and(eq(s.orders.id, orderId), eq(s.orders.merchantId, p.merchantId)),
      );
    if (!order) throw new AppError("NOT_FOUND", "Order not found.", 404);
    const token = newToken();
    const [cap] = await db
      .insert(s.supportAccess)
      .values({
        merchantId: p.merchantId,
        orderId,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();
    await db
      .insert(s.auditEvents)
      .values({
        merchantId: p.merchantId,
        actor: p.actor,
        action: "support_access_issued",
        reference: cap.id,
      });
    return { token, expiresAt: cap.expiresAt.toISOString(), id: cap.id };
  }
  if (input.action === "revoke_access")
    return command(p, input, async (tx) => {
      const accessId = z.string().uuid().parse(input.data.id);
      await tx
        .update(s.supportAccess)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(s.supportAccess.id, accessId),
            eq(s.supportAccess.merchantId, p.merchantId),
          ),
        );
      return { revoked: true };
    });
  const caseId = z.string().uuid().parse(input.caseId);
  const initial = await caseContext(p, caseId);
  const [merchant] = await db
    .select()
    .from(s.merchants)
    .where(eq(s.merchants.id, p.merchantId));
  if (input.action === "verify") {
    const digest = z.string().min(1).max(100).parse(input.data.digest);
    const payment =
      p.mode === "demo"
        ? fixturePayment(
            initial.order,
            initial.ticket.demoScenario ?? "valid",
            digest,
          )
        : await verifyTatum(initial.order, digest, initial.order.customerId);
    return command(p, input, async (tx) => {
      const { ticket, order } = await caseContext(p, caseId, tx);
      assertRevision(ticket.revision, input.revision);
      if (payment.state === "verified") {
        await tx
          .insert(s.allocations)
          .values({
            merchantId: p.merchantId,
            orderId: order.id,
            network: order.network,
            digest,
          })
          .onConflictDoNothing();
        const [allocation] = await tx
          .select()
          .from(s.allocations)
          .where(
            and(
              eq(s.allocations.merchantId, p.merchantId),
              eq(s.allocations.network, order.network),
              eq(s.allocations.digest, digest),
            ),
          );
        if (!allocation || allocation.orderId !== order.id) {
          payment.state = "needs_review";
          payment.code = "PAYMENT_ALREADY_ALLOCATED";
          payment.message =
            "This receipt or order is already allocated to another payment. Merchant review is required.";
        }
      }
      await tx
        .insert(s.paymentChecks)
        .values({ merchantId: p.merchantId, caseId, result: payment });
      await tx
        .update(s.cases)
        .set({ payment, revision: ticket.revision + 1, updatedAt: new Date() })
        .where(eq(s.cases.id, caseId));
      return { payment };
    });
  }
  if (input.action === "recommend") {
    const start = performance.now(),
      policy = await currentPolicy(p.merchantId);
    let recalled: Awaited<ReturnType<typeof recall>> = {
      evidence: [],
      supersededIds: new Set(),
      source: p.mode === "demo" ? "sample-memory" : "walrus-recall",
      limitation: "",
    };
    let recallError: string | null = null;
    try {
      recalled = await recall(
        merchant,
        initial.ticket.issue,
        initial.product.version,
      );
    } catch {
      recallError =
        "Memory recall is unavailable. This decision uses the safe policy baseline; no fresh Walrus evidence was retrieved.";
    }
    const decision = rankRemedies({
      merchantId: p.merchantId,
      issue: initial.ticket.issue,
      productVersion: initial.product.version,
      payment: initial.ticket.payment?.state ?? "pending",
      policy: policy.config,
      evidence: recalled.evidence,
      supersededIds: recalled.supersededIds,
    });
    decision.limitation = [
      recallError,
      recalled.limitation,
      decision.limitation,
    ]
      .filter(Boolean)
      .join(" ");
    const [message] = await db
      .select()
      .from(s.messages)
      .where(
        and(
          eq(s.messages.caseId, caseId),
          eq(s.messages.merchantId, p.merchantId),
        ),
      )
      .orderBy(desc(s.messages.createdAt))
      .limit(1);
    const generated = await explain(decision, p.mode, message?.body ?? "");
    return command(p, input, async (tx) => {
      const { ticket } = await caseContext(p, caseId, tx);
      assertRevision(ticket.revision, input.revision);
      if ((await currentPolicy(p.merchantId, tx)).version !== policy.version)
        throw new AppError(
          "POLICY_CHANGED",
          "Policy changed during recommendation. Generate a new recommendation.",
          409,
        );
      const [recommendation] = await tx
        .insert(s.recommendations)
        .values({
          merchantId: p.merchantId,
          caseId,
          caseRevision: ticket.revision,
          decision,
          explanation: generated.explanation,
          provider: generated.provider,
          providerError:
            [recallError, generated.error].filter(Boolean).join(" ") || null,
          recallSource: recallError ? "unavailable" : recalled.source,
          latencyMs: Math.round(performance.now() - start),
        })
        .returning();
      return { id: recommendation.id };
    });
  }
  return command(p, input, async (tx) => {
    const { ticket, order, product } = await caseContext(p, caseId, tx);
    assertRevision(ticket.revision, input.revision);
    const policy = await currentPolicy(p.merchantId, tx);
    let status = ticket.status,
      result: Record<string, unknown> = { ok: true };
    if (input.action === "message") {
      const body = z.string().min(1).max(4000).parse(input.data.body);
      await tx
        .insert(s.messages)
        .values({
          merchantId: p.merchantId,
          caseId,
          role: p.role === "customer" ? "customer" : "operator-note",
          body,
        });
    } else if (input.action === "approve") {
      const recommendationId = z
        .string()
        .uuid()
        .parse(input.data.recommendationId);
      const [rec] = await tx
        .select()
        .from(s.recommendations)
        .where(
          and(
            eq(s.recommendations.id, recommendationId),
            eq(s.recommendations.caseId, caseId),
            eq(s.recommendations.merchantId, p.merchantId),
          ),
        );
      if (
        !rec ||
        rec.caseRevision !== ticket.revision ||
        rec.decision.policyVersion !== policy.version
      )
        throw new AppError(
          "STALE_RECOMMENDATION",
          "Generate a current recommendation before approving.",
          409,
        );
      const remedy = rec.decision.chosen;
      if (
        !remedy ||
        ticket.payment?.state !== "verified" ||
        !policy.config.allowed.includes(remedy) ||
        policy.config.productVersion !== product.version
      )
        throw new AppError(
          "INELIGIBLE",
          "The proposed action is not allowed by current payment and policy state.",
          409,
        );
      const [pending] = await tx
        .select()
        .from(s.attempts)
        .where(
          and(
            eq(s.attempts.caseId, caseId),
            eq(s.attempts.merchantId, p.merchantId),
          ),
        )
        .orderBy(desc(s.attempts.approvedAt))
        .limit(1);
      if (pending && !pending.outcome)
        throw new AppError(
          "ATTEMPT_OPEN",
          "Record the current approved attempt before approving another.",
          409,
        );
      const [attempt] = await tx
        .insert(s.attempts)
        .values({
          merchantId: p.merchantId,
          caseId,
          recommendationId,
          remedy,
          approvedBy: p.actor,
        })
        .returning();
      status = "approved";
      result = { id: attempt.id };
    } else if (["attempt", "outcome", "reopen"].includes(input.action)) {
      const [attempt] = await tx
        .select()
        .from(s.attempts)
        .where(
          and(
            eq(s.attempts.caseId, caseId),
            eq(s.attempts.merchantId, p.merchantId),
          ),
        )
        .orderBy(desc(s.attempts.approvedAt))
        .limit(1);
      if (!attempt)
        throw new AppError(
          "NO_ATTEMPT",
          "Approve an action before recording an attempt.",
          409,
        );
      if (input.action === "attempt") {
        if (attempt.attemptedAt)
          throw new AppError(
            "ALREADY_ATTEMPTED",
            "This attempt is already recorded.",
            409,
          );
        if (
          !policy.config.allowed.includes(
            remedyIdSchema.parse(attempt.remedy),
          ) ||
          ticket.payment?.state !== "verified"
        )
          throw new AppError(
            "INELIGIBLE",
            "Policy or payment changed; this action can no longer be attempted.",
            409,
          );
        const fulfillment = await fulfillApprovedAttempt(tx, p, attempt.id);
        await tx
          .update(s.attempts)
          .set({
            attemptedAt: new Date(),
            fulfillment,
          })
          .where(eq(s.attempts.id, attempt.id));
        status = "awaiting_outcome";
      } else {
        if (!attempt.attemptedAt)
          throw new AppError(
            "NOT_ATTEMPTED",
            "Record the attempted action before confirming its outcome.",
            409,
          );
        const reopening = input.action === "reopen",
          outcome = reopening
            ? "failed"
            : z.enum(["resolved", "failed"]).parse(input.data.outcome);
        if (reopening && attempt.outcome !== "resolved")
          throw new AppError(
            "NOT_RESOLVED",
            "Only a resolved attempt can be reopened.",
            409,
          );
        if (!reopening && attempt.outcome)
          throw new AppError(
            "OUTCOME_EXISTS",
            "This attempt already has a confirmed outcome.",
            409,
          );
        const [previous] = await tx
          .select()
          .from(s.memories)
          .where(
            and(
              eq(s.memories.attemptId, attempt.id),
              eq(s.memories.merchantId, p.merchantId),
            ),
          )
          .orderBy(desc(s.memories.revision))
          .limit(1);
        const event: MemoryEvent = {
          schemaVersion: 1,
          logicalEventId: randomUUID(),
          merchantId: p.merchantId,
          caseId,
          caseRef: ticket.reference,
          attemptId: attempt.id,
          issue: ticket.issue,
          productVersion: product.version,
          remedy: remedyIdSchema.parse(attempt.remedy),
          outcome,
          confirmation: "merchant",
          policyVersion: policy.version,
          policyEffectiveAt: policy.effectiveAt.toISOString(),
          observedAt: new Date().toISOString(),
          eventCreatedAt: new Date().toISOString(),
          paymentRef:
            ticket.payment?.state === "verified"
              ? `${order.network}:${ticket.payment.digest}`
              : null,
          supersedesEventId: previous?.id ?? null,
          provenance: p.mode === "demo" ? "synthetic-demo" : "live",
        };
        const text = memoryText(event);
        await tx
          .insert(s.memories)
          .values({
            id: event.logicalEventId,
            merchantId: p.merchantId,
            caseId,
            attemptId: attempt.id,
            revision: attempt.revision + 1,
            payload: event,
            text,
            contentHash: hash(text),
          });
        if (previous)
          await tx
            .update(s.memories)
            .set({ supersededBy: event.logicalEventId })
            .where(eq(s.memories.id, previous.id));
        await tx
          .insert(s.jobs)
          .values({ merchantId: p.merchantId, eventId: event.logicalEventId });
        await tx
          .update(s.attempts)
          .set({ outcome, revision: attempt.revision + 1 })
          .where(eq(s.attempts.id, attempt.id));
        status = reopening
          ? "reopened"
          : outcome === "resolved"
            ? "resolved"
            : "open";
        result = { eventId: event.logicalEventId };
      }
    } else if (input.action === "escalate") status = "escalated";
    else if (input.action === "reject") status = "open";
    else if (input.action === "request_evidence") status = "waiting";
    await tx
      .update(s.cases)
      .set({ status, revision: ticket.revision + 1, updatedAt: new Date() })
      .where(eq(s.cases.id, caseId));
    return result;
  });
}
export async function workspace(p: Principal) {
  const [merchant] = await db
    .select()
    .from(s.merchants)
    .where(and(eq(s.merchants.id, p.merchantId), eq(s.merchants.mode, p.mode)));
  if (!merchant) throw new AppError("NOT_FOUND", "Workspace not found.", 404);
  const caseRows = await db
    .select({
      ticket: s.cases,
      customer: s.customers.label,
      orderReference: s.orders.reference,
    })
    .from(s.cases)
    .innerJoin(
      s.orders,
      and(
        eq(s.cases.orderId, s.orders.id),
        eq(s.orders.merchantId, p.merchantId),
      ),
    )
    .innerJoin(
      s.customers,
      and(
        eq(s.orders.customerId, s.customers.id),
        eq(s.customers.merchantId, p.merchantId),
      ),
    )
    .where(
      and(
        eq(s.cases.merchantId, p.merchantId),
        p.role === "customer" ? eq(s.cases.orderId, p.orderId!) : undefined,
      ),
    )
    .orderBy(desc(s.cases.updatedAt));
  const orderRows = await db
    .select()
    .from(s.orders)
    .where(
      and(
        eq(s.orders.merchantId, p.merchantId),
        p.role === "customer" ? eq(s.orders.id, p.orderId!) : undefined,
      ),
    );
  return {
    merchant: {
      id: merchant.id,
      name: merchant.name,
      mode: merchant.mode,
      recipient: merchant.recipient,
      memoryAccountId: merchant.memoryAccountId,
      namespace: merchant.namespace,
    },
    cases: caseRows,
    orders: orderRows,
    policy: p.role === "operator" ? await currentPolicy(p.merchantId) : null,
    role: p.role,
  };
}
export async function caseDetails(p: Principal, id: string) {
  const context = await caseContext(p, id);
  const messages = await db
    .select()
    .from(s.messages)
    .where(
      and(
        eq(s.messages.merchantId, p.merchantId),
        eq(s.messages.caseId, id),
        p.role === "customer" ? eq(s.messages.role, "customer") : undefined,
      ),
    )
    .orderBy(s.messages.createdAt);
  if (p.role === "customer")
    return {
      ticket: {
        id: context.ticket.id,
        title: context.ticket.title,
        status: context.ticket.status,
        revision: context.ticket.revision,
      },
      messages,
      productAccess: await productAccess(p, context.order.id),
    };
  const [recs, attempts, paymentChecks] = await Promise.all([
    db
      .select()
      .from(s.recommendations)
      .where(
        and(
          eq(s.recommendations.merchantId, p.merchantId),
          eq(s.recommendations.caseId, id),
        ),
      )
      .orderBy(desc(s.recommendations.createdAt)),
    db
      .select()
      .from(s.attempts)
      .where(
        and(eq(s.attempts.merchantId, p.merchantId), eq(s.attempts.caseId, id)),
      )
      .orderBy(desc(s.attempts.approvedAt)),
    db
      .select()
      .from(s.paymentChecks)
      .where(
        and(
          eq(s.paymentChecks.merchantId, p.merchantId),
          eq(s.paymentChecks.caseId, id),
        ),
      )
      .orderBy(desc(s.paymentChecks.createdAt)),
  ]);
  return {
    ...context,
    messages,
    recommendations: recs,
    attempts,
    paymentChecks,
    productAccess: await productAccess(p, context.order.id),
    policy: await currentPolicy(p.merchantId),
  };
}
