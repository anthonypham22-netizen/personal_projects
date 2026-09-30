import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { seed } from "../src/lib/seed.ts";
import {
  applyMigrations,
  getMigrationHistory,
  runMigrations,
} from "../src/lib/migrations/index.ts";
import { initialUpgrade } from "../src/lib/migrations/001_initial_upgrade.ts";
import { organizationsMigration } from "../src/lib/migrations/002_organizations.ts";
import { buyerProjectsMigration } from "../src/lib/migrations/003_buyer_projects.ts";
import { sellSideMandatesMigration } from "../src/lib/migrations/004_sell_side_mandates.ts";
import { matchingEngineMigration } from "../src/lib/migrations/005_matching_engine.ts";
import { recommendedBuyersMigration } from "../src/lib/migrations/006_recommended_buyers.ts";
import { privateTeaserDistributionMigration } from "../src/lib/migrations/007_private_teaser_distribution.ts";
import { qualifiedDiscoveryMigration } from "../src/lib/migrations/008_qualified_discovery.ts";
import { buyerFunnelMigration } from "../src/lib/migrations/009_buyer_funnel.ts";
import { internalDealNotesMigration } from "../src/lib/migrations/010_internal_deal_notes.ts";
import { notificationsMigration } from "../src/lib/migrations/011_notifications.ts";
import { emailProcessingLeaseMigration } from "../src/lib/migrations/012_email_processing_lease.ts";
import { emailProcessingTokenMigration } from "../src/lib/migrations/013_email_processing_token.ts";
import { buyerVerificationMigration } from "../src/lib/migrations/014_buyer_verification.ts";
import { buyerFirmProfilesMigration } from "../src/lib/migrations/015_buyer_firm_profiles.ts";
import { buyerFirmProfileRevisionMigration } from "../src/lib/migrations/016_buyer_firm_profile_revision.ts";
import { closedTransactionsMigration } from "../src/lib/migrations/017_closed_transactions.ts";
import { buyerReputationMigration } from "../src/lib/migrations/018_buyer_reputation.ts";
import { electronicNdaMigration } from "../src/lib/migrations/019_electronic_nda.ts";
import { personalizedCimWatermarkingMigration } from "../src/lib/migrations/020_personalized_cim_watermarking.ts";
import { aiTeaserSafetyMigration } from "../src/lib/migrations/021_ai_teaser_safety.ts";
import { publicNetworkMigration } from "../src/lib/migrations/022_public_network.ts";
import { ensureInitialMatchBackfill } from "../src/lib/match-store.ts";
import { ensureBuyerFunnelBackfill } from "../src/lib/buyer-funnel.ts";

const legacySchemaSql = readFileSync(
  new URL("./fixtures/legacy-schema-v0.sql", import.meta.url),
  "utf8",
);

const migrationSummary = (database) =>
  getMigrationHistory(database).map(({ version, name }) => ({ version, name }));

const schemaObjects = (database) =>
  database
    .prepare(
      `SELECT type,name,tbl_name,sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations'
       ORDER BY type,name`,
    )
    .all()
    .map((row) => ({
      ...row,
      sql: row.sql.replace(/\s+/g, " ").trim(),
    }));

test("a fresh database migrates, seeds, and remains idempotent", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-schema-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    runMigrations(database);
    assert.deepEqual(migrationSummary(database), [
      { version: 1, name: "initial_upgrade" },
      { version: 2, name: "organizations" },
      { version: 3, name: "buyer_projects" },
      { version: 4, name: "sell_side_mandates" },
      { version: 5, name: "matching_engine" },
      { version: 6, name: "recommended_buyers" },
      { version: 7, name: "private_teaser_distribution" },
      { version: 8, name: "qualified_discovery" },
      { version: 9, name: "buyer_funnel" },
      { version: 10, name: "internal_deal_notes" },
      { version: 11, name: "notifications" },
      { version: 12, name: "email_processing_lease" },
      { version: 13, name: "email_processing_token" },
      { version: 14, name: "buyer_verification" },
      { version: 15, name: "buyer_firm_profiles" },
      { version: 16, name: "buyer_firm_profile_revision" },
      { version: 17, name: "closed_transactions" },
      { version: 18, name: "buyer_reputation" },
      { version: 19, name: "electronic_nda" },
      { version: 20, name: "personalized_cim_watermarking" },
      { version: 21, name: "ai_teaser_safety" },
      { version: 22, name: "public_network" },
    ]);

    const accessColumns = database
      .prepare("PRAGMA table_info(access)")
      .all()
      .map(({ name }) => name);
    assert.ok(accessColumns.includes("nda_method"));
    assert.ok(accessColumns.includes("electronic_signature_envelope_id"));
    assert.deepEqual(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('electronic_signature_envelopes','electronic_signature_events') ORDER BY name",
        )
        .all()
        .map((row) => ({ ...row })),
      [
        { name: "electronic_signature_envelopes" },
        { name: "electronic_signature_events" },
      ],
    );
    assert.ok(
      database
        .prepare("PRAGMA table_info(documents)")
        .all()
        .some(({ name }) => name === "watermark_enabled"),
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='document_watermark_variants'",
          )
          .get(),
      },
      { name: "document_watermark_variants" },
    );
    assert.deepEqual(
      {
        ...database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='teaser_safety_reviews'",
          )
          .get(),
      },
      { name: "teaser_safety_reviews" },
    );

    seed(database, directory);
    ensureInitialMatchBackfill(database);
    ensureBuyerFunnelBackfill(database);
    assert.equal(
      database
        .prepare(
          "SELECT value FROM matching_engine_state WHERE key='verification_gate_v1'",
        )
        .get(),
      undefined,
      "verification must not have a separate persisted match backfill",
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deals").get().count,
      6,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM users").get().count,
      5,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM documents").get().count,
      6,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM organizations").get().count,
      5,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM buyer_projects").get().count,
      2,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_financials").get()
        .count,
      18,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_matches").get().count,
      12,
    );
    assert.ok(
      database.prepare("SELECT COUNT(*) count FROM buyer_project_sectors").get()
        .count >= 2,
    );
    assert.ok(
      database
        .prepare("SELECT COUNT(*) count FROM buyer_project_provinces")
        .get().count >= 2,
    );
    assert.ok(
      database
        .prepare("SELECT COUNT(*) count FROM buyer_project_keywords")
        .get().count >= 2,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM organization_members").get()
        .count,
      5,
    );
    assert.equal(
      database
        .prepare("SELECT COUNT(*) count FROM buyer_verification_profiles")
        .get().count,
      2,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM buyer_firm_profiles").get()
        .count,
      2,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM closed_transactions").get()
        .count,
      3,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM organization_public_profiles WHERE is_public=1",
        )
        .get().count,
      4,
      "only fictional demo advisor and buyer firms are seeded as public",
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM organization_public_profiles WHERE organization_id='org-demo-owner' AND is_public=1",
        )
        .get().count,
      0,
      "the operating-business seller remains private",
    );
    assert.deepEqual(
      database
        .prepare(
          "SELECT id,public_slug,public_opt_in,verified FROM closed_transactions ORDER BY id",
        )
        .all()
        .map((row) => ({ ...row })),
      [
        {
          id: "closed-demo-evergreen-manufacturing",
          public_slug: null,
          public_opt_in: 0,
          verified: 0,
        },
        {
          id: "closed-demo-evergreen-services",
          public_slug: "industrial-services-ontario-evergreen-services",
          public_opt_in: 1,
          verified: 1,
        },
        {
          id: "closed-demo-laurent-technology",
          public_slug: "technology-quebec-laurent-technology",
          public_opt_in: 1,
          verified: 1,
        },
      ],
      "only independently verified fictional transactions are published",
    );
    const publicNetworkBeforeSecondSeed = database
      .prepare(
        `SELECT organization_id,is_public,headline,public_description,
                show_website,show_province,show_verified_transactions,revision
         FROM organization_public_profiles
         ORDER BY organization_id`,
      )
      .all();
    assert.equal(
      database
        .prepare("SELECT is_platform_admin FROM users WHERE id='demo-advisor'")
        .get().is_platform_admin,
      1,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_internal_notes").get()
        .count,
      2,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM deals WHERE owner_organization_id IS NULL OR advisor_organization_id IS NULL OR created_by_user_id IS NULL",
        )
        .get().count,
      0,
    );

    const historyBeforeSecondRun = getMigrationHistory(database);
    const schemaVersionBeforeSecondRun = database
      .prepare("PRAGMA schema_version")
      .get().schema_version;
    const changesBeforeSecondRun = database
      .prepare("SELECT total_changes() changes")
      .get().changes;
    runMigrations(database);
    assert.deepEqual(getMigrationHistory(database), historyBeforeSecondRun);
    assert.equal(
      database.prepare("PRAGMA schema_version").get().schema_version,
      schemaVersionBeforeSecondRun,
      "re-running migrations must not change the schema",
    );
    assert.equal(
      database.prepare("SELECT total_changes() changes").get().changes,
      changesBeforeSecondRun,
      "re-running migrations must not write to the database",
    );

    writeFileSync(
      path.join(directory, "uploads", "doc-cedar-fin"),
      "stale placeholder",
    );
    const profileRevisionBeforeSecondSeed = database
      .prepare(
        "SELECT revision FROM buyer_firm_profiles WHERE organization_id='org-demo-buyer'",
      )
      .get().revision;
    seed(database, directory);
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deals").get().count,
      6,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM buyer_projects").get().count,
      2,
    );
    assert.equal(
      database
        .prepare(
          "SELECT revision FROM buyer_firm_profiles WHERE organization_id='org-demo-buyer'",
        )
        .get().revision,
      profileRevisionBeforeSecondSeed,
      "re-seeding unchanged demo profile values must not invalidate open forms",
    );
    assert.deepEqual(
      database
        .prepare(
          `SELECT organization_id,is_public,headline,public_description,
                  show_website,show_province,show_verified_transactions,revision
           FROM organization_public_profiles
           ORDER BY organization_id`,
        )
        .all(),
      publicNetworkBeforeSecondSeed,
      "re-seeding public network examples must be idempotent",
    );
    for (const document of database
      .prepare("SELECT name, storage_key, size FROM documents")
      .all()) {
      const file = readFileSync(
        path.join(directory, "uploads", document.storage_key),
        "utf8",
      );
      assert.match(file, /SAMPLE TRANSACTION DOCUMENT/);
      assert.match(file, /NOT FOR RELIANCE/);
      assert.ok(
        file.length > 700,
        `${document.name} should contain realistic sample detail`,
      );
      assert.equal(Buffer.byteLength(file), document.size);
    }
    assert.match(
      readFileSync(path.join(directory, "uploads", "doc-cedar-fin"), "utf8"),
      /Revenue by service line/,
    );
    assert.match(
      readFileSync(path.join(directory, "uploads", "doc-cedar-nda"), "utf8"),
      /Governing Law/,
    );
    assert.match(
      readFileSync(path.join(directory, "uploads", "doc-summit-loi"), "utf8"),
      /Proposed Purchase Price/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO access(id,deal_id,buyer_id) VALUES('duplicate','cedar','demo-buyer')",
          )
          .run(),
      /UNIQUE constraint/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO access(id,deal_id,buyer_id) VALUES('missing','nonexistent','demo-buyer')",
          )
          .run(),
      /FOREIGN KEY constraint/,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing database upgrades to organizations without losing data", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    database.exec(legacySchemaSql);
    database
      .prepare(
        "INSERT INTO users(id,email,password_hash,name,company,role) VALUES(?,?,?,?,?,'owner')",
      )
      .run(
        "existing-owner",
        "existing@example.test",
        "preserved-hash",
        "Existing Owner",
        "Existing Co.",
      );
    database
      .prepare(
        "INSERT INTO users(id,email,password_hash,name,company,role) VALUES(?,?,?,?,?,'advisor')",
      )
      .run(
        "existing-advisor",
        "advisor@example.test",
        "preserved-advisor-hash",
        "Existing Advisor",
        "Advisor Co.",
      );
    database
      .prepare(
        `INSERT INTO deals(
          id,title,company_name,sector,province,city,revenue,ebitda,asking_price,
          employees,founded,description,confidential_summary,owner_id,advisor_id
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        "existing-deal",
        "Project Existing",
        "Existing Co.",
        "Business services",
        "Ontario",
        "Toronto",
        2_000_000,
        300_000,
        2_500_000,
        12,
        2012,
        "A legacy mandate that was originally created by an advisor.",
        "Legacy confidential summary.",
        "existing-owner",
        "existing-advisor",
      );
    database
      .prepare(
        "INSERT INTO activity(id,deal_id,actor_id,action) VALUES(?,?,?,'Created a private mandate')",
      )
      .run("existing-activity", "existing-deal", "existing-advisor");

    const before = database
      .prepare("SELECT COUNT(*) count FROM users")
      .get().count;
    runMigrations(database);

    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM users").get().count,
      before,
    );
    assert.equal(
      database
        .prepare("SELECT company FROM users WHERE id='existing-owner'")
        .get().company,
      "Existing Co.",
    );
    const migratedDeal = database
      .prepare(
        `SELECT owner_organization_id,advisor_organization_id,created_by_user_id
         FROM deals WHERE id='existing-deal'`,
      )
      .get();
    const ownerOrganization = database
      .prepare(
        "SELECT organization_id FROM organization_members WHERE user_id='existing-owner'",
      )
      .get().organization_id;
    const advisorOrganization = database
      .prepare(
        "SELECT organization_id FROM organization_members WHERE user_id='existing-advisor'",
      )
      .get().organization_id;
    assert.deepEqual(
      { ...migratedDeal },
      {
        owner_organization_id: ownerOrganization,
        advisor_organization_id: advisorOrganization,
        created_by_user_id: "existing-advisor",
      },
    );
    const history = getMigrationHistory(database);
    assert.equal(history.length, 22);
    assert.deepEqual(migrationSummary(database), [
      { version: 1, name: "initial_upgrade" },
      { version: 2, name: "organizations" },
      { version: 3, name: "buyer_projects" },
      { version: 4, name: "sell_side_mandates" },
      { version: 5, name: "matching_engine" },
      { version: 6, name: "recommended_buyers" },
      { version: 7, name: "private_teaser_distribution" },
      { version: 8, name: "qualified_discovery" },
      { version: 9, name: "buyer_funnel" },
      { version: 10, name: "internal_deal_notes" },
      { version: 11, name: "notifications" },
      { version: 12, name: "email_processing_lease" },
      { version: 13, name: "email_processing_token" },
      { version: 14, name: "buyer_verification" },
      { version: 15, name: "buyer_firm_profiles" },
      { version: 16, name: "buyer_firm_profile_revision" },
      { version: 17, name: "closed_transactions" },
      { version: 18, name: "buyer_reputation" },
      { version: 19, name: "electronic_nda" },
      { version: 20, name: "personalized_cim_watermarking" },
      { version: 21, name: "ai_teaser_safety" },
      { version: 22, name: "public_network" },
    ]);
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM organization_members WHERE user_id='existing-owner' AND role='owner' AND status='active'",
        )
        .get().count,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT name FROM organizations o JOIN organization_members om ON om.organization_id=o.id WHERE om.user_id='existing-owner'",
        )
        .get().name,
      "Existing Co.",
    );
    assert.match(history[1].applied_at, /^\d{4}-\d{2}-\d{2} /);
  } finally {
    database.close();
  }
});

test("an existing Phase 7 database adds an idempotent buyer event ledger", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase8-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    const phaseSeven = [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
      privateTeaserDistributionMigration,
      qualifiedDiscoveryMigration,
    ];
    applyMigrations(database, phaseSeven);
    seed(database, directory);
    ensureInitialMatchBackfill(database);

    applyMigrations(database, [...phaseSeven, buyerFunnelMigration]);
    ensureBuyerFunnelBackfill(database);
    const firstCount = database
      .prepare("SELECT COUNT(*) count FROM deal_buyer_events")
      .get().count;
    ensureBuyerFunnelBackfill(database);

    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_buyer_events").get()
        .count,
      firstCount,
    );
    assert.ok(firstCount > 0);
    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 9,
      name: "buyer_funnel",
    });
    assert.throws(
      () =>
        database
          .prepare(
            `INSERT INTO deal_buyer_events(
              id,deal_id,buyer_organization_id,event_type,metadata_json,source_key
            ) VALUES('bad-event','cedar','org-demo-buyer','invented','{}','bad')`,
          )
          .run(),
      /CHECK constraint/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            `INSERT INTO deal_buyer_events(
              id,deal_id,buyer_organization_id,event_type,metadata_json,source_key
            ) VALUES('bad-json','cedar','org-demo-buyer','matched','not-json','bad-json')`,
          )
          .run(),
      /CHECK constraint/,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 8 database adds constrained internal deal notes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "succera-phase9-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    const phaseEight = [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
      privateTeaserDistributionMigration,
      qualifiedDiscoveryMigration,
      buyerFunnelMigration,
    ];
    applyMigrations(database, phaseEight);
    seed(database, directory);

    applyMigrations(database, [...phaseEight, internalDealNotesMigration]);
    seed(database, directory);
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_internal_notes").get()
        .count,
      2,
      "existing demo databases receive the Phase 9 sample notes",
    );
    const historyAfterUpgrade = getMigrationHistory(database);
    const changesAfterUpgrade = database
      .prepare("SELECT total_changes() changes")
      .get().changes;
    applyMigrations(database, [...phaseEight, internalDealNotesMigration]);

    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 10,
      name: "internal_deal_notes",
    });
    assert.deepEqual(getMigrationHistory(database), historyAfterUpgrade);
    assert.equal(
      database.prepare("SELECT total_changes() changes").get().changes,
      changesAfterUpgrade,
      "re-running Phase 9 must not write to the database",
    );
    seed(database, directory);
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_internal_notes").get()
        .count,
      2,
      "re-seeding keeps Phase 9 sample notes idempotent",
    );
    database
      .prepare(
        "INSERT INTO deal_internal_notes(id,deal_id,author_user_id,body) VALUES(?,?,?,?)",
      )
      .run(
        "phase9-valid",
        "cedar",
        "demo-owner",
        "Financing evidence requested.",
      );
    assert.equal(
      database
        .prepare("SELECT body FROM deal_internal_notes WHERE id='phase9-valid'")
        .get().body,
      "Financing evidence requested.",
    );
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO deal_internal_notes(id,deal_id,author_user_id,body) VALUES('phase9-empty','cedar','demo-owner','   ')",
          )
          .run(),
      /CHECK constraint/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO deal_internal_notes(id,deal_id,author_user_id,body) VALUES('phase9-missing','missing-deal','demo-owner','Private note')",
          )
          .run(),
      /FOREIGN KEY constraint/,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 9 database adds notification infrastructure without losing private notes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "succera-phase10-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    const phaseNine = [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
      privateTeaserDistributionMigration,
      qualifiedDiscoveryMigration,
      buyerFunnelMigration,
      internalDealNotesMigration,
    ];
    applyMigrations(database, phaseNine);
    seed(database, directory);
    const notesBefore = database
      .prepare("SELECT COUNT(*) count FROM deal_internal_notes")
      .get().count;

    const phaseTen = [
      ...phaseNine,
      notificationsMigration,
      emailProcessingLeaseMigration,
      emailProcessingTokenMigration,
    ];
    applyMigrations(database, phaseTen);

    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_internal_notes").get()
        .count,
      notesBefore,
    );
    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 13,
      name: "email_processing_token",
    });
    assert.deepEqual(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('notifications','notification_preferences','email_outbox') ORDER BY name",
        )
        .all()
        .map(({ name }) => name),
      ["email_outbox", "notification_preferences", "notifications"],
    );
    assert.ok(
      database
        .prepare("PRAGMA table_info(email_outbox)")
        .all()
        .some(({ name }) => name === "processing_at"),
    );
    assert.ok(
      database
        .prepare("PRAGMA table_info(email_outbox)")
        .all()
        .some(({ name }) => name === "processing_token"),
    );
    database
      .prepare(
        `INSERT INTO notifications(
          id,user_id,type,title,body,href,source_key
        ) VALUES('phase10-notification','demo-owner','new_message','New message','A buyer sent a message.','/app/messages','phase10:message')`,
      )
      .run();
    database
      .prepare(
        "INSERT INTO notification_preferences(user_id,notification_type,frequency) VALUES('demo-owner','new_message','daily_digest')",
      )
      .run();
    database
      .prepare(
        `INSERT INTO email_outbox(
          id,notification_id,user_id,recipient_email,subject,body,frequency,status,available_at
        ) VALUES('phase10-email','phase10-notification','demo-owner','owner@example.test','New message','A buyer sent a message.','daily_digest','recorded',CURRENT_TIMESTAMP)`,
      )
      .run();
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO notification_preferences(user_id,notification_type,frequency) VALUES('demo-buyer','new_message','hourly')",
          )
          .run(),
      /CHECK constraint/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO notifications(id,user_id,type,title,body,href,source_key) VALUES('bad','demo-owner','unknown','Bad','Bad','/app','bad')",
          )
          .run(),
      /CHECK constraint/,
    );
    const changesAfterUpgrade = database
      .prepare("SELECT total_changes() changes")
      .get().changes;
    applyMigrations(database, phaseTen);
    assert.equal(
      database.prepare("SELECT total_changes() changes").get().changes,
      changesAfterUpgrade,
      "re-running Phase 10 must not write to the database",
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 10 database adds buyer verification without losing marketplace data", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "succera-phase11-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    const phaseTen = [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
      privateTeaserDistributionMigration,
      qualifiedDiscoveryMigration,
      buyerFunnelMigration,
      internalDealNotesMigration,
      notificationsMigration,
      emailProcessingLeaseMigration,
      emailProcessingTokenMigration,
    ];
    applyMigrations(database, phaseTen);
    seed(database, directory);
    const longLegacyName = `Legacy ${"Acquisition Holdings ".repeat(20)}`;
    assert.ok(longLegacyName.length > 200);
    database
      .prepare(
        "UPDATE organizations SET verification_status='verified' WHERE id='org-demo-buyer'",
      )
      .run();
    database
      .prepare(
        "UPDATE organizations SET verification_status='legacy_future_status' WHERE id='org-demo-buyer-2'",
      )
      .run();
    database
      .prepare(
        `INSERT INTO organizations(
          id,name,slug,organization_type,province,verification_status
        ) VALUES('legacy-long-buyer',?,?, 'buyer','Ontario','verified')`,
      )
      .run(longLegacyName, "legacy-long-buyer");
    database
      .prepare(
        `INSERT INTO organizations(
          id,name,slug,organization_type,province,verification_status
        ) VALUES('legacy-unknown-buyer','Legacy Unknown Buyer','legacy-unknown-buyer','buyer','Québec','legacy_future_status')`,
      )
      .run();
    ensureInitialMatchBackfill(database);
    const before = {
      users: database.prepare("SELECT COUNT(*) count FROM users").get().count,
      deals: database.prepare("SELECT COUNT(*) count FROM deals").get().count,
      projects: database
        .prepare("SELECT COUNT(*) count FROM buyer_projects")
        .get().count,
      organizations: database
        .prepare("SELECT COUNT(*) count FROM organizations")
        .get().count,
      notifications: database
        .prepare("SELECT COUNT(*) count FROM notifications")
        .get().count,
      matches: database.prepare("SELECT COUNT(*) count FROM deal_matches").get()
        .count,
    };
    const matchBefore = database
      .prepare(
        `SELECT id,deal_id,buyer_project_id,buyer_organization_id,score,
           eligible,score_breakdown_json,status,created_at,updated_at
         FROM deal_matches ORDER BY id LIMIT 1`,
      )
      .get();
    assert.ok(matchBefore, "Phase 10 fixture should contain an existing match");

    applyMigrations(database, [...phaseTen, buyerVerificationMigration]);

    assert.deepEqual(
      {
        users: database.prepare("SELECT COUNT(*) count FROM users").get().count,
        deals: database.prepare("SELECT COUNT(*) count FROM deals").get().count,
        projects: database
          .prepare("SELECT COUNT(*) count FROM buyer_projects")
          .get().count,
        organizations: database
          .prepare("SELECT COUNT(*) count FROM organizations")
          .get().count,
        notifications: database
          .prepare("SELECT COUNT(*) count FROM notifications")
          .get().count,
        matches: database
          .prepare("SELECT COUNT(*) count FROM deal_matches")
          .get().count,
      },
      before,
    );
    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 14,
      name: "buyer_verification",
    });
    assert.equal(
      database
        .prepare("SELECT COUNT(*) count FROM buyer_verification_profiles")
        .get().count,
      database
        .prepare(
          `SELECT COUNT(*) count FROM organizations
           WHERE organization_type IN (
             'buyer','private_equity','family_office','search_fund',
             'independent_sponsor','strategic'
           )`,
        )
        .get().count,
    );
    assert.deepEqual(
      database
        .prepare(
          `SELECT id,verification_status FROM organizations
           WHERE id IN (
             'legacy-long-buyer','legacy-unknown-buyer',
             'org-demo-buyer','org-demo-buyer-2'
           ) ORDER BY id`,
        )
        .all()
        .map((row) => ({ ...row })),
      [
        { id: "legacy-long-buyer", verification_status: "verified_acquirer" },
        { id: "legacy-unknown-buyer", verification_status: "unverified" },
        { id: "org-demo-buyer", verification_status: "verified_acquirer" },
        { id: "org-demo-buyer-2", verification_status: "unverified" },
      ],
    );
    assert.equal(
      database
        .prepare(
          "SELECT legal_name FROM buyer_verification_profiles WHERE organization_id='legacy-long-buyer'",
        )
        .get().legal_name,
      longLegacyName,
    );
    assert.deepEqual(
      database
        .prepare(
          `SELECT id,deal_id,buyer_project_id,buyer_organization_id,score,
             eligible,score_breakdown_json,status,created_at,updated_at
           FROM deal_matches ORDER BY id LIMIT 1`,
        )
        .get(),
      matchBefore,
      "existing matches must not be rewritten during verification migration",
    );

    const historyAfterUpgrade = getMigrationHistory(database);
    const schemaVersionAfterUpgrade = database
      .prepare("PRAGMA schema_version")
      .get().schema_version;
    const changesAfterUpgrade = database
      .prepare("SELECT total_changes() changes")
      .get().changes;
    applyMigrations(database, [...phaseTen, buyerVerificationMigration]);
    assert.deepEqual(getMigrationHistory(database), historyAfterUpgrade);
    assert.equal(
      database.prepare("PRAGMA schema_version").get().schema_version,
      schemaVersionAfterUpgrade,
      "re-running Phase 11 initialization must not change the schema",
    );
    assert.equal(
      database.prepare("SELECT total_changes() changes").get().changes,
      changesAfterUpgrade,
      "re-running Phase 11 initialization must not write to the database",
    );

    seed(database, directory);
    seed(database, directory);
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_matches").get().count,
      before.matches,
      "repeated initialization must preserve existing matches",
    );
    assert.equal(
      database
        .prepare(
          "SELECT legal_name FROM buyer_verification_profiles WHERE organization_id='legacy-long-buyer'",
        )
        .get().legal_name,
      longLegacyName,
      "repeated initialization must preserve the legacy legal name",
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("buyer verification schema constrains statuses, decisions, and cheque ranges", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    runMigrations(database);
    database
      .prepare(
        "INSERT INTO users(id,email,password_hash,name,company,role) VALUES('reviewer','reviewer@example.test','hash','Reviewer','Succera','advisor')",
      )
      .run();
    database
      .prepare(
        "INSERT INTO users(id,email,password_hash,name,company,role) VALUES('buyer','buyer@example.test','hash','Buyer','Buyer Co.','buyer')",
      )
      .run();
    database
      .prepare(
        "INSERT INTO organizations(id,name,slug,organization_type) VALUES('buyer-org','Buyer Co.','buyer-co','buyer')",
      )
      .run();

    assert.throws(() =>
      database
        .prepare(
          "UPDATE organizations SET verification_status='accredited' WHERE id='buyer-org'",
        )
        .run(),
    );
    assert.throws(() =>
      database
        .prepare(
          `INSERT INTO buyer_verification_profiles(
             organization_id,min_equity_check,max_equity_check
           ) VALUES('buyer-org',200,100)`,
        )
        .run(),
    );
    database
      .prepare(
        "INSERT INTO buyer_verification_profiles(organization_id,legal_name) VALUES('buyer-org','Buyer Co. Inc.')",
      )
      .run();
    assert.throws(() =>
      database
        .prepare(
          `INSERT INTO verification_reviews(
             id,organization_id,reviewer_user_id,previous_status,decision,notes
           ) VALUES('review','buyer-org','reviewer','unverified','accredited','Reviewed')`,
        )
        .run(),
    );
  } finally {
    database.close();
  }
});

test("an existing Phase 11 database gains private buyer firm profiles without losing marketplace data", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase12-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    const phaseEleven = [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
      privateTeaserDistributionMigration,
      qualifiedDiscoveryMigration,
      buyerFunnelMigration,
      internalDealNotesMigration,
      notificationsMigration,
      emailProcessingLeaseMigration,
      emailProcessingTokenMigration,
      buyerVerificationMigration,
    ];
    applyMigrations(database, phaseEleven);
    seed(database, directory);
    ensureInitialMatchBackfill(database);
    database
      .prepare(
        "UPDATE buyer_verification_profiles SET acquisition_history='Preserve this private evidence' WHERE organization_id='org-demo-buyer'",
      )
      .run();
    const before = {
      users: database.prepare("SELECT COUNT(*) count FROM users").get().count,
      deals: database.prepare("SELECT COUNT(*) count FROM deals").get().count,
      projects: database
        .prepare("SELECT COUNT(*) count FROM buyer_projects")
        .get().count,
      matches: database.prepare("SELECT COUNT(*) count FROM deal_matches").get()
        .count,
    };

    applyMigrations(database, [...phaseEleven, buyerFirmProfilesMigration]);

    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 15,
      name: "buyer_firm_profiles",
    });
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM buyer_firm_profiles").get()
        .count,
      database
        .prepare(
          `SELECT COUNT(*) count FROM organizations
           WHERE organization_type IN (
             'buyer','private_equity','family_office','search_fund',
             'independent_sponsor','strategic'
           )`,
        )
        .get().count,
    );
    assert.equal(
      database
        .prepare(
          "SELECT self_reported_acquisition_count FROM buyer_firm_profiles WHERE organization_id='org-demo-buyer'",
        )
        .get().self_reported_acquisition_count,
      null,
      "migration backfill must leave an unreported acquisition count unset",
    );
    assert.deepEqual(
      {
        users: database.prepare("SELECT COUNT(*) count FROM users").get().count,
        deals: database.prepare("SELECT COUNT(*) count FROM deals").get().count,
        projects: database
          .prepare("SELECT COUNT(*) count FROM buyer_projects")
          .get().count,
        matches: database
          .prepare("SELECT COUNT(*) count FROM deal_matches")
          .get().count,
      },
      before,
    );
    assert.equal(
      database
        .prepare(
          "SELECT acquisition_history FROM buyer_verification_profiles WHERE organization_id='org-demo-buyer'",
        )
        .get().acquisition_history,
      "Preserve this private evidence",
    );
    assert.throws(() =>
      database
        .prepare(
          "UPDATE buyer_firm_profiles SET self_reported_acquisition_count=-1 WHERE organization_id='org-demo-buyer'",
        )
        .run(),
    );
    assert.doesNotThrow(() =>
      database
        .prepare(
          "UPDATE buyer_firm_profiles SET self_reported_acquisition_count=NULL WHERE organization_id='org-demo-buyer'",
        )
        .run(),
    );

    const history = getMigrationHistory(database);
    const schemaVersion = database
      .prepare("PRAGMA schema_version")
      .get().schema_version;
    const changes = database
      .prepare("SELECT total_changes() changes")
      .get().changes;
    applyMigrations(database, [...phaseEleven, buyerFirmProfilesMigration]);
    assert.deepEqual(getMigrationHistory(database), history);
    assert.equal(
      database.prepare("PRAGMA schema_version").get().schema_version,
      schemaVersion,
    );
    assert.equal(
      database.prepare("SELECT total_changes() changes").get().changes,
      changes,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 12 preview profile table gains nullable counts and revisions", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    const phaseEleven = [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
      privateTeaserDistributionMigration,
      qualifiedDiscoveryMigration,
      buyerFunnelMigration,
      internalDealNotesMigration,
      notificationsMigration,
      emailProcessingLeaseMigration,
      emailProcessingTokenMigration,
      buyerVerificationMigration,
    ];
    applyMigrations(database, phaseEleven);
    database.exec(`
      CREATE TABLE buyer_firm_profiles (
        organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
        fund_structure TEXT NOT NULL DEFAULT '',
        financing_profile TEXT NOT NULL DEFAULT '',
        self_reported_acquisition_count INTEGER NOT NULL DEFAULT 0,
        updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO organizations(id,name,slug,organization_type)
      VALUES('legacy-profile-org','Legacy Profile Co.','legacy-profile','buyer');
      INSERT INTO organizations(id,name,slug,organization_type)
      VALUES('legacy-empty-profile-org','Legacy Empty Profile Co.','legacy-empty-profile','buyer');
      INSERT INTO buyer_firm_profiles(organization_id,fund_structure)
      VALUES('legacy-profile-org','Preserve this profile');
      INSERT INTO buyer_firm_profiles(organization_id)
      VALUES('legacy-empty-profile-org');
      INSERT INTO schema_migrations(version,name)
      VALUES(15,'buyer_firm_profiles');
    `);

    applyMigrations(database, [
      ...phaseEleven,
      buyerFirmProfilesMigration,
      buyerFirmProfileRevisionMigration,
    ]);

    assert.equal(
      database
        .prepare(
          "SELECT fund_structure,revision FROM buyer_firm_profiles WHERE organization_id='legacy-profile-org'",
        )
        .get().revision,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT fund_structure FROM buyer_firm_profiles WHERE organization_id='legacy-profile-org'",
        )
        .get().fund_structure,
      "Preserve this profile",
    );
    assert.equal(
      database
        .prepare(
          "SELECT self_reported_acquisition_count FROM buyer_firm_profiles WHERE organization_id='legacy-profile-org'",
        )
        .get().self_reported_acquisition_count,
      0,
      "a zero alongside profile content is preserved",
    );
    assert.equal(
      database
        .prepare(
          "SELECT self_reported_acquisition_count FROM buyer_firm_profiles WHERE organization_id='legacy-empty-profile-org'",
        )
        .get().self_reported_acquisition_count,
      null,
      "an untouched preview default is converted back to unknown",
    );
    assert.equal(
      database
        .prepare("PRAGMA table_info(buyer_firm_profiles)")
        .all()
        .find((column) => column.name === "self_reported_acquisition_count")
        .notnull,
      0,
    );
    assert.doesNotThrow(() =>
      database
        .prepare(
          "UPDATE buyer_firm_profiles SET self_reported_acquisition_count=NULL WHERE organization_id='legacy-profile-org'",
        )
        .run(),
    );
  } finally {
    database.close();
  }
});

test("an existing Phase 12 database adds constrained transaction tombstones without rewriting marketplace data", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase13-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    const phaseTwelve = [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
      privateTeaserDistributionMigration,
      qualifiedDiscoveryMigration,
      buyerFunnelMigration,
      internalDealNotesMigration,
      notificationsMigration,
      emailProcessingLeaseMigration,
      emailProcessingTokenMigration,
      buyerVerificationMigration,
      buyerFirmProfilesMigration,
      buyerFirmProfileRevisionMigration,
    ];
    applyMigrations(database, phaseTwelve);
    seed(database, directory);
    ensureInitialMatchBackfill(database);
    const before = {
      users: database.prepare("SELECT COUNT(*) count FROM users").get().count,
      deals: database.prepare("SELECT COUNT(*) count FROM deals").get().count,
      projects: database
        .prepare("SELECT COUNT(*) count FROM buyer_projects")
        .get().count,
      matches: database.prepare("SELECT COUNT(*) count FROM deal_matches").get()
        .count,
      firmProfiles: database
        .prepare("SELECT COUNT(*) count FROM buyer_firm_profiles")
        .get().count,
    };

    applyMigrations(database, [...phaseTwelve, closedTransactionsMigration]);
    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 17,
      name: "closed_transactions",
    });
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM closed_transactions").get()
        .count,
      0,
      "the migration must not invent historical transactions",
    );
    assert.deepEqual(
      {
        users: database.prepare("SELECT COUNT(*) count FROM users").get().count,
        deals: database.prepare("SELECT COUNT(*) count FROM deals").get().count,
        projects: database
          .prepare("SELECT COUNT(*) count FROM buyer_projects")
          .get().count,
        matches: database
          .prepare("SELECT COUNT(*) count FROM deal_matches")
          .get().count,
        firmProfiles: database
          .prepare("SELECT COUNT(*) count FROM buyer_firm_profiles")
          .get().count,
      },
      before,
    );

    seed(database, directory);
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM closed_transactions").get()
        .count,
      3,
    );
    assert.equal(
      database
        .prepare(
          "SELECT verified FROM closed_transactions WHERE id='closed-demo-evergreen-manufacturing'",
        )
        .get().verified,
      0,
      "self-reported history must remain explicitly unverified",
    );
    assert.throws(() =>
      database
        .prepare(
          `INSERT INTO closed_transactions(
             id,buyer_organization_id,industry,province,closed_date,
             description,verified
           ) VALUES(
             'invalid-verified','org-demo-buyer','Services','Ontario',
             '2025-01-31','A valid-length description',1
           )`,
        )
        .run(),
    );
    assert.throws(() =>
      database
        .prepare(
          `INSERT INTO closed_transactions(
             id,buyer_organization_id,industry,province,closed_date,description
           ) VALUES(
             'invalid-date','org-demo-buyer','Services','Ontario',
             '2025-02-31','A valid-length description'
           )`,
        )
        .run(),
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 13 database adds reputation indexes without inventing metrics", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase14-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    const phaseThirteen = [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
      privateTeaserDistributionMigration,
      qualifiedDiscoveryMigration,
      buyerFunnelMigration,
      internalDealNotesMigration,
      notificationsMigration,
      emailProcessingLeaseMigration,
      emailProcessingTokenMigration,
      buyerVerificationMigration,
      buyerFirmProfilesMigration,
      buyerFirmProfileRevisionMigration,
      closedTransactionsMigration,
    ];
    applyMigrations(database, phaseThirteen);
    seed(database, directory);
    ensureInitialMatchBackfill(database);
    ensureBuyerFunnelBackfill(database);
    const before = {
      events: database
        .prepare("SELECT COUNT(*) count FROM deal_buyer_events")
        .get().count,
      transactions: database
        .prepare("SELECT COUNT(*) count FROM closed_transactions")
        .get().count,
    };

    applyMigrations(database, [...phaseThirteen, buyerReputationMigration]);

    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 18,
      name: "buyer_reputation",
    });
    assert.deepEqual(
      {
        events: database
          .prepare("SELECT COUNT(*) count FROM deal_buyer_events")
          .get().count,
        transactions: database
          .prepare("SELECT COUNT(*) count FROM closed_transactions")
          .get().count,
      },
      before,
      "reputation remains derived from existing evidence",
    );
    assert.deepEqual(
      database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type='index' AND name IN (
             'idx_deal_buyer_events_reputation',
             'idx_closed_transactions_reputation'
           ) ORDER BY name`,
        )
        .all()
        .map(({ name }) => name),
      [
        "idx_closed_transactions_reputation",
        "idx_deal_buyer_events_reputation",
      ],
    );
    const history = getMigrationHistory(database);
    applyMigrations(database, [...phaseThirteen, buyerReputationMigration]);
    assert.deepEqual(getMigrationHistory(database), history);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 14 database adds electronic NDA ledgers without changing access", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase15-"));
  const database = new DatabaseSync(":memory:");
  const phaseFourteen = [
    initialUpgrade,
    organizationsMigration,
    buyerProjectsMigration,
    sellSideMandatesMigration,
    matchingEngineMigration,
    recommendedBuyersMigration,
    privateTeaserDistributionMigration,
    qualifiedDiscoveryMigration,
    buyerFunnelMigration,
    internalDealNotesMigration,
    notificationsMigration,
    emailProcessingLeaseMigration,
    emailProcessingTokenMigration,
    buyerVerificationMigration,
    buyerFirmProfilesMigration,
    buyerFirmProfileRevisionMigration,
    closedTransactionsMigration,
    buyerReputationMigration,
  ];
  try {
    database.exec("PRAGMA foreign_keys=ON");
    applyMigrations(database, phaseFourteen);
    seed(database, directory);
    const before = database
      .prepare(
        "SELECT id,deal_id,buyer_id,status,nda_status,nda_document_id,notes,created_at FROM access ORDER BY id",
      )
      .all()
      .map((row) => ({ ...row }));

    applyMigrations(database, [...phaseFourteen, electronicNdaMigration]);

    const after = database
      .prepare(
        "SELECT id,deal_id,buyer_id,status,nda_status,nda_document_id,notes,created_at FROM access ORDER BY id",
      )
      .all()
      .map((row) => ({ ...row }));
    assert.deepEqual(after, before);
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM access WHERE nda_method='external_upload' AND electronic_signature_envelope_id IS NULL",
        )
        .get().count,
      before.length,
    );
    assert.equal(
      database
        .prepare("SELECT COUNT(*) count FROM electronic_signature_envelopes")
        .get().count,
      0,
    );
    assert.equal(
      database
        .prepare("SELECT COUNT(*) count FROM electronic_signature_events")
        .get().count,
      0,
    );
    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 19,
      name: "electronic_nda",
    });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 15 database adds watermark caching without changing documents", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase16-"));
  const database = new DatabaseSync(":memory:");
  const phaseFifteen = [
    initialUpgrade,
    organizationsMigration,
    buyerProjectsMigration,
    sellSideMandatesMigration,
    matchingEngineMigration,
    recommendedBuyersMigration,
    privateTeaserDistributionMigration,
    qualifiedDiscoveryMigration,
    buyerFunnelMigration,
    internalDealNotesMigration,
    notificationsMigration,
    emailProcessingLeaseMigration,
    emailProcessingTokenMigration,
    buyerVerificationMigration,
    buyerFirmProfilesMigration,
    buyerFirmProfileRevisionMigration,
    closedTransactionsMigration,
    buyerReputationMigration,
    electronicNdaMigration,
  ];
  try {
    database.exec("PRAGMA foreign_keys=ON");
    applyMigrations(database, phaseFifteen);
    seed(database, directory);
    const before = database
      .prepare(
        `SELECT id,deal_id,name,storage_key,mime,category,size,version,
           audience,buyer_id,uploaded_by,created_at
         FROM documents ORDER BY id`,
      )
      .all()
      .map((row) => ({ ...row }));

    applyMigrations(database, [
      ...phaseFifteen,
      personalizedCimWatermarkingMigration,
    ]);

    const after = database
      .prepare(
        `SELECT id,deal_id,name,storage_key,mime,category,size,version,
           audience,buyer_id,uploaded_by,created_at
         FROM documents ORDER BY id`,
      )
      .all()
      .map((row) => ({ ...row }));
    assert.deepEqual(after, before);
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM documents WHERE watermark_enabled<>0",
        )
        .get().count,
      0,
    );
    assert.equal(
      database
        .prepare("SELECT COUNT(*) count FROM document_watermark_variants")
        .get().count,
      0,
    );
    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 20,
      name: "personalized_cim_watermarking",
    });
    const history = getMigrationHistory(database);
    applyMigrations(database, [
      ...phaseFifteen,
      personalizedCimWatermarkingMigration,
    ]);
    assert.deepEqual(getMigrationHistory(database), history);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 16 database adds private teaser review history without changing deals", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase17-"));
  const database = new DatabaseSync(":memory:");
  const phaseSixteen = [
    initialUpgrade,
    organizationsMigration,
    buyerProjectsMigration,
    sellSideMandatesMigration,
    matchingEngineMigration,
    recommendedBuyersMigration,
    privateTeaserDistributionMigration,
    qualifiedDiscoveryMigration,
    buyerFunnelMigration,
    internalDealNotesMigration,
    notificationsMigration,
    emailProcessingLeaseMigration,
    emailProcessingTokenMigration,
    buyerVerificationMigration,
    buyerFirmProfilesMigration,
    buyerFirmProfileRevisionMigration,
    closedTransactionsMigration,
    buyerReputationMigration,
    electronicNdaMigration,
    personalizedCimWatermarkingMigration,
  ];
  try {
    database.exec("PRAGMA foreign_keys=ON");
    applyMigrations(database, phaseSixteen);
    seed(database, directory);
    const before = database
      .prepare("SELECT * FROM deals ORDER BY id")
      .all()
      .map((row) => ({ ...row }));

    applyMigrations(database, [...phaseSixteen, aiTeaserSafetyMigration]);

    assert.deepEqual(
      database
        .prepare("SELECT * FROM deals ORDER BY id")
        .all()
        .map((row) => ({ ...row })),
      before,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM teaser_safety_reviews").get()
        .count,
      0,
    );
    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 21,
      name: "ai_teaser_safety",
    });
    const history = getMigrationHistory(database);
    applyMigrations(database, [...phaseSixteen, aiTeaserSafetyMigration]);
    assert.deepEqual(getMigrationHistory(database), history);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 17 database adds default-private public network state without changing transaction history", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase18-"));
  const database = new DatabaseSync(":memory:");
  const phaseTwentyOne = [
    initialUpgrade,
    organizationsMigration,
    buyerProjectsMigration,
    sellSideMandatesMigration,
    matchingEngineMigration,
    recommendedBuyersMigration,
    privateTeaserDistributionMigration,
    qualifiedDiscoveryMigration,
    buyerFunnelMigration,
    internalDealNotesMigration,
    notificationsMigration,
    emailProcessingLeaseMigration,
    emailProcessingTokenMigration,
    buyerVerificationMigration,
    buyerFirmProfilesMigration,
    buyerFirmProfileRevisionMigration,
    closedTransactionsMigration,
    buyerReputationMigration,
    electronicNdaMigration,
    personalizedCimWatermarkingMigration,
    aiTeaserSafetyMigration,
  ];
  try {
    database.exec("PRAGMA foreign_keys=ON");
    applyMigrations(database, phaseTwentyOne);
    seed(database, directory);
    const beforeTransactions = database
      .prepare(
        `SELECT id,buyer_organization_id,seller_organization_id,
           advisor_organization_id,industry,province,enterprise_value,
           closed_date,description,verified,created_by_user_id,
           verified_by_user_id,verified_at
         FROM closed_transactions ORDER BY id`,
      )
      .all()
      .map((row) => ({ ...row }));

    applyMigrations(database, [...phaseTwentyOne, publicNetworkMigration]);

    assert.deepEqual(
      database
        .prepare(
          `SELECT id,buyer_organization_id,seller_organization_id,
             advisor_organization_id,industry,province,enterprise_value,
             closed_date,description,verified,created_by_user_id,
             verified_by_user_id,verified_at
           FROM closed_transactions ORDER BY id`,
        )
        .all()
        .map((row) => ({ ...row })),
      beforeTransactions,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM organization_public_profiles WHERE is_public=0 AND revision=1",
        )
        .get().count,
      database.prepare("SELECT COUNT(*) count FROM organizations").get().count,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM closed_transactions WHERE public_slug IS NULL AND public_opt_in=0",
        )
        .get().count,
      beforeTransactions.length,
    );
    assert.equal(
      database
        .prepare("SELECT COUNT(*) count FROM organization_public_industries")
        .get().count,
      0,
    );
    assert.equal(
      database
        .prepare("SELECT COUNT(*) count FROM organization_public_locations")
        .get().count,
      0,
    );
    const history = getMigrationHistory(database);
    applyMigrations(database, [...phaseTwentyOne, publicNetworkMigration]);
    assert.deepEqual(getMigrationHistory(database), history);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 6 database adds controlled introduction requests without losing outreach", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase7-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    const phaseSix = [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
      privateTeaserDistributionMigration,
    ];
    applyMigrations(database, phaseSix);
    seed(database, directory);
    ensureInitialMatchBackfill(database);
    const outreachBefore = database
      .prepare("SELECT COUNT(*) count FROM deal_outreach")
      .get().count;

    applyMigrations(database, [...phaseSix, qualifiedDiscoveryMigration]);

    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_outreach").get().count,
      outreachBefore,
    );
    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 8,
      name: "qualified_discovery",
    });
    const project = database
      .prepare(
        "SELECT id,organization_id,created_by_user_id FROM buyer_projects ORDER BY id LIMIT 1",
      )
      .get();
    database
      .prepare(
        `INSERT INTO introduction_requests(
          id,deal_id,buyer_organization_id,buyer_project_id,requested_by_user_id,message
        ) VALUES('intro','cedar',?,?,?,'We are a credible acquirer with relevant operating experience.')`,
      )
      .run(project.organization_id, project.id, project.created_by_user_id);
    assert.throws(
      () =>
        database
          .prepare(
            `INSERT INTO introduction_requests(
              id,deal_id,buyer_organization_id,buyer_project_id,requested_by_user_id,message
            ) VALUES('duplicate','cedar',?,?,?,'A second project cannot bypass the existing firm decision.')`,
          )
          .run(project.organization_id, project.id, project.created_by_user_id),
      /UNIQUE constraint/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "UPDATE introduction_requests SET status='accepted' WHERE id='intro'",
          )
          .run(),
      /CHECK constraint/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "UPDATE introduction_requests SET message='Too short' WHERE id='intro'",
          )
          .run(),
      /CHECK constraint/,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 5 database adds private teaser distribution without losing matches", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase6-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    applyMigrations(database, [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
    ]);
    seed(database, directory);
    ensureInitialMatchBackfill(database);
    const matchesBefore = database
      .prepare("SELECT COUNT(*) count FROM deal_matches")
      .get().count;

    applyMigrations(database, [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
      privateTeaserDistributionMigration,
    ]);

    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_matches").get().count,
      matchesBefore,
    );
    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 7,
      name: "private_teaser_distribution",
    });
    const selected = database
      .prepare(
        "SELECT * FROM deal_matches WHERE eligible=1 ORDER BY score DESC LIMIT 1",
      )
      .get();
    database
      .prepare(
        "INSERT INTO deal_outreach(id,deal_id,sender_user_id,subject,message) VALUES('outreach','cedar','demo-owner','Private opportunity','A confidential Canadian opportunity matches your mandate.')",
      )
      .run();
    database
      .prepare(
        "INSERT INTO deal_outreach_recipients(id,outreach_id,buyer_organization_id,buyer_project_id,status,sent_at) VALUES('recipient','outreach',?,?, 'sent',CURRENT_TIMESTAMP)",
      )
      .run(selected.buyer_organization_id, selected.buyer_project_id);
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO deal_outreach_recipients(id,outreach_id,buyer_organization_id,buyer_project_id,status) VALUES('duplicate','outreach',?,?, 'queued')",
          )
          .run(selected.buyer_organization_id, selected.buyer_project_id),
      /UNIQUE constraint/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "UPDATE deal_outreach_recipients SET status='opened' WHERE id='recipient'",
          )
          .run(),
      /CHECK constraint/,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 2 database upgrades sell-side mandates without losing deals", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase3-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    applyMigrations(database, [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
    ]);
    seed(database, directory);
    const dealsBefore = database
      .prepare("SELECT COUNT(*) count FROM deals")
      .get().count;

    applyMigrations(database, [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
    ]);

    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deals").get().count,
      dealsBefore,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM deals WHERE published=1 AND distribution_mode='qualified_discovery'",
        )
        .get().count,
      5,
    );
    assert.equal(
      database
        .prepare("SELECT distribution_mode FROM deals WHERE id='atlas'")
        .get().distribution_mode,
      "private_outreach",
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_financials").get()
        .count,
      0,
    );
    seed(database, directory);
    ensureInitialMatchBackfill(database);
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_financials").get()
        .count,
      18,
    );
    assert.deepEqual(migrationSummary(database), [
      { version: 1, name: "initial_upgrade" },
      { version: 2, name: "organizations" },
      { version: 3, name: "buyer_projects" },
      { version: 4, name: "sell_side_mandates" },
      { version: 5, name: "matching_engine" },
    ]);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 3 database backfills matching history without losing marketplace data", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase4-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    applyMigrations(database, [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
    ]);
    seed(database, directory);
    const before = {
      users: database.prepare("SELECT COUNT(*) count FROM users").get().count,
      deals: database.prepare("SELECT COUNT(*) count FROM deals").get().count,
      projects: database
        .prepare("SELECT COUNT(*) count FROM buyer_projects")
        .get().count,
      financials: database
        .prepare("SELECT COUNT(*) count FROM deal_financials")
        .get().count,
    };

    applyMigrations(database, [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
    ]);
    ensureInitialMatchBackfill(database);

    assert.deepEqual(
      {
        users: database.prepare("SELECT COUNT(*) count FROM users").get().count,
        deals: database.prepare("SELECT COUNT(*) count FROM deals").get().count,
        projects: database
          .prepare("SELECT COUNT(*) count FROM buyer_projects")
          .get().count,
        financials: database
          .prepare("SELECT COUNT(*) count FROM deal_financials")
          .get().count,
      },
      before,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_matches").get().count,
      before.deals * before.projects,
    );
    const changes = database
      .prepare("SELECT total_changes() value")
      .get().value;
    ensureInitialMatchBackfill(database);
    assert.equal(
      database.prepare("SELECT total_changes() value").get().value,
      changes,
      "the initial backfill must run only once",
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an existing Phase 4 database upgrades recommendation statuses without losing matches", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase5-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    applyMigrations(database, [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
    ]);
    seed(database, directory);
    ensureInitialMatchBackfill(database);
    const matches = database
      .prepare("SELECT id FROM deal_matches ORDER BY id LIMIT 2")
      .all();
    database
      .prepare("UPDATE deal_matches SET status='shortlisted' WHERE id=?")
      .run(matches[0].id);
    database
      .prepare("UPDATE deal_matches SET status='dismissed' WHERE id=?")
      .run(matches[1].id);
    const countBefore = database
      .prepare("SELECT COUNT(*) count FROM deal_matches")
      .get().count;

    applyMigrations(database, [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
      sellSideMandatesMigration,
      matchingEngineMigration,
      recommendedBuyersMigration,
    ]);

    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deal_matches").get().count,
      countBefore,
    );
    assert.equal(
      database
        .prepare("SELECT status FROM deal_matches WHERE id=?")
        .get(matches[0].id).status,
      "selected",
    );
    const excluded = database
      .prepare(
        "SELECT status,eligible,score_breakdown_json FROM deal_matches WHERE id=?",
      )
      .get(matches[1].id);
    assert.deepEqual(
      { status: excluded.status, eligible: excluded.eligible },
      { status: "excluded", eligible: 0 },
    );
    assert.match(excluded.score_breakdown_json, /seller excluded/i);
    assert.throws(
      () =>
        database
          .prepare("UPDATE deal_matches SET status='shortlisted' WHERE id=?")
          .run(matches[0].id),
      /CHECK constraint/,
    );
    assert.deepEqual(migrationSummary(database).at(-1), {
      version: 6,
      name: "recommended_buyers",
    });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("sell-side mandate constraints reject unsafe distribution and financial data", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    runMigrations(database);
    database
      .prepare(
        "INSERT INTO users(id,email,password_hash,name,company,role) VALUES('seller','seller@example.test','hash','Seller','Seller Co.','owner')",
      )
      .run();
    database
      .prepare(
        `INSERT INTO deals(
          id,title,company_name,sector,province,city,revenue,ebitda,asking_price,
          employees,founded,description,confidential_summary,owner_id
        ) VALUES('mandate','Project Mandate','Seller Co.','Manufacturing','Ontario','Toronto',100,20,120,5,2015,'A sufficiently detailed anonymous opportunity description.','Private','seller')`,
      )
      .run();

    assert.throws(
      () =>
        database
          .prepare(
            "UPDATE deals SET distribution_mode='public_classified' WHERE id='mandate'",
          )
          .run(),
      /CHECK constraint/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "UPDATE deals SET ownership_percentage_available=101 WHERE id='mandate'",
          )
          .run(),
      /CHECK constraint/,
    );
    database
      .prepare(
        "INSERT INTO deal_financials(id,deal_id,fiscal_year,period_type,revenue,ebitda,gross_profit,is_projected) VALUES('financial','mandate',2025,'annual',100,20,60,0)",
      )
      .run();
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO deal_financials(id,deal_id,fiscal_year,period_type,revenue,ebitda,gross_profit,is_projected) VALUES('duplicate','mandate',2025,'annual',110,25,65,0)",
          )
          .run(),
      /UNIQUE constraint/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO deal_financials(id,deal_id,fiscal_year,period_type,revenue,ebitda,gross_profit,is_projected) VALUES('negative','mandate',2024,'annual',-1,20,60,0)",
          )
          .run(),
      /CHECK constraint/,
    );
  } finally {
    database.close();
  }
});

test("matching records enforce uniqueness, valid scores, and valid explanations", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-matches-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    runMigrations(database);
    seed(database, directory);
    ensureInitialMatchBackfill(database);
    const existing = database
      .prepare("SELECT * FROM deal_matches LIMIT 1")
      .get();
    assert.ok(existing);
    assert.throws(() =>
      database
        .prepare(
          `INSERT INTO deal_matches(
            id,deal_id,buyer_project_id,buyer_organization_id,score,eligible,
            score_breakdown_json,status
          ) VALUES('duplicate',?,?,?,?,?,?,?)`,
        )
        .run(
          existing.deal_id,
          existing.buyer_project_id,
          existing.buyer_organization_id,
          50,
          1,
          '{"reasons":[]}',
          "recommended",
        ),
    );
    assert.throws(() =>
      database
        .prepare("UPDATE deal_matches SET score=101 WHERE id=?")
        .run(existing.id),
    );
    assert.throws(() =>
      database
        .prepare(
          "UPDATE deal_matches SET score_breakdown_json='nope' WHERE id=?",
        )
        .run(existing.id),
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("an already-seeded Phase 1 demo database receives idempotent buyer projects", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-phase2-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    applyMigrations(database, [initialUpgrade, organizationsMigration]);
    seed(database, directory);
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='buyer_projects'",
        )
        .get().count,
      0,
    );

    applyMigrations(database, [
      initialUpgrade,
      organizationsMigration,
      buyerProjectsMigration,
    ]);
    seed(database, directory);
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM buyer_projects").get().count,
      2,
    );
    const filterCounts = () => ({
      sectors: database
        .prepare("SELECT COUNT(*) count FROM buyer_project_sectors")
        .get().count,
      provinces: database
        .prepare("SELECT COUNT(*) count FROM buyer_project_provinces")
        .get().count,
      keywords: database
        .prepare("SELECT COUNT(*) count FROM buyer_project_keywords")
        .get().count,
    });
    assert.deepEqual(filterCounts(), {
      sectors: 3,
      provinces: 4,
      keywords: 6,
    });
    seed(database, directory);
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM buyer_projects").get().count,
      2,
    );
    assert.deepEqual(filterCounts(), {
      sectors: 3,
      provinces: 4,
      keywords: 6,
    });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("buyer project ranges allow unspecified values and reject invalid persisted values", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    runMigrations(database);
    database
      .prepare(
        "INSERT INTO users(id,email,password_hash,name,company,role) VALUES('range-user','range@example.test','hash','Range User','Range Co.','buyer')",
      )
      .run();
    database
      .prepare(
        "INSERT INTO organizations(id,name,slug,organization_type) VALUES('range-org','Range Co.','range-co','buyer')",
      )
      .run();

    database
      .prepare(
        "INSERT INTO buyer_projects(id,organization_id,created_by_user_id,name) VALUES('range-valid','range-org','range-user','Unspecified range')",
      )
      .run();
    assert.deepEqual(
      {
        ...database
          .prepare(
            "SELECT min_revenue,max_revenue,min_ebitda_margin,max_ebitda_margin FROM buyer_projects WHERE id='range-valid'",
          )
          .get(),
      },
      {
        min_revenue: null,
        max_revenue: null,
        min_ebitda_margin: null,
        max_ebitda_margin: null,
      },
    );

    const insert = (id, field, value) =>
      database
        .prepare(
          `INSERT INTO buyer_projects(id,organization_id,created_by_user_id,name,${field}) VALUES(?,?,?,?,?)`,
        )
        .run(id, "range-org", "range-user", id, value);
    assert.throws(
      () => insert("negative-revenue", "min_revenue", -1),
      /CHECK constraint/,
    );
    assert.throws(
      () => insert("text-revenue", "min_revenue", "not-a-number"),
      /CHECK constraint/,
    );
    assert.throws(
      () => insert("high-margin", "max_ebitda_margin", 101),
      /CHECK constraint/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO buyer_projects(id,organization_id,created_by_user_id,name,min_revenue,max_revenue) VALUES('reversed-revenue','range-org','range-user','Reversed',20,10)",
          )
          .run(),
      /CHECK constraint/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT INTO buyer_projects(id,organization_id,created_by_user_id,name,min_ebitda_margin,max_ebitda_margin) VALUES('reversed-margin','range-org','range-user','Reversed margin',40,20)",
          )
          .run(),
      /CHECK constraint/,
    );
  } finally {
    database.close();
  }
});

test("the initial migration matches the frozen pre-migration schema", () => {
  const legacyDatabase = new DatabaseSync(":memory:");
  const migratedDatabase = new DatabaseSync(":memory:");
  try {
    legacyDatabase.exec(legacySchemaSql);
    applyMigrations(migratedDatabase, [initialUpgrade]);
    assert.deepEqual(
      schemaObjects(migratedDatabase),
      schemaObjects(legacyDatabase),
    );
  } finally {
    legacyDatabase.close();
    migratedDatabase.close();
  }
});

test("a failed migration rolls back its schema and history record", () => {
  const database = new DatabaseSync(":memory:");
  try {
    assert.throws(
      () =>
        applyMigrations(database, [
          {
            version: 1,
            name: "failing_migration",
            up(currentDatabase) {
              currentDatabase.exec(
                "CREATE TABLE rollback_probe (id INTEGER PRIMARY KEY)",
              );
              throw new Error("expected migration failure");
            },
          },
        ]),
      /expected migration failure/,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='rollback_probe'",
        )
        .get().count,
      0,
    );
    assert.deepEqual(getMigrationHistory(database), []);
  } finally {
    database.close();
  }
});

test("migrations run in order exactly once", () => {
  const database = new DatabaseSync(":memory:");
  const calls = [];
  const orderedMigrations = [
    {
      version: 1,
      name: "create_probe",
      up(currentDatabase) {
        calls.push(1);
        currentDatabase.exec(
          "CREATE TABLE ordered_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
        );
      },
    },
    {
      version: 2,
      name: "seed_probe",
      up(currentDatabase) {
        calls.push(2);
        currentDatabase
          .prepare("INSERT INTO ordered_probe(value) VALUES(?)")
          .run("ready");
      },
    },
  ];
  try {
    applyMigrations(database, orderedMigrations);
    applyMigrations(database, orderedMigrations);
    assert.deepEqual(calls, [1, 2]);
    assert.deepEqual(migrationSummary(database), [
      { version: 1, name: "create_probe" },
      { version: 2, name: "seed_probe" },
    ]);
    assert.equal(
      database.prepare("SELECT value FROM ordered_probe").get().value,
      "ready",
    );
  } finally {
    database.close();
  }
});

test("incompatible migration history is rejected", () => {
  const database = new DatabaseSync(":memory:");
  try {
    applyMigrations(database, [{ version: 1, name: "recorded_name", up() {} }]);
    assert.throws(
      () =>
        applyMigrations(database, [
          { version: 1, name: "renamed_migration", up() {} },
        ]),
      /recorded as recorded_name, expected renamed_migration/,
    );
    assert.throws(
      () => applyMigrations(database, []),
      /not recognized by this application version/,
    );
  } finally {
    database.close();
  }
});
