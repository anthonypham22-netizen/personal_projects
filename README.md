# Succera

A standalone website and SaaS MVP for Canadian M&A, targeting businesses with approximately C$1M–C$20M annual revenue. Succera is a provisional product name and an original implementation; it is not affiliated with Axial.

## Current delivery status

The local MVP now installs and builds successfully. TypeScript checking, all 31 backend tests, and all 12 Chromium browser checks pass. `package-lock.json` is present. The local preview is available while `npm run dev` is running. This is not a publicly deployed or production-ready release; Docker deployment, broader security review, and live-launch requirements remain outstanding. See [validation status](docs/VALIDATION.md).

## Start locally

Use **Node.js 24.14 or newer within the Node 24 line** and npm. The database uses Node's built-in SQLite module.

```sh
nvm install 24
nvm use 24
npm install
```

Create `.env.local` from `.env.example` if it does not already exist. The local checkout already includes a development-only configuration, which Git ignores. Then:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000). At `/login`, choose **Advisor demo**, **Buyer demo**, or **Owner demo**. These appear only with `ALLOW_DEMO=true`. Passwords for demo records are random and are not exposed; the explicit demo entry points establish their sessions.

Demo data is shared and persistent. Use fictional files only. New registered accounts are isolated from demo deals and begin with an empty workspace. The shared Buyer Demo can preview published teasers from registered owners, but it cannot request confidential access or contact those deal teams. Register an owner, advisor, and buyer to try the complete multi-account workflow with test information.

After the initial successful `npm install`, keep and commit the generated `package-lock.json`. Future installations, Docker builds, and CI should use `npm ci`.

## Implemented application paths

| Path                  | Purpose                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `/`                   | Public website with product, audience, and process sections                                  |
| `/register`, `/login` | Role-specific registration, password login, local demo entry                                 |
| `/app`                | Role-aware overview, transaction pipeline, tasks, recent activity                            |
| `/app/opportunities`  | Anonymous teasers; search and industry/province filters; explained criteria matching         |
| `/app/projects`       | Buyer acquisition projects with normalized sector, province, keyword, and financial criteria |
| `/app/deals`          | List and board views of mandates or acquisition pipeline                                     |
| `/app/new`            | Grouped private sell-side mandate creation by owners or advisors                             |
| `/app/deals/:id`      | Mandate settings, financial history, documents, conversations, tasks, LOIs, and buyer access |
| `/app/documents`      | Permission-filtered document library with search and download                                |
| `/app/messages`       | Buyer-specific conversations with the seller's deal team                                     |
| `/app/tasks`          | Open/completed diligence tasks                                                               |
| `/app/network`        | Self-reported advisor directory                                                              |
| `/app/settings`       | Profile, acquisition criteria, password change                                               |
| `/about-this-release` | Honest release capabilities and limitations                                                  |

## Run a complete transaction walkthrough

1. Register an **owner** and create a private mandate. Use a code name in its teaser; company name and confidential summary remain gated.
2. Register an **advisor** in another browser profile. The owner can appoint that advisor from the mandate's Overview tab. An advisor may instead create the mandate and use **Connect the business owner** after the owner registers.
3. Choose the mandate's distribution strategy. `invite_only` and `private_outreach` remain outside buyer discovery; `qualified_discovery` allows signed-in buyers to see the anonymized teaser and request access once it is published. Avoid identifying details in teaser fields.
4. Register a **buyer**, set criteria, and request access. Alternatively, the owner/advisor can invite an existing buyer account by email from Buyer access. Invitations are in-app only.
5. As owner/advisor, choose **Proceed to NDA**. Exchange and sign the agreement outside the app. Either participant can upload the externally executed NDA for the specific buyer.
6. The seller's team selects the uploaded NDA, explicitly confirms their review, and grants confidential access. Uploading alone never grants access or represents a signature.
7. Share financial documents with all approved buyers or one specific buyer. Internal documents stay within the seller's team. Subsequent uploads with the same filename and audience create versions.
8. Use the private conversation and shared diligence tasks. Each buyer sees only their own threads, offers, and assigned tasks.
9. The buyer uploads an LOI, then submits its indicative price, transaction structure, and conditions. The owner/advisor can review and shortlist the offer. Status changes are workflow records, not legal acceptance.
10. Update the mandate stage as the parties complete diligence and closing outside the software. Revoke portal access when appropriate; already downloaded copies cannot be recalled.

## Technical design

- Next.js App Router, React, TypeScript, Tailwind CSS, and Lucide icons.
- One Node server, SQLite in WAL mode, and a persistent private file directory.
- Passwords hashed using salted scrypt; sessions use random bearer tokens with only SHA-256 digests stored in the database.
- HTTP-only, SameSite cookies; secure cookies under HTTPS; mutation origin checks against `APP_URL`.
- Parameterized SQL, server-side input validation, and authorization on reads, mutations, and downloads.
- `data/northlane.sqlite` and `data/uploads/` contain application records and files. Never commit these paths.
- The visible product is branded Succera. Legacy internal identifiers (`northlane.sqlite`, `northlane_session`, package name, and Docker volume) are intentionally retained so the rebrand does not reset existing data, deployments, or sessions. Previously seeded demo files are not rewritten; newly generated examples use Succera.
- Versioned SQLite migrations run automatically at startup from `src/lib/migrations/`. Applied versions are recorded in `schema_migrations`, so fresh and existing databases follow the same upgrade path and migration history remains directly inspectable.
- Sell-side mandates capture transaction type, ownership available, rollover and financing flexibility, transition context, expected value, and one of three controlled distribution modes. Annual, year-to-date, and trailing-twelve-month financial periods are stored separately in `deal_financials`.
- Database-backed rate limits are basic per-account protection, not a complete anti-abuse system.
- Matching is a transparent three-factor comparison: industry, province, and revenue range. A percentage is criteria fit, not investment suitability or a statistical probability.

Each account belongs to an organization with an `owner`, `admin`, `member`, or read-only `viewer` membership. Existing and demo accounts are migrated into one-person organizations without merging firms that happen to share a name. Owner and advisor mandates are organization-scoped while retaining their original user creator/representative fields for compatibility and audit context. Firm owners and administrators can edit the firm profile; membership invitations and role administration are intentionally not included yet. Buyer organizations can create multiple private acquisition projects with normalized filters and draft/active/paused/archived lifecycle states. Buyer deal access remains individual. Phase 3 adds structured sell-side mandates and historical financial periods; project-to-opportunity matching is intentionally deferred to a later phase.

## Verification

```sh
npm run test:core
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`test:core` uses only Node and can run without npm dependencies. The broader service tests cover redaction, document permissions, buyer isolation, NDA approval, revocation, shared mandates, session expiry, and safe preview boundaries. Browser tests exercise navigation, buyer previews, tasks, downloads, origin checks, and a mobile viewport. Stop any development server on port 3000 before the browser suite; it starts an isolated instance with its own test data.

Use `npm run format` after dependencies are installed to format the source with Prettier.

## Hosting

See **[the step-by-step hosting guide](docs/HOSTING.md)**. The included Docker Compose setup runs the app behind Caddy HTTPS with a persistent data volume. It is intended for one application instance on a Canadian-region server.

Do not deploy this SQLite/local-upload version to an ephemeral filesystem or a static website host. A serverless deployment requires replacing the database and file storage adapters first.

## Explicitly not finished

This is an early MVP implementation, not Axial feature parity or a production certification. Remaining work includes organization invitations and membership administration, electronic-signature integration, email verification and delivery, password recovery, MFA/SSO, file malware scanning, billing, identity/capital verification, notification delivery, French localization, audited admin support, and privacy/legal documents. No actual subscription charges, signatures, financing, or transaction closing are performed.

See [launch requirements](docs/LAUNCH-CHECKLIST.md) before inviting customers or using confidential deal files.
