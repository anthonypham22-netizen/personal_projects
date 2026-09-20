# Acquire demo-readiness pass

This change improves the existing application for presenter-led demonstrations. It does not deploy the application, implement a PostgreSQL/object-storage migration, certify security, or enable real electronic signatures.

## What changed

- Six fictional PDF documents replace the original disclaimer-only text fixtures: Cedar financial overview, Cedar business overview, Cedar NDA process example, seller-only Cedar preparation notes, Summit financial overview, and Summit illustrative offer.
- Financial schedules reconcile to the original fictional opportunity figures. Reported and adjusted earnings are distinct; the offer separates cash at closing, seller financing and contingent consideration.
- The NDA example is a process record, not a legal agreement. The offer is a fictional term summary, not a binding or executed LOI. Every PDF page is marked fictional.
- Initializing a demo database upgrades only the known, untouched placeholder files. Existing document IDs, deal associations and access scopes remain unchanged. Customized or non-demo files are not rewritten.
- A persistent notice appears in authenticated demo workspaces. Demo accounts cannot upload files; the server also honors ALLOW_UPLOADS=false for a deployment-wide upload block.
- Browser tests capture the actual landing page, three role dashboards, document library, Cedar deal room and mobile document library. CI retains the fictional screenshots and downloaded sample PDFs as the acquire-demo-preview artifact for seven days.
- Additional tests cover document integrity, arithmetic consistency, safe upgrades, blocked uploads, access revocation/re-approval, buyer questions and indicative offer review.

## Start a fresh local demonstration

Use the repository's supported Node 24 release and install with npm ci. Stop any running local preview before switching its data directory.

```sh
node scripts/new-demo.mjs
```

The command prints the path of a newly created fictional database under data/demo-sessions/. It does not delete old databases or change an existing deployment. Set these values in your local environment, using the printed path for DATA_DIR:

```dotenv
DATA_DIR=<printed-directory>
APP_URL=http://localhost:3000
ALLOW_DEMO=true
ALLOW_REGISTRATION=false
ALLOW_UPLOADS=false
COOKIE_SECURE=false
```

Then run npm run dev and open /login. Choose Advisor demo, Buyer demo or Owner demo. For an HTTPS deployment, set the exact HTTPS APP_URL and enable secure cookies instead. Never commit environment files or data directories.

To reset for another presentation, stop the preview, run new-demo again, point DATA_DIR at the new path and restart. Existing sessions and files remain in their previous directory. This is an administrator-operated reset procedure, not a public reset endpoint.

## Suggested walkthrough

1. Advisor: open the overview and Project Cedar. Explain mandate status, the owner/advisor relationship, buyer access and next actions.
2. Advisor: download the Cedar financial overview and business overview. Demonstrate the reported-to-adjusted earnings bridge, concentration, working capital and unanswered diligence questions.
3. Buyer: open Cedar's approved documents. Explain that seller-only preparation notes and competing buyers' records remain unavailable.
4. Buyer/advisor: use the private conversation and an assigned task to show how a question is tracked.
5. Advisor: open Summit and its indicative offer. Contrast the C$13.2M headline consideration with C$10.56M upfront cash, C$1.32M seller financing and up to C$1.32M contingent earnout.
6. Owner: show progress and the offer-review state. Explain that Shortlisted is a workflow label, not legal acceptance.

The seeded NDA review is simulated. Do not call any sample an executed agreement or real financing evidence. Arbitrary demo uploads are intentionally blocked, so use the preloaded files rather than attempting to upload an NDA during the presentation.

## Verification

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

The GitHub Actions result for the exact commit is the source of verification status. The screenshots are real captures of the application in CI, not a publicly accessible website. Review desktop and mobile images before presenting.

## Remaining boundaries

The demo remains shared among its predefined accounts. Typed messages and other allowed mutations persist until the administrator switches to a fresh demo directory. The warning does not technically prevent someone typing confidential text, so restrict access to the presenter and trusted test participants.

The checked-in Docker/Caddy setup does not gain a hosting access gate from this change. ALLOW_REGISTRATION=false must be explicitly configured, and the existing Compose configuration disables demo accounts unless deliberately overridden for a protected staging environment. Do not enable the demo on an unrestricted public deployment.

Local SQLite and local uploads remain in use. Vercel compatibility still requires a persistent external database and private object storage. Do not put the SQLite database in a temporary directory as a workaround. Real-customer onboarding, managed identity, malware scanning, privacy/legal preparation and broader production review remain separate work.
