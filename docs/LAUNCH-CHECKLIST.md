# Live-launch requirements

This list records concrete gaps in the implemented MVP. It is not a claim of comprehensive security or legal compliance.

## Build and verification

- Resolve the dependency-install credit block, generate the lockfile, run the TypeScript, service, browser, and production-build checks, and fix failures.
- Review desktop/mobile rendering, keyboard navigation, focus, form errors, and all role journeys in a running browser.
- Audit authorization against a written role/organization/deal/document matrix. Include two independent owners, unrelated advisors, competing buyers, revoked users, and direct HTTP calls.
- Load-test the selected deployment and confirm database backup and restore.

## Identity and organizations

- Add verified email, password recovery, MFA or managed authentication, session/device management, and administrator invitation controls.
- Add administrator invitations, role changes, membership removal, and recovery rules around the implemented organization membership model.
- Define owner representation authority, advisor assignment/acceptance, member removal, and conflict-of-interest handling.
- The app now includes an internal buyer-firm evidence review and audit trail. Add independent identity, authority, and buyer-capital verification before describing participants as legally accredited, independently verified, or guaranteed to have funds.

## Public network and discovery

- Review migration `022_public_network` against a production-like copy and confirm every organization has a private public-profile row without changing active mandates or confidential records.
- Keep `PUBLIC_NETWORK_INDEXING_ENABLED=false` for local, staging, preview, and review hostnames. Enable indexing only on the approved production domain after reviewing public copy, canonical metadata, privacy notices, removal handling, and `robots.txt`/sitemap output.
- Verify that advisor and eligible buyer profiles are explicitly opt-in, operating-business seller firms remain absent, and public transaction pages require both firm-level and independently verified transaction-level opt-in.
- Confirm public routes never expose active deal identifiers, legal company names, confidential summaries, buyer projects, documents, messages, seller/advisor identities, or internal verification evidence. Test anonymous requests and direct alternate slugs.
- Treat demo public profiles and transactions as fictional examples only. Never copy staging demo data, public-network taxonomy, or generated sitemap entries into production.

## Documents and transactions

- Integrate an e-signature provider with verified webhooks, idempotency, signer authority, and evidence retention if signing is to occur inside the app.
- Review NDA and LOI templates with Canadian counsel for the intended jurisdictions. No legal templates or advice are generated in this release.
- Add malware scanning/quarantine and a supported file-preview pipeline before accepting customer uploads.
- Define document retention, deletion, export, watermarking, and download policies; revocation cannot recover downloaded files.
- Treat the implemented personalized PDF watermark as an attribution deterrent, not DRM. Validate the legal notice, recipient data, cache-retention period, secure cache deletion, and incident-handling policy before live use.
- Keep the teaser assistant disabled until privacy counsel and the operator approve the provider, model, data residency, retention, subprocessor terms, user disclosure, evaluation set, incident handling, and human-review policy. Test false negatives with realistic Canadian M&A teasers; never market the assistant as guaranteeing anonymity.
- Exercise the implemented schema migration runner against production-like database copies and add storage migration tooling before changing uploaded-file layouts.
- Decide whether to keep a pilot document room or integrate a specialist virtual data room for complex transactions.

## Operations and commercial launch

- Connect a production email provider and digest scheduler, then validate delivery failures and consent controls. The app currently records development/test deliveries without sending external email.
- Add subscription billing, entitlements, tax/invoicing treatment, and customer support. No payments are implemented.
- Define the platform's contractual role and review applicable privacy, commercial, and transaction-facilitation requirements with counsel.
- Publish real operator identity, terms, privacy notices, and a contact/support process; the About this release page is not a substitute.
- Verify data locations across infrastructure, backups, monitoring, and all subprocessors.
- Define incident response, abuse handling, audited administrator access, uptime monitoring, and restore ownership.
- Validate the Succera name/domain before adopting it commercially, and decide the English/French launch scope.
