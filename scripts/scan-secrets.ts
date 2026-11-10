import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse } from "dotenv";
import { join } from "node:path";
const ignored = new Set([
  "node_modules",
  ".git",
  ".next",
  ".local",
  "test-results",
  "playwright-report",
  "artifacts/live",
]);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsuiprivkey1[a-z0-9]{45,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}\b/,
  /\bAIza[A-Za-z0-9_-]{35}\b/,
  /\bt-[a-f0-9]{24}-[a-f0-9]{32}\b/,
  /MEMWAL_DELEGATE_KEY\s*=\s*[a-f0-9]{64}/i,
];
const secretNames = [
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "TATUM_API_KEY",
  "MEMWAL_DELEGATE_KEY",
  "BETTER_AUTH_SECRET",
  "MERCHANT_PASSWORD",
  "WORKER_TOKEN",
];
const configuredSecrets: string[] = [];
for (const file of [".env.local", ".local/live-pilot/.env.local"]) {
  if (existsSync(file)) {
    const env = parse(await readFile(file));
    for (const key of secretNames) {
      const value = env[key];
      if (value && value.length >= 12) configuredSecrets.push(value);
    }
  }
}
const loginHandoff = ".local/live-pilot/.local/merchant-login.json";
if (existsSync(loginHandoff)) {
  const handoff = JSON.parse(await readFile(loginHandoff, "utf8"));
  if (typeof handoff.password === "string" && handoff.password.length >= 12)
    configuredSecrets.push(handoff.password);
}
const failures: string[] = [];
let scanned = 0;
async function walk(dir: string) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name),
      relative = path.replace(/^\.\//, "");
    if (
      ignored.has(item.name) ||
      ignored.has(relative) ||
      item.name.endsWith(".tsbuildinfo")
    )
      continue;
    if (item.isDirectory()) {
      await walk(path);
      continue;
    }
    if (item.name.startsWith(".env") && item.name !== ".env.example") continue;
    if (
      !/\.(?:ts|tsx|js|mjs|json|md|yml|yaml|sql|css|example)$/.test(
        item.name,
      ) &&
      !["Dockerfile", ".gitignore", ".dockerignore"].includes(item.name)
    )
      continue;
    const contents = await readFile(path, "utf8");
    scanned++;
    if (
      patterns.some((p) => p.test(contents)) ||
      configuredSecrets.some((secret) => contents.includes(secret))
    )
      failures.push(relative);
  }
}
await walk(".");
for (const bundle of [".next/static", ".local/live-pilot/.next/static"])
  if (existsSync(bundle)) await walk(bundle);
let tracedFilesChecked = 0;
async function checkTraces(directory: string) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await checkTraces(path);
    else if (item.name.endsWith(".nft.json")) {
      const trace = JSON.parse(await readFile(path, "utf8")) as {
        files: string[];
      };
      tracedFilesChecked += trace.files.length;
      if (
        trace.files.some((file) =>
          /(?:^|\/)\.env(?:\.|$)|(?:^|\/)\.local\//.test(file),
        )
      )
        failures.push(
          `${path} (private runtime file included in server trace)`,
        );
    }
  }
}
for (const build of [".next/server", ".local/live-pilot/.next/server"])
  if (existsSync(build)) await checkTraces(build);
console.log(
  JSON.stringify(
    {
      scanned,
      tracedFilesChecked,
      findings: failures,
      scope:
        "RecallDesk source/publication artifacts, browser bundles and server trace exclusions; local secret values checked without disclosure",
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
