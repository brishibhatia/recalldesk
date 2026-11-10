import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { parse } from "dotenv";
import { MemWal } from "@mysten-incubation/memwal";
import { tatumClient } from "../src/server/providers/tatum";
import { checkLlmAccess } from "../src/server/providers/llm";
import { canonicalAddress } from "../src/core/payment";
import { readCheckError, type ReadCheckStage } from "./lib/read-check-error";

const required = [
  "TATUM_API_KEY",
  "MEMWAL_ACCOUNT_ID",
  "MEMWAL_DELEGATE_KEY",
  "MEMWAL_NAMESPACE",
];
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  scope:
    "Authenticated reads only; no inference, memory writes or payment transfers",
  mainnetWrites: false,
};
try {
  if (
    process.env.APP_MODE !== "live" ||
    process.env.ALLOW_MAINNET_WRITES !== "false" ||
    !["--live", "--confirm-free-tier", "--confirm-rotated"].every((flag) =>
      process.argv.includes(flag),
    )
  )
    throw new Error(
      "Confirm replacement credentials and free access before read-only checks.",
    );
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    report.missingVariables = missing;
    report.tatum = "not_checked";
    report.walrus = "not_checked";
    process.exitCode = 1;
  } else {
    const accountId = canonicalAddress(process.env.MEMWAL_ACCOUNT_ID!);
    const namespace = process.env.MEMWAL_NAMESPACE!;
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(namespace))
      throw new Error("Invalid namespace");
    const serverUrl = process.env.MEMWAL_RELAYER_URL;
    if (serverUrl !== "https://relayer.memory.walrus.xyz")
      throw new Error("Managed Mainnet relayer required");
    const connection = tatumClient();
    let memory: ReturnType<typeof MemWal.create> | undefined;
    let stage: ReadCheckStage = "tatum_service";
    try {
      const info = await connection.client.ledgerService.getServiceInfo({})
        .response;
      if (info.chain !== "mainnet") throw new Error("Wrong network");
      report.tatum = {
        state: "live",
        network: info.chain,
        checkpoint: info.checkpointHeight?.toString(),
        paymentVerified: false,
      };
      await new Promise((resolve) => setTimeout(resolve, 400));
      stage = "tatum_account";
      const account = await connection.client.getObject({
        objectId: accountId,
        include: { json: true },
      });
      if (!/^0x[a-fA-F0-9]+::account::MemWalAccount$/.test(account.object.type))
        throw new Error("Unexpected account type");
      const rawOwner = account.object.json?.owner;
      if (typeof rawOwner !== "string")
        throw new Error("Account omitted embedded owner");
      const owner = canonicalAddress(rawOwner);
      report.account = {
        accountId,
        type: account.object.type,
        owner,
        source: "Tatum Sui Mainnet account object embedded owner field",
      };
      // The authenticated object read establishes ownership independently of
      // delegate recall. Saving it must not imply that the delegate is valid.
      if (process.argv.includes("--save-owner")) {
        stage = "owner_configuration";
        const values = parse(await readFile(".env.local"));
        if (canonicalAddress(values.MEMWAL_ACCOUNT_ID) !== accountId)
          throw new Error("Environment changed during check");
        values.MEMWAL_OWNER_ADDRESS = owner;
        await writeFile(
          ".env.local",
          Object.entries(values)
            .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
            .join("\n") + "\n",
          { mode: 0o600 },
        );
        await chmod(".env.local", 0o600);
        report.ownerSaved = true;
      }
      stage = "walrus_recall";
      memory = MemWal.create({
        key: process.env.MEMWAL_DELEGATE_KEY!,
        accountId,
        namespace,
        serverUrl,
        requestTimeoutMs: 10000,
        recallTimeoutMs: 12000,
        preflightTimeoutMs: 5000,
      });
      const recalled = await memory.recall({
        query: "RecallDesk confirmed support experience",
        namespace,
        limit: 1,
      });
      report.walrus = {
        state: "authenticated_recall",
        accountId,
        namespace,
        returned: recalled.results.length,
        note: "Access only; empty recall is not storage or learning evidence.",
      };
    } catch (error) {
      const failure = readCheckError(error, stage);
      report.failure = failure;
      if (stage === "walrus_recall")
        report.walrus = { state: "failed", accountId, namespace, ...failure };
      process.exitCode = 1;
    } finally {
      memory?.destroy();
      connection.close();
    }
  }
  report.llm = await checkLlmAccess("live");
  if ((report.llm as { state: string }).state !== "configured")
    process.exitCode = 1;
} catch {
  report.failure =
    "Read-only preflight requires live mode, disabled writes, explicit rotation/free-access confirmation and valid local settings.";
  process.exitCode = 1;
}
await mkdir("artifacts/live", { recursive: true });
await writeFile(
  "artifacts/live/provider-preflight.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
