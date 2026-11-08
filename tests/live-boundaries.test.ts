import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import * as s from "../src/db/schema";
import { getAuth, authenticate } from "../src/server/auth";
import {
  seedWorkspace,
  seedLearningHistory,
  DEMO_RECIPIENT,
} from "../src/server/fixtures";

const mocks = vi.hoisted(() => ({
  remember: vi.fn(),
  getRememberStatus: vi.fn(),
  waitForRememberJob: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("../src/server/providers/memory", () => ({
  memoryClient: () => mocks,
  memoryText: (event: unknown) =>
    `Synthetic contract-test event\nRECALLDESK_JSON\n${JSON.stringify(event)}`,
}));
import { workerOnce } from "../src/server/worker";
let merchantId: string, userId: string;
beforeAll(async () => {
  process.env.APP_MODE = "live";
  process.env.DATABASE_URL ??=
    "postgresql://recalldesk:local_demo_only@localhost:55432/recalldesk";
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  process.env.ALLOW_MAINNET_WRITES = "true";
  merchantId = randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .insert(s.merchants)
      .values({
        id: merchantId,
        mode: "live",
        name: "Isolated live contract-test merchant",
        recipient: DEMO_RECIPIENT,
        memoryAccountId: DEMO_RECIPIENT,
        memoryOwnerAddress: DEMO_RECIPIENT,
        namespace: `test-${merchantId}`,
      });
    await seedWorkspace(merchantId, tx);
    await seedLearningHistory(merchantId, tx, "synthetic-mainnet", 1);
    await tx
      .insert(s.providerChecks)
      .values({
        merchantId,
        provider: "walrus",
        state: "live",
        message: "Mocked check for isolated contract tests; no remote call",
      });
  });
});
afterAll(async () => {
  await db.delete(s.merchants).where(eq(s.merchants.id, merchantId));
  if (userId) await db.delete(s.user).where(eq(s.user.id, userId));
  delete process.env.APP_MODE;
  delete process.env.ALLOW_MAINNET_WRITES;
  delete process.env.BETTER_AUTH_SECRET;
  await pool.end();
});
it("uses Better Auth email/password with a server-side membership, hashed password and replayable valid session only", async () => {
  const auth = getAuth(true),
    email = `test-${randomUUID()}@example.invalid`,
    password = randomBytes(24).toString("base64url");
  const result = await auth.api.signUpEmail({
    body: { name: "Test operator", email, password },
  });
  userId = result.user.id;
  await db.insert(s.memberships).values({ merchantId, userId, role: "owner" });
  const signed = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  expect(signed.status).toBe(200);
  const cookie = signed.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly");
  const principal = await authenticate(
    new Request("http://localhost:3000/api/workspace", { headers: { cookie } }),
  );
  expect(principal.merchantId).toBe(merchantId);
  const [account] = await db
    .select()
    .from(s.account)
    .where(eq(s.account.userId, userId));
  expect(account.password).not.toBe(password);
  expect(account.password).toBeTruthy();
  const denied = await auth.api.signInEmail({
    body: { email, password: "wrong-password-123456" },
    asResponse: true,
  });
  expect(denied.status).toBe(401);
  const blocked = await getAuth().api.signUpEmail({
    body: {
      name: "Blocked",
      email: `blocked-${randomUUID()}@example.invalid`,
      password,
    },
    asResponse: true,
  });
  expect(blocked.status).toBe(400);
  expect((await blocked.json()).code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
});
it("preserves stable operation key after uncertain acceptance, resumes accepted jobs, and requires completion", async () => {
  mocks.remember.mockRejectedValueOnce(
    Object.assign(new Error("Connection lost after possible acceptance"), {
      status: 503,
    }),
  );
  await workerOnce(merchantId);
  let [job] = await db
    .select()
    .from(s.jobs)
    .where(eq(s.jobs.merchantId, merchantId));
  expect(job.status).toBe("retrying");
  expect(job.providerJobId).toBeNull();
  const firstKey = mocks.remember.mock.calls[0][2];
  mocks.remember.mockResolvedValueOnce({
    job_id: "contract-job-1",
    status: "running",
  });
  await db
    .update(s.jobs)
    .set({ nextRunAt: new Date(0) })
    .where(eq(s.jobs.id, job.id));
  await workerOnce(merchantId);
  [job] = await db.select().from(s.jobs).where(eq(s.jobs.id, job.id));
  expect(mocks.remember.mock.calls[1][2]).toEqual(firstKey);
  expect(job.status).toBe("accepted");
  expect(job.completedAt).toBeNull();
  mocks.getRememberStatus.mockResolvedValueOnce({
    job_id: "contract-job-1",
    status: "running",
  });
  await db
    .update(s.jobs)
    .set({
      nextRunAt: new Date(0),
      leaseUntil: new Date(0),
      leaseToken: randomUUID(),
    })
    .where(eq(s.jobs.id, job.id));
  await workerOnce(merchantId);
  [job] = await db.select().from(s.jobs).where(eq(s.jobs.id, job.id));
  expect(job.status).toBe("processing");
  mocks.getRememberStatus.mockResolvedValueOnce({
    job_id: "contract-job-1",
    status: "done",
  });
  mocks.waitForRememberJob.mockResolvedValueOnce({
    id: "contract-job-1",
    job_id: "contract-job-1",
    blob_id: "contract-blob",
    owner: DEMO_RECIPIENT,
    namespace: `test-${merchantId}`,
  });
  await db
    .update(s.jobs)
    .set({ nextRunAt: new Date(0) })
    .where(eq(s.jobs.id, job.id));
  await workerOnce(merchantId);
  [job] = await db.select().from(s.jobs).where(eq(s.jobs.id, job.id));
  expect(job.status).toBe("completed");
  expect(job.providerMemoryId).toBe("contract-blob");
  expect(mocks.remember).toHaveBeenCalledTimes(2);
});
it("leases prevent concurrent workers from submitting the same event", async () => {
  await db.transaction(async (tx) => {
    await seedLearningHistory(merchantId, tx, "synthetic-mainnet", 2);
  });
  mocks.remember.mockImplementationOnce(async () => {
    await new Promise((r) => setTimeout(r, 50));
    return { job_id: "contract-job-2", status: "running" };
  });
  const before = mocks.remember.mock.calls.length;
  await Promise.all([workerOnce(merchantId), workerOnce(merchantId)]);
  expect(mocks.remember.mock.calls.length - before).toBe(1);
});
it("disabled live writes never call the sample path or submit", async () => {
  process.env.ALLOW_MAINNET_WRITES = "false";
  const before = mocks.remember.mock.calls.length;
  await db
    .update(s.jobs)
    .set({ nextRunAt: new Date(0) })
    .where(
      and(
        eq(s.jobs.merchantId, merchantId),
        sql`${s.jobs.status} <> 'completed'`,
      ),
    );
  await workerOnce(merchantId);
  expect(mocks.remember.mock.calls.length).toBe(before);
  expect(
    (
      await db.select().from(s.jobs).where(eq(s.jobs.merchantId, merchantId))
    ).every((j) => !j.providerJobId?.startsWith("sample")),
  ).toBe(true);
});
