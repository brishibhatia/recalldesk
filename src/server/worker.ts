import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import * as s from "../db/schema";
import { mode } from "./config";
import { memoryClient } from "./providers/memory";

export async function workerOnce(merchantId?: string) {
  await db
    .insert(s.workerHeartbeats)
    .values({ id: `worker-${mode()}`, mode: mode(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: s.workerHeartbeats.id,
      set: { updatedAt: new Date() },
    });
  const leaseToken = randomUUID();
  const claimed = await db.transaction(async (tx) => {
    const result = await tx.execute(
      sql`SELECT j.id FROM memory_jobs j JOIN merchants m ON m.id=j.merchant_id WHERE m.mode=${mode()} AND (${merchantId ?? null}::uuid IS NULL OR m.id=${merchantId ?? null}::uuid) AND j.status IN ('queued','submitting','accepted','processing','retrying') AND j.next_run_at<=now() AND (j.lease_until IS NULL OR j.lease_until<now()) ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`,
    );
    if (!result.rows.length) return null;
    const id = String(result.rows[0].id);
    const [job] = await tx
      .update(s.jobs)
      .set({ leaseUntil: new Date(Date.now() + 45000), leaseToken })
      .where(eq(s.jobs.id, id))
      .returning();
    return job;
  });
  if (!claimed) return false;
  const [record] = await db
    .select({ event: s.memories, merchant: s.merchants })
    .from(s.memories)
    .innerJoin(s.merchants, eq(s.merchants.id, s.memories.merchantId))
    .where(
      and(
        eq(s.memories.id, claimed.eventId),
        eq(s.memories.merchantId, claimed.merchantId),
      ),
    );
  const guard = and(
    eq(s.jobs.id, claimed.id),
    eq(s.jobs.leaseToken, leaseToken),
  );
  const update = async (values: Partial<typeof s.jobs.$inferInsert>) =>
    db
      .update(s.jobs)
      .set({ ...values, leaseUntil: null, leaseToken: null })
      .where(guard);
  if (
    record.merchant.mode === "live" &&
    process.env.ALLOW_MAINNET_WRITES !== "true"
  ) {
    await update({
      error:
        "Mainnet writes are disabled. Configure ALLOW_MAINNET_WRITES only after account review and authorization.",
      nextRunAt: new Date(Date.now() + 60000),
    });
    return true;
  }
  let client: ReturnType<typeof memoryClient> | undefined;
  try {
    if (record.merchant.mode === "demo") {
      if (!claimed.providerJobId)
        await update({
          status: "accepted",
          providerJobId: `sample-job:${claimed.eventId}`,
          nextRunAt: new Date(Date.now() + 2500),
          error: null,
        });
      else
        await update({
          status: "completed",
          providerMemoryId: `sample:${claimed.eventId}`,
          receipt: {
            provider: "sample-memory",
            status: "done",
            synthetic: true,
          },
          completedAt: new Date(),
          error: null,
        });
    } else {
      client = memoryClient(record.merchant);
      if (!claimed.providerJobId) {
        const [check] = await db
          .select()
          .from(s.providerChecks)
          .where(
            and(
              eq(s.providerChecks.merchantId, claimed.merchantId),
              eq(s.providerChecks.provider, "walrus"),
            ),
          )
          .orderBy(sql`${s.providerChecks.createdAt} DESC`)
          .limit(1);
        if (
          check?.state !== "live" ||
          Date.now() - check.createdAt.getTime() > 3600000
        )
          throw Object.assign(new Error("Readiness check required"), {
            code: "READINESS_REQUIRED",
          });
        await db.update(s.jobs).set({ status: "submitting" }).where(guard);
        const accepted = await client.remember(
          record.event.text,
          record.merchant.namespace,
          { idempotencyKey: `recalldesk:${claimed.eventId}`, dedupe: true },
        );
        if (!accepted.job_id) throw new Error("Provider omitted job ID");
        await update({
          providerJobId: accepted.job_id,
          status: "accepted",
          error: null,
          nextRunAt: new Date(Date.now() + 5000),
        });
      } else {
        const state = await client.getRememberStatus(claimed.providerJobId);
        if (state.job_id !== claimed.providerJobId)
          throw new Error("Unexpected job identity");
        if (state.status === "failed" || state.status === "not_found")
          await update({
            status: "failed",
            error: `Provider job ${state.status}; review the stored job ID. No new submission was made.`,
          });
        else if (state.status === "done") {
          const completed = await client.waitForRememberJob(
            claimed.providerJobId,
            { timeoutMs: 10000, pollIntervalMs: 1000 },
          );
          if (
            !completed.blob_id ||
            completed.namespace !== record.merchant.namespace ||
            completed.owner !== record.merchant.memoryOwnerAddress
          )
            throw new Error("Completion scope mismatch");
          await update({
            status: "completed",
            providerMemoryId: completed.blob_id,
            receipt: {
              jobId: claimed.providerJobId,
              blobId: completed.blob_id,
              owner: completed.owner,
              namespace: completed.namespace,
              network: "mainnet",
              signal: "relayer-job-done",
            },
            completedAt: new Date(),
            error: null,
          });
        } else
          await update({
            status: "processing",
            nextRunAt: new Date(Date.now() + 5000),
            error: null,
          });
      }
    }
  } catch (error) {
    const e = error as {
      code?: string;
      status?: number;
      retryAfterSeconds?: number;
    };
    const tries = claimed.attempts + 1,
      permanent = [401, 403, 400, 409].includes(e.status ?? 0);
    await update({
      status: permanent
        ? "failed"
        : tries >= 5
          ? "uncertain"
          : "retrying",
      attempts: tries,
      error:
        e.code === "READINESS_REQUIRED"
          ? "Run a successful Walrus ownership and delegate readiness check before writing."
          : "Provider operation failed; the job ID and stable operation key are preserved. Inspect readiness before resuming.",
      nextRunAt: new Date(
        Date.now() +
          Math.max(e.retryAfterSeconds ?? 0, Math.min(300, 2 ** tries)) * 1000,
      ),
    });
  } finally {
    client?.destroy();
  }
  return true;
}
