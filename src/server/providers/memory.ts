import { MemWal } from "@mysten-incubation/memwal";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { jobs, memories, merchants } from "../../db/schema";
import { memorySchema, type Evidence, type Issue } from "../../core/types";
import { AppError, required } from "../config";
import { hash } from "../auth";

export type Merchant = typeof merchants.$inferSelect;
export function memoryClient(merchant: Merchant) {
  if (merchant.mode !== "live" || merchant.id !== required("LIVE_MERCHANT_ID"))
    throw new AppError(
      "ACCOUNT_MAPPING",
      "This merchant has no configured dedicated memory account.",
      503,
    );
  if (
    merchant.memoryAccountId !== required("MEMWAL_ACCOUNT_ID") ||
    merchant.namespace !== required("MEMWAL_NAMESPACE")
  )
    throw new AppError(
      "ACCOUNT_MAPPING",
      "The configured memory account or namespace does not match this merchant.",
      503,
    );
  const serverUrl =
    process.env.MEMWAL_RELAYER_URL ?? "https://relayer.memory.walrus.xyz";
  if (serverUrl !== "https://relayer.memory.walrus.xyz")
    throw new AppError(
      "NETWORK",
      "Mainnet memory requires the official Mainnet relayer.",
      503,
    );
  return MemWal.create({
    key: required("MEMWAL_DELEGATE_KEY"),
    accountId: merchant.memoryAccountId!,
    namespace: merchant.namespace,
    serverUrl,
    requestTimeoutMs: 10000,
    recallTimeoutMs: 12000,
    preflightTimeoutMs: 5000,
  });
}
export function parseMemory(text: string) {
  const marker = "\nRECALLDESK_JSON\n",
    start = text.indexOf(marker);
  if (start < 0 || text.length > 12000) return null;
  try {
    const parsed = memorySchema.safeParse(
      JSON.parse(text.slice(start + marker.length)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function memoryText(event: import("../../core/types").MemoryEvent) {
  return `RecallDesk experience. Issue: ${event.issue}. Product: ${event.productVersion}. Remedy: ${event.remedy}. Merchant-confirmed outcome: ${event.outcome}. Source: ${event.caseRef}. ${event.provenance}.\nRECALLDESK_JSON\n${JSON.stringify(event)}`;
}
export async function recall(
  merchant: Merchant,
  issue: Issue,
  productVersion: string,
) {
  const ledger = await db
    .select({ event: memories, job: jobs })
    .from(memories)
    .innerJoin(jobs, eq(jobs.eventId, memories.id))
    .where(eq(memories.merchantId, merchant.id));
  const supersededIds = new Set(
    ledger.filter((r) => r.event.supersededBy).map((r) => r.event.id),
  );
  const byId = new Map(
    ledger
      .filter((r) => r.job.status === "completed")
      .map((r) => [r.event.id, r]),
  );
  let hits: { text: string; blob_id: string }[],
    source: Evidence["source"],
    limitation = "";
  if (merchant.mode === "demo") {
    hits = ledger
      .filter((r) => r.job.status === "completed")
      .map((r) => ({
        text: r.event.text,
        blob_id: r.job.providerMemoryId ?? `sample:${r.event.id}`,
      }));
    source = "sample-memory";
  } else {
    const client = memoryClient(merchant);
    try {
      const response = await client.recall({
        query: `RecallDesk merchant-confirmed ${issue} product ${productVersion} attempted remedies resolved failed`,
        limit: 50,
        namespace: merchant.namespace,
      });
      hits = response.results;
      source = "walrus-recall";
      if (response.dropped_count)
        limitation = `${response.dropped_count} memories could not be retrieved. `;
      if (hits.length === 50)
        limitation +=
          "Recall reached its limit; additional experience may exist. ";
    } finally {
      client.destroy();
    }
  }
  const evidence: Evidence[] = [];
  for (const hit of hits) {
    const event = parseMemory(hit.text);
    if (!event || event.merchantId !== merchant.id) continue;
    const own = byId.get(event.logicalEventId);
    // Local committed merchant outcome authenticates the returned content; never substitute local text for a missing remote hit.
    if (
      !own ||
      hash(hit.text) !== own.event.contentHash ||
      own.job.providerMemoryId !== hit.blob_id
    )
      continue;
    if (merchant.mode === "live" && event.provenance === "synthetic-demo")
      continue;
    evidence.push({ event, providerId: hit.blob_id, text: hit.text, source });
  }
  return { evidence, supersededIds, source, limitation };
}
export async function completedMainnetCount(merchantId: string) {
  const rows = await db
    .select({ id: jobs.eventId })
    .from(jobs)
    .innerJoin(merchants, eq(merchants.id, jobs.merchantId))
    .where(
      and(
        eq(jobs.merchantId, merchantId),
        eq(jobs.status, "completed"),
        eq(merchants.mode, "live"),
      ),
    );
  return new Set(rows.map((r) => r.id)).size;
}
