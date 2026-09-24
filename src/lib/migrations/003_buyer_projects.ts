import type { DatabaseSync } from "node:sqlite";

export const buyerProjectsMigration = {
  version: 3,
  name: "buyer_projects",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE buyer_projects (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        name TEXT NOT NULL CHECK(length(trim(name)) > 0),
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','archived')),
        thesis TEXT NOT NULL DEFAULT '',
        min_revenue INTEGER CHECK(min_revenue IS NULL OR (typeof(min_revenue) = 'integer' AND min_revenue >= 0)),
        max_revenue INTEGER CHECK(max_revenue IS NULL OR (typeof(max_revenue) = 'integer' AND max_revenue >= 0)),
        min_ebitda INTEGER CHECK(min_ebitda IS NULL OR (typeof(min_ebitda) = 'integer' AND min_ebitda >= 0)),
        max_ebitda INTEGER CHECK(max_ebitda IS NULL OR (typeof(max_ebitda) = 'integer' AND max_ebitda >= 0)),
        min_ebitda_margin REAL CHECK(min_ebitda_margin IS NULL OR (typeof(min_ebitda_margin) IN ('integer','real') AND min_ebitda_margin >= 0 AND min_ebitda_margin <= 100)),
        max_ebitda_margin REAL CHECK(max_ebitda_margin IS NULL OR (typeof(max_ebitda_margin) IN ('integer','real') AND max_ebitda_margin >= 0 AND max_ebitda_margin <= 100)),
        min_enterprise_value INTEGER CHECK(min_enterprise_value IS NULL OR (typeof(min_enterprise_value) = 'integer' AND min_enterprise_value >= 0)),
        max_enterprise_value INTEGER CHECK(max_enterprise_value IS NULL OR (typeof(max_enterprise_value) = 'integer' AND max_enterprise_value >= 0)),
        min_equity_check INTEGER CHECK(min_equity_check IS NULL OR (typeof(min_equity_check) = 'integer' AND min_equity_check >= 0)),
        max_equity_check INTEGER CHECK(max_equity_check IS NULL OR (typeof(max_equity_check) = 'integer' AND max_equity_check >= 0)),
        ownership_preference TEXT NOT NULL DEFAULT 'flexible' CHECK(ownership_preference IN ('100_percent','majority','minority','flexible')),
        transaction_type TEXT NOT NULL DEFAULT 'full_acquisition' CHECK(transaction_type IN ('full_acquisition','majority_acquisition','minority_investment','add_on','recapitalization','other')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK(min_revenue IS NULL OR max_revenue IS NULL OR min_revenue <= max_revenue),
        CHECK(min_ebitda IS NULL OR max_ebitda IS NULL OR min_ebitda <= max_ebitda),
        CHECK(min_ebitda_margin IS NULL OR max_ebitda_margin IS NULL OR min_ebitda_margin <= max_ebitda_margin),
        CHECK(min_enterprise_value IS NULL OR max_enterprise_value IS NULL OR min_enterprise_value <= max_enterprise_value),
        CHECK(min_equity_check IS NULL OR max_equity_check IS NULL OR min_equity_check <= max_equity_check)
      );
      CREATE TABLE buyer_project_sectors (
        id TEXT PRIMARY KEY,
        buyer_project_id TEXT NOT NULL REFERENCES buyer_projects(id) ON DELETE CASCADE,
        sector TEXT NOT NULL CHECK(length(trim(sector)) > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(buyer_project_id,sector)
      );
      CREATE TABLE buyer_project_provinces (
        id TEXT PRIMARY KEY,
        buyer_project_id TEXT NOT NULL REFERENCES buyer_projects(id) ON DELETE CASCADE,
        province TEXT NOT NULL CHECK(length(trim(province)) > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(buyer_project_id,province)
      );
      CREATE TABLE buyer_project_keywords (
        id TEXT PRIMARY KEY,
        buyer_project_id TEXT NOT NULL REFERENCES buyer_projects(id) ON DELETE CASCADE,
        keyword TEXT NOT NULL CHECK(length(trim(keyword)) > 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(buyer_project_id,keyword)
      );
      CREATE INDEX idx_buyer_projects_organization_status
        ON buyer_projects(organization_id,status);
      CREATE INDEX idx_buyer_projects_created_by
        ON buyer_projects(created_by_user_id);
      CREATE INDEX idx_buyer_project_sectors_project
        ON buyer_project_sectors(buyer_project_id);
      CREATE INDEX idx_buyer_project_provinces_project
        ON buyer_project_provinces(buyer_project_id);
      CREATE INDEX idx_buyer_project_keywords_project
        ON buyer_project_keywords(buyer_project_id);
    `);
  },
};
