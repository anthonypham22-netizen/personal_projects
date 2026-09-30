# Validation status

Date: 2026-09-29

## Phase 4 — deterministic matching engine

Phase 4 adds a pure, deterministic project-to-deal matcher and migration `005_matching_engine`. Industry, revenue, EBITDA, geography, transaction type, enterprise value, ownership, and keyword/thesis fit use centrally defined weights totalling 100. Every persisted result contains a JSON explanation for all eight dimensions and any hard-exclusion reasons.

Fresh databases create and seed the matching tables. Existing Phase 3 databases retain their users, deals, projects, and financial records, then receive a one-time match backfill. Subsequent deal, buyer-project, and access-block changes recalculate only affected match pairs. Verification status is evaluated live at Qualified Discovery boundaries and is not folded into persisted general match eligibility. Matching never combines shared demo data with registered-account data.

Phase 4 did not expose a recommendation interface. Persisted matches remained available only through a seller-authorized service boundary and were not included in buyer workspace responses.

## Phase 5 — Recommended Buyers

Migration `006_recommended_buyers` narrows recommendation lifecycle values to `recommended`, `selected`, `excluded`, and `contacted`, safely translating older `shortlisted` and `dismissed` records. Existing excluded records remain ineligible and keep an inspectable exclusion reason.

Authorized owner and advisor deal managers now receive ranked buyer-project recommendations inside each mandate. The workbench supports score sorting; buyer-type, geography, verification, experience, and status filters; firm and acquisition-mandate profiles; an eight-dimension reasoning ledger; single and batch selection; and exclude/restore controls. Read-only deal-team viewers and buyers receive no recommendation records. Selecting a recommendation does not create a buyer-access record or bypass NDA approval. Existing authentication, document, message, task, offer, and teaser-redaction behavior remains unchanged.

## Phase 6 — Private Teaser Distribution

Migration `007_private_teaser_distribution` adds `deal_outreach` and `deal_outreach_recipients`, including the `queued`, `sent`, `viewed`, `pursued`, `passed`, and `expired` recipient lifecycle. The upgrade preserves all existing users, organizations, mandates, buyer projects, matches, access records, and documents.

Authorized deal managers can share a private teaser only with eligible recommendations they explicitly selected. The seller workbench includes an outreach preview, a project-level recipient list, and a status ledger. Delivery is in-app; no external email dependency was added. Buyer workspace queries admit a private-outreach mandate only when the signed-in user's organization has a recipient record, and the buyer payload contains only that organization's recipient rows. Buyers can record interest or pass. Interest creates the existing `requested` access relationship but preserves teaser redaction and never approves confidential access or an NDA. Seller and advisor managers can see when each recipient was sent, viewed, pursued, or passed.

## Phase 7 — Qualified Discovery

Migration `008_qualified_discovery` adds durable introduction requests with `pending`, `approved`, `declined`, and `withdrawn` states. A partial uniqueness constraint on deal plus buyer organization allows a withdrawn request to be resubmitted while preventing a pending, approved, or declined firm from retrying through another project. The upgrade preserves all existing marketplace and transaction data.

The Opportunities navigation is now presented as **Discover**. A buyer organization can see an anonymized Qualified Discovery teaser only when it owns an active, eligible acquisition project at or above `QUALIFIED_DISCOVERY_MIN_SCORE`, which defaults to 70. The workspace response exposes only the organization’s best qualifying project, score, and positive match dimensions; it does not expose the company name, address, owner, advisor, confidential summary, detailed financial history, or documents. Demo and registered-account inventories remain isolated.

Buyers submit an interest-and-credibility statement against the matched project. Deal managers review the organization, project, score, reasons, verification state, experience count, and message before approving or declining. Approval creates the existing `requested` access record for the requesting user and leaves every confidential field gated. The old direct Qualified Discovery access mutation is rejected, and declined organizations cannot bypass the decision.

## Phase 8 — Buyer Funnel

Migration `009_buyer_funnel` adds an append-only `deal_buyer_events` ledger for match, selection, teaser, response, introduction, NDA, CIM, IOI, LOI, shortlist, exclusivity, closing, and access-revocation milestones. A one-time transactional backfill translates existing match, outreach, introduction, access, document, and offer records without changing or deleting the source data. A unique source key makes initialization and repeated workflow calls idempotent; the migration history remains inspectable through `schema_migrations`.

Authorized owners and advisors now receive a deal-scoped Buyer funnel. Its Recommended, Contacted, Interested, NDA, CIM, IOI, LOI, Exclusive, and Closed counts are derived from the event history rather than stored as a second mutable stage. The table exposes every participating buyer's current stage, outcome, match context, latest activity, and chronological event history. Pursuit, NDA, CIM, IOI, and LOI conversion metrics and average response time appear only when the required source events exist; unavailable denominators render as unavailable rather than invented values.

Existing actions record funnel events within the same database transaction where applicable. Deal managers may manually record only milestones that commonly happen outside the portal: CIM shared, IOI received, exclusivity, and closing. Buyer workspaces receive no seller-side funnel payload, and the service rejects unauthorized or unrelated-organization milestone writes.

## Phase 9 — Internal Deal-Team Notes

Migration `010_internal_deal_notes` adds `deal_internal_notes` with deal and author foreign keys, a 5,000-character content limit, chronological indexing, and note preservation when a user is later removed. Fresh and existing Phase 8 databases initialize safely, repeated migration and demo-seed runs remain idempotent, and no existing transaction data is rewritten.

The deal workspace now has a dedicated **Internal notes** ledger for owner and advisor firms. Active firm viewers can read the ledger; owners, administrators, and members can also add append-only entries. Notes are intentionally separate from buyer-specific Messages. Buyer workspace payloads omit `deal_internal_notes` entirely, unrelated firms cannot read or write entries, and server-side authorization is repeated on every note mutation.

## Phase 10 — Notifications and Email Infrastructure

Migration `011_notifications` adds `notifications`, `notification_preferences`, and `email_outbox`; migrations `012_email_processing_lease` and `013_email_processing_token` add recoverable, fenced processing claims. Notifications are scoped to one user, deduplicated by recipient and source event, and cascade safely with their owning user or deal. Preferences support immediate, daily digest, weekly digest, and disabled email delivery while leaving in-app notifications visible. Outbox records retain delivery status, attempts, provider identifiers, failure messages, scheduling timestamps, and a stable idempotency key for provider retries.

The workspace top bar now includes an accessible notification bell with unread count, read/unread controls, mark-all-read, direct transaction links, an empty state, keyboard Escape handling, and responsive positioning. Settings includes a per-type email-frequency matrix for every planned Phase 10 notification type. Existing match, outreach, introduction, buyer-interest, NDA, message, task, document, IOI, LOI, and access-revocation workflows create notifications inside their existing transaction where applicable.

`EmailProvider` isolates vendor delivery from business logic. Development and test environments record email rows with `recorded` status and never contact an external service or require credentials. The outbox processor claims immediate rows once, records provider receipts, and preserves failures for inspection. Daily and weekly rows remain queued for a future digest worker; no production provider, scheduler, or external email delivery was added in this phase.

## Phase 11 — Buyer Verification

Migration `014_buyer_verification` adds an organization-scoped buyer evidence profile, an append-only `verification_reviews` decision ledger, and an explicit `is_platform_admin` authority separate from ordinary firm ownership or administration. Existing organizations are preserved; legacy `verified` values are translated to `verified_acquirer`, unknown values fall back safely to `unverified`, eligible buyer firms receive profiles, and seeded demo buyers remain usable at `verified_acquirer`.

Buyer firms can record their legal name, website, principals, buyer type, acquisition history, capital source, typical cheque size, and financing approach, then submit the profile for internal review. Only persisted platform-reviewer flags provisioned out of band after identity checks can record `email_verified`, `firm_verified`, `capital_reviewed`, `verified_acquirer`, or `rejected` decisions; a self-registered email address never grants that authority. Every decision stores its reviewer, submission revision, previous and resulting state, notes, and timestamp. Buyers cannot see internal reviewer notes. Editing verification-relevant firm data resets an accepted decision for re-review; general persisted matches remain verification-neutral.

Qualified Discovery now requires an ordered verification threshold in addition to the existing project-match threshold. The default is `firm_verified`, configurable through `QUALIFIED_DISCOVERY_MIN_VERIFICATION_STATUS`; `rejected` is invalid as a configured minimum and never qualifies. The server checks the organization’s current status when a buyer browses or requests an introduction and when a seller approves it, preventing stale match records or threshold changes from bypassing the gate. Private outreach, existing granted access, buyer-project creation, and all NDA/document controls remain unchanged. This workflow is an internal platform review based on submitted evidence; it does not claim legal accreditation, independent identity verification, or guaranteed capital.

## Phase 12 — Rich Buyer / Firm Profiles

Migration `015_buyer_firm_profiles` adds a one-to-one seller-facing profile for every eligible buyer organization. Migration `016_buyer_firm_profile_revision` upgrades databases that already recorded 015 before optimistic concurrency was introduced. The profile stores fund structure, financing profile, an optional bounded self-reported acquisition count, editor attribution, a monotonic revision, and timestamps without altering internal verification evidence. Existing buyer organizations are backfilled with an empty profile and revision 1; new registered buyers receive the same empty profile transactionally. An explicit zero remains distinct from an unreported count. Reclassifying an organization out of buyer status pauses its active projects and recalculates matches while preserving historical outreach and funnel records.

Only buyer organization owners and administrators can edit the profile. Seller and advisor deal managers receive a sanitized profile only inside the private Recommended Buyers payload for deals they manage. That view combines the safe firm fields with the buyer's active projects that are eligible for the same mandate, their normalized criteria, and the existing deal-specific marketplace acquisition count. It excludes principals, acquisition-history evidence, capital-source evidence, reviewer notes, and unrelated or ineligible buyer projects. Buyers cannot enumerate competing firm profiles, and no public profile endpoint or page was introduced.

## Phase 13 — Closed Transaction / Tombstone Records

Migration `017_closed_transactions` adds organization-scoped acquisition tombstones with buyer, optional seller, and optional advisor organization references; industry; province; optional enterprise value; closing date; anonymized description; explicit verification state; creator and reviewer attribution; and timestamps. Database constraints prevent a record from claiming verification without both a platform reviewer and review timestamp. The upgrade creates no historical claims and preserves all existing organizations, deals, buyer projects, matches, profiles, documents, and funnel events. Demo seeding adds three clearly fictional records and remains idempotent.

Buyer-firm owners and administrators can add records only for their own eligible buyer organization. Records begin as **Self-reported**, and ordinary buyer, seller, advisor, or firm-admin authority cannot promote them. A separately provisioned platform reviewer may mark a pending record **Succera verified**, but cannot review a record belonging to an organization where they are an active member. Review queues preserve demo/registered-account realm isolation.

Buyer firms see their complete transaction ledger on the Verification page. Authorized seller/advisor deal managers see at most the 20 most recent sanitized tombstones for a matched buyer inside Recommended Buyers; linked seller/advisor organization identifiers, creator/reviewer identities, and internal verification evidence are omitted. Phase 13 does not add public transaction pages, matching weights, reputation scores, editing/deletion, or external evidence storage.

## Phase 14 — Reputation Metrics

Migration `018_buyer_reputation` adds covering indexes over buyer events and verified transaction history without creating a mutable reputation table or inserting any claims. Response rate and median response time are derived from the first final interested/pass response following each private teaser invitation. Opportunities pursued count distinct mandates with expressed interest or an introduction request, and LOIs count distinct mandates with a recorded LOI. Verified transaction totals include only independently reviewed Phase 13 tombstones; relevant transactions are the verified subset whose normalized industry exactly matches the current mandate sector.

Authorized seller/advisor deal managers see these aggregates inside the matched buyer’s private Recommended Buyers profile. The response denominator is displayed with the rate, missing response evidence renders as unavailable, and no raw event, mandate, submitter, reviewer, seller, or advisor identifiers are added to the reputation payload. The metrics are informational only and do not change match weights, match eligibility, recommendation ordering, Qualified Discovery, NDA controls, or confidential access.

## Phase 15 — Electronic NDA Integration

Migration `019_electronic_nda` keeps all existing deals on `external_upload` while adding provider-neutral envelope and authenticated-event ledgers. Seller-side managers can choose an electronic request when a provider is available. The UI shows provider state without collecting a signature in Succera, and buyers are directed to the provider’s own flow. A buyer-signed callback does not grant access. Only an authenticated, idempotent completion callback containing a valid executed PDF stores a buyer-specific NDA, records the funnel milestones, and grants confidential access. Failed, declined, voided, superseded, duplicate, or out-of-order events fail closed.

The included provider is development-only. It exercises request and webhook boundaries but does not perform signatures. Production exposes no electronic-signature action until an established provider adapter is implemented and configured. The original external upload, explicit seller review, authorization, document isolation, demo data, and old access records remain supported.

## Phase 16 — Personalized CIM Watermarking

Migration `020_personalized_cim_watermarking` adds an opt-in `watermark_enabled` flag to documents plus one replaceable cached derivative per document and buyer user. Existing documents default to off and are not rewritten. Deal managers can enable personalization only for valid PDF company overviews shared with approved buyers or one selected buyer; malformed, encrypted, empty, team-only, and non-CIM requests are rejected before storage.

Every buyer download repeats the existing server-side document authorization check before the original is read or a derivative is generated. Enabled downloads add `CONFIDENTIAL`, the buyer firm and email, the Toronto calendar date, and a stable Succera transaction reference on every page. Deal-team downloads return the original bytes. Cache identity includes the original SHA-256 digest, buyer identity, rendered details, and watermark format version. Missing, corrupt, or stale cache files are regenerated and the obsolete derivative is removed. This is an attribution deterrent rather than access control or DRM; approved recipients can still copy, photograph, or redistribute downloaded content.

## Phase 17 — AI Teaser Safety Assistant

Migration `021_ai_teaser_safety` adds seller-team-only review records without changing existing mandates or publication state. The review route reloads the current teaser server-side, verifies manager authorization, rate-limits requests, and stores only completed structured reviews. Buyers receive neither the capability history nor the findings.

Local deterministic checks identify known legal/trading names, entity names, domains, email addresses, customer-name patterns, exact city/address/postal details, exact founding years, employee counts and revealing concentration statements. They also flag missing revenue, EBITDA, valuation, history and narrative scale. A configured model may add findings, a rewrite and highlights, but Succera validates the structured response and rejects any suggested output that still contains locally detected identifiers. The development provider sends nothing externally. The optional OpenAI adapter uses server-side credentials, requests structured JSON with `store:false`, and receives only the teaser plus broad sector, province and financial bands—not the legal name, confidential summary or exact city added by Succera.

Review generation never edits or publishes a mandate. Applying a suggestion is a separate authenticated action, requires the teaser to remain private and unchanged since the review, and leaves publication as another explicit seller/advisor decision. Matching continues through the existing deterministic engine; no model score or recommendation enters it.

## Resolved environment blocker

The original `npm install` was rejected by automatic approval review with the reason: **“Your workspace is out of credits. Add credits to continue.”** The same installation succeeded on an approved retry. No alternate dependency installation path was used. The account usage tool reports ordinary usage allowed; the underlying reason for the earlier approval error is not established, so purchasing credits is not a confirmed remedy.

Dependencies and `package-lock.json` are present. TypeScript, backend tests, production compilation, and Chromium browser tests pass. There is no public deployment.

## Checks available without installing packages

- Package manifest JSON parsing.
- Availability of Node.js built-in SQLite.
- Native Node password-hashing and session-digest tests.
- Actual SQLite initialization SQL and demo seed tests, including foreign-key and uniqueness constraints and sample file creation.

## Executed results

- `npm install`: succeeded; npm reported zero known vulnerabilities at installation time (not a security certification).
- `npm run typecheck`: passed.
- `npm test`: **106 passed, 0 failed**. Coverage includes teaser identifier detection, provider-outage fallback, full-input stale-review protection, historical-versus-projected financial checks, safe fallback when a provider rewrite still identifies the company, outbound provider-field restrictions, seller-team-only review history, deterministic matching independence, repeat-apply and published application gates, Phase 17 migration preservation, personalized watermarking, electronic NDA orchestration, and all earlier reputation, verification, matching, outreach, discovery, funnel, notification, document, organization, session, password, and backup behavior.
- `npm run build`: passed using Next.js 16's documented Webpack build mode. Turbopack's PostCSS evaluator attempted to bind a local worker port that this execution host prohibits, so the production script is pinned to `next build --webpack`; application compilation, type checking, prerendering, and build tracing completed successfully.
- `npm run test:e2e`: **24 passed, 0 failed** in Chromium. This includes a seller safety review, explicit application to a still-private teaser and buyer isolation, personalized PDF delivery, seller-original preservation, electronic NDA pending state, reputation aggregates, transaction tombstones, platform verification, profiles, notifications, the buyer funnel, Qualified Discovery, private teasers, Recommended Buyers, authorization, tasks, environment isolation, and mobile checks.
- The test runner's IPC socket initially required permissions outside the sandbox. Running the same check through the approval mechanism succeeded.
- `npm run test:core`: **32 passed, 0 failed**. Covers password and session safety, migration ordering and rollback, fresh/existing database upgrades through Phase 17, empty review-history preservation, Phase 16 watermark defaults, electronic NDA initialization, reputation and transaction constraints, legacy upgrades, notification and outbox constraints, buyer-funnel backfill, matching, outreach, introductions, and backup integrity.
- `package.json` and `tsconfig.json`: valid JSON.
- Git ignore checks confirm `.env.local`, the SQLite data path, and uploaded-file paths are ignored.

Node reports its SQLite and TypeScript transformation APIs as experimental. Native TypeScript test imports also emit a module-type warning; the checks still exit successfully.

Docker build, actual deployment, restore on a separate host, load testing, and comprehensive security/accessibility review have **not** run. The browser tests are a smoke suite, not exhaustive coverage.

## Succera branding update

Visible website, auth screens, portal labels, metadata, favicon, new demo-file headers, and product documentation now use Succera. Database filenames, session cookies, package identifiers, backup format, Docker volumes, and existing documents were deliberately preserved.

The current full verification totals above include the Succera title and logo assertions. Changes remain local and uncommitted; no shipping or public deployment was performed. Name/domain availability has not been checked.

## Required continuation

Run `npm run dev` from the repository directory to restart the preview, then open `http://localhost:3000`. The server must remain running for that address to work. Stop it before running `npm run test:e2e`, which starts an isolated server on the same port. Further workflow testing and the live-launch requirements remain separate milestones; passing these checks does not make the service ready for confidential real-world transactions.
