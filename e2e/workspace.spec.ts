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

test("buyer demo previews a published owner listing without confidential actions", async ({
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
          data: { deal_id: id, stage: "On market", published: true },
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
  await expect(card).toContainText("Preview only");
  await card.click();
  await expect(
    page.getByText("This shared preview account can view published teasers", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request confidential access" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Preview Owner Inc.", { exact: true }),
  ).toHaveCount(0);
});

test("buyer demo sees acquisition projects without a matching claim", async ({
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
  await expect(page.getByText(/matching will be introduced/i)).toBeVisible();
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
