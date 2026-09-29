import test from "node:test";
import assert from "node:assert/strict";
import { deriveBuyerReputationMetrics } from "../src/lib/buyer-reputation.ts";

test("buyer reputation derives distinct marketplace outcomes and median response time", () => {
  const metrics = deriveBuyerReputationMetrics(
    [
      {
        deal_id: "alpha",
        event_type: "teaser_sent",
        created_at: "2026-01-01 08:00:00",
      },
      {
        deal_id: "alpha",
        event_type: "teaser_viewed",
        created_at: "2026-01-01 09:00:00",
      },
      {
        deal_id: "alpha",
        event_type: "pursued",
        created_at: "2026-01-01 12:00:00",
      },
      {
        deal_id: "alpha",
        event_type: "loi_received",
        created_at: "2026-01-10 12:00:00",
      },
      {
        deal_id: "alpha",
        event_type: "loi_received",
        created_at: "2026-01-10 12:01:00",
      },
      {
        deal_id: "beta",
        event_type: "teaser_sent",
        created_at: "2026-02-01 08:00:00",
      },
      {
        deal_id: "beta",
        event_type: "passed",
        created_at: "2026-02-02 08:00:00",
      },
      {
        deal_id: "gamma",
        event_type: "teaser_sent",
        created_at: "2026-03-01 08:00:00",
      },
      {
        deal_id: "delta",
        event_type: "intro_requested",
        created_at: "2026-04-01 08:00:00",
      },
    ],
    [{ industry: "Business services" }, { industry: "Technology" }],
    " business SERVICES ",
  );

  assert.deepEqual(metrics, {
    response_rate: 67,
    response_opportunities: 3,
    median_response_hours: 14,
    opportunities_pursued: 2,
    lois_submitted: 1,
    transactions_closed: 2,
    relevant_transactions: 1,
  });
});

test("buyer reputation represents missing evidence without invented values", () => {
  assert.deepEqual(deriveBuyerReputationMetrics([], [], "Technology"), {
    response_rate: null,
    response_opportunities: 0,
    median_response_hours: null,
    opportunities_pursued: 0,
    lois_submitted: 0,
    transactions_closed: 0,
    relevant_transactions: 0,
  });
});

test("responses before an invitation are excluded from response metrics", () => {
  const metrics = deriveBuyerReputationMetrics(
    [
      {
        deal_id: "alpha",
        event_type: "pursued",
        created_at: "2026-01-01 07:00:00",
      },
      {
        deal_id: "alpha",
        event_type: "teaser_sent",
        created_at: "2026-01-01 08:00:00",
      },
    ],
    [],
    "Technology",
  );

  assert.equal(metrics.response_rate, 0);
  assert.equal(metrics.median_response_hours, null);
  assert.equal(metrics.opportunities_pursued, 1);
});

test("median response time is rounded only after the median is calculated", () => {
  const metrics = deriveBuyerReputationMetrics(
    [
      {
        deal_id: "alpha",
        event_type: "teaser_sent",
        created_at: "2026-01-01 08:00:00",
      },
      {
        deal_id: "alpha",
        event_type: "pursued",
        created_at: "2026-01-01 08:02:00",
      },
      {
        deal_id: "beta",
        event_type: "teaser_sent",
        created_at: "2026-01-02 08:00:00",
      },
      {
        deal_id: "beta",
        event_type: "passed",
        created_at: "2026-01-02 08:03:00",
      },
    ],
    [],
    "Technology",
  );

  assert.equal(metrics.median_response_hours, 0);
});
