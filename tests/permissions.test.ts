import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, one, run } from "../src/lib/db";
import {
  workspace,
  mutate,
  getDeal,
  canReadDocument,
  createSession,
  sessionUser,
  register,
  login,
  isManager,
  dealMatchesForUser,
} from "../src/lib/service";
import type { User, Document } from "../src/lib/types";

let directory: string;
let buyer: User, otherBuyer: User, owner: User, advisor: User;
before(() => {
  directory = mkdtempSync(path.join(tmpdir(), "northlane-permissions-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  process.env.ALLOW_REGISTRATION = "true";
  db();
  buyer = one<User>("SELECT * FROM users WHERE id='demo-buyer'")!;
  otherBuyer = one<User>("SELECT * FROM users WHERE id='demo-buyer-2'")!;
  owner = one<User>("SELECT * FROM users WHERE id='demo-owner'")!;
  advisor = one<User>("SELECT * FROM users WHERE id='demo-advisor'")!;
});
after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});

test("buyers receive redacted teasers before confidential approval", () => {
  const state = workspace(buyer);
  const harbour = state.deals.find((d) => d.id === "harbour")!;
  assert.equal(harbour.company_name, "Confidential company");
  assert.equal(harbour.confidential_summary, "");
  assert.equal(harbour.city, "");
  assert.equal(harbour.has_access, false);
  assert.equal(
    state.deals.some((d) => d.id === "atlas"),
    false,
  );
  assert.equal(
    state.deals.find((d) => d.id === "cedar")?.company_name,
    "Cedar Industrial Services Ltd.",
  );
});

test("distribution strategy controls discovery and redacts seller identity", () => {
  const result = mutate(owner, {
    action: "createDeal",
    data: {
      title: "Project Distribution",
      company_name: "Distribution Test Company",
      sector: "Manufacturing",
      province: "Ontario",
      city: "Toronto",
      revenue: 7_500_000,
      ebitda: 1_250_000,
      asking_price: 10_000_000,
      employees: 32,
      founded: 2008,
      description:
        "A fictional Ontario manufacturer used to verify private distribution controls.",
      confidential_summary: "Confidential seller information.",
      transaction_type: "majority_acquisition",
      ownership_percentage_available: 80,
      seller_rollover_possible: true,
      seller_financing_possible: false,
      management_transition: "Founder available for a twelve-month transition.",
      reason_for_transaction: "Planned founder succession.",
      min_expected_value: 9_000_000,
      max_expected_value: 11_000_000,
      distribution_mode: "private_outreach",
      financial_year: 2025,
      gross_profit: 3_100_000,
      financial_is_projected: false,
    },
  });
  const dealId = result.id!;

  mutate(owner, {
    action: "updateDeal",
    data: {
      deal_id: dealId,
      stage: "On market",
      published: true,
      distribution_mode: "private_outreach",
    },
  });
  assert.equal(
    workspace(buyer).deals.some((deal) => deal.id === dealId),
    false,
    "private outreach must not enter buyer discovery",
  );

  mutate(owner, {
    action: "updateDeal",
    data: {
      deal_id: dealId,
      stage: "On market",
      published: true,
      distribution_mode: "qualified_discovery",
    },
  });
  const discovery = workspace(buyer).deals.find((deal) => deal.id === dealId)!;
  assert.ok(discovery);
  assert.equal(discovery.company_name, "Confidential company");
  assert.equal(discovery.owner_id, "");
  assert.equal(discovery.advisor_id, null);
  assert.equal(discovery.owner_organization_id, null);
  assert.equal(discovery.advisor_organization_id, null);
  assert.equal(discovery.created_by_user_id, null);
  assert.equal(discovery.confidential_summary, "");
  assert.equal(discovery.city, "");
  assert.equal(discovery.management_transition, "");
  assert.equal(discovery.reason_for_transaction, "");
  assert.equal(
    workspace(buyer).deal_financials.some(
      (financial) =>
        financial.deal_id === dealId && financial.fiscal_year === 2025,
    ),
    false,
    "detailed financial history remains gated until NDA approval",
  );
});

test("deal teams can maintain transaction objectives and historical financials", () => {
  const result = mutate(owner, {
    action: "createDeal",
    data: {
      title: "Project Financial History",
      company_name: "Financial History Company",
      sector: "Business services",
      province: "Alberta",
      city: "Calgary",
      revenue: 6_000_000,
      ebitda: 900_000,
      asking_price: 7_500_000,
      employees: 24,
      founded: 2012,
      description:
        "A fictional services company used to verify structured mandate financials.",
      confidential_summary: "Confidential operating information.",
      financial_year: 2025,
    },
  });
  const dealId = result.id!;

  mutate(owner, {
    action: "updateDealDetails",
    data: {
      deal_id: dealId,
      transaction_type: "recapitalization",
      ownership_percentage_available: 65,
      seller_rollover_possible: true,
      seller_financing_possible: true,
      management_transition: "Management will remain after closing.",
      reason_for_transaction: "Growth capital and shareholder liquidity.",
      min_expected_value: 7_000_000,
      max_expected_value: 9_000_000,
    },
  });
  const updated = getDeal(dealId);
  assert.equal(updated.transaction_type, "recapitalization");
  assert.equal(updated.ownership_percentage_available, 65);
  assert.equal(updated.seller_rollover_possible, 1);
  assert.equal(updated.seller_financing_possible, 1);
  assert.equal(updated.min_expected_value, 7_000_000);
  assert.equal(updated.max_expected_value, 9_000_000);

  const financialResult = mutate(owner, {
    action: "upsertDealFinancial",
    data: {
      deal_id: dealId,
      fiscal_year: 2024,
      period_type: "annual",
      revenue: 5_400_000,
      ebitda: 760_000,
      gross_profit: 2_100_000,
      is_projected: false,
    },
  });
  const financial = workspace(owner).deal_financials.find(
    (row) => row.id === financialResult.id,
  )!;
  assert.equal(financial.revenue, 5_400_000);
  assert.equal(financial.gross_profit, 2_100_000);
  assert.throws(
    () =>
      mutate(buyer, {
        action: "upsertDealFinancial",
        data: {
          deal_id: dealId,
          fiscal_year: 2024,
          period_type: "annual",
          revenue: 1,
          ebitda: 1,
          gross_profit: 1,
          is_projected: false,
        },
      }),
    /Only an authorized deal-team member/,
  );

  mutate(owner, {
    action: "deleteDealFinancial",
    data: { deal_id: dealId, financial_id: financial.id },
  });
  assert.equal(
    workspace(owner).deal_financials.some((row) => row.id === financial.id),
    false,
  );
});

test("document authorization separates buyers and seller-only records", () => {
  const deal = getDeal("cedar");
  const financial = one<Document>(
    "SELECT * FROM documents WHERE id='doc-cedar-fin'",
  )!;
  const internal = one<Document>(
    "SELECT * FROM documents WHERE id='doc-cedar-internal'",
  )!;
  const nda = one<Document>(
    "SELECT * FROM documents WHERE id='doc-cedar-nda'",
  )!;
  assert.equal(canReadDocument(buyer, deal, financial), true);
  assert.equal(canReadDocument(otherBuyer, deal, financial), false);
  assert.equal(canReadDocument(buyer, deal, internal), false);
  assert.equal(canReadDocument(otherBuyer, deal, nda), false);
  assert.equal(canReadDocument(advisor, deal, internal), true);
  assert.equal(
    workspace(buyer).documents.some((d) => d.id === internal.id),
    false,
  );
});

test("a buyer cannot publish a deal or approve their own access", () => {
  assert.throws(
    () =>
      mutate(buyer, {
        action: "updateDeal",
        data: { deal_id: "harbour", stage: "Closed", published: true },
      }),
    /Only/,
  );
  assert.throws(
    () =>
      mutate(buyer, {
        action: "reviewAccess",
        data: { deal_id: "harbour", buyer_id: buyer.id, status: "approved" },
      }),
    /Only/,
  );
});

test("approval requires a buyer-specific NDA and an explicit human review", () => {
  assert.throws(
    () =>
      mutate(advisor, {
        action: "reviewAccess",
        data: {
          deal_id: "cedar",
          buyer_id: otherBuyer.id,
          status: "approved",
          nda_document_id: "doc-cedar-nda",
          confirm_reviewed: true,
        },
      }),
    /this buyer/,
  );
  assert.throws(
    () =>
      mutate(advisor, {
        action: "reviewAccess",
        data: {
          deal_id: "cedar",
          buyer_id: buyer.id,
          status: "approved",
          nda_document_id: "doc-cedar-nda",
          confirm_reviewed: "true",
        },
      }),
    /Confirm/,
  );
});

test("buyer conversations, offers and internal tasks do not cross parties", () => {
  const state = workspace(otherBuyer);
  assert.equal(
    state.messages.some((m) => m.buyer_id === buyer.id),
    false,
  );
  assert.equal(state.offers.length, 0);
  assert.equal(
    state.tasks.some((t) => t.buyer_id !== otherBuyer.id),
    false,
  );
  assert.throws(
    () =>
      mutate(otherBuyer, {
        action: "message",
        data: { deal_id: "cedar", buyer_id: buyer.id, body: "Unauthorized" },
      }),
    /cannot access/,
  );
  assert.throws(
    () =>
      mutate(buyer, {
        action: "toggleTask",
        data: { deal_id: "summit", task_id: "task-3" },
      }),
    /not available/,
  );
});

test("revocation immediately removes confidential data and document access", () => {
  mutate(advisor, {
    action: "reviewAccess",
    data: { deal_id: "cedar", buyer_id: buyer.id, status: "revoked" },
  });
  assert.equal(
    workspace(buyer).deals.find((d) => d.id === "cedar")?.has_access,
    false,
  );
  assert.equal(
    workspace(buyer).documents.some((d) => d.deal_id === "cedar"),
    false,
  );
  assert.throws(
    () =>
      mutate(buyer, {
        action: "message",
        data: {
          deal_id: "cedar",
          buyer_id: buyer.id,
          body: "No longer allowed",
        },
      }),
    /cannot access/,
  );
  mutate(advisor, {
    action: "reviewAccess",
    data: {
      deal_id: "cedar",
      buyer_id: buyer.id,
      status: "approved",
      nda_document_id: "doc-cedar-nda",
      confirm_reviewed: true,
    },
  });
});

test("a linked owner and appointed advisor share the same mandate", () => {
  const result = mutate(advisor, {
    action: "createDeal",
    data: {
      title: "Project Test",
      company_name: "Test Company",
      sector: "Manufacturing",
      province: "Ontario",
      city: "Ottawa",
      revenue: 2000000,
      ebitda: 300000,
      asking_price: 1800000,
      employees: 12,
      founded: 2010,
      description: "A fictional business created for a permission test.",
      confidential_summary: "Confidential test description",
    },
  });
  const dealId = result.id!;
  mutate(advisor, {
    action: "connectOwner",
    data: { deal_id: dealId, email: owner.email, confirm_authority: true },
  });
  assert.equal(getDeal(dealId).owner_id, owner.id);
  assert.equal(
    workspace(owner).deals.find((d) => d.id === dealId)?.can_manage,
    true,
  );
  assert.equal(
    workspace(advisor).deals.find((d) => d.id === dealId)?.can_manage,
    true,
  );
  assert.equal(
    workspace(buyer).deals.some((d) => d.id === dealId),
    false,
  );
});

test("organization membership shares firm deals without crossing firm boundaries", () => {
  const ownerToken = register({
    name: "Firm Owner",
    company: "Shared Firm Inc.",
    email: "firm-owner@example.test",
    role: "owner",
    password: "firm-password-2026",
  });
  const firmOwner = sessionUser(ownerToken)!;
  const memberToken = register({
    name: "Firm Member",
    company: "Temporary Member Firm",
    email: "firm-member@example.test",
    role: "owner",
    password: "firm-password-2026",
  });
  const firmMember = sessionUser(memberToken)!;
  const viewerToken = register({
    name: "Firm Viewer",
    company: "Temporary Viewer Firm",
    email: "firm-viewer@example.test",
    role: "owner",
    password: "firm-password-2026",
  });
  const firmViewer = sessionUser(viewerToken)!;
  const outsiderToken = register({
    name: "Other Firm",
    company: "Other Firm Inc.",
    email: "other-firm@example.test",
    role: "owner",
    password: "firm-password-2026",
  });
  const outsider = sessionUser(outsiderToken)!;
  const organization = one<{ id: string }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    firmOwner.id,
  )!;
  for (const [user, role] of [
    [firmMember, "member"],
    [firmViewer, "viewer"],
  ] as const) {
    const ownOrganization = one<{ id: string }>(
      "SELECT organization_id id FROM organization_members WHERE user_id=?",
      user.id,
    )!;
    run("DELETE FROM organization_members WHERE user_id=?", user.id);
    run("DELETE FROM organizations WHERE id=?", ownOrganization.id);
    run(
      "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,?,?)",
      `membership-${user.id}`,
      organization.id,
      user.id,
      role,
      "active",
    );
  }
  const created = mutate(firmOwner, {
    action: "createDeal",
    data: {
      title: "Project Shared Firm",
      company_name: "Shared Firm Inc.",
      sector: "Business services",
      province: "Ontario",
      city: "Toronto",
      revenue: 2500000,
      ebitda: 450000,
      asking_price: 3200000,
      employees: 14,
      founded: 2014,
      description:
        "A fictional shared-firm mandate used to verify organization authorization boundaries.",
      confidential_summary:
        "Only active members of the seller organization may see this summary.",
    },
  });
  const dealId = created.id!;

  assert.equal(
    workspace(firmMember).deals.find((deal) => deal.id === dealId)?.can_manage,
    true,
  );
  assert.equal(
    workspace(firmViewer).deals.find((deal) => deal.id === dealId)?.has_access,
    true,
  );
  assert.equal(
    workspace(firmViewer).deals.find((deal) => deal.id === dealId)?.can_manage,
    false,
  );
  assert.equal(
    workspace(outsider).deals.some((deal) => deal.id === dealId),
    false,
  );
  assert.throws(
    () =>
      mutate(firmViewer, {
        action: "updateDeal",
        data: { deal_id: dealId, stage: "On market", published: true },
      }),
    /Only/,
  );
  assert.throws(
    () =>
      mutate(firmViewer, {
        action: "createDeal",
        data: {
          title: "Project Viewer",
          company_name: "Shared Firm Inc.",
          sector: "Business services",
          province: "Ontario",
          city: "Toronto",
          revenue: 2500000,
          ebitda: 450000,
          asking_price: 3200000,
          employees: 14,
          founded: 2014,
          description:
            "A read-only member must not be able to create this private mandate.",
          confidential_summary: "This record must never be created.",
        },
      }),
    /Read-only organization members/,
  );

  assert.throws(
    () =>
      mutate(firmMember, {
        action: "organization",
        data: {
          name: "Unauthorized Rename",
          organization_type: "business",
          website: "",
          province: "Ontario",
          description: "",
        },
      }),
    /organization owners and administrators/,
  );
  mutate(firmOwner, {
    action: "organization",
    data: {
      name: "Shared Firm Partners",
      organization_type: "business",
      website: "https://shared.example.test",
      province: "Ontario",
      description: "A fictional multi-user Canadian firm.",
    },
  });
  assert.equal(workspace(firmMember).organization.name, "Shared Firm Partners");
  assert.equal(
    one<{ company: string }>(
      "SELECT company FROM users WHERE id=?",
      firmMember.id,
    )?.company,
    "Shared Firm Partners",
  );
  assert.deepEqual(
    workspace(firmOwner)
      .organization_members.map((member) => member.role)
      .sort(),
    ["member", "owner", "viewer"],
  );
  assert.equal(typeof workspace(firmOwner).organization.can_manage, "boolean");

  run(
    "UPDATE organization_members SET role='admin' WHERE user_id=? AND organization_id=?",
    firmMember.id,
    organization.id,
  );
  mutate(firmMember, {
    action: "organization",
    data: {
      name: "Shared Firm Admin Edit",
      organization_type: "business",
      website: "https://shared.example.test",
      province: "Ontario",
      description: "An administrator-updated multi-user Canadian firm.",
    },
  });
  assert.equal(
    workspace(firmOwner).organization.name,
    "Shared Firm Admin Edit",
  );
  run(
    "UPDATE organization_members SET role='member' WHERE user_id=? AND organization_id=?",
    firmMember.id,
    organization.id,
  );
  mutate(firmOwner, {
    action: "profile",
    data: {
      name: firmOwner.name,
      company: "Shared Firm Legacy Rename",
      province: "",
      bio: "",
      sectors: "",
      min_revenue: 1_000_000,
      max_revenue: 20_000_000,
    },
  });
  assert.equal(
    workspace(firmMember).organization.name,
    "Shared Firm Legacy Rename",
  );
  assert.throws(
    () =>
      mutate(firmMember, {
        action: "profile",
        data: {
          name: firmMember.name,
          company: "Unauthorized Legacy Rename",
          province: "",
          bio: "",
          sectors: "",
          min_revenue: 1_000_000,
          max_revenue: 20_000_000,
        },
      }),
    /organization owners and administrators/,
  );

  run(
    "UPDATE organization_members SET role='viewer' WHERE user_id=? AND organization_id=?",
    firmOwner.id,
    organization.id,
  );
  assert.equal(
    workspace(firmOwner).deals.find((deal) => deal.id === dealId)?.can_manage,
    false,
  );
  assert.throws(
    () =>
      mutate(firmOwner, {
        action: "updateDeal",
        data: { deal_id: dealId, stage: "On market", published: true },
      }),
    /authorized deal-team member/,
  );
});

test("advisor firm members inherit only the permissions granted by their firm role", () => {
  const advisorToken = register({
    name: "Advisor Firm Admin",
    company: "Advisor Firm Inc.",
    email: "advisor-firm-admin@example.test",
    role: "advisor",
    password: "advisor-password-2026",
  });
  const advisorAdmin = sessionUser(advisorToken)!;
  const viewerToken = register({
    name: "Advisor Firm Viewer",
    company: "Temporary Advisor Firm",
    email: "advisor-firm-viewer@example.test",
    role: "advisor",
    password: "advisor-password-2026",
  });
  const advisorViewer = sessionUser(viewerToken)!;
  const ownerToken = register({
    name: "Advisor Test Owner",
    company: "Advisor Test Owner Inc.",
    email: "advisor-test-owner@example.test",
    role: "owner",
    password: "advisor-password-2026",
  });
  const testOwner = sessionUser(ownerToken)!;
  const advisorOrganization = one<{ id: string }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    advisorAdmin.id,
  )!;
  const viewerOrganization = one<{ id: string }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    advisorViewer.id,
  )!;
  run("DELETE FROM organization_members WHERE user_id=?", advisorViewer.id);
  run("DELETE FROM organizations WHERE id=?", viewerOrganization.id);
  run(
    "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'viewer','active')",
    `membership-${advisorViewer.id}`,
    advisorOrganization.id,
    advisorViewer.id,
  );
  run(
    "UPDATE organization_members SET role='admin' WHERE user_id=? AND organization_id=?",
    advisorAdmin.id,
    advisorOrganization.id,
  );

  const created = mutate(testOwner, {
    action: "createDeal",
    data: {
      title: "Project Advisor Firm",
      company_name: "Advisor Test Owner Inc.",
      sector: "Business services",
      province: "Ontario",
      city: "Toronto",
      revenue: 3_000_000,
      ebitda: 500_000,
      asking_price: 4_000_000,
      employees: 18,
      founded: 2011,
      description:
        "A private mandate used to verify permissions across an advisor organization.",
      confidential_summary: "Advisor firm authorization test.",
    },
  });
  mutate(testOwner, {
    action: "appointAdvisor",
    data: { deal_id: created.id, advisor_id: advisorAdmin.id },
  });

  const deal = getDeal(created.id!);
  assert.equal(isManager(advisorAdmin, deal), true);
  assert.equal(isManager(advisorViewer, deal), false);
  assert.equal(
    workspace(advisorViewer).deals.find((item) => item.id === deal.id)
      ?.has_access,
    true,
  );
  assert.throws(
    () =>
      mutate(advisorViewer, {
        action: "updateDeal",
        data: {
          deal_id: deal.id,
          stage: "On market",
          published: true,
        },
      }),
    /authorized deal-team member/,
  );
});

test("real accounts cannot discover or mutate demonstration deals", () => {
  const token = register({
    name: "Real Buyer",
    company: "Real Account Inc.",
    email: "real@example.test",
    role: "buyer",
    password: "  exact-password-2026  ",
  });
  const user = sessionUser(token)!;
  assert.equal(workspace(user).deals.length, 0);
  assert.throws(
    () => mutate(user, { action: "requestAccess", data: { deal_id: "maple" } }),
    /not available/,
  );
  assert.ok(
    login({ email: "real@example.test", password: "  exact-password-2026  " }),
  );
  assert.throws(
    () =>
      login({ email: "real@example.test", password: "exact-password-2026" }),
    /incorrect/,
  );
});

test("demo buyers can preview a published real teaser without crossing the confidential boundary", () => {
  const token = register({
    name: "Preview Owner",
    company: "Preview Owner Inc.",
    email: "preview-owner@example.test",
    role: "owner",
    password: "preview-password-2026",
  });
  const realOwner = sessionUser(token)!;
  const advisorToken = register({
    name: "Preview Advisor",
    company: "Preview Advisory Inc.",
    email: "preview-advisor@example.test",
    role: "advisor",
    password: "preview-password-2026",
  });
  const realAdvisor = sessionUser(advisorToken)!;
  const created = mutate(realOwner, {
    action: "createDeal",
    data: {
      title: "Project Preview",
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
  });
  const dealId = created.id!;
  mutate(realOwner, {
    action: "appointAdvisor",
    data: { deal_id: dealId, advisor_id: realAdvisor.id },
  });
  assert.equal(
    workspace(buyer).deals.some((deal) => deal.id === dealId),
    false,
    "an unpublished real listing must remain hidden from the demo buyer",
  );
  mutate(realOwner, {
    action: "updateDeal",
    data: {
      deal_id: dealId,
      stage: "On market",
      published: true,
      distribution_mode: "qualified_discovery",
    },
  });

  run(
    "INSERT INTO access(id,deal_id,buyer_id,status) VALUES(?,?,?,'approved')",
    "cross-realm-preview",
    dealId,
    buyer.id,
  );
  run(
    "INSERT INTO documents(id,deal_id,name,storage_key,mime,category,size,audience,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?)",
    "cross-realm-doc",
    dealId,
    "Imported financials.txt",
    "cross-realm-doc.txt",
    "text/plain",
    "Financials",
    20,
    "approved",
    realOwner.id,
  );
  run(
    "INSERT INTO messages(id,deal_id,buyer_id,sender_id,body) VALUES(?,?,?,?,?)",
    "cross-realm-message",
    dealId,
    buyer.id,
    realOwner.id,
    "This imported conversation must remain hidden.",
  );
  run(
    "INSERT INTO tasks(id,deal_id,title,due_date,buyer_id,created_by) VALUES(?,?,?,?,?,?)",
    "cross-realm-task",
    dealId,
    "Imported diligence task",
    "2026-12-31",
    buyer.id,
    realOwner.id,
  );
  run(
    "INSERT INTO offers(id,deal_id,buyer_id,amount,structure,notes,document_id) VALUES(?,?,?,?,?,?,?)",
    "cross-realm-offer",
    dealId,
    buyer.id,
    3500000,
    "Asset purchase",
    "Imported offer",
    "cross-realm-doc",
  );
  run(
    "INSERT INTO activity(id,deal_id,actor_id,action) VALUES(?,?,?,?)",
    "cross-realm-activity",
    dealId,
    buyer.id,
    "Imported activity",
  );

  const state = workspace(buyer);
  const preview = state.deals.find((deal) => deal.id === dealId);
  assert.ok(
    preview,
    "the published real teaser should appear for the demo buyer",
  );
  assert.equal(preview.preview_only, true);
  assert.equal(preview.has_access, false);
  assert.equal(preview.access_status, "none");
  assert.equal(preview.company_name, "Confidential company");
  assert.equal(preview.city, "");
  assert.equal(preview.employees, 0);
  assert.equal(preview.founded, 0);
  assert.equal(preview.confidential_summary, "");
  assert.equal(preview.owner_id, "");
  assert.equal(preview.advisor_id, null);
  assert.equal(
    state.advisors.some((advisor) => advisor.id === realAdvisor.id),
    true,
    "the advisor directory can remain available without linking it to this preview",
  );
  assert.equal(
    state.access.some((access) => access.deal_id === dealId),
    false,
  );
  assert.equal(
    state.documents.some((document) => document.deal_id === dealId),
    false,
  );
  assert.equal(
    state.messages.some((message) => message.deal_id === dealId),
    false,
  );
  assert.equal(
    state.tasks.some((task) => task.deal_id === dealId),
    false,
  );
  assert.equal(
    state.offers.some((offer) => offer.deal_id === dealId),
    false,
  );
  assert.equal(
    state.activity.some((activity) => activity.deal_id === dealId),
    false,
  );
  assert.throws(
    () =>
      mutate(buyer, {
        action: "requestAccess",
        data: {
          deal_id: dealId,
          notes: "Shared demo accounts stay read-only.",
        },
      }),
    /not available/,
  );
});

test("disabled demo mode invalidates existing demo sessions", () => {
  const token = createSession(buyer.id);
  assert.equal(sessionUser(token)?.id, buyer.id);
  process.env.ALLOW_DEMO = "false";
  assert.equal(sessionUser(token), undefined);
  process.env.ALLOW_DEMO = "true";
});

test("expired sessions are rejected", () => {
  const token = createSession(owner.id);
  run("UPDATE sessions SET expires_at=0 WHERE user_id=?", owner.id);
  assert.equal(sessionUser(token), undefined);
});

test("buyer projects are normalized and scoped to eligible organization members", () => {
  const ownerToken = register({
    name: "Project Owner",
    company: "Project Equity Co.",
    email: "project-owner@example.test",
    role: "buyer",
    password: "project-password-2026",
  });
  const projectOwner = sessionUser(ownerToken)!;
  const ownerOrganization = one<{ id: string }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    projectOwner.id,
  )!;
  const created = mutate(projectOwner, {
    action: "createBuyerProject",
    data: {
      name: "Project Atlas",
      thesis: "Acquire durable Canadian vertical software businesses.",
      min_revenue: "5000000",
      max_revenue: 20_000_000,
      min_ebitda: "",
      max_ebitda: "2000000",
      min_ebitda_margin: "10.5",
      max_ebitda_margin: 35,
      min_enterprise_value: "",
      max_enterprise_value: 80_000_000,
      min_equity_check: 5_000_000,
      max_equity_check: "30000000",
      ownership_preference: "majority",
      transaction_type: "majority_acquisition",
      sectors: ["Technology", "Technology"],
      provinces: ["Ontario", "Québec"],
      keywords: [" SaaS ", "saas", "Recurring Revenue"],
    },
  });
  assert.ok(created.id);

  const project = workspace(projectOwner).buyer_projects.find(
    (item) => item.id === created.id,
  )!;
  assert.deepEqual(project.sectors, ["Technology"]);
  assert.deepEqual(project.provinces, ["Ontario", "Québec"]);
  assert.deepEqual(project.keywords, ["SaaS", "Recurring Revenue"]);
  assert.equal(project.min_revenue, 5_000_000);
  assert.equal(project.min_ebitda, null);
  assert.equal(project.min_ebitda_margin, 10.5);
  assert.equal(project.can_manage, true);
  assert.equal(workspace(projectOwner).can_manage_buyer_projects, true);

  const memberToken = register({
    name: "Project Member",
    company: "Temporary Project Member Co.",
    email: "project-member@example.test",
    role: "buyer",
    password: "project-password-2026",
  });
  const projectMember = sessionUser(memberToken)!;
  const memberOrganization = one<{ id: string }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    projectMember.id,
  )!;
  run("DELETE FROM organization_members WHERE user_id=?", projectMember.id);
  run("DELETE FROM organizations WHERE id=?", memberOrganization.id);
  run(
    "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'member','active')",
    `membership-${projectMember.id}`,
    ownerOrganization.id,
    projectMember.id,
  );
  mutate(projectMember, {
    action: "updateBuyerProject",
    data: {
      buyer_project_id: created.id,
      name: "Project Atlas Updated",
      thesis: "Updated thesis.",
      min_revenue: "",
      max_revenue: "",
      min_ebitda: 1_000_000,
      max_ebitda: 3_000_000,
      min_ebitda_margin: "",
      max_ebitda_margin: "",
      min_enterprise_value: "",
      max_enterprise_value: "",
      min_equity_check: "",
      max_equity_check: "",
      ownership_preference: "flexible",
      transaction_type: "full_acquisition",
      sectors: ["Business services"],
      provinces: ["Ontario"],
      keywords: ["services", " SERVICES "],
    },
  });
  assert.equal(
    workspace(projectOwner).buyer_projects.find(
      (item) => item.id === created.id,
    )?.name,
    "Project Atlas Updated",
  );
  assert.deepEqual(
    workspace(projectOwner).buyer_projects.find(
      (item) => item.id === created.id,
    )?.keywords,
    ["services"],
  );
  mutate(projectMember, {
    action: "updateBuyerProject",
    data: { buyer_project_id: created.id, name: "Project Atlas Renamed" },
  });
  const partiallyUpdated = workspace(projectOwner).buyer_projects.find(
    (item) => item.id === created.id,
  )!;
  assert.equal(partiallyUpdated.min_ebitda, 1_000_000);
  assert.deepEqual(partiallyUpdated.sectors, ["Business services"]);
  mutate(projectMember, {
    action: "setBuyerProjectStatus",
    data: { buyer_project_id: created.id, status: "active" },
  });
  assert.equal(
    workspace(projectOwner).buyer_projects.find(
      (item) => item.id === created.id,
    )?.status,
    "active",
  );

  const viewerToken = register({
    name: "Project Viewer",
    company: "Temporary Project Viewer Co.",
    email: "project-viewer@example.test",
    role: "buyer",
    password: "project-password-2026",
  });
  const projectViewer = sessionUser(viewerToken)!;
  const viewerOrganization = one<{ id: string }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    projectViewer.id,
  )!;
  run("DELETE FROM organization_members WHERE user_id=?", projectViewer.id);
  run("DELETE FROM organizations WHERE id=?", viewerOrganization.id);
  run(
    "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'viewer','active')",
    `membership-${projectViewer.id}`,
    ownerOrganization.id,
    projectViewer.id,
  );
  assert.equal(
    workspace(projectViewer).buyer_projects.some(
      (item) => item.id === created.id,
    ),
    true,
  );
  assert.equal(workspace(projectViewer).can_manage_buyer_projects, false);
  assert.equal(
    workspace(projectViewer).buyer_projects.find(
      (item) => item.id === created.id,
    )?.can_manage,
    false,
  );
  assert.throws(
    () =>
      mutate(projectViewer, {
        action: "updateBuyerProject",
        data: { buyer_project_id: created.id, name: "Nope" },
      }),
    /Read-only organization members/,
  );

  const outsiderToken = register({
    name: "Project Outsider",
    company: "Unrelated Buyer Co.",
    email: "project-outsider@example.test",
    role: "buyer",
    password: "project-password-2026",
  });
  const outsiderProjectUser = sessionUser(outsiderToken)!;
  assert.equal(
    workspace(outsiderProjectUser).buyer_projects.some(
      (item) => item.id === created.id,
    ),
    false,
  );
  assert.throws(
    () =>
      mutate(outsiderProjectUser, {
        action: "setBuyerProjectStatus",
        data: { buyer_project_id: created.id, status: "paused" },
      }),
    /not available/,
  );

  const businessToken = register({
    name: "Operating Business",
    company: "Operating Business Co.",
    email: "project-business@example.test",
    role: "owner",
    password: "project-password-2026",
  });
  const businessUser = sessionUser(businessToken)!;
  assert.throws(
    () =>
      mutate(businessUser, {
        action: "createBuyerProject",
        data: { name: "Not eligible", thesis: "" },
      }),
    /eligible buyer organization/,
  );

  const advisorToken = register({
    name: "Project Advisor",
    company: "Project Advisor Co.",
    email: "project-advisor@example.test",
    role: "advisor",
    password: "project-password-2026",
  });
  const advisorUser = sessionUser(advisorToken)!;
  assert.throws(
    () =>
      mutate(advisorUser, {
        action: "createBuyerProject",
        data: { name: "Not eligible", thesis: "" },
      }),
    /eligible buyer organization/,
  );

  assert.throws(
    () =>
      mutate(projectOwner, {
        action: "createBuyerProject",
        data: {
          name: "Invalid range",
          min_revenue: 5,
          max_revenue: 4,
        },
      }),
    /Revenue minimum must not exceed maximum/,
  );
  assert.throws(
    () =>
      mutate(projectOwner, {
        action: "createBuyerProject",
        data: {
          name: "Invalid margin",
          max_ebitda_margin: 101,
        },
      }),
    /Too big/,
  );
  assert.throws(
    () =>
      mutate(projectOwner, {
        action: "createBuyerProject",
        data: {
          name: "Invalid sector",
          sectors: ["Unsupported sector"],
        },
      }),
    /Invalid option/,
  );
});

test("matching records recalculate on relevant changes and remain seller-authorized", () => {
  const buyerToken = register({
    name: "Matching Buyer",
    company: "Matching Capital",
    email: "matching-buyer@example.test",
    role: "buyer",
    password: "matching-password-2026",
  });
  const matchingBuyer = sessionUser(buyerToken)!;
  const projectResult = mutate(matchingBuyer, {
    action: "createBuyerProject",
    data: {
      name: "Project Match",
      status: "active",
      thesis: "Ontario technology businesses with recurring revenue.",
      min_revenue: 4_000_000,
      max_revenue: 12_000_000,
      min_ebitda: 500_000,
      max_ebitda: 3_000_000,
      min_enterprise_value: 6_000_000,
      max_enterprise_value: 20_000_000,
      ownership_preference: "majority",
      transaction_type: "majority_acquisition",
      sectors: ["Technology"],
      provinces: ["Ontario"],
      keywords: ["recurring revenue"],
    },
  });

  const sellerToken = register({
    name: "Matching Seller",
    company: "Matching Software Inc.",
    email: "matching-seller@example.test",
    role: "owner",
    password: "matching-password-2026",
  });
  const matchingSeller = sessionUser(sellerToken)!;
  const dealResult = mutate(matchingSeller, {
    action: "createDeal",
    data: {
      title: "Project Match Signal",
      company_name: "Matching Software Inc.",
      sector: "Technology",
      province: "Ontario",
      city: "Toronto",
      revenue: 8_000_000,
      ebitda: 1_600_000,
      asking_price: 12_000_000,
      employees: 30,
      founded: 2012,
      description:
        "A vertical software platform with recurring revenue and durable contracts.",
      confidential_summary: "Founder-owned and consistently profitable.",
      transaction_type: "majority_acquisition",
      ownership_percentage_available: 80,
      seller_rollover_possible: true,
      seller_financing_possible: false,
      management_transition: "Founder available for transition.",
      reason_for_transaction: "Planned succession.",
      min_expected_value: 10_000_000,
      max_expected_value: 14_000_000,
      distribution_mode: "private_outreach",
      financial_year: 2025,
      gross_profit: 5_000_000,
      financial_is_projected: false,
    },
  });

  const persisted = one<{
    score: number;
    eligible: number;
    score_breakdown_json: string;
  }>(
    "SELECT score,eligible,score_breakdown_json FROM deal_matches WHERE deal_id=? AND buyer_project_id=?",
    dealResult.id!,
    projectResult.id!,
  )!;
  assert.equal(persisted.score, 100);
  assert.equal(persisted.eligible, 1);
  assert.equal(JSON.parse(persisted.score_breakdown_json).reasons.length, 8);

  const visible = dealMatchesForUser(matchingSeller, dealResult.id!);
  assert.equal(
    visible.some((match) => match.buyer_project_id === projectResult.id),
    true,
  );
  assert.throws(
    () => dealMatchesForUser(matchingBuyer, dealResult.id!),
    /authorized deal-team member/,
  );

  mutate(matchingSeller, {
    action: "updateDeal",
    data: {
      deal_id: dealResult.id,
      stage: "Closed",
      published: false,
      distribution_mode: "private_outreach",
    },
  });
  assert.equal(
    one<{ eligible: number }>(
      "SELECT eligible FROM deal_matches WHERE deal_id=? AND buyer_project_id=?",
      dealResult.id!,
      projectResult.id!,
    )?.eligible,
    0,
  );

  mutate(matchingBuyer, {
    action: "setBuyerProjectStatus",
    data: { buyer_project_id: projectResult.id, status: "paused" },
  });
  const exclusions = JSON.parse(
    one<{ score_breakdown_json: string }>(
      "SELECT score_breakdown_json FROM deal_matches WHERE deal_id=? AND buyer_project_id=?",
      dealResult.id!,
      projectResult.id!,
    )!.score_breakdown_json,
  ).hard_exclusions as string[];
  assert.ok(exclusions.some((exclusion) => /not active/i.test(exclusion)));
  assert.ok(exclusions.some((exclusion) => /closed/i.test(exclusion)));
});

test("deal managers can curate recommended buyers without granting access", () => {
  const ownerState = workspace(owner);
  const ownerMatches = ownerState.deal_matches?.filter(
    (match) => match.deal_id === "cedar",
  );
  assert.ok(ownerMatches && ownerMatches.length >= 2);
  assert.ok(
    ownerMatches.every(
      (match) =>
        match.buyer_project_thesis &&
        match.buyer_organization_type &&
        typeof match.relevant_acquisitions === "number",
    ),
  );
  assert.ok(
    workspace(advisor).deal_matches?.some((match) => match.deal_id === "cedar"),
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(workspace(buyer), "deal_matches"),
    false,
  );

  const matchIds = ownerMatches.slice(0, 2).map((match) => match.id);
  const accessBefore = one<{ count: number }>(
    "SELECT COUNT(*) count FROM access WHERE deal_id='cedar'",
  )!.count;
  mutate(owner, {
    action: "updateDealMatchStatus",
    data: { deal_id: "cedar", match_ids: matchIds, status: "selected" },
  });
  assert.equal(
    one<{ count: number }>(
      "SELECT COUNT(*) count FROM deal_matches WHERE deal_id='cedar' AND status='selected'",
    )!.count,
    2,
  );
  assert.equal(
    one<{ count: number }>(
      "SELECT COUNT(*) count FROM access WHERE deal_id='cedar'",
    )!.count,
    accessBefore,
    "selecting recommendations must not grant buyer access",
  );

  mutate(owner, {
    action: "updateDealMatchStatus",
    data: { deal_id: "cedar", match_ids: [matchIds[0]], status: "excluded" },
  });
  const excluded = one<{
    status: string;
    eligible: number;
    score_breakdown_json: string;
  }>(
    "SELECT status,eligible,score_breakdown_json FROM deal_matches WHERE id=?",
    matchIds[0],
  )!;
  assert.equal(excluded.status, "excluded");
  assert.equal(excluded.eligible, 0);
  assert.match(excluded.score_breakdown_json, /excluded/i);

  mutate(owner, {
    action: "updateDealMatchStatus",
    data: { deal_id: "cedar", match_ids: [matchIds[0]], status: "recommended" },
  });
  assert.equal(
    one<{ status: string }>(
      "SELECT status FROM deal_matches WHERE id=?",
      matchIds[0],
    )?.status,
    "recommended",
  );
  mutate(advisor, {
    action: "updateDealMatchStatus",
    data: { deal_id: "cedar", match_ids: [matchIds[1]], status: "recommended" },
  });

  const otherDealMatch = one<{ id: string }>(
    "SELECT id FROM deal_matches WHERE deal_id='summit' LIMIT 1",
  )!;
  assert.throws(
    () =>
      mutate(owner, {
        action: "updateDealMatchStatus",
        data: {
          deal_id: "cedar",
          match_ids: [otherDealMatch.id],
          status: "selected",
        },
      }),
    /not available for this mandate/i,
  );
  assert.throws(
    () =>
      mutate(buyer, {
        action: "updateDealMatchStatus",
        data: {
          deal_id: "cedar",
          match_ids: [matchIds[0]],
          status: "selected",
        },
      }),
    /authorized deal-team member/i,
  );
});
