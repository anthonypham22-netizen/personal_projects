import type { DatabaseSync } from "node:sqlite";
import { inImmediateTransaction } from "../sqlite-transaction.ts";
import { initialUpgrade } from "./001_initial_upgrade.ts";
import { organizationsMigration } from "./002_organizations.ts";
import { buyerProjectsMigration } from "./003_buyer_projects.ts";

export type Migration = {
  version: number;
  name: string;
  up(database: DatabaseSync): void;
};

export type MigrationRecord = {
  version: number;
  name: string;
  applied_at: string;
};

const migrations: readonly Migration[] = [
  initialUpgrade,
  organizationsMigration,
  buyerProjectsMigration,
];

const migrationTableSql = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

function validateMigrations(migrationList: readonly Migration[]) {
  const names = new Set<string>();
  let previousVersion = 0;
  for (const migration of migrationList) {
    if (
      !Number.isSafeInteger(migration.version) ||
      migration.version <= previousVersion
    ) {
      throw new Error(
        "Migrations must use unique, positive versions in ascending order.",
      );
    }
    if (!migration.name || names.has(migration.name)) {
      throw new Error("Migrations must use unique, non-empty names.");
    }
    previousVersion = migration.version;
    names.add(migration.name);
  }
}

function migrationTableExists(database: DatabaseSync) {
  return Boolean(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
      )
      .get(),
  );
}

function readMigrationHistory(database: DatabaseSync): MigrationRecord[] {
  return database
    .prepare(
      "SELECT version,name,applied_at FROM schema_migrations ORDER BY version",
    )
    .all()
    .map((row) => ({ ...row })) as MigrationRecord[];
}

export function getMigrationHistory(database: DatabaseSync): MigrationRecord[] {
  return migrationTableExists(database) ? readMigrationHistory(database) : [];
}

export function applyMigrations(
  database: DatabaseSync,
  migrationList: readonly Migration[],
) {
  validateMigrations(migrationList);
  if (!migrationTableExists(database)) {
    inImmediateTransaction(database, () => database.exec(migrationTableSql));
  }

  const knownMigrations = new Map(
    migrationList.map((migration) => [migration.version, migration]),
  );
  const history = readMigrationHistory(database);
  for (const record of history) {
    const known = knownMigrations.get(record.version);
    if (!known) {
      throw new Error(
        `Database migration ${record.version} (${record.name}) is not recognized by this application version.`,
      );
    }
    if (known.name !== record.name) {
      throw new Error(
        `Database migration ${record.version} is recorded as ${record.name}, expected ${known.name}.`,
      );
    }
  }

  const appliedVersions = new Set(history.map((record) => record.version));
  for (const migration of migrationList) {
    if (appliedVersions.has(migration.version)) continue;
    inImmediateTransaction(database, () => {
      const existing = database
        .prepare("SELECT name FROM schema_migrations WHERE version=?")
        .get(migration.version) as { name: string } | undefined;
      if (existing) {
        if (existing.name !== migration.name) {
          throw new Error(
            `Database migration ${migration.version} is recorded as ${existing.name}, expected ${migration.name}.`,
          );
        }
        return;
      }
      migration.up(database);
      database
        .prepare("INSERT INTO schema_migrations(version,name) VALUES(?,?)")
        .run(migration.version, migration.name);
    });
  }
}

export function runMigrations(database: DatabaseSync) {
  applyMigrations(database, migrations);
}
