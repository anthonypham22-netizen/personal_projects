import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";

const output = "test-results/demo-preview";
async function capture(page: Page, name: string) {
  mkdirSync(output, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: "disabled" });
}

test("capture landing page and all three real demo workspaces", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Great businesses. New beginnings." })).toBeVisible();
  await capture(page, "01-landing-desktop");
  // Source-only snapshots make the reviewed component and stylesheet available beside the screenshots.
  mkdirSync(`${output}/review-source`, { recursive: true });
  copyFileSync("src/components/workspace.tsx", `${output}/review-source/workspace.tsx`);
  copyFileSync("src/app/globals.css", `${output}/review-source/globals.css`);
  for (const role of ["Advisor", "Buyer", "Owner"]) {
    await page.goto("/login");
    await page.getByRole("button", { name: `${role} demo`, exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Welcome back,/ })).toBeVisible();
    await expect(page.getByRole("note", { name: "Fictional demonstration notice" })).toBeVisible();
    await capture(page, `02-${role.toLowerCase()}-dashboard`);
    if (role === "Advisor") {
      await page.goto("/app/documents");
      await expect(page.getByText("Cedar - Financial overview FY2025.pdf", { exact: true })).toBeVisible();
      await capture(page, "03-advisor-document-library");
      await page.goto("/app/deals/cedar");
      await expect(page.getByRole("heading", { name: "Project Cedar", exact: true })).toBeVisible();
      await capture(page, "04-cedar-deal-room");
      const internal = await page.request.get("/api/documents/doc-cedar-internal");
      expect(internal.status()).toBe(200);
      mkdirSync(`${output}/documents`, { recursive: true });
      writeFileSync(`${output}/documents/Cedar - Seller preparation notes INTERNAL.pdf`, await internal.body());
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/app/documents");
      await expect(page.getByText("Cedar - Financial overview FY2025.pdf", { exact: true })).toBeVisible();
      await capture(page, "05-documents-mobile");
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth, document: document.documentElement.scrollWidth,
        elements: Array.from(document.querySelectorAll("body *")).filter(el => el.getBoundingClientRect().right > window.innerWidth + 1).map(el => ({
          tag: el.tagName, className: el.getAttribute("class"), text: el.textContent?.slice(0,100), right: el.getBoundingClientRect().right,
          width: el.getBoundingClientRect().width, overflowX: getComputedStyle(el).overflowX, position: getComputedStyle(el).position,
          parent: el.parentElement?.getAttribute("class")
        }))
      }));
      writeFileSync(`${output}/mobile-layout.json`, JSON.stringify(layout, null, 2));
      expect.soft(layout.document).toBeLessThanOrEqual(layout.viewport);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  expect(errors).toEqual([]);
});

test("buyer receives generated PDFs while seller-only material remains inaccessible", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Welcome back,/ })).toBeVisible();
  mkdirSync(`${output}/documents`, { recursive: true });
  const samples = [
    ["doc-cedar-fin", "Cedar - Financial overview FY2025.pdf"],
    ["doc-cedar-cim", "Cedar - Business overview.pdf"],
    ["doc-cedar-nda", "Cedar - NDA workflow example NOT EXECUTED.pdf"],
    ["doc-summit-fin", "Summit - Financial overview FY2025.pdf"],
    ["doc-summit-loi", "Summit - Illustrative LOI NOT EXECUTED.pdf"],
  ];
  for (const [id, filename] of samples) {
    const response = await page.request.get(`/api/documents/${id}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    const body = await response.body();
    expect(body.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(body.toString()).toContain("FICTIONAL DEMONSTRATION");
    writeFileSync(`${output}/documents/${filename}`, body);
  }
  expect((await page.request.get("/api/documents/doc-cedar-internal")).status()).toBe(404);
});

test("demo users cannot upload arbitrary documents", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Advisor demo", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Welcome back,/ })).toBeVisible();
  const response = await page.request.post("/api/documents", {
    headers: { Origin: "http://localhost:3000" },
    multipart: { deal_id: "cedar", category: "Other", file: { name: "test.txt", mimeType: "text/plain", buffer: Buffer.from("Fictional test content") } },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).error).toContain("Uploads are disabled");
});
