import { mkdir, writeFile } from "node:fs/promises";
import {
  explain,
  selectedLlmConfig,
  checkLlmAccess,
} from "../src/server/providers/llm";
import { rankRemedies } from "../src/core/ranking";
import { learning, EVAL_MERCHANT } from "../src/evaluation/dataset";
import { DEFAULT_POLICY } from "../src/server/fixtures";
import {
  reserveInferenceAttempt,
  verificationAttemptCount,
  verificationBudgetStatus,
} from "./lib/inference-budget";
import { pool } from "../src/db";

try {
  if (
    process.env.APP_MODE !== "live" ||
    process.env.ALLOW_MAINNET_WRITES !== "false" ||
    !["--live", "--confirm-free-tier", "--confirm-rotated"].every((flag) =>
      process.argv.includes(flag),
    )
  )
    throw new Error(
      "Use a read-only live environment and explicitly confirm rotated credentials and free project access with billing disabled.",
    );
  const config = selectedLlmConfig();
  if (config.provider !== "gemini" || config.model !== "gemini-3.8-flash")
    throw new Error(
      "This zero-spend verification is restricted to the reviewed gemini-3.8-flash free-tier candidate; no model substitution.",
    );
  const before = await verificationBudgetStatus();
  if (before.remaining === 0) {
    console.log(
      JSON.stringify({
        status: "allowance_closed",
        ...before,
        inferenceRequestsSent: 0,
      }),
    );
    process.exitCode = 1;
    await pool.end();
    process.exit(1);
  }
  const access = await checkLlmAccess("live");
  if (access.state !== "configured") {
    console.log(
      JSON.stringify(
        {
          status: "metadata_check_failed",
          ...access,
          totalInferenceAttempts: await verificationAttemptCount(),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } else {
    const retryArg = process.argv.indexOf("--retries");
    const retries = retryArg < 0 ? 0 : Number(process.argv[retryArg + 1]);
    if (![0, 1, 2].includes(retries) || retries + 1 > before.remaining)
      throw new Error(
        "Retries require enough remaining authorized attempts (maximum two retries).",
      );
    const minimal = process.argv.includes("--minimal");
    const decision = rankRemedies({
      merchantId: EVAL_MERCHANT,
      issue: "access",
      productVersion: "studio-2.1",
      payment: "verified",
      policy: DEFAULT_POLICY,
      evidence: learning.slice(0, minimal ? 2 : 8),
    });
    const started = performance.now();
    const result = await explain(
      decision,
      "live",
      minimal
        ? "Synthetic sample: access is locked. Explain the supplied decision concisely. No real payment or fulfillment occurred."
        : "Synthetic verification only: my sample product remains locked after refreshing. Explain the supplied synthetic decision; no real payment or access change occurred.",
      {
        maxRetries: retries as 0 | 1 | 2,
        timeoutMs: before.grantId
          ? minimal && !retries
            ? 120000
            : 60000
          : 30000,
        verification: {
          freeTierConfirmed: true,
          credentialsRotated: true,
          purpose: "synthetic-structured-output-smoke",
        },
        beforeRequest: async () => {
          if (process.env.LOCAL_PILOT_VERIFICATION !== "true")
            await reserveInferenceAttempt(
              config.provider,
              config.model,
              "synthetic-structured-output-smoke",
            );
        },
      },
    );
    const budget = await verificationBudgetStatus();
    const reportPath = budget.grantId
      ? `artifacts/live/gemini-${budget.grantId}-attempt-${budget.attempts}.json`
      : "artifacts/live/gemini-smoke.json";
    const report = {
      checkedAt: new Date().toISOString(),
      scope:
        "Live inference on synthetic input; no order, payment, entitlement, memory write or merchant recommendation record was created.",
      configuredProvider: config.provider,
      configuredModel: config.model,
      actualProvider: result.provider,
      inferenceSucceeded:
        !result.error && result.provider.startsWith("gemini:"),
      errorCode: result.errorCode,
      diagnostic: result.diagnostic,
      transport: result.transport,
      error: result.error,
      inferenceAttemptsThisRun: result.attempts,
      totalInferenceAttempts: budget.totalAttempts,
      allowance: budget,
      maximumAttemptsInAllowance: 4,
      retries,
      retryHistory: result.retryHistory,
      timeoutMs: before.grantId
        ? minimal && !retries
          ? 120000
          : 60000
        : 30000,
      suppliedEvidenceCount: decision.evidence.length,
      latencyMs: Math.round(performance.now() - started),
      explanation: result.explanation,
      evidenceSource:
        "synthetic evaluation learning fixtures, not Walrus recall",
      memoryWrites: 0,
    };
    await mkdir("artifacts/live", { recursive: true });
    await writeFile(
      reportPath,
      JSON.stringify(report, null, 2),
      budget.grantId ? { flag: "wx" } : undefined,
    );
    console.log(
      JSON.stringify(
        {
          status: report.inferenceSucceeded
            ? "validated_live_inference_on_synthetic_input"
            : "labeled_fallback",
          provider: result.provider,
          errorCode: result.errorCode,
          totalInferenceAttempts: report.totalInferenceAttempts,
          allowance: budget,
          transport: result.transport,
          diagnostic: result.diagnostic,
          retryHistory: result.retryHistory,
          report: reportPath,
        },
        null,
        2,
      ),
    );
    if (!report.inferenceSucceeded) process.exitCode = 1;
  }
} catch {
  console.error(
    "Gemini smoke check could not run. Check local replacement credentials, explicit free-tier confirmation, configured model and the remaining verification allowance. No raw provider error is logged.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
