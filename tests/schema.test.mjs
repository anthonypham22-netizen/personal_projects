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
    ]);

    seed(database, directory);
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

test("an existing demo database is baselined without losing data", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "northlane-upgrade-"));
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys=ON");
    database.exec(legacySchemaSql);
    seed(database, directory);
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
    const history = getMigrationHistory(database);
    assert.equal(history.length, 1);
    assert.equal(history[0].version, 1);
    assert.equal(history[0].name, "initial_upgrade");
    assert.match(history[0].applied_at, /^\d{4}-\d{2}-\d{2} /);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the initial migration matches the frozen pre-migration schema", () => {
  const legacyDatabase = new DatabaseSync(":memory:");
  const migratedDatabase = new DatabaseSync(":memory:");
  try {
    legacyDatabase.exec(legacySchemaSql);
    runMigrations(migratedDatabase);
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
    applyMigrations(database, [
      { version: 1, name: "recorded_name", up() {} },
    ]);
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
