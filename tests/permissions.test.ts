import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase, databaseReady, db, one, run } from "../src/lib/db";
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
  membership,
} from "../src/lib/service";
import type { User, Document } from "../src/lib/types";
import { notifyUsers } from "../src/lib/notifications";
import { reviewBuyerIdentityVerification } from "../src/lib/buyer-identity-verification";
let directory: string;
let buyer: User, otherBuyer: User, owner: User, advisor: User;
before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "northlane-permissions-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  process.env.ALLOW_REGISTRATION = "true";
  await databaseReady();
  buyer = (await one<User>("SELECT * FROM users WHERE id='demo-buyer'"))!;
  otherBuyer = (await one<User>(
    "SELECT * FROM users WHERE id='demo-buyer-2'",
  ))!;
  owner = (await one<User>("SELECT * FROM users WHERE id='demo-owner'"))!;
  advisor = (await one<User>("SELECT * FROM users WHERE id='demo-advisor'"))!;
});
after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});
test("buyer transaction tombstones remain scoped and require platform verification", async () => {
  const created = await mutate(buyer, {
    action: "createClosedTransaction",
    data: {
      industry: "Business services",
      province: "Ontario",
      enterprise_value: 18000000,
      closed_date: "2025-06-30",
      description:
        "Majority acquisition of a Canadian recurring-revenue field-services company.",
    },
  });
  assert.ok(created.id);
  const buyerState = (await workspace(buyer)) as WorkspaceWithTransactions;
  const transaction = buyerState.closed_transactions.find(
    (entry) => entry.id === created.id,
  );
  assert.equal(transaction?.buyer_organization_id, "org-demo-buyer");
  assert.equal(transaction?.verified, 0);
  assert.equal(transaction?.verification_label, "Self-reported");
  assert.equal(
    (
      (await workspace(otherBuyer)) as WorkspaceWithTransactions
    ).closed_transactions.some((entry) => entry.id === created.id),
    false,
  );
  await assert.rejects(
    async () =>
      await mutate(owner, {
        action: "createClosedTransaction",
        data: {
          industry: "Technology",
          province: "Ontario",
          enterprise_value: 5000000,
          closed_date: "2024-01-31",
          description: "An unauthorized transaction-history record.",
        },
      }),
    /Only buyer organization owners and administrators/,
  );
  await assert.rejects(
    async () =>
      await mutate(otherBuyer, {
        action: "verifyClosedTransaction",
        data: { transaction_id: created.id },
      }),
    /Only platform verification reviewers/,
  );
  await run("UPDATE users SET is_platform_admin=1 WHERE id=?", buyer.id);
  buyer.is_platform_admin = 1;
  try {
    await assert.rejects(
      async () =>
        await mutate(buyer, {
          action: "verifyClosedTransaction",
          data: { transaction_id: created.id },
        }),
      /unavailable or has already been reviewed/,
      "a platform reviewer must not verify a record for their own firm",
    );
  } finally {
    await run("UPDATE users SET is_platform_admin=0 WHERE id=?", buyer.id);
    buyer.is_platform_admin = 0;
  }
  const reviewerBefore = (await workspace(
    advisor,
  )) as WorkspaceWithTransactions;
  assert.equal(
    reviewerBefore.closed_transaction_review_queue?.some(
      (entry) => entry.id === created.id,
    ),
    true,
  );
  await mutate(advisor, {
    action: "verifyClosedTransaction",
    data: { transaction_id: created.id },
  });
  const verified = (
    (await workspace(buyer)) as WorkspaceWithTransactions
  ).closed_transactions.find((entry) => entry.id === created.id);
  assert.equal(verified?.verified, 1);
  assert.equal(verified?.verification_label, "Succera verified");
  assert.equal(
    (
      (await workspace(advisor)) as WorkspaceWithTransactions
    ).closed_transaction_review_queue?.some((entry) => entry.id === created.id),
    false,
  );
  const sellerMatch = await (
    await workspace(owner)
  ).deal_matches?.find(
    (match) =>
      match.deal_id === "cedar" &&
      match.buyer_organization_id === "org-demo-buyer",
  );
  const sellerTransaction = (
    sellerMatch?.buyer_firm_profile as unknown as {
      closed_transactions: Array<Record<string, unknown>>;
    }
  ).closed_transactions.find((entry) => entry.id === created.id);
  assert.deepEqual(Object.keys(sellerTransaction ?? {}).sort(), [
    "closed_date",
    "description",
    "enterprise_value",
    "id",
    "industry",
    "province",
    "verification_label",
    "verified",
  ]);
  assert.equal(sellerTransaction?.verified, 1);
  assert.equal(
    sellerMatch?.buyer_firm_profile.reputation.transactions_closed,
    2,
    "only independently verified tombstones count as completed transactions",
  );
  assert.equal(
    sellerMatch?.buyer_firm_profile.reputation.relevant_transactions,
    1,
    "relevant experience is derived for the current mandate sector",
  );
  assert.equal("seller_organization_id" in (sellerTransaction ?? {}), false);
  assert.equal("advisor_organization_id" in (sellerTransaction ?? {}), false);
});
type WorkspaceWithTransactions = Awaited<ReturnType<typeof workspace>> & {
  closed_transactions: Array<{
    id: string;
    buyer_organization_id: string;
    verified: number;
    verification_label: string;
  }>;
  closed_transaction_review_queue?: Array<{
    id: string;
  }>;
};
test("buyers receive redacted teasers before confidential approval", async () => {
  const state = await workspace(buyer);
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
test("distribution strategy controls discovery and redacts seller identity", async () => {
  const result = await mutate(owner, {
    action: "createDeal",
    data: {
      title: "Project Distribution",
      company_name: "Distribution Test Company",
      sector: "Business services",
      province: "Ontario",
      city: "Toronto",
      revenue: 7500000,
      ebitda: 1250000,
      asking_price: 10000000,
      employees: 32,
      founded: 2008,
      description:
        "An Ontario HVAC field-services platform with contracted maintenance and recurring contracts.",
      confidential_summary: "Confidential seller information.",
      transaction_type: "majority_acquisition",
      ownership_percentage_available: 80,
      seller_rollover_possible: true,
      seller_financing_possible: false,
      management_transition: "Founder available for a twelve-month transition.",
      reason_for_transaction: "Planned founder succession.",
      min_expected_value: 9000000,
      max_expected_value: 11000000,
      distribution_mode: "private_outreach",
      financial_year: 2025,
      gross_profit: 3100000,
      financial_is_projected: false,
    },
  });
  const dealId = result.id!;
  await mutate(owner, {
    action: "updateDeal",
    data: {
      deal_id: dealId,
      stage: "On market",
      published: true,
      distribution_mode: "private_outreach",
    },
  });
  assert.equal(
    await (await workspace(buyer)).deals.some((deal) => deal.id === dealId),
    false,
    "private outreach must not enter buyer discovery",
  );
  await mutate(owner, {
    action: "updateDeal",
    data: {
      deal_id: dealId,
      stage: "On market",
      published: true,
      distribution_mode: "qualified_discovery",
    },
  });
  const discovery = await (
    await workspace(buyer)
  ).deals.find((deal) => deal.id === dealId)!;
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
    await (
      await workspace(buyer)
    ).deal_financials.some(
      (financial) =>
        financial.deal_id === dealId && financial.fiscal_year === 2025,
    ),
    false,
    "detailed financial history remains gated until NDA approval",
  );
});
test("deal teams can maintain transaction objectives and historical financials", async () => {
  const result = await mutate(owner, {
    action: "createDeal",
    data: {
      title: "Project Financial History",
      company_name: "Financial History Company",
      sector: "Business services",
      province: "Alberta",
      city: "Calgary",
      revenue: 6000000,
      ebitda: 900000,
      asking_price: 7500000,
      employees: 24,
      founded: 2012,
      description:
        "A fictional services company used to verify structured mandate financials.",
      confidential_summary: "Confidential operating information.",
      financial_year: 2025,
    },
  });
  const dealId = result.id!;
  await mutate(owner, {
    action: "updateDealDetails",
    data: {
      deal_id: dealId,
      transaction_type: "recapitalization",
      ownership_percentage_available: 65,
      seller_rollover_possible: true,
      seller_financing_possible: true,
      management_transition: "Management will remain after closing.",
      reason_for_transaction: "Growth capital and shareholder liquidity.",
      min_expected_value: 7000000,
      max_expected_value: 9000000,
    },
  });
  const updated = await getDeal(dealId);
  assert.equal(updated.transaction_type, "recapitalization");
  assert.equal(updated.ownership_percentage_available, 65);
  assert.equal(updated.seller_rollover_possible, 1);
  assert.equal(updated.seller_financing_possible, 1);
  assert.equal(updated.min_expected_value, 7000000);
  assert.equal(updated.max_expected_value, 9000000);
  const financialResult = await mutate(owner, {
    action: "upsertDealFinancial",
    data: {
      deal_id: dealId,
      fiscal_year: 2024,
      period_type: "annual",
      revenue: 5400000,
      ebitda: 760000,
      gross_profit: 2100000,
      is_projected: false,
    },
  });
  const financial = await (
    await workspace(owner)
  ).deal_financials.find((row) => row.id === financialResult.id)!;
  assert.equal(financial.revenue, 5400000);
  assert.equal(financial.gross_profit, 2100000);
  await assert.rejects(
    async () =>
      await mutate(buyer, {
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
  await mutate(owner, {
    action: "deleteDealFinancial",
    data: { deal_id: dealId, financial_id: financial.id },
  });
  assert.equal(
    await (
      await workspace(owner)
    ).deal_financials.some((row) => row.id === financial.id),
    false,
  );
});
test("document authorization separates buyers and seller-only records", async () => {
  const deal = await getDeal("cedar");
  const financial = (await one<Document>(
    "SELECT * FROM documents WHERE id='doc-cedar-fin'",
  ))!;
  const internal = (await one<Document>(
    "SELECT * FROM documents WHERE id='doc-cedar-internal'",
  ))!;
  const nda = (await one<Document>(
    "SELECT * FROM documents WHERE id='doc-cedar-nda'",
  ))!;
  assert.equal(await canReadDocument(buyer, deal, financial), true);
  assert.equal(await canReadDocument(otherBuyer, deal, financial), false);
  assert.equal(await canReadDocument(buyer, deal, internal), false);
  assert.equal(await canReadDocument(otherBuyer, deal, nda), false);
  assert.equal(await canReadDocument(advisor, deal, internal), true);
  assert.equal(
    await (await workspace(buyer)).documents.some((d) => d.id === internal.id),
    false,
  );
});
test("a buyer cannot publish a deal or approve their own access", async () => {
  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "updateDeal",
        data: { deal_id: "harbour", stage: "Closed", published: true },
      }),
    /Only/,
  );
  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "reviewAccess",
        data: { deal_id: "harbour", buyer_id: buyer.id, status: "approved" },
      }),
    /Only/,
  );
});
test("approval requires a buyer-specific NDA and an explicit human review", async () => {
  await assert.rejects(
    async () =>
      await mutate(advisor, {
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
  await assert.rejects(
    async () =>
      await mutate(advisor, {
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
test("buyer conversations, offers and internal tasks do not cross parties", async () => {
  const state = await workspace(otherBuyer);
  assert.equal(
    state.messages.some((m) => m.buyer_id === buyer.id),
    false,
  );
  assert.equal(state.offers.length, 0);
  assert.equal(
    state.tasks.some((t) => t.buyer_id !== otherBuyer.id),
    false,
  );
  await assert.rejects(
    async () =>
      await mutate(otherBuyer, {
        action: "message",
        data: { deal_id: "cedar", buyer_id: buyer.id, body: "Unauthorized" },
      }),
    /cannot access/,
  );
  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "toggleTask",
        data: { deal_id: "summit", task_id: "task-3" },
      }),
    /not available/,
  );
});
test("revocation immediately removes confidential data and document access", async () => {
  await run(
    "DELETE FROM notifications WHERE user_id=? AND deal_id=?",
    buyer.id,
    "cedar",
  );
  await notifyUsers(db(), {
    userIds: [buyer.id],
    type: "new_message",
    title: "New message",
    body: "Confidential message before revocation.",
    href: "/app/deals/cedar",
    dealId: "cedar",
    sourceKey: "test:revocation-confidential-message",
  });
  assert.equal(
    (
      await one<{
        count: number;
      }>(
        "SELECT COUNT(*) count FROM notifications WHERE user_id=? AND deal_id=?",
        buyer.id,
        "cedar",
      )
    )?.count,
    1,
  );
  await mutate(advisor, {
    action: "reviewAccess",
    data: { deal_id: "cedar", buyer_id: buyer.id, status: "revoked" },
  });
  const buyerNotifications = await (
    await workspace(buyer)
  ).notifications.filter((notification) => notification.deal_id === "cedar");
  assert.equal(buyerNotifications.length, 1);
  assert.equal(buyerNotifications[0].type, "access_revoked");
  assert.equal(
    (
      await one<{
        count: number;
      }>(
        `SELECT COUNT(*) count FROM email_outbox e
       JOIN notifications n ON n.id=e.notification_id
       WHERE e.user_id=? AND n.deal_id=?`,
        buyer.id,
        "cedar",
      )
    )?.count,
    1,
  );
  assert.equal(
    await (await workspace(buyer)).deals.find((d) => d.id === "cedar")
      ?.has_access,
    false,
  );
  assert.equal(
    await (await workspace(buyer)).documents.some((d) => d.deal_id === "cedar"),
    false,
  );
  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "message",
        data: {
          deal_id: "cedar",
          buyer_id: buyer.id,
          body: "No longer allowed",
        },
      }),
    /cannot access/,
  );
  await notifyUsers(db(), {
    userIds: [buyer.id],
    type: "document_shared",
    title: "Document shared",
    body: "Confidential document before denial.",
    href: "/app/deals/cedar",
    dealId: "cedar",
    sourceKey: "test:denial-confidential-document",
  });
  await mutate(advisor, {
    action: "reviewAccess",
    data: { deal_id: "cedar", buyer_id: buyer.id, status: "denied" },
  });
  assert.equal(
    await (
      await workspace(buyer)
    ).notifications.some((notification) => notification.deal_id === "cedar"),
    false,
  );
  await mutate(advisor, {
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
test("a linked owner and appointed advisor share the same mandate", async () => {
  const result = await mutate(advisor, {
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
  await mutate(advisor, {
    action: "connectOwner",
    data: { deal_id: dealId, email: owner.email, confirm_authority: true },
  });
  assert.equal(await (await getDeal(dealId)).owner_id, owner.id);
  assert.equal(
    await (await workspace(owner)).deals.find((d) => d.id === dealId)
      ?.can_manage,
    true,
  );
  assert.equal(
    await (await workspace(advisor)).deals.find((d) => d.id === dealId)
      ?.can_manage,
    true,
  );
  assert.equal(
    await (await workspace(buyer)).deals.some((d) => d.id === dealId),
    false,
  );
});
test("organization membership shares firm deals without crossing firm boundaries", async () => {
  const ownerToken = await register({
    name: "Firm Owner",
    company: "Shared Firm Inc.",
    email: "firm-owner@example.test",
    role: "owner",
    password: "firm-password-2026",
  });
  const firmOwner = await (await sessionUser(ownerToken))!;
  const memberToken = await register({
    name: "Firm Member",
    company: "Temporary Member Firm",
    email: "firm-member@example.test",
    role: "owner",
    password: "firm-password-2026",
  });
  const firmMember = await (await sessionUser(memberToken))!;
  const viewerToken = await register({
    name: "Firm Viewer",
    company: "Temporary Viewer Firm",
    email: "firm-viewer@example.test",
    role: "owner",
    password: "firm-password-2026",
  });
  const firmViewer = await (await sessionUser(viewerToken))!;
  const outsiderToken = await register({
    name: "Other Firm",
    company: "Other Firm Inc.",
    email: "other-firm@example.test",
    role: "owner",
    password: "firm-password-2026",
  });
  const outsider = await (await sessionUser(outsiderToken))!;
  const organization = (await one<{
    id: string;
  }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    firmOwner.id,
  ))!;
  for (const [user, role] of [
    [firmMember, "member"],
    [firmViewer, "viewer"],
  ] as const) {
    const ownOrganization = (await one<{
      id: string;
    }>(
      "SELECT organization_id id FROM organization_members WHERE user_id=?",
      user.id,
    ))!;
    await run("DELETE FROM organization_members WHERE user_id=?", user.id);
    await run("DELETE FROM organizations WHERE id=?", ownOrganization.id);
    await run(
      "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,?,?)",
      `membership-${user.id}`,
      organization.id,
      user.id,
      role,
      "active",
    );
  }
  const created = await mutate(firmOwner, {
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
    await (await workspace(firmMember)).deals.find((deal) => deal.id === dealId)
      ?.can_manage,
    true,
  );
  assert.equal(
    await (await workspace(firmViewer)).deals.find((deal) => deal.id === dealId)
      ?.has_access,
    true,
  );
  assert.equal(
    await (await workspace(firmViewer)).deals.find((deal) => deal.id === dealId)
      ?.can_manage,
    false,
  );
  assert.equal(
    await (await workspace(outsider)).deals.some((deal) => deal.id === dealId),
    false,
  );
  await assert.rejects(
    async () =>
      await mutate(firmViewer, {
        action: "updateDeal",
        data: { deal_id: dealId, stage: "On market", published: true },
      }),
    /Only/,
  );
  await assert.rejects(
    async () =>
      await mutate(firmViewer, {
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
  await assert.rejects(
    async () =>
      await mutate(firmMember, {
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
  await mutate(firmOwner, {
    action: "organization",
    data: {
      name: "Shared Firm Partners",
      organization_type: "business",
      website: "https://shared.example.test",
      province: "Ontario",
      description: "A fictional multi-user Canadian firm.",
    },
  });
  assert.equal(
    await (
      await workspace(firmMember)
    ).organization.name,
    "Shared Firm Partners",
  );
  assert.equal(
    (
      await one<{
        company: string;
      }>("SELECT company FROM users WHERE id=?", firmMember.id)
    )?.company,
    "Shared Firm Partners",
  );
  assert.deepEqual(
    await (
      await workspace(firmOwner)
    ).organization_members
      .map((member) => member.role)
      .sort(),
    ["member", "owner", "viewer"],
  );
  assert.equal(
    typeof (await (
      await workspace(firmOwner)
    ).organization.can_manage),
    "boolean",
  );
  await run(
    "UPDATE organization_members SET role='admin' WHERE user_id=? AND organization_id=?",
    firmMember.id,
    organization.id,
  );
  await mutate(firmMember, {
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
    await (
      await workspace(firmOwner)
    ).organization.name,
    "Shared Firm Admin Edit",
  );
  await run(
    "UPDATE organization_members SET role='member' WHERE user_id=? AND organization_id=?",
    firmMember.id,
    organization.id,
  );
  await mutate(firmOwner, {
    action: "profile",
    data: {
      name: firmOwner.name,
      company: "Shared Firm Legacy Rename",
      province: "",
      bio: "",
      sectors: "",
      min_revenue: 1000000,
      max_revenue: 20000000,
    },
  });
  assert.equal(
    await (
      await workspace(firmMember)
    ).organization.name,
    "Shared Firm Legacy Rename",
  );
  await assert.rejects(
    async () =>
      await mutate(firmMember, {
        action: "profile",
        data: {
          name: firmMember.name,
          company: "Unauthorized Legacy Rename",
          province: "",
          bio: "",
          sectors: "",
          min_revenue: 1000000,
          max_revenue: 20000000,
        },
      }),
    /organization owners and administrators/,
  );
  await run(
    "UPDATE organization_members SET role='viewer' WHERE user_id=? AND organization_id=?",
    firmOwner.id,
    organization.id,
  );
  assert.equal(
    await (await workspace(firmOwner)).deals.find((deal) => deal.id === dealId)
      ?.can_manage,
    false,
  );
  await assert.rejects(
    async () =>
      await mutate(firmOwner, {
        action: "updateDeal",
        data: { deal_id: dealId, stage: "On market", published: true },
      }),
    /authorized deal-team member/,
  );
});
test("advisor firm members inherit only the permissions granted by their firm role", async () => {
  const advisorToken = await register({
    name: "Advisor Firm Admin",
    company: "Advisor Firm Inc.",
    email: "advisor-firm-admin@example.test",
    role: "advisor",
    password: "advisor-password-2026",
  });
  const advisorAdmin = await (await sessionUser(advisorToken))!;
  const viewerToken = await register({
    name: "Advisor Firm Viewer",
    company: "Temporary Advisor Firm",
    email: "advisor-firm-viewer@example.test",
    role: "advisor",
    password: "advisor-password-2026",
  });
  const advisorViewer = await (await sessionUser(viewerToken))!;
  const ownerToken = await register({
    name: "Advisor Test Owner",
    company: "Advisor Test Owner Inc.",
    email: "advisor-test-owner@example.test",
    role: "owner",
    password: "advisor-password-2026",
  });
  const testOwner = await (await sessionUser(ownerToken))!;
  const advisorOrganization = (await one<{
    id: string;
  }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    advisorAdmin.id,
  ))!;
  const viewerOrganization = (await one<{
    id: string;
  }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    advisorViewer.id,
  ))!;
  await run(
    "DELETE FROM organization_members WHERE user_id=?",
    advisorViewer.id,
  );
  await run("DELETE FROM organizations WHERE id=?", viewerOrganization.id);
  await run(
    "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'viewer','active')",
    `membership-${advisorViewer.id}`,
    advisorOrganization.id,
    advisorViewer.id,
  );
  await run(
    "UPDATE organization_members SET role='admin' WHERE user_id=? AND organization_id=?",
    advisorAdmin.id,
    advisorOrganization.id,
  );
  const created = await mutate(testOwner, {
    action: "createDeal",
    data: {
      title: "Project Advisor Firm",
      company_name: "Advisor Test Owner Inc.",
      sector: "Business services",
      province: "Ontario",
      city: "Toronto",
      revenue: 3000000,
      ebitda: 500000,
      asking_price: 4000000,
      employees: 18,
      founded: 2011,
      description:
        "A private mandate used to verify permissions across an advisor organization.",
      confidential_summary: "Advisor firm authorization test.",
    },
  });
  await mutate(testOwner, {
    action: "appointAdvisor",
    data: { deal_id: created.id, advisor_id: advisorAdmin.id },
  });
  const deal = await getDeal(created.id!);
  assert.equal(await isManager(advisorAdmin, deal), true);
  assert.equal(await isManager(advisorViewer, deal), false);
  assert.equal(
    await (
      await workspace(advisorViewer)
    ).deals.find((item) => item.id === deal.id)?.has_access,
    true,
  );
  await assert.rejects(
    async () =>
      await mutate(advisorViewer, {
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
test("real accounts cannot discover or mutate demonstration deals", async () => {
  const token = await register({
    name: "Real Buyer",
    company: "Real Account Inc.",
    email: "real@example.test",
    role: "buyer",
    password: "  exact-password-2026  ",
  });
  const user = await (await sessionUser(token))!;
  assert.equal(await (await workspace(user)).deals.length, 0);
  await assert.rejects(
    async () =>
      await mutate(user, {
        action: "requestAccess",
        data: { deal_id: "maple" },
      }),
    /not available/,
  );
  assert.ok(
    await login({
      email: "real@example.test",
      password: "  exact-password-2026  ",
    }),
  );
  await assert.rejects(
    async () =>
      await login({
        email: "real@example.test",
        password: "exact-password-2026",
      }),
    /incorrect/,
  );
});
test("demo buyers cannot enumerate registered Qualified Discovery inventory", async () => {
  const token = await register({
    name: "Preview Owner",
    company: "Preview Owner Inc.",
    email: "preview-owner@example.test",
    role: "owner",
    password: "preview-password-2026",
  });
  const realOwner = await (await sessionUser(token))!;
  const advisorToken = await register({
    name: "Preview Advisor",
    company: "Preview Advisory Inc.",
    email: "preview-advisor@example.test",
    role: "advisor",
    password: "preview-password-2026",
  });
  const realAdvisor = await (await sessionUser(advisorToken))!;
  const created = await mutate(realOwner, {
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
  await mutate(realOwner, {
    action: "appointAdvisor",
    data: { deal_id: dealId, advisor_id: realAdvisor.id },
  });
  assert.equal(
    await (await workspace(buyer)).deals.some((deal) => deal.id === dealId),
    false,
    "an unpublished real listing must remain hidden from the demo buyer",
  );
  await mutate(realOwner, {
    action: "updateDeal",
    data: {
      deal_id: dealId,
      stage: "On market",
      published: true,
      distribution_mode: "qualified_discovery",
    },
  });
  await run(
    "INSERT INTO access(id,deal_id,buyer_id,status) VALUES(?,?,?,'approved')",
    "cross-realm-preview",
    dealId,
    buyer.id,
  );
  await run(
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
  await run(
    "INSERT INTO messages(id,deal_id,buyer_id,sender_id,body) VALUES(?,?,?,?,?)",
    "cross-realm-message",
    dealId,
    buyer.id,
    realOwner.id,
    "This imported conversation must remain hidden.",
  );
  await run(
    "INSERT INTO tasks(id,deal_id,title,due_date,buyer_id,created_by) VALUES(?,?,?,?,?,?)",
    "cross-realm-task",
    dealId,
    "Imported diligence task",
    "2026-12-31",
    buyer.id,
    realOwner.id,
  );
  await run(
    "INSERT INTO offers(id,deal_id,buyer_id,amount,structure,notes,document_id) VALUES(?,?,?,?,?,?,?)",
    "cross-realm-offer",
    dealId,
    buyer.id,
    3500000,
    "Asset purchase",
    "Imported offer",
    "cross-realm-doc",
  );
  await run(
    "INSERT INTO activity(id,deal_id,actor_id,action) VALUES(?,?,?,?)",
    "cross-realm-activity",
    dealId,
    buyer.id,
    "Imported activity",
  );
  const state = await workspace(buyer);
  const preview = state.deals.find((deal) => deal.id === dealId);
  assert.equal(
    preview,
    undefined,
    "a shared demo account must not enumerate registered marketplace inventory",
  );
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
  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "requestAccess",
        data: {
          deal_id: dealId,
          notes: "Shared demo accounts stay read-only.",
        },
      }),
    /not available/,
  );
});
test("disabled demo mode invalidates existing demo sessions", async () => {
  const token = await createSession(buyer.id);
  assert.equal(await (await sessionUser(token))?.id, buyer.id);
  process.env.ALLOW_DEMO = "false";
  assert.equal(await sessionUser(token), undefined);
  process.env.ALLOW_DEMO = "true";
});
test("expired sessions are rejected", async () => {
  const token = await createSession(owner.id);
  await run("UPDATE sessions SET expires_at=0 WHERE user_id=?", owner.id);
  assert.equal(await sessionUser(token), undefined);
});
test("buyer projects are normalized and scoped to eligible organization members", async () => {
  const ownerToken = await register({
    name: "Project Owner",
    company: "Project Equity Co.",
    email: "project-owner@example.test",
    role: "buyer",
    password: "project-password-2026",
  });
  const projectOwner = await (await sessionUser(ownerToken))!;
  const ownerOrganization = (await one<{
    id: string;
  }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    projectOwner.id,
  ))!;
  const created = await mutate(projectOwner, {
    action: "createBuyerProject",
    data: {
      name: "Project Atlas",
      thesis: "Acquire durable Canadian vertical software businesses.",
      min_revenue: "5000000",
      max_revenue: 20000000,
      min_ebitda: "",
      max_ebitda: "2000000",
      min_ebitda_margin: "10.5",
      max_ebitda_margin: 35,
      min_enterprise_value: "",
      max_enterprise_value: 80000000,
      min_equity_check: 5000000,
      max_equity_check: "30000000",
      ownership_preference: "majority",
      transaction_type: "majority_acquisition",
      sectors: ["Technology", "Technology"],
      provinces: ["Ontario", "Québec"],
      keywords: [" SaaS ", "saas", "Recurring Revenue"],
    },
  });
  assert.ok(created.id);
  const project = await (
    await workspace(projectOwner)
  ).buyer_projects.find((item) => item.id === created.id)!;
  assert.deepEqual(project.sectors, ["Technology"]);
  assert.deepEqual(project.provinces, ["Ontario", "Québec"]);
  assert.deepEqual(project.keywords, ["Recurring Revenue", "SaaS"]);
  assert.equal(project.min_revenue, 5000000);
  assert.equal(project.min_ebitda, null);
  assert.equal(project.min_ebitda_margin, 10.5);
  assert.equal(project.can_manage, true);
  assert.equal(
    await (
      await workspace(projectOwner)
    ).can_manage_buyer_projects,
    true,
  );
  const memberToken = await register({
    name: "Project Member",
    company: "Temporary Project Member Co.",
    email: "project-member@example.test",
    role: "buyer",
    password: "project-password-2026",
  });
  const projectMember = await (await sessionUser(memberToken))!;
  const memberOrganization = (await one<{
    id: string;
  }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    projectMember.id,
  ))!;
  await run(
    "DELETE FROM organization_members WHERE user_id=?",
    projectMember.id,
  );
  await run("DELETE FROM organizations WHERE id=?", memberOrganization.id);
  await run(
    "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'member','active')",
    `membership-${projectMember.id}`,
    ownerOrganization.id,
    projectMember.id,
  );
  await mutate(projectMember, {
    action: "updateBuyerProject",
    data: {
      buyer_project_id: created.id,
      name: "Project Atlas Updated",
      thesis: "Updated thesis.",
      min_revenue: "",
      max_revenue: "",
      min_ebitda: 1000000,
      max_ebitda: 3000000,
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
    await (
      await workspace(projectOwner)
    ).buyer_projects.find((item) => item.id === created.id)?.name,
    "Project Atlas Updated",
  );
  assert.deepEqual(
    await (
      await workspace(projectOwner)
    ).buyer_projects.find((item) => item.id === created.id)?.keywords,
    ["services"],
  );
  await mutate(projectMember, {
    action: "updateBuyerProject",
    data: { buyer_project_id: created.id, name: "Project Atlas Renamed" },
  });
  const partiallyUpdated = await (
    await workspace(projectOwner)
  ).buyer_projects.find((item) => item.id === created.id)!;
  assert.equal(partiallyUpdated.min_ebitda, 1000000);
  assert.deepEqual(partiallyUpdated.sectors, ["Business services"]);
  await mutate(projectMember, {
    action: "setBuyerProjectStatus",
    data: { buyer_project_id: created.id, status: "active" },
  });
  assert.equal(
    await (
      await workspace(projectOwner)
    ).buyer_projects.find((item) => item.id === created.id)?.status,
    "active",
  );
  const viewerToken = await register({
    name: "Project Viewer",
    company: "Temporary Project Viewer Co.",
    email: "project-viewer@example.test",
    role: "buyer",
    password: "project-password-2026",
  });
  const projectViewer = await (await sessionUser(viewerToken))!;
  const viewerOrganization = (await one<{
    id: string;
  }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    projectViewer.id,
  ))!;
  await run(
    "DELETE FROM organization_members WHERE user_id=?",
    projectViewer.id,
  );
  await run("DELETE FROM organizations WHERE id=?", viewerOrganization.id);
  await run(
    "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'viewer','active')",
    `membership-${projectViewer.id}`,
    ownerOrganization.id,
    projectViewer.id,
  );
  assert.equal(
    await (
      await workspace(projectViewer)
    ).buyer_projects.some((item) => item.id === created.id),
    true,
  );
  assert.equal(
    await (
      await workspace(projectViewer)
    ).can_manage_buyer_projects,
    false,
  );
  assert.equal(
    await (
      await workspace(projectViewer)
    ).buyer_projects.find((item) => item.id === created.id)?.can_manage,
    false,
  );
  await assert.rejects(
    async () =>
      await mutate(projectViewer, {
        action: "updateBuyerProject",
        data: { buyer_project_id: created.id, name: "Nope" },
      }),
    /Read-only organization members/,
  );
  const outsiderToken = await register({
    name: "Project Outsider",
    company: "Unrelated Buyer Co.",
    email: "project-outsider@example.test",
    role: "buyer",
    password: "project-password-2026",
  });
  const outsiderProjectUser = await (await sessionUser(outsiderToken))!;
  assert.equal(
    await (
      await workspace(outsiderProjectUser)
    ).buyer_projects.some((item) => item.id === created.id),
    false,
  );
  await assert.rejects(
    async () =>
      await mutate(outsiderProjectUser, {
        action: "setBuyerProjectStatus",
        data: { buyer_project_id: created.id, status: "paused" },
      }),
    /not available/,
  );
  const businessToken = await register({
    name: "Operating Business",
    company: "Operating Business Co.",
    email: "project-business@example.test",
    role: "owner",
    password: "project-password-2026",
  });
  const businessUser = await (await sessionUser(businessToken))!;
  await assert.rejects(
    async () =>
      await mutate(businessUser, {
        action: "createBuyerProject",
        data: { name: "Not eligible", thesis: "" },
      }),
    /eligible buyer organization/,
  );
  const advisorToken = await register({
    name: "Project Advisor",
    company: "Project Advisor Co.",
    email: "project-advisor@example.test",
    role: "advisor",
    password: "project-password-2026",
  });
  const advisorUser = await (await sessionUser(advisorToken))!;
  await assert.rejects(
    async () =>
      await mutate(advisorUser, {
        action: "createBuyerProject",
        data: { name: "Not eligible", thesis: "" },
      }),
    /eligible buyer organization/,
  );
  await assert.rejects(
    async () =>
      await mutate(projectOwner, {
        action: "createBuyerProject",
        data: {
          name: "Invalid range",
          min_revenue: 5,
          max_revenue: 4,
        },
      }),
    /Revenue minimum must not exceed maximum/,
  );
  await assert.rejects(
    async () =>
      await mutate(projectOwner, {
        action: "createBuyerProject",
        data: {
          name: "Invalid margin",
          max_ebitda_margin: 101,
        },
      }),
    /Too big/,
  );
  await assert.rejects(
    async () =>
      await mutate(projectOwner, {
        action: "createBuyerProject",
        data: {
          name: "Invalid sector",
          sectors: ["Unsupported sector"],
        },
      }),
    /Invalid option/,
  );
});
test("matching records recalculate on relevant changes and remain seller-authorized", async () => {
  const buyerToken = await register({
    name: "Matching Buyer",
    company: "Matching Capital",
    email: "matching-buyer@example.test",
    role: "buyer",
    password: "matching-password-2026",
  });
  const matchingBuyer = await (await sessionUser(buyerToken))!;
  const projectResult = await mutate(matchingBuyer, {
    action: "createBuyerProject",
    data: {
      name: "Project Match",
      status: "active",
      thesis: "Ontario technology businesses with recurring revenue.",
      min_revenue: 4000000,
      max_revenue: 12000000,
      min_ebitda: 500000,
      max_ebitda: 3000000,
      min_enterprise_value: 6000000,
      max_enterprise_value: 20000000,
      ownership_preference: "majority",
      transaction_type: "majority_acquisition",
      sectors: ["Technology"],
      provinces: ["Ontario"],
      keywords: ["recurring revenue"],
    },
  });
  const sellerToken = await register({
    name: "Matching Seller",
    company: "Matching Software Inc.",
    email: "matching-seller@example.test",
    role: "owner",
    password: "matching-password-2026",
  });
  const matchingSeller = await (await sessionUser(sellerToken))!;
  const dealResult = await mutate(matchingSeller, {
    action: "createDeal",
    data: {
      title: "Project Match Signal",
      company_name: "Matching Software Inc.",
      sector: "Technology",
      province: "Ontario",
      city: "Toronto",
      revenue: 8000000,
      ebitda: 1600000,
      asking_price: 12000000,
      employees: 30,
      founded: 2012,
      description:
        "A vertical software platform with recurring revenue and durable contracts.",
      confidential_summary:
        "Founder-owned, consistently profitable, with recurring revenue.",
      transaction_type: "majority_acquisition",
      ownership_percentage_available: 80,
      seller_rollover_possible: true,
      seller_financing_possible: false,
      management_transition: "Founder available for transition.",
      reason_for_transaction: "Planned succession.",
      min_expected_value: 10000000,
      max_expected_value: 14000000,
      distribution_mode: "private_outreach",
      financial_year: 2025,
      gross_profit: 5000000,
      financial_is_projected: false,
    },
  });
  const persisted = (await one<{
    score: number;
    eligible: number;
    score_breakdown_json: string;
  }>(
    "SELECT score,eligible,score_breakdown_json FROM deal_matches WHERE deal_id=? AND buyer_project_id=?",
    dealResult.id!,
    projectResult.id!,
  ))!;
  assert.equal(persisted.score, 100);
  assert.equal(persisted.eligible, 1);
  assert.equal(JSON.parse(persisted.score_breakdown_json).reasons.length, 8);
  const visible = await dealMatchesForUser(matchingSeller, dealResult.id!);
  assert.equal(
    visible.some((match) => match.buyer_project_id === projectResult.id),
    true,
  );
  await assert.rejects(
    async () => await dealMatchesForUser(matchingBuyer, dealResult.id!),
    /authorized deal-team member/,
  );
  await mutate(matchingSeller, {
    action: "updateDeal",
    data: {
      deal_id: dealResult.id,
      stage: "Closed",
      published: false,
      distribution_mode: "private_outreach",
    },
  });
  assert.equal(
    (
      await one<{
        eligible: number;
      }>(
        "SELECT eligible FROM deal_matches WHERE deal_id=? AND buyer_project_id=?",
        dealResult.id!,
        projectResult.id!,
      )
    )?.eligible,
    0,
  );
  await mutate(matchingBuyer, {
    action: "setBuyerProjectStatus",
    data: { buyer_project_id: projectResult.id, status: "paused" },
  });
  const exclusions = JSON.parse(
    (await one<{
      score_breakdown_json: string;
    }>(
      "SELECT score_breakdown_json FROM deal_matches WHERE deal_id=? AND buyer_project_id=?",
      dealResult.id!,
      projectResult.id!,
    ))!.score_breakdown_json,
  ).hard_exclusions as string[];
  assert.ok(exclusions.some((exclusion) => /not active/i.test(exclusion)));
  assert.ok(exclusions.some((exclusion) => /closed/i.test(exclusion)));
});
test("deal managers can curate recommended buyers without granting access", async () => {
  const ownerState = await workspace(owner);
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
    await (
      await workspace(advisor)
    ).deal_matches?.some((match) => match.deal_id === "cedar"),
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      await workspace(buyer),
      "deal_matches",
    ),
    false,
  );
  const revokedBuyerOrganizationId = await (
    await workspace(buyer)
  ).organization.id;
  const curatedMatches = [...ownerMatches]
    .sort(
      (left, right) =>
        Number(left.buyer_organization_id === revokedBuyerOrganizationId) -
        Number(right.buyer_organization_id === revokedBuyerOrganizationId),
    )
    .slice(0, 2);
  const matchIds = curatedMatches.map((match) => match.id);
  const accessBefore = (await one<{
    count: number;
  }>("SELECT COUNT(*) count FROM access WHERE deal_id='cedar'"))!.count;
  await mutate(owner, {
    action: "updateDealMatchStatus",
    data: { deal_id: "cedar", match_ids: matchIds, status: "selected" },
  });
  assert.equal(
    (await one<{
      count: number;
    }>(
      "SELECT COUNT(*) count FROM deal_matches WHERE deal_id='cedar' AND status='selected'",
    ))!.count,
    2,
  );
  assert.equal(
    (await one<{
      count: number;
    }>("SELECT COUNT(*) count FROM access WHERE deal_id='cedar'"))!.count,
    accessBefore,
    "selecting recommendations must not grant buyer access",
  );
  await mutate(owner, {
    action: "updateDealMatchStatus",
    data: { deal_id: "cedar", match_ids: [matchIds[0]], status: "excluded" },
  });
  const excluded = (await one<{
    status: string;
    eligible: number;
    score_breakdown_json: string;
  }>(
    "SELECT status,eligible,score_breakdown_json FROM deal_matches WHERE id=?",
    matchIds[0],
  ))!;
  assert.equal(excluded.status, "excluded");
  assert.equal(excluded.eligible, 0);
  assert.match(excluded.score_breakdown_json, /excluded/i);
  await mutate(owner, {
    action: "updateDealMatchStatus",
    data: { deal_id: "cedar", match_ids: [matchIds[0]], status: "recommended" },
  });
  assert.equal(
    (
      await one<{
        status: string;
      }>("SELECT status FROM deal_matches WHERE id=?", matchIds[0])
    )?.status,
    "recommended",
  );
  assert.equal(
    await (
      await workspace(owner)
    ).buyer_funnels
      ?.find((funnel) => funnel.deal_id === "cedar")
      ?.buyers.find(
        (entry) =>
          entry.buyer_organization_id ===
          curatedMatches[0].buyer_organization_id,
      )?.outcome,
    "Active",
    "restoring a recommendation must supersede its historical exclusion outcome",
  );
  await mutate(advisor, {
    action: "updateDealMatchStatus",
    data: { deal_id: "cedar", match_ids: [matchIds[1]], status: "recommended" },
  });
  const otherDealMatch = (await one<{
    id: string;
  }>("SELECT id FROM deal_matches WHERE deal_id='summit' LIMIT 1"))!;
  await assert.rejects(
    async () =>
      await mutate(owner, {
        action: "updateDealMatchStatus",
        data: {
          deal_id: "cedar",
          match_ids: [otherDealMatch.id],
          status: "selected",
        },
      }),
    /not available for this mandate/i,
  );
  await assert.rejects(
    async () =>
      await mutate(buyer, {
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
test("buyer firms manage a seller-visible profile without exposing verification evidence", async () => {
  const buyerState = await workspace(buyer);
  await mutate(buyer, {
    action: "updateBuyerFirmProfile",
    data: {
      fund_structure:
        "Closed-end private equity fund backed by Canadian institutions.",
      financing_profile:
        "Equity capital with senior acquisition financing where appropriate.",
      revision: buyerState.buyer_firm_profile!.revision,
      self_reported_acquisition_count: 12,
    },
  });
  assert.equal(buyerState.buyer_firm_profile?.can_manage, true);
  assert.equal(
    buyerState.buyer_firm_profile?.self_reported_acquisition_count,
    12,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(buyerState, "deal_matches"),
    false,
  );
  const sellerMatch = await (
    await workspace(owner)
  ).deal_matches?.find(
    (match) =>
      match.deal_id === "cedar" &&
      match.buyer_organization_id === buyerState.organization.id,
  );
  assert.ok(sellerMatch?.buyer_firm_profile);
  assert.equal(
    sellerMatch.buyer_firm_profile.self_reported_acquisition_count,
    12,
  );
  assert.deepEqual(
    sellerMatch.buyer_firm_profile.active_projects.map(
      (project) => project.name,
    ),
    ["Project Maple", "Project Northern Lights"],
  );
  assert.ok(
    sellerMatch.buyer_firm_profile.active_projects.every(
      (project) =>
        Array.isArray(project.sectors) && Array.isArray(project.provinces),
    ),
  );
  assert.deepEqual(
    Object.keys(sellerMatch.buyer_firm_profile.reputation).sort(),
    [
      "lois_submitted",
      "median_response_hours",
      "opportunities_pursued",
      "relevant_transactions",
      "response_opportunities",
      "response_rate",
      "transactions_closed",
    ],
    "seller profiles expose only aggregate reputation metrics",
  );
  assert.equal(
    Number.isInteger(
      sellerMatch.buyer_firm_profile.reputation.response_opportunities,
    ),
    true,
  );
  assert.equal(
    sellerMatch.buyer_firm_profile.reputation.transactions_closed >= 1,
    true,
  );
  assert.equal("events" in sellerMatch.buyer_firm_profile.reputation, false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      sellerMatch.buyer_firm_profile,
      "capital_source",
    ),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      sellerMatch.buyer_firm_profile,
      "acquisition_history",
    ),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      sellerMatch.buyer_firm_profile,
      "principals",
    ),
    false,
  );
  await run(`INSERT INTO users(
       id,email,password_hash,name,company,role,is_demo
     ) VALUES('demo-buyer-profile-viewer','profile-viewer@example.test','hash',
       'Profile Viewer','Evergreen Capital','buyer',1)`);
  await run(
    `INSERT INTO organization_members(
       id,organization_id,user_id,role,status
     ) VALUES('membership-demo-buyer-profile-viewer',?,'demo-buyer-profile-viewer','viewer','active')`,
    buyerState.organization.id,
  );
  const profileViewer = (await one<User>(
    "SELECT * FROM users WHERE id='demo-buyer-profile-viewer'",
  ))!;
  assert.equal(
    await (
      await workspace(profileViewer)
    ).buyer_firm_profile?.can_manage,
    false,
  );
  await assert.rejects(
    async () =>
      await mutate(profileViewer, {
        action: "updateBuyerFirmProfile",
        data: {
          fund_structure: "Unauthorized change",
          financing_profile: "Unauthorized change",
          revision: await (
            await workspace(profileViewer)
          ).buyer_firm_profile!.revision,
          self_reported_acquisition_count: 99,
        },
      }),
    /owners and administrators/,
  );
  await assert.rejects(
    async () =>
      await mutate(owner, {
        action: "updateBuyerFirmProfile",
        data: {
          fund_structure: "Unauthorized seller change",
          financing_profile: "Unauthorized seller change",
          revision: 1,
          self_reported_acquisition_count: 99,
        },
      }),
    /buyer organization owners and administrators/,
  );
});
test("buyer firm profiles distinguish an untouched count from an explicit zero", async () => {
  const suffix = Date.now();
  const token = await register({
    name: "Unreported Buyer",
    company: `Unreported Capital ${suffix}`,
    email: `unreported-buyer-${suffix}@example.test`,
    role: "buyer",
    password: "unreported-profile-password-2026",
  });
  const registeredBuyer = await (await sessionUser(token))!;
  assert.equal(
    await (
      await workspace(registeredBuyer)
    ).buyer_firm_profile?.self_reported_acquisition_count,
    null,
  );
  await mutate(registeredBuyer, {
    action: "updateBuyerFirmProfile",
    data: {
      fund_structure: "",
      financing_profile: "",
      revision: await (
        await workspace(registeredBuyer)
      ).buyer_firm_profile!.revision,
      self_reported_acquisition_count: "",
    },
  });
  assert.equal(
    await (
      await workspace(registeredBuyer)
    ).buyer_firm_profile?.self_reported_acquisition_count,
    null,
  );
  await mutate(registeredBuyer, {
    action: "updateBuyerFirmProfile",
    data: {
      fund_structure: "",
      financing_profile: "",
      revision: await (
        await workspace(registeredBuyer)
      ).buyer_firm_profile!.revision,
      self_reported_acquisition_count: 0,
    },
  });
  assert.equal(
    await (
      await workspace(registeredBuyer)
    ).buyer_firm_profile?.self_reported_acquisition_count,
    0,
  );
});
test("buyer reclassification pauses projects and blocks stale seller match actions", async () => {
  const suffix = Date.now();
  const token = await register({
    name: "Reclassified Buyer",
    company: `Reclassified Capital ${suffix}`,
    email: `reclassified-buyer-${suffix}@example.test`,
    role: "buyer",
    password: "reclassified-profile-password-2026",
  });
  const reclassifiedBuyer = await (await sessionUser(token))!;
  const organization = await (await workspace(reclassifiedBuyer)).organization;
  const sellerToken = await register({
    name: "Registered Seller",
    company: `Registered Seller Co. ${suffix}`,
    email: `registered-seller-${suffix}@example.test`,
    role: "owner",
    password: "reclassified-seller-password-2026",
  });
  const registeredSeller = await (await sessionUser(sellerToken))!;
  const project = await mutate(reclassifiedBuyer, {
    action: "createBuyerProject",
    data: {
      name: `Project Reclassified ${suffix}`,
      status: "active",
      thesis: "Acquire established Ontario business services companies.",
      sectors: ["Business services"],
      provinces: ["Ontario"],
      transaction_type: "full_acquisition",
      ownership_preference: "flexible",
    },
  });
  assert.ok(project.id);
  const deal = await mutate(registeredSeller, {
    action: "createDeal",
    data: {
      title: `Project Reclassification ${suffix}`,
      company_name: `Reclassification Services ${suffix}`,
      sector: "Business services",
      province: "Ontario",
      city: "Toronto",
      revenue: 8000000,
      ebitda: 1500000,
      asking_price: 10000000,
      employees: 24,
      founded: 2010,
      description:
        "An established Ontario business services company with recurring customer relationships.",
      confidential_summary: "Confidential seller summary.",
      transaction_type: "full_acquisition",
      ownership_percentage_available: 100,
      seller_rollover_possible: false,
      seller_financing_possible: false,
      management_transition: "Founder will support a transition.",
      reason_for_transaction: "Planned succession.",
      min_expected_value: 9000000,
      max_expected_value: 11000000,
      distribution_mode: "private_outreach",
      financial_year: 2025,
      gross_profit: 3000000,
      financial_is_projected: false,
    },
  });
  assert.ok(deal.id);
  const match = (await one<{
    id: string;
    eligible: number;
  }>(
    "SELECT id,eligible FROM deal_matches WHERE deal_id=? AND buyer_project_id=?",
    deal.id,
    project.id,
  ))!;
  assert.equal(match.eligible, 1);
  await mutate(registeredSeller, {
    action: "updateDealMatchStatus",
    data: { deal_id: deal.id, match_ids: [match.id], status: "selected" },
  });
  await mutate(registeredSeller, {
    action: "shareTeaser",
    data: {
      deal_id: deal.id,
      match_ids: [match.id],
      subject: "A private Canadian opportunity",
      message: "Please review this private opportunity.",
    },
  });
  await mutate(reclassifiedBuyer, {
    action: "organization",
    data: {
      name: organization.name,
      organization_type: "business",
      website: organization.website,
      province: organization.province,
      description: organization.description,
    },
  });
  const reclassifiedState = await workspace(reclassifiedBuyer);
  assert.equal(reclassifiedState.organization.organization_type, "business");
  assert.equal(reclassifiedState.buyer_firm_profile, undefined);
  assert.deepEqual(reclassifiedState.buyer_projects, []);
  assert.equal(
    (
      await one<{
        status: string;
      }>("SELECT status FROM buyer_projects WHERE id=?", project.id)
    )?.status,
    "paused",
  );
  assert.equal(
    (
      await one<{
        eligible: number;
      }>("SELECT eligible FROM deal_matches WHERE id=?", match.id)
    )?.eligible,
    0,
  );
  assert.equal(
    await (
      await workspace(registeredSeller)
    ).deal_matches?.some(
      (entry) => entry.buyer_organization_id === organization.id,
    ),
    false,
  );
  assert.equal(
    await (
      await workspace(registeredSeller)
    ).deal_outreach.some(
      (entry) => entry.buyer_organization_id === organization.id,
    ),
    true,
    "historical outreach remains available to the deal team",
  );
  await run(
    "UPDATE deal_matches SET eligible=1,status='selected' WHERE id=?",
    match.id,
  );
  await assert.rejects(
    async () =>
      await mutate(registeredSeller, {
        action: "shareTeaser",
        data: {
          deal_id: deal.id,
          match_ids: [match.id],
          subject: "Stale selection",
          message: "This must not be shared.",
        },
      }),
    /eligible selected recommendation/,
  );
  await assert.rejects(
    async () =>
      await mutate(registeredSeller, {
        action: "updateDealMatchStatus",
        data: { deal_id: deal.id, match_ids: [match.id], status: "selected" },
      }),
    /not available for this mandate/,
  );
});
test("buyer firm profile saves reject stale revisions", async () => {
  const suffix = Date.now();
  const token = await register({
    name: "Concurrent Buyer",
    company: `Concurrent Capital ${suffix}`,
    email: `concurrent-buyer-${suffix}@example.test`,
    role: "buyer",
    password: "concurrent-profile-password-2026",
  });
  const concurrentBuyer = await (await sessionUser(token))!;
  const revision = await (
    await workspace(concurrentBuyer)
  ).buyer_firm_profile!.revision;
  await mutate(concurrentBuyer, {
    action: "updateBuyerFirmProfile",
    data: {
      fund_structure: "First owner update",
      financing_profile: "First financing profile",
      revision,
      self_reported_acquisition_count: 1,
    },
  });
  assert.equal(
    await (
      await workspace(concurrentBuyer)
    ).buyer_firm_profile?.revision,
    revision + 1,
  );
  await assert.rejects(
    async () =>
      await mutate(concurrentBuyer, {
        action: "updateBuyerFirmProfile",
        data: {
          fund_structure: "Stale second-client update",
          financing_profile: "Should not overwrite the first client",
          revision,
          self_reported_acquisition_count: 2,
        },
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("changed in another session") &&
      (
        error as {
          status?: number;
        }
      ).status === 409,
  );
  assert.equal(
    await (
      await workspace(concurrentBuyer)
    ).buyer_firm_profile?.fund_structure,
    "First owner update",
  );
});
test("private teaser outreach is isolated to selected buyer organizations and advances interest", async () => {
  const suffix = Date.now();
  const buyerAToken = await register({
    name: "Private Buyer A",
    company: `Private Capital A ${suffix}`,
    email: `private-buyer-a-${suffix}@example.test`,
    role: "buyer",
    password: "private-outreach-password-2026",
  });
  const buyerA = await (await sessionUser(buyerAToken))!;
  const projectA = await mutate(buyerA, {
    action: "createBuyerProject",
    data: {
      name: `Project Private A ${suffix}`,
      status: "active",
      thesis: "Ontario business services platforms.",
      min_revenue: 1000000,
      max_revenue: 20000000,
      sectors: ["Business services"],
      provinces: ["Ontario"],
    },
  });
  const buyerBToken = await register({
    name: "Private Buyer B",
    company: `Private Capital B ${suffix}`,
    email: `private-buyer-b-${suffix}@example.test`,
    role: "buyer",
    password: "private-outreach-password-2026",
  });
  const buyerB = await (await sessionUser(buyerBToken))!;
  const projectB = await mutate(buyerB, {
    action: "createBuyerProject",
    data: {
      name: `Project Private B ${suffix}`,
      status: "active",
      thesis: "Ontario business services platforms.",
      min_revenue: 1000000,
      max_revenue: 20000000,
      sectors: ["Business services"],
      provinces: ["Ontario"],
    },
  });
  const sellerToken = await register({
    name: "Private Seller",
    company: `Private Services ${suffix}`,
    email: `private-seller-${suffix}@example.test`,
    role: "owner",
    password: "private-outreach-password-2026",
  });
  const seller = await (await sessionUser(sellerToken))!;
  const deal = await mutate(seller, {
    action: "createDeal",
    data: {
      title: `Project Private ${suffix}`,
      company_name: `Private Services ${suffix}`,
      sector: "Business services",
      province: "Ontario",
      city: "Toronto",
      revenue: 8000000,
      ebitda: 1300000,
      asking_price: 10000000,
      employees: 28,
      founded: 2010,
      description: "A recurring-revenue Canadian services platform.",
      confidential_summary: "Confidential customer and ownership details.",
      distribution_mode: "private_outreach",
      financial_year: 2025,
    },
  });
  const matchA = (await one<{
    id: string;
  }>(
    "SELECT id FROM deal_matches WHERE deal_id=? AND buyer_project_id=? AND eligible=1",
    deal.id!,
    projectA.id!,
  ))!;
  assert.ok(matchA);
  assert.equal(
    await (await workspace(buyerA)).deals.some((item) => item.id === deal.id),
    false,
  );
  assert.equal(
    await (await workspace(buyerB)).deals.some((item) => item.id === deal.id),
    false,
  );
  await mutate(seller, {
    action: "updateDealMatchStatus",
    data: { deal_id: deal.id, match_ids: [matchA.id], status: "selected" },
  });
  const shared = await mutate(seller, {
    action: "shareTeaser",
    data: {
      deal_id: deal.id,
      match_ids: [matchA.id],
      subject: "Private Canadian acquisition opportunity",
      message: "This business appears to fit your acquisition criteria.",
    },
  });
  assert.ok(shared.id);
  const buyerAState = await workspace(buyerA);
  const teaser = buyerAState.deals.find((item) => item.id === deal.id)!;
  assert.ok(teaser);
  assert.equal(teaser.company_name, "Confidential company");
  assert.equal(teaser.confidential_summary, "");
  assert.equal(buyerAState.deal_outreach.length, 1);
  assert.equal(buyerAState.deal_outreach[0].buyer_project_id, projectA.id);
  assert.equal(
    await (await workspace(buyerB)).deals.some((item) => item.id === deal.id),
    false,
    "an unselected buyer organization must not discover private outreach",
  );
  assert.equal(await (await workspace(buyerB)).deal_outreach.length, 0);
  const recipientId = buyerAState.deal_outreach[0].id;
  await assert.rejects(
    async () =>
      await mutate(buyerB, {
        action: "viewOutreach",
        data: { deal_id: deal.id, recipient_id: recipientId },
      }),
    /not available/i,
  );
  await mutate(buyerA, {
    action: "respondToOutreach",
    data: {
      deal_id: deal.id,
      recipient_id: recipientId,
      response: "interested",
    },
  });
  assert.equal(
    await (
      await workspace(seller)
    ).deal_outreach[0].status,
    "pursued",
  );
  const pursuedFunnel = await (
    await workspace(seller)
  ).buyer_funnels?.find((candidate) => candidate.deal_id === deal.id);
  const buyerAOrganizationId = (await workspace(buyerA)).organization.id;
  const pursuedBuyer = pursuedFunnel?.buyers.find(
    (candidate) => candidate.buyer_organization_id === buyerAOrganizationId,
  );
  assert.ok(pursuedBuyer);
  assert.ok(
    ["teaser_sent", "teaser_viewed", "pursued"].every((eventType) =>
      pursuedBuyer.events.some((event) => event.event_type === eventType),
    ),
  );
  assert.equal(
    await (
      await workspace(buyerA)
    ).buyer_marketplace_analytics?.opportunities_viewed,
    1,
    "responding directly from a sent teaser records the buyer view",
  );
  assert.equal(
    await (
      await workspace(seller)
    ).deal_manager_marketplace_analytics?.find(
      (analytics) => analytics.deal_id === deal.id,
    )?.counts.teaser_views,
    1,
    "seller analytics include the implicit teaser view",
  );
  assert.equal(pursuedBuyer.current_stage, "Interested");
  assert.notEqual(pursuedFunnel?.metrics.average_response_hours, null);
  assert.equal(
    await (
      await workspace(buyerA)
    ).access.find((item) => item.deal_id === deal.id)?.status,
    "requested",
  );
  assert.equal(
    await (await workspace(buyerA)).deals.find((item) => item.id === deal.id)
      ?.has_access,
    false,
    "interest must not bypass NDA and deal-team approval",
  );
  await assert.rejects(
    async () =>
      await mutate(buyerA, {
        action: "respondToOutreach",
        data: {
          deal_id: deal.id,
          recipient_id: recipientId,
          response: "pass",
        },
      }),
    /final response/i,
  );
  await mutate(seller, {
    action: "updateDealMatchStatus",
    data: { deal_id: deal.id, match_ids: [matchA.id], status: "selected" },
  });
  await assert.rejects(
    async () =>
      await mutate(seller, {
        action: "shareTeaser",
        data: {
          deal_id: deal.id,
          match_ids: [matchA.id],
          subject: "Duplicate outreach",
          message: "This project already received the opportunity.",
        },
      }),
    /already received/i,
  );
  const matchB = (await one<{
    id: string;
  }>(
    "SELECT id FROM deal_matches WHERE deal_id=? AND buyer_project_id=? AND eligible=1",
    deal.id!,
    projectB.id!,
  ))!;
  await mutate(seller, {
    action: "updateDealMatchStatus",
    data: { deal_id: deal.id, match_ids: [matchB.id], status: "selected" },
  });
  await mutate(seller, {
    action: "shareTeaser",
    data: {
      deal_id: deal.id,
      match_ids: [matchB.id],
      subject: "Private Canadian acquisition opportunity",
      message: "This business appears to fit your acquisition criteria.",
    },
  });
  const buyerBRecipient = await (
    await workspace(buyerB)
  ).deal_outreach.find((item) => item.buyer_project_id === projectB.id)!;
  assert.ok(buyerBRecipient);
  await mutate(buyerB, {
    action: "respondToOutreach",
    data: {
      deal_id: deal.id,
      recipient_id: buyerBRecipient.id,
      response: "pass",
    },
  });
  assert.equal(
    await (
      await workspace(seller)
    ).deal_outreach.find((item) => item.id === buyerBRecipient.id)?.status,
    "passed",
  );
  assert.equal(
    await (
      await workspace(buyerB)
    ).access.some((item) => item.deal_id === deal.id),
    false,
    "passing must not create a transaction access relationship",
  );
});
test("Qualified Discovery requires an eligible project and seller-approved introduction", async () => {
  const suffix = Date.now();
  const password = "qualified-discovery-password-2026";
  const buyerToken = await register({
    name: "Qualified Buyer",
    company: `Qualified Capital ${suffix}`,
    email: `qualified-buyer-${suffix}@example.test`,
    role: "buyer",
    password,
  });
  const qualifiedBuyer = await (await sessionUser(buyerToken))!;
  const project = await mutate(qualifiedBuyer, {
    action: "createBuyerProject",
    data: {
      name: `Project Discovery ${suffix}`,
      status: "active",
      thesis:
        "Acquire majority positions in profitable Ontario technology platforms with recurring revenue.",
      min_revenue: 4000000,
      max_revenue: 12000000,
      min_ebitda: 750000,
      max_ebitda: 3000000,
      min_enterprise_value: 7000000,
      max_enterprise_value: 18000000,
      ownership_preference: "majority",
      transaction_type: "majority_acquisition",
      sectors: ["Technology"],
      provinces: ["Ontario"],
      keywords: ["recurring revenue"],
    },
  });
  const lowMatchToken = await register({
    name: "Unmatched Buyer",
    company: `Unmatched Capital ${suffix}`,
    email: `unmatched-buyer-${suffix}@example.test`,
    role: "buyer",
    password,
  });
  const unmatchedBuyer = await (await sessionUser(lowMatchToken))!;
  await mutate(unmatchedBuyer, {
    action: "createBuyerProject",
    data: {
      name: `Project Pacific ${suffix}`,
      status: "active",
      thesis: "Minority investments in small British Columbia retailers.",
      min_revenue: 100000,
      max_revenue: 500000,
      min_ebitda: 0,
      max_ebitda: 50000,
      min_enterprise_value: 100000,
      max_enterprise_value: 600000,
      ownership_preference: "minority",
      transaction_type: "minority_investment",
      sectors: ["Consumer & retail"],
      provinces: ["British Columbia"],
      keywords: ["retail"],
    },
  });
  const verificationReviewerEmail = `verification-reviewer-${suffix}@example.test`;
  const verificationReviewerId = await (await sessionUser(
    await register({
      name: "Registered Verification Reviewer",
      company: `Platform Operations ${suffix}`,
      email: verificationReviewerEmail,
      password: "verification-reviewer-password-2026",
      role: "advisor",
    }),
  ))!.id;
  process.env.ADMIN_EMAILS = verificationReviewerEmail;
  await run(
    "UPDATE users SET is_platform_admin=1 WHERE id=?",
    verificationReviewerId,
  );
  const verificationReviewer = (await one<User>(
    "SELECT * FROM users WHERE id=?",
    verificationReviewerId,
  ))!;
  const verifyBuyer = async (
    candidate: User,
    name: string,
    website: string,
  ) => {
    const existingIdentity = (await workspace(candidate))
      .buyer_identity_verification;
    if (existingIdentity?.status !== "approved") {
      await mutate(candidate, {
        action: "submitBuyerIdentityVerification",
        data: {
          buyer_type: "private_equity_firm",
          linkedin_url: null,
          website_url: website,
          source_of_capital: "committed_investment_fund",
          equity_range: "2_5m_5m",
          completed_acquisitions: 3,
          experience_summary:
            "Canadian acquisition and operating experience across established technology businesses.",
          acquisition_strategy:
            "Acquire durable Canadian software companies with recurring revenue and experienced management teams.",
          authorized_to_represent: true,
        },
      });
      const identityVerification = (await workspace(candidate))
        .buyer_identity_verification;
      assert.ok(identityVerification);
      assert.equal(
        await reviewBuyerIdentityVerification(
          verificationReviewer,
          identityVerification.id,
          "approved",
          "Buyer identity and profile reviewed for test access.",
        ),
        true,
      );
    }
    await mutate(candidate, {
      action: "updateBuyerVerificationProfile",
      data: {
        legal_name: name,
        website,
        buyer_type: "private_equity",
        principals: "Avery Morgan, Managing Partner",
        acquisition_history:
          "Completed Canadian acquisitions with operating oversight.",
        capital_source: "Committed private investment capital.",
        min_equity_check: 1000000,
        max_equity_check: 20000000,
        financing_approach: "Equity capital with senior acquisition financing.",
      },
    });
    await mutate(candidate, { action: "submitBuyerVerification", data: {} });
    const submissionRevision = await (
      await workspace(candidate)
    ).buyer_verification_profile?.submission_revision;
    await mutate(verificationReviewer, {
      action: "reviewBuyerVerification",
      data: {
        organization_id: await (await workspace(candidate)).organization.id,
        submission_revision: submissionRevision,
        decision: "firm_verified",
        notes: "Firm identity reviewed for Qualified Discovery testing.",
      },
    });
  };
  await verifyBuyer(
    qualifiedBuyer,
    `Qualified Capital ${suffix} Inc.`,
    `https://qualified-${suffix}.example.test`,
  );
  await verifyBuyer(
    unmatchedBuyer,
    `Unmatched Capital ${suffix} Inc.`,
    `https://unmatched-${suffix}.example.test`,
  );
  const sellerToken = await register({
    name: "Discovery Seller",
    company: `Discovery Software ${suffix}`,
    email: `discovery-seller-${suffix}@example.test`,
    role: "owner",
    password,
  });
  const seller = await (await sessionUser(sellerToken))!;
  const createDiscoveryDeal = async (title: string) => {
    const result = await mutate(seller, {
      action: "createDeal",
      data: {
        title,
        company_name: `Discovery Software ${suffix}`,
        sector: "Technology",
        province: "Ontario",
        city: "Toronto",
        revenue: 8000000,
        ebitda: 1600000,
        asking_price: 12000000,
        employees: 34,
        founded: 2012,
        description:
          "A profitable vertical software platform with recurring revenue and durable Canadian customers.",
        confidential_summary:
          "The company name, customer list, and owner identity are confidential.",
        transaction_type: "majority_acquisition",
        ownership_percentage_available: 80,
        seller_rollover_possible: true,
        seller_financing_possible: false,
        management_transition: "Founder available for a transition period.",
        reason_for_transaction: "Planned succession.",
        min_expected_value: 10000000,
        max_expected_value: 14000000,
        distribution_mode: "qualified_discovery",
        financial_year: 2025,
        gross_profit: 5000000,
        financial_is_projected: false,
      },
    });
    await mutate(seller, {
      action: "updateDeal",
      data: {
        deal_id: result.id,
        stage: "On market",
        published: true,
        distribution_mode: "qualified_discovery",
      },
    });
    return result.id!;
  };
  const declinedDealId = await createDiscoveryDeal(
    `Project Qualified Discovery ${suffix}`,
  );
  const discovery = await (
    await workspace(qualifiedBuyer)
  ).deals.find((deal) => deal.id === declinedDealId);
  assert.ok(discovery);
  assert.equal(discovery.matched_project_id, project.id);
  assert.equal(discovery.matched_project_name, `Project Discovery ${suffix}`);
  assert.ok((discovery.match_score || 0) >= 70);
  assert.ok(discovery.match_reasons?.includes("industry"));
  assert.equal(discovery.company_name, "Confidential company");
  assert.equal(discovery.owner_id, "");
  assert.equal(
    await (
      await workspace(unmatchedBuyer)
    ).deals.some((deal) => deal.id === declinedDealId),
    false,
    "buyers below the configured threshold cannot enumerate the deal",
  );
  await assert.rejects(
    async () =>
      await mutate(qualifiedBuyer, {
        action: "requestAccess",
        data: { deal_id: declinedDealId },
      }),
    /matched introduction request/,
  );
  const message =
    "We operate two Canadian software platforms and have committed equity for a majority acquisition.";
  let request = await mutate(qualifiedBuyer, {
    action: "requestIntroduction",
    data: {
      deal_id: declinedDealId,
      buyer_project_id: project.id,
      message,
    },
  });
  let sellerRequest = await (
    await workspace(seller)
  ).introduction_requests.find((candidate) => candidate.id === request.id);
  assert.ok(sellerRequest);
  assert.equal(sellerRequest.message, message);
  assert.equal(sellerRequest.status, "pending");
  assert.equal(sellerRequest.match_score, discovery.match_score);
  assert.equal(
    await (
      await workspace(unmatchedBuyer)
    ).introduction_requests.some((candidate) => candidate.id === request.id),
    false,
  );
  await mutate(qualifiedBuyer, {
    action: "withdrawIntroduction",
    data: {
      deal_id: declinedDealId,
      introduction_request_id: request.id,
    },
  });
  assert.equal(
    await (
      await workspace(qualifiedBuyer)
    ).introduction_requests.find((candidate) => candidate.id === request.id)
      ?.status,
    "withdrawn",
  );
  request = await mutate(qualifiedBuyer, {
    action: "requestIntroduction",
    data: {
      deal_id: declinedDealId,
      buyer_project_id: project.id,
      message,
    },
  });
  sellerRequest = await (
    await workspace(seller)
  ).introduction_requests.find((candidate) => candidate.id === request.id);
  assert.equal(sellerRequest?.status, "pending");
  await mutate(seller, {
    action: "reviewIntroduction",
    data: {
      deal_id: declinedDealId,
      introduction_request_id: request.id,
      status: "declined",
    },
  });
  assert.equal(
    await (
      await workspace(qualifiedBuyer)
    ).introduction_requests.find((candidate) => candidate.id === request.id)
      ?.status,
    "declined",
  );
  await assert.rejects(
    async () =>
      await mutate(qualifiedBuyer, {
        action: "requestIntroduction",
        data: {
          deal_id: declinedDealId,
          buyer_project_id: project.id,
          message,
        },
      }),
    /declined/,
    "a declined organization cannot retry around the seller decision",
  );
  assert.equal(await membership(declinedDealId, qualifiedBuyer.id), undefined);
  const approvedDealId = await createDiscoveryDeal(
    `Project Approved Discovery ${suffix}`,
  );
  const approvedRequest = await mutate(qualifiedBuyer, {
    action: "requestIntroduction",
    data: {
      deal_id: approvedDealId,
      buyer_project_id: project.id,
      message,
    },
  });
  const approvedRequestCountBeforeDowngrade = await (
    await workspace(seller)
  ).introduction_requests.filter(
    (candidate) => candidate.deal_id === approvedDealId,
  ).length;
  await mutate(qualifiedBuyer, {
    action: "updateBuyerVerificationProfile",
    data: {
      legal_name: `Qualified Capital ${suffix} Inc.`,
      website: `https://qualified-downgraded-${suffix}.example.test`,
      buyer_type: "private_equity",
      principals: "Avery Morgan, Managing Partner",
      acquisition_history:
        "Completed Canadian acquisitions with operating oversight.",
      capital_source: "Committed private investment capital.",
      min_equity_check: 1000000,
      max_equity_check: 20000000,
      financing_approach: "Equity capital with senior acquisition financing.",
    },
  });
  assert.equal(
    await (
      await workspace(qualifiedBuyer)
    ).organization.verification_status,
    "unverified",
  );
  await assert.rejects(
    async () =>
      await mutate(qualifiedBuyer, {
        action: "requestIntroduction",
        data: {
          deal_id: approvedDealId,
          buyer_project_id: project.id,
          message,
        },
      }),
    /not reached|required/i,
  );
  assert.equal(
    await (
      await workspace(seller)
    ).introduction_requests.filter(
      (candidate) => candidate.deal_id === approvedDealId,
    ).length,
    approvedRequestCountBeforeDowngrade,
    "a downgraded buyer cannot create a new introduction request",
  );
  assert.equal(await membership(approvedDealId, qualifiedBuyer.id), undefined);
  await assert.rejects(
    async () =>
      await mutate(seller, {
        action: "reviewIntroduction",
        data: {
          deal_id: approvedDealId,
          introduction_request_id: approvedRequest.id,
          status: "approved",
        },
      }),
    /no longer meets|required/i,
  );
  assert.equal(
    await membership(approvedDealId, qualifiedBuyer.id),
    undefined,
    "approval after downgrade must not grant access",
  );
  await verifyBuyer(
    qualifiedBuyer,
    `Qualified Capital ${suffix} Inc.`,
    `https://qualified-restored-${suffix}.example.test`,
  );
  await mutate(seller, {
    action: "reviewIntroduction",
    data: {
      deal_id: approvedDealId,
      introduction_request_id: approvedRequest.id,
      status: "approved",
    },
  });
  assert.equal(
    await (
      await membership(approvedDealId, qualifiedBuyer.id)
    )?.status,
    "requested",
  );
  const approvedTeaser = await (
    await workspace(qualifiedBuyer)
  ).deals.find((deal) => deal.id === approvedDealId)!;
  assert.equal(approvedTeaser.company_name, "Confidential company");
  assert.equal(approvedTeaser.has_access, false);
  assert.equal(
    await (
      await workspace(qualifiedBuyer)
    ).introduction_requests.find(
      (candidate) => candidate.id === approvedRequest.id,
    )?.status,
    "approved",
  );
  const approvedFunnel = await (
    await workspace(seller)
  ).buyer_funnels?.find((candidate) => candidate.deal_id === approvedDealId);
  const qualifiedBuyerOrganizationId = (await workspace(qualifiedBuyer))
    .organization.id;
  const introducedBuyer = approvedFunnel?.buyers.find(
    (candidate) =>
      candidate.buyer_organization_id === qualifiedBuyerOrganizationId,
  );
  assert.ok(introducedBuyer);
  assert.ok(
    introducedBuyer.events.some(
      (event) => event.event_type === "intro_requested",
    ),
  );
  assert.ok(
    introducedBuyer.events.some(
      (event) => event.event_type === "intro_approved",
    ),
  );
  assert.equal(introducedBuyer.current_stage, "Interested");
});
test("deal managers receive an event-backed buyer funnel without exposing it to buyers", async () => {
  const ownerState = await workspace(owner);
  const cedarFunnel = ownerState.buyer_funnels?.find(
    (funnel) => funnel.deal_id === "cedar",
  );
  assert.ok(cedarFunnel);
  assert.ok(cedarFunnel.metrics.stage_counts.Recommended > 0);
  assert.ok(cedarFunnel.metrics.stage_counts.NDA > 0);
  assert.ok(
    cedarFunnel.metrics.stage_counts.Recommended >=
      cedarFunnel.metrics.stage_counts.Contacted,
  );
  const evergreen = cedarFunnel.buyers.find(
    (entry) => entry.buyer_organization_id === "org-demo-buyer",
  );
  assert.ok(evergreen);
  assert.ok(evergreen.events.some((event) => event.event_type === "matched"));
  assert.ok(
    evergreen.events.some((event) => event.event_type === "nda_approved"),
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      await workspace(buyer),
      "buyer_funnels",
    ),
    false,
  );
  await mutate(owner, {
    action: "recordBuyerFunnelEvent",
    data: {
      deal_id: "cedar",
      buyer_organization_id: "org-demo-buyer",
      buyer_project_id: evergreen.buyer_project_id,
      event_type: "ioi_received",
    },
  });
  const updated = await (
    await workspace(owner)
  ).buyer_funnels?.find((funnel) => funnel.deal_id === "cedar");
  assert.equal(
    updated?.buyers.find(
      (entry) => entry.buyer_organization_id === "org-demo-buyer",
    )?.current_stage,
    "IOI",
  );
  assert.equal(updated?.metrics.stage_counts.IOI, 1);
  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "recordBuyerFunnelEvent",
        data: {
          deal_id: "cedar",
          buyer_organization_id: "org-demo-buyer",
          event_type: "closed",
        },
      }),
    /deal-team|manage/,
  );
});
test("transaction attribution is manager-only, revisioned, and records closing value separately from workflow", async () => {
  const ownerState = await workspace(owner);
  const attribution = ownerState.transaction_attributions?.find(
    (entry) =>
      entry.deal_id === "cedar" &&
      entry.buyer_organization_id === "org-demo-buyer",
  );
  assert.ok(attribution);
  assert.equal(attribution.source, "seller_invitation");
  assert.equal(attribution.introduced_by_acquire, false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      await workspace(buyer),
      "transaction_attributions",
    ),
    false,
  );
  await mutate(owner, {
    action: "upsertTransactionAttribution",
    data: {
      deal_id: "cedar",
      buyer_organization_id: "org-demo-buyer",
      source: "external_relationship",
      introduction_date: "2025-01-15",
      closed_date: "",
      enterprise_value: "",
      revision: attribution.revision,
    },
  });
  const corrected = await (
    await workspace(owner)
  ).transaction_attributions?.find(
    (entry) =>
      entry.deal_id === "cedar" &&
      entry.buyer_organization_id === "org-demo-buyer",
  );
  assert.equal(corrected?.introduced_by_acquire, false);
  assert.equal(corrected?.source, "external_relationship");
  await assert.rejects(
    async () =>
      await mutate(owner, {
        action: "upsertTransactionAttribution",
        data: {
          deal_id: "cedar",
          buyer_organization_id: "org-demo-buyer",
          source: "external_relationship",
          introduction_date: "2025-01-15",
          closed_date: "2026-01-15",
          enterprise_value: "",
          revision: corrected?.revision,
        },
      }),
    /recorded together/,
  );
  await assert.rejects(
    async () =>
      await mutate(owner, {
        action: "upsertTransactionAttribution",
        data: {
          deal_id: "cedar",
          buyer_organization_id: "org-demo-buyer",
          source: "external_relationship",
          introduction_date: "2025-01-15",
          closed_date: "2026-01-15",
          enterprise_value: 12500000,
          revision: corrected?.revision,
        },
      }),
    /Closed buyer-funnel milestone/,
  );
  await mutate(owner, {
    action: "recordBuyerFunnelEvent",
    data: {
      deal_id: "cedar",
      buyer_organization_id: "org-demo-buyer",
      event_type: "closed",
    },
  });
  await mutate(owner, {
    action: "upsertTransactionAttribution",
    data: {
      deal_id: "cedar",
      buyer_organization_id: "org-demo-buyer",
      source: "external_relationship",
      introduction_date: "2025-01-15",
      closed_date: "",
      enterprise_value: "",
      revision: corrected?.revision,
    },
  });
  const correctedAfterClose = await (
    await workspace(owner)
  ).transaction_attributions?.find(
    (entry) =>
      entry.deal_id === "cedar" &&
      entry.buyer_organization_id === "org-demo-buyer",
  );
  assert.equal(correctedAfterClose?.closed_date, null);
  assert.equal(correctedAfterClose?.enterprise_value, null);
  await mutate(owner, {
    action: "upsertTransactionAttribution",
    data: {
      deal_id: "cedar",
      buyer_organization_id: "org-demo-buyer",
      source: "external_relationship",
      introduction_date: "2025-01-15",
      closed_date: "2026-01-15",
      enterprise_value: 12500000,
      revision: correctedAfterClose?.revision,
    },
  });
  const closed = await (
    await workspace(owner)
  ).transaction_attributions?.find(
    (entry) =>
      entry.deal_id === "cedar" &&
      entry.buyer_organization_id === "org-demo-buyer",
  );
  assert.equal(closed?.closed_date, "2026-01-15");
  assert.equal(closed?.enterprise_value, 12500000);
  assert.equal(closed?.revision, (correctedAfterClose?.revision ?? 0) + 1);
  await assert.rejects(
    async () =>
      await mutate(owner, {
        action: "upsertTransactionAttribution",
        data: {
          deal_id: "cedar",
          buyer_organization_id: "org-demo-buyer",
          source: "acquire_match",
          introduction_date: "2025-01-15",
          closed_date: "2026-01-15",
          enterprise_value: 12500000,
          revision: corrected?.revision,
        },
      }),
    /changed in another session/,
  );
  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "upsertTransactionAttribution",
        data: {
          deal_id: "cedar",
          buyer_organization_id: "org-demo-buyer",
          source: "acquire_match",
          introduction_date: "2025-01-15",
          closed_date: "2026-01-15",
          enterprise_value: 12500000,
          revision: closed?.revision,
        },
      }),
    /deal-team|manage/,
  );
  await mutate(owner, {
    action: "inviteBuyer",
    data: { deal_id: "harbour", email: otherBuyer.email },
  });
  const directInvitation = await (
    await workspace(owner)
  ).transaction_attributions?.find(
    (entry) =>
      entry.deal_id === "harbour" &&
      entry.buyer_organization_id === "org-demo-buyer-2",
  );
  assert.equal(directInvitation?.source, "seller_invitation");
  assert.equal(directInvitation?.introduced_by_acquire, false);
});
test("internal deal notes stay inside the seller-side team", async () => {
  const body = "Strong interest, but financing confirmation is still required.";
  const result = await mutate(owner, {
    action: "createInternalNote",
    data: { deal_id: "cedar", body },
  });
  assert.ok(result.id);
  const ownerNote = await (
    await workspace(owner)
  ).deal_internal_notes?.find((note) => note.id === result.id);
  const advisorNote = await (
    await workspace(advisor)
  ).deal_internal_notes?.find((note) => note.id === result.id);
  assert.equal(ownerNote?.body, body);
  assert.equal(ownerNote?.author_name, owner.name);
  assert.equal(advisorNote?.body, body);
  const buyerState = await workspace(buyer);
  assert.equal(
    Object.prototype.hasOwnProperty.call(buyerState, "deal_internal_notes"),
    false,
  );
  assert.doesNotMatch(JSON.stringify(buyerState), new RegExp(body));
  const unrelatedAdvisor = (await one<User>(
    "SELECT * FROM users WHERE id='demo-advisor-2'",
  ))!;
  assert.equal(
    (await (
      await workspace(unrelatedAdvisor)
    ).deal_internal_notes?.some((note) => note.id === result.id)) ?? false,
    false,
  );
  await assert.rejects(
    async () =>
      await mutate(unrelatedAdvisor, {
        action: "createInternalNote",
        data: { deal_id: "cedar", body: "Should not be saved." },
      }),
    /deal-team|manage|not found/i,
  );
  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "createInternalNote",
        data: { deal_id: "cedar", body: "Buyer-only attempt." },
      }),
    /deal-team|manage/i,
  );
  const viewerToken = await register({
    name: "Cedar Note Viewer",
    company: "Temporary Viewer Firm",
    email: "cedar-note-viewer@example.test",
    role: "owner",
    password: "internal-notes-password-2026",
  });
  const viewer = await (await sessionUser(viewerToken))!;
  const viewerOrganization = (await one<{
    id: string;
  }>(
    "SELECT organization_id id FROM organization_members WHERE user_id=?",
    viewer.id,
  ))!;
  await run("DELETE FROM organization_members WHERE user_id=?", viewer.id);
  await run("DELETE FROM organizations WHERE id=?", viewerOrganization.id);
  await run("UPDATE users SET is_demo=1 WHERE id=?", viewer.id);
  await run(
    "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'viewer','active')",
    `membership-${viewer.id}-cedar-notes`,
    "org-demo-owner",
    viewer.id,
  );
  const demoViewer = (await one<User>(
    "SELECT * FROM users WHERE id=?",
    viewer.id,
  ))!;
  assert.equal(
    await (
      await workspace(demoViewer)
    ).deal_internal_notes?.some((note) => note.id === result.id),
    true,
  );
  await assert.rejects(
    async () =>
      await mutate(demoViewer, {
        action: "createInternalNote",
        data: { deal_id: "cedar", body: "Viewer cannot add notes." },
      }),
    /deal-team|manage/i,
  );
  await assert.rejects(
    async () =>
      await mutate(owner, {
        action: "createInternalNote",
        data: { deal_id: "cedar", body: "   " },
      }),
    /characters|invalid/i,
  );
  await assert.rejects(
    async () =>
      await mutate(owner, {
        action: "createInternalNote",
        data: { deal_id: "cedar", body: "x".repeat(5001) },
      }),
    /characters|invalid/i,
  );
});
test("notifications stay user-scoped while email preferences control only outbox delivery", async () => {
  await run("DELETE FROM email_outbox");
  await run("DELETE FROM notifications");
  await run("DELETE FROM notification_preferences");
  await mutate(buyer, {
    action: "message",
    data: {
      deal_id: "cedar",
      buyer_id: buyer.id,
      body: "Can we confirm the management-call agenda?",
    },
  });
  const ownerNotification = await (
    await workspace(owner)
  ).notifications.find(
    (notification) =>
      notification.type === "new_message" &&
      notification.body.includes("management-call agenda"),
  );
  assert.ok(ownerNotification);
  assert.equal(ownerNotification.read_at, null);
  assert.equal(
    await (
      await workspace(otherBuyer)
    ).notifications.some(
      (notification) => notification.id === ownerNotification.id,
    ),
    false,
  );
  assert.equal(
    (
      await one<{
        status: string;
      }>(
        "SELECT status FROM email_outbox WHERE notification_id=?",
        ownerNotification.id,
      )
    )?.status,
    "recorded",
  );
  await assert.rejects(
    async () =>
      await mutate(otherBuyer, {
        action: "setNotificationRead",
        data: { notification_id: ownerNotification.id, read: true },
      }),
    /notification/i,
  );
  await mutate(owner, {
    action: "setNotificationRead",
    data: { notification_id: ownerNotification.id, read: true },
  });
  assert.ok(
    await (
      await workspace(owner)
    ).notifications.find(
      (notification) => notification.id === ownerNotification.id,
    )?.read_at,
  );
  await mutate(owner, {
    action: "setNotificationRead",
    data: { notification_id: ownerNotification.id, read: false },
  });
  assert.equal(
    await (
      await workspace(owner)
    ).notifications.find(
      (notification) => notification.id === ownerNotification.id,
    )?.read_at,
    null,
  );
  await mutate(owner, {
    action: "notificationPreferences",
    data: {
      preferences: {
        new_message: "disabled",
        new_task: "daily_digest",
      },
    },
  });
  assert.equal(
    await (
      await workspace(owner)
    ).notification_preferences.new_message,
    "disabled",
  );
  const outboxBefore = (await one<{
    count: number;
  }>("SELECT COUNT(*) count FROM email_outbox WHERE user_id=?", owner.id))!
    .count;
  await mutate(buyer, {
    action: "message",
    data: {
      deal_id: "cedar",
      buyer_id: buyer.id,
      body: "A second message should remain in-app only for Jamie.",
    },
  });
  assert.equal(
    (await one<{
      count: number;
    }>("SELECT COUNT(*) count FROM email_outbox WHERE user_id=?", owner.id))!
      .count,
    outboxBefore,
  );
  assert.ok(
    await (
      await workspace(owner)
    ).notifications.some((notification) =>
      notification.body.includes("second message"),
    ),
  );
});
