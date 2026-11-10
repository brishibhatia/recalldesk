import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { parse } from "dotenv";
const pilot = resolve(".local/live-pilot");
const [command, ...extra] = process.argv.slice(2);
const allowed = new Set([
  "install",
  "db:migrate",
  "merchant:create",
  "integrations:check",
  "pilot:read-check",
  "walrus:diagnose",
  "llm:smoke",
  "recall:client",
  "evaluate:live",
  "build",
  "start",
  "dev",
  "worker",
  "typecheck",
]);
if (!allowed.has(command))
  throw new Error(
    "Choose a documented local pilot command; Mainnet writes are not available through this wrapper.",
  );
const config = parse(await readFile(resolve(pilot, ".env.local")));
if (
  config.APP_MODE !== "live" ||
  config.LOCAL_PILOT_VERIFICATION !== "true" ||
  config.ALLOW_MAINNET_WRITES !== "false" ||
  new URL(config.DATABASE_URL).pathname !== "/recalldesk_live" ||
  config.APP_BASE_URL !== "http://localhost:3001"
)
  throw new Error(
    "Pilot must use its isolated live database, port 3001 and disabled Mainnet writes.",
  );
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run through npm run pilot:run.");
const args =
  command === "install" ? [npm, "ci"] : [npm, "run", command, "--", ...extra];
if (command === "start" || command === "dev")
  args.push("--hostname", "127.0.0.1", "--port", "3001");
const child = spawn(process.execPath, args, {
  cwd: pilot,
  env: { ...process.env, ...config },
  stdio: "inherit",
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
