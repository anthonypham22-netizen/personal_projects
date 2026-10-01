import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { tableExists } from "./sqlite-schema.ts";
import { inImmediateTransaction } from "./sqlite-transaction.ts";
import { buyerOrganizationIdForUser } from "./buyer-funnel.ts";
import {
  introducedByAcquireForSource,
  transactionAttributionSourceForEvent,
  type DealBuyerEventType,
  type TransactionAttribution,
  type TransactionAttributionSource,
} from "./types.ts";

const dateOnly = (value?: string | null) => {
  const matched = value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return matched ?? new Date().toISOString().slice(0, 10);
};

export function recordInitialTransactionAttribution(
  database: DatabaseSync,
  input: {
    dealId: string;
    buyerOrganizationId: string;
    source: TransactionAttributionSource;
    introductionDate?: string | null;
    originEventId?: string | null;
    createdByUserId?: string | null;
  },
) {
  const result = database
    .prepare(
      `INSERT INTO transaction_attribution(
         id,deal_id,buyer_organization_id,source,introduced_by_acquire,
         introduction_date,origin_event_id,created_by_user_id,updated_by_user_id
       ) VALUES(?,?,?,?,?,?,?,?,?)
       ON CONFLICT(deal_id,buyer_organization_id) DO NOTHING`,
    )
    .run(
      randomUUID(),
      input.dealId,
      input.buyerOrganizationId,
      input.source,
      introducedByAcquireForSource(input.source) ? 1 : 0,
      dateOnly(input.introductionDate),
      input.originEventId ?? null,
      input.createdByUserId ?? null,
      input.createdByUserId ?? null,
    );
  return result.changes === 1;
}

type AttributionEvent = {
  id: string;
  deal_id: string;
  buyer_organization_id: string;
  event_type: Extract<
    DealBuyerEventType,
    "teaser_sent" | "intro_approved" | "nda_requested"
  >;
  created_by_user_id: string | null;
  created_at: string;
};

type LegacyAccessRelationship = {
  id: string;
  deal_id: string;
  buyer_id: string;
  created_at: string;
};

export function ensureTransactionAttributionBackfill(database: DatabaseSync) {
  if (
    !tableExists(database, "transaction_attribution") ||
    !tableExists(database, "transaction_attribution_state") ||
    !tableExists(database, "deal_buyer_events") ||
    database
      .prepare(
        "SELECT 1 FROM transaction_attribution_state WHERE key='initial_backfill_v1'",
      )
      .get()
  )
    return;

  inImmediateTransaction(database, () => {
    if (
      database
        .prepare(
          "SELECT 1 FROM transaction_attribution_state WHERE key='initial_backfill_v1'",
        )
        .get()
    )
      return;
    const events = database
      .prepare(
        `WITH ranked_events AS (
           SELECT id,deal_id,buyer_organization_id,event_type,
             created_by_user_id,created_at,
             ROW_NUMBER() OVER (
               PARTITION BY deal_id,buyer_organization_id
               ORDER BY created_at,rowid
             ) event_rank
           FROM deal_buyer_events
           WHERE event_type IN ('teaser_sent','intro_approved','nda_requested')
         )
         SELECT id,deal_id,buyer_organization_id,event_type,
           created_by_user_id,created_at
         FROM ranked_events
         WHERE event_rank=1
         ORDER BY created_at,id`,
      )
      .all() as AttributionEvent[];
    for (const event of events) {
      recordInitialTransactionAttribution(database, {
        dealId: event.deal_id,
        buyerOrganizationId: event.buyer_organization_id,
        source: transactionAttributionSourceForEvent(event.event_type)!,
        introductionDate: event.created_at,
        originEventId: event.id,
        createdByUserId: event.created_by_user_id,
      });
    }
    const legacyRelationships = database
      .prepare(
        `SELECT access.id,access.deal_id,access.buyer_id,access.created_at
         FROM access
         WHERE access.status NOT IN ('denied','revoked')
         ORDER BY access.created_at,access.id`,
      )
      .all() as LegacyAccessRelationship[];
    for (const relationship of legacyRelationships) {
      const buyerOrganizationId = buyerOrganizationIdForUser(
        database,
        relationship.buyer_id,
      );
      if (!buyerOrganizationId) continue;
      recordInitialTransactionAttribution(database, {
        dealId: relationship.deal_id,
        buyerOrganizationId,
        source: "external_relationship",
        introductionDate: relationship.created_at,
        createdByUserId: relationship.buyer_id,
      });
    }
    database
      .prepare(
        "INSERT INTO transaction_attribution_state(key,value) VALUES('initial_backfill_v1','complete')",
      )
      .run();
  });
}

export function transactionAttributionsForDeals(
  database: DatabaseSync,
  dealIds: string[],
): TransactionAttribution[] {
  if (!dealIds.length || !tableExists(database, "transaction_attribution"))
    return [];
  const placeholders = dealIds.map(() => "?").join(",");
  return (
    database
      .prepare(
        `SELECT attribution.id,attribution.deal_id,
           attribution.buyer_organization_id,
           buyer_organization.name buyer_organization_name,
           attribution.source,attribution.introduced_by_acquire,
           attribution.introduction_date,attribution.closed_date,
           attribution.enterprise_value,attribution.origin_event_id,
           attribution.created_by_user_id,attribution.updated_by_user_id,
           attribution.revision,attribution.created_at,attribution.updated_at
         FROM transaction_attribution attribution
         JOIN organizations buyer_organization
           ON buyer_organization.id=attribution.buyer_organization_id
         WHERE attribution.deal_id IN (${placeholders})
         ORDER BY attribution.introduction_date,attribution.created_at,attribution.id`,
      )
      .all(...dealIds) as Array<
      Omit<TransactionAttribution, "introduced_by_acquire"> & {
        introduced_by_acquire: number;
      }
    >
  ).map((attribution) => ({
    ...attribution,
    introduced_by_acquire: Boolean(attribution.introduced_by_acquire),
  }));
}
