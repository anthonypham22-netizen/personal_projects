import type { DatabaseSync } from "node:sqlite";

const verificationStatuses =
  "'unverified','email_verified','firm_verified','capital_reviewed','verified_acquirer','rejected'";

export const buyerVerificationMigration = {
  version: 14,
  name: "buyer_verification",
  up(database: DatabaseSync) {
    database.exec(`
      ALTER TABLE users ADD COLUMN is_platform_admin INTEGER NOT NULL DEFAULT 0
        CHECK(is_platform_admin IN (0,1));

      UPDATE organizations
      SET verification_status='verified_acquirer'
      WHERE verification_status='verified';

      UPDATE organizations
      SET verification_status='unverified'
      WHERE verification_status NOT IN (${verificationStatuses});

      CREATE TRIGGER organizations_verification_status_insert
      BEFORE INSERT ON organizations
      WHEN NEW.verification_status NOT IN (${verificationStatuses})
      BEGIN
        SELECT RAISE(ABORT,'invalid buyer verification status');
      END;

      CREATE TRIGGER organizations_verification_status_update
      BEFORE UPDATE OF verification_status ON organizations
      WHEN NEW.verification_status NOT IN (${verificationStatuses})
      BEGIN
        SELECT RAISE(ABORT,'invalid buyer verification status');
      END;

      CREATE TABLE buyer_verification_profiles (
        organization_id TEXT PRIMARY KEY
          REFERENCES organizations(id) ON DELETE CASCADE,
        -- Legacy organization names were not length-constrained; preserve them
        -- during upgrade. Current application input validation remains stricter.
        legal_name TEXT NOT NULL DEFAULT '',
        principals TEXT NOT NULL DEFAULT ''
          CHECK(length(principals) <= 4000),
        acquisition_history TEXT NOT NULL DEFAULT ''
          CHECK(length(acquisition_history) <= 5000),
        capital_source TEXT NOT NULL DEFAULT ''
          CHECK(length(capital_source) <= 3000),
        min_equity_check INTEGER
          CHECK(min_equity_check IS NULL OR min_equity_check >= 0),
        max_equity_check INTEGER
          CHECK(max_equity_check IS NULL OR max_equity_check >= 0),
        financing_approach TEXT NOT NULL DEFAULT ''
          CHECK(length(financing_approach) <= 3000),
        submitted_at TEXT,
        submitted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        submission_revision INTEGER NOT NULL DEFAULT 0
          CHECK(submission_revision >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK(
          min_equity_check IS NULL OR max_equity_check IS NULL OR
          min_equity_check <= max_equity_check
        )
      );

      CREATE TABLE verification_reviews (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL
          REFERENCES organizations(id) ON DELETE CASCADE,
        reviewer_user_id TEXT NOT NULL
          REFERENCES users(id) ON DELETE RESTRICT,
        submission_revision INTEGER NOT NULL DEFAULT 0
          CHECK(submission_revision >= 0),
        previous_status TEXT NOT NULL
          CHECK(previous_status IN (${verificationStatuses})),
        decision TEXT NOT NULL
          CHECK(decision IN ('email_verified','firm_verified','capital_reviewed','verified_acquirer','rejected')),
        notes TEXT NOT NULL
          CHECK(length(trim(notes)) BETWEEN 1 AND 5000),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_verification_profiles_submitted
        ON buyer_verification_profiles(submitted_at,updated_at DESC);
      CREATE INDEX idx_verification_reviews_organization
        ON verification_reviews(organization_id,created_at DESC,id DESC);

      INSERT INTO buyer_verification_profiles(organization_id,legal_name)
      SELECT id,name FROM organizations
      WHERE organization_type IN (
        'buyer','private_equity','family_office','search_fund',
        'independent_sponsor','strategic'
      );
    `);
  },
};
