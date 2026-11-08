import { and, desc, eq, sql } from "drizzle-orm";
import OpenAI from "openai";
import { db } from "../db";
import * as s from "../db/schema";
import type { Principal } from "./auth";
import { memoryClient, completedMainnetCount } from "./providers/memory";
import { tatumClient } from "./providers/tatum";
import { required } from "./config";
import { canonicalAddress } from "../core/payment";

export async function checkProviders(p: Principal) {
  const [merchant] = await db
    .select()
    .from(s.merchants)
    .where(eq(s.merchants.id, p.merchantId));
  for (const provider of ["tatum", "walrus", "llm"]) {
    let state = p.mode === "demo" ? "simulated" : "failed",
      message = "Deterministic sample provider. No live service was called.",
      evidence: Record<string, unknown> | null = null;
    if (p.mode === "live") {
      try {
        if (provider === "tatum") {
          const connection = tatumClient();
          try {
            const response = (
              await connection.client.ledgerService.getServiceInfo({})
            ).response;
            if (response.chain !== "mainnet") throw new Error("Wrong network");
            evidence = {
              network: response.chain,
              chainId: response.chainId,
              checkpoint: response.checkpointHeight?.toString(),
            };
          } finally {
            connection.close();
          }
          message =
            "Authenticated Tatum Mainnet gRPC service read succeeded. A matching order payment still requires its own verification.";
        } else if (provider === "walrus") {
          const client = memoryClient(merchant),
            connection = tatumClient();
          try {
            const account = await connection.client.getObject({
              objectId: required("MEMWAL_ACCOUNT_ID"),
              include: { json: true },
            });
            const owner = account.object.json?.owner;
            if (
              typeof owner !== "string" ||
              !merchant.memoryOwnerAddress ||
              canonicalAddress(owner) !==
                canonicalAddress(merchant.memoryOwnerAddress) ||
              !account.object.type.endsWith("::account::MemWalAccount")
            )
              throw new Error("Account owner mismatch");
            const health = await client.health();
            if (health.write_ready === false)
              throw new Error("Relayer not write ready");
            // Unlike health(), this is authenticated. Read actual memory content to check the recall path.
            const recalled = await client.recall({
              query: "RecallDesk confirmed support experience",
              namespace: merchant.namespace,
              limit: 1,
            });
            evidence = {
              accountId: merchant.memoryAccountId,
              owner: merchant.memoryOwnerAddress,
              namespace: merchant.namespace,
              relayerVersion: health.version,
              returned: recalled.results.length,
              network: "mainnet",
            };
          } finally {
            client.destroy();
            connection.close();
          }
          message =
            "Account owner matched on Sui; authenticated Walrus recall succeeded. No new memory was written by this check.";
        } else {
          const client = new OpenAI({
            apiKey: required("OPENAI_API_KEY"),
            timeout: 10000,
            maxRetries: 0,
          });
          await client.models.retrieve(required("LLM_MODEL"));
          state = "configured";
          message =
            "Configured model is accessible. Live structured inference is verified only by a successful recommendation.";
        }
        if (provider !== "llm") state = "live";
      } catch {
        message = `${provider} check failed. Check the server credentials, configured merchant/account, model, network and provider access. No fixtures were activated.`;
      }
    }
    await db
      .insert(s.providerChecks)
      .values({ merchantId: p.merchantId, provider, state, message, evidence });
  }
  return readiness(p);
}
export async function readiness(p: Principal) {
  await db.execute(sql`select 1`);
  const checks = await db
    .select()
    .from(s.providerChecks)
    .where(eq(s.providerChecks.merchantId, p.merchantId))
    .orderBy(desc(s.providerChecks.createdAt));
  const latest = ["tatum", "walrus", "llm"].map(
    (provider) =>
      checks.find((c) => c.provider === provider) ?? {
        provider,
        state: p.mode === "demo" ? "simulated" : "disconnected",
        message:
          p.mode === "demo"
            ? "Sample adapter; no live call made."
            : "No successful check yet. Configure server credentials and run checks.",
        createdAt: null,
        evidence: null,
      },
  );
  const [heartbeat] = await db
    .select()
    .from(s.workerHeartbeats)
    .where(eq(s.workerHeartbeats.id, `worker-${p.mode}`));
  const counts = await db
    .select({ status: s.jobs.status, count: sql<number>`count(*)::int` })
    .from(s.jobs)
    .where(eq(s.jobs.merchantId, p.merchantId))
    .groupBy(s.jobs.status);
  const inference = await db
    .select({
      id: s.recommendations.id,
      createdAt: s.recommendations.createdAt,
    })
    .from(s.recommendations)
    .where(
      and(
        eq(s.recommendations.merchantId, p.merchantId),
        sql`${s.recommendations.provider} like 'openai:%'`,
        sql`${s.recommendations.providerError} IS NULL`,
      ),
    )
    .orderBy(desc(s.recommendations.createdAt))
    .limit(1);
  return {
    providers: latest,
    database: "connected",
    worker:
      heartbeat && Date.now() - heartbeat.updatedAt.getTime() < 30000
        ? "running"
        : "not_running",
    workerLastSeen: heartbeat?.updatedAt ?? null,
    mainnetCount: await completedMainnetCount(p.merchantId),
    jobCounts: counts,
    liveInference: inference[0] ?? null,
    mainnetWritesEnabled:
      p.mode === "live" && process.env.ALLOW_MAINNET_WRITES === "true",
  };
}
