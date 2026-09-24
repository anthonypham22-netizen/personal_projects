import type { DatabaseSync } from "node:sqlite";

export const sellSideMandatesMigration = {
  version: 4,
  name: "sell_side_mandates",
  up(database: DatabaseSync) {
    database.exec(`
      ALTER TABLE deals ADD COLUMN transaction_type TEXT NOT NULL DEFAULT 'full_acquisition'
        CHECK(transaction_type IN ('full_acquisition','majority_acquisition','minority_investment','add_on','recapitalization','other'));
      ALTER TABLE deals ADD COLUMN ownership_percentage_available REAL NOT NULL DEFAULT 100
        CHECK(typeof(ownership_percentage_available) IN ('integer','real') AND ownership_percentage_available >= 0 AND ownership_percentage_available <= 100);
      ALTER TABLE deals ADD COLUMN seller_rollover_possible INTEGER NOT NULL DEFAULT 0
        CHECK(seller_rollover_possible IN (0,1));
      ALTER TABLE deals ADD COLUMN seller_financing_possible INTEGER NOT NULL DEFAULT 0
        CHECK(seller_financing_possible IN (0,1));
      ALTER TABLE deals ADD COLUMN management_transition TEXT NOT NULL DEFAULT '';
      ALTER TABLE deals ADD COLUMN reason_for_transaction TEXT NOT NULL DEFAULT '';
      ALTER TABLE deals ADD COLUMN min_expected_value INTEGER
        CHECK(min_expected_value IS NULL OR (typeof(min_expected_value) = 'integer' AND min_expected_value >= 0));
      ALTER TABLE deals ADD COLUMN max_expected_value INTEGER
        CHECK(max_expected_value IS NULL OR (typeof(max_expected_value) = 'integer' AND max_expected_value >= 0));
      ALTER TABLE deals ADD COLUMN distribution_mode TEXT NOT NULL DEFAULT 'private_outreach'
        CHECK(distribution_mode IN ('invite_only','private_outreach','qualified_discovery'));

      UPDATE deals
      SET distribution_mode = 'qualified_discovery'
      WHERE published = 1;

      CREATE TABLE deal_financials (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
        fiscal_year INTEGER NOT NULL
          CHECK(typeof(fiscal_year) = 'integer' AND fiscal_year >= 1800 AND fiscal_year <= 2200),
        period_type TEXT NOT NULL DEFAULT 'annual'
          CHECK(period_type IN ('annual','trailing_twelve_months','year_to_date')),
        revenue INTEGER NOT NULL
          CHECK(typeof(revenue) = 'integer' AND revenue >= 0),
        ebitda INTEGER NOT NULL
          CHECK(typeof(ebitda) = 'integer'),
        gross_profit INTEGER
          CHECK(gross_profit IS NULL OR typeof(gross_profit) = 'integer'),
        is_projected INTEGER NOT NULL DEFAULT 0
          CHECK(is_projected IN (0,1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(deal_id,fiscal_year,period_type)
      );
      CREATE INDEX idx_deal_financials_deal_period
        ON deal_financials(deal_id,fiscal_year DESC,period_type);
    `);
  },
};
