/** Target total of idempotent HISTORY-NNN records, never an additional-write count. */
export function mainnetSeedCount(args: readonly string[]) {
  const index = args.indexOf("--count");
  const count = index === -1 ? 20 : Number(args[index + 1]);
  if (!Number.isInteger(count) || count < 1 || count > 20)
    throw new Error("Count must be an integer between 1 and 20.");
  return count;
}

export function historyReferences(count: number) {
  return Array.from(
    { length: count },
    (_, i) => `HISTORY-${String(i + 1).padStart(3, "0")}`,
  );
}

export function completedMainnetJob(
  job: {
    status: string;
    providerJobId: string | null;
    providerMemoryId: string | null;
    completedAt: Date | null;
    receipt: Record<string, unknown> | null;
  },
  owner: string,
  namespace: string,
) {
  return (
    job.status === "completed" &&
    !!job.providerJobId &&
    !!job.providerMemoryId &&
    !!job.completedAt &&
    job.receipt?.network === "mainnet" &&
    job.receipt.signal === "relayer-job-done" &&
    job.receipt.jobId === job.providerJobId &&
    job.receipt.blobId === job.providerMemoryId &&
    job.receipt.owner === owner &&
    job.receipt.namespace === namespace
  );
}
