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
import { ensureInitialMatchBackfill } from "../src/lib/match-store.ts";

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
    ]);

    seed(database, directory);
    ensureInitialMatchBackfill(database);
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
    seed(database, directory);
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM deals").get().count,
      6,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) count FROM buyer_projects").get().count,
      2,
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
    assert.equal(history.length, 7);
    assert.deepEqual(migrationSummary(database), [
      { version: 1, name: "initial_upgrade" },
      { version: 2, name: "organizations" },
      { version: 3, name: "buyer_projects" },
      { version: 4, name: "sell_side_mandates" },
      { version: 5, name: "matching_engine" },
      { version: 6, name: "recommended_buyers" },
      { version: 7, name: "private_teaser_distribution" },
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
