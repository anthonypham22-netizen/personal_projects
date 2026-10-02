import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "./db";
import {
  BUYER_FUNNEL_STAGES,
  type BuyerFunnelEntry,
  type BuyerFunnelMetrics,
  type BuyerFunnelStage,
  type BuyerVerificationStatus,
  type DealBuyerEvent,
  type DealBuyerEventType,
  type DealBuyerFunnel,
  type DealMatchStatus,
} from "./types.ts";
import { inTransaction } from "./transaction";
import { tableExists } from "./schema";

export type RecordBuyerEventInput = {
  dealId: string;
  buyerOrganizationId: string;
  buyerProjectId?: string | null;
  eventType: DealBuyerEventType;
  sourceKey: string;
  metadata?: Record<string, unknown>;
  createdByUserId?: string | null;
  createdAt?: string | null;
};

export async function recordDealBuyerEvent(
  database: DatabaseClient,
  input: RecordBuyerEventInput,
) {
  if (!(await tableExists(database, "deal_buyer_events"))) return false;
  const result = await database
    .prepare(
      `INSERT OR IGNORE INTO deal_buyer_events(
        id,deal_id,buyer_organization_id,buyer_project_id,event_type,
        metadata_json,created_by_user_id,source_key,created_at
      ) VALUES(?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP))`,
    )
    .run(
      randomUUID(),
      input.dealId,
      input.buyerOrganizationId,
      input.buyerProjectId ?? null,
      input.eventType,
      JSON.stringify(input.metadata ?? {}),
      input.createdByUserId ?? null,
      input.sourceKey,
      input.createdAt ?? null,
    );
  return result.changes > 0;
}

export async function buyerOrganizationIdForUser(
  database: DatabaseClient,
  userId: string,
) {
  return (
    (await database
      .prepare(
        `SELECT organization_id FROM organization_members
         WHERE user_id=? AND status='active'
         ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'member' THEN 3 ELSE 4 END,
           created_at,id LIMIT 1`,
      )
      .get(userId)) as { organization_id: string } | undefined
  )?.organization_id;
}

export async function bestBuyerProjectForDeal(
  database: DatabaseClient,
  dealId: string,
  buyerOrganizationId: string,
) {
  return (await database
    .prepare(
      `SELECT buyer_project_id FROM deal_matches
       WHERE deal_id=? AND buyer_organization_id=?
       ORDER BY eligible DESC,score DESC,updated_at DESC,id LIMIT 1`,
    )
    .get(dealId, buyerOrganizationId)) as
    { buyer_project_id: string } | undefined;
}

async function backfillMatches(database: DatabaseClient) {
  const matches = (await database
    .prepare(
      `SELECT id,deal_id,buyer_project_id,buyer_organization_id,status,
        created_at,updated_at FROM deal_matches WHERE eligible=1`,
    )
    .all()) as Array<{
    id: string;
    deal_id: string;
    buyer_project_id: string;
    buyer_organization_id: string;
    status: DealMatchStatus;
    created_at: string;
    updated_at: string;
  }>;
  for (const match of matches) {
    const base = {
      dealId: match.deal_id,
      buyerOrganizationId: match.buyer_organization_id,
      buyerProjectId: match.buyer_project_id,
    };
    await recordDealBuyerEvent(database, {
      ...base,
      eventType: "matched",
      sourceKey: `match:${match.id}`,
      createdAt: match.created_at,
    });
    if (["selected", "contacted"].includes(match.status))
      await recordDealBuyerEvent(database, {
        ...base,
        eventType: "selected",
        sourceKey: `match-selection:${match.id}`,
        createdAt: match.updated_at,
      });
    if (match.status === "excluded")
      await recordDealBuyerEvent(database, {
        ...base,
        eventType: "excluded",
        sourceKey: `match-exclusion:${match.id}`,
        createdAt: match.updated_at,
      });
  }
}

async function backfillOutreach(database: DatabaseClient) {
  const rows = (await database
    .prepare(
      `SELECT dor.*,o.deal_id,o.sender_user_id,o.created_at outreach_created_at
       FROM deal_outreach_recipients dor
       JOIN deal_outreach o ON o.id=dor.outreach_id`,
    )
    .all()) as Array<Record<string, string | null>>;
  for (const row of rows) {
    const base = {
      dealId: String(row.deal_id),
      buyerOrganizationId: String(row.buyer_organization_id),
      buyerProjectId: String(row.buyer_project_id),
      createdByUserId: String(row.sender_user_id),
    };
    if (row.status !== "queued")
      await recordDealBuyerEvent(database, {
        ...base,
        eventType: "teaser_sent",
        sourceKey: `outreach:${row.id}:sent`,
        createdAt: row.sent_at ?? row.outreach_created_at,
      });
    for (const [eventType, timestamp] of [
      ["teaser_viewed", row.viewed_at],
      ["pursued", row.pursued_at],
      ["passed", row.passed_at],
    ] as const)
      if (timestamp)
        await recordDealBuyerEvent(database, {
          ...base,
          eventType,
          sourceKey: `outreach:${row.id}:${eventType}`,
          createdAt: timestamp,
        });
  }
}

async function backfillIntroductions(database: DatabaseClient) {
  const rows = (await database
    .prepare("SELECT * FROM introduction_requests")
    .all()) as Array<Record<string, string | null>>;
  for (const row of rows) {
    const base = {
      dealId: String(row.deal_id),
      buyerOrganizationId: String(row.buyer_organization_id),
      buyerProjectId: String(row.buyer_project_id),
    };
    await recordDealBuyerEvent(database, {
      ...base,
      eventType: "intro_requested",
      sourceKey: `introduction:${row.id}:requested`,
      createdByUserId: String(row.requested_by_user_id),
      createdAt: row.created_at,
    });
    if (row.status === "approved" || row.status === "declined")
      await recordDealBuyerEvent(database, {
        ...base,
        eventType:
          row.status === "approved" ? "intro_approved" : "intro_declined",
        sourceKey: `introduction:${row.id}:${row.status}`,
        createdByUserId: row.reviewed_by_user_id,
        createdAt: row.reviewed_at,
      });
  }
}

async function backfillAccess(database: DatabaseClient) {
  const rows = (await database.prepare("SELECT * FROM access").all()) as Array<
    Record<string, string | null>
  >;
  for (const row of rows) {
    const organizationId = await buyerOrganizationIdForUser(
      database,
      String(row.buyer_id),
    );
    if (!organizationId) continue;
    const project = await bestBuyerProjectForDeal(
      database,
      String(row.deal_id),
      organizationId,
    );
    const projectId = project?.buyer_project_id ?? null;
    const base = {
      dealId: String(row.deal_id),
      buyerOrganizationId: organizationId,
      buyerProjectId: projectId,
    };
    if (["requested", "verified"].includes(String(row.nda_status)))
      await recordDealBuyerEvent(database, {
        ...base,
        eventType: "nda_requested",
        sourceKey: `access:${row.id}:nda-requested`,
        createdAt: row.created_at,
      });
    if (row.status === "approved" && row.nda_status === "verified")
      await recordDealBuyerEvent(database, {
        ...base,
        eventType: "nda_approved",
        sourceKey: `access:${row.id}:nda-approved`,
        createdAt: row.created_at,
      });
    if (row.status === "revoked")
      await recordDealBuyerEvent(database, {
        ...base,
        eventType: "access_revoked",
        sourceKey: `access:${row.id}:revoked`,
        createdAt: row.created_at,
      });
  }
}

async function backfillDocuments(database: DatabaseClient) {
  const documents = (await database
    .prepare(
      `SELECT id,deal_id,category,audience,buyer_id,uploaded_by,created_at
       FROM documents WHERE category IN ('NDA','Company overview')`,
    )
    .all()) as Array<Record<string, string | null>>;
  for (const document of documents) {
    const recipients =
      document.audience === "buyer" && document.buyer_id
        ? [String(document.buyer_id)]
        : document.category === "Company overview" &&
            document.audience === "approved"
          ? (
              (await database
                .prepare(
                  "SELECT buyer_id FROM access WHERE deal_id=? AND status='approved'",
                )
                .all(document.deal_id)) as { buyer_id: string }[]
            ).map(({ buyer_id }) => buyer_id)
          : [];
    for (const buyerId of recipients) {
      const organizationId = await buyerOrganizationIdForUser(
        database,
        buyerId,
      );
      if (!organizationId) continue;
      const project = await bestBuyerProjectForDeal(
        database,
        String(document.deal_id),
        organizationId,
      );
      const projectId = project?.buyer_project_id ?? null;
      await recordDealBuyerEvent(database, {
        dealId: String(document.deal_id),
        buyerOrganizationId: organizationId,
        buyerProjectId: projectId,
        eventType: document.category === "NDA" ? "nda_uploaded" : "cim_shared",
        sourceKey: `document:${document.id}`,
        createdByUserId: document.uploaded_by,
        createdAt: document.created_at,
      });
    }
  }
}

async function backfillOffers(database: DatabaseClient) {
  const offers = (await database
    .prepare("SELECT * FROM offers")
    .all()) as Array<Record<string, string | number | null>>;
  for (const offer of offers) {
    const organizationId = await buyerOrganizationIdForUser(
      database,
      String(offer.buyer_id),
    );
    if (!organizationId) continue;
    const project = await bestBuyerProjectForDeal(
      database,
      String(offer.deal_id),
      organizationId,
    );
    const projectId = project?.buyer_project_id ?? null;
    const base = {
      dealId: String(offer.deal_id),
      buyerOrganizationId: organizationId,
      buyerProjectId: projectId,
      createdByUserId: String(offer.buyer_id),
      metadata: { offer_id: offer.id, amount: offer.amount },
    };
    await recordDealBuyerEvent(database, {
      ...base,
      eventType: "loi_received",
      sourceKey: `offer:${offer.id}:received`,
      createdAt: String(offer.created_at),
    });
    if (offer.status === "Shortlisted")
      await recordDealBuyerEvent(database, {
        ...base,
        eventType: "shortlisted",
        sourceKey: `offer:${offer.id}:shortlisted`,
        createdAt: String(offer.created_at),
      });
    if (offer.status === "Not proceeding")
      await recordDealBuyerEvent(database, {
        ...base,
        eventType: "not_proceeding",
        sourceKey: `offer:${offer.id}:not-proceeding`,
        createdAt: String(offer.created_at),
      });
  }
}

export async function ensureBuyerFunnelBackfill(database: DatabaseClient) {
  if (
    !(await tableExists(database, "deal_buyer_events")) ||
    !(await tableExists(database, "buyer_funnel_state")) ||
    (await database
      .prepare(
        "SELECT 1 FROM buyer_funnel_state WHERE key='initial_backfill_v1'",
      )
      .get())
  )
    return;
  await inTransaction(database, async (transaction) => {
    if (
      await transaction
        .prepare(
          "SELECT 1 FROM buyer_funnel_state WHERE key='initial_backfill_v1'",
        )
        .get()
    )
      return;
    await backfillMatches(transaction);
    await backfillOutreach(transaction);
    await backfillIntroductions(transaction);
    await backfillAccess(transaction);
    await backfillDocuments(transaction);
    await backfillOffers(transaction);
    await transaction
      .prepare(
        "INSERT INTO buyer_funnel_state(key,value) VALUES('initial_backfill_v1','complete')",
      )
      .run();
  });
}

const stageForEvent: Partial<Record<DealBuyerEventType, BuyerFunnelStage>> = {
  matched: "Recommended",
  selected: "Recommended",
  excluded: "Recommended",
  teaser_sent: "Contacted",
  teaser_viewed: "Contacted",
  pursued: "Interested",
  intro_requested: "Interested",
  intro_approved: "Interested",
  nda_requested: "NDA",
  nda_uploaded: "NDA",
  nda_approved: "NDA",
  cim_shared: "CIM",
  ioi_received: "IOI",
  loi_received: "LOI",
  shortlisted: "LOI",
  exclusive: "Exclusive",
  closed: "Closed",
};

const percentage = (numerator: number, denominator: number) =>
  denominator ? Math.round((numerator / denominator) * 100) : null;

const hoursBetween = (start: string, end: string) =>
  Math.max(0, (Date.parse(end) - Date.parse(start)) / 3_600_000);

function outcomeFor(
  events: DealBuyerEvent[],
  matchStatus: DealMatchStatus | null,
) {
  let outcome = "Active";
  for (const event of events) {
    if (event.event_type === "closed") outcome = "Closed";
    else if (outcome !== "Closed") {
      if (event.event_type === "access_revoked") outcome = "Access revoked";
      else if (event.event_type === "not_proceeding")
        outcome = "Not proceeding";
      else if (event.event_type === "intro_declined") outcome = "Declined";
      else if (event.event_type === "passed") outcome = "Passed";
      else if (event.event_type === "excluded") outcome = "Excluded";
      else if (
        stageForEvent[event.event_type] &&
        event.event_type !== "matched"
      )
        outcome = "Active";
    }
  }
  if (matchStatus === "excluded" && outcome === "Active") return "Excluded";
  if (matchStatus !== "excluded" && outcome === "Excluded") return "Active";
  return outcome;
}

function metricsFor(entries: BuyerFunnelEntry[]): BuyerFunnelMetrics {
  const stageCounts = Object.fromEntries(
    BUYER_FUNNEL_STAGES.map((stage) => [
      stage,
      entries.filter(
        (entry) =>
          BUYER_FUNNEL_STAGES.indexOf(entry.current_stage) >=
          BUYER_FUNNEL_STAGES.indexOf(stage),
      ).length,
    ]),
  ) as Record<BuyerFunnelStage, number>;
  const responseHours = entries
    .map((entry) => entry.response_hours)
    .filter((hours): hours is number => hours !== null);
  return {
    stage_counts: stageCounts,
    pursuit_rate: percentage(stageCounts.Interested, stageCounts.Contacted),
    nda_conversion: percentage(stageCounts.NDA, stageCounts.Interested),
    cim_conversion: percentage(stageCounts.CIM, stageCounts.NDA),
    ioi_conversion: percentage(stageCounts.IOI, stageCounts.CIM),
    loi_conversion: percentage(stageCounts.LOI, stageCounts.IOI),
    average_response_hours: responseHours.length
      ? Math.round(
          (responseHours.reduce((sum, hours) => sum + hours, 0) /
            responseHours.length) *
            10,
        ) / 10
      : null,
  };
}

export async function buyerFunnelsForDeals(
  database: DatabaseClient,
  dealIds: string[],
): Promise<DealBuyerFunnel[]> {
  if (!dealIds.length || !(await tableExists(database, "deal_buyer_events")))
    return [];
  const placeholders = dealIds.map(() => "?").join(",");
  const rows = (await database
    .prepare(
      `SELECT e.*,organization.name buyer_organization_name,
        organization.verification_status buyer_organization_verification_status,
        project.name buyer_project_name,creator.name created_by_user_name
       FROM deal_buyer_events e
       JOIN organizations organization ON organization.id=e.buyer_organization_id
       LEFT JOIN buyer_projects project ON project.id=e.buyer_project_id
       LEFT JOIN users creator ON creator.id=e.created_by_user_id
       WHERE e.deal_id IN (${placeholders})
       ORDER BY e.created_at,e.id`,
    )
    .all(...dealIds)) as Array<
    Omit<DealBuyerEvent, "metadata"> & {
      metadata_json: string;
      buyer_organization_name: string;
      buyer_organization_verification_status: BuyerVerificationStatus;
      buyer_project_name: string | null;
    }
  >;
  const matches = (await database
    .prepare(
      `SELECT dm.deal_id,dm.buyer_organization_id,dm.buyer_project_id,
        bp.name buyer_project_name,dm.score,dm.status
       FROM deal_matches dm JOIN buyer_projects bp ON bp.id=dm.buyer_project_id
       WHERE dm.deal_id IN (${placeholders})
       ORDER BY dm.eligible DESC,dm.score DESC,dm.updated_at DESC,dm.id`,
    )
    .all(...dealIds)) as Array<{
    deal_id: string;
    buyer_organization_id: string;
    buyer_project_id: string;
    buyer_project_name: string;
    score: number;
    status: DealMatchStatus;
  }>;
  const bestMatches = new Map<string, (typeof matches)[number]>();
  for (const match of matches) {
    const key = `${match.deal_id}:${match.buyer_organization_id}`;
    if (!bestMatches.has(key)) bestMatches.set(key, match);
  }
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.deal_id}:${row.buyer_organization_id}`;
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  const entriesByDeal = new Map<string, BuyerFunnelEntry[]>();
  for (const [key, eventRows] of grouped) {
    const first = eventRows[0];
    const bestMatch = bestMatches.get(key);
    const events = eventRows.map(({ metadata_json, ...event }) => ({
      ...event,
      metadata: JSON.parse(metadata_json) as Record<string, unknown>,
    }));
    const currentStage = events.reduce<BuyerFunnelStage>((stage, event) => {
      const candidate = stageForEvent[event.event_type];
      return candidate &&
        BUYER_FUNNEL_STAGES.indexOf(candidate) >
          BUYER_FUNNEL_STAGES.indexOf(stage)
        ? candidate
        : stage;
    }, "Recommended");
    const outcome = outcomeFor(events, bestMatch?.status ?? null);
    const sent = events.find((event) => event.event_type === "teaser_sent");
    const response = sent
      ? events.find(
          (event) =>
            ["pursued", "passed"].includes(event.event_type) &&
            Date.parse(event.created_at) >= Date.parse(sent.created_at),
        )
      : undefined;
    const entry: BuyerFunnelEntry = {
      deal_id: first.deal_id,
      buyer_organization_id: first.buyer_organization_id,
      buyer_organization_name: first.buyer_organization_name,
      buyer_organization_verification_status:
        first.buyer_organization_verification_status,
      buyer_project_id: bestMatch?.buyer_project_id ?? first.buyer_project_id,
      buyer_project_name:
        bestMatch?.buyer_project_name ?? first.buyer_project_name,
      match_score: bestMatch?.score ?? null,
      match_status: bestMatch?.status ?? null,
      current_stage: currentStage,
      outcome,
      first_contacted_at: sent?.created_at ?? null,
      last_event_at: events.at(-1)!.created_at,
      response_hours:
        sent && response
          ? Math.round(
              hoursBetween(sent.created_at, response.created_at) * 10,
            ) / 10
          : null,
      events,
    };
    const dealEntries = entriesByDeal.get(first.deal_id) ?? [];
    dealEntries.push(entry);
    entriesByDeal.set(first.deal_id, dealEntries);
  }
  return dealIds.map((dealId) => {
    const buyers = (entriesByDeal.get(dealId) ?? []).sort((left, right) => {
      const stage =
        BUYER_FUNNEL_STAGES.indexOf(right.current_stage) -
        BUYER_FUNNEL_STAGES.indexOf(left.current_stage);
      return (
        stage ||
        (right.match_score ?? -1) - (left.match_score ?? -1) ||
        left.buyer_organization_name.localeCompare(
          right.buyer_organization_name,
        )
      );
    });
    return { deal_id: dealId, buyers, metrics: metricsFor(buyers) };
  });
}
