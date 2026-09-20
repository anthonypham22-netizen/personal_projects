import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const output = "test-results/demo-preview";
async function capture(page: Page, name: string) {
  mkdirSync(output, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
}

test("capture landing page and all three real demo workspaces", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Great businesses. New beginnings." })).toBeVisible();
  await capture(page, "01-landing-desktop");
  for (const role of ["Advisor", "Buyer", "Owner"]) {
    await page.goto("/login");
    await page.getByRole("button", { name: `${role} demo`, exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Welcome back,/ })).toBeVisible();
    await capture(page, `02-${role.toLowerCase()}-dashboard`);
    if (role === "Advisor") {
      await page.goto("/app/documents");
      await expect(page.getByText("Cedar - Financial overview FY2025.pdf", { exact: true })).toBeVisible();
      await capture(page, "03-advisor-document-library");
      await page.goto("/app/deals/cedar");
      await expect(page.getByRole("heading", { name: "Project Cedar", exact: true })).toBeVisible();
      await capture(page, "04-cedar-deal-room");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/app/documents");
      await expect(page.getByText("Cedar - Financial overview FY2025.pdf", { exact: true })).toBeVisible();
      await capture(page, "05-documents-mobile");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  expect(errors).toEqual([]);
});

test("buyer receives real generated PDFs while seller-only material remains inaccessible", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Welcome back,/ })).toBeVisible();
  for (const id of ["doc-cedar-fin", "doc-cedar-cim", "doc-cedar-nda", "doc-summit-fin", "doc-summit-loi"]) {
    const response = await page.request.get(`/api/documents/${id}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    const body = await response.body();
    expect(body.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(body.toString()).toContain("FICTIONAL DEMONSTRATION");
  }
  expect((await page.request.get("/api/documents/doc-cedar-internal")).status()).toBe(404);
});
