import type { DatabaseSync } from "node:sqlite";

export const matchingEngineMigration = {
  version: 5,
  name: "matching_engine",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE deal_matches (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        buyer_project_id TEXT NOT NULL REFERENCES buyer_projects(id) ON DELETE CASCADE,
        buyer_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        score INTEGER NOT NULL
          CHECK(typeof(score) = 'integer' AND score >= 0 AND score <= 100),
        eligible INTEGER NOT NULL
          CHECK(eligible IN (0,1)),
        score_breakdown_json TEXT NOT NULL
          CHECK(json_valid(score_breakdown_json)),
        status TEXT NOT NULL DEFAULT 'recommended'
          CHECK(status IN ('recommended','shortlisted','excluded','contacted','dismissed')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(deal_id,buyer_project_id)
      );
      CREATE INDEX idx_deal_matches_deal_eligible_score
        ON deal_matches(deal_id,eligible,score DESC);
      CREATE INDEX idx_deal_matches_project_eligible_score
        ON deal_matches(buyer_project_id,eligible,score DESC);
      CREATE INDEX idx_deal_matches_buyer_organization
        ON deal_matches(buyer_organization_id,eligible,score DESC);

      CREATE TABLE matching_engine_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  },
};
