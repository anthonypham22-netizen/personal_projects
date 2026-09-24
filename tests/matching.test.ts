import test from "node:test";
import assert from "node:assert/strict";
import { MATCH_WEIGHTS, matchDealToBuyerProject } from "../src/lib/matching";
import type { BuyerProject, Deal } from "../src/lib/types";

const deal: Deal = {
  id: "deal-1",
  title: "Project Signal",
  company_name: "Signal Software Inc.",
  sector: "Technology",
  province: "Ontario",
  city: "Toronto",
  revenue: 8_000_000,
  ebitda: 1_600_000,
  asking_price: 12_000_000,
  employees: 30,
  founded: 2012,
  description: "Vertical SaaS with recurring revenue and durable contracts.",
  confidential_summary: "Profitable founder-owned platform.",
  transaction_type: "majority_acquisition",
  ownership_percentage_available: 80,
  seller_rollover_possible: 1,
  seller_financing_possible: 0,
  management_transition: "Founder will transition.",
  reason_for_transaction: "Succession",
  min_expected_value: 10_000_000,
  max_expected_value: 14_000_000,
  distribution_mode: "private_outreach",
  owner_id: "owner-1",
  advisor_id: null,
  owner_organization_id: "seller-org",
  advisor_organization_id: null,
  created_by_user_id: "owner-1",
  stage: "marketed",
  published: 1,
  created_at: "2026-01-01 00:00:00",
};

const project: BuyerProject = {
  id: "project-1",
  organization_id: "buyer-org",
  created_by_user_id: "buyer-1",
  name: "Project North",
  status: "active",
  thesis: "Canadian vertical SaaS with recurring revenue.",
  min_revenue: 5_000_000,
  max_revenue: 20_000_000,
  min_ebitda: 1_000_000,
  max_ebitda: 5_000_000,
  min_ebitda_margin: 10,
  max_ebitda_margin: 30,
  min_enterprise_value: 8_000_000,
  max_enterprise_value: 18_000_000,
  min_equity_check: null,
  max_equity_check: null,
  ownership_preference: "majority",
  transaction_type: "majority_acquisition",
  created_at: "2026-01-01 00:00:00",
  updated_at: "2026-01-01 00:00:00",
  sectors: ["Technology"],
  provinces: ["Ontario"],
  keywords: ["recurring revenue"],
  can_manage: true,
};

const reason = (
  result: ReturnType<typeof matchDealToBuyerProject>,
  dimension: string,
) => result.reasons.find((item) => item.dimension === dimension)!;

test("matching weights are centralized and total 100", () => {
  assert.equal(
    Object.values(MATCH_WEIGHTS).reduce((sum, value) => sum + value, 0),
    100,
  );
});

test("a fully aligned active mandate earns a perfect explainable match", () => {
  const result = matchDealToBuyerProject(deal, project, {
    buyerVerificationStatus: "verified",
  });
  assert.equal(result.score, 100);
  assert.equal(result.eligible, true);
  assert.equal(
    result.reasons.reduce((sum, item) => sum + item.maximum, 0),
    100,
  );
  assert.equal(
    result.reasons.reduce((sum, item) => sum + item.score, 0),
    100,
  );
  assert.deepEqual(result.hard_exclusions, []);
  assert.ok(result.reasons.every((item) => item.explanation.length > 0));
});

test("ordinary mandate mismatches lower dimensions without excluding the buyer", () => {
  const result = matchDealToBuyerProject(
    {
      ...deal,
      sector: "Manufacturing",
      province: "Alberta",
      revenue: 30_000_000,
      ebitda: 500_000,
    },
    project,
  );
  assert.equal(result.eligible, true);
  assert.equal(reason(result, "industry").score, 0);
  assert.equal(reason(result, "geography").score, 0);
  assert.equal(reason(result, "revenue").score, 0);
  assert.equal(reason(result, "ebitda").score, 0);
  assert.ok(result.score < 45);
});

test("inactive mandates and same-organization deals are hard exclusions", () => {
  const inactive = matchDealToBuyerProject(deal, {
    ...project,
    status: "paused",
  });
  assert.equal(inactive.eligible, false);
  assert.match(inactive.hard_exclusions.join(" "), /active/i);

  const sameOrganization = matchDealToBuyerProject(deal, {
    ...project,
    organization_id: "seller-org",
  });
  assert.equal(sameOrganization.eligible, false);
  assert.match(
    sameOrganization.hard_exclusions.join(" "),
    /same organization/i,
  );
});

test("closed, blocked, excluded, and unverified discovery matches are ineligible", () => {
  const closed = matchDealToBuyerProject({ ...deal, stage: "closed" }, project);
  assert.equal(closed.eligible, false);

  const blocked = matchDealToBuyerProject(deal, project, {
    buyerExplicitlyBlocked: true,
  });
  assert.equal(blocked.eligible, false);

  const excluded = matchDealToBuyerProject(deal, project, {
    sellerExcluded: true,
  });
  assert.equal(excluded.eligible, false);

  const unverified = matchDealToBuyerProject(
    { ...deal, distribution_mode: "qualified_discovery" },
    project,
    {
      buyerVerificationStatus: "unverified",
      requiresDiscoveryVerification: true,
    },
  );
  assert.equal(unverified.eligible, false);
  assert.match(unverified.hard_exclusions.join(" "), /verified/i);

  const crossEnvironment = matchDealToBuyerProject(deal, project, {
    marketplaceEnvironmentsMatch: false,
  });
  assert.equal(crossEnvironment.eligible, false);
});
