import { mkdir, writeFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { merchants } from "../src/db/schema";
import { issueSchema } from "../src/core/types";
import { mode, required } from "../src/server/config";
import { recall } from "../src/server/providers/memory";

if (mode() !== "live" || !process.argv.includes("--live"))
  throw new Error("Read-only remote recall requires APP_MODE=live and --live.");
const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
try {
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(
      and(
        eq(merchants.id, required("LIVE_MERCHANT_ID")),
        eq(merchants.mode, "live"),
      ),
    );
  if (!merchant)
    throw new Error("Provision the configured live merchant first.");
  const issue = issueSchema.parse(
    process.argv.includes("--issue") ? arg("--issue") : "access",
  );
  const productVersion = process.argv.includes("--product-version")
    ? arg("--product-version")
    : "studio-2.1";
  if (productVersion.length > 40) throw new Error("Product version too long.");
  const result = await recall(merchant, issue, productVersion);
  const report = {
    checkedAt: new Date().toISOString(),
    provider: result.source,
    accountId: merchant.memoryAccountId,
    namespace: merchant.namespace,
    issue,
    productVersion,
    limitation: result.limitation,
    dependencies:
      "Independent Node process; same authorized account/delegate and PostgreSQL validation ledger. Demonstrates process continuity, not ledger-free portability.",
    evidence: result.evidence.map((e) => ({
      logicalEventId: e.event.logicalEventId,
      sourceCase: e.event.caseRef,
      remedy: e.event.remedy,
      outcome: e.event.outcome,
      productVersion: e.event.productVersion,
      provenance: e.event.provenance,
      storageReference: e.providerId,
      superseded: result.supersededIds.has(e.event.logicalEventId),
    })),
  };
  await mkdir("artifacts/live", { recursive: true });
  await writeFile(
    "artifacts/live/second-client-recall.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Remote recall returned ${report.evidence.length} validated records. Redacted report: artifacts/live/second-client-recall.json`,
  );
} catch {
  console.error(
    "Live recall failed. Check account mapping, delegate access, network and local validation ledger. No sample fallback was used.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
