import { expect, it } from "vitest";
import {
  completedMainnetJob,
  historyReferences,
  mainnetSeedCount,
} from "../scripts/lib/mainnet-seed-plan";

it("supports a one-record canary followed by an idempotent target total of ten", () => {
  expect(mainnetSeedCount(["--count", "1"])).toBe(1);
  expect(mainnetSeedCount(["--count", "10"])).toBe(10);
  expect(mainnetSeedCount([])).toBe(20);
  expect(historyReferences(10)).toContain(historyReferences(1)[0]);
  expect(new Set(historyReferences(10)).size).toBe(10);
});
it.each(["0", "21", "1.5", "NaN", undefined])(
  "rejects invalid bounded count %s",
  (value) => {
    expect(() =>
      mainnetSeedCount(value === undefined ? ["--count"] : ["--count", value]),
    ).toThrow();
  },
);
it("counts only completed receipts with matching Mainnet job/blob/account/namespace", () => {
  const job = {
    status: "completed",
    providerJobId: "local-contract-job",
    providerMemoryId: "local-contract-blob",
    completedAt: new Date(),
    receipt: {
      network: "mainnet",
      signal: "relayer-job-done",
      jobId: "local-contract-job",
      blobId: "local-contract-blob",
      owner: "owner",
      namespace: "namespace",
    },
  };
  expect(completedMainnetJob(job, "owner", "namespace")).toBe(true);
  for (const change of [
    { status: "accepted" },
    { status: "processing" },
    { completedAt: null },
    { providerMemoryId: null },
    { receipt: { ...job.receipt, network: "sample" } },
    { receipt: { ...job.receipt, jobId: "wrong" } },
  ])
    expect(
      completedMainnetJob({ ...job, ...change }, "owner", "namespace"),
    ).toBe(false);
  expect(completedMainnetJob(job, "foreign-owner", "namespace")).toBe(false);
  expect(completedMainnetJob(job, "owner", "foreign-namespace")).toBe(false);
});
