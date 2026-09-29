import type { DatabaseSync } from "node:sqlite";

/**
 * Early Phase 12 preview databases may already have recorded migration 015
 * with a required, zero-defaulted acquisition count and no revision column.
 * Rebuild that preview table without losing profile data. Fresh databases
 * already receive the final shape from 015, so this migration is a no-op.
 */
export const buyerFirmProfileRevisionMigration = {
  version: 16,
  name: "buyer_firm_profile_revision",
  up(database: DatabaseSync) {
    const columns = database
      .prepare("PRAGMA table_info(buyer_firm_profiles)")
      .all() as { name: string; notnull: number }[];
    const hasRevision = columns.some((column) => column.name === "revision");
    const acquisitionCountIsNullable =
      columns.find(
        (column) => column.name === "self_reported_acquisition_count",
      )?.notnull === 0;
    if (hasRevision && acquisitionCountIsNullable) return;
    const revisionExpression = hasRevision ? "revision" : "1";
    database.exec(`
      CREATE TABLE buyer_firm_profiles_v16 (
        organization_id TEXT PRIMARY KEY
          REFERENCES organizations(id) ON DELETE CASCADE,
        fund_structure TEXT NOT NULL DEFAULT ''
          CHECK(length(fund_structure) <= 2000),
        financing_profile TEXT NOT NULL DEFAULT ''
          CHECK(length(financing_profile) <= 3000),
        self_reported_acquisition_count INTEGER DEFAULT NULL
          CHECK(
            self_reported_acquisition_count IS NULL OR (
              typeof(self_reported_acquisition_count) = 'integer' AND
              self_reported_acquisition_count BETWEEN 0 AND 10000
            )
          ),
        revision INTEGER NOT NULL DEFAULT 1
          CHECK(typeof(revision) = 'integer' AND revision >= 1),
        updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO buyer_firm_profiles_v16(
        organization_id,fund_structure,financing_profile,
        self_reported_acquisition_count,revision,updated_by_user_id,
        created_at,updated_at
      )
      SELECT
        organization_id,fund_structure,financing_profile,
        CASE
          WHEN self_reported_acquisition_count=0
            AND trim(fund_structure)=''
            AND trim(financing_profile)=''
            AND created_at=updated_at
          THEN NULL
          ELSE self_reported_acquisition_count
        END,
        ${revisionExpression},updated_by_user_id,created_at,updated_at
      FROM buyer_firm_profiles;

      DROP TABLE buyer_firm_profiles;
      ALTER TABLE buyer_firm_profiles_v16 RENAME TO buyer_firm_profiles;
    `);
  },
};
