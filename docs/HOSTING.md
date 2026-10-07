# Hosting Succera

Succera serves the public site and private workspace from one Next.js server.
Hosted structured data lives in Supabase Postgres; confidential uploads remain
in a private Vercel Blob store in Montreal for the Vercel deployment. Local and
single-host Docker development continue to use the private `DATA_DIR` filesystem.

## Environment boundaries

Use three physically separate environments:

| Boundary         | Local            | Staging                                                   | Production                   |
| ---------------- | ---------------- | --------------------------------------------------------- | ---------------------------- |
| `APP_ENV`        | `development`    | `staging`                                                 | `production`                 |
| Database         | isolated PGlite  | separate staging Supabase project/branch when provisioned | Succera Production           |
| Project ref      | none             | not yet provisioned                                       | `vtfzevaizyvgmynnyxsb`       |
| Region           | local            | choose deliberately                                       | `ca-central-1`               |
| `ALLOW_DEMO`     | `true`           | `true` for fictional QA                                   | `false`                      |
| Data             | fictional/local  | fictional only                                            | approved customer data       |
| Document storage | local `DATA_DIR` | separate private store                                    | private Blob store in `yul1` |

The older US-East Supabase project is not a Succera deployment target. Do not
link it, migrate it, test against it, or place its connection string in any
Succera environment. A staging database does not yet exist and must not be
silently replaced with production.

## 1. Verify the release locally

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Automated tests must run without a remote `DATABASE_URL` or with an explicitly
isolated test database. Never provide the production URL to CI or Playwright.

## 2. Apply Postgres migrations

Migrations live in `supabase/migrations/`. They are applied automatically only
to local PGlite. Hosted databases must be migrated explicitly before the new app
image starts.

For production:

1. Confirm the Supabase CLI is authenticated to the intended organization.
2. Confirm the selected project name is **Succera Production**, project ref is
   `vtfzevaizyvgmynnyxsb`, and region is Canada Central (`ca-central-1`).
3. Review the SQL diff and create a database backup/restore point.
4. Link the exact project, then run `npm run db:push`.
5. Run `npm run db:verify` using the server-only production connection.
6. Inspect Supabase Security Advisor and Performance Advisor. Resolve material
   findings; do not suppress them blindly.

The application does not run hosted migrations at startup. This prevents a web
process from silently modifying production schema.

## 3. Configure the application

Example production server environment:

```dotenv
APP_ENV=production
APP_DOMAIN=succera.io
APP_URL=https://succera.io
DATABASE_URL=postgresql://SERVER_ONLY_SUPABASE_CONNECTION
DATABASE_POOL_MAX=10
PRIVATE_FILE_STORAGE=vercel_blob
# BLOB_READ_WRITE_TOKEN is injected by the linked private Vercel Blob store.
ALLOW_DEMO=false
ALLOW_REGISTRATION=false
COOKIE_SECURE=true
PUBLIC_NETWORK_INDEXING_ENABLED=false
```

The production `DATABASE_URL` is accepted only when it identifies project ref
`vtfzevaizyvgmynnyxsb`. Keep it in the deployment secret store, never source
control, client JavaScript, or `NEXT_PUBLIC_*` variables.
Use Supabase's connection endpoint appropriate for a persistent Node server and
size `DATABASE_POOL_MAX` conservatively for the plan's connection limit.

Custom Succera authentication remains active. Supabase Auth is not configured
and `auth.uid()` is not used for application authorization.

## 4. Deploy the application

### Vercel

The Vercel project must use the Next.js framework preset and the `yul1`
(Montreal) function region. Link a **private** Vercel Blob store created in
`yul1`, which injects `BLOB_READ_WRITE_TOKEN`, and set
`PRIVATE_FILE_STORAGE=vercel_blob`. Never create a public Blob store for Succera
documents.

Use a staged production deployment first, verify the assigned URL, then promote
that exact deployment. Do not expose demo mode or point previews at the
production database.

### Single-host Docker

The included `Dockerfile`, `compose.yaml`, and `Caddyfile` support a single-host
deployment. Caddy terminates HTTPS and proxies to the unexposed Next.js port.

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app caddy
```

The Compose volume stores private uploads, generated watermark cache, and upload
backups only. Postgres records are not in the Docker volume. Use distinct volume
names and secret files for staging and production.

After deployment confirm:

- registration/login/logout and session expiry work;
- `/dev/preview` is unavailable and demo login is rejected in production;
- no demo users or fictional applications exist in production;
- anonymous and cross-buyer document requests fail;
- an unapproved buyer cannot request confidential access or submit an LOI;
- an approved buyer can enter the seller-controlled introduction/NDA workflow;
- only users explicitly marked with `users.is_platform_admin = 1` can open
  `/app/admin` or review buyer profiles;
- uploads survive a restart and are accessible only through authorized Succera
  application routes.

## 5. Import historical SQLite data if required

The current local SQLite source was inspected and contains demo records plus at
least one non-demo development record, so it is not automatically discarded.
Use the explicit import script described in the README. Run it in dry-run mode
first, import into an isolated database, compare every table count, and only then
repeat against the intended target with the production confirmation flag.

The import is idempotent through primary-key conflict handling and follows
foreign-key order. It never deletes the SQLite source. Do not run the application
against SQLite after production cutover; there is no fallback and no dual-write.

## 6. Backups and recovery

Two independent backup systems are required:

1. Supabase database backups/restore points for structured data.
2. Private Blob retention/export for document bytes, or encrypted off-server
   copies of `/app/data/uploads` for a filesystem deployment.

`npm run backup` supports filesystem deployments only. It creates an upload
manifest and filesystem copy; it does not snapshot Postgres or Vercel Blob. A
Vercel deployment needs a separate private Blob export/retention procedure. A
usable recovery point must pair a database backup with a compatible document
backup. Watermark derivatives are regenerable and may be excluded.

Test recovery into a separate staging database and upload volume. Never restore
staging into production or overwrite a running production database. Keep the
previous application image available because a code rollback may not be
compatible with later schema migrations.

## 7. Security notes

All public tables have Row Level Security enabled and privileges are revoked from
Supabase `anon` and `authenticated` roles. Because Succera uses custom auth,
normal application queries use a trusted server connection and application-level
role/deal/document checks. No policy assumes `auth.uid()` maps to a Succera user.

RLS and grants are defense in depth, not a substitute for secret management,
network controls, audit logging, malware scanning, incident response, or legal
and privacy review. Uploaded documents remain a separate storage-risk boundary.
