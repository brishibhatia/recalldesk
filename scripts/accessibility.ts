import { chromium, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.APP_BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const reports: Array<{
  viewport: string;
  screen: string;
  screenshot: string;
  horizontalOverflow: boolean;
  violations: Array<{
    id: string;
    impact: string | null | undefined;
    description: string;
    nodes: Array<{ target: unknown; summary: string | undefined }>;
  }>;
}> = [];
await mkdir("artifacts/qa", { recursive: true });

async function audit(page: Page, viewport: string, screen: string) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const screenshot = `artifacts/qa/${viewport}-${screen}.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  reports.push({
    viewport,
    screen,
    screenshot,
    horizontalOverflow,
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  });
  console.log(`${viewport} ${screen}: ${result.violations.length} violations; overflow=${horizontalOverflow}`);
}

try {
  for (const size of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: size, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(baseURL);
    await page.getByRole("button", { name: "Open sample workspace" }).waitFor();
    await audit(page, size.name, "entry");
    await page.getByRole("button", { name: "Open sample workspace" }).click();
    await page.getByRole("heading", { name: "Case inbox" }).waitFor();
    await audit(page, size.name, "inbox");
    await page.getByRole("link", { name: /Paid, but my studio is still locked/ }).click();
    await page.getByRole("button", { name: "Check payment" }).click();
    await page.getByText("VERIFIED", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "Generate recommendation" }).click();
    await page.getByRole("button", { name: "Compare with memory disabled" }).click();
    await page.locator(".comparison-results").waitFor();
    await audit(page, size.name, "case-comparison");
    await page.getByRole("link", { name: "Inspect decision evidence" }).click();
    await page.getByText("Recall source", { exact: true }).waitFor();
    await page.locator(".evidence-record").first().locator("summary").click();
    await audit(page, size.name, "evidence");
    await page.goto(`${baseURL}/workspace/memory`);
    await page.getByRole("heading", { name: "Learning timeline" }).waitFor();
    await audit(page, size.name, "memory");
    await page.goto(`${baseURL}/workspace/evaluation`);
    await page.getByText("No evaluation has been run", { exact: true }).waitFor();
    await audit(page, size.name, "evaluation-empty");
    await page.getByRole("button", { name: "Run evaluation" }).click();
    await page.getByRole("heading", { name: "Held-out decisions" }).waitFor();
    await audit(page, size.name, "evaluation");
    await page.goto(`${baseURL}/workspace/settings`);
    await page.getByRole("heading", { name: "Operational readiness" }).waitFor();
    await audit(page, size.name, "settings");
    await context.close();
  }
} finally {
  await writeFile(
    "artifacts/qa/accessibility.json",
    JSON.stringify({ checkedAt: new Date().toISOString(), baseURL, scope: "Automated WCAG 2/2.1 A/AA axe checks; not an accessibility certification", reports }, null, 2),
  );
  await browser.close();
}
if (reports.some((r) => r.violations.length || r.horizontalOverflow)) process.exitCode = 1;
