# Succera

Succera is a private Canadian M&A marketplace and transaction workspace for
business owners, qualified acquirers, and M&A advisors. It targets established
businesses with approximately C$1M–C$20M in annual revenue. Succera is an
original implementation and is not affiliated with Axial.

## Architecture

- Next.js App Router, React, TypeScript, Tailwind CSS, and server-side Zod
  validation.
- Supabase Postgres is the authoritative structured database in hosted
  environments. Production is **Succera Production**, project ref
  `vtfzevaizyvgmynnyxsb`, in `ca-central-1` (Canada Central).
- Local development and automated tests use isolated PGlite Postgres databases;
  they do not connect to Succera Production.
- Succera retains its custom authentication: salted scrypt password hashes,
  random session tokens with only SHA-256 digests stored, HTTP-only SameSite
  cookies, origin checks, and login rate limits. Supabase Auth is not used.
- Uploaded documents use the private filesystem under `DATA_DIR` locally and a
  private Vercel Blob store in the Vercel deployment. Only document metadata is
  stored in Postgres; documents are never exposed through a public object URL.
- SQL access is centralized in `src/lib/db.ts`, parameterized, asynchronous, and
  server-only. Production has no SQLite fallback.

## Run locally

Use Node.js 24.14 or newer within the Node 24 line:

```sh
nvm install 24
nvm use 24
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). When `APP_ENV=development`
and `ALLOW_DEMO=true`, `/dev/preview` can establish a session as a seeded owner,
advisor, or buyer. Customer login pages never expose demo controls.

With no `DATABASE_URL`, development uses an isolated PGlite data directory at
`DATA_DIR/postgres`. This is Postgres-compatible local storage, not a production
fallback. Demo data is synthetic and remains separated from registered users.

## Environment variables

| Variable             | Purpose                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `APP_ENV`            | `development`, `staging`, or `production`                                                   |
| `APP_URL`            | Exact public application origin used for origin checks                                      |
| `DATABASE_URL`       | Server-only Supabase Postgres connection string; mandatory in production                    |
| `DATABASE_POOL_MAX`  | Maximum server connection-pool size; defaults to 10                                         |
| `ADMIN_EMAILS`       | Comma-separated, lower/upper-case-insensitive internal buyer reviewers                      |
| `DATA_DIR`           | Local PGlite and filesystem-document location                                               |
| `PRIVATE_FILE_STORAGE` | `filesystem` locally/Docker or `vercel_blob` on Vercel                                     |
| `ALLOW_DEMO`         | Enables synthetic seed data only outside production                                         |
| `COOKIE_SECURE`      | Must be `true` in staging and production                                                    |
| `ALLOW_REGISTRATION` | Enables or closes public registration                                                       |

See `.env.example` for the remaining marketplace and provider settings. Never
use `NEXT_PUBLIC_*` for database credentials or administrator addresses.

## Database migrations

Versioned Postgres migrations live in `supabase/migrations/` and are applied in
filename order. Local PGlite initialization applies them automatically and
records history in `succera_local_migrations`. Hosted databases are never
migrated during application boot; apply reviewed migrations explicitly with the
Supabase CLI or deployment pipeline before starting the new application image.

Useful commands:

```sh
npm run db:migration:new -- descriptive_name
npm run db:push
npm run db:verify
```

`db:push` must be run only after confirming the linked project. Production is
the Canada Central project ref `vtfzevaizyvgmynnyxsb`; the older US-East project
must never be linked or used. This repository does not contain production
credentials.

## One-time SQLite import

The historical SQLite database is not deleted and is not used by the production
application. `scripts/migrate-sqlite-to-postgres.mjs` provides an explicit,
foreign-key-ordered import for an existing database:

```sh
# Inspect and validate only (default; no Postgres writes)
npm run db:import:sqlite -- --source ./data/dev/northlane.sqlite

# Execute against a deliberately configured non-production target
npm run db:import:sqlite -- --source ./data/dev/northlane.sqlite --execute
```

Production import requires an additional explicit project confirmation. Always
back up both the SQLite source and private uploads, test against an isolated
database first, compare row counts, and run `npm run db:verify`. The script does
not delete or alter the SQLite source.

## Buyer profile review

Buyers submit a server-validated profile at `/app/verification`. Internal
reviewers configured through `ADMIN_EMAILS` use `/app/admin/buyers` to approve,
request more information, or reject it. Marketplace roles remain `buyer`,
`owner`, and `advisor`; administrator access is a separate server-side
privilege.

An unapproved buyer may browse eligible anonymous opportunities and maintain
acquisition criteria, but may not request an introduction leading to
confidential access, receive approved data-room access, or submit an LOI.
Sellers and advisors retain deal-specific approval and NDA control even after a
buyer profile is reviewed. Capital information is explicitly self-reported;
Succera does not describe this workflow as KYC, accreditation, or proof of funds.

## Main application paths

| Path                  | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `/`                   | Public website                                       |
| `/register`, `/login` | Customer registration and password login             |
| `/dev/preview`        | Development/staging-only seeded role preview         |
| `/app`                | Role-aware dashboard                                 |
| `/app/opportunities`  | Matched private opportunities                        |
| `/app/projects`       | Buyer acquisition mandates                           |
| `/app/verification`   | Buyer profile submission and review status           |
| `/app/admin/buyers`   | Internal Succera buyer-review queue                  |
| `/app/deals/:id`      | Deal room, NDA, documents, messages, tasks, and LOIs |
| `/app/settings`       | Account, firm, notification, and security settings   |

## Verification

Run the complete suite before release:

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Tests use isolated local Postgres and must never receive the production
`DATABASE_URL`. See [hosting](docs/HOSTING.md) and the
[launch checklist](docs/LAUNCH-CHECKLIST.md) for the remaining manual controls.
