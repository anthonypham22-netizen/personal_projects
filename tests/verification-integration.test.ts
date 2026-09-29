import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, one, run } from "../src/lib/db";
import { mutate, register, sessionUser, workspace } from "../src/lib/service";
import type { User } from "../src/lib/types";

let directory: string;
let buyer: User;
let reviewer: User;
let owner: User;

before(() => {
  directory = mkdtempSync(path.join(tmpdir(), "succera-verification-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  process.env.ALLOW_REGISTRATION = "true";
  delete process.env.QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS;
  db();
  buyer = one<User>("SELECT * FROM users WHERE id='demo-buyer'")!;
  reviewer = one<User>("SELECT * FROM users WHERE id='demo-advisor'")!;
  owner = one<User>("SELECT * FROM users WHERE id='demo-owner'")!;
});

after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});

test("buyer verification is organization-scoped, reviewed internally, and gates discovery", () => {
  const initial = workspace(buyer);
  assert.equal(initial.organization.verification_status, "verified_acquirer");
  assert.equal(
    initial.buyer_verification_profile?.organization_id,
    initial.organization.id,
  );
  assert.equal(workspace(reviewer).is_platform_admin, true);

  const profile = {
    legal_name: "Evergreen Capital Partners Inc.",
    website: "https://evergreen.example.test",
    buyer_type: "private_equity",
    principals: "Taylor Reid, Managing Partner",
    acquisition_history: "Three Canadian lower-middle-market acquisitions.",
    capital_source: "Committed private investment fund.",
    min_equity_check: 2_000_000,
    max_equity_check: 12_000_000,
    financing_approach: "Equity with senior acquisition financing.",
  } as const;
  mutate(buyer, {
    action: "updateBuyerVerificationProfile",
    data: profile,
  });
  const reset = workspace(buyer);
  assert.equal(reset.organization.verification_status, "unverified");
  assert.equal(reset.buyer_verification_profile?.submitted_at, null);
  assert.equal(
    reset.deals.some(
      (deal) =>
        deal.distribution_mode === "qualified_discovery" &&
        deal.access_status === "none",
    ),
    false,
    "editing accepted evidence must re-gate discovery immediately",
  );
  mutate(buyer, { action: "submitBuyerVerification", data: {} });
  const firstSubmissionRevision =
    workspace(buyer).buyer_verification_profile?.submission_revision;
  assert.equal(firstSubmissionRevision, 1);

  assert.throws(
    () =>
      mutate(owner, {
        action: "reviewBuyerVerification",
        data: {
          organization_id: initial.organization.id,
          submission_revision: firstSubmissionRevision,
          decision: "firm_verified",
          notes: "Attempted by a non-platform user.",
        },
      }),
    /platform verification reviewers/i,
  );

  mutate(reviewer, {
    action: "reviewBuyerVerification",
    data: {
      organization_id: initial.organization.id,
      submission_revision: firstSubmissionRevision,
      decision: "firm_verified",
      notes: "Firm identity and operating website reviewed.",
    },
  });

  const reviewed = workspace(buyer);
  assert.equal(reviewed.organization.verification_status, "firm_verified");
  assert.equal(reviewed.buyer_verification_profile?.submitted_at, null);
  assert.equal(
    Object.prototype.hasOwnProperty.call(reviewed, "verification_reviews"),
    false,
    "buyers must not receive internal reviewer notes or decision history",
  );
  assert.equal(
    one<{ count: number }>(
      "SELECT COUNT(*) count FROM verification_reviews WHERE organization_id=? AND reviewer_user_id=? AND decision='firm_verified'",
      initial.organization.id,
      reviewer.id,
    )?.count,
    1,
  );
  process.env.QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS = "verified_acquirer";
  assert.equal(
    workspace(buyer).deals.some(
      (deal) =>
        deal.distribution_mode === "qualified_discovery" &&
        deal.access_status === "none",
    ),
    false,
    "raising the threshold must take effect through live discovery checks",
  );
  delete process.env.QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS;

  const reviewerWorkspace = workspace(reviewer);
  assert.equal(
    reviewerWorkspace.verification_admin_queue?.some(
      (entry) => entry.organization_id === initial.organization.id,
    ),
    false,
    "reviewed submissions leave the bounded pending queue",
  );
  assert.equal(
    reviewerWorkspace.verification_reviews?.some(
      (entry) =>
        entry.organization_id === initial.organization.id &&
        entry.submission_revision === firstSubmissionRevision,
    ),
    true,
  );

  mutate(buyer, {
    action: "organization",
    data: {
      name: reviewed.organization.name,
      organization_type: reviewed.organization.organization_type,
      website: "https://evergreen-updated.example.test",
      province: reviewed.organization.province,
      description: reviewed.organization.description,
    },
  });
  const changedFirm = workspace(buyer);
  assert.equal(changedFirm.organization.verification_status, "unverified");
  assert.equal(changedFirm.buyer_verification_profile?.submitted_at, null);
  assert.equal(
    changedFirm.deals.some(
      (deal) =>
        deal.distribution_mode === "qualified_discovery" &&
        deal.access_status === "none",
    ),
    false,
    "verification-relevant firm settings must re-gate discovery",
  );

  mutate(buyer, { action: "updateBuyerVerificationProfile", data: profile });
  mutate(buyer, { action: "submitBuyerVerification", data: {} });
  const staleRevision =
    workspace(buyer).buyer_verification_profile?.submission_revision;
  assert.equal(staleRevision, 2);
  mutate(buyer, {
    action: "updateBuyerVerificationProfile",
    data: { ...profile, website: "https://evergreen-replaced.example.test" },
  });
  mutate(buyer, { action: "submitBuyerVerification", data: {} });
  const currentRevision =
    workspace(buyer).buyer_verification_profile?.submission_revision;
  assert.equal(currentRevision, 3);
  assert.throws(
    () =>
      mutate(reviewer, {
        action: "reviewBuyerVerification",
        data: {
          organization_id: initial.organization.id,
          submission_revision: staleRevision,
          decision: "firm_verified",
          notes: "Stale reviewer form must not approve replacement evidence.",
        },
      }),
    /already reviewed|newer submission|replaced/i,
  );
  mutate(reviewer, {
    action: "reviewBuyerVerification",
    data: {
      organization_id: initial.organization.id,
      submission_revision: currentRevision,
      decision: "firm_verified",
      notes: "Replacement evidence reviewed.",
    },
  });

  mutate(buyer, { action: "submitBuyerVerification", data: {} });
  const rejectionRevision =
    workspace(buyer).buyer_verification_profile?.submission_revision;
  mutate(reviewer, {
    action: "reviewBuyerVerification",
    data: {
      organization_id: initial.organization.id,
      submission_revision: rejectionRevision,
      decision: "rejected",
      notes: "Additional ownership evidence is required.",
    },
  });
  const rejected = workspace(buyer);
  assert.equal(rejected.organization.verification_status, "rejected");
  assert.equal(
    rejected.deals.some(
      (deal) =>
        deal.distribution_mode === "qualified_discovery" &&
        deal.access_status === "none",
    ),
    false,
  );
  const persistedMatch = one<{ eligible: number }>(
    `SELECT dm.eligible
     FROM deal_matches dm
     JOIN deals d ON d.id=dm.deal_id
     WHERE dm.buyer_organization_id=?
       AND d.distribution_mode='qualified_discovery'
     LIMIT 1`,
    initial.organization.id,
  );
  assert.equal(
    persistedMatch?.eligible,
    1,
    "general persisted matching must not encode the live discovery verification gate",
  );
});

test("demo reviewers cannot enumerate or mutate registered buyer evidence", () => {
  const suffix = Date.now();
  const registeredBuyer = sessionUser(
    register({
      name: "Registered Buyer",
      company: `Registered Capital ${suffix}`,
      email: `registered-buyer-${suffix}@example.test`,
      password: "registered-verification-password-2026",
      role: "buyer",
    }),
  )!;
  mutate(registeredBuyer, {
    action: "updateBuyerVerificationProfile",
    data: {
      legal_name: `Registered Capital ${suffix} Inc.`,
      website: `https://registered-${suffix}.example.test`,
      buyer_type: "private_equity",
      principals: "Registered Principal, Managing Partner",
      acquisition_history: "Completed Canadian acquisitions.",
      capital_source: "Committed private investment capital.",
      min_equity_check: 1_000_000,
      max_equity_check: 10_000_000,
      financing_approach: "Equity with senior acquisition financing.",
    },
  });
  mutate(registeredBuyer, { action: "submitBuyerVerification", data: {} });
  const registeredWorkspace = workspace(registeredBuyer);
  const registeredRevision =
    registeredWorkspace.buyer_verification_profile?.submission_revision;
  const demoQueue = workspace(reviewer).verification_admin_queue ?? [];
  assert.equal(
    demoQueue.some(
      (entry) => entry.organization_id === registeredWorkspace.organization.id,
    ),
    false,
  );
  assert.throws(
    () =>
      mutate(reviewer, {
        action: "reviewBuyerVerification",
        data: {
          organization_id: registeredWorkspace.organization.id,
          submission_revision: registeredRevision,
          decision: "firm_verified",
          notes: "Demo reviewer must not cross marketplace realms.",
        },
      }),
    /profile not found/i,
  );

  const registeredReviewerToken = register({
    name: "Registered Reviewer",
    company: `Platform Operations ${suffix}`,
    email: `registered-reviewer-${suffix}@example.test`,
    password: "registered-reviewer-password-2026",
    role: "advisor",
  });
  const registeredReviewerId = sessionUser(registeredReviewerToken)!.id;
  run("UPDATE users SET is_platform_admin=1 WHERE id=?", registeredReviewerId);
  const registeredReviewer = one<User>(
    "SELECT * FROM users WHERE id=?",
    registeredReviewerId,
  )!;
  const registeredReviewerWorkspace = workspace(registeredReviewer);
  assert.equal(
    registeredReviewerWorkspace.verification_admin_queue?.some(
      (entry) => entry.organization_id === registeredWorkspace.organization.id,
    ),
    true,
  );
  assert.equal(
    registeredReviewerWorkspace.verification_admin_queue?.some((entry) =>
      entry.organization_id.startsWith("org-demo-"),
    ),
    false,
    "persisted reviewers must not see demo organizations",
  );
  mutate(registeredReviewer, {
    action: "reviewBuyerVerification",
    data: {
      organization_id: registeredWorkspace.organization.id,
      submission_revision: registeredRevision,
      decision: "firm_verified",
      notes: "Registered reviewer verified the registered buyer.",
    },
  });
});
