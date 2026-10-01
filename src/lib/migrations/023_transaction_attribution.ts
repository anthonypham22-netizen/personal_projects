import type { DatabaseSync } from "node:sqlite";

export const transactionAttributionMigration = {
  version: 23,
  name: "transaction_attribution",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE transaction_attribution (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        buyer_organization_id TEXT NOT NULL
          REFERENCES organizations(id) ON DELETE CASCADE,
        source TEXT NOT NULL CHECK(source IN (
          'acquire_match','seller_invitation','buyer_discovery','external_relationship'
        )),
        introduced_by_acquire INTEGER NOT NULL CHECK(
          (source IN ('acquire_match','buyer_discovery') AND introduced_by_acquire=1) OR
          (source IN ('seller_invitation','external_relationship') AND introduced_by_acquire=0)
        ),
        introduction_date TEXT NOT NULL CHECK(
          length(introduction_date)=10 AND
          introduction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND
          date(introduction_date)=introduction_date
        ),
        closed_date TEXT CHECK(
          closed_date IS NULL OR (
            length(closed_date)=10 AND
            closed_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND
            date(closed_date)=closed_date AND
            closed_date>=introduction_date
          )
        ),
        enterprise_value INTEGER CHECK(
          enterprise_value IS NULL OR (
            typeof(enterprise_value)='integer' AND
            enterprise_value BETWEEN 0 AND 10000000000
          )
        ),
        origin_event_id TEXT REFERENCES deal_buyer_events(id) ON DELETE SET NULL,
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(deal_id,buyer_organization_id),
        CHECK(
          (closed_date IS NULL AND enterprise_value IS NULL) OR
          (closed_date IS NOT NULL AND enterprise_value IS NOT NULL)
        )
      );

      CREATE INDEX idx_transaction_attribution_deal
        ON transaction_attribution(deal_id,introduction_date,buyer_organization_id);
      CREATE INDEX idx_transaction_attribution_buyer
        ON transaction_attribution(buyer_organization_id,introduction_date,deal_id);
      CREATE INDEX idx_transaction_attribution_closed
        ON transaction_attribution(closed_date,deal_id)
        WHERE closed_date IS NOT NULL;

      CREATE TABLE transaction_attribution_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  },
};
