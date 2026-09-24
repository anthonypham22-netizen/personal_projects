import type { DatabaseSync } from "node:sqlite";

type LegacyUser = {
  id: string;
  company: string;
  role: "buyer" | "owner" | "advisor";
  province: string;
};

const organizationTypeFor = (role: LegacyUser["role"]) =>
  role === "advisor" ? "advisor" : role === "owner" ? "business" : "buyer";

const slugPart = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "firm";

function uniqueSlug(database: DatabaseSync, name: string, userId: string) {
  const base = `${slugPart(name)}-${slugPart(userId).slice(0, 12)}`;
  let slug = base;
  let suffix = 2;
  while (
    database.prepare("SELECT 1 FROM organizations WHERE slug=?").get(slug)
  ) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

export const organizationsMigration = {
  version: 2,
  name: "organizations",
  up(database: DatabaseSync) {
    database.exec(`
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        organization_type TEXT NOT NULL CHECK(organization_type IN ('buyer','advisor','business','private_equity','family_office','search_fund','independent_sponsor','strategic','other')),
        website TEXT NOT NULL DEFAULT '',
        province TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        verification_status TEXT NOT NULL DEFAULT 'unverified',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE organization_members (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','invited','suspended')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(organization_id,user_id)
      );
      CREATE INDEX idx_organization_members_user ON organization_members(user_id,status);
      CREATE INDEX idx_organization_members_organization ON organization_members(organization_id,status);
      ALTER TABLE deals ADD COLUMN owner_organization_id TEXT REFERENCES organizations(id);
      ALTER TABLE deals ADD COLUMN advisor_organization_id TEXT REFERENCES organizations(id);
      ALTER TABLE deals ADD COLUMN created_by_user_id TEXT REFERENCES users(id);
      CREATE INDEX idx_deals_owner_organization ON deals(owner_organization_id);
      CREATE INDEX idx_deals_advisor_organization ON deals(advisor_organization_id);
    `);

    const users = database
      .prepare("SELECT id,company,role,province FROM users ORDER BY rowid,id")
      .all() as LegacyUser[];
    const insertOrganization = database.prepare(
      `INSERT INTO organizations(id,name,slug,organization_type,province)
       VALUES(?,?,?,?,?)`,
    );
    const insertMembership = database.prepare(
      `INSERT INTO organization_members(id,organization_id,user_id,role,status)
       VALUES(?,?,?,'owner','active')`,
    );
    for (const user of users) {
      const organizationId = `org-${user.id}`;
      insertOrganization.run(
        organizationId,
        user.company,
        uniqueSlug(database, user.company, user.id),
        organizationTypeFor(user.role),
        user.province,
      );
      insertMembership.run(`membership-${user.id}`, organizationId, user.id);
    }

    database.exec(`
      UPDATE deals
      SET owner_organization_id = (
            SELECT organization_id FROM organization_members
            WHERE user_id = deals.owner_id AND status = 'active'
            ORDER BY created_at,id LIMIT 1
          ),
          advisor_organization_id = (
            SELECT organization_id FROM organization_members
            WHERE user_id = deals.advisor_id AND status = 'active'
            ORDER BY created_at,id LIMIT 1
          ),
          created_by_user_id = COALESCE(
            (
              SELECT actor_id FROM activity
              WHERE deal_id = deals.id AND action = 'Created a private mandate'
              ORDER BY created_at,rowid LIMIT 1
            ),
            owner_id
          );
    `);
  },
};
