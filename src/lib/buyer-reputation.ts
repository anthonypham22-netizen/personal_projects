import {
  type BuyerReputationMetrics,
  type DealBuyerEventType,
} from "./types.ts";

export type BuyerReputationEvent = {
  deal_id: string;
  event_type: DealBuyerEventType;
  created_at: string;
};

export type VerifiedTransactionEvidence = {
  industry: string;
};

const timestamp = (value: string) => {
  const isoValue = value.includes("T") ? value : value.replace(" ", "T");
  return Date.parse(
    /(?:Z|[+-]\d{2}:\d{2})$/.test(isoValue) ? isoValue : `${isoValue}Z`,
  );
};

const normalizedIndustry = (value: string) =>
  value.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en-CA");

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 10) / 10;
};

export function deriveBuyerReputationMetrics(
  events: BuyerReputationEvent[],
  verifiedTransactions: VerifiedTransactionEvidence[],
  relevantIndustry: string,
): BuyerReputationMetrics {
  const eventsByDeal = new Map<string, BuyerReputationEvent[]>();
  for (const event of events) {
    const dealEvents = eventsByDeal.get(event.deal_id) ?? [];
    dealEvents.push(event);
    eventsByDeal.set(event.deal_id, dealEvents);
  }

  const responseHours: number[] = [];
  let responseOpportunities = 0;
  let respondedOpportunities = 0;
  for (const dealEvents of eventsByDeal.values()) {
    const sentAt = dealEvents
      .filter((event) => event.event_type === "teaser_sent")
      .map((event) => timestamp(event.created_at))
      .filter(Number.isFinite)
      .sort((left, right) => left - right)[0];
    if (sentAt === undefined) continue;
    responseOpportunities += 1;
    const respondedAt = dealEvents
      .filter((event) => ["pursued", "passed"].includes(event.event_type))
      .map((event) => timestamp(event.created_at))
      .filter((value) => Number.isFinite(value) && value >= sentAt)
      .sort((left, right) => left - right)[0];
    if (respondedAt === undefined) continue;
    respondedOpportunities += 1;
    responseHours.push((respondedAt - sentAt) / 3_600_000);
  }

  const distinctDealsWith = (eventTypes: DealBuyerEventType[]) =>
    new Set(
      events
        .filter((event) => eventTypes.includes(event.event_type))
        .map((event) => event.deal_id),
    ).size;
  const targetIndustry = normalizedIndustry(relevantIndustry);

  return {
    response_rate: responseOpportunities
      ? Math.round((respondedOpportunities / responseOpportunities) * 100)
      : null,
    response_opportunities: responseOpportunities,
    median_response_hours: median(responseHours),
    opportunities_pursued: distinctDealsWith(["pursued", "intro_requested"]),
    lois_submitted: distinctDealsWith(["loi_received"]),
    transactions_closed: verifiedTransactions.length,
    relevant_transactions: verifiedTransactions.filter(
      (transaction) =>
        normalizedIndustry(transaction.industry) === targetIndustry,
    ).length,
  };
}
