import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

test("a UI-created private mandate stays private until its teaser is explicitly sent", async ({
  page,
  browser,
  baseURL,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const headers = { Origin: baseURL! };
  const buyerFirm = `Presentation Capital ${suffix}`;
  const projectName = `Presentation acquisition ${suffix}`;
  const dealTitle = `Project Presentation ${suffix}`;
  const companyName = `Presentation Services ${suffix}`;
  const buyerContext = await browser.newContext({ baseURL });

  try {
    // Separate test accounts keep shared developer-preview fixtures unchanged.
    expect(
      (
        await buyerContext.request.post("/api/auth", {
          headers,
          data: {
            action: "register",
            name: "Presentation Buyer",
            company: buyerFirm,
            email: `presentation-buyer-${suffix}@example.test`,
            password: "presentation-test-password-2026",
            role: "buyer",
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await buyerContext.request.post("/api/workspace", {
          headers,
          data: {
            action: "createBuyerProject",
            data: {
              name: projectName,
              status: "active",
              thesis:
                "Acquire Ontario business services companies with recurring maintenance contracts.",
              min_revenue: 1_000_000,
              max_revenue: 20_000_000,
              sectors: ["Business services"],
              provinces: ["Ontario"],
            },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post("/api/auth", {
          headers,
          data: {
            action: "register",
            name: "Presentation Owner",
            company: companyName,
            email: `presentation-owner-${suffix}@example.test`,
            password: "presentation-test-password-2026",
            role: "owner",
          },
        })
      ).status(),
    ).toBe(200);

    await page.goto("/app/new");
    await page
      .getByLabel("Legal company name (confidential)")
      .fill(companyName);
    await page
      .getByRole("combobox", { name: "Industry", exact: true })
      .selectOption("Business services");
    await page.getByLabel("Province or territory").selectOption("Ontario");
    await page.getByLabel("Annual revenue (CAD, if known)").fill("8000000");
    await page
      .getByLabel("Brief business description")
      .fill(
        "An established Ontario maintenance services company with recurring contracts and an experienced operating team.",
      );
    await page.getByText("Add project name and optional deal details").click();
    await page.getByLabel("Project name", { exact: false }).fill(dealTitle);
    await page.getByLabel("City (confidential)").fill("Toronto");
    await page.getByLabel("Year founded").fill("2011");
    await page.getByLabel("Employees (confidential)").fill("31");
    await page.getByLabel("EBITDA (CAD)", { exact: true }).fill("1400000");
    await page.getByLabel("Indicative asking price (CAD)").fill("10000000");
    await page.getByLabel("Gross profit (CAD)").fill("3200000");
    await page.getByLabel("Financial year").fill("2025");
    await page
      .getByRole("button", { name: "Create private mandate", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/deals\/[a-f0-9-]+$/);
    await expect(
      page.getByRole("heading", { name: dealTitle, exact: true }),
    ).toBeVisible();

    const dealId = new URL(page.url()).pathname.split("/").at(-1)!;
    const management = page.locator(".detail-sidebar .panel").filter({
      has: page.getByRole("heading", {
        name: "Manage this mandate",
        exact: true,
      }),
    });
    const strategy = management.getByLabel("Distribution strategy");
    await expect(strategy).toBeVisible();
    await expect(strategy).toHaveValue("private_outreach");
    await expect(management).toContainText(
      "Saving these settings does not send outreach",
    );
    await strategy.selectOption("qualified_discovery");
    await expect(
      management.getByLabel("Publish in Qualified Discovery"),
    ).not.toBeChecked();
    await strategy.selectOption("private_outreach");
    await management
      .getByRole("button", { name: "Save mandate settings", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .getByText("Deal settings saved.", { exact: true }),
    ).toBeVisible();

    const beforeSharing = await (
      await buyerContext.request.get("/api/workspace")
    ).json();
    expect(
      beforeSharing.deals.some((deal: { id: string }) => deal.id === dealId),
    ).toBe(false);

    await management
      .getByRole("button", {
        name: "Review buyers and share teaser",
        exact: true,
      })
      .click();
    const recommendation = page.getByRole("article").filter({
      has: page.getByRole("checkbox", {
        name: new RegExp(`Select ${buyerFirm}.*${projectName}`),
      }),
    });
    await recommendation.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Select chosen (1)", exact: true })
      .click();
    await expect(recommendation).toContainText("Selected");
    await page
      .getByRole("button", { name: "Share teaser", exact: true })
      .click();
    await expect(
      page.getByText("Outreach activity", { exact: true }),
    ).toBeVisible();

    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto("/app/opportunities");
    const invitation = buyerPage.getByRole("link", {
      name: new RegExp(dealTitle),
    });
    await expect(invitation).toContainText("Private invitation");
    await invitation.click();
    await expect(buyerPage.locator(".private-invitation")).toContainText(
      projectName,
    );
    await expect(buyerPage.getByText(companyName, { exact: true })).toHaveCount(
      0,
    );

    const afterSharing = await (
      await buyerContext.request.get("/api/workspace")
    ).json();
    const visibleDeal = afterSharing.deals.find(
      (deal: { id: string }) => deal.id === dealId,
    );
    expect(visibleDeal).toMatchObject({
      published: 0,
      distribution_mode: "private_outreach",
      company_name: "Confidential company",
      has_access: false,
    });
    expect(
      afterSharing.documents.filter(
        (document: { deal_id: string }) => document.deal_id === dealId,
      ),
    ).toEqual([]);
  } finally {
    await buyerContext.close();
  }
});
