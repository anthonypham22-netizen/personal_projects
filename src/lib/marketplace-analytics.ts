import type { DatabaseSync } from "node:sqlite";
import {
  type DealManagerMarketplaceAnalytics,
  type BuyerMarketplaceAnalytics,
  type DealBuyerFunnel,
} from "./types";

const percentage = (numerator: number, denominator: number) =>
  denominator ? Math.round((numerator / denominator) * 100) : null;

export function deriveDealManagerMarketplaceAnalytics(
  funnel: DealBuyerFunnel,
  dealTitle: string,
): DealManagerMarketplaceAnalytics {
  const relationships = funnel.buyers.map((entry) => {
    const eventTypes = new Set<string>(
      entry.events.map((event) => event.event_type),
    );
    const has = (eventType: string) => eventTypes.has(eventType);
    const interested = ["pursued", "intro_requested", "intro_approved"].some(
      (eventType) => has(eventType),
    );
    const nda = ["nda_requested", "nda_uploaded", "nda_approved"].some(
      (eventType) => has(eventType),
    );
    const cim = has("cim_shared");
    const ioi = has("ioi_received");
    const loi = has("loi_received");
    return {
      recommended: ["matched", "selected", "excluded"].some((eventType) =>
        has(eventType),
      ),
      sent: has("teaser_sent"),
      viewed: has("teaser_viewed"),
      contacted: has("teaser_sent") || interested,
      interested,
      nda,
      cim,
      ioi,
      loi,
      exclusive: has("exclusive"),
      conversion: { interested, nda, cim, ioi, loi },
    };
  });
  const count = (key: keyof (typeof relationships)[number]) =>
    relationships.filter((relationship) => relationship[key]).length;
  const teasers = { sent: count("sent"), viewed: count("viewed") };
  const interested = count("interested");
  const contacted = count("contacted");
  const nda = count("nda");
  const cim = count("cim");
  const ioi = count("ioi");
  const loi = count("loi");
  const conversionCount = (
    denominator: keyof (typeof relationships)[number]["conversion"],
    numerator: keyof (typeof relationships)[number]["conversion"],
  ) =>
    relationships.filter(
      (relationship) =>
        relationship.conversion[denominator] &&
        relationship.conversion[numerator],
    ).length;

  return {
    deal_id: funnel.deal_id,
    deal_title: dealTitle,
    counts: {
      recommended_buyers: count("recommended"),
      teasers_sent: teasers.sent,
      teaser_views: teasers.viewed,
      interested,
      ndas: nda,
      cims: cim,
      iois: ioi,
      lois: loi,
      exclusive: count("exclusive"),
    },
    metrics: {
      view_rate: percentage(teasers.viewed, teasers.sent),
      pursuit_rate: percentage(interested, contacted),
      nda_conversion: percentage(
        conversionCount("interested", "nda"),
        interested,
      ),
      ioi_conversion: percentage(conversionCount("cim", "ioi"), cim),
      loi_conversion: percentage(conversionCount("ioi", "loi"), ioi),
      average_response_hours: funnel.metrics.average_response_hours,
    },
  };
}

export function buyerMarketplaceAnalytics(
  database: DatabaseSync,
  organizationId: string,
): BuyerMarketplaceAnalytics {
  const analytics = database
    .prepare(
      `WITH effective_events AS (
         SELECT deal_id,buyer_organization_id,event_type,
           ROW_NUMBER() OVER (
             PARTITION BY deal_id,buyer_organization_id
             ORDER BY created_at DESC,rowid DESC
           ) event_rank
         FROM deal_buyer_events
         WHERE buyer_organization_id=?
           AND event_type IN (
             'access_revoked','not_proceeding','intro_declined','passed','excluded',
             'closed','selected','teaser_sent','teaser_viewed','pursued','intro_requested',
             'intro_approved','nda_requested','nda_uploaded','nda_approved',
             'cim_shared','ioi_received','loi_received','shortlisted','exclusive'
           )
       ),
       latest_relationship_event AS (
         SELECT deal_id,buyer_organization_id,event_type
         FROM effective_events
         WHERE event_rank=1
       ),
       closed_relationships AS (
         SELECT DISTINCT deal_id,buyer_organization_id
         FROM effective_events
         WHERE event_type='closed'
       )
       SELECT
         COUNT(DISTINCT CASE
           WHEN event_type IN ('teaser_sent','intro_approved','nda_requested')
           THEN deal_id END) opportunities_received,
         COUNT(DISTINCT CASE WHEN event_type='teaser_viewed'
           THEN deal_id END) opportunities_viewed,
         COUNT(DISTINCT CASE WHEN event_type IN ('pursued','intro_requested')
           THEN deal_id END) opportunities_pursued,
         COUNT(DISTINCT CASE WHEN event_type='loi_received'
           THEN deal_id END) lois_submitted,
         (SELECT COUNT(DISTINCT deal.id)
          FROM access buyer_access
          JOIN organization_members membership
           ON membership.user_id=buyer_access.buyer_id
           AND membership.organization_id=? AND membership.status='active'
          JOIN deals deal ON deal.id=buyer_access.deal_id
          LEFT JOIN latest_relationship_event latest
            ON latest.deal_id=deal.id
           AND latest.buyer_organization_id=?
          LEFT JOIN closed_relationships closed
            ON closed.deal_id=deal.id
           AND closed.buyer_organization_id=?
          WHERE buyer_access.status='approved'
            AND deal.stage='Due diligence'
            AND closed.deal_id IS NULL
            AND (
              latest.event_type IS NULL
              OR latest.event_type NOT IN (
                'not_proceeding','passed','intro_declined','access_revoked','excluded'
              )
            )) active_diligence_processes
       FROM deal_buyer_events
       WHERE buyer_organization_id=?`,
    )
    .get(
      organizationId,
      organizationId,
      organizationId,
      organizationId,
      organizationId,
    ) as BuyerMarketplaceAnalytics;
  return { ...analytics };
}
