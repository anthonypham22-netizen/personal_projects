import type { DatabaseSync } from "node:sqlite";

export const privateTeaserDistributionMigration = {
  version: 7,
  name: "private_teaser_distribution",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE deal_outreach (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        subject TEXT NOT NULL CHECK(length(trim(subject)) BETWEEN 1 AND 200),
        message TEXT NOT NULL CHECK(length(trim(message)) BETWEEN 1 AND 5000),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE deal_outreach_recipients (
        id TEXT PRIMARY KEY,
        outreach_id TEXT NOT NULL REFERENCES deal_outreach(id) ON DELETE CASCADE,
        buyer_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        buyer_project_id TEXT NOT NULL REFERENCES buyer_projects(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'queued'
          CHECK(status IN ('queued','sent','viewed','pursued','passed','expired')),
        sent_at TEXT,
        viewed_at TEXT,
        pursued_at TEXT,
        passed_at TEXT,
        UNIQUE(outreach_id,buyer_project_id)
      );

      CREATE INDEX idx_deal_outreach_deal_created
        ON deal_outreach(deal_id,created_at DESC);
      CREATE INDEX idx_outreach_recipients_organization_status
        ON deal_outreach_recipients(buyer_organization_id,status);
      CREATE INDEX idx_outreach_recipients_project
        ON deal_outreach_recipients(buyer_project_id);
    `);
  },
};
