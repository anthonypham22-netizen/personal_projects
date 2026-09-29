import type { DatabaseSync } from "node:sqlite";

export const buyerFunnelMigration = {
  version: 9,
  name: "buyer_funnel",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE deal_buyer_events (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        buyer_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        buyer_project_id TEXT REFERENCES buyer_projects(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL CHECK(event_type IN (
          'matched','selected','excluded','teaser_sent','teaser_viewed','pursued','passed',
          'intro_requested','intro_approved','intro_declined','nda_requested','nda_uploaded',
          'nda_approved','cim_shared','ioi_received','loi_received','shortlisted',
          'not_proceeding','exclusive','closed','access_revoked'
        )),
        metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        source_key TEXT NOT NULL CHECK(length(trim(source_key)) > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(deal_id,buyer_organization_id,event_type,source_key)
      );

      CREATE INDEX idx_deal_buyer_events_deal_created
        ON deal_buyer_events(deal_id,created_at,id);
      CREATE INDEX idx_deal_buyer_events_buyer_created
        ON deal_buyer_events(buyer_organization_id,created_at,id);
      CREATE INDEX idx_deal_buyer_events_stage
        ON deal_buyer_events(deal_id,event_type,buyer_organization_id);

      CREATE TABLE buyer_funnel_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  },
};
