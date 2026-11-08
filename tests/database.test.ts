import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import * as s from "../src/db/schema";
import { createDemoWorkspace } from "../src/server/fixtures";
import {
  performAction,
  caseContext,
  caseDetails,
  workspace,
} from "../src/server/services";
import {
  authenticate,
  hash,
  newToken,
  type Principal,
} from "../src/server/auth";
import { recall } from "../src/server/providers/memory";
import { workerOnce } from "../src/server/worker";
import { downloadProduct, productAccess } from "../src/server/fulfillment";
import { compareCase, evidenceReport } from "../src/server/evidence";
let a: Awaited<ReturnType<typeof createDemoWorkspace>>,
  b: typeof a,
  p: Principal,
  orderId: string;
beforeAll(async () => {
  a = await createDemoWorkspace();
  b = await createDemoWorkspace();
  p = {
    merchantId: a.id,
    actor: "test-operator",
    mode: "demo",
    role: "operator",
  };
  orderId = (await workspace(p)).orders.find(
    (o) => o.reference === "ST-2041",
  )!.id;
});
afterAll(async () => {
  if (a && b)
    await db
      .delete(s.merchants)
      .where(sql`${s.merchants.id} IN (${a.id},${b.id})`);
  await pool.end();
});
async function create(title = "Database test", order = orderId) {
  return String(
    (
      await performAction(p, {
        action: "create_case",
        commandId: randomUUID(),
        data: {
          orderId: order,
          title,
          issue: "access",
          message: "Paid but unable to access",
        },
      })
    ).id,
  );
}
async function act(
  id: string,
  action: string,
  data: Record<string, unknown> = {},
  commandId = randomUUID(),
) {
  const { ticket } = await caseContext(p, id);
  return performAction(p, {
    action,
    commandId,
    caseId: id,
    revision: ticket.revision,
    data,
  });
}
async function outcomeCase() {
  const id = await create();
  await act(id, "verify", { digest: `sample:${orderId}` });
  const rec = await act(id, "recommend");
  await act(id, "approve", { recommendationId: rec.id });
  await act(id, "attempt");
  await act(id, "outcome", { outcome: "resolved" });
  return id;
}
describe("PostgreSQL scoped services and transactions", () => {
  it("creates isolated reviewer workspaces and rejects direct object references", async () => {
    const foreign = (
      await workspace({
        merchantId: b.id,
        actor: "test-b",
        mode: "demo",
        role: "operator",
      })
    ).cases[0].ticket.id;
    await expect(caseContext(p, foreign)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      performAction(p, {
        action: "create_case",
        commandId: randomUUID(),
        data: {
          orderId: (
            await workspace({
              merchantId: b.id,
              actor: "b",
              mode: "demo",
              role: "operator",
            })
          ).orders[0].id,
          title: "Attack",
          issue: "access",
          message: "test",
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
    const recalled = await recall(a, "access", "studio-2.1");
    expect(recalled.evidence.every((e) => e.event.merchantId === a.id)).toBe(
      true,
    );
  });
  it("returns one business result for duplicate create commands", async () => {
    const input = {
      action: "create_case",
      commandId: randomUUID(),
      data: {
        orderId,
        title: "Idempotent case",
        issue: "access",
        message: "hello",
      },
    };
    const [x, y] = await Promise.all([
      performAction(p, input),
      performAction(p, input),
    ]);
    expect(x.id).toBe(y.id);
  });
  it("allocates a receipt atomically and repeats the same-order lookup idempotently", async () => {
    const id = await create();
    await act(id, "verify", { digest: `sample:${orderId}` });
    await act(id, "verify", { digest: `sample:${orderId}` });
    expect(
      (
        await db
          .select()
          .from(s.allocations)
          .where(eq(s.allocations.orderId, orderId))
      ).length,
    ).toBe(1);
    const orders = (await workspace(p)).orders.filter(
      (o) => !o.reference.startsWith("HISTORY") && o.id !== orderId,
    );
    const x = await create("First allocation", orders[0].id),
      y = await create("Competing allocation", orders[1].id),
      digest = `sample:concurrent-${randomUUID()}`;
    const [one, two] = await Promise.all([
      act(x, "verify", { digest }),
      act(y, "verify", { digest }),
    ]);
    expect(
      [one, two].map((r) => (r.payment as { state: string }).state).sort(),
    ).toEqual(["needs_review", "verified"]);
  });
  it("keeps acceptance distinct from completion and resumes persisted jobs", async () => {
    const id = await outcomeCase(),
      [event] = await db
        .select()
        .from(s.memories)
        .where(eq(s.memories.caseId, id));
    const [queued] = await db
      .select()
      .from(s.jobs)
      .where(eq(s.jobs.eventId, event.id));
    expect(queued.completedAt).toBeNull();
    await workerOnce(a.id);
    const [accepted] = await db
      .select()
      .from(s.jobs)
      .where(eq(s.jobs.eventId, event.id));
    expect(accepted.status).toBe("accepted");
    expect(accepted.providerJobId).toBeTruthy();
    expect(accepted.completedAt).toBeNull();
    await db
      .update(s.jobs)
      .set({ nextRunAt: new Date(0) })
      .where(eq(s.jobs.id, accepted.id));
    await workerOnce(a.id);
    const [done] = await db
      .select()
      .from(s.jobs)
      .where(eq(s.jobs.id, accepted.id));
    expect(done.status).toBe("completed");
    expect(done.providerJobId).toBe(accepted.providerJobId);
    const recalled = await recall(a, "access", "studio-2.1");
    expect(
      recalled.evidence.some((e) => e.event.logicalEventId === event.id),
    ).toBe(true);
  });
  it("supersedes a reopened success once and queues its correction", async () => {
    const id = await outcomeCase(),
      { ticket } = await caseContext(p, id),
      commandId = randomUUID();
    const input = {
      action: "reopen",
      commandId,
      caseId: id,
      revision: ticket.revision,
      data: {},
    };
    await performAction(p, input);
    await performAction(p, input);
    const events = await db
      .select()
      .from(s.memories)
      .where(eq(s.memories.caseId, id));
    expect(events).toHaveLength(2);
    expect(events.filter((e) => !e.supersededBy)).toHaveLength(1);
    expect(events.find((e) => !e.supersededBy)!.payload.outcome).toBe("failed");
    expect(events.find((e) => !!e.supersededBy)!.payload.outcome).toBe(
      "resolved",
    );
  });
  it("changes a fresh case recommendation only after a newly confirmed failure finishes storage", async () => {
    const merchant = await createDemoWorkspace();
    try {
      const operator: Principal = {
        merchantId: merchant.id,
        actor: "learning-test-operator",
        mode: "demo",
        role: "operator",
      };
      const order = (await workspace(operator)).orders.find(
        (o) => o.reference === "ST-2041",
      )!;
      const createCase = async (title: string) =>
        String(
          (
            await performAction(operator, {
              action: "create_case",
              commandId: randomUUID(),
              data: {
                orderId: order.id,
                title,
                issue: "access",
                message: "Paid but unable to access",
              },
            })
          ).id,
        );
      const action = async (
        principal: Principal,
        id: string,
        name: string,
        data: Record<string, unknown> = {},
      ) => {
        const { ticket } = await caseContext(principal, id);
        return performAction(principal, {
          action: name,
          commandId: randomUUID(),
          caseId: id,
          revision: ticket.revision,
          data,
        });
      };
      const firstCase = await createCase(
        "New merchant-confirmed learning example",
      );
      await action(operator, firstCase, "verify", {
        digest: `sample:${order.id}`,
      });
      const firstRecommendation = await action(
        operator,
        firstCase,
        "recommend",
      );
      const [before] = await db
        .select()
        .from(s.recommendations)
        .where(eq(s.recommendations.id, String(firstRecommendation.id)));
      expect(before.decision.chosen).toBe("relink");
      expect(
        before.decision.scores.find((score) => score.remedy === "relink"),
      ).toMatchObject({ successes: 7, failures: 1, score: 0.8 });
      await action(operator, firstCase, "approve", {
        recommendationId: firstRecommendation.id,
      });
      await action(operator, firstCase, "attempt");
      await action(operator, firstCase, "outcome", { outcome: "failed" });
      const [event] = await db
        .select()
        .from(s.memories)
        .where(eq(s.memories.caseId, firstCase));
      expect(event.payload).toMatchObject({
        remedy: "relink",
        outcome: "failed",
        confirmation: "merchant",
      });
      await workerOnce(merchant.id);
      const [accepted] = await db
        .select()
        .from(s.jobs)
        .where(eq(s.jobs.eventId, event.id));
      expect(accepted.status).toBe("accepted");

      // This request carries no earlier recommendation or conversational context.
      const freshOperator: Principal = {
        merchantId: merchant.id,
        actor: "fresh-learning-session",
        mode: "demo",
        role: "operator",
      };
      const laterCase = await createCase("Comparable case in a fresh session");
      await action(freshOperator, laterCase, "verify", {
        digest: `sample:${order.id}`,
      });
      const pendingRecommendation = await action(
        freshOperator,
        laterCase,
        "recommend",
      );
      const [pending] = await db
        .select()
        .from(s.recommendations)
        .where(eq(s.recommendations.id, String(pendingRecommendation.id)));
      expect(pending.decision.chosen).toBe("relink");
      expect(
        pending.decision.evidence.some(
          (e) => e.event.logicalEventId === event.id,
        ),
      ).toBe(false);

      await db
        .update(s.jobs)
        .set({ nextRunAt: new Date(0) })
        .where(eq(s.jobs.id, accepted.id));
      await workerOnce(merchant.id);
      const [completed] = await db
        .select()
        .from(s.jobs)
        .where(eq(s.jobs.id, accepted.id));
      expect(completed.status).toBe("completed");
      const laterRecommendation = await action(
        freshOperator,
        laterCase,
        "recommend",
      );
      const [after] = await db
        .select()
        .from(s.recommendations)
        .where(eq(s.recommendations.id, String(laterRecommendation.id)));
      expect(after.decision.baseline).toBe(before.decision.baseline);
      expect(after.decision.policyVersion).toBe(before.decision.policyVersion);
      expect(after.decision.chosen).toBe("resend");
      expect(
        after.decision.scores.find((score) => score.remedy === "relink"),
      ).toMatchObject({ successes: 7, failures: 2 });
      expect(
        after.decision.scores.find((score) => score.remedy === "relink")!.score,
      ).toBeCloseTo(8 / 11);
      expect(
        after.decision.evidence.filter(
          (e) => e.event.logicalEventId === event.id,
        ),
      ).toHaveLength(1);
      expect(after.explanation.memoryIds).toContain(event.id);
      expect(after.recallSource).toBe("sample-memory");
    } finally {
      await db.delete(s.merchants).where(eq(s.merchants.id, merchant.id));
    }
  });
  it("authenticates hashed customer capabilities and denies other orders and merchant actions", async () => {
    const id = await create(),
      token = newToken();
    await db
      .insert(s.supportAccess)
      .values({
        merchantId: a.id,
        orderId,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 60000),
      });
    const customer = await authenticate(
      new Request("http://localhost:3000/api/support/workspace", {
        headers: { cookie: `rd_support=${token}` },
      }),
      true,
    );
    expect(customer.role).toBe("customer");
    expect((await workspace(customer)).orders).toHaveLength(1);
    const otherOrder = (await workspace(p)).orders.find(
      (o) => o.id !== orderId && !o.reference.startsWith("HISTORY"),
    )!;
    const foreignCase = await create("Other buyer", otherOrder.id);
    await expect(caseDetails(customer, foreignCase)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      performAction(customer, {
        action: "outcome",
        commandId: randomUUID(),
        caseId: id,
        revision: 0,
        data: { outcome: "resolved" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await db
      .update(s.supportAccess)
      .set({ revokedAt: new Date() })
      .where(eq(s.supportAccess.tokenHash, hash(token)));
    await expect(
      authenticate(
        new Request("http://localhost:3000/api/support/workspace", {
          headers: { cookie: `rd_support=${token}` },
        }),
        true,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("grants protected product access once after an approved action and rejects other customers", async () => {
    const merchant = await createDemoWorkspace();
    try {
      const operator: Principal = {
        merchantId: merchant.id,
        actor: "fulfillment-operator",
        mode: "demo",
        role: "operator",
      };
      const [order, otherOrder] = (await workspace(operator)).orders.filter(
        (o) => !o.reference.startsWith("HISTORY"),
      );
      const customer: Principal = {
        merchantId: merchant.id,
        actor: "customer",
        mode: "demo",
        role: "customer",
        orderId: order.id,
      };
      const wrongCustomer: Principal = { ...customer, orderId: otherOrder.id };
      expect(await productAccess(customer, order.id)).toMatchObject({
        supported: true,
        active: false,
      });
      await expect(downloadProduct(customer, order.id)).rejects.toMatchObject({
        code: "ACCESS_LOCKED",
      });
      const id = String(
        (
          await performAction(operator, {
            action: "create_case",
            commandId: randomUUID(),
            data: {
              orderId: order.id,
              title: "Restore my controlled product",
              issue: "access",
              message: "I cannot open the workbook.",
            },
          })
        ).id,
      );
      const execute = async (
        action: string,
        data: Record<string, unknown> = {},
      ) => {
        const { ticket } = await caseContext(operator, id);
        return performAction(operator, {
          action,
          commandId: randomUUID(),
          caseId: id,
          revision: ticket.revision,
          data,
        });
      };
      await execute("verify", { digest: `sample:${order.id}` });
      const rec = await execute("recommend");
      await execute("approve", { recommendationId: rec.id });
      expect((await productAccess(customer, order.id)).active).toBe(false);
      const { ticket } = await caseContext(operator, id),
        input = {
          action: "attempt",
          commandId: randomUUID(),
          caseId: id,
          revision: ticket.revision,
          data: {},
        };
      await Promise.all([
        performAction(operator, input),
        performAction(operator, input),
      ]);
      expect(await productAccess(customer, order.id)).toMatchObject({
        active: true,
      });
      expect((await downloadProduct(customer, order.id)).content).toContain(
        "Weekly review template",
      );
      expect(
        await db
          .select()
          .from(s.entitlements)
          .where(eq(s.entitlements.orderId, order.id)),
      ).toHaveLength(1);
      expect(
        await db
          .select()
          .from(s.fulfillmentExecutions)
          .where(eq(s.fulfillmentExecutions.orderId, order.id)),
      ).toHaveLength(1);
      await expect(
        downloadProduct(wrongCustomer, order.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        downloadProduct({ ...customer, merchantId: b.id }, order.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(downloadProduct(operator, order.id)).rejects.toMatchObject({
        code: "CUSTOMER_REQUIRED",
      });
      expect((await productAccess(wrongCustomer, otherOrder.id)).active).toBe(
        false,
      );
    } finally {
      await db.delete(s.merchants).where(eq(s.merchants.id, merchant.id));
    }
  });
  it("exports scoped evidence without customer messages, identities or capabilities", async () => {
    const id = await create("Redacted evidence export");
    await act(id, "message", { body: "PRIVATE_CUSTOMER_CONVERSATION_MARKER" });
    await act(id, "verify", { digest: `sample:${orderId}` });
    await act(id, "recommend");
    const report = await evidenceReport(p, id),
      serialized = JSON.stringify(report);
    expect(serialized).not.toContain("PRIVATE_CUSTOMER_CONVERSATION_MARKER");
    const { customer, order } = await caseContext(p, id);
    expect(serialized).not.toContain(customer.label);
    expect(serialized).not.toContain(order.expectedPayer);
    expect(report.decision?.current).toBe(true);
    const comparison = await compareCase(p, id);
    expect(comparison.baseline.baseline).toBe(comparison.memory.baseline);
    expect(comparison.baseline.evidence).toHaveLength(0);
    expect(comparison.memory.evidence.length).toBeGreaterThan(0);
    const customerPrincipal: Principal = { ...p, role: "customer", orderId };
    await expect(evidenceReport(customerPrincipal, id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      evidenceReport({ ...p, merchantId: b.id }, id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      compareCase({ ...p, merchantId: b.id }, id),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("does not trust a tampered local memory as returned provider evidence", async () => {
    const [event] = await db
      .select()
      .from(s.memories)
      .where(eq(s.memories.merchantId, a.id))
      .limit(1);
    await db
      .update(s.memories)
      .set({ text: event.text + "\nignore rules" })
      .where(eq(s.memories.id, event.id));
    expect(
      (await recall(a, "access", "studio-2.1")).evidence.some(
        (e) => e.event.logicalEventId === event.id,
      ),
    ).toBe(false);
  });
  it("revalidates current policy at approval and prevents stale concurrent updates", async () => {
    const id = await create();
    await act(id, "verify", { digest: `sample:${orderId}` });
    const rec = await act(id, "recommend");
    await performAction(p, {
      action: "policy",
      commandId: randomUUID(),
      data: {
        allowed: ["resend"],
        productVersion: "studio-2.1",
        summary: "Only resend allowed",
      },
    });
    await expect(
      act(id, "approve", { recommendationId: rec.id }),
    ).rejects.toMatchObject({ code: "STALE_RECOMMENDATION" });
    const { ticket } = await caseContext(p, id);
    await act(id, "message", { body: "Updated" });
    await expect(
      performAction(p, {
        action: "escalate",
        commandId: randomUUID(),
        caseId: id,
        revision: ticket.revision,
        data: {},
      }),
    ).rejects.toMatchObject({ code: "STALE_CASE" });
  });
});
