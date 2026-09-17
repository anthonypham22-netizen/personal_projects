# Canadian M&A platform: initial discovery

Date: 2026-09-16
Status: Research and provisional product hypotheses; not an approved implementation plan.

## User's objective

Build a SaaS platform competing with Axial in Canada, with portals for buyers/acquirers, business owners/sellers, and M&A advisors. Support connections, NDA and LOI document management, communication, collaboration, and transaction facilitation.

The local repository currently has no application files or commits. No application has been implemented or deployed during this discovery pass.

## Verified competitive context

These observations describe public product claims, not an independent test of the products or their private portals.

| Product | Publicly described capabilities | Implication for this project |
| --- | --- | --- |
| [Axial](https://www.axial.net/) | US and Canadian lower-middle-market transactions; buyer criteria matching; seller-controlled private outreach; digital NDAs; messaging; document storage; deal pipeline tracking. Its site explicitly describes no public deal-search capability. | Canadian coverage, three user groups, and document sharing are already present. Differentiation requires a more specific customer and workflow advantage. |
| [Heirly](https://heirly.co/about) | Toronto-founded platform describing matching among buyers, sellers, and advisors, with vetted profiles. | A Canadian three-party network is not an unoccupied category. No conclusion about its private deal-management features was established. |
| [Repreneuriat Québec Index](https://repreneuriat.quebec/index/) | Confidential SME listings, region/sector/price searches, saved searches, matching requests, alerts, and buyer-partner matching. | Québec has an existing local network; French-language support and local distribution need deliberate treatment. |
| [SuccessionMatching](https://successionmatching.com/) | Business and farm matching, privacy controls, professional connections, and annual paid listings without sales commissions. | Matching and subscriptions are established approaches. Do not claim uniqueness from these alone. |

## Proposed product thesis to validate

Help Canadian owners and advisors move qualified buyers from a confidential introduction to an organized transaction, with explicit control of information at each step.

Start with a useful workspace for advisors managing existing mandates and their own invited counterparties. Add network discovery around those transactions. This may reduce dependence on a large buyer network on launch day, but willingness to pay and demand remain unvalidated.

Initial segment: established Canadian SMEs with roughly C$1M–C$20M in annual revenue (session-settled: user-approved — selected over businesses below C$1M or above C$20M after explaining the effects on buyer qualification, advisor involvement, and deal-room complexity). Advisors serving this segment are the proposed initial paying customer; that commercial choice remains unvalidated. Revenue, EBITDA, enterprise value, equity purchase price, and buyer capital available must be distinct fields.

## Proposed portal responsibilities

| Portal | Main jobs |
| --- | --- |
| Buyer | Describe acquisition criteria and financing readiness; receive relevant opportunities; request access; review and sign NDAs; manage diligence; submit LOIs; track next actions. |
| Owner | Prepare a confidential business profile; find or invite an advisor; authorize representation and disclosure; review buyer interest; provide documents; compare offers; monitor progress. |
| Advisor | Manage several mandates; prepare teasers; shortlist and invite buyers; manage NDA and disclosure approvals; organize document rooms and Q&A; compare LOIs; coordinate milestones and client reporting. |

The portals should share transaction records. A user's role does not automatically grant access to every deal, and an advisor's membership does not authorize representation of any owner.

## Candidate first complete workflow

1. Owner creates a private business profile and optionally invites an advisor with explicit authority.
2. Owner/advisor prepares an anonymous teaser and selects permitted recipients.
3. Buyer receives the teaser, reviews fit, and requests confidential access.
4. Authorized seller-side participant approves the buyer and sends an NDA.
5. Confirmed NDA execution plus an explicit access grant unlocks the permitted documents.
6. Each buyer has a separate conversation, Q&A, document-access scope, and activity history.
7. Buyer submits an LOI; seller-side participants review versions and compare terms.
8. Selected parties continue through diligence tasks and closing milestones; unsuccessful processes can be withdrawn or archived.

This is a candidate journey, not a mandatory universal sequence: preliminary diligence may occur before an LOI, and commercial processes vary.

## Proposed MVP capabilities

- Organization accounts, invitations, role-specific onboarding, and deal-level permissions.
- Buyer criteria and confidential business profiles with explained matching rules.
- Private invitations and access requests, with owner/advisor control over disclosure.
- NDA templates or uploads, version history, signature-provider integration, and signature status tied to evidence.
- LOI uploads, revision history, structured key terms, review state, and deadline tracking.
- Document room with folders, versions, recipient permissions, download controls, and audit events.
- Buyer-specific messaging and Q&A; separate internal notes for each party.
- Tasks, due dates, deal stages, and notification preferences.
- Admin tools for membership review, reports, and access support, with audited privileged access.

For a prototype, use fictional companies and clearly simulated signature events. For a live pilot, document authorization must be enforced on the server and storage layer; hiding UI controls is insufficient. An uploaded file must not automatically be treated as an executed agreement. Revoking portal access cannot erase files already downloaded by a recipient.

## Canadian product considerations

- CAD defaults, explicit currencies, province/territory filters, and Canadian regions and time zones.
- Make English/French launch coverage a product choice tied to target geography; do not assume national bilingual readiness from translated navigation alone.
- Evaluate Canadian hosting and storage locations, backups, subprocessors, signature services, and support access as a complete data-handling design. Canadian hosting alone is not a compliance determination.
- Plan access minimization and retention/deletion handling for employee, customer, and other personal information in diligence. The [Office of the Privacy Commissioner describes conditions for personal-information use and disclosure during business transactions](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/r_o_p/02_05_d_63_s4/); an NDA alone is not an adequate product permission model.
- Have Canadian counsel validate jurisdiction-specific agreement templates, privacy obligations, and the platform's commercial role before a live launch. No legal compliance conclusion has been made in this research.

## Commercial hypotheses

Test advisor subscriptions based on seats and active mandates, with invited owner and buyer access included. Explore paid buyer discovery once there is useful deal supply. Pricing amounts and transaction-based fees remain undecided.

Potential pilot signals: repeat use by advisor teams, qualified buyer responses, time from access request to NDA completion, unanswered diligence requests, and willingness to pay. Closed transactions are a longer-term outcome; early pilot success should not depend solely on closing an acquisition.

## Decisions still open

The user selected established SMEs with roughly C$1M–C$20M annual revenue. Subsequent discovery should establish initial geography, reachable pilot customers, existing workflow pain, who pays, and the smallest complete workflow worth testing. Those answers determine prototype scope and the subsequent implementation plan.

Broader possibilities to defer until justified: automated valuation, autonomous legal drafting or negotiation, funds handling, a lending marketplace, and a complete replacement for specialist virtual data rooms.
