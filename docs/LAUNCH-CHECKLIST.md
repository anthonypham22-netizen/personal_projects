# Succera live-launch checklist

This is an operational checklist, not a claim of legal or security compliance.

## Database and environment separation

- [ ] Production project is **Succera Production**, ref
      `vtfzevaizyvgmynnyxsb`, region `ca-central-1`.
- [ ] No Succera secret, migration, test, or deployment references the older
      US-East project.
- [ ] Staging has its own database credentials; if no staging database exists,
      staging remains blocked rather than sharing production.
- [ ] Production sets `APP_ENV=production`, `ALLOW_DEMO=false`,
      `COOKIE_SECURE=true`, and a server-only `DATABASE_URL`.
- [ ] Local and CI tests use isolated PGlite or an explicitly isolated test DB,
      never production.
- [ ] Reviewed SQL in `supabase/migrations/` has been applied in order and
      `npm run db:verify` confirms tables, foreign keys, indexes, and migration
      history.
- [ ] Supabase database backups and restore procedures have been tested in a
      separate environment.
- [ ] The historical SQLite source is retained read-only until row counts and
      critical workflows are reconciled after import.
- [ ] Production has no SQLite dependency, fallback, or dual-write path.

## Supabase security review

- [ ] Security Advisor has been run after migrations and material findings are
      resolved.
- [ ] Performance Advisor has been reviewed for missing foreign-key indexes and
      obvious query issues.
- [ ] RLS is enabled on every application table.
- [ ] `anon` and `authenticated` cannot read sensitive application tables,
      including users, password hashes, session digests, confidential deals,
      documents, buyer reviews, messages, tasks, and offers.
- [ ] Database credentials exist only in server secret stores.
- [ ] No policy assumes Supabase `auth.uid()` because Succera still uses custom
      authentication.

## Buyer profile review

- [ ] Each internal reviewer was explicitly promoted by setting only their
      `users.is_platform_admin` flag after confirming one exact account match.
- [ ] Owner and advisor accounts cannot submit buyer profiles.
- [ ] Buyers cannot approve or otherwise set their own review status.
- [ ] Non-admins receive no admin navigation and cannot load admin routes or
      review APIs directly.
- [ ] Pending, more-information, approved, and rejected states display the
      approved customer wording.
- [ ] Capital source and equity range are visibly labelled self-reported.
- [ ] More-information and rejection actions require a useful buyer-visible note.
- [ ] An unapproved buyer cannot request an introduction leading to confidential
      access, receive seller-approved data-room access, or submit an LOI.
- [ ] Approved buyers still require seller/advisor approval and a completed NDA
      for each deal.
- [ ] Sellers see “Buyer profile reviewed” without equity range or internal
      review notes.
- [ ] Demo reviewers cannot enumerate or modify real applications, and real
      reviewers cannot enumerate demo applications.
- [ ] Production contains no fictional buyer-review applications.

## Existing marketplace regression checks

- [ ] Registration, login, logout, session expiry, profile settings, and login
      rate limits work.
- [ ] Owner/advisor authorization, buyer isolation, and demo/real isolation work.
- [ ] Mandate creation, publication, matching, private outreach, Qualified
      Discovery, and introduction approval work.
- [ ] NDA, external/electronic signature, document permissions, revocation,
      messages, diligence tasks, LOIs, offers, and closing records work.
- [ ] Direct HTTP requests and copied document URLs cannot bypass authorization.
- [ ] The complete verification suite passes:

  ```sh
  npm run typecheck
  npm test
  npm run build
  npm run test:e2e
  ```

## Private file storage

- [ ] Everyone understands that structured data is in Supabase Postgres while
      uploaded document bytes use private Blob on Vercel or the private local
      volume for a filesystem deployment.
- [ ] Private Blob retention/export (or filesystem upload backups) is encrypted,
      monitored, and paired with a compatible Supabase restore point.
- [ ] Uploaded files are not served directly by Caddy or a public object path;
      the Vercel store is private and downloads pass through authorization.
- [ ] Malware scanning/quarantine and retention/deletion policies are completed
      before accepting customer documents.
- [ ] Watermarks are treated as attribution deterrence, not DRM; downloaded
      copies cannot be recalled.

## Product, legal, and operations

- [ ] Canadian counsel has reviewed NDA/LOI workflows, marketplace terms,
      privacy notices, data retention, and Succera's platform role.
- [ ] Buyer profile review is not marketed as KYC, financial verification,
      accreditation, proof of funds, or a guarantee of capital.
- [ ] Email and e-signature providers have approved production adapters,
      authenticated webhooks, retention/residency review, and incident handling.
- [ ] Public profile indexing remains disabled until public copy, consent,
      removal, privacy, and canonical metadata are approved.
- [ ] Production administrator access, logs, monitoring, restore ownership,
      support, abuse handling, and incident response are documented.
- [ ] Succera name/domain clearance and English/French launch scope are decided.
