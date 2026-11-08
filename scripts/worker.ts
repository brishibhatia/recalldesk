import { workerOnce } from "../src/server/worker";
import { pool } from "../src/db";
let running = true;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});
console.log(
  "RecallDesk worker started; persistent leases and job IDs enabled.",
);
do {
  await workerOnce();
  if (process.argv.includes("--once")) break;
  await new Promise((r) => setTimeout(r, 1000));
} while (running);
await pool.end();
