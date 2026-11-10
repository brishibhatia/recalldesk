import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  reserveInferenceAttempt,
  verificationAttemptCount,
} from "../scripts/lib/inference-budget";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "recalldesk-budget-test-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
it("persists a shared four-attempt limit across independent calls, including failures", async () => {
  expect(await verificationAttemptCount(directory)).toBe(0);
  for (let i = 0; i < 4; i++)
    expect(
      await reserveInferenceAttempt(
        "gemini",
        "test-model",
        i % 2 ? "evaluation" : "smoke",
        directory,
      ),
    ).toBe(i + 1);
  await expect(
    reserveInferenceAttempt("gemini", "test-model", "retry", directory),
  ).rejects.toMatchObject({ code: "INFERENCE_BUDGET_EXHAUSTED" });
  expect(await verificationAttemptCount(directory)).toBe(4);
});
it("does not lose reservations when concurrent processes compete", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      reserveInferenceAttempt("gemini", "test-model", "concurrent", directory),
    ),
  );
  const fulfilled = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  expect(fulfilled).toBeGreaterThan(0);
  expect(fulfilled).toBeLessThanOrEqual(4);
  expect(await verificationAttemptCount(directory)).toBe(fulfilled);
});
it("fails closed on corrupt records or a stale lock instead of resetting the allowance", async () => {
  await writeFile(join(directory, "llm-verification-budget.json"), "broken");
  await expect(
    reserveInferenceAttempt("gemini", "test-model", "corrupt", directory),
  ).rejects.toThrow();
  await writeFile(join(directory, "llm-verification-budget.json.lock"), "");
  await expect(
    reserveInferenceAttempt("gemini", "test-model", "locked", directory),
  ).rejects.toMatchObject({ code: "INFERENCE_BUDGET_EXHAUSTED" });
});
