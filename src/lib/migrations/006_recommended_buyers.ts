import type { DatabaseSync } from "node:sqlite";

export const recommendedBuyersMigration = {
  version: 6,
  name: "recommended_buyers",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE deal_matches_v6 (
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
          CHECK(status IN ('recommended','selected','excluded','contacted')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(deal_id,buyer_project_id)
      );

      INSERT INTO deal_matches_v6(
        id,deal_id,buyer_project_id,buyer_organization_id,score,eligible,
        score_breakdown_json,status,created_at,updated_at
      )
      SELECT
        id,deal_id,buyer_project_id,buyer_organization_id,score,
        CASE WHEN status IN ('excluded','dismissed') THEN 0 ELSE eligible END,
        CASE WHEN status IN ('excluded','dismissed')
          THEN json_insert(
            score_breakdown_json,
            '$.hard_exclusions[#]',
            'The seller excluded this buyer organization.'
          )
          ELSE score_breakdown_json
        END,
        CASE status
          WHEN 'shortlisted' THEN 'selected'
          WHEN 'dismissed' THEN 'excluded'
          ELSE status
        END,
        created_at,updated_at
      FROM deal_matches;

      DROP TABLE deal_matches;
      ALTER TABLE deal_matches_v6 RENAME TO deal_matches;

      CREATE INDEX idx_deal_matches_deal_eligible_score
        ON deal_matches(deal_id,eligible,score DESC);
      CREATE INDEX idx_deal_matches_project_eligible_score
        ON deal_matches(buyer_project_id,eligible,score DESC);
      CREATE INDEX idx_deal_matches_buyer_organization
        ON deal_matches(buyer_organization_id,eligible,score DESC);
    `);
  },
};
