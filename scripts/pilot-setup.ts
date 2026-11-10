import {
  cp,
  mkdir,
  readFile,
  writeFile,
  chmod,
  readdir,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
import { Client } from "pg";

// This is a local source snapshot, not a deployment or a Git worktree/commit.
const root = process.cwd(),
  pilot = resolve(root, ".local/live-pilot");
const local = existsSync(".env.local")
  ? parse(await readFile(".env.local"))
  : {};
const previousPath = resolve(pilot, ".env.local");
const previous = existsSync(previousPath)
  ? parse(await readFile(previousPath))
  : {};
const database = new URL(
  local.DATABASE_URL ??
    "postgresql://recalldesk:local_demo_only@127.0.0.1:55432/recalldesk",
);
if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname))
  throw new Error(
    "Pilot setup only supports an existing loopback PostgreSQL server. No hosted resources are created.",
  );
if (database.pathname === "/recalldesk_live")
  throw new Error(
    "Run pilot:setup from the demo/source checkout, not the pilot.",
  );
database.pathname = "/postgres";
const admin = new Client({
  connectionString: database.toString(),
  connectionTimeoutMillis: 5000,
});
try {
  await admin.connect();
  const found = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname=$1",
    ["recalldesk_live"],
  );
  if (!found.rowCount) await admin.query('CREATE DATABASE "recalldesk_live"');
} catch {
  console.error(
    "Local pilot database setup failed. Start the existing npm run db:local server and check its local connection. No database was reset.",
  );
  process.exitCode = 1;
} finally {
  await admin.end();
}
if (!process.exitCode) {
  database.pathname = "/recalldesk_live";
  await mkdir(pilot, { recursive: true, mode: 0o700 });
  // Explicit allowlist: never copy credentials, local databases, artifacts or dependency/build caches.
  const folders = new Set(["src", "scripts", "drizzle", "public"]);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (
      (entry.isDirectory() && folders.has(entry.name)) ||
      (entry.isFile() &&
        /^(?:package(?:-lock)?\.json|tsconfig\.json|next\.config\.[a-z]+|next-env\.d\.ts|eslint\.config\.[a-z]+|postcss\.config\.[a-z]+|drizzle\.config\.ts|\.env\.example|AGENTS\.md)$/.test(
          entry.name,
        ))
    ) {
      await cp(resolve(root, entry.name), resolve(pilot, entry.name), {
        recursive: true,
      });
    }
  }
  const config: Record<string, string> = {
    ...parse(await readFile(".env.example")),
    ...previous,
    APP_MODE: "live",
    LOCAL_PILOT_VERIFICATION: "true",
    PILOT_FREE_TIER_CONFIRMED: previous.PILOT_FREE_TIER_CONFIRMED || "false",
    PILOT_CREDENTIALS_ROTATED: previous.PILOT_CREDENTIALS_ROTATED || "false",
    APP_BASE_URL: "http://localhost:3001",
    DATABASE_URL: database.toString(),
    BETTER_AUTH_SECRET:
      previous.BETTER_AUTH_SECRET || randomBytes(32).toString("hex"),
    LLM_PROVIDER: "gemini",
    LLM_MODEL: previous.LLM_MODEL || "gemini-3.8-flash",
    OPENAI_API_KEY: "",
    ALLOW_MAINNET_WRITES: "false",
    WORKER_TOKEN: "",
    LIVE_TEST_DIGEST: "",
  };
  await writeFile(
    previousPath,
    Object.entries(config)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  await chmod(previousPath, 0o600);
  const check = new Client({
    connectionString: database.toString(),
    connectionTimeoutMillis: 5000,
  });
  try {
    await check.connect();
    const result = await check.query("SELECT current_database() AS name");
    if (result.rows[0].name !== "recalldesk_live")
      throw new Error("Wrong database");
    console.log(
      "Pilot source and owner-only .env.local prepared in .local/live-pilot. Separate database recalldesk_live connected; demo database unchanged. Mainnet writes disabled. Install pilot dependencies with npm run pilot:run -- install.",
    );
  } catch {
    console.error(
      "Pilot connection verification failed; no successful pilot readiness is claimed.",
    );
    process.exitCode = 1;
  } finally {
    await check.end();
  }
}
