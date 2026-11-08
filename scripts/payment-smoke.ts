import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { pool } from "../src/db";
import { mode, required } from "../src/server/config";
import { caseContext } from "../src/server/services";
import { canonicalAddress } from "../src/core/payment";
import { verifyTatum } from "../src/server/providers/tatum";

if (mode() !== "live" || !process.argv.includes("--live"))
  throw new Error(
    "Payment smoke checks are read-only and opt-in: APP_MODE=live and --live --case <id> --digest <digest> --wallet <wallet name/version>.",
  );
const arg = (name: string) =>
  process.argv.includes(name)
    ? process.argv[process.argv.indexOf(name) + 1]
    : undefined;
try {
  const caseId = z.string().uuid().parse(arg("--case")),
    digest = z
      .string()
      .regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/)
      .parse(arg("--digest") ?? process.env.LIVE_TEST_DIGEST),
    wallet = z.string().min(1).max(100).parse(arg("--wallet"));
  const p = {
    merchantId: required("LIVE_MERCHANT_ID"),
    actor: "payment-smoke",
    role: "operator" as const,
    mode: "live" as const,
  };
  const { order } = await caseContext(p, caseId);
  const valid = await verifyTatum(order, digest, order.customerId);
  const alternateRecipient = canonicalAddress(
    order.recipient === canonicalAddress("0x1") ? "0x2" : "0x1",
  );
  // Re-read the same real transaction against deliberately mismatched invoice constraints; do not create fictional receipts.
  const wrongRecipient = await verifyTatum(
    { ...order, recipient: alternateRecipient },
    digest,
    order.customerId,
  );
  const wrongBuyer = await verifyTatum(order, digest, "unassociated-buyer");
  const redact = (result: typeof valid) => {
    const safe = { ...result };
    delete safe.payer;
    delete safe.recipient;
    return safe;
  };
  const report = {
    checkedAt: new Date().toISOString(),
    wallet,
    caseId,
    digest,
    provider: "tatum-grpc",
    scenario:
      "Actual wallet transaction; negative variants change only local invoice expectations",
    checks: {
      supportedMatchingPayment: {
        passed: valid.state === "verified",
        result: redact(valid),
      },
      wrongRecipientRejected: {
        passed: wrongRecipient.code === "RECIPIENT_MISMATCH",
        result: redact(wrongRecipient),
      },
      wrongBuyerRejected: {
        passed: wrongBuyer.code === "BUYER_UNBOUND",
        result: redact(wrongBuyer),
      },
    },
    allocation:
      "Not mutated by this read-only script. Verify the original order in the UI, then attempt allocation from another supported order to capture PAYMENT_ALREADY_ALLOCATED. Automated concurrent/reuse coverage is in tests/database.test.ts.",
    parserScope:
      "A wallet shape outside the implemented exact direct-transfer decoder remains needs-review. Expand only after inspecting this actual transaction and adding a regression fixture.",
  };
  await mkdir("artifacts/live", { recursive: true });
  await writeFile(
    "artifacts/live/payment-smoke.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "Saved redacted actual-read results: artifacts/live/payment-smoke.json. No payment or allocation was created.",
  );
  if (!Object.values(report.checks).every((c) => c.passed))
    process.exitCode = 1;
} catch {
  console.error(
    "Live payment check could not complete. Check the case, actual wallet receipt, order time window and credentials. No fixture fallback was used.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
