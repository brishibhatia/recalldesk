import { mkdir, writeFile } from "node:fs/promises";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import * as s from "../src/db/schema";
import { mode, required } from "../src/server/config";
import { seedLearningHistory } from "../src/server/fixtures";
import { checkProviders } from "../src/server/readiness";
import { recall } from "../src/server/providers/memory";
import { workerOnce } from "../src/server/worker";
import {
  completedMainnetJob,
  historyReferences,
  mainnetSeedCount,
} from "./lib/mainnet-seed-plan";

class ShowcaseStop extends Error {}

const args = process.argv.slice(2);
const value = (flag: string) => args[args.indexOf(flag) + 1];
try {
  if (
    mode() !== "live" ||
    process.env.ALLOW_MAINNET_WRITES !== "true" ||
    !args.includes("--confirm-account") ||
    value("--confirm-account") !== required("MEMWAL_ACCOUNT_ID") ||
    !args.includes("--confirm-namespace") ||
    value("--confirm-namespace") !== required("MEMWAL_NAMESPACE")
  )
    throw new ShowcaseStop(
      "Mainnet writes require a separately authorized live run, an enabled process-only write flag, and matching account/namespace confirmations.",
    );
  const count = mainnetSeedCount(args);
  const merchantId = required("LIVE_MERCHANT_ID");
  const [merchant] = await db
    .select()
    .from(s.merchants)
    .where(and(eq(s.merchants.id, merchantId), eq(s.merchants.mode, "live")));
  if (!merchant?.memoryOwnerAddress)
    throw new ShowcaseStop(
      "Configured live merchant and verified owner required.",
    );
  const [product] = await db
    .select()
    .from(s.products)
    .where(eq(s.products.merchantId, merchantId));
  if (!product) throw new ShowcaseStop("Configured product required.");
  const checks = await checkProviders({
    merchantId,
    actor: "mainnet-showcase",
    mode: "live",
    role: "operator",
  });
  if (
    !checks.providers.some((p) => p.provider === "walrus" && p.state === "live")
  )
    throw new ShowcaseStop(
      "Authenticated Walrus ownership and recall checks must pass before writes.",
    );

  const targets = () =>
    db
      .select({ event: s.memories, job: s.jobs, reference: s.orders.reference })
      .from(s.memories)
      .innerJoin(s.jobs, eq(s.jobs.eventId, s.memories.id))
      .innerJoin(s.cases, eq(s.cases.id, s.memories.caseId))
      .innerJoin(s.orders, eq(s.orders.id, s.cases.orderId))
      .where(
        and(
          eq(s.memories.merchantId, merchantId),
          inArray(s.orders.reference, historyReferences(count)),
        ),
      );
  // Expanding always requires a fresh, ledger-validated remote recall of the
  // first completed event. A local evidence file cannot bypass this gate.
  if (count > 1) {
    const first = (await targets()).find(
      (row) => row.reference === "HISTORY-001",
    );
    if (
      !first ||
      first.event.payload.provenance !== "synthetic-mainnet" ||
      !completedMainnetJob(
        first.job,
        merchant.memoryOwnerAddress,
        merchant.namespace,
      )
    )
      throw new ShowcaseStop(
        "First run --count 1 and confirm its completed Mainnet receipt before expanding.",
      );
    const recalled = await recall(merchant, "access", product.version);
    if (
      recalled.source !== "walrus-recall" ||
      !recalled.evidence.some(
        (item) => item.event.logicalEventId === first.event.id,
      )
    )
      throw new ShowcaseStop(
        "The first completed event was not returned by fresh validated Walrus recall. No additional records queued.",
      );
  }

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${merchantId}))`,
    );
    await seedLearningHistory(merchantId, tx, "synthetic-mainnet", count);
  });
  let rows = await targets();
  if (
    rows.length !== count ||
    rows.some((row) => row.event.payload.provenance !== "synthetic-mainnet")
  )
    throw new ShowcaseStop(
      "Showcase targets do not match the expected synthetic Mainnet provenance.",
    );
  const eventIds = rows.map((row) => row.event.id);
  console.log(
    `Processing a target total of ${count} distinct synthetic experiences; previous events retain their logical IDs.`,
  );
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    rows = await targets();
    if (
      rows.every((row) =>
        completedMainnetJob(
          row.job,
          merchant.memoryOwnerAddress!,
          merchant.namespace,
        ),
      )
    )
      break;
    // Stop before another operation after any error, including payment-required.
    // Pending/uncertain jobs remain intact for explicit diagnosis and resumption.
    if (
      rows.some(
        (row) =>
          row.job.error || ["failed", "uncertain"].includes(row.job.status),
      )
    )
      break;
    await workerOnce(merchantId, eventIds);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  rows = await targets();
  const completed = rows.filter((row) =>
    completedMainnetJob(
      row.job,
      merchant.memoryOwnerAddress!,
      merchant.namespace,
    ),
  );
  const unique = new Map(completed.map((row) => [row.event.id, row]));
  let recalledIds: string[] = [];
  let recallSucceeded = false;
  if (unique.size === count) {
    try {
      const recalled = await recall(merchant, "access", product.version);
      recallSucceeded = recalled.source === "walrus-recall";
      recalledIds = recalled.evidence
        .map((item) => item.event.logicalEventId)
        .filter((id) => unique.has(id));
    } catch {
      /* No recall success; never activate fixtures or rewrite. */
    }
  }
  const firstId = rows.find((row) => row.reference === "HISTORY-001")?.event.id;
  const firstRecalled = !!firstId && recalledIds.includes(firstId);
  const report = {
    network: "mainnet",
    accountId: merchant.memoryAccountId,
    namespace: merchant.namespace,
    exportedAt: new Date().toISOString(),
    targetCount: count,
    confirmedCount: unique.size,
    targetCompleted: unique.size === count,
    recallSucceeded,
    firstRecalled,
    recalledLogicalEventIds: recalledIds,
    completionSignal:
      "relayer-job-done, not independent cryptographic verification",
    events: [...unique.values()].map(({ event, job }) => ({
      logicalEventId: event.id,
      provenance: event.payload.provenance,
      observedAt: event.payload.observedAt,
      eventCreatedAt: event.createdAt,
      completedAt: job.completedAt,
      jobId: job.providerJobId,
      blobId: job.providerMemoryId,
      owner: merchant.memoryOwnerAddress,
      namespace: merchant.namespace,
      network: "mainnet",
    })),
    incomplete: rows
      .filter((row) => !unique.has(row.event.id))
      .map(({ event, job }) => ({
        logicalEventId: event.id,
        jobId: job.providerJobId,
        status: job.status,
        hasError: !!job.error,
      })),
  };
  await mkdir("artifacts/live", { recursive: true });
  const encoded = JSON.stringify(report, null, 2);
  await writeFile(
    `artifacts/live/mainnet-evidence-${report.exportedAt.replace(/[:.]/g, "-")}-count-${count}.json`,
    encoded,
  );
  await writeFile(
    `artifacts/live/mainnet-evidence-count-${count}.json`,
    encoded,
  );
  await writeFile("artifacts/live/mainnet-evidence.json", encoded);
  console.log(
    `Confirmed ${unique.size}/${count} distinct completed Mainnet events. First event remotely recalled: ${firstRecalled}. Evidence saved; incomplete jobs remain intact.`,
  );
  if (unique.size !== count || !recallSucceeded || !firstRecalled)
    process.exitCode = 1;
} catch (error) {
  // Provider/SQL exceptions may contain payloads; never print their messages.
  console.error(
    error instanceof ShowcaseStop
      ? error.message
      : "Mainnet showcase stopped. Check the bounded-write procedure, destination, authenticated readiness and preserved job/evidence state. No raw provider exception is logged.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
