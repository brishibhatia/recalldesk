import { mkdir, writeFile } from "node:fs/promises";
import { evaluate } from "../src/evaluation/runner";
import { pool } from "../src/db";
import { heldout, learning } from "../src/evaluation/dataset";
const report = evaluate();
await mkdir("artifacts/evaluation", { recursive: true });
await writeFile(
  "artifacts/evaluation/latest.json",
  JSON.stringify(report, null, 2) + "\n",
);
await writeFile(
  "artifacts/evaluation/dataset-v1.json",
  JSON.stringify({ learning, heldout }, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      baseline: `${report.baselineCorrect}/${report.heldoutCount}`,
      memory: `${report.memoryCorrect}/${report.heldoutCount}`,
      unsupportedApprovals: report.unsupportedApprovals,
      invalidCitations: report.invalidCitations,
      report: "artifacts/evaluation/latest.json",
    },
    null,
    2,
  ),
);
await pool.end();
