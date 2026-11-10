import { spawn } from "node:child_process";
import { Client } from "pg";

// Never inherit the application .env.local or run tests against its business database.
let url: URL;
try {
  url = new URL(process.env.DATABASE_URL ??
    "postgresql://recalldesk:local_demo_only@127.0.0.1:55432/recalldesk_test");
} catch {
  throw Error("Invalid test database configuration; connection values are not logged.");
}
const database = url.pathname.slice(1);
if (
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !/^recalldesk_test(?:_[a-z0-9]+)*$/.test(database)
) {
  throw Error(
    "Tests require a local database named recalldesk_test or recalldesk_test_<suffix>. Configure .env.test.local; no application data was touched.",
  );
}
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  APP_MODE: "demo",
  ALLOW_MAINNET_WRITES: "false",
};
for (const key of [
  "TATUM_API_KEY",
  "MEMWAL_DELEGATE_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "BETTER_AUTH_SECRET",
  "MERCHANT_PASSWORD",
  "WORKER_TOKEN",
  "LOCAL_PILOT_VERIFICATION",
  "PILOT_FREE_TIER_CONFIRMED",
  "PILOT_CREDENTIALS_ROTATED",
  "LLM_VERIFICATION_GRANT",
  "LLM_MAX_RETRIES",
])
  delete (env as Record<string, string | undefined>)[key];
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const client = new Client({
  connectionString: adminUrl.toString(),
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  const found = await client.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    [database],
  );
  if (!found.rowCount) await client.query(`CREATE DATABASE "${database}"`);
} catch {
  console.error(
    "Test database setup failed. Start the local PostgreSQL service or configure its test-only connection in ignored .env.test.local. No provider was contacted.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
async function run(args: string[]) {
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit" });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
if (!process.exitCode) {
  console.log(
    `Using isolated test database ${database}; live provider credentials removed from test process.`,
  );
  const migrated = await run([
    "node_modules/tsx/dist/cli.mjs",
    "scripts/migrate.ts",
  ]);
  process.exitCode =
    migrated ||
    (await run([
      "node_modules/vitest/vitest.mjs",
      "run",
      ...process.argv.slice(2),
    ]));
}
