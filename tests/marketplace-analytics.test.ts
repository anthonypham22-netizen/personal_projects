import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase, databaseReady, db, run } from "../src/lib/db";
import { recordDealBuyerEvent } from "../src/lib/buyer-funnel";
import { workspace } from "../src/lib/service";
import {
  buyerMarketplaceAnalytics,
  deriveDealManagerMarketplaceAnalytics,
} from "../src/lib/marketplace-analytics";
import type {
  BuyerFunnelEntry,
  BuyerFunnelStage,
  DealBuyerEvent,
  DealBuyerEventType,
  DealBuyerFunnel,
  User,
} from "../src/lib/types";

let directory: string;

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "succera-market-analytics-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_DEMO = "true";
  await databaseReady();
});

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

const event = (
  buyerOrganizationId: string,
  eventType: DealBuyerEventType,
  createdAt: string,
  idSuffix: string = eventType,
): DealBuyerEvent => ({
  id: `${buyerOrganizationId}-${idSuffix}`,
  deal_id: "cedar",
  buyer_organization_id: buyerOrganizationId,
  buyer_project_id: null,
  buyer_project_name: null,
  event_type: eventType,
  metadata: {},
  created_by_user_id: null,
  created_by_user_name: null,
  created_at: createdAt,
});

const funnelEntry = ({
  buyerOrganizationId,
  stage,
  responseHours,
  events,
}: {
  buyerOrganizationId: string;
  stage: BuyerFunnelStage;
  responseHours: number | null;
  events: DealBuyerEvent[];
}): BuyerFunnelEntry => ({
  deal_id: "cedar",
  buyer_organization_id: buyerOrganizationId,
  buyer_organization_name: buyerOrganizationId,
  buyer_organization_verification_status: "firm_verified",
  buyer_project_id: null,
  buyer_project_name: null,
  match_score: null,
  match_status: null,
  current_stage: stage,
  outcome: "Active",
  first_contacted_at: null,
  last_event_at: events.at(-1)?.created_at ?? "2026-01-01T00:00:00Z",
  response_hours: responseHours,
  events,
});

test("advisor analytics count explicit relationship milestones and denominators", () => {
  const funnel: DealBuyerFunnel = {
    deal_id: "cedar",
    buyers: [
      funnelEntry({
        buyerOrganizationId: "buyer-a",
        stage: "Exclusive",
        responseHours: 2,
        events: [
          event("buyer-a", "matched", "2026-01-01T09:00:00Z"),
          event("buyer-a", "teaser_sent", "2026-01-02T09:00:00Z"),
          event("buyer-a", "teaser_viewed", "2026-01-02T10:00:00Z"),
          event("buyer-a", "teaser_viewed", "2026-01-02T10:05:00Z", "view-2"),
          event("buyer-a", "pursued", "2026-01-02T11:00:00Z"),
          event("buyer-a", "nda_approved", "2026-01-03T09:00:00Z"),
          event("buyer-a", "cim_shared", "2026-01-03T10:00:00Z"),
          event("buyer-a", "ioi_received", "2026-01-04T09:00:00Z"),
          event("buyer-a", "loi_received", "2026-01-05T09:00:00Z"),
          event("buyer-a", "exclusive", "2026-01-06T09:00:00Z"),
        ],
      }),
      funnelEntry({
        buyerOrganizationId: "buyer-b",
        stage: "Contacted",
        responseHours: 4,
        events: [
          event("buyer-b", "matched", "2026-01-01T09:00:00Z"),
          event("buyer-b", "teaser_sent", "2026-01-02T09:00:00Z"),
          event("buyer-b", "passed", "2026-01-02T13:00:00Z"),
        ],
      }),
      funnelEntry({
        buyerOrganizationId: "buyer-c",
        stage: "Recommended",
        responseHours: null,
        events: [event("buyer-c", "matched", "2026-01-01T09:00:00Z")],
      }),
      funnelEntry({
        buyerOrganizationId: "buyer-d",
        stage: "NDA",
        responseHours: null,
        events: [
          event("buyer-d", "matched", "2026-01-01T09:00:00Z"),
          event("buyer-d", "nda_requested", "2026-01-03T09:00:00Z"),
        ],
      }),
      funnelEntry({
        buyerOrganizationId: "buyer-e",
        stage: "LOI",
        responseHours: null,
        events: [
          event("buyer-e", "matched", "2026-01-01T09:00:00Z"),
          event("buyer-e", "loi_received", "2026-01-05T09:00:00Z"),
        ],
      }),
      funnelEntry({
        buyerOrganizationId: "buyer-f",
        stage: "Interested",
        responseHours: null,
        events: [
          event("buyer-f", "matched", "2026-01-01T09:00:00Z"),
          event("buyer-f", "intro_requested", "2026-01-02T09:00:00Z"),
        ],
      }),
    ],
    metrics: {
      stage_counts: {
        Recommended: 6,
        Contacted: 3,
        Interested: 2,
        NDA: 2,
        CIM: 1,
        IOI: 1,
        LOI: 2,
        Exclusive: 1,
        Closed: 0,
      },
      pursuit_rate: 50,
      nda_conversion: 100,
      cim_conversion: 100,
      ioi_conversion: 100,
      loi_conversion: 100,
      average_response_hours: 3,
    },
  };

  assert.deepEqual(
    deriveDealManagerMarketplaceAnalytics(funnel, "Project Cedar"),
    {
      deal_id: "cedar",
      deal_title: "Project Cedar",
      counts: {
        recommended_buyers: 6,
        teasers_sent: 2,
        teaser_views: 1,
        interested: 2,
        ndas: 2,
        cims: 1,
        iois: 1,
        lois: 2,
        exclusive: 1,
      },
      metrics: {
        view_rate: 50,
        pursuit_rate: 67,
        nda_conversion: 50,
        ioi_conversion: 100,
        loi_conversion: 100,
        average_response_hours: 3,
      },
    },
  );
});

test("analytics return null rates when there is no recorded denominator", () => {
  const funnel: DealBuyerFunnel = {
    deal_id: "empty",
    buyers: [],
    metrics: {
      stage_counts: {
        Recommended: 0,
        Contacted: 0,
        Interested: 0,
        NDA: 0,
        CIM: 0,
        IOI: 0,
        LOI: 0,
        Exclusive: 0,
        Closed: 0,
      },
      pursuit_rate: null,
      nda_conversion: null,
      cim_conversion: null,
      ioi_conversion: null,
      loi_conversion: null,
      average_response_hours: null,
    },
  };

  assert.deepEqual(
    deriveDealManagerMarketplaceAnalytics(funnel, "Empty mandate").metrics,
    {
      view_rate: null,
      pursuit_rate: null,
      nda_conversion: null,
      ioi_conversion: null,
      loi_conversion: null,
      average_response_hours: null,
    },
  );
});

async function seedBuyerAnalyticsFixture() {
  const database = db();
  await run("DELETE FROM deal_buyer_events");
  const add = async (
    dealId: string,
    organizationId: string,
    eventType: DealBuyerEventType,
    sourceKey: string,
  ) =>
    await recordDealBuyerEvent(database, {
      dealId,
      buyerOrganizationId: organizationId,
      eventType,
      sourceKey,
    });

  await add("cedar", "org-demo-buyer", "teaser_sent", "cedar-sent");
  await add("cedar", "org-demo-buyer", "teaser_viewed", "cedar-viewed");
  await add("cedar", "org-demo-buyer", "teaser_viewed", "cedar-viewed-again");
  await add("cedar", "org-demo-buyer", "pursued", "cedar-pursued");
  await add("cedar", "org-demo-buyer", "loi_received", "cedar-loi-1");
  await add("cedar", "org-demo-buyer", "loi_received", "cedar-loi-2");
  await add("summit", "org-demo-buyer", "teaser_sent", "summit-sent");
  await add("harbour", "org-demo-buyer", "intro_approved", "harbour-approved");
  await add(
    "harbour",
    "org-demo-buyer",
    "intro_requested",
    "harbour-requested",
  );
  await add("maple", "org-demo-buyer-2", "teaser_sent", "other-org-sent");

  await run("UPDATE deals SET stage='Due diligence' WHERE id='cedar'");
  await run("UPDATE deals SET stage='LOI review' WHERE id='summit'");
}

test("buyer analytics are organization-scoped and count each opportunity once", async () => {
  await seedBuyerAnalyticsFixture();
  const database = db();

  assert.deepEqual(
    await buyerMarketplaceAnalytics(database, "org-demo-buyer"),
    {
      opportunities_received: 3,
      opportunities_viewed: 1,
      opportunities_pursued: 2,
      lois_submitted: 1,
      active_diligence_processes: 1,
    },
  );
  assert.deepEqual(
    await buyerMarketplaceAnalytics(database, "org-demo-buyer-2"),
    {
      opportunities_received: 1,
      opportunities_viewed: 0,
      opportunities_pursued: 0,
      lois_submitted: 0,
      active_diligence_processes: 0,
    },
  );
});

test("active diligence follows the latest effective buyer relationship outcome", async () => {
  await seedBuyerAnalyticsFixture();
  const database = db();
  await run("UPDATE deals SET stage='Due diligence' WHERE id='summit'");

  assert.equal(
    (await buyerMarketplaceAnalytics(database, "org-demo-buyer"))
      .active_diligence_processes,
    2,
  );

  await recordDealBuyerEvent(database, {
    dealId: "summit",
    buyerOrganizationId: "org-demo-buyer",
    eventType: "not_proceeding",
    sourceKey: "summit-not-proceeding",
  });
  assert.equal(
    (await buyerMarketplaceAnalytics(database, "org-demo-buyer"))
      .active_diligence_processes,
    1,
  );

  await recordDealBuyerEvent(database, {
    dealId: "summit",
    buyerOrganizationId: "org-demo-buyer",
    eventType: "cim_shared",
    sourceKey: "summit-reactivated",
  });
  assert.equal(
    (await buyerMarketplaceAnalytics(database, "org-demo-buyer"))
      .active_diligence_processes,
    2,
  );

  await recordDealBuyerEvent(database, {
    dealId: "cedar",
    buyerOrganizationId: "org-demo-buyer",
    eventType: "closed",
    sourceKey: "cedar-closed",
  });
  await recordDealBuyerEvent(database, {
    dealId: "cedar",
    buyerOrganizationId: "org-demo-buyer",
    eventType: "cim_shared",
    sourceKey: "cedar-after-close",
  });
  assert.equal(
    (await buyerMarketplaceAnalytics(database, "org-demo-buyer"))
      .active_diligence_processes,
    1,
    "a closed relationship stays inactive even if a later event is appended",
  );
});

test("workspace exposes only the role-appropriate analytics boundary", async () => {
  await seedBuyerAnalyticsFixture();
  const advisor = (await db()
    .prepare("SELECT * FROM users WHERE id='demo-advisor'")
    .get()) as User;
  const buyer = (await db()
    .prepare("SELECT * FROM users WHERE id='demo-buyer'")
    .get()) as User;
  const advisorState = await workspace(advisor);
  const buyerState = await workspace(buyer);

  assert.ok(advisorState.deal_manager_marketplace_analytics?.length);
  assert.equal(advisorState.buyer_marketplace_analytics, undefined);
  assert.equal(buyerState.deal_manager_marketplace_analytics, undefined);
  assert.deepEqual(buyerState.buyer_marketplace_analytics, {
    opportunities_received: 3,
    opportunities_viewed: 1,
    opportunities_pursued: 2,
    lois_submitted: 1,
    active_diligence_processes: 1,
  });
  assert.equal(buyerState.buyer_funnels, undefined);
  assert.equal(
    advisorState.deal_manager_marketplace_analytics?.every((analytics) =>
      advisorState.deals.some(
        (deal) => deal.id === analytics.deal_id && deal.can_manage,
      ),
    ),
    true,
  );

  let viewerState: Awaited<ReturnType<typeof workspace>>;
  await run(
    "UPDATE organization_members SET role='viewer' WHERE organization_id='org-demo-advisor' AND user_id='demo-advisor'",
  );
  try {
    viewerState = await workspace(advisor);
  } finally {
    await run(
      "UPDATE organization_members SET role='owner' WHERE organization_id='org-demo-advisor' AND user_id='demo-advisor'",
    );
  }
  assert.equal(viewerState.deal_manager_marketplace_analytics, undefined);
});
