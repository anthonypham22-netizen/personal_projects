import { test, expect } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

function provisionPlatformReviewer(email: string) {
  const database = new DatabaseSync(
    path.resolve("test-results/app-data/northlane.sqlite"),
  );
  try {
    database.exec("PRAGMA busy_timeout=5000");
    const result = database
      .prepare("UPDATE users SET is_platform_admin=1 WHERE email=?")
      .run(email);
    expect(result.changes).toBe(1);
  } finally {
    database.close();
  }
}

test("public website connects to all three registration journeys", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Succera — The next chapter starts here");
  await expect(
    page.getByRole("link", { name: "Succera home", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Great businesses. New beginnings." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Plan your next chapter" }).click();
  await expect(page.getByLabel("I’m joining as")).toHaveValue("owner");
});

test("advisor can navigate mandates and record a shared diligence task", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Advisor demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Alex." }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Workspace · Succera");
  await expect(
    page.getByRole("link", { name: "Succera home", exact: true }),
  ).toBeVisible();
  await page.goto("/app/deals/cedar");
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByText("Add a diligence task", { exact: true }).click();
  const task = `Review customer schedule ${Date.now()}`;
  await page.getByLabel("Task", { exact: true }).fill(task);
  await page.getByLabel("Due date").fill("2027-01-20");
  await page.getByLabel("Share with").selectOption("demo-buyer");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByText(task, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: `Complete ${task}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Reopen ${task}`, exact: true }),
  ).toBeVisible();
});

test("owner can review financial history and choose a distribution strategy", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Owner demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Jamie." }),
  ).toBeVisible();
  await page.goto("/app/deals/cedar");
  await expect(
    page.getByRole("heading", { name: "Historical financials" }),
  ).toBeVisible();
  await expect(page.getByText("FY2025", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Mandate settings" }).click();
  const distribution = page.getByLabel("Distribution strategy");
  await expect(distribution).toHaveValue("qualified_discovery");
  await distribution.selectOption("invite_only");
  await page
    .getByRole("button", { name: "Save mandate details", exact: true })
    .click();
  await expect(distribution).toHaveValue("invite_only");
});

test("owner can inspect and curate recommended buyers", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Owner demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Jamie." }),
  ).toBeVisible();
  await page.goto("/app/deals/cedar");
  await page.getByRole("button", { name: "Recommended buyers" }).click();

  await expect(
    page.getByRole("heading", { name: "Recommended buyers" }),
  ).toBeVisible();
  const recommendation = page.getByRole("article").filter({
    has: page.getByRole("checkbox", {
      name: /Select Evergreen Capital.*Project Maple/,
    }),
  });
  await expect(recommendation).toContainText("Evergreen Capital");
  await expect(recommendation).toContainText(/\d+% match/);
  await recommendation.getByText("View profile").click();
  await expect(recommendation).toContainText("Acquisition criteria");
  await expect(recommendation).toContainText("Capital");
  await expect(recommendation).toContainText("Experience");
  await expect(recommendation).toContainText("Marketplace reputation");
  await expect(recommendation).toContainText("Response rate");
  await expect(recommendation).toContainText("Median response");
  await expect(recommendation).toContainText("Verified transactions");
  await expect(recommendation).toContainText(
    "Informational only and not included in the match score",
  );
  await expect(recommendation).toContainText("Active acquisition projects");
  await expect(recommendation).toContainText("Project Northern Lights");
  await expect(recommendation).not.toContainText(
    "Fictional committed private investment fund.",
  );
  await recommendation.getByText("Inspect match reasoning").click();
  await expect(recommendation).toContainText("Industry");
  await recommendation
    .getByRole("checkbox", { name: /Select Evergreen Capital.*Project Maple/ })
    .check();
  await page.getByRole("button", { name: "Select chosen (1)" }).click();
  await expect(recommendation).toContainText("Selected");
  await recommendation.getByRole("button", { name: "Exclude buyer" }).click();
  await expect(recommendation).toContainText("Excluded");
  await recommendation.getByRole("button", { name: "Restore buyer" }).click();
  await expect(recommendation).toContainText("Recommended");
});

test("buyer can maintain a seller-facing firm profile", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/verification");

  await expect(
    page.getByRole("heading", { name: "Seller-facing firm profile" }),
  ).toBeVisible();
  await page
    .getByLabel("Fund structure")
    .fill("Canadian lower-middle-market private equity fund.");
  await page
    .getByLabel("Financing profile")
    .fill("Committed equity with senior acquisition financing.");
  await page.getByLabel("Completed acquisitions (self-reported)").fill("14");
  await page
    .getByRole("button", { name: "Save seller-facing profile" })
    .click();
  await expect(
    page.getByRole("status").getByText("Seller-facing firm profile saved."),
  ).toBeVisible();
  await expect(
    page.getByLabel("Completed acquisitions (self-reported)"),
  ).toHaveValue("14");
  await page.getByLabel("Completed acquisitions (self-reported)").fill("");
  await page
    .getByRole("button", { name: "Save seller-facing profile" })
    .click();
  await expect(
    page.getByRole("status").getByText("Seller-facing firm profile saved."),
  ).toBeVisible();
  await expect(
    page.getByLabel("Completed acquisitions (self-reported)"),
  ).toHaveValue("");
});

test("buyer adds a transaction tombstone for review and sellers see its verification state", async ({
  page,
}) => {
  const industry = `Specialty distribution ${Date.now()}`;
  const headers = { Origin: "http://localhost:3000" };
  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/verification");

  await expect(
    page.getByRole("heading", { name: "Closed transaction history" }),
  ).toBeVisible();
  await page.getByLabel("Industry").fill(industry);
  await page.getByLabel("Province").selectOption("Ontario");
  await page.getByLabel("Enterprise value (CAD)").fill("18000000");
  await page.getByLabel("Closing date").fill("2025-06-30");
  await page
    .getByLabel("Anonymized transaction description")
    .fill(
      "Majority acquisition of a Canadian recurring-revenue distribution business.",
    );
  await page.getByRole("button", { name: "Add transaction record" }).click();
  const buyerTombstone = page
    .locator(".transaction-tombstones-own article")
    .filter({ hasText: industry });
  await expect(buyerTombstone).toContainText("Self-reported");

  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Advisor demo" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/verification");
  const review = page
    .locator(".verification-review-card")
    .filter({ hasText: industry });
  await expect(review).toContainText("Evergreen Capital");
  await review
    .getByRole("button", { name: "Mark as Succera verified" })
    .click();
  await expect(
    page
      .getByRole("status")
      .getByText("Transaction history verified by Succera."),
  ).toBeVisible();

  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Owner demo" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/deals/cedar");
  await page.getByRole("button", { name: "Recommended buyers" }).click();
  const recommendation = page.getByRole("article").filter({
    has: page.getByRole("checkbox", {
      name: /Select Evergreen Capital.*Project Maple/,
    }),
  });
  await recommendation.getByText("View profile").click();
  await expect(recommendation).toContainText("Closed transaction history");
  await expect(recommendation).toContainText(industry);
  await expect(recommendation).toContainText("Succera verified");
});

test("advisor can inspect the event-backed buyer funnel and record a milestone", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Advisor demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Alex." }),
  ).toBeVisible();
  await page.goto("/app/deals/cedar");
  await page.getByRole("button", { name: "Buyer funnel" }).click();

  await expect(
    page.getByRole("heading", { name: "Buyer funnel" }),
  ).toBeVisible();
  await expect(
    page.getByText("Recommended", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Interested", { exact: true }).first(),
  ).toBeVisible();
  const buyerRow = page.getByRole("row").filter({
    hasText: "Evergreen Capital",
  });
  await expect(buyerRow).toContainText(/NDA|CIM|LOI|IOI/);
  await buyerRow
    .getByRole("button", { name: /Inspect Evergreen Capital/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Buyer event history" }),
  ).toBeVisible();
  await page
    .getByLabel("Record milestone for Evergreen Capital")
    .selectOption("ioi_received");
  await page.getByRole("button", { name: "Record milestone" }).click();
  await expect(buyerRow).toContainText("IOI");
});

test("seller-side teams can keep private notes out of buyer workspaces", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Advisor demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Alex." }),
  ).toBeVisible();
  await page.goto("/app/deals/cedar");
  await page.getByRole("button", { name: "Internal notes" }).click();

  await expect(
    page.getByRole("heading", { name: "Internal notes" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Private to the owner and advisor firms/),
  ).toBeVisible();
  await expect(
    page.getByText(/Interest is strong, but we still need confirmation/),
  ).toBeVisible();

  const note = `Confirm financing source before shortlist ${Date.now()}.`;
  await page.getByRole("textbox", { name: "Internal note" }).fill(note);
  await page.getByRole("button", { name: "Add internal note" }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Alex Morgan", { exact: true }).first(),
  ).toBeVisible();

  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Taylor." }),
  ).toBeVisible();
  await page.goto("/app/deals/cedar");
  await expect(
    page.getByRole("button", { name: "Internal notes" }),
  ).toHaveCount(0);
  await expect(page.getByText(note, { exact: true })).toHaveCount(0);
});

test("users can review notifications and control email delivery preferences", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Taylor." }),
  ).toBeVisible();

  const bell = page.getByRole("button", { name: /Notifications/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const notifications = page.getByRole("region", { name: "Notifications" });
  await expect(notifications).toBeVisible();
  const taskNotification = notifications
    .getByRole("article")
    .filter({ hasText: "Review the FY2025 financial overview" });
  await expect(taskNotification).toContainText(
    "Review the FY2025 financial overview",
  );
  await taskNotification.getByRole("button", { name: "Mark as read" }).click();
  await expect(
    taskNotification.getByRole("button", { name: "Mark as unread" }),
  ).toBeVisible();

  await page.goto("/app/settings");
  await expect(
    page.getByRole("heading", { name: "Email notification preferences" }),
  ).toBeVisible();
  await page
    .getByLabel("Email delivery for New messages")
    .selectOption("daily_digest");

  // A different workspace action refreshes shared data. The unsaved selector
  // should remain local until the notification form is explicitly saved.
  await page.getByLabel("Full name").fill("Taylor Buyer");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByLabel("Email delivery for New messages")).toHaveValue(
    "daily_digest",
  );

  await page
    .getByLabel("Email delivery for New messages")
    .selectOption("disabled");
  await page
    .getByRole("button", { name: "Save notification preferences" })
    .click();
  await expect(page.getByLabel("Email delivery for New messages")).toHaveValue(
    "disabled",
  );
});

test("seller shares a private teaser and sees the buyer response", async ({
  page,
}) => {
  const suffix = Date.now();
  const headers = { Origin: "http://localhost:3000" };
  const password = "private-outreach-password-2026";
  const buyerEmail = `outreach-buyer-${suffix}@example.test`;
  const sellerEmail = `outreach-seller-${suffix}@example.test`;
  const projectName = `Project Outreach ${suffix}`;
  const dealTitle = `Project Invitation ${suffix}`;

  expect(
    (
      await page.request.post("/api/auth", {
        headers,
        data: {
          action: "register",
          name: "Outreach Buyer",
          company: `Outreach Capital ${suffix}`,
          email: buyerEmail,
          password,
          role: "buyer",
        },
      })
    ).status(),
  ).toBe(200);
  const projectResponse = await page.request.post("/api/workspace", {
    headers,
    data: {
      action: "createBuyerProject",
      data: {
        name: projectName,
        status: "active",
        thesis: "Ontario business services companies with recurring revenue.",
        min_revenue: 1_000_000,
        max_revenue: 20_000_000,
        sectors: ["Business services"],
        provinces: ["Ontario"],
      },
    },
  });
  expect(projectResponse.status()).toBe(200);
  const projectId = (await projectResponse.json()).id;
  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });

  expect(
    (
      await page.request.post("/api/auth", {
        headers,
        data: {
          action: "register",
          name: "Outreach Seller",
          company: `Outreach Services ${suffix}`,
          email: sellerEmail,
          password,
          role: "owner",
        },
      })
    ).status(),
  ).toBe(200);
  const dealResponse = await page.request.post("/api/workspace", {
    headers,
    data: {
      action: "createDeal",
      data: {
        title: dealTitle,
        company_name: `Outreach Services ${suffix}`,
        sector: "Business services",
        province: "Ontario",
        city: "Toronto",
        revenue: 8_000_000,
        ebitda: 1_400_000,
        asking_price: 10_000_000,
        employees: 31,
        founded: 2011,
        description: "A Canadian services platform with recurring contracts.",
        confidential_summary: "Confidential customer concentration details.",
        distribution_mode: "private_outreach",
        financial_year: 2025,
      },
    },
  });
  expect(dealResponse.status()).toBe(200);
  const dealId = (await dealResponse.json()).id;
  const sellerWorkspace = await (
    await page.request.get("/api/workspace")
  ).json();
  const match = sellerWorkspace.deal_matches.find(
    (candidate: { deal_id: string; buyer_project_id: string }) =>
      candidate.deal_id === dealId && candidate.buyer_project_id === projectId,
  );
  expect(match?.eligible).toBe(1);
  expect(
    (
      await page.request.post("/api/workspace", {
        headers,
        data: {
          action: "updateDealMatchStatus",
          data: { deal_id: dealId, match_ids: [match.id], status: "selected" },
        },
      })
    ).status(),
  ).toBe(200);

  await page.goto(`/app/deals/${dealId}`);
  await page.getByRole("button", { name: "Recommended buyers" }).click();
  await expect(
    page.getByRole("heading", { name: "Share teaser" }),
  ).toBeVisible();
  await expect(
    page.getByText(projectName, { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview outreach" }).click();
  await expect(page.getByText("BUYER PREVIEW", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Share teaser", exact: true }).click();
  await expect(
    page.getByText("Outreach activity", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sent", { exact: true }).first()).toBeVisible();

  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(buyerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/opportunities");
  const invitation = page.getByRole("link", { name: new RegExp(dealTitle) });
  await expect(invitation).toContainText("Private invitation");
  await invitation.click();
  const privatePanel = page.locator(".private-invitation");
  await expect(privatePanel).toContainText(projectName);
  await expect(privatePanel).toContainText("Viewed");
  await privatePanel.getByRole("button", { name: "I’m interested" }).click();
  await expect(privatePanel).toContainText("Interest recorded");
  await expect(
    page.getByText(`Outreach Services ${suffix}`, { exact: true }),
  ).toHaveCount(0);

  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(sellerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto(`/app/deals/${dealId}`);
  await page.getByRole("button", { name: "Recommended buyers" }).click();
  await expect(page.getByText("Pursued", { exact: true })).toBeVisible();
});

test("matched buyer requests a seller-controlled Qualified Discovery introduction", async ({
  page,
}) => {
  const suffix = Date.now();
  const headers = { Origin: "http://localhost:3000" };
  const password = "qualified-discovery-password-2026";
  const buyerEmail = `discovery-buyer-${suffix}@example.test`;
  const sellerEmail = `discovery-seller-${suffix}@example.test`;
  const buyerFirm = `Maple Ridge Capital ${suffix}`;
  const projectName = `Project Discovery ${suffix}`;
  const dealTitle = `Project Northstar ${suffix}`;

  expect(
    (
      await page.request.post("/api/auth", {
        headers,
        data: {
          action: "register",
          name: "Discovery Buyer",
          company: buyerFirm,
          email: buyerEmail,
          password,
          role: "buyer",
        },
      })
    ).status(),
  ).toBe(200);
  const projectResponse = await page.request.post("/api/workspace", {
    headers,
    data: {
      action: "createBuyerProject",
      data: {
        name: projectName,
        status: "active",
        thesis:
          "Acquire majority positions in profitable Ontario technology platforms with recurring revenue.",
        min_revenue: 4_000_000,
        max_revenue: 12_000_000,
        min_ebitda: 750_000,
        max_ebitda: 3_000_000,
        min_enterprise_value: 7_000_000,
        max_enterprise_value: 18_000_000,
        ownership_preference: "majority",
        transaction_type: "majority_acquisition",
        sectors: ["Technology"],
        provinces: ["Ontario"],
        keywords: ["recurring revenue"],
      },
    },
  });
  expect(projectResponse.status()).toBe(200);
  const buyerWorkspace = await (
    await page.request.get("/api/workspace")
  ).json();
  const verificationProfile = await page.request.post("/api/workspace", {
    headers,
    data: {
      action: "updateBuyerVerificationProfile",
      data: {
        legal_name: `${buyerFirm} Inc.`,
        website: `https://maple-ridge-${suffix}.example.test`,
        buyer_type: "private_equity",
        principals: "Discovery Buyer, Managing Partner",
        acquisition_history:
          "Completed Canadian software acquisitions with operating oversight.",
        capital_source: "Committed private investment capital.",
        min_equity_check: 2_000_000,
        max_equity_check: 20_000_000,
        financing_approach: "Equity capital with senior acquisition financing.",
      },
    },
  });
  expect(verificationProfile.status()).toBe(200);
  expect(
    (
      await page.request.post("/api/workspace", {
        headers,
        data: { action: "submitBuyerVerification", data: {} },
      })
    ).status(),
  ).toBe(200);
  const submittedBuyerWorkspace = await (
    await page.request.get("/api/workspace")
  ).json();
  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });
  const reviewerEmail = `discovery-reviewer-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth", {
        headers,
        data: {
          action: "register",
          name: "Discovery Verification Reviewer",
          company: `Platform Operations ${suffix}`,
          email: reviewerEmail,
          password,
          role: "advisor",
        },
      })
    ).status(),
  ).toBe(200);
  provisionPlatformReviewer(reviewerEmail);
  expect(
    (
      await page.request.post("/api/workspace", {
        headers,
        data: {
          action: "reviewBuyerVerification",
          data: {
            organization_id: buyerWorkspace.organization.id,
            submission_revision:
              submittedBuyerWorkspace.buyer_verification_profile
                .submission_revision,
            decision: "firm_verified",
            notes: "Firm identity reviewed for the Qualified Discovery test.",
          },
        },
      })
    ).status(),
  ).toBe(200);
  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });

  expect(
    (
      await page.request.post("/api/auth", {
        headers,
        data: {
          action: "register",
          name: "Discovery Seller",
          company: `Northstar Software ${suffix}`,
          email: sellerEmail,
          password,
          role: "owner",
        },
      })
    ).status(),
  ).toBe(200);
  const dealResponse = await page.request.post("/api/workspace", {
    headers,
    data: {
      action: "createDeal",
      data: {
        title: dealTitle,
        company_name: `Northstar Software ${suffix}`,
        sector: "Technology",
        province: "Ontario",
        city: "Toronto",
        revenue: 8_000_000,
        ebitda: 1_600_000,
        asking_price: 12_000_000,
        employees: 34,
        founded: 2012,
        description:
          "A profitable vertical software platform with recurring revenue and durable Canadian customers.",
        confidential_summary:
          "Confidential owner, customer, and product information.",
        transaction_type: "majority_acquisition",
        ownership_percentage_available: 80,
        seller_rollover_possible: true,
        management_transition: "Founder available for transition.",
        reason_for_transaction: "Planned succession.",
        min_expected_value: 10_000_000,
        max_expected_value: 14_000_000,
        distribution_mode: "qualified_discovery",
        financial_year: 2025,
      },
    },
  });
  expect(dealResponse.status()).toBe(200);
  const dealId = (await dealResponse.json()).id;
  expect(
    (
      await page.request.post("/api/workspace", {
        headers,
        data: {
          action: "updateDeal",
          data: {
            deal_id: dealId,
            stage: "On market",
            published: true,
            distribution_mode: "qualified_discovery",
          },
        },
      })
    ).status(),
  ).toBe(200);
  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });

  await page.goto("/login");
  await page.getByLabel("Email address").fill(buyerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/opportunities");
  await expect(
    page.getByRole("heading", { name: "Discover qualified opportunities." }),
  ).toBeVisible();
  const discoveryCard = page
    .getByRole("article")
    .filter({ hasText: dealTitle });
  await expect(discoveryCard).toContainText(projectName);
  await expect(discoveryCard).toContainText("Why this matches you");
  await expect(discoveryCard).toContainText("Industry");
  await expect(
    page.getByText(`Northstar Software ${suffix}`, { exact: true }),
  ).toHaveCount(0);
  await discoveryCard
    .getByRole("button", { name: "Request introduction" })
    .click();
  await discoveryCard
    .getByLabel("Why are you interested, and why are you a credible acquirer?")
    .fill(
      "We operate two Canadian software companies and have committed equity for this majority acquisition.",
    );
  await discoveryCard.getByRole("button", { name: "Send request" }).click();
  await expect(discoveryCard).toContainText("Pending");

  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(sellerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto(`/app/deals/${dealId}`);
  await page
    .getByRole("button", { name: "Introduction requests", exact: true })
    .click();
  const introductionWorkbench = page.getByRole("region", {
    name: "Introduction requests",
  });
  const introductionHeader = introductionWorkbench.locator(
    ".recommendation-header",
  );
  await expect(introductionHeader).toHaveCSS("display", "flex");
  await expect(introductionHeader).toHaveCSS("padding", "20px");
  const countRadius = await introductionHeader
    .locator(".recommendation-count")
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).borderRadius),
    );
  expect(countRadius).toBeGreaterThan(100);
  const requestCard = page.getByRole("article").filter({ hasText: buyerFirm });
  await expect(requestCard).toContainText(projectName);
  await expect(requestCard).toContainText(/\d+%/);
  await requestCard
    .getByRole("button", { name: "Approve introduction" })
    .click();
  await expect(requestCard).toContainText("Approved");

  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });
  await page.goto("/login");
  await page.getByLabel("Email address").fill(buyerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  const finalBuyerWorkspace = await (
    await page.request.get("/api/workspace")
  ).json();
  expect(
    finalBuyerWorkspace.access.find(
      (candidate: { deal_id: string }) => candidate.deal_id === dealId,
    )?.status,
  ).toBe("requested");
  expect(
    finalBuyerWorkspace.deals.find(
      (candidate: { id: string }) => candidate.id === dealId,
    ).company_name,
  ).toBe("Confidential company");
});

test("buyer sees approved documents but cannot download seller-only files", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Taylor." }),
  ).toBeVisible();
  const denied = await page.request.get("/api/documents/doc-cedar-internal");
  expect(denied.status()).toBe(404);
  const allowed = await page.request.get("/api/documents/doc-cedar-fin");
  expect(allowed.status()).toBe(200);
  expect(await allowed.text()).toContain("SAMPLE TRANSACTION DOCUMENT");
  await page.goto("/app/deals/harbour");
  await expect(
    page.getByText("Harbour Health Group Inc.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Your request is with the deal team.", { exact: false }),
  ).toBeVisible();
});

test("buyer receives a cached personalized CIM while the seller keeps the original", async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  const pdfPage = pdf.addPage([612, 792]);
  pdfPage.drawText("Confidential Project Cedar memorandum", {
    x: 72,
    y: 720,
    size: 18,
  });
  const original = Buffer.from(await pdf.save());
  const name = `Project Cedar CIM ${Date.now()}.pdf`;

  await page.goto("/login");
  await page.getByRole("button", { name: "Owner demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Jamie." }),
  ).toBeVisible();
  await page.goto("/app/deals/cedar");
  await page.getByRole("button", { name: "Data room" }).click();
  await page.getByText("Upload a document", { exact: true }).click();
  await page.getByLabel("Choose file").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: original,
  });
  await page
    .locator('select[name="category"]')
    .selectOption("Company overview");
  await page.locator('select[name="audience"]').selectOption("approved");
  await page
    .getByRole("checkbox", {
      name: "Personalize every buyer’s PDF download",
    })
    .check();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.body.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(
    page
      .getByRole("status")
      .getByText("Each buyer download will receive", { exact: false }),
  ).toBeVisible();

  const ownerWorkspace = await (
    await page.request.get("/api/workspace")
  ).json();
  const document = ownerWorkspace.documents.find(
    (candidate: { name: string }) => candidate.name === name,
  );
  expect(document?.watermark_enabled).toBe(true);
  const ownerDownload = await page.request.get(`/api/documents/${document.id}`);
  expect(ownerDownload.status()).toBe(200);
  expect(ownerDownload.headers()["x-succera-personalized-watermark"]).toBe(
    undefined,
  );
  expect(Buffer.from(await ownerDownload.body())).toEqual(original);

  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Taylor." }),
  ).toBeVisible();
  const buyerDownload = await page.request.get(`/api/documents/${document.id}`);
  expect(buyerDownload.status()).toBe(200);
  expect(buyerDownload.headers()["x-succera-personalized-watermark"]).toBe(
    "applied",
  );
  const personalized = Buffer.from(await buyerDownload.body());
  expect(personalized).not.toEqual(original);
  expect((await PDFDocument.load(personalized)).getPageCount()).toBe(1);

  const databasePath = path.resolve("test-results/app-data/northlane.sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const stored = database
      .prepare(
        "SELECT storage_key FROM documents WHERE id=? AND watermark_enabled=1",
      )
      .get(document.id) as { storage_key: string };
    expect(
      readFileSync(
        path.resolve("test-results/app-data/uploads", stored.storage_key),
      ),
    ).toEqual(original);
    expect(
      (
        database
          .prepare(
            "SELECT COUNT(*) count FROM document_watermark_variants WHERE document_id=? AND buyer_id='demo-buyer'",
          )
          .get(document.id) as { count: number }
      ).count,
    ).toBe(1);
  } finally {
    database.close();
  }
});

test("owner can send a provider-managed electronic NDA without granting early access", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Owner demo" }).click();
  await page.goto("/app/deals/harbour");
  await page.getByRole("button", { name: "Buyer access" }).click();
  const buyerCard = page.getByRole("article").filter({
    hasText: "Evergreen Capital",
  });
  await buyerCard.getByRole("button", { name: "Send electronic NDA" }).click();
  await expect(
    page.getByRole("status").getByText(/Electronic NDA sent through/),
  ).toBeVisible();
  await expect(buyerCard).toContainText("Awaiting buyer signature");
  await expect(buyerCard).toContainText("Development signature provider");
  await expect(buyerCard).toContainText(
    "Succera grants access only after the provider verifies completion",
  );
  await expect(buyerCard).toContainText("Nda pending");
  await expect(buyerCard).not.toContainText("Approved");
});

test("seller reviews and explicitly applies a private teaser safety suggestion", async ({
  page,
}) => {
  const headers = { Origin: "http://localhost:3000" };
  await page.goto("/login");
  await page.getByRole("button", { name: "Owner demo" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/deals/atlas");
  await page.getByRole("button", { name: "Teaser safety" }).click();
  await expect(
    page.getByRole("heading", { name: "Check what the teaser could reveal." }),
  ).toBeVisible();
  await expect(page.getByText("No safety review yet")).toBeVisible();
  await expect(
    page.getByText("Local development safety assistant", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Run safety review" }).click();
  await expect(
    page.getByRole("heading", { name: "Review recommended" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review every word before applying" }),
  ).toBeVisible();
  await expect(
    page.getByText("Financial scale in the teaser narrative"),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Apply to private teaser draft" })
    .click();
  await expect(page.getByText("Applied", { exact: true })).toBeVisible();
  const ownerWorkspace = await (
    await page.request.get("/api/workspace")
  ).json();
  const atlas = ownerWorkspace.deals.find(
    (deal: { id: string }) => deal.id === "atlas",
  );
  expect(atlas.published).toBe(0);
  expect(atlas.description).toContain(
    "annual revenue in the C$10M–C$20M range",
  );
  expect(ownerWorkspace.teaser_safety_reviews[0].applied_at).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Check what the teaser could reveal." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const projectedDealResponse = await page.request.post("/api/workspace", {
    headers,
    data: {
      action: "createDeal",
      data: {
        title: `Projected safety check ${Date.now()}`,
        company_name: "Projected Safety Check Inc.",
        sector: "Technology",
        province: "Ontario",
        city: "Toronto",
        revenue: 4_000_000,
        ebitda: 700_000,
        asking_price: 6_000_000,
        employees: 18,
        founded: 2016,
        description:
          "A Canadian technology business with approximately C$4 million in annual revenue.",
        confidential_summary: "Used to test historical financial coverage.",
        financial_year: 2027,
        financial_is_projected: true,
      },
    },
  });
  expect(projectedDealResponse.status()).toBe(200);
  const projectedDealId = (await projectedDealResponse.json()).id;
  const projectedOnlyReview = await page.request.post("/api/teaser-safety", {
    headers,
    data: { deal_id: projectedDealId },
  });
  expect(projectedOnlyReview.status()).toBe(200);
  expect(
    (await projectedOnlyReview.json()).review.missing_financials,
  ).toContain("Historical financial periods");
  expect(
    (
      await page.request.post("/api/workspace", {
        headers,
        data: {
          action: "upsertDealFinancial",
          data: {
            deal_id: projectedDealId,
            fiscal_year: 2026,
            period_type: "annual",
            revenue: 3_700_000,
            ebitda: 620_000,
            gross_profit: 1_900_000,
            is_projected: false,
          },
        },
      })
    ).status(),
  ).toBe(200);
  const historicalReview = await page.request.post("/api/teaser-safety", {
    headers,
    data: { deal_id: projectedDealId },
  });
  expect(historicalReview.status()).toBe(200);
  expect(
    (await historicalReview.json()).review.missing_financials,
  ).not.toContain("Historical financial periods");

  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(page).toHaveURL(/\/app$/);
  const unauthorized = await page.request.post("/api/teaser-safety", {
    headers,
    data: { deal_id: "atlas" },
  });
  const nonexistent = await page.request.post("/api/teaser-safety", {
    headers,
    data: { deal_id: "not-a-real-mandate" },
  });
  expect(unauthorized.status()).toBe(404);
  expect(nonexistent.status()).toBe(404);
  expect(await unauthorized.json()).toEqual(await nonexistent.json());
  const buyerWorkspace = await (
    await page.request.get("/api/workspace")
  ).json();
  expect(buyerWorkspace.teaser_safety_reviews).toBeUndefined();
});

test("buyer demo cannot enumerate registered Qualified Discovery inventory", async ({
  page,
}) => {
  const suffix = Date.now();
  const project = `Project Preview ${suffix}`;
  const headers = { Origin: "http://localhost:3000" };
  const registered = await page.request.post("/api/auth", {
    headers,
    data: {
      action: "register",
      name: "Preview Owner",
      company: "Preview Owner Inc.",
      email: `preview-owner-${suffix}@example.test`,
      password: "preview-password-2026",
      role: "owner",
    },
  });
  expect(registered.status()).toBe(200);
  const created = await page.request.post("/api/workspace", {
    headers,
    data: {
      action: "createDeal",
      data: {
        title: project,
        company_name: "Preview Owner Inc.",
        sector: "Manufacturing",
        province: "Ontario",
        city: "Toronto",
        revenue: 3000000,
        ebitda: 500000,
        asking_price: 4000000,
        employees: 20,
        founded: 2012,
        description:
          "A fictional Ontario manufacturer used to verify published buyer previews.",
        confidential_summary:
          "This must remain hidden from the shared demo buyer.",
      },
    },
  });
  expect(created.status()).toBe(200);
  const { id } = await created.json();
  expect(
    (
      await page.request.post("/api/workspace", {
        headers,
        data: {
          action: "updateDeal",
          data: {
            deal_id: id,
            stage: "On market",
            published: true,
            distribution_mode: "qualified_discovery",
          },
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post("/api/auth", {
        headers,
        data: { action: "logout" },
      })
    ).status(),
  ).toBe(200);

  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Taylor." }),
  ).toBeVisible();
  await page.goto("/app/opportunities");
  const card = page.getByRole("link", { name: new RegExp(project) });
  await expect(card).toHaveCount(0);
  await expect(
    page.getByText("Preview Owner Inc.", { exact: true }),
  ).toHaveCount(0);
});

test("buyer projects do not expose private matching records", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Taylor." }),
  ).toBeVisible();
  await page.goto("/app/projects");
  await expect(
    page.getByRole("heading", { name: "Acquisition projects" }),
  ).toBeVisible();
  await expect(
    page.getByRole("article").filter({ hasText: "Project Maple" }),
  ).toContainText("Project Maple");
  await expect(
    page.getByRole("article").filter({ hasText: "Project Northern Lights" }),
  ).toContainText("Project Northern Lights");
  await expect(page.getByText(/criteria fit|match score/i)).toHaveCount(0);
  await expect(page.getByText(/match results remain private/i)).toBeVisible();
  const workspaceResponse = await page.request.get("/api/workspace");
  const workspaceData = await workspaceResponse.json();
  expect(workspaceData).not.toHaveProperty("deal_matches");
});

test("registered buyer can create, edit, and manage an acquisition project", async ({
  page,
}) => {
  const suffix = Date.now();
  const project = `Project Healthcare ${suffix}`;
  const headers = { Origin: "http://localhost:3000" };
  const registered = await page.request.post("/api/auth", {
    headers,
    data: {
      action: "register",
      name: "Jordan Lee",
      company: `Healthcare Search Partners ${suffix}`,
      email: `healthcare-buyer-${suffix}@example.test`,
      password: "healthcare-project-password-2026",
      role: "buyer",
    },
  });
  expect(registered.status()).toBe(200);

  await page.goto("/app/projects");
  await page.getByRole("link", { name: "New project" }).click();
  await page.getByLabel("Project name").fill(project);
  await page
    .locator('textarea[name="thesis"]')
    .fill(
      "Acquire established Canadian healthcare services businesses with recurring contracts.",
    );
  await page
    .getByLabel("Preferred sectors")
    .selectOption(["Healthcare", "Business services"]);
  await page
    .getByLabel("Preferred provinces or territories")
    .selectOption(["Ontario", "Alberta"]);
  await page
    .getByLabel("Keywords")
    .fill("healthcare, recurring contracts, healthcare");
  await page.getByLabel("Minimum annual revenue (CAD)").fill("1000000");
  await page.getByLabel("Maximum annual revenue (CAD)").fill("8000000");
  await page.getByRole("button", { name: "Create project" }).click();

  const card = page.getByRole("article").filter({ hasText: project });
  await expect(card).toContainText("Draft");
  await expect(card).toContainText("Business services, Healthcare");
  await expect(card).toContainText("Ontario, Alberta");
  await expect(card).toContainText("healthcare, recurring contracts");
  await card.getByRole("button", { name: "Activate project" }).click();
  await expect(card).toContainText("Active");
  await card.getByText("Edit project", { exact: true }).click();
  await card
    .getByLabel("Keywords")
    .fill("healthcare, contracted revenue, healthcare");
  await card.getByRole("button", { name: "Save project" }).click();
  await expect(card).toContainText("healthcare, contracted revenue");
  await card.getByRole("button", { name: "Pause project" }).click();
  await expect(card).toContainText("Paused");
  await card.getByRole("button", { name: "Archive project" }).click();
  await expect(card).toContainText("Archived");
});

test("non-buyer organizations receive the acquisition project access state", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Owner demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Jamie." }),
  ).toBeVisible();
  await page.goto("/app/projects");
  await expect(page.getByText("Buyer organization required")).toBeVisible();
  await expect(page.getByRole("link", { name: "New project" })).toHaveCount(0);
});

test("mobile acquisition projects route has no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("button", { name: "Buyer demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Taylor." }),
  ).toBeVisible();
  await page.goto("/app/projects");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a registered account receives an editable firm profile and team membership", async ({
  page,
}) => {
  const suffix = Date.now();
  const firm = `North Star Holdings ${suffix}`;
  const renamedFirm = `North Star Partners ${suffix}`;
  const headers = { Origin: "http://localhost:3000" };
  const registered = await page.request.post("/api/auth", {
    headers,
    data: {
      action: "register",
      name: "Morgan Chen",
      company: firm,
      email: `morgan-${suffix}@example.test`,
      password: "organization-password-2026",
      role: "buyer",
    },
  });
  expect(registered.status()).toBe(200);

  await page.goto("/app/settings");
  await expect(
    page.getByRole("heading", { name: "Firm profile" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team · 1" })).toBeVisible();
  await expect(
    page.getByText("Morgan Chen · You", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Buyer", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Owner", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Organization name").fill(renamedFirm);
  await page.getByLabel("Organization type").selectOption("search_fund");
  await page.getByLabel("Head office province").selectOption("Ontario");
  await page
    .getByLabel("Firm description")
    .fill(
      "A Canadian acquisition firm focused on established small businesses.",
    );
  await page.getByRole("button", { name: "Save firm profile" }).click();
  await expect(
    page.getByRole("status").getByText("Firm settings saved."),
  ).toBeVisible();
  await expect(
    page.getByText(renamedFirm, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Search fund", { exact: true }).first(),
  ).toBeVisible();
});

test("buyer submits a verification profile and an internal reviewer records the decision", async ({
  page,
}) => {
  const suffix = Date.now();
  const firm = `Verification Capital ${suffix}`;
  const headers = { Origin: "http://localhost:3000" };
  expect(
    (
      await page.request.post("/api/auth", {
        headers,
        data: {
          action: "register",
          name: "Casey Morgan",
          company: firm,
          email: `verification-buyer-${suffix}@example.test`,
          password: "verification-password-2026",
          role: "buyer",
        },
      })
    ).status(),
  ).toBe(200);

  await page.goto("/app/verification");
  await expect(
    page.getByRole("heading", { name: "Build buyer credibility." }),
  ).toBeVisible();
  await expect(
    page.getByText("Unverified", { exact: true }).first(),
  ).toBeVisible();
  await page.getByLabel("Legal firm name").fill(`${firm} Inc.`);
  await page
    .getByLabel("Website")
    .fill(`https://verification-${suffix}.example.test`);
  await page.getByLabel("Buyer type").selectOption("private_equity");
  await page.getByLabel("Principals").fill("Casey Morgan, Managing Partner");
  await page
    .getByLabel("Acquisition history")
    .fill(
      "Two Canadian business-services acquisitions with operating oversight.",
    );
  await page
    .getByLabel("Capital source")
    .fill("Committed private investment capital from a closed fund.");
  await page.getByLabel("Typical minimum equity cheque (CAD)").fill("2000000");
  await page.getByLabel("Typical maximum equity cheque (CAD)").fill("15000000");
  await page
    .getByLabel("Financing approach")
    .fill("Equity capital supported by senior acquisition financing.");
  await page.getByRole("button", { name: "Save verification profile" }).click();
  await expect(
    page.getByRole("status").getByText("Verification profile saved."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit for internal review" })
    .click();
  await expect(page.getByText("Internal review in progress")).toBeVisible();

  await page.request.post("/api/auth", {
    headers,
    data: { action: "logout" },
  });
  const reviewerEmail = `verification-reviewer-${suffix}@example.test`;
  expect(
    (
      await page.request.post("/api/auth", {
        headers,
        data: {
          action: "register",
          name: "Verification Operations Reviewer",
          company: `Platform Operations ${suffix}`,
          email: reviewerEmail,
          password: "verification-password-2026",
          role: "advisor",
        },
      })
    ).status(),
  ).toBe(200);
  provisionPlatformReviewer(reviewerEmail);
  await page.goto("/app/verification");
  await expect(
    page.getByRole("heading", { name: "Review buyer credibility." }),
  ).toBeVisible();
  const review = page.getByRole("article").filter({ hasText: firm });
  await expect(review).toContainText(`${firm} Inc.`);
  await review.getByLabel("Decision").selectOption("firm_verified");
  await review
    .getByLabel("Internal review notes")
    .fill("Firm identity and public operating website reviewed.");
  await review
    .getByRole("button", { name: "Record verification decision" })
    .click();
  await expect(
    page.getByText("Buyer verification decision recorded."),
  ).toBeVisible();
  await expect(
    page.locator(".verification-history").getByRole("article").filter({
      hasText: firm,
    }),
  ).toContainText("Firm verified");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("unauthenticated downloads and foreign-origin mutations are rejected", async ({
  request,
}) => {
  expect((await request.get("/api/documents/doc-cedar-fin")).status()).toBe(
    401,
  );
  const response = await request.post("/api/auth", {
    headers: { Origin: "https://untrusted.example" },
    data: { action: "demo", role: "advisor" },
  });
  expect(response.status()).toBe(403);
});

test("mobile public page has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("link", { name: "Find your next chapter" }),
  ).toBeVisible();
});
