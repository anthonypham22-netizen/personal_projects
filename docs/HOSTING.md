# Hosting Succera

## What you will host

The public website and private SaaS portals are one Next.js application. One Node.js process serves both; a persistent volume stores SQLite and uploaded files. Caddy sits in front of the application and handles HTTPS.

The first deployment should be a staging environment with fictional data. A successful deployment is not a substitute for completing the [live-launch requirements](LAUNCH-CHECKLIST.md).

## 1. Complete local verification

Local installation, TypeScript checking, the production build, 81 backend tests, and 21 Chromium checks passed. Repeat verification after changes and before deployment:

```sh
npm ci
npm run format
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Fix any errors before deployment. The generated `package-lock.json` is now present; Docker and GitHub Actions use it for reproducible installation. Review the validation caveats, including the dynamic filesystem tracing warning, before publishing an image. Commit the source and lockfile to your `anthonypham22-netizen/personal_projects` repository, excluding private `.env*` files, `data/`, and backups (keep the non-secret `.env.example` template). No code has been pushed as part of this build task.

## 2. Choose a Canadian-region server and domain

Use a Linux server with a persistent disk and Docker support. A starting sizing hypothesis for a small pilot is 2 vCPU and 4 GB RAM; monitor and adjust after testing. Building Next.js can need more memory than serving it.

For example, DigitalOcean lists Toronto (`TOR1`) among its regions. Confirm the desired machine's current regional availability and price before purchasing. See [DigitalOcean regional availability](https://docs.digitalocean.com/platform/regional-availability/).

Choose a domain you own, such as `app.your-domain.ca`. Point its DNS A record at the server's IPv4 address. Add an AAAA record only if IPv6 is correctly configured. Permit inbound TCP 80 and 443; restrict SSH to your administrative IP where possible. Do not expose application port 3000 to the public internet.

Canadian-region infrastructure is a hosting choice, not a claim of legal compliance. Review where backups, logs, support access, and future email/signature integrations handle data too.

## Staging and production are separate environments

Use two deployments before inviting real users. GitHub Environments are recommended once GitHub Actions performs deployments, but they do not host the application themselves; each environment still needs its own server, domain, persistent storage, and secrets.

| Boundary          | Staging                                                       | Production                                    |
| ----------------- | ------------------------------------------------------------- | --------------------------------------------- |
| Purpose           | Test releases and complete fictional transaction walkthroughs | Real customer accounts and approved live data |
| Example domain    | `staging.your-domain.ca`                                      | `app.your-domain.ca`                          |
| `ALLOW_DEMO`      | `true`                                                        | `false`                                       |
| `PUBLIC_NETWORK_INDEXING_ENABLED` | `false`                                        | `false` until public content and privacy review are complete |
| Registration      | Controlled test accounts                                      | Invitation-only initially is recommended      |
| Data              | Fictional only                                                | Live data under approved operating controls   |
| Storage           | Dedicated staging volume and backups                          | Dedicated production volume and backups       |
| GitHub protection | Automatic deployment is acceptable                            | Required reviewer approval before deployment  |

Never share a database, upload directory, encryption secret, session secret, or backup destination between staging and production. Promote the same reviewed commit or container image from staging to production; do not copy the staging database into production.

In GitHub repository settings, create `staging` and `production` Environments when deployment automation is added. Store only environment-specific deployment credentials there. Configure the production Environment with required reviewers and restrict deployments to the protected release branch or tag policy you adopt.

## 3. Prepare the server

Install Docker Engine and the Compose plugin using the [official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Use a supported Ubuntu release and enable automatic security updates according to your administrator's policy.

Clone your repository using your normal GitHub authentication:

```sh
git clone https://github.com/anthonypham22-netizen/personal_projects.git northlane
cd northlane
```

If the repository is private, configure read-only deployment access; do not store GitHub tokens in the application image or source files.

## 4. Configure the deployment

Create a server-side `.env` file in the repository directory with:

```dotenv
APP_DOMAIN=app.your-domain.ca
ALLOW_DEMO=false
ALLOW_REGISTRATION=true
# Keep public profile pages previewable but non-indexed until launch review.
PUBLIC_NETWORK_INDEXING_ENABLED=false
# Leave unset until an established provider adapter is implemented.
# ELECTRONIC_SIGNATURE_PROVIDER=
# ELECTRONIC_SIGNATURE_WEBHOOK_SECRET=
# Leave unset until an approved teaser provider and data-processing policy exist.
# TEASER_SAFETY_PROVIDER=openai
# OPENAI_API_KEY=
# OPENAI_TEASER_SAFETY_MODEL=
```

Replace the example domain with the actual DNS name. Do not include `https://` in `APP_DOMAIN`. Docker Compose constructs the exact `APP_URL` from it and enables secure cookies. `ALLOW_DEMO` defaults to `false` when omitted. Ensure `.env` is readable only by the deployment administrator.

For staging, use a separate checkout or Compose project, domain, and volume with `ALLOW_DEMO=true`. Keep staging private or access-controlled and use fictional information only.

Public profile pages are safe to preview with indexing disabled. Do not enable `PUBLIC_NETWORK_INDEXING_ENABLED` on a staging or review hostname. Production should enable it only after the public firm-profile copy, privacy notice, canonical metadata, removal workflow, and the explicit firm/transaction opt-ins have been reviewed. The public sitemap is generated from currently opted-in advisor and buyer profiles and anonymized, independently verified transaction tombstones; it never includes active mandates, `/app` routes, login, registration, messages, documents, or other confidential workflows.

The development `.env.local` file is excluded from the Docker image. Do not copy local demo databases to the live volume. A fresh volume is initialized automatically on first application database access.

Public registration is enabled in this configuration. For a controlled staging pilot, restrict access at the network/proxy layer and register test participants. Set `ALLOW_REGISTRATION=false` and recreate the app container when registration should be closed. A complete administrator-issued invitation system has not been implemented.

## 5. Start the application

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app caddy
```

Caddy obtains and renews certificates when the DNS and network requirements are met. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

Open `https://app.your-domain.ca`. Register test accounts and verify the full walkthrough in the README. Confirm:

- All three role dashboards open and data persists after a container restart.
- Anonymous document downloads fail.
- Buyer A cannot access buyer B's documents or conversations, even by copying URLs.
- Revocation blocks subsequent confidential downloads.
- Upload, download, message, and task updates work under the exact production hostname.
- The public deployment does not display or accept demo login.

If writes fail with an origin error, confirm that the browser hostname matches `APP_DOMAIN` exactly. If uploads fail, check proxy body limits, file type, and the 10 MB application limit. Avoid placing a second caching proxy in front of authenticated responses until it is configured not to cache them.

## 6. Back up and test recovery

The named `northlane_data` volume survives container replacement. It does not protect against disk failure, accidental volume deletion, or server loss.

Create a consistent SQLite snapshot and copy its document files:

```sh
docker compose exec app node scripts/backup.mjs
```

The script prints the backup directory inside `/app/data/backups/`. It checks that every document referenced in the database snapshot exists in the copied upload directory. A failed run may leave a partial directory without a completion manifest; do not use it as a restore point. Copy the printed successful directory to a protected host destination with `docker compose cp`, then to encrypted off-server storage. Schedule backups at a frequency appropriate to the pilot, monitor failures, and apply a retention policy. Backups contain confidential records, password hashes, sessions, and documents.

Personalized watermark files under `/app/data/watermarks/` are a replaceable cache and are intentionally not included in the backup artifact. Their database rows may remain in a restored snapshot; the application treats a missing cached file as a cache miss and regenerates it from the protected original only after the current buyer passes the normal download authorization check.

Test restoration into a **separate staging deployment and fresh volume** first. Stop that staging app, restore `northlane.sqlite` and `uploads/` into its data directory, ensure ownership matches the runtime `node` user, and restart. Verify a representative deal, account, and download. Never mix a snapshot database with an unrelated upload directory or stale SQLite WAL files. Do not restore over a running database.

Do not use `docker compose down -v` during routine updates: `-v` deletes persistent volumes.

## 7. Update safely

Back up first. Review and test the new commit in staging, including migrations if the schema changes. On the server:

```sh
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

Keep the previous known-good commit and backup. A code rollback alone may not be compatible with later database migrations. The application runs versioned migrations automatically at startup and records completed versions in `schema_migrations`; always test upgrades and restores against a production-like database copy before deployment.

### Phase 11 migration checks

For a release that includes migration `014_buyer_verification`, use this short runbook in addition to the normal update steps:

1. Before restarting the application, create and verify a successful backup with `docker compose exec app node scripts/backup.mjs`. Keep the database snapshot and its matching `uploads/` directory together.
2. Before restarting, record the status, eligible-buyer, buyer-project, and deal-match counts on the same database. After restart, rerun those checks and inspect profile coverage (the profile table does not exist before migration) using the available SQLite client:

   ```sql
   SELECT verification_status, COUNT(*)
   FROM organizations
   GROUP BY verification_status
   ORDER BY verification_status;

   SELECT COUNT(*) AS buyer_organizations
   FROM organizations
   WHERE organization_type IN (
     'buyer','private_equity','family_office','search_fund',
     'independent_sponsor','strategic'
   );

   SELECT COUNT(*) AS buyer_projects FROM buyer_projects;

   SELECT COUNT(*) AS deal_matches FROM deal_matches;

   SELECT COUNT(*) AS verification_profiles
   FROM buyer_verification_profiles;

   SELECT COUNT(*) AS missing_profiles
   FROM organizations organization
   LEFT JOIN buyer_verification_profiles profile
     ON profile.organization_id=organization.id
   WHERE organization.organization_type IN (
     'buyer','private_equity','family_office','search_fund',
     'independent_sponsor','strategic'
   ) AND profile.organization_id IS NULL;
   ```

   After migration, `missing_profiles` should be zero, legacy `verified` rows should appear as `verified_acquirer`, and unknown legacy statuses should appear as `unverified`. Also compare the pre/post counts for buyer projects and deal matches; migration `014` must not rewrite them.

3. If startup fails or the post-checks do not match expectations, stop the application and restore the complete pre-migration snapshot (the database and matching uploads) into the stopped volume, then start the previous known-good image or commit. Phase 11 has no automatic down migration; rollback is a database restore and code rollback performed together.

### Phase 12 migration checks

Migrations `015_buyer_firm_profiles` and `016_buyer_firm_profile_revision` add one seller-facing profile for each eligible buyer organization and a monotonic profile revision for safe concurrent edits. Before deploying them, keep the verified database-and-uploads backup from the normal runbook and record buyer-organization, buyer-project, deal-match, and verification-profile counts. After restart, run:

```sql
SELECT COUNT(*) AS buyer_firm_profiles FROM buyer_firm_profiles;

SELECT COUNT(*) AS missing_buyer_firm_profiles
FROM organizations organization
LEFT JOIN buyer_firm_profiles profile
  ON profile.organization_id=organization.id
WHERE organization.organization_type IN (
  'buyer','private_equity','family_office','search_fund',
  'independent_sponsor','strategic'
) AND profile.organization_id IS NULL;

SELECT version,name,applied_at
FROM schema_migrations
WHERE version IN (15,16)
ORDER BY version;
```

`missing_buyer_firm_profiles` should be zero and migrations 15 and 16 should each appear exactly once. Compare the pre/post buyer-project, deal-match, and verification-profile counts; the profile migrations must not rewrite them except for the deliberate buyer-project pause/recalculation when an organization is reclassified out of buyer status. If startup or validation fails, stop the application and restore the complete snapshot before starting the previous code. There is no automatic down migration.

### Phase 13 migration checks

Migration `017_closed_transactions` adds buyer-organization transaction tombstones and their explicit verification metadata. Before deployment, retain the normal verified database-and-uploads backup and record the counts for organizations, buyer projects, deal matches, buyer profiles, and existing deals. After restart, run:

```sql
SELECT version,name,applied_at
FROM schema_migrations
WHERE version=17;

SELECT verified,COUNT(*) AS transaction_count
FROM closed_transactions
GROUP BY verified
ORDER BY verified;

SELECT COUNT(*) AS invalid_verified_records
FROM closed_transactions
WHERE (verified=0 AND (verified_by_user_id IS NOT NULL OR verified_at IS NOT NULL))
   OR (verified=1 AND (verified_by_user_id IS NULL OR verified_at IS NULL));
```

Migration 17 should appear exactly once and `invalid_verified_records` should be zero. The migration creates no historical transaction claims by itself; demo seeding adds fictional examples only when demo data is enabled. Compare all pre/post marketplace counts—the migration must not rewrite organizations, projects, matches, profiles, deals, documents, or funnel events. If startup or validation fails, stop the application and restore the complete snapshot before starting the previous code. There is no automatic down migration.

### Phase 14 migration checks

Migration `018_buyer_reputation` adds only query indexes over the existing marketplace-event ledger and verified transaction history. Reputation values remain derived at request time and are not editable or stored as scores. After restart, run:

```sql
SELECT version,name,applied_at
FROM schema_migrations
WHERE version=18;

SELECT name
FROM sqlite_master
WHERE type='index' AND name IN (
  'idx_deal_buyer_events_reputation',
  'idx_closed_transactions_reputation'
)
ORDER BY name;

SELECT COUNT(*) AS buyer_events FROM deal_buyer_events;
SELECT COUNT(*) AS closed_transactions FROM closed_transactions;
```

Migration 18 and both indexes should each appear exactly once. Compare the event and transaction counts with the pre-deployment backup; Phase 14 must not insert, update, or delete reputation evidence. A buyer with no eligible invitation history should display an unavailable response rate and median rather than fabricated zero values. If startup or validation fails, stop the application and restore the complete snapshot before starting the previous code. There is no automatic down migration.

### Phase 15 migration checks

Migration `019_electronic_nda` adds two access columns plus provider-neutral envelope and webhook-event ledgers. Existing access records are retained and default to the external-upload workflow. After restart, run:

```sql
SELECT version,name,applied_at FROM schema_migrations WHERE version=19;
SELECT nda_method,COUNT(*) FROM access GROUP BY nda_method;
SELECT COUNT(*) AS envelopes FROM electronic_signature_envelopes;
SELECT COUNT(*) AS provider_events FROM electronic_signature_events;
```

Migration 19 should appear once, every pre-existing access row should report `external_upload`, and both new ledger counts should be zero before anyone starts an electronic request. Production deliberately reports electronic signing as unavailable until an established provider adapter is implemented, its webhook verification is mapped to that provider’s documented contract, and its secret is stored outside source control. Never enable the development adapter in production. Back up the database and uploads together before upgrading; there is no automatic down migration.

### Phase 16 migration checks

Migration `020_personalized_cim_watermarking` adds the document opt-in flag and derivative-cache ledger without rewriting uploaded files. After restart, run:

```sql
SELECT version,name,applied_at FROM schema_migrations WHERE version=20;
SELECT watermark_enabled,COUNT(*) FROM documents GROUP BY watermark_enabled;
SELECT COUNT(*) AS watermark_variants FROM document_watermark_variants;
```

Migration 20 should appear once. Every pre-existing document should report `watermark_enabled=0`, and the derivative count should be zero until a buyer downloads an enabled PDF. In staging, upload a valid PDF company overview, enable buyer personalization, and confirm that a deal-team download exactly matches the uploaded original while an approved buyer receives a valid PDF carrying the personalized-watermark response header. Then revoke that buyer and confirm a copied download URL fails. Cache files under `data/watermarks/` are regenerable and are not originals; never expose that directory directly through a web server. Back up the database and uploads together before upgrading; there is no automatic down migration.

### Phase 17 migration checks

Migration `021_ai_teaser_safety` adds a private review ledger without changing deals or publishing content. After restart, run:

```sql
SELECT version,name,applied_at FROM schema_migrations WHERE version=21;
SELECT COUNT(*) AS teaser_reviews FROM teaser_safety_reviews;
SELECT COUNT(*) AS published_after_upgrade FROM deals WHERE published=1;
```

Migration 21 should appear once and a pre-existing database should begin with zero review rows; the published count must match the pre-upgrade backup. In staging, use fictional data to verify that buyers cannot call `/api/teaser-safety`, a stale review cannot overwrite an edited teaser, and a suggestion cannot be applied while a teaser is published. Production must not use `TEASER_SAFETY_PROVIDER=development`. If `openai` is selected, keep `OPENAI_API_KEY` server-side, require an explicit model value, review the provider’s current retention/residency contract, and disclose external processing to users. The request uses `store:false`, but that setting is not a substitute for contractual and privacy review.

### Phase 18 migration and public-network checks

Migration `022_public_network` creates public-profile and normalized taxonomy tables and adds explicit public fields to closed-transaction tombstones. Back up the database and matching uploads before deployment, then verify the migration and the non-destructive defaults:

```sql
SELECT version,name,applied_at
FROM schema_migrations
WHERE version=22;

SELECT COUNT(*) AS public_profiles
FROM organization_public_profiles
WHERE is_public=1;

SELECT COUNT(*) AS missing_public_profiles
FROM organizations organization
LEFT JOIN organization_public_profiles profile
  ON profile.organization_id=organization.id
WHERE profile.organization_id IS NULL;

SELECT COUNT(*) AS public_transactions
FROM closed_transactions
WHERE verified=1 AND public_opt_in=1 AND public_slug IS NOT NULL;

```

Migration 22 should appear once, every organization should have a private profile row, and the migration itself must not publish a firm or transaction. Demo seeding may add clearly fictional public examples only when `ALLOW_DEMO=true`; no operating-business seller or active deal is public. Add an application-level route and sitemap check to deployment validation: public pages must never expose a deal id, company name, confidential summary, document, buyer project, message, or seller/advisor identity. With `PUBLIC_NETWORK_INDEXING_ENABLED=false`, confirm public pages emit `noindex` and `robots.txt` disallows crawling. If startup or privacy checks fail, stop the application and restore the complete pre-migration snapshot before starting the previous code. There is no automatic down migration.

## What changes for a larger launch

The current architecture is deliberately limited to **one server and one application instance**. Do not horizontally scale it against shared SQLite files or separate local upload directories.

For multiple instances, replace the persistence layer with managed PostgreSQL, store documents in a private object-storage service, add an appropriate job queue and shared rate-limit storage, and expand organization membership/authorization. Add monitoring, audited support access, disaster recovery, and production identity, email, electronic-signature-provider, and billing integrations before broader rollout.

For framework deployment behavior, consult the official [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting).
