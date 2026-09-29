import type { DatabaseSync } from "node:sqlite";

export const buyerReputationMigration = {
  version: 18,
  name: "buyer_reputation",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE INDEX idx_deal_buyer_events_reputation
        ON deal_buyer_events(
          buyer_organization_id,event_type,deal_id,created_at,id
        );
      CREATE INDEX idx_closed_transactions_reputation
        ON closed_transactions(
          buyer_organization_id,verified,industry,closed_date DESC,id
        );
    `);
  },
};
