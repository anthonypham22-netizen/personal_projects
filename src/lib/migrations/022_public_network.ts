import type { DatabaseSync } from "node:sqlite";

const publicIndustries = [
  "Business services",
  "Manufacturing",
  "Healthcare",
  "Technology",
  "Consumer & retail",
  "Food & beverage",
  "Transportation",
  "Construction",
] as const;
const publicProvinces = [
  "Ontario",
  "Québec",
  "British Columbia",
  "Alberta",
  "Manitoba",
  "Saskatchewan",
  "Nova Scotia",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Prince Edward Island",
  "Yukon",
  "Northwest Territories",
  "Nunavut",
] as const;
const sqlList = (values: readonly string[]) =>
  values.map((value) => `'${value.replaceAll("'", "''")}'`).join(",");

export const publicNetworkMigration = {
  version: 22,
  name: "public_network",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE organization_public_profiles (
        organization_id TEXT PRIMARY KEY
          REFERENCES organizations(id) ON DELETE CASCADE,
        is_public INTEGER NOT NULL DEFAULT 0
          CHECK(is_public IN (0,1)),
        headline TEXT NOT NULL DEFAULT ''
          CHECK(length(headline) <= 160),
        public_description TEXT NOT NULL DEFAULT ''
          CHECK(length(public_description) <= 4000),
        show_website INTEGER NOT NULL DEFAULT 0
          CHECK(show_website IN (0,1)),
        show_province INTEGER NOT NULL DEFAULT 0
          CHECK(show_province IN (0,1)),
        show_verified_transactions INTEGER NOT NULL DEFAULT 0
          CHECK(show_verified_transactions IN (0,1)),
        revision INTEGER NOT NULL DEFAULT 1
          CHECK(typeof(revision) = 'integer' AND revision >= 1),
        updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE organization_public_industries (
        organization_id TEXT NOT NULL
          REFERENCES organizations(id) ON DELETE CASCADE,
        industry TEXT NOT NULL
          CHECK(industry IN (${sqlList(publicIndustries)})),
        PRIMARY KEY(organization_id,industry)
      );

      CREATE TABLE organization_public_locations (
        organization_id TEXT NOT NULL
          REFERENCES organizations(id) ON DELETE CASCADE,
        province TEXT NOT NULL
          CHECK(province IN (${sqlList(publicProvinces)})),
        PRIMARY KEY(organization_id,province)
      );

      CREATE INDEX idx_organization_public_industries_industry
        ON organization_public_industries(industry,organization_id);
      CREATE INDEX idx_organization_public_locations_province
        ON organization_public_locations(province,organization_id);

      INSERT INTO organization_public_profiles(organization_id)
      SELECT id FROM organizations;

      CREATE TRIGGER organizations_public_profile_insert
      AFTER INSERT ON organizations
      BEGIN
        INSERT OR IGNORE INTO organization_public_profiles(organization_id)
        VALUES(NEW.id);
      END;

      ALTER TABLE closed_transactions ADD COLUMN public_slug TEXT
        CHECK(
          public_slug IS NULL OR (
            length(trim(public_slug)) BETWEEN 8 AND 220 AND
            public_slug NOT GLOB '*[^a-z0-9-]*'
          )
        );
      ALTER TABLE closed_transactions ADD COLUMN public_opt_in INTEGER NOT NULL DEFAULT 0
        CHECK(public_opt_in IN (0,1));
      CREATE UNIQUE INDEX idx_closed_transactions_public_slug
        ON closed_transactions(public_slug)
        WHERE public_slug IS NOT NULL;
      CREATE INDEX idx_closed_transactions_public_feed
        ON closed_transactions(closed_date DESC,public_slug)
        WHERE verified=1 AND public_opt_in=1 AND public_slug IS NOT NULL;
    `);
  },
};
