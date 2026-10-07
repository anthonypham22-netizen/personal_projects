import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  approveBuyerVerification,
  buyerIdentityVerificationForUser,
  buyerVerificationCountsForAdmin,
  isPlatformAdmin,
  listBuyerVerificationsForAdmin,
  rejectBuyerVerification,
  requestBuyerVerificationInfo,
} from "../src/lib/buyer-identity-verification";
import { closeDatabase, databaseReady, run } from "../src/lib/db";
import {
  createSession,
  canAccess,
  getDeal,
  mutate,
  register,
  sessionUser,
  workspace,
} from "../src/lib/service";
import type { User } from "../src/lib/types";

let directory: string;
let owner: User;
let advisor: User;
let admin: User;
let approvedBuyer: User;
let rejectedBuyer: User;
let pendingBuyer: User;
let missingBuyer: User;
let dealId: string;

const submission = {
  buyer_type: "independent_sponsor",
  linkedin_url: "https://www.linkedin.com/in/succera-test-buyer",
  website_url: "https://buyer.example.test",
  source_of_capital: "investor_sponsor_equity",
  equity_range: "1m_2_5m",
  completed_acquisitions: 2,
  experience_summary:
    "Canadian acquisition, investing, and operating experience in established service businesses.",
  acquisition_strategy:
    "Acquire enduring Canadian companies with recurring revenue and strong management teams.",
  authorized_to_represent: true,
} as const;

async function registerUser(
  suffix: string,
  role: User["role"],
  company: string,
) {
  const token = await register({
    name: `${suffix} User`,
    company,
    email: `${suffix.toLowerCase()}-${Date.now()}@example.test`,
    password: "buyer-verification-test-password-2026",
    role,
  });
  return (await sessionUser(token))!;
}

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "succera-buyer-review-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  process.env.ALLOW_REGISTRATION = "true";
  await databaseReady();

  owner = await registerUser("ReviewOwner", "owner", "Review Seller Inc.");
  advisor = await registerUser(
    "ReviewAdvisor",
    "advisor",
    "Review Advisory Inc.",
  );
  admin = await registerUser("ReviewAdmin", "advisor", "Succera Operations");
  await run("UPDATE users SET is_platform_admin=1 WHERE id=?", admin.id);
  admin.is_platform_admin = 1;
  approvedBuyer = await registerUser(
    "ApprovedBuyer",
    "buyer",
    "Approved Capital Inc.",
  );
  rejectedBuyer = await registerUser(
    "RejectedBuyer",
    "buyer",
    "Rejected Capital Inc.",
  );
  pendingBuyer = await registerUser(
    "PendingBuyer",
    "buyer",
    "Pending Capital Inc.",
  );
  missingBuyer = await registerUser(
    "MissingBuyer",
    "buyer",
    "Missing Capital Inc.",
  );

  dealId = (
    await mutate(owner, {
      action: "createDeal",
      data: {
        title: "Project Verification Gate",
        company_name: "Verification Gate Services Inc.",
        sector: "Business services",
        province: "Ontario",
        city: "Toronto",
        revenue: 8_000_000,
        ebitda: 1_600_000,
        asking_price: 11_000_000,
        employees: 38,
        founded: 2011,
        description:
          "An established Canadian services business with recurring commercial customers.",
        confidential_summary:
          "Customer concentration and management details are confidential.",
        transaction_type: "majority_acquisition",
        ownership_percentage_available: 80,
        seller_rollover_possible: true,
        seller_financing_possible: false,
        management_transition: "Founder available for an orderly transition.",
        reason_for_transaction: "Planned succession.",
        min_expected_value: 9_000_000,
        max_expected_value: 12_000_000,
        distribution_mode: "private_outreach",
        financial_year: 2025,
        gross_profit: 3_200_000,
        financial_is_projected: false,
      },
    })
  ).id!;
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

test("buyer submissions are role-scoped and admin review supports the full workflow", async () => {
  await assert.rejects(
    mutate(owner, {
      action: "submitBuyerIdentityVerification",
      data: submission,
    }),
    /Only buyer accounts/i,
  );
  await assert.rejects(
    mutate(advisor, {
      action: "submitBuyerIdentityVerification",
      data: submission,
    }),
    /Only buyer accounts/i,
  );

  await mutate(approvedBuyer, {
    action: "submitBuyerIdentityVerification",
    data: submission,
  });
  let verification = await buyerIdentityVerificationForUser(approvedBuyer.id);
  assert.equal(verification?.status, "pending");
  assert.equal(verification?.authorized_to_represent, true);

  assert.equal(
    await approveBuyerVerification(
      approvedBuyer,
      verification!.id,
      "A buyer cannot approve itself.",
    ),
    false,
  );
  assert.deepEqual(await listBuyerVerificationsForAdmin(owner), []);
  assert.equal(
    (await listBuyerVerificationsForAdmin(admin)).some(
      (entry) => entry.id === verification!.id && entry.status === "pending",
    ),
    true,
  );

  assert.equal(
    await requestBuyerVerificationInfo(
      admin,
      verification!.id,
      "Please clarify the buyer's committed capital source.",
    ),
    true,
  );
  verification = await buyerIdentityVerificationForUser(approvedBuyer.id);
  assert.equal(verification?.status, "needs_info");
  assert.match(verification?.review_notes ?? "", /clarify/i);
  assert.equal(verification?.reviewed_by, admin.id);
  assert.ok(verification?.reviewed_at);
  assert.match(
    (await workspace(approvedBuyer)).buyer_identity_verification
      ?.review_notes ?? "",
    /clarify/i,
  );

  await mutate(approvedBuyer, {
    action: "submitBuyerIdentityVerification",
    data: {
      ...submission,
      experience_summary:
        "Canadian acquisition and operating experience, supported by committed sponsor equity partners.",
    },
  });
  verification = await buyerIdentityVerificationForUser(approvedBuyer.id);
  assert.equal(verification?.status, "pending");
  assert.equal(verification?.reviewed_at, null);
  assert.equal(verification?.reviewed_by, null);
  assert.equal(verification?.review_notes, "");

  assert.equal(
    await approveBuyerVerification(
      admin,
      verification!.id,
      "Profile and representative identity reviewed.",
    ),
    true,
  );
  assert.equal(
    (await buyerIdentityVerificationForUser(approvedBuyer.id))?.status,
    "approved",
  );
  await assert.rejects(
    mutate(approvedBuyer, {
      action: "submitBuyerIdentityVerification",
      data: submission,
    }),
    /cannot be changed/i,
  );

  await mutate(rejectedBuyer, {
    action: "submitBuyerIdentityVerification",
    data: { ...submission, website_url: "https://rejected.example.test" },
  });
  const rejected = await buyerIdentityVerificationForUser(rejectedBuyer.id);
  assert.equal(
    await rejectBuyerVerification(
      admin,
      rejected!.id,
      "The submitted representative details could not be confirmed.",
    ),
    true,
  );
  assert.equal(
    (await buyerIdentityVerificationForUser(rejectedBuyer.id))?.status,
    "rejected",
  );

  await mutate(pendingBuyer, {
    action: "submitBuyerIdentityVerification",
    data: { ...submission, website_url: "https://pending.example.test" },
  });
  const pending = await buyerIdentityVerificationForUser(pendingBuyer.id);
  await run("UPDATE users SET is_platform_admin=1 WHERE id=?", pendingBuyer.id);
  pendingBuyer.is_platform_admin = 1;
  assert.equal(
    await approveBuyerVerification(
      pendingBuyer,
      pending!.id,
      "A platform administrator cannot review their own application.",
    ),
    false,
  );
  assert.equal(
    (await buyerIdentityVerificationForUser(pendingBuyer.id))?.status,
    "pending",
  );
  await run("UPDATE users SET is_platform_admin=0 WHERE id=?", pendingBuyer.id);
  pendingBuyer.is_platform_admin = 0;
});

test("platform administration is granted only by the persisted admin flag", async () => {
  process.env.ADMIN_EMAILS = owner.email;
  assert.equal(isPlatformAdmin(owner), false);
  assert.equal(isPlatformAdmin(advisor), false);
  assert.equal(isPlatformAdmin(admin), true);
  assert.deepEqual(await listBuyerVerificationsForAdmin(owner), []);
  assert.deepEqual(await buyerVerificationCountsForAdmin(owner), {
    pending: 0,
    needs_info: 0,
    approved: 0,
    rejected: 0,
  });
  const counts = await buyerVerificationCountsForAdmin(admin);
  assert.equal(counts.approved, 1);
  assert.equal(counts.needs_info, 0);
  assert.equal(counts.rejected, 1);
  assert.equal(counts.pending, 1);
  delete process.env.ADMIN_EMAILS;
});

test("buyer verification normalizes natural website and LinkedIn URLs", async () => {
  const cases = [
    {
      suffix: "BareDomainBuyer",
      linkedin_url: "linkedin.com/in/bare-domain-buyer",
      website_url: "techsales.ca",
      expectedLinkedin: "https://linkedin.com/in/bare-domain-buyer",
      expectedWebsite: "https://techsales.ca",
    },
    {
      suffix: "WwwDomainBuyer",
      linkedin_url: null,
      website_url: "www.techsales.ca",
      expectedLinkedin: null,
      expectedWebsite: "https://www.techsales.ca",
    },
    {
      suffix: "HttpsDomainBuyer",
      linkedin_url: "https://www.linkedin.com/in/https-domain-buyer",
      website_url: "https://techsales.ca",
      expectedLinkedin: "https://www.linkedin.com/in/https-domain-buyer",
      expectedWebsite: "https://techsales.ca",
    },
  ] as const;

  for (const testCase of cases) {
    const buyer = await registerUser(
      testCase.suffix,
      "buyer",
      `${testCase.suffix} Capital Inc.`,
    );
    await mutate(buyer, {
      action: "submitBuyerIdentityVerification",
      data: {
        ...submission,
        linkedin_url: testCase.linkedin_url,
        website_url: testCase.website_url,
      },
    });
    const verification = await buyerIdentityVerificationForUser(buyer.id);
    assert.equal(verification?.linkedin_url, testCase.expectedLinkedin);
    assert.equal(verification?.website_url, testCase.expectedWebsite);
  }
});

test("buyer verification rejects malformed and unsafe URLs", async () => {
  const buyer = await registerUser(
    "InvalidUrlBuyer",
    "buyer",
    "Invalid URL Capital Inc.",
  );

  for (const website_url of [
    "not a website",
    "https:example.com",
    "https:/example.com",
    "http:\\example.com",
    "javascript:alert(1)",
    "data:text/plain,unsafe",
    "file:///etc/passwd",
  ])
    await assert.rejects(
      mutate(buyer, {
        action: "submitBuyerIdentityVerification",
        data: { ...submission, website_url },
      }),
      /website_url/i,
    );

  await assert.rejects(
    mutate(buyer, {
      action: "submitBuyerIdentityVerification",
      data: {
        ...submission,
        linkedin_url: "javascript:alert(1)",
      },
    }),
    /linkedin_url/i,
  );
});

test("all unapproved states are gated while approved buyers reach the access workflow", async () => {
  for (const candidate of [missingBuyer, pendingBuyer, rejectedBuyer])
    await assert.rejects(
      mutate(candidate, {
        action: "requestAccess",
        data: { deal_id: dealId },
      }),
      /Complete buyer verification before requesting confidential access/i,
    );

  await assert.rejects(
    mutate(approvedBuyer, {
      action: "requestAccess",
      data: { deal_id: dealId },
    }),
    /matched introduction request/i,
    "an approved buyer passes the identity gate and reaches the marketplace request workflow",
  );

  await run(
    `INSERT INTO access(id,deal_id,buyer_id,status,nda_status,notes)
     VALUES(?,?,?,'nda_pending','requested','Verification defense-in-depth test')`,
    "access-unapproved-defense",
    dealId,
    missingBuyer.id,
  );
  await assert.rejects(
    mutate(owner, {
      action: "reviewAccess",
      data: {
        deal_id: dealId,
        buyer_id: missingBuyer.id,
        status: "approved",
      },
    }),
    /This buyer must complete Succera's buyer profile review before confidential access can be approved/i,
  );
  await run(
    "UPDATE access SET status='approved',nda_status='verified' WHERE id=?",
    "access-unapproved-defense",
  );
  const unapprovedWorkspace = await workspace(missingBuyer);
  const gatedDeal = unapprovedWorkspace.deals.find(
    (deal) => deal.id === dealId,
  );
  assert.equal(gatedDeal?.has_access, false);
  assert.equal(gatedDeal?.company_name, "Confidential company");
});

test("admin review queues preserve demo and real-user isolation", async () => {
  const realQueue = await listBuyerVerificationsForAdmin(admin);
  assert.equal(
    realQueue.some((entry) => entry.user_id.startsWith("demo-")),
    false,
  );

  const demoAdmin = (await sessionUser(await createSession("demo-advisor")))!;
  const demoQueue = await listBuyerVerificationsForAdmin(demoAdmin);
  assert.equal(demoQueue.length > 0, true);
  assert.equal(
    demoQueue.every((entry) => entry.user_id.startsWith("demo-")),
    true,
  );
  assert.equal(
    demoQueue.some((entry) => entry.user_id === approvedBuyer.id),
    false,
  );

  const approvedWorkspace = await workspace(approvedBuyer);
  assert.equal(
    approvedWorkspace.buyer_identity_verification?.status,
    "approved",
  );

  assert.equal(await canAccess(admin, await getDeal(dealId)), false);
});
