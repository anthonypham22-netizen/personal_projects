import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase, databaseReady, db, one, run } from "../src/lib/db";
import { mutate, register, sessionUser, workspace } from "../src/lib/service";
import {
  getPublicFirmBySlug,
  getPublicIndustry,
  getPublicTransactionBySlug,
  listPublicFirms,
  listPublicIndustries,
  listPublicSitemapPaths,
  listPublicTransactions,
} from "../src/lib/public-network";
import type { User } from "../src/lib/types";

let directory: string;
let buyer: User;
let reviewer: User;

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "northlane-public-network-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  process.env.ALLOW_REGISTRATION = "true";
  await databaseReady();
  buyer = (await one<User>("SELECT * FROM users WHERE id='demo-buyer'"))!;
  reviewer = (await one<User>("SELECT * FROM users WHERE id='demo-advisor'"))!;
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

test("demo public examples are explicit while sellers and self-reported history remain private", async () => {
  const profile = await one<{
    is_public: number;
    headline: string;
    revision: number;
  }>(
    "SELECT is_public,headline,revision FROM organization_public_profiles WHERE organization_id=?",
    buyer.id.replace("demo-buyer", "org-demo-buyer"),
  );
  assert.equal(profile?.is_public, 1);
  assert.equal(
    profile?.headline,
    "Patient capital for enduring Canadian businesses",
  );
  assert.equal(profile?.revision, 2);

  const sellerProfile = await one<{ is_public: number }>(
    "SELECT is_public FROM organization_public_profiles WHERE organization_id='org-demo-owner'",
  );
  assert.deepEqual(sellerProfile, { is_public: 0 });

  const transaction = await one<{
    public_slug: string | null;
    public_opt_in: number;
  }>(
    "SELECT public_slug,public_opt_in FROM closed_transactions WHERE id='closed-demo-evergreen-manufacturing'",
  );
  assert.deepEqual(transaction, { public_slug: null, public_opt_in: 0 });
  assert.equal((await listPublicFirms()).length, 4);
  assert.equal((await listPublicTransactions()).length, 2);
  assert.equal((await listPublicTransactions({ limit: 1 })).length, 1);
  assert.equal(
    (await listPublicFirms()).some((firm) => firm.name === "Cedar & Co."),
    false,
  );
});

test("public profile updates require owner/admin and use revision-checked taxonomy replacement", async () => {
  const organizationId = "org-demo-buyer";
  const initial = (await workspace(buyer)).public_network_profile!;
  assert.equal(initial.can_manage, true);
  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "updatePublicNetworkProfile",
        data: {
          is_public: true,
          headline: "",
          public_description: "",
          show_website: false,
          show_province: false,
          show_verified_transactions: false,
          industries: [],
          locations: [],
          revision: initial.revision,
        },
      }),
    /headline and description/i,
  );
  await mutate(buyer, {
    action: "updatePublicNetworkProfile",
    data: {
      is_public: true,
      headline: "Canadian lower-middle-market acquirer",
      public_description: "A focused acquisition firm for enduring businesses.",
      show_website: true,
      show_province: true,
      show_verified_transactions: true,
      industries: ["Manufacturing", "Business services"],
      locations: ["Ontario", "Alberta"],
      revision: initial.revision,
    },
  });

  const updated = (await workspace(buyer)).public_network_profile!;
  assert.equal(updated.is_public, true);
  assert.deepEqual(updated.industries, ["Business services", "Manufacturing"]);
  assert.deepEqual(updated.locations, ["Alberta", "Ontario"]);
  assert.equal(updated.revision, initial.revision + 1);
  assert.deepEqual(
    (
      await db()
        .prepare(
          "SELECT industry FROM organization_public_industries WHERE organization_id=? ORDER BY industry",
        )
        .all(organizationId)
    ).map((row) => ({ ...row })),
    [{ industry: "Business services" }, { industry: "Manufacturing" }],
  );

  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "updatePublicNetworkProfile",
        data: {
          is_public: false,
          headline: "Stale",
          public_description: "Stale",
          show_website: false,
          show_province: false,
          show_verified_transactions: false,
          industries: [],
          locations: [],
          revision: initial.revision,
        },
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("changed in another session") &&
      (error as { status?: number }).status === 409,
  );

  const viewerToken = await register({
    name: "Public Profile Viewer",
    company: `Viewer Capital ${Date.now()}`,
    email: `public-profile-viewer-${Date.now()}@example.test`,
    role: "buyer",
    password: "public-network-viewer-password",
  });
  const viewer = (await sessionUser(viewerToken))!;
  await run("DELETE FROM organization_members WHERE user_id=?", viewer.id);
  await run(
    "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'viewer','active')",
    `membership-viewer-${viewer.id}`,
    organizationId,
    viewer.id,
  );
  const viewerWithMembership = (await sessionUser(viewerToken))!;
  await assert.rejects(
    async () =>
      await mutate(viewerWithMembership, {
        action: "updatePublicNetworkProfile",
        data: {
          is_public: false,
          headline: "Nope",
          public_description: "Nope",
          show_website: false,
          show_province: false,
          show_verified_transactions: false,
          industries: [],
          locations: [],
          revision: (await workspace(viewerWithMembership))
            .public_network_profile!.revision,
        },
      }),
    /owners and administrators/i,
  );
  const reset = (await workspace(buyer)).public_network_profile!;
  await mutate(buyer, {
    action: "updatePublicNetworkProfile",
    data: {
      is_public: false,
      headline: reset.headline,
      public_description: reset.public_description,
      show_website: reset.show_website,
      show_province: reset.show_province,
      show_verified_transactions: false,
      industries: [],
      locations: [],
      revision: reset.revision,
    },
  });
});

test("operating-business sellers cannot publish public network profiles", async () => {
  const owner = (await one<User>("SELECT * FROM users WHERE id='demo-owner'"))!;
  const profile = (await workspace(owner)).public_network_profile!;
  await assert.rejects(
    async () =>
      await mutate(owner, {
        action: "updatePublicNetworkProfile",
        data: {
          is_public: true,
          headline: "A confidential operating business",
          public_description: "This identity must remain private.",
          show_website: false,
          show_province: false,
          show_verified_transactions: false,
          industries: ["Business services"],
          locations: ["Ontario"],
          revision: profile.revision,
        },
      }),
    /acquisition firms and M&A advisors/i,
  );
  assert.equal(
    (
      await one<{ is_public: number }>(
        "SELECT is_public FROM organization_public_profiles WHERE organization_id='org-demo-owner'",
      )
    )?.is_public,
    0,
  );

  await run(
    `UPDATE organization_public_profiles
     SET is_public=1,headline='Stale public seller',public_description='Legacy state'
     WHERE organization_id='org-demo-owner'`,
  );
  await run(
    "INSERT OR IGNORE INTO organization_public_industries(organization_id,industry) VALUES('org-demo-owner','Business services')",
  );
  assert.equal(
    (await listPublicFirms()).some((firm) => firm.slug === "cedar-co"),
    false,
  );
  assert.equal(
    (await getPublicIndustry("Business services"))?.firms.some(
      (firm) => firm.slug === "cedar-co",
    ),
    false,
  );
  assert.equal(
    (await listPublicSitemapPaths()).some((path) => path.includes("cedar-co")),
    false,
  );
  await run(
    "UPDATE organization_public_profiles SET is_public=0 WHERE organization_id='org-demo-owner'",
  );
});

test("verified transactions require a public firm and explicit transaction opt-in", async () => {
  const transactionId = "closed-demo-evergreen-services";
  const privateProfile = (await workspace(buyer)).public_network_profile!;
  await mutate(buyer, {
    action: "updatePublicNetworkProfile",
    data: {
      is_public: false,
      headline: privateProfile.headline,
      public_description: privateProfile.public_description,
      show_website: privateProfile.show_website,
      show_province: privateProfile.show_province,
      show_verified_transactions: false,
      industries: privateProfile.industries,
      locations: privateProfile.locations,
      revision: privateProfile.revision,
    },
  });
  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "setClosedTransactionPublic",
        data: { transaction_id: transactionId, public_opt_in: true },
      }),
    /public profile.*verified transactions/i,
  );

  const profile = (await workspace(buyer)).public_network_profile!;
  await mutate(buyer, {
    action: "updatePublicNetworkProfile",
    data: {
      is_public: true,
      headline: profile.headline,
      public_description: profile.public_description,
      show_website: profile.show_website,
      show_province: profile.show_province,
      show_verified_transactions: true,
      industries: profile.industries,
      locations: profile.locations,
      revision: profile.revision,
    },
  });

  const viewerToken = await register({
    name: "Transaction History Viewer",
    company: `Transaction Viewer ${Date.now()}`,
    email: `transaction-viewer-${Date.now()}@example.test`,
    role: "buyer",
    password: "transaction-viewer-password",
  });
  const viewer = (await sessionUser(viewerToken))!;
  await run("DELETE FROM organization_members WHERE user_id=?", viewer.id);
  await run(
    "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'viewer','active')",
    `membership-transaction-viewer-${viewer.id}`,
    "org-demo-buyer",
    viewer.id,
  );
  const viewerWithMembership = (await sessionUser(viewerToken))!;
  const transactionBeforeUnauthorizedAttempt = await one<{
    public_opt_in: number;
    public_slug: string | null;
  }>(
    "SELECT public_opt_in,public_slug FROM closed_transactions WHERE id=?",
    transactionId,
  );
  await assert.rejects(
    async () =>
      await mutate(viewerWithMembership, {
        action: "setClosedTransactionPublic",
        data: { transaction_id: transactionId, public_opt_in: true },
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("owners and administrators") &&
      (error as { status?: number }).status === 403,
  );
  assert.deepEqual(
    await one<{ public_opt_in: number; public_slug: string | null }>(
      "SELECT public_opt_in,public_slug FROM closed_transactions WHERE id=?",
      transactionId,
    ),
    transactionBeforeUnauthorizedAttempt,
  );

  const unverifiedTransactionId = "closed-demo-evergreen-manufacturing";
  await assert.rejects(
    async () =>
      await mutate(buyer, {
        action: "setClosedTransactionPublic",
        data: { transaction_id: unverifiedTransactionId, public_opt_in: true },
      }),
    /independently verified/i,
  );
  await run(
    "UPDATE closed_transactions SET verified=1,verified_by_user_id=?,verified_at=CURRENT_TIMESTAMP WHERE id=?",
    reviewer.id,
    unverifiedTransactionId,
  );
  const publicTransactionId = unverifiedTransactionId;
  await mutate(buyer, {
    action: "setClosedTransactionPublic",
    data: { transaction_id: publicTransactionId, public_opt_in: true },
  });
  const publicTransaction = (await listPublicTransactions()).find(
    (transaction) => transaction.closed_date === "2023-11-15",
  );
  assert.ok(publicTransaction);
  assert.equal(
    publicTransaction.public_slug,
    "specialty-manufacturing-alberta-closed-demo-evergreen-manufactur",
  );
  assert.equal("seller_organization_id" in publicTransaction, false);
  assert.equal("advisor_organization_id" in publicTransaction, false);
  assert.deepEqual(
    (await getPublicTransactionBySlug(publicTransaction.public_slug))
      ?.public_slug,
    publicTransaction.public_slug,
  );
  await mutate(buyer, {
    action: "setClosedTransactionPublic",
    data: { transaction_id: publicTransactionId, public_opt_in: false },
  });
  assert.equal(
    (await listPublicTransactions()).some(
      (transaction) =>
        transaction.public_slug === publicTransaction.public_slug,
    ),
    false,
  );
  const reset = (await workspace(buyer)).public_network_profile!;
  await mutate(buyer, {
    action: "updatePublicNetworkProfile",
    data: {
      is_public: false,
      headline: reset.headline,
      public_description: reset.public_description,
      show_website: reset.show_website,
      show_province: reset.show_province,
      show_verified_transactions: false,
      industries: [],
      locations: [],
      revision: reset.revision,
    },
  });
});

test("public queries minimize fields, suppress demo-only firms, and never surface active deals", async () => {
  const suffix = Date.now();
  const token = await register({
    name: "Public Network Buyer",
    company: `Public Network Capital ${suffix}`,
    email: `public-network-buyer-${suffix}@example.test`,
    role: "buyer",
    password: "public-network-buyer-password",
  });
  const registeredBuyer = (await sessionUser(token))!;
  const profile = (await workspace(registeredBuyer)).public_network_profile!;
  await mutate(registeredBuyer, {
    action: "updatePublicNetworkProfile",
    data: {
      is_public: true,
      headline: "Public buyer",
      public_description: "A public buyer profile.",
      show_website: false,
      show_province: true,
      show_verified_transactions: false,
      industries: ["Business services"],
      locations: ["Ontario"],
      revision: profile.revision,
    },
  });
  const registeredSlug = (await workspace(registeredBuyer)).organization.slug;
  const firm = await getPublicFirmBySlug(registeredSlug, "buyer");
  assert.equal(firm?.slug, registeredSlug);
  assert.equal(firm?.public_description, "A public buyer profile.");
  assert.equal("fund_structure" in firm!, false);
  assert.equal("financing_profile" in firm!, false);
  assert.equal("self_reported_acquisition_count" in firm!, false);
  assert.equal("capital_source" in firm!, false);
  assert.equal("deals" in firm!, false);
  assert.ok(
    ((await listPublicIndustries()).find(
      ({ value }) => value === "Business services",
    )?.count ?? 0) >= 4,
  );
  assert.equal(
    (await getPublicIndustry("Business services"))?.firms.some(
      (entry) => entry.slug === registeredSlug,
    ),
    true,
  );
  assert.ok(
    (await listPublicSitemapPaths()).includes(`/buyers/${registeredSlug}`),
  );
  assert.equal(
    (await listPublicSitemapPaths()).includes(`/firms/${registeredSlug}`),
    false,
  );
  assert.ok(
    (await listPublicSitemapPaths()).includes("/industries/business-services"),
  );
  assert.equal(await getPublicFirmBySlug("cedar", "buyer"), undefined);

  process.env.ALLOW_DEMO = "false";
  assert.equal(
    await getPublicFirmBySlug("laurent-partners-demo-buyer-2", "buyer"),
    undefined,
  );
  assert.equal(
    (await listPublicFirms()).some((entry) => entry.slug === registeredSlug),
    true,
  );
  process.env.ALLOW_DEMO = "true";
});
