import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("customer intake, scoped revisit, actual access restoration and judge evidence", async ({
  page,
  browser,
}, testInfo) => {
  await page.goto("/");
  const origin = new URL(page.url()).origin;
  await page.getByRole("button", { name: "Open sample workspace" }).click();
  await expect(page.getByRole("heading", { name: "Case inbox" })).toBeVisible();
  const ws = await (await page.request.get("/api/workspace")).json();
  const order = ws.orders.find(
    (o: { reference: string }) => o.reference === "ST-2041",
  );
  const capability = await (
    await page.request.post("/api/action", {
      headers: { origin },
      data: {
        action: "support_access",
        commandId: randomUUID(),
        data: { orderId: order.id },
      },
    })
  ).json();
  const customer = await browser.newContext({
    viewport:
      testInfo.project.name === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
  });
  const support = await customer.newPage();
  await support.goto(`${origin}/support`);
  await support
    .getByLabel("Private support access code")
    .fill(capability.token);
  await support.getByRole("button", { name: "Continue securely" }).click();
  await expect(
    support.getByText("Access missing", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await support.request.get(
        `${origin}/api/support/product/download`,
      )
    ).status(),
  ).toBe(403);
  await support
    .getByLabel("What do you need help with?")
    .fill("Please restore my protected studio product");
  await support
    .getByLabel("Tell us what happened")
    .fill("I paid, but the protected product is still locked.");
  await support.getByRole("button", { name: "Send support request" }).click();
  await expect(
    support.getByRole("heading", {
      name: "Please restore my protected studio product",
    }),
  ).toBeVisible();
  const id = new URL(support.url()).searchParams.get("case")!;
  await support.reload();
  await expect(
    support.getByRole("heading", {
      name: "Please restore my protected studio product",
    }),
  ).toBeVisible();
  await support
    .getByLabel("Add information")
    .fill("I have already refreshed twice. My account still has no access.");
  await support.getByRole("button", { name: "Send update" }).click();
  await expect(
    support.getByText(
      "I have already refreshed twice. My account still has no access.",
      { exact: true },
    ),
  ).toBeVisible();
  const foreign = ws.cases.find(
    (c: { ticket: { orderId: string } }) => c.ticket.orderId !== order.id,
  );
  expect(
    (
      await support.request.get(
        `${origin}/api/support/cases/${foreign.ticket.id}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await support.request.post(`${origin}/api/support/action`, {
        headers: { origin },
        data: {
          action: "verify",
          commandId: randomUUID(),
          caseId: id,
          data: { digest: "public-receipt-is-not-authorization" },
        },
      })
    ).status(),
  ).toBe(403);
  await support.screenshot({
    path: `artifacts/screenshots/${testInfo.project.name}-customer-locked.png`,
    fullPage: true,
  });
  await page.goto(`/workspace/cases/${id}`);
  await page.getByRole("button", { name: "Check payment" }).click();
  await expect(
    page.getByText("VERIFIED", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate recommendation" }).click();
  await page
    .getByRole("button", { name: "Compare with memory disabled" })
    .click();
  await expect(page.locator(".comparison-results")).toContainText("0.50");
  await page
    .getByRole("button", { name: "Approve action", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore controlled product access" })
    .click();
  await expect(
    support.getByText("Access restored", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  const download = support.waitForEvent("download");
  await support.getByRole("link", { name: "Open protected product" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.(md|txt|html)$/);
  await support.screenshot({
    path: `artifacts/screenshots/${testInfo.project.name}-customer-restored.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Resolved", exact: true }).click();
  await page.goto(`/workspace/evidence?case=${id}`);
  await expect(
    page.getByRole("heading", { name: "Judge evidence", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("sample-tatum / sample", { exact: true }),
  ).toBeVisible();
  const exported = await (
    await page.request.get(`/api/evidence?case=${id}&download=1`)
  ).json();
  expect(exported.mode).toBe("demo");
  expect(exported.payment.state).toBe("verified");
  expect(JSON.stringify(exported)).not.toContain(capability.token);
  expect(JSON.stringify(exported)).not.toContain(
    "I have already refreshed twice",
  );
  await page.screenshot({
    path: `artifacts/screenshots/${testInfo.project.name}-evidence.png`,
    fullPage: true,
  });
  await customer.close();
});
