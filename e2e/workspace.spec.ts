import { test, expect } from "@playwright/test";

test("public website connects to all three registration journeys", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Acquire — The next chapter starts here");
  await expect(page.getByRole("link", { name: "Acquire home", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Great businesses. New beginnings." })).toBeVisible();
  await page.getByRole("link", { name: "Plan your next chapter" }).click();
  await expect(page.getByLabel("I’m joining as")).toHaveValue("owner");
});

test("advisor can navigate mandates and record a shared diligence task", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Advisor demo" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back, Alex." })).toBeVisible();
  await expect(page).toHaveTitle("Workspace · Acquire");
  await expect(page.getByRole("link", { name: "Acquire home", exact: true })).toBeVisible();
  await page.goto("/app/deals/cedar");
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByText("Add a diligence task", { exact: true }).click();
  const task = `Review customer schedule ${Date.now()}`;
  await page.getByLabel("Task", { exact: true }).fill(task);
  await page.getByLabel("Due date").fill("2027-01-20");
  await page.getByLabel("Share with").selectOption("demo-buyer");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByText(task, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Complete ${task}`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Reopen ${task}`, exact: true })).toBeVisible();
});

test("buyer sees approved documents but cannot download seller-only files", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back, Taylor." })).toBeVisible();
  const denied = await page.request.get("/api/documents/doc-cedar-internal");
  expect(denied.status()).toBe(404);
  const allowed = await page.request.get("/api/documents/doc-cedar-fin");
  expect(allowed.status()).toBe(200);
  expect(await allowed.text()).toContain("SAMPLE TRANSACTION DOCUMENT");
  await page.goto("/app/deals/harbour");
  await expect(page.getByText("Harbour Health Group Inc.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Your request is with the deal team.", { exact: false })).toBeVisible();
});

test("buyer demo previews a published owner listing without confidential actions", async ({ page }) => {
  const suffix = Date.now();
  const project = `Project Preview ${suffix}`;
  const headers = { Origin: "http://localhost:3000" };
  const registered = await page.request.post("/api/auth", { headers, data: { action: "register", name: "Preview Owner", company: "Preview Owner Inc.", email: `preview-owner-${suffix}@example.test`, password: "preview-password-2026", role: "owner" } });
  expect(registered.status()).toBe(200);
  const created = await page.request.post("/api/workspace", { headers, data: { action: "createDeal", data: { title: project, company_name: "Preview Owner Inc.", sector: "Manufacturing", province: "Ontario", city: "Toronto", revenue: 3000000, ebitda: 500000, asking_price: 4000000, employees: 20, founded: 2012, description: "A fictional Ontario manufacturer used to verify published buyer previews.", confidential_summary: "This must remain hidden from the shared demo buyer." } } });
  expect(created.status()).toBe(200);
  const { id } = await created.json();
  expect((await page.request.post("/api/workspace", { headers, data: { action: "updateDeal", data: { deal_id: id, stage: "On market", published: true } } })).status()).toBe(200);
  expect((await page.request.post("/api/auth", { headers, data: { action: "logout" } })).status()).toBe(200);

  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back, Taylor." })).toBeVisible();
  await page.goto("/app/opportunities");
  const card = page.getByRole("link", { name: new RegExp(project) });
  await expect(card).toContainText("Preview only");
  await card.click();
  await expect(page.getByText("This shared preview account can view published teasers", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request confidential access" })).toHaveCount(0);
  await expect(page.getByText("Preview Owner Inc.", { exact: true })).toHaveCount(0);
});

test("unauthenticated downloads and foreign-origin mutations are rejected", async ({ request }) => {
  expect((await request.get("/api/documents/doc-cedar-fin")).status()).toBe(401);
  const response = await request.post("/api/auth", { headers: { Origin: "https://untrusted.example" }, data: { action: "demo", role: "advisor" } });
  expect(response.status()).toBe(403);
});

test("mobile public page has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("link", { name: "Find your next chapter" })).toBeVisible();
});
