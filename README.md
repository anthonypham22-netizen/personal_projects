# Succera

A standalone website and SaaS MVP for Canadian M&A, targeting businesses with approximately C$1M–C$20M annual revenue. Succera is a provisional product name and an original implementation; it is not affiliated with Axial.

## Current delivery status

The local MVP now installs and builds successfully. TypeScript checking, all 106 backend tests, and all 24 Chromium browser checks pass. `package-lock.json` is present. The local preview is available while `npm run dev` is running. This is not a publicly deployed or production-ready release; Docker deployment, broader security review, and live-launch requirements remain outstanding. See [validation status](docs/VALIDATION.md).

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

Demo data is shared and persistent. Use fictional files only. Demo and registered-account marketplaces are isolated from each other. New registered accounts begin with an empty workspace; register an owner, advisor, and buyer to try the complete multi-account workflow with test information.

After the initial successful `npm install`, keep and commit the generated `package-lock.json`. Future installations, Docker builds, and CI should use `npm ci`.

## Implemented application paths

| Path                  | Purpose                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/`                   | Public website with product, audience, and process sections                                                |
| `/register`, `/login` | Role-specific registration, password login, local demo entry                                               |
| `/app`                | Role-aware overview, transaction pipeline, tasks, recent activity                                          |
| `/app/opportunities`  | Discover: eligible project-matched teasers and organization-scoped private invitations                     |
| `/app/projects`       | Buyer acquisition projects with normalized sector, province, keyword, and financial criteria               |
| `/app/verification`   | Buyer-firm evidence, closed-transaction tombstones, internal review status, and reviewer audit history     |
| `/app/deals`          | List and board views of mandates or acquisition pipeline                                                   |
| `/app/new`            | Grouped private sell-side mandate creation by owners or advisors                                           |
| `/app/deals/:id`      | Mandate settings, teaser safety, buyer funnel, private notes, documents, messages, tasks, LOIs, and access |
| `/app/documents`      | Permission-filtered document library with search and download                                              |
| `/app/messages`       | Buyer-specific conversations with the seller's deal team                                                   |
| `/app/tasks`          | Open/completed diligence tasks                                                                             |
| `/app/network`        | Self-reported advisor directory                                                                            |
| `/app/settings`       | Profile, acquisition criteria, notification delivery preferences, password change                          |
| `/about-this-release` | Honest release capabilities and limitations                                                                |

## Run a complete transaction walkthrough

1. Register an **owner** and create a private mandate. Use a code name in its teaser; company name and confidential summary remain gated.
2. Register an **advisor** in another browser profile. The owner can appoint that advisor from the mandate's Overview tab. An advisor may instead create the mandate and use **Connect the business owner** after the owner registers.
3. Choose the mandate's distribution strategy. Before publishing, open **Teaser safety** to check the private draft for business names, domains, customer names, precise locations, revealing combinations, and missing financial context. Review any proposed rewrite and apply it explicitly while the teaser is private; the assistant never publishes content. `invite_only` and `private_outreach` remain outside discovery, while a published `qualified_discovery` teaser appears only to eligible matched buyer organizations.
4. Register a **buyer**, complete the seller-facing firm profile and separate internal verification profile, submit verification for review, and activate an acquisition project with its sector, geography, financial, and transaction criteria. Add anonymized closed-transaction tombstones; they remain explicitly **Self-reported** until an independent Succera platform reviewer marks them **Succera verified**. A platform reviewer must approve at least **Firm verified** before Qualified Discovery appears; private seller invitations remain available independently.
5. In **Recommended buyers**, the owner/advisor selects eligible projects, previews a non-identifying message, and shares the teaser. Only the selected buyer organizations receive the private opportunity in-app.
6. A private-outreach buyer can pass or express interest. A Qualified Discovery buyer instead submits an introduction request explaining its interest and credibility. The seller approves or declines that request; approval creates a normal pending access record but does not reveal the company identity or bypass NDA review. Existing buyers may also be invited from Buyer access.
7. In **Buyer funnel**, the owner/advisor can inspect every buyer's chronological activity, current stage, outcome, and conversion metrics. Workflow actions create events automatically; use the milestone control only for an offline CIM share, IOI, exclusivity, or closing event.
8. In **Internal notes**, owner and advisor firm members record private call context, buyer signals, and follow-ups. These entries are separate from Messages and are never included in buyer workspace responses.
9. Use the notification bell for new matches, outreach, introductions, NDA decisions, messages, tasks, documents, IOIs, LOIs, and access changes. Email delivery preferences can be immediate, daily digest, weekly digest, or disabled without hiding in-app activity.
10. As owner/advisor, choose **Use external NDA** to preserve the original upload-and-review process, or **Send electronic NDA** when an established signing-provider adapter is configured. Succera never collects signatures itself.
11. External uploads still require explicit seller review. In the electronic flow, buyer signing alone does not grant access; only an authenticated, idempotent provider-completion callback with the executed PDF stores the NDA and grants confidential access automatically.
12. Share financial documents with all approved buyers or one specific buyer. Internal documents stay within the seller's team. For a buyer-visible PDF company overview, optionally enable **Personalize every buyer’s PDF download**. Succera keeps the uploaded original and generates a recipient-specific copy at download time with the buyer firm, email, date, and transaction reference. Subsequent uploads with the same filename and audience create versions.
13. Use the private conversation and shared diligence tasks. Each buyer sees only their own threads, offers, and assigned tasks.
14. The buyer uploads an LOI, then submits its indicative price, transaction structure, and conditions. The owner/advisor can review and shortlist the offer. Status changes are workflow records, not legal acceptance.
15. Update the mandate stage as the parties complete diligence and closing outside the software. Revoke portal access when appropriate; already downloaded copies cannot be recalled.

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
- A deterministic buyer-project matching engine scores industry, revenue, EBITDA, geography, transaction type, enterprise value, ownership, and keyword/thesis fit with centrally defined weights totalling 100. Every stored result includes its per-dimension explanation and hard-exclusion reasons.
- Match results are persisted in `deal_matches`, backfilled once for upgraded databases, and recalculated only for the affected deal, buyer project, buyer organization, or access decision. Demo and registered-account marketplaces remain isolated.
- Authorized sell-side deal managers can review those matches in a ranked Recommended Buyers workbench, filter and inspect the rationale, select buyers individually or in batches, and exclude or restore recommendations. Recommendation status never grants deal access; access and NDA review remain separate human-controlled steps.
- Migration `007_private_teaser_distribution` adds durable outreach and recipient records. Deal managers can share an anonymized teaser only with eligible, selected buyer projects. Recipient organizations see only their own in-app invitations; the seller receives sent, viewed, pursued, and passed status updates. Expressing interest creates a gated access request without granting confidential access.
- Migration `008_qualified_discovery` adds organization-scoped introduction requests with pending, approved, declined, and withdrawn states. Discover admits a published teaser only when the signed-in buyer organization owns an active, eligible project scoring at least `QUALIFIED_DISCOVERY_MIN_SCORE` (70 by default). Buyers receive only their best qualifying project, score, and positive match dimensions. Seller approval moves the requesting user into the existing pending access workflow; it never grants confidential access or approves an NDA.
- Migration `009_buyer_funnel` adds an append-only buyer-event ledger and a one-time, idempotent upgrade backfill from existing matches, outreach, introductions, access, documents, and offers. The seller/advisor Buyer funnel derives its nine stages, outcomes, response time, and pursuit/NDA/CIM/IOI/LOI conversions from those events. Existing workflow actions record milestones automatically; deal managers can add only offline CIM, IOI, exclusivity, and closing events.
- Migration `010_internal_deal_notes` adds an append-only private note record for seller-side deal teams. Owner and advisor firm viewers may read notes; only non-viewer firm members may add them. Buyer and unrelated-firm workspace responses omit the note collection entirely, and buyer-facing Messages remain a separate workflow.
- Migration `011_notifications` adds per-user in-app notifications, per-type email frequencies, and a durable email outbox. Migrations `012_email_processing_lease` and `013_email_processing_token` add recoverable, fenced delivery claims with a stable provider idempotency key. Notification and outbox writes are deduplicated and atomic. Development records email safely without contacting an external service; production processing fails closed until a real `EmailProvider` is configured. Daily and weekly rows remain queued for a future digest worker rather than being sent as misleading one-message “digests.”
- Migration `014_buyer_verification` adds structured buyer-firm evidence, an append-only reviewer decision ledger, explicit platform-reviewer authority, and ordered verification states. Production reviewer flags must be provisioned out of band after identity checks; self-registered email addresses never grant platform-reviewer authority. Qualified Discovery requires `firm_verified` by default and rechecks that gate when a buyer browses or requests an introduction and when a seller approves it. General persisted matches remain verification-neutral so profile changes and threshold changes take effect through those live discovery checks. This is an internal platform trust workflow based on self-reported evidence, not legal accreditation, independent identity verification, or a guarantee of capital.
- Migrations `015_buyer_firm_profiles` and `016_buyer_firm_profile_revision` add a buyer-organization-owned seller-facing profile with fund structure, financing profile, and a clearly labelled self-reported acquisition count. Only buyer firm owners and administrators can edit it, using an atomic revision check so concurrent editors cannot silently overwrite one another. Reclassifying a buyer organization pauses its active acquisition projects and removes its stale recommendations while preserving historical outreach and funnel records. Recommended Buyers combines those safe fields with the matched active projects and deal-specific marketplace experience already authorized for that seller/advisor team. Internal verification evidence, principals, capital-source records, and reviewer notes are not included, and no public buyer-profile route exists.
- Migration `017_closed_transactions` adds organization-scoped acquisition tombstones with industry, province, closing date, optional enterprise value, and an anonymized description. Buyer-firm owners and administrators may add records for their own organization but cannot verify them. Independent platform reviewers can mark eligible records as Succera verified; the reviewer and timestamp are retained. Matched sell-side teams receive only the sanitized tombstone fields, never linked seller/advisor organization identifiers. Self-reported and verified records remain visibly distinct, and Phase 13 does not use them in matching or reputation scores.
- Migration `018_buyer_reputation` adds covering indexes for reputation evidence without persisting editable scores or fabricated values. Recommended Buyers derives response rate, median response time, opportunities pursued, LOIs submitted, verified transaction count, and mandate-sector-relevant verified transactions from the existing marketplace event ledger and independently reviewed tombstones. These aggregates are informational, visible only to authorized sell-side teams inside a matched buyer profile, and do not affect matching.
- Migration `019_electronic_nda` preserves every existing access record as `external_upload` and adds provider-neutral envelope and webhook-event ledgers. Electronic requests are seller-controlled; provider callbacks are authenticated and idempotent; buyer signing alone never grants access; verified completion stores the executed PDF as a buyer-specific NDA and then grants access. The included adapter is development-only and simulates provider orchestration without rendering or collecting signatures. Production fails closed until an established provider adapter is implemented and configured.
- Migration `020_personalized_cim_watermarking` leaves existing documents unchanged and adds an opt-in flag plus a buyer-specific derivative cache. Authorized buyer downloads of enabled PDF company overviews receive a visible confidentiality footer and watermark; deal-team downloads still receive the immutable uploaded original. Cache identity includes the original content, recipient identity, date, transaction reference, and watermark format version. Every request repeats the normal document authorization check, and missing or corrupt derived files are regenerated rather than weakening access controls.
- Migration `021_ai_teaser_safety` adds private, deal-team-only safety-review history. Deterministic identifier checks always run locally; an optional configured model can add findings, a proposed anonymized rewrite, investment highlights, and missing-financial prompts. Unsafe model rewrites are discarded in favour of a locally generated safe draft. Suggestions can be applied only by an authorized manager to an unchanged, private teaser, and applying never publishes it. The matching engine remains deterministic and receives no model-generated scores or recommendations.
- Database-backed rate limits are basic per-account protection, not a complete anti-abuse system.
- Project-level match records remain private by default. Discover returns only the best eligible match for the signed-in buyer organization, while a private recipient receives only the score and positive reasons for the project selected for outreach. A score is criteria fit, not investment suitability or a statistical probability.

Each account belongs to an organization with an `owner`, `admin`, `member`, or read-only `viewer` membership. Existing and demo accounts are migrated into one-person organizations without merging firms that happen to share a name. Owner and advisor mandates are organization-scoped while retaining their original user creator/representative fields for compatibility and audit context. Firm owners and administrators can edit the firm profile; membership invitations and role administration are intentionally not included yet. Buyer organizations can create multiple private acquisition projects with normalized filters and draft/active/paused/archived lifecycle states. Buyer deal access remains individual. Phase 3 adds structured sell-side mandates and historical financial periods. Phase 4 adds the private, explainable matching engine and persistence layer. Phase 5 adds the private Recommended Buyers workflow. Phase 6 adds buyer-organization-scoped teaser distribution and response tracking. Phase 7 adds thresholded Qualified Discovery and seller-controlled introduction requests. Phase 8 adds the event-backed seller/advisor buyer funnel. Phase 9 adds seller-side internal notes. Phase 10 adds notification and email-outbox infrastructure. Phase 11 adds internal buyer-firm verification and reviewer audit history. Phase 12 adds private, seller-visible buyer firm profiles and matched-project criteria. Phase 13 adds closed-transaction tombstones with explicit self-reported and platform-verified states. Phase 14 adds derived, informational buyer reputation metrics without altering matching. Phase 15 adds provider-neutral electronic NDA orchestration while retaining external upload; confidential access still requires either explicit external-document approval or verified provider completion. Phase 16 adds opt-in, recipient-specific PDF watermarking without changing originals or relaxing download authorization. Phase 17 adds a human-controlled teaser safety assistant without using AI for buyer matching or automatic publication.

## Verification

```sh
npm run test:core
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`test:core` uses only Node and can run without npm dependencies. The broader service tests cover migrations, teaser identifier detection, unsafe-model-output rejection, non-stored structured provider requests, private review authorization and stale/published application gates, rendered watermark content, Unicode-safe buyer identities, buyer-specific cache isolation, reputation statistics, verification, matching, outreach, discovery, funnel, notification, document, organization, session, and environment boundaries. Browser tests exercise the seller-controlled teaser review and apply flow, buyer isolation, personalized PDF delivery, reputation, transaction tombstones, verification, notifications, Qualified Discovery, private outreach, Recommended Buyers, tasks, downloads, origin checks, and mobile viewports. Stop any development server on port 3000 before the browser suite; it starts an isolated instance with its own test data.

Use `npm run format` after dependencies are installed to format the source with Prettier.

## Hosting

See **[the step-by-step hosting guide](docs/HOSTING.md)**. The included Docker Compose setup runs the app behind Caddy HTTPS with a persistent data volume. It is intended for one application instance on a Canadian-region server.

Do not deploy this SQLite/local-upload version to an ephemeral filesystem or a static website host. A serverless deployment requires replacing the database and file storage adapters first.

## Explicitly not finished

This is an early MVP implementation, not Axial feature parity or a production certification. Remaining work includes organization invitations and membership administration, production electronic-signature and email providers, password recovery, MFA/SSO, file malware scanning, billing, independent identity/capital verification, French localization, audited admin support, and privacy/legal documents. The local teaser assistant is deterministic development tooling; a live AI provider requires separate privacy, residency, retention, accuracy and contract review. AI findings can be incomplete or wrong and never replace seller/advisor review. Personalized watermarks are a recipient-identification deterrent, not DRM. No actual subscription charges, financing, or transaction closing are performed.

See [launch requirements](docs/LAUNCH-CHECKLIST.md) before inviting customers or using confidential deal files.
