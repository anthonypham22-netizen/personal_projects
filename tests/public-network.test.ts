import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, one, run } from "../src/lib/db";
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

before(() => {
  directory = mkdtempSync(path.join(tmpdir(), "northlane-public-network-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  process.env.ALLOW_REGISTRATION = "true";
  db();
  buyer = one<User>("SELECT * FROM users WHERE id='demo-buyer'")!;
  reviewer = one<User>("SELECT * FROM users WHERE id='demo-advisor'")!;
});

after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});

test("demo public examples are explicit while sellers and self-reported history remain private", () => {
  const profile = one<{
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

  const sellerProfile = one<{ is_public: number }>(
    "SELECT is_public FROM organization_public_profiles WHERE organization_id='org-demo-owner'",
  );
  assert.deepEqual(sellerProfile, { is_public: 0 });

  const transaction = one<{
    public_slug: string | null;
    public_opt_in: number;
  }>(
    "SELECT public_slug,public_opt_in FROM closed_transactions WHERE id='closed-demo-evergreen-manufacturing'",
  );
  assert.deepEqual(transaction, { public_slug: null, public_opt_in: 0 });
  assert.equal(listPublicFirms().length, 4);
  assert.equal(listPublicTransactions().length, 2);
  assert.equal(listPublicTransactions({ limit: 1 }).length, 1);
  assert.equal(
    listPublicFirms().some((firm) => firm.name === "Cedar & Co."),
    false,
  );
});

test("public profile updates require owner/admin and use revision-checked taxonomy replacement", () => {
  const organizationId = "org-demo-buyer";
  const initial = workspace(buyer).public_network_profile!;
  assert.equal(initial.can_manage, true);
  assert.throws(
    () =>
      mutate(buyer, {
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
  mutate(buyer, {
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

  const updated = workspace(buyer).public_network_profile!;
  assert.equal(updated.is_public, true);
  assert.deepEqual(updated.industries, ["Manufacturing", "Business services"]);
  assert.deepEqual(updated.locations, ["Ontario", "Alberta"]);
  assert.equal(updated.revision, initial.revision + 1);
  assert.deepEqual(
    db()
      .prepare(
        "SELECT industry FROM organization_public_industries WHERE organization_id=? ORDER BY rowid",
      )
      .all(organizationId)
      .map((row) => ({ ...row })),
    [{ industry: "Manufacturing" }, { industry: "Business services" }],
  );

  assert.throws(
    () =>
      mutate(buyer, {
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

  const viewerToken = register({
    name: "Public Profile Viewer",
    company: `Viewer Capital ${Date.now()}`,
    email: `public-profile-viewer-${Date.now()}@example.test`,
    role: "buyer",
    password: "public-network-viewer-password",
  });
  const viewer = sessionUser(viewerToken)!;
  run("DELETE FROM organization_members WHERE user_id=?", viewer.id);
  run(
    "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'viewer','active')",
    `membership-viewer-${viewer.id}`,
    organizationId,
    viewer.id,
  );
  const viewerWithMembership = sessionUser(viewerToken)!;
  assert.throws(
    () =>
      mutate(viewerWithMembership, {
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
          revision:
            workspace(viewerWithMembership).public_network_profile!.revision,
        },
      }),
    /owners and administrators/i,
  );
  const reset = workspace(buyer).public_network_profile!;
  mutate(buyer, {
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

test("operating-business sellers cannot publish public network profiles", () => {
  const owner = one<User>("SELECT * FROM users WHERE id='demo-owner'")!;
  const profile = workspace(owner).public_network_profile!;
  assert.throws(
    () =>
      mutate(owner, {
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
    one<{ is_public: number }>(
      "SELECT is_public FROM organization_public_profiles WHERE organization_id='org-demo-owner'",
    )?.is_public,
    0,
  );

  run(
    `UPDATE organization_public_profiles
     SET is_public=1,headline='Stale public seller',public_description='Legacy state'
     WHERE organization_id='org-demo-owner'`,
  );
  run(
    "INSERT OR IGNORE INTO organization_public_industries(organization_id,industry) VALUES('org-demo-owner','Business services')",
  );
  assert.equal(
    listPublicFirms().some((firm) => firm.slug === "cedar-co"),
    false,
  );
  assert.equal(
    getPublicIndustry("Business services")?.firms.some(
      (firm) => firm.slug === "cedar-co",
    ),
    false,
  );
  assert.equal(
    listPublicSitemapPaths().some((path) => path.includes("cedar-co")),
    false,
  );
  run(
    "UPDATE organization_public_profiles SET is_public=0 WHERE organization_id='org-demo-owner'",
  );
});

test("verified transactions require a public firm and explicit transaction opt-in", () => {
  const transactionId = "closed-demo-evergreen-services";
  const privateProfile = workspace(buyer).public_network_profile!;
  mutate(buyer, {
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
  assert.throws(
    () =>
      mutate(buyer, {
        action: "setClosedTransactionPublic",
        data: { transaction_id: transactionId, public_opt_in: true },
      }),
    /public profile.*verified transactions/i,
  );

  const profile = workspace(buyer).public_network_profile!;
  mutate(buyer, {
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

  const viewerToken = register({
    name: "Transaction History Viewer",
    company: `Transaction Viewer ${Date.now()}`,
    email: `transaction-viewer-${Date.now()}@example.test`,
    role: "buyer",
    password: "transaction-viewer-password",
  });
  const viewer = sessionUser(viewerToken)!;
  run("DELETE FROM organization_members WHERE user_id=?", viewer.id);
  run(
    "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'viewer','active')",
    `membership-transaction-viewer-${viewer.id}`,
    "org-demo-buyer",
    viewer.id,
  );
  const viewerWithMembership = sessionUser(viewerToken)!;
  const transactionBeforeUnauthorizedAttempt = one<{
    public_opt_in: number;
    public_slug: string | null;
  }>(
    "SELECT public_opt_in,public_slug FROM closed_transactions WHERE id=?",
    transactionId,
  );
  assert.throws(
    () =>
      mutate(viewerWithMembership, {
        action: "setClosedTransactionPublic",
        data: { transaction_id: transactionId, public_opt_in: true },
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("owners and administrators") &&
      (error as { status?: number }).status === 403,
  );
  assert.deepEqual(
    one<{ public_opt_in: number; public_slug: string | null }>(
      "SELECT public_opt_in,public_slug FROM closed_transactions WHERE id=?",
      transactionId,
    ),
    transactionBeforeUnauthorizedAttempt,
  );

  const unverifiedTransactionId = "closed-demo-evergreen-manufacturing";
  assert.throws(
    () =>
      mutate(buyer, {
        action: "setClosedTransactionPublic",
        data: { transaction_id: unverifiedTransactionId, public_opt_in: true },
      }),
    /independently verified/i,
  );
  run(
    "UPDATE closed_transactions SET verified=1,verified_by_user_id=?,verified_at=CURRENT_TIMESTAMP WHERE id=?",
    reviewer.id,
    unverifiedTransactionId,
  );
  const publicTransactionId = unverifiedTransactionId;
  mutate(buyer, {
    action: "setClosedTransactionPublic",
    data: { transaction_id: publicTransactionId, public_opt_in: true },
  });
  const publicTransaction = listPublicTransactions().find(
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
    getPublicTransactionBySlug(publicTransaction.public_slug)?.public_slug,
    publicTransaction.public_slug,
  );
  mutate(buyer, {
    action: "setClosedTransactionPublic",
    data: { transaction_id: publicTransactionId, public_opt_in: false },
  });
  assert.equal(
    listPublicTransactions().some(
      (transaction) =>
        transaction.public_slug === publicTransaction.public_slug,
    ),
    false,
  );
  const reset = workspace(buyer).public_network_profile!;
  mutate(buyer, {
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

test("public queries minimize fields, suppress demo-only firms, and never surface active deals", () => {
  const suffix = Date.now();
  const token = register({
    name: "Public Network Buyer",
    company: `Public Network Capital ${suffix}`,
    email: `public-network-buyer-${suffix}@example.test`,
    role: "buyer",
    password: "public-network-buyer-password",
  });
  const registeredBuyer = sessionUser(token)!;
  const profile = workspace(registeredBuyer).public_network_profile!;
  mutate(registeredBuyer, {
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
  const registeredSlug = workspace(registeredBuyer).organization.slug;
  const firm = getPublicFirmBySlug(registeredSlug, "buyer");
  assert.equal(firm?.slug, registeredSlug);
  assert.equal(firm?.public_description, "A public buyer profile.");
  assert.equal("fund_structure" in firm!, false);
  assert.equal("financing_profile" in firm!, false);
  assert.equal("self_reported_acquisition_count" in firm!, false);
  assert.equal("capital_source" in firm!, false);
  assert.equal("deals" in firm!, false);
  assert.ok(
    (listPublicIndustries().find(({ value }) => value === "Business services")
      ?.count ?? 0) >= 4,
  );
  assert.equal(
    getPublicIndustry("Business services")?.firms.some(
      (entry) => entry.slug === registeredSlug,
    ),
    true,
  );
  assert.ok(listPublicSitemapPaths().includes(`/buyers/${registeredSlug}`));
  assert.equal(
    listPublicSitemapPaths().includes(`/firms/${registeredSlug}`),
    false,
  );
  assert.ok(listPublicSitemapPaths().includes("/industries/business-services"));
  assert.equal(getPublicFirmBySlug("cedar", "buyer"), undefined);

  process.env.ALLOW_DEMO = "false";
  assert.equal(
    getPublicFirmBySlug("laurent-partners-demo-buyer-2", "buyer"),
    undefined,
  );
  assert.equal(
    listPublicFirms().some((entry) => entry.slug === registeredSlug),
    true,
  );
  process.env.ALLOW_DEMO = "true";
});
