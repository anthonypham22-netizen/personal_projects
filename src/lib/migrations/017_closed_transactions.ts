import type { DatabaseSync } from "node:sqlite";

export const closedTransactionsMigration = {
  version: 17,
  name: "closed_transactions",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE closed_transactions (
        id TEXT PRIMARY KEY,
        buyer_organization_id TEXT NOT NULL
          REFERENCES organizations(id) ON DELETE CASCADE,
        seller_organization_id TEXT
          REFERENCES organizations(id) ON DELETE SET NULL,
        advisor_organization_id TEXT
          REFERENCES organizations(id) ON DELETE SET NULL,
        industry TEXT NOT NULL
          CHECK(length(trim(industry)) BETWEEN 2 AND 160),
        province TEXT NOT NULL
          CHECK(length(trim(province)) BETWEEN 2 AND 100),
        enterprise_value INTEGER
          CHECK(
            enterprise_value IS NULL OR (
              typeof(enterprise_value) = 'integer' AND
              enterprise_value BETWEEN 0 AND 10000000000
            )
          ),
        closed_date TEXT NOT NULL
          CHECK(
            length(closed_date) = 10 AND
            closed_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND
            date(closed_date) = closed_date
          ),
        description TEXT NOT NULL
          CHECK(length(trim(description)) BETWEEN 10 AND 2000),
        verified INTEGER NOT NULL DEFAULT 0
          CHECK(verified IN (0,1)),
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        verified_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        verified_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK(
          (verified=0 AND verified_by_user_id IS NULL AND verified_at IS NULL) OR
          (verified=1 AND verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL)
        )
      );

      CREATE INDEX idx_closed_transactions_buyer
        ON closed_transactions(buyer_organization_id,closed_date DESC,id);
      CREATE INDEX idx_closed_transactions_review
        ON closed_transactions(verified,created_at,id);
      CREATE INDEX idx_closed_transactions_seller
        ON closed_transactions(seller_organization_id,closed_date DESC);
      CREATE INDEX idx_closed_transactions_advisor
        ON closed_transactions(advisor_organization_id,closed_date DESC);
    `);
  },
};
