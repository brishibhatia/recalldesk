import { test,expect } from "@playwright/test";
test("isolated demo: payment, recommendation, approved attempt, outcome, correction and fresh recall",async({page,context,browser},testInfo)=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");await expect(page.getByRole("heading",{name:/Good support/})).toBeVisible();
  await page.screenshot({path:`artifacts/screenshots/${testInfo.project.name}-entry.png`,fullPage:true});
  await page.getByRole("button",{name:"Open sample workspace"}).click();await expect(page.getByRole("heading",{name:"Case inbox"})).toBeVisible();
  await page.screenshot({path:`artifacts/screenshots/${testInfo.project.name}-inbox.png`,fullPage:true});
  await page.getByRole("link",{name:/Paid, but my studio is still locked/}).click();
  await page.getByRole("button",{name:"Check payment"}).click();await expect(page.getByText("VERIFIED",{exact:true}).first()).toBeVisible();
  await page.getByRole("button",{name:"Generate recommendation"}).click();
  await expect(page.locator(".memory-impact")).toContainText("Relink product access");
  await expect(page.locator(".memory-impact")).toContainText("18 eligible confirmed attempts recalled");
  await page.screenshot({path:`artifacts/screenshots/${testInfo.project.name}-case.png`,fullPage:true});
  await page.getByRole("button",{name:"Approve action",exact:true}).click();await page.getByRole("button",{name:"Restore controlled product access"}).click();await page.getByRole("button",{name:"Resolved",exact:true}).click();
  await expect(page.getByRole("button",{name:"Reopen case"})).toBeVisible();
  const caseUrl=page.url();
  await page.getByRole("link",{name:"Inspect outcome & write status"}).click();await expect(page.getByRole("heading",{name:"Learning timeline"})).toBeVisible();
  await page.screenshot({path:`artifacts/screenshots/${testInfo.project.name}-memory.png`,fullPage:true});
  await page.goto(caseUrl);await page.getByRole("button",{name:"Reopen case"}).click();
  await expect(page.locator(".case-kicker")).toContainText("reopened");
  // A new browser context has no component state or model conversation. Same authorized persisted session.
  const fresh=await browser.newContext({storageState:await context.storageState(),viewport:testInfo.project.name==="mobile"?{width:390,height:844}:{width:1440,height:1000}});
  const next=await fresh.newPage();await next.goto(caseUrl);await next.getByRole("button",{name:"Fresh recommendation"}).click();await expect(next.locator(".memory-impact")).toContainText("Relink product access");await fresh.close();
  await page.goto("/workspace/evaluation");await expect(page.getByText("No evaluation has been run")).toBeVisible();await page.screenshot({path:`artifacts/screenshots/${testInfo.project.name}-evaluation-empty.png`,fullPage:true});await page.getByRole("button",{name:"Run evaluation"}).click();await expect(page.getByRole("heading",{name:"Held-out decisions"})).toBeVisible();
  await page.screenshot({path:`artifacts/screenshots/${testInfo.project.name}-evaluation.png`,fullPage:true});
  await page.goto("/workspace");await page.getByRole("button",{name:"New case"}).click();await page.getByLabel("Case title").fill("Fresh customer access issue");await page.getByLabel("Customer message").fill("I paid but cannot access Studio Plus.");await page.getByRole("button",{name:"Create case",exact:true}).click();await expect(page.getByRole("heading",{name:"Fresh customer access issue"})).toBeVisible();
  await page.goto("/workspace");await page.getByRole("link",{name:/Payment sent to an old address/}).click();await page.getByRole("button",{name:"Check payment"}).click();await expect(page.getByText("RECIPIENT_MISMATCH",{exact:true})).toBeVisible();await page.screenshot({path:`artifacts/screenshots/${testInfo.project.name}-payment-mismatch.png`,fullPage:true});
  await page.goto("/workspace");await page.getByRole("link",{name:/Can you check my transfer/}).click();await page.getByRole("button",{name:"Check payment"}).click();await expect(page.getByText("RPC_UNAVAILABLE",{exact:true})).toBeVisible();await page.screenshot({path:`artifacts/screenshots/${testInfo.project.name}-payment-pending.png`,fullPage:true});
  await page.goto("/workspace/settings");await expect(page.getByRole("heading",{name:"Operational readiness"})).toBeVisible();await page.screenshot({path:`artifacts/screenshots/${testInfo.project.name}-settings.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test("anonymous and foreign sessions cannot read cases; mutations reject cross origin",async({page,request})=>{
  await page.goto("/");await page.getByRole("button",{name:"Open sample workspace"}).click();await expect(page.getByRole("heading",{name:"Case inbox"})).toBeVisible();
  const ws=await (await page.request.get("/api/workspace")).json();const id=ws.cases[0].ticket.id;
  expect((await request.get(`/api/cases/${id}`)).status()).toBe(401);
  expect((await page.request.post("/api/action",{headers:{origin:"https://attacker.example"},data:{}})).status()).toBe(403);
  await request.post("/api/demo",{headers:{origin:new URL(page.url()).origin},data:{}});
  expect((await request.get(`/api/cases/${id}`)).status()).toBe(404);
});
