import type { DatabaseSync } from "node:sqlite";

export const qualifiedDiscoveryMigration = {
  version: 8,
  name: "qualified_discovery",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE introduction_requests (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        buyer_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        buyer_project_id TEXT NOT NULL REFERENCES buyer_projects(id) ON DELETE RESTRICT,
        requested_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        message TEXT NOT NULL CHECK(length(trim(message)) BETWEEN 20 AND 3000),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending','approved','declined','withdrawn')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TEXT,
        reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT
      );

      CREATE UNIQUE INDEX idx_introduction_requests_active_decision
        ON introduction_requests(deal_id,buyer_organization_id)
        WHERE status<>'withdrawn';
      CREATE INDEX idx_introduction_requests_deal_status
        ON introduction_requests(deal_id,status,created_at DESC);
      CREATE INDEX idx_introduction_requests_buyer_status
        ON introduction_requests(buyer_organization_id,status,created_at DESC);
      CREATE INDEX idx_introduction_requests_project
        ON introduction_requests(buyer_project_id);
    `);
  },
};
