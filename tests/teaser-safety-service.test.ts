import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, one } from "../src/lib/db";
import { getDeal, mutate, workspace } from "../src/lib/service";
import { teaserSafetyReviewInputDigest } from "../src/lib/teaser-safety";
import type { Deal, User } from "../src/lib/types";

let directory: string;
let owner: User;
let buyer: User;

before(() => {
  directory = mkdtempSync(path.join(tmpdir(), "succera-teaser-safety-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  db();
  owner = one<User>("SELECT * FROM users WHERE id='demo-owner'")!;
  buyer = one<User>("SELECT * FROM users WHERE id='demo-buyer'")!;
});

after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});

const reviewInputDigest = (deal: Deal) => {
  const historicalFinancialPeriods = (
    db()
      .prepare(
        `SELECT COUNT(*) count FROM deal_financials
         WHERE deal_id=? AND is_projected=0`,
      )
      .get(deal.id) as { count: number }
  ).count;
  return teaserSafetyReviewInputDigest({
    companyName: deal.company_name,
    sector: deal.sector,
    province: deal.province,
    city: deal.city,
    revenue: deal.revenue,
    ebitda: deal.ebitda,
    askingPrice: deal.asking_price,
    employees: deal.employees,
    founded: deal.founded,
    transactionType: deal.transaction_type,
    ownershipPercentageAvailable: deal.ownership_percentage_available,
    sellerRolloverPossible: Boolean(deal.seller_rollover_possible),
    description: deal.description,
    historicalFinancialPeriods,
  });
};

const insertReview = (dealId: string, suggestion: string) => {
  const id = randomUUID();
  const deal = getDeal(dealId);
  db()
    .prepare(
      `INSERT INTO teaser_safety_reviews(
        id,deal_id,requested_by_user_id,provider,provider_name,
        external_data_processing,input_sha256,status,findings_json,
        suggested_teaser,investment_highlights_json,missing_financials_json
      ) VALUES(?,?,?,'development','Local development safety assistant',0,?,
        'attention','[]',?,'[]','[]')`,
    )
    .run(id, dealId, owner.id, reviewInputDigest(deal), suggestion);
  return id;
};

test("only the deal team can inspect and explicitly apply a current private teaser suggestion", () => {
  const created = mutate(owner, {
    action: "createDeal",
    data: {
      title: "Project Safety",
      company_name: "Private Safety Company Inc.",
      sector: "Business services",
      province: "Ontario",
      city: "Toronto",
      revenue: 4_800_000,
      ebitda: 850_000,
      asking_price: 6_000_000,
      employees: 28,
      founded: 2013,
      description:
        "A private Canadian business services company with recurring contracts.",
      confidential_summary: "Restricted operating details.",
      financial_year: 2025,
    },
  });
  const deal = getDeal(created.id!);
  const suggestion =
    "An established Canadian business services company with repeat customer relationships and a diversified client base.";
  insertReview(deal.id, "An earlier anonymized draft.");
  const reviewId = insertReview(deal.id, suggestion);

  const ownerState = workspace(owner);
  const visibleReviews = ownerState.teaser_safety_reviews?.filter(
    (review) => review.deal_id === deal.id,
  );
  assert.equal(visibleReviews?.length, 1);
  assert.equal(visibleReviews?.[0]?.id, reviewId);
  assert.equal(visibleReviews?.[0]?.review_count, 2);
  assert.equal(workspace(buyer).teaser_safety_reviews, undefined);
  assert.throws(
    () =>
      mutate(buyer, {
        action: "applyTeaserSafetySuggestion",
        data: { deal_id: deal.id, review_id: reviewId },
      }),
    /authorized deal-team member/,
  );

  mutate(owner, {
    action: "applyTeaserSafetySuggestion",
    data: { deal_id: deal.id, review_id: reviewId },
  });
  assert.equal(getDeal(deal.id).description, suggestion);
  assert.equal(getDeal(deal.id).published, 0);
  assert.ok(
    db()
      .prepare("SELECT applied_at FROM teaser_safety_reviews WHERE id=?")
      .get(reviewId)?.applied_at,
  );
  assert.throws(
    () =>
      mutate(owner, {
        action: "applyTeaserSafetySuggestion",
        data: { deal_id: deal.id, review_id: reviewId },
      }),
    (error: unknown) =>
      error instanceof Error &&
      "status" in error &&
      error.status === 409 &&
      /already been applied/.test(error.message),
  );
});

test("stale and already-published teaser suggestions cannot be applied", () => {
  const deal = getDeal(
    mutate(owner, {
      action: "createDeal",
      data: {
        title: "Project Review Gate",
        company_name: "Review Gate Company Ltd.",
        sector: "Technology",
        province: "Alberta",
        city: "Calgary",
        revenue: 3_800_000,
        ebitda: 640_000,
        asking_price: 4_900_000,
        employees: 19,
        founded: 2016,
        description:
          "A Canadian technology services provider with contracted revenue.",
        confidential_summary: "Restricted company information.",
        financial_year: 2025,
      },
    }).id!,
  );
  const staleReviewId = insertReview(
    deal.id,
    "A Canadian technology services provider with repeat customer relationships.",
  );
  mutate(owner, {
    action: "updateDealDetails",
    data: {
      deal_id: deal.id,
      description:
        "A Canadian technology services platform with diversified repeat revenue.",
    },
  });
  assert.throws(
    () =>
      mutate(owner, {
        action: "applyTeaserSafetySuggestion",
        data: { deal_id: deal.id, review_id: staleReviewId },
      }),
    /changed after this review/,
  );

  const currentReviewId = insertReview(
    deal.id,
    "A Canadian technology company with repeat customer relationships.",
  );
  mutate(owner, {
    action: "updateDeal",
    data: {
      deal_id: deal.id,
      stage: "On market",
      published: true,
      distribution_mode: "qualified_discovery",
    },
  });
  assert.throws(
    () =>
      mutate(owner, {
        action: "applyTeaserSafetySuggestion",
        data: { deal_id: deal.id, review_id: currentReviewId },
      }),
    /Make the teaser private/,
  );
});

test("structured mandate edits stale a teaser safety review", () => {
  const deal = getDeal(
    mutate(owner, {
      action: "createDeal",
      data: {
        title: "Project Structured Gate",
        company_name: "Structured Gate Company Ltd.",
        sector: "Business services",
        province: "Ontario",
        city: "Ottawa",
        revenue: 5_200_000,
        ebitda: 900_000,
        asking_price: 6_700_000,
        employees: 31,
        founded: 2014,
        description:
          "A Canadian business services provider with durable customer relationships.",
        confidential_summary: "Restricted operating details.",
        financial_year: 2025,
      },
    }).id!,
  );
  const reviewId = insertReview(
    deal.id,
    "A Canadian business services provider with diversified relationships.",
  );

  mutate(owner, {
    action: "updateDealDetails",
    data: { deal_id: deal.id, ebitda: deal.ebitda + 100_000 },
  });

  assert.throws(
    () =>
      mutate(owner, {
        action: "applyTeaserSafetySuggestion",
        data: { deal_id: deal.id, review_id: reviewId },
      }),
    (error: unknown) =>
      error instanceof Error &&
      "status" in error &&
      error.status === 409 &&
      /mandate changed after this review/.test(error.message),
  );

  const financialReviewId = insertReview(
    deal.id,
    "A Canadian business services provider with recurring relationships.",
  );
  db()
    .prepare(
      `INSERT INTO deal_financials(
        id,deal_id,fiscal_year,period_type,revenue,ebitda,gross_profit,is_projected
      ) VALUES(?,?,2024,'annual',5200000,900000,NULL,0)`,
    )
    .run(randomUUID(), deal.id);

  assert.throws(
    () =>
      mutate(owner, {
        action: "applyTeaserSafetySuggestion",
        data: { deal_id: deal.id, review_id: financialReviewId },
      }),
    (error: unknown) =>
      error instanceof Error &&
      "status" in error &&
      error.status === 409 &&
      /mandate changed after this review/.test(error.message),
  );
});
