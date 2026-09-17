# Live-launch requirements

This list records concrete gaps in the implemented MVP. It is not a claim of comprehensive security or legal compliance.

## Build and verification

- Resolve the dependency-install credit block, generate the lockfile, run the TypeScript, service, browser, and production-build checks, and fix failures.
- Review desktop/mobile rendering, keyboard navigation, focus, form errors, and all role journeys in a running browser.
- Audit authorization against a written role/organization/deal/document matrix. Include two independent owners, unrelated advisors, competing buyers, revoked users, and direct HTTP calls.
- Load-test the selected deployment and confirm database backup and restore.

## Identity and organizations

- Add verified email, password recovery, MFA or managed authentication, session/device management, and administrator invitation controls.
- Define firm memberships and role changes; the MVP currently has individual accounts with firm-name fields.
- Define owner representation authority, advisor assignment/acceptance, member removal, and conflict-of-interest handling.
- Add actual identity and buyer-capital verification before describing participants as verified or vetted.

## Documents and transactions

- Integrate an e-signature provider with verified webhooks, idempotency, signer authority, and evidence retention if signing is to occur inside the app.
- Review NDA and LOI templates with Canadian counsel for the intended jurisdictions. No legal templates or advice are generated in this release.
- Add malware scanning/quarantine and a supported file-preview pipeline before accepting customer uploads.
- Define document retention, deletion, export, watermarking, and download policies; revocation cannot recover downloaded files.
- Add versioned schema migrations and storage migration tooling before changing deployed schemas.
- Decide whether to keep a pilot document room or integrate a specialist virtual data room for complex transactions.

## Operations and commercial launch

- Add email notifications, delivery failure handling, and appropriate consent controls; current messages and invitations appear only in-app.
- Add subscription billing, entitlements, tax/invoicing treatment, and customer support. No payments are implemented.
- Define the platform's contractual role and review applicable privacy, commercial, and transaction-facilitation requirements with counsel.
- Publish real operator identity, terms, privacy notices, and a contact/support process; the About this release page is not a substitute.
- Verify data locations across infrastructure, backups, monitoring, and all subprocessors.
- Define incident response, abuse handling, audited administrator access, uptime monitoring, and restore ownership.
- Validate the Acquire name/domain before adopting it commercially, and decide the English/French launch scope.
