import { db, pool } from "../src/db";
import { merchants } from "../src/db/schema";
import { DEMO_RECIPIENT, seedWorkspace } from "../src/server/fixtures";
import { mode } from "../src/server/config";
if (mode() !== "demo") throw new Error("Sample seed is disabled in live mode.");
const merchantId = "00000000-0000-4000-8000-000000000001";
await db.transaction(async (tx) => {
  await tx
    .insert(merchants)
    .values({
      id: merchantId,
      name: "Seed template (not a reviewer session)",
      mode: "demo",
      recipient: DEMO_RECIPIENT,
      namespace: "demo-seed-template",
    })
    .onConflictDoNothing();
  await seedWorkspace(merchantId, tx);
});
console.log(
  "Idempotent demo template seeded. Browser entry creates a separate private reviewer workspace.",
);
await pool.end();
