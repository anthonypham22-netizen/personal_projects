import type { DatabaseSync } from "node:sqlite";

export const aiTeaserSafetyMigration = {
  version: 21,
  name: "ai_teaser_safety",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE teaser_safety_reviews (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        requested_by_user_id TEXT NOT NULL REFERENCES users(id),
        provider TEXT NOT NULL,
        provider_name TEXT NOT NULL,
        external_data_processing INTEGER NOT NULL DEFAULT 0
          CHECK(external_data_processing IN (0,1)),
        input_sha256 TEXT NOT NULL,
        status TEXT NOT NULL
          CHECK(status IN ('ready','attention','high_risk')),
        findings_json TEXT NOT NULL,
        suggested_teaser TEXT NOT NULL,
        investment_highlights_json TEXT NOT NULL,
        missing_financials_json TEXT NOT NULL,
        applied_at TEXT,
        applied_by_user_id TEXT REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_teaser_safety_reviews_deal_created
        ON teaser_safety_reviews(deal_id,created_at DESC);
    `);
  },
};
