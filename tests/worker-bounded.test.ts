import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import * as s from "../src/db/schema";
import {
  seedWorkspace,
  seedLearningHistory,
  DEMO_RECIPIENT,
} from "../src/server/fixtures";
const mocks = vi.hoisted(() => ({ remember: vi.fn(), destroy: vi.fn() }));
vi.mock("../src/server/providers/memory", () => ({
  memoryClient: () => mocks,
  memoryText: (event: unknown) =>
    `Synthetic local contract test\nRECALLDESK_JSON\n${JSON.stringify(event)}`,
}));
import { workerOnce } from "../src/server/worker";
let merchantId: string | undefined;
let created = false;
let first: string, second: string;
beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("recalldesk_test"))
    throw Error("A separate RecallDesk test database is required");
  vi.stubEnv("APP_MODE", "live");
  // The provider is fully mocked in this file. This never permits a network call.
  vi.stubEnv("ALLOW_MAINNET_WRITES", "true");
  merchantId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(s.merchants).values({
      id: merchantId,
      name: "Bounded worker contract test",
      mode: "live",
      recipient: DEMO_RECIPIENT,
      memoryAccountId: DEMO_RECIPIENT,
      memoryOwnerAddress: DEMO_RECIPIENT,
      namespace: `test-${merchantId}`,
    });
    await seedWorkspace(merchantId!, tx);
    await seedLearningHistory(merchantId!, tx, "synthetic-mainnet", 2);
    await tx.insert(s.providerChecks).values({
      merchantId: merchantId!,
      provider: "walrus",
      state: "live",
      message: "Local mocked check",
    });
  });
  created = true;
  const events = await db
    .select()
    .from(s.memories)
    .where(eq(s.memories.merchantId, merchantId));
  first = events.find((event) => event.payload.caseRef === "LEARN-1")!.id;
  second = events.find((event) => event.payload.caseRef === "LEARN-2")!.id;
});
afterAll(async () => {
  if (created && merchantId)
    await db.delete(s.merchants).where(eq(s.merchants.id, merchantId));
  vi.unstubAllEnvs();
  await pool.end();
});
it("an empty event allowlist processes no queued job", async () => {
  expect(await workerOnce(merchantId, [])).toBe(false);
  expect(mocks.remember).not.toHaveBeenCalled();
});
it("processes only the selected logical event, leaving an older unrelated queued job untouched", async () => {
  mocks.remember.mockResolvedValueOnce({
    job_id: "bounded-contract-job",
    status: "running",
  });
  await workerOnce(merchantId, [second]);
  const rows = await db
    .select()
    .from(s.jobs)
    .where(eq(s.jobs.merchantId, merchantId!));
  expect(rows.find((job) => job.eventId === second)?.status).toBe("accepted");
  expect(rows.find((job) => job.eventId === first)?.status).toBe("queued");
  expect(mocks.remember).toHaveBeenCalledTimes(1);
});
it("payment-required responses become terminal and are not retried by the worker", async () => {
  mocks.remember.mockRejectedValueOnce(
    Object.assign(new Error("Synthetic payment required"), { status: 402 }),
  );
  await workerOnce(merchantId, [first]);
  const [job] = await db.select().from(s.jobs).where(eq(s.jobs.eventId, first));
  expect(job.status).toBe("failed");
  expect(job.error).toContain("requested payment");
  const calls = mocks.remember.mock.calls.length;
  expect(await workerOnce(merchantId, [first])).toBe(false);
  expect(mocks.remember.mock.calls.length).toBe(calls);
});
