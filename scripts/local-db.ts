import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
if ((process.env.APP_MODE ?? "demo") !== "demo")
  throw new Error("db:local is only for development/demo.");
const directory = resolve(".local/postgres");
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: "recalldesk",
  password: "local_demo_only",
  port: 55432,
  persistent: true,
  authMethod: "scram-sha-256",
  autoRehydrateSymlinks: true,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync(resolve(directory, "PG_VERSION"))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
if (
  !(
    await client.query("SELECT 1 FROM pg_database WHERE datname = 'recalldesk'")
  ).rowCount
)
  await pg.createDatabase("recalldesk");
await client.end();
console.log(
  "Local PostgreSQL listening on 127.0.0.1:55432; persistent state in .local/postgres. Ctrl+C stops it.",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
