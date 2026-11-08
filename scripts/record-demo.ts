import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const baseURL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const health = await (await fetch(`${baseURL}/api/health`)).json();
if (health.mode !== "demo")
  throw new Error(
    "Recording script only runs in isolated DEMO mode, never a live tenant.",
  );
await mkdir("artifacts/demo", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: {
    dir: "artifacts/demo/.raw",
    size: { width: 1440, height: 1000 },
  },
  reducedMotion: "reduce",
});
await context.addInitScript(() => {
  const draw = () => {
    if (!document.body || document.getElementById("recording-caption")) return;
    const box = document.createElement("div");
    box.id = "recording-caption";
    box.style.cssText =
      "position:fixed;bottom:18px;left:260px;right:24px;z-index:10000;padding:14px 18px;background:#173d30;color:white;border-radius:9px;box-shadow:0 4px 18px #0002;font:14px/1.5 system-ui;pointer-events:none";
    box.textContent =
      sessionStorage.getItem("recording-caption") ??
      "RecallDesk · Local demo. Synthetic cases; simulated Tatum, Walrus and model. Real database and product access.";
    document.body.appendChild(box);
  };
  document.addEventListener("DOMContentLoaded", draw);
  new MutationObserver(draw).observe(document, {
    childList: true,
    subtree: true,
  });
});
const page = await context.newPage(),
  video = page.video()!;
page.setDefaultTimeout(15000);
const started = Date.now();
const chapters: { seconds: number; text: string }[] = [];
async function caption(text: string) {
  chapters.push({ seconds: Math.round((Date.now() - started) / 1000), text });
  await page.evaluate((text) => {
    const full = `SYNTHETIC DEMO · Simulated Tatum / Walrus / model; real application state.\n${text}`;
    sessionStorage.setItem("recording-caption", full);
    let el = document.getElementById("recording-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "recording-caption";
      document.body.appendChild(el);
    }
    el.style.cssText =
      "position:fixed;bottom:18px;left:260px;right:24px;z-index:2147483647;padding:14px 18px;background:#173d30;color:white;border-radius:9px;font:14px/1.5 system-ui;white-space:pre-line;pointer-events:none";
    el.textContent = full;
  }, text);
  await expect(page.locator("#recording-caption")).toBeVisible();
  console.log(text);
}
async function holdUntil(seconds: number) {
  while (Date.now() - started < seconds * 1000)
    await new Promise((r) =>
      setTimeout(r, Math.min(1000, seconds * 1000 - (Date.now() - started))),
    );
}
async function post(path: string, data: unknown = {}) {
  const response = await page.request.post(`${baseURL}/api/${path}`, {
    headers: { origin: new URL(baseURL).origin },
    data,
  });
  if (!response.ok())
    throw new Error(`Demo request ${path} failed (${response.status()})`);
  return response.json();
}
async function completeOutcome(caseId: string, outcome: "resolved" | "failed") {
  for (let i = 0; i < 12; i++) {
    const rows = (await (
      await page.request.get(`${baseURL}/api/memories`)
    ).json()) as {
      event: {
        caseId: string;
        supersededBy: string | null;
        payload: { outcome: string };
      };
      job: { status: string };
    }[];
    if (
      rows.some(
        (r) =>
          r.event.caseId === caseId &&
          r.event.payload.outcome === outcome &&
          !r.event.supersededBy &&
          r.job.status === "completed",
      )
    )
      return;
    await post("jobs/tick");
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(
    "Outcome did not reach completed storage; recording must not imply it did.",
  );
}
let success = false;
try {
  await page.goto(baseURL);
  await page.getByRole("button", { name: "Open sample workspace" }).click();
  await expect(page.getByRole("heading", { name: "Case inbox" })).toBeVisible();
  const workspace = await (
    await page.request.get(`${baseURL}/api/workspace`)
  ).json();
  const order = workspace.orders.find(
    (o: { reference: string }) => o.reference === "ST-2041",
  );
  const capability = await post("action", {
    action: "support_access",
    commandId: randomUUID(),
    data: { orderId: order.id },
  });
  // Authenticate off-screen: no customer capability is displayed or written to recording metadata.
  await post("support/session", { token: capability.token });
  await page.goto(`${baseURL}/support`);
  await expect(page.getByText("Access missing", { exact: true })).toBeVisible();
  await caption(
    "0:00 · The customer has a paid order, but the controlled product is locked.",
  );
  await page
    .getByLabel("What do you need help with?")
    .fill("My paid studio product is still locked");
  await page
    .getByLabel("Tell us what happened")
    .fill(
      "I paid for Studio Plus and refreshed twice, but I still cannot open the workbook.",
    );
  await page.getByRole("button", { name: "Send support request" }).click();
  await expect(
    page.getByRole("heading", {
      name: "My paid studio product is still locked",
    }),
  ).toBeVisible();
  const caseId = new URL(page.url()).searchParams.get("case")!;
  await holdUntil(16);
  await page.goto(`${baseURL}/workspace/cases/${caseId}`);
  await page.getByRole("button", { name: "Check payment" }).click();
  await expect(
    page.getByText("VERIFIED", { exact: true }).first(),
  ).toBeVisible();
  await caption(
    "Payment checks bind network, execution, asset, amount, recipient and buyer to this order. This receipt is simulated.",
  );
  await holdUntil(30);
  await page.getByRole("button", { name: "Generate recommendation" }).click();
  await expect(page.locator(".memory-impact")).toContainText(
    "Relink product access",
  );
  await page
    .getByRole("button", { name: "Compare with memory disabled" })
    .click();
  await caption(
    "0:30 · Same policy and payment. Failed refreshes lower its score; recalled relink outcomes change the recommendation.",
  );
  await page.locator(".comparison-results").scrollIntoViewIfNeeded();
  await holdUntil(43);
  await page
    .getByRole("button", { name: "Approve action", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore controlled product access" })
    .click();
  await page.goto(`${baseURL}/support?case=${caseId}`);
  await expect(
    page.getByText("Access restored", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "Your product access" })
    .scrollIntoViewIfNeeded();
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Open protected product" }).click();
  await downloading;
  await caption(
    "Approval executes one idempotent entitlement change. The same customer can now download the protected workbook.",
  );
  await holdUntil(65);
  await page.goto(`${baseURL}/workspace/cases/${caseId}`);
  await page.getByRole("button", { name: "Resolved", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reopen case" })).toBeVisible();
  await page.goto(`${baseURL}/workspace/memory`);
  await caption(
    "1:05 · Merchant confirmation queues an outcome. Accepted is not completed. Demo storage is local, not Mainnet.",
  );
  await post("jobs/tick");
  await page.reload();
  await holdUntil(73);
  await completeOutcome(caseId, "resolved");
  await page.reload();
  await page.locator(".memory-card").first().locator("summary").click();
  await caption(
    "The outcome completed. Its logical event and sample storage reference remain inspectable after the request ends.",
  );
  await holdUntil(83);
  await page.goto(`${baseURL}/workspace/cases/${caseId}`);
  await page.getByRole("button", { name: "Reopen case" }).click();
  await expect(page.locator(".case-kicker")).toContainText("reopened");
  await completeOutcome(caseId, "failed");
  await caption(
    "The merchant corrects that outcome: the issue returned. The old success is superseded, never counted twice.",
  );
  await holdUntil(95);
  await page.getByRole("button", { name: "Open a comparable case" }).click();
  await expect(
    page.getByRole("heading", { name: /^Follow-up:/ }),
  ).toBeVisible();
  const freshCase = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.reload();
  await page.getByRole("button", { name: "Check payment" }).click();
  await expect(
    page.getByText("VERIFIED", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate recommendation" }).click();
  await expect(page.locator(".memory-impact")).toContainText(
    "Resend access link",
  );
  await caption(
    "1:35 · Fresh case and page session. The corrected relink failure changes its score from 0.80 to 0.73; resend now leads at 0.80.",
  );
  await page
    .getByRole("button", { name: "Compare with memory disabled" })
    .click();
  await page.locator(".comparison-results").scrollIntoViewIfNeeded();
  await holdUntil(111);
  await page.goto(`${baseURL}/workspace/evidence?case=${freshCase}`);
  await caption(
    "Judge evidence connects the payment, current policy, actual recalled IDs, scores and completed writes. Export omits customer text and access secrets.",
  );
  await holdUntil(125);
  await page.goto(`${baseURL}/workspace`);
  await page
    .getByRole("link", { name: /Payment sent to an old address/ })
    .click();
  await page.getByRole("button", { name: "Check payment" }).click();
  await expect(
    page.getByText("RECIPIENT_MISMATCH", { exact: true }),
  ).toBeVisible();
  await caption(
    "2:05 · A legitimate-looking receipt for a different recipient fails. Provider failure likewise stays unverified.",
  );
  await holdUntil(139);
  await page.goto(`${baseURL}/workspace/evaluation`);
  await page.getByRole("button", { name: "Run evaluation" }).click();
  await expect(
    page.getByRole("heading", { name: "Held-out decisions" }),
  ).toBeVisible();
  await caption(
    "Measured fixture evaluation: baseline 13/16, memory 16/16. Small synthetic dataset; live-model and Mainnet verification remain separate and pending.",
  );
  await holdUntil(160);
  success = true;
} finally {
  await context.close();
  await video.saveAs(
    success
      ? "artifacts/demo/recalldesk-demo.webm"
      : "artifacts/demo/incomplete-demo.webm",
  );
  await browser.close();
  await writeFile(
    success
      ? "artifacts/demo/recording.json"
      : "artifacts/demo/incomplete-recording.json",
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        workflowElapsedSeconds: (Date.now() - started) / 1000,
        complete: success,
        mode: "synthetic-demo",
        audio: "none; on-screen captions",
        freshSession:
          "Full page reload and new case; separate automated browser test also covers a new browser context",
        worker:
          "Authenticated session-scoped worker ticks using the real persistent outbox",
        chapters,
      },
      null,
      2,
    ),
  );
}
