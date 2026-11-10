import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  reserveInferenceAttempt,
  verificationBudgetStatus,
  markVerificationSuccess,
} from "../src/server/providers/inference-budget";
let directory: string, original: string, manifestPath: string;
const grantId = "provider-repair-20261110";
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "recalldesk-grant-"));
  original = JSON.stringify({
    limit: 4,
    attempts: Array.from({ length: 4 }, () => ({
      at: "2026-11-09T00:00:00Z",
      provider: "gemini",
      model: "gemini-3.8-flash",
      purpose: "prior verification",
    })),
  });
  await writeFile(join(directory, "llm-verification-budget.json"), original);
  await mkdir(join(directory, "llm-verification-grants"));
  manifestPath = join(
    directory,
    "llm-verification-grants",
    grantId + ".authorization.json",
  );
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      grantId,
      limit: 4,
      provider: "gemini",
      model: "gemini-3.8-flash",
      priorLedgerSha256: createHash("sha256").update(original).digest("hex"),
      authorizedAt: "2026-11-10T00:00:00Z",
      stopAfterSuccess: true,
    }),
  );
  vi.stubEnv("LLM_VERIFICATION_GRANT", grantId);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
it("keeps the prior four attempts byte-for-byte and records at most four additional requests", async () => {
  expect(await verificationBudgetStatus(directory)).toMatchObject({
    priorAttempts: 4,
    attempts: 0,
    totalAttempts: 4,
    remaining: 4,
  });
  for (let i = 0; i < 4; i++)
    await reserveInferenceAttempt(
      "gemini",
      "gemini-3.8-flash",
      "repair",
      directory,
    );
  await expect(
    reserveInferenceAttempt("gemini", "gemini-3.8-flash", "fifth", directory),
  ).rejects.toMatchObject({ code: "INFERENCE_BUDGET_EXHAUSTED" });
  expect(await verificationBudgetStatus(directory)).toMatchObject({
    priorAttempts: 4,
    attempts: 4,
    totalAttempts: 8,
    remaining: 0,
  });
  expect(
    await readFile(join(directory, "llm-verification-budget.json"), "utf8"),
  ).toBe(original);
});
it("closes immediately after validated success even with three unused slots", async () => {
  await reserveInferenceAttempt(
    "gemini",
    "gemini-3.8-flash",
    "repair",
    directory,
  );
  await markVerificationSuccess("gemini", "gemini-3.8-flash", directory);
  expect(await verificationBudgetStatus(directory)).toMatchObject({
    attempts: 1,
    totalAttempts: 5,
    remaining: 0,
    stoppedAfterSuccess: true,
  });
  await expect(
    reserveInferenceAttempt("gemini", "gemini-3.8-flash", "again", directory),
  ).rejects.toThrow();
});
it("cannot create an allowance by changing an environment name alone", async () => {
  vi.stubEnv("LLM_VERIFICATION_GRANT", "unapproved");
  await expect(
    reserveInferenceAttempt("gemini", "gemini-3.8-flash", "repair", directory),
  ).rejects.toThrow();
});
it.each(["prior", "manifest"])(
  "fails closed when the bound %s is changed",
  async (which) => {
    await reserveInferenceAttempt(
      "gemini",
      "gemini-3.8-flash",
      "repair",
      directory,
    );
    if (which === "prior")
      await writeFile(
        join(directory, "llm-verification-budget.json"),
        original + "\n",
      );
    else
      await writeFile(
        manifestPath,
        (await readFile(manifestPath, "utf8")) + "\n",
      );
    await expect(
      reserveInferenceAttempt(
        "gemini",
        "gemini-3.8-flash",
        "repair",
        directory,
      ),
    ).rejects.toThrow();
  },
);
it("rejects a different provider/model and success without an admitted request", async () => {
  await expect(
    reserveInferenceAttempt("openai", "other", "repair", directory),
  ).rejects.toThrow();
  await expect(
    markVerificationSuccess("gemini", "gemini-3.8-flash", directory),
  ).rejects.toThrow();
  expect((await verificationBudgetStatus(directory)).attempts).toBe(0);
});
it("leaves the original allowance exhausted when no named grant is selected", async () => {
  vi.stubEnv("LLM_VERIFICATION_GRANT", "");
  await expect(
    reserveInferenceAttempt("gemini", "gemini-3.8-flash", "repair", directory),
  ).rejects.toThrow();
  expect((await verificationBudgetStatus(directory)).attempts).toBe(4);
});

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function additionalGrant() {
  for (let i = 0; i < 4; i++)
    await reserveInferenceAttempt(
      "gemini",
      "gemini-3.8-flash",
      "repair",
      directory,
    );
  const priorManifest = await readFile(manifestPath, "utf8");
  const priorLedgerPath = join(
    directory,
    "llm-verification-grants",
    `${grantId}.attempts.json`,
  );
  const priorLedger = await readFile(priorLedgerPath, "utf8");
  const nextId = "submission-repair-20261110";
  const nextPath = join(
    directory,
    "llm-verification-grants",
    `${nextId}.authorization.json`,
  );
  const nextManifest = {
    ...JSON.parse(priorManifest),
    grantId: nextId,
    authorizedAt: "2026-11-10T09:00:00Z",
    priorGrants: [
      {
        grantId,
        authorizationSha256: hash(priorManifest),
        attemptsSha256: hash(priorLedger),
      },
    ],
  };
  await writeFile(nextPath, JSON.stringify(nextManifest));
  vi.stubEnv("LLM_VERIFICATION_GRANT", nextId);
  return {
    priorManifest,
    priorLedger,
    priorLedgerPath,
    nextManifest,
    nextPath,
  };
}
it("chains a third allowance without erasing eight historical attempts or exceeding twelve total", async () => {
  const previous = await additionalGrant();
  expect(await verificationBudgetStatus(directory)).toMatchObject({
    priorAttempts: 8,
    attempts: 0,
    totalAttempts: 8,
    remaining: 4,
  });
  for (let i = 0; i < 4; i++)
    await reserveInferenceAttempt(
      "gemini",
      "gemini-3.8-flash",
      "submission repair",
      directory,
    );
  expect(await verificationBudgetStatus(directory)).toMatchObject({
    priorAttempts: 8,
    attempts: 4,
    totalAttempts: 12,
    remaining: 0,
  });
  await expect(
    reserveInferenceAttempt("gemini", "gemini-3.8-flash", "extra", directory),
  ).rejects.toMatchObject({ code: "INFERENCE_BUDGET_EXHAUSTED" });
  expect(
    await readFile(join(directory, "llm-verification-budget.json"), "utf8"),
  ).toBe(original);
  expect(await readFile(manifestPath, "utf8")).toBe(previous.priorManifest);
  expect(await readFile(previous.priorLedgerPath, "utf8")).toBe(
    previous.priorLedger,
  );
});
it.each(["authorization", "attempts", "missing"])(
  "rejects a changed or missing earlier named %s ledger",
  async (which) => {
    const previous = await additionalGrant();
    if (which === "missing") await rm(previous.priorLedgerPath);
    else
      await writeFile(
        which === "authorization" ? manifestPath : previous.priorLedgerPath,
        (which === "authorization"
          ? previous.priorManifest
          : previous.priorLedger) + "\n",
      );
    await expect(
      reserveInferenceAttempt("gemini", "gemini-3.8-flash", "again", directory),
    ).rejects.toMatchObject({ code: "INFERENCE_BUDGET_EXHAUSTED" });
  },
);
it.each([
  "duplicate",
  "self",
  "path",
  "bad-hash",
  "incomplete-chain",
  "unfinished",
  "succeeded",
])("rejects an unsafe prior grant reference: %s", async (kind) => {
  const previous = await additionalGrant();
  const reference = previous.nextManifest.priorGrants[0];
  if (kind === "duplicate") previous.nextManifest.priorGrants.push(reference);
  if (kind === "self") reference.grantId = previous.nextManifest.grantId;
  if (kind === "path") reference.grantId = "../../outside";
  if (kind === "bad-hash") reference.attemptsSha256 = "invalid";
  if (kind === "incomplete-chain") {
    const manifest = {
      ...JSON.parse(previous.priorManifest),
      priorGrants: [{ ...reference, grantId: "missing-ancestor" }],
    };
    const text = JSON.stringify(manifest);
    await writeFile(manifestPath, text);
    reference.authorizationSha256 = hash(text);
  }
  if (kind === "unfinished" || kind === "succeeded") {
    const ledger = JSON.parse(previous.priorLedger);
    if (kind === "unfinished") ledger.attempts.pop();
    else
      ledger.validatedSuccess = {
        at: "2026-11-10T01:00:00Z",
        attempt: 4,
        provider: "gemini",
        model: "gemini-3.8-flash",
      };
    const text = JSON.stringify(ledger);
    await writeFile(previous.priorLedgerPath, text);
    reference.attemptsSha256 = hash(text);
  }
  await writeFile(previous.nextPath, JSON.stringify(previous.nextManifest));
  await expect(
    reserveInferenceAttempt("gemini", "gemini-3.8-flash", "again", directory),
  ).rejects.toMatchObject({ code: "INFERENCE_BUDGET_EXHAUSTED" });
});
it("stops the third allowance on its first validated response while retaining the earlier total", async () => {
  await additionalGrant();
  await reserveInferenceAttempt(
    "gemini",
    "gemini-3.8-flash",
    "submission repair",
    directory,
  );
  await markVerificationSuccess("gemini", "gemini-3.8-flash", directory);
  expect(await verificationBudgetStatus(directory)).toMatchObject({
    attempts: 1,
    priorAttempts: 8,
    totalAttempts: 9,
    remaining: 0,
    stoppedAfterSuccess: true,
  });
});
