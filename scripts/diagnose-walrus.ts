import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { MemWal, delegateKeyToPublicKey } from "@mysten-incubation/memwal";
import { tatumClient } from "../src/server/providers/tatum";
import { canonicalAddress } from "../src/core/payment";
import { readCheckError } from "./lib/read-check-error";

const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  scope:
    "Read-only delegate/account/environment/clock diagnosis; no wallet transaction or memory write",
  writesEnabled: false,
};
let connection: ReturnType<typeof tatumClient> | undefined;
let memory: ReturnType<typeof MemWal.create> | undefined;
try {
  if (
    process.env.APP_MODE !== "live" ||
    process.env.ALLOW_MAINNET_WRITES !== "false" ||
    !process.argv.includes("--live")
  )
    throw Error("Read-only live configuration required");
  const file = parse(await readFile(".env.local"));
  const names = [
    "APP_MODE",
    "DATABASE_URL",
    "LIVE_MERCHANT_ID",
    "MEMWAL_ACCOUNT_ID",
    "MEMWAL_NAMESPACE",
    "MEMWAL_DELEGATE_KEY",
  ];
  report.environment = {
    file: resolve(".env.local"),
    processMatchesFile: names.every((name) => process.env[name] === file[name]),
  };
  if (!names.every((name) => process.env[name] === file[name]))
    throw Error("Running configuration differs from pilot file");
  const accountId = canonicalAddress(process.env.MEMWAL_ACCOUNT_ID!);
  const relayer = process.env.MEMWAL_RELAYER_URL;
  if (
    relayer !== "https://relayer.memory.walrus.xyz" ||
    process.env.SUI_NETWORK !== "mainnet"
  )
    throw Error("Mainnet managed relayer required");
  const publicKey = Buffer.from(
    await delegateKeyToPublicKey(process.env.MEMWAL_DELEGATE_KEY!),
  ).toString("hex");
  connection = tatumClient();
  const result = await connection.client.getObject({
    objectId: accountId,
    include: { json: true },
  });
  const account = result.object.json;
  if (
    !result.object.type.endsWith("::account::MemWalAccount") ||
    !account ||
    typeof account.owner !== "string" ||
    !Array.isArray(account.delegate_keys)
  )
    throw Error("Unsupported account response");
  const delegates = account.delegate_keys.map((value: unknown) => {
    if (!value || typeof value !== "object")
      throw Error("Invalid delegate entry");
    const row = value as Record<string, unknown>;
    if (typeof row.public_key !== "string")
      throw Error("Unsupported public-key encoding");
    const bytes = /^[a-fA-F0-9]{64}$/.test(row.public_key)
      ? Buffer.from(row.public_key, "hex")
      : Buffer.from(row.public_key, "base64");
    if (bytes.length !== 32) throw Error("Invalid public key length");
    return {
      publicKey: bytes.toString("hex"),
      label: typeof row.label === "string" ? row.label.slice(0, 80) : null,
    };
  });
  const registered = delegates.some((row) => row.publicKey === publicKey);
  const configuredSeedIsPublic = delegates.some(
    (row) =>
      row.publicKey ===
      process.env.MEMWAL_DELEGATE_KEY?.trim().replace(/^0x/, "").toLowerCase(),
  );
  report.account = {
    id: accountId,
    type: result.object.type,
    owner: canonicalAddress(account.owner),
    active: account.active,
    network: "mainnet",
    namespace: process.env.MEMWAL_NAMESPACE,
  };
  report.delegate = {
    derivedPublicKey: configuredSeedIsPublic ? null : publicKey,
    registered,
    configuredSeedIsPublic,
    registeredDelegates: delegates,
  };
  let ntpSynchronized: boolean | null = null;
  try {
    ntpSynchronized =
      execFileSync(
        "timedatectl",
        ["show", "-p", "NTPSynchronized", "--value"],
        {
          encoding: "utf8",
          timeout: 3000,
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim() === "yes";
  } catch {
    /* Platform may not provide systemd. */
  }
  const before = Date.now();
  const health = await fetch(`${relayer}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  const after = Date.now(),
    remoteDate = Date.parse(health.headers.get("date") ?? "");
  await health.body?.cancel();
  report.clock = {
    ntpSynchronized,
    relayerDateAvailable: Number.isFinite(remoteDate),
    estimatedOffsetMs: Number.isFinite(remoteDate)
      ? Math.round(remoteDate - (before + after) / 2)
      : null,
    roundTripMs: after - before,
    signingWindowMs: 300000,
  };
  if (configuredSeedIsPublic || !registered || account.active !== true) {
    report.recall = {
      state: "blocked",
      reason: configuredSeedIsPublic
        ? "PUBLIC_KEY_USED_AS_PRIVATE_SEED"
        : !registered
          ? "DELEGATE_NOT_REGISTERED"
          : "ACCOUNT_INACTIVE",
      requestSent: false,
    };
    report.ownerAction = {
      dashboard: "https://memory.walrus.xyz",
      action: configuredSeedIsPublic
        ? "Replace the mistakenly configured public value with a freshly generated private delegate kept locally. Never register a key derived from a public seed. Then diagnose and register only the fresh public key."
        : "Register derivedPublicKey on this exact Mainnet account with its owner wallet; revoke the previously exposed delegate. Stop if payment is requested. Keep the private key local.",
    };
    process.exitCode = 1;
  } else {
    memory = MemWal.create({
      key: process.env.MEMWAL_DELEGATE_KEY!,
      accountId,
      namespace: process.env.MEMWAL_NAMESPACE!,
      serverUrl: relayer,
      requestTimeoutMs: 10000,
      recallTimeoutMs: 12000,
      preflightTimeoutMs: 5000,
    });
    try {
      const recalled = await memory.recall({
        query: "RecallDesk confirmed support experience",
        namespace: process.env.MEMWAL_NAMESPACE!,
        limit: 1,
      });
      report.recall = {
        state: "authenticated_recall",
        requestSent: true,
        returned: recalled.results.length,
        note: "Access verification only; no storage or learning claim.",
      };
    } catch (error) {
      report.recall = {
        state: "failed",
        requestSent: true,
        ...readCheckError(error, "walrus_recall"),
      };
      process.exitCode = 1;
    }
  }
} catch {
  report.failure =
    "Read-only diagnosis could not complete. Check the isolated environment, public account shape and network. No raw exception retained.";
  process.exitCode = 1;
} finally {
  memory?.destroy();
  connection?.close();
}
await mkdir("artifacts/live", { recursive: true });
await writeFile(
  "artifacts/live/walrus-diagnosis.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
