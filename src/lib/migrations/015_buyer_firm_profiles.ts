import type { DatabaseSync } from "node:sqlite";

export const buyerFirmProfilesMigration = {
  version: 15,
  name: "buyer_firm_profiles",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE buyer_firm_profiles (
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

      INSERT INTO buyer_firm_profiles(organization_id)
      SELECT id FROM organizations
      WHERE organization_type IN (
        'buyer','private_equity','family_office','search_fund',
        'independent_sponsor','strategic'
      );
    `);
  },
};
