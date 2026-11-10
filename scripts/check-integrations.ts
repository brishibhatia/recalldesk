import { and, eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { merchants } from "../src/db/schema";
import { checkProviders } from "../src/server/readiness";
import { selectedLlmConfig, safeLlmFailure } from "../src/server/providers/llm";
import { mode } from "../src/server/config";

try {
  if (mode() !== "live" || !process.argv.includes("--live"))
    throw new Error("Use the isolated live configuration and pass --live.");
  const config = selectedLlmConfig();
  const missing = [
    "LIVE_MERCHANT_ID",
    "TATUM_API_KEY",
    "MEMWAL_ACCOUNT_ID",
    "MEMWAL_OWNER_ADDRESS",
    "MEMWAL_DELEGATE_KEY",
    "MEMWAL_NAMESPACE",
    config.keyVariable,
  ].filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    console.log(
      JSON.stringify(
        {
          status: "configuration_incomplete",
          missingVariables: missing,
          provider: config.provider,
          model: config.model,
          inferenceAttempts: 0,
          mainnetWrites: 0,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } else {
    const merchantId = process.env.LIVE_MERCHANT_ID!;
    const [merchant] = await db
      .select()
      .from(merchants)
      .where(and(eq(merchants.id, merchantId), eq(merchants.mode, "live")));
    if (!merchant)
      throw new Error("Provision the configured live merchant first.");
    const result = await checkProviders({
      merchantId,
      actor: "integration-check",
      mode: "live",
      role: "operator",
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.providers.some((p) => !["live", "configured"].includes(p.state)))
      process.exitCode = 1;
  }
} catch (error) {
  console.error(
    JSON.stringify({
      status: "check_failed",
      errorCode: safeLlmFailure(error).code,
      message:
        "Check the isolated live configuration, selected provider and provisioned merchant. Raw exceptions and credentials are omitted.",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
