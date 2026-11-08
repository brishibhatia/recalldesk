import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import * as s from "../src/db/schema";
import { getAuth } from "../src/server/auth";
import { mode, required } from "../src/server/config";
import { canonicalAddress } from "../src/core/payment";
import { seedWorkspace } from "../src/server/fixtures";
if (mode() !== "live")
  throw new Error(
    "Set APP_MODE=live in a separate live environment before provisioning.",
  );
const email = required("MERCHANT_EMAIL"),
  name = required("MERCHANT_NAME");
const controlledProduct = process.argv.includes("--controlled-product");
let [operator] = await db.select().from(s.user).where(eq(s.user.email, email));
if (!operator) {
  const result = await getAuth(true).api.signUpEmail({
    body: { name, email, password: required("MERCHANT_PASSWORD") },
  });
  [operator] = await db
    .select()
    .from(s.user)
    .where(eq(s.user.id, result.user.id));
}
const [existing] = await db
  .select()
  .from(s.memberships)
  .innerJoin(s.merchants, eq(s.memberships.merchantId, s.merchants.id))
  .where(
    and(eq(s.memberships.userId, operator.id), eq(s.merchants.mode, "live")),
  );
if (existing)
  console.log(
    `Existing live merchant: ${existing.merchants.id}. Set LIVE_MERCHANT_ID to this value.`,
  );
else {
  const merchantId = randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .insert(s.merchants)
      .values({
        id: merchantId,
        name,
        mode: "live",
        recipient: canonicalAddress(required("MERCHANT_PAYMENT_ADDRESS")),
        memoryAccountId: canonicalAddress(required("MEMWAL_ACCOUNT_ID")),
        memoryOwnerAddress: canonicalAddress(required("MEMWAL_OWNER_ADDRESS")),
        namespace: required("MEMWAL_NAMESPACE"),
      });
    await tx
      .insert(s.memberships)
      .values({ merchantId, userId: operator.id, role: "owner" });
    await seedWorkspace(merchantId, tx, { controlledProduct });
  });
  console.log(
    `Live merchant created: ${merchantId}. Set LIVE_MERCHANT_ID to this value. No sample history, Mainnet write, or real payment was created.`,
  );
  console.log(
    controlledProduct
      ? "Controlled pilot product enabled: approved relink/resend can grant access to RecallDesk's local downloadable workbook. No external product is connected."
      : "External fulfillment selected: RecallDesk will not modify product access.",
  );
}
await pool.end();
