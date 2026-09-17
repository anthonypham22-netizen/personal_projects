# Hosting Acquire

## What you will host

The public website and private SaaS portals are one Next.js application. One Node.js process serves both; a persistent volume stores SQLite and uploaded files. Caddy sits in front of the application and handles HTTPS.

The first deployment should be a staging environment with fictional data. A successful deployment is not a substitute for completing the [live-launch requirements](LAUNCH-CHECKLIST.md).

## 1. Complete local verification

Local installation, TypeScript checking, the production build, 16 backend tests, and 5 Chromium checks passed on 2026-09-16. Repeat verification after changes and before deployment:

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
ALLOW_REGISTRATION=true
```

Replace the example domain with the actual DNS name. Do not include `https://` in `APP_DOMAIN`. Docker Compose constructs the exact `APP_URL` from it, enables secure cookies, and disables demo accounts. Ensure `.env` is readable only by the deployment administrator.

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

Keep the previous known-good commit and backup. A code rollback alone may not be compatible with later database migrations. This release initializes tables but does not include a versioned migration framework yet.

## What changes for a larger launch

The current architecture is deliberately limited to **one server and one application instance**. Do not horizontally scale it against shared SQLite files or separate local upload directories.

For multiple instances, replace the persistence layer with managed PostgreSQL, store documents in a private object-storage service, add an appropriate job queue and shared rate-limit storage, and expand organization membership/authorization. Add monitoring, audited support access, disaster recovery, and the missing identity, email, signature, and billing integrations before broader rollout.

For framework deployment behavior, consult the official [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting).
