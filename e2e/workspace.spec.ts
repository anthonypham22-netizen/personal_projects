import { test, expect } from "@playwright/test";

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
  const recommendation = page
    .getByRole("article")
    .filter({ hasText: "Project Maple" });
  await expect(recommendation).toContainText("Evergreen Capital");
  await expect(recommendation).toContainText(/\d+% match/);
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
  const buyerWorkspace = await (
    await page.request.get("/api/workspace")
  ).json();
  expect(
    buyerWorkspace.access.find(
      (candidate: { deal_id: string }) => candidate.deal_id === dealId,
    )?.status,
  ).toBe("requested");
  expect(
    buyerWorkspace.deals.find(
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
