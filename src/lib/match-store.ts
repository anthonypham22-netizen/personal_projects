import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { MATCHING_CONFIG, matchDealToBuyerProject } from "./matching.ts";
import { inImmediateTransaction } from "./sqlite-transaction.ts";
import type { BuyerProject, Deal, DealMatch } from "./types";

const tableExists = (database: DatabaseSync, table: string) =>
  Boolean(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(table),
  );

const list = (database: DatabaseSync, sql: string, id: string) =>
  database
    .prepare(sql)
    .all(id)
    .map((row) => String((row as { value: string }).value));

function projectFor(database: DatabaseSync, projectId: string) {
  const row = database
    .prepare("SELECT * FROM buyer_projects WHERE id=?")
    .get(projectId) as
    | Omit<BuyerProject, "sectors" | "provinces" | "keywords" | "can_manage">
    | undefined;
  if (!row) return undefined;
  return {
    ...row,
    sectors: list(
      database,
      "SELECT sector value FROM buyer_project_sectors WHERE buyer_project_id=? ORDER BY rowid",
      projectId,
    ),
    provinces: list(
      database,
      "SELECT province value FROM buyer_project_provinces WHERE buyer_project_id=? ORDER BY rowid",
      projectId,
    ),
    keywords: list(
      database,
      "SELECT keyword value FROM buyer_project_keywords WHERE buyer_project_id=? ORDER BY rowid",
      projectId,
    ),
    can_manage: false,
  } satisfies BuyerProject;
}

const dealFor = (database: DatabaseSync, dealId: string) =>
  database.prepare("SELECT * FROM deals WHERE id=?").get(dealId) as
    Deal | undefined;

const userIsDemo = (database: DatabaseSync, userId: string) =>
  (
    database.prepare("SELECT is_demo FROM users WHERE id=?").get(userId) as
      { is_demo: number } | undefined
  )?.is_demo;

function buyerIsBlocked(
  database: DatabaseSync,
  dealId: string,
  organizationId: string,
) {
  return Boolean(
    database
      .prepare(
        `SELECT 1 FROM access a
         JOIN organization_members om ON om.user_id=a.buyer_id AND om.status='active'
         WHERE a.deal_id=? AND om.organization_id=? AND a.status IN ('denied','revoked')
         LIMIT 1`,
      )
      .get(dealId, organizationId),
  );
}

function verificationStatus(database: DatabaseSync, organizationId: string) {
  return (
    database
      .prepare("SELECT verification_status FROM organizations WHERE id=?")
      .get(organizationId) as { verification_status: string } | undefined
  )?.verification_status;
}

function marketplaceEnvironmentsMatch(
  database: DatabaseSync,
  deal: Deal,
  project: BuyerProject,
) {
  const dealOwner = userIsDemo(database, deal.owner_id);
  const projectCreator = userIsDemo(database, project.created_by_user_id);
  return Boolean(
    dealOwner !== undefined &&
    projectCreator !== undefined &&
    Boolean(dealOwner) === Boolean(projectCreator),
  );
}

function recalculatePair(
  database: DatabaseSync,
  deal: Deal,
  project: BuyerProject,
) {
  const existing = database
    .prepare(
      "SELECT id,status FROM deal_matches WHERE deal_id=? AND buyer_project_id=?",
    )
    .get(deal.id, project.id) as
    { id: string; status: DealMatch["status"] } | undefined;
  const result = matchDealToBuyerProject(deal, project, {
    buyerVerificationStatus: verificationStatus(
      database,
      project.organization_id,
    ),
    buyerExplicitlyBlocked: buyerIsBlocked(
      database,
      deal.id,
      project.organization_id,
    ),
    sellerExcluded: existing?.status === "excluded",
    requiresDiscoveryVerification:
      MATCHING_CONFIG.qualifiedDiscoveryRequiresVerification,
    marketplaceEnvironmentsMatch: true,
  });
  const breakdown = JSON.stringify({
    reasons: result.reasons,
    hard_exclusions: result.hard_exclusions,
  });
  database
    .prepare(
      `INSERT INTO deal_matches(
        id,deal_id,buyer_project_id,buyer_organization_id,score,eligible,
        score_breakdown_json,status
      ) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(deal_id,buyer_project_id) DO UPDATE SET
        buyer_organization_id=excluded.buyer_organization_id,
        score=excluded.score,
        eligible=excluded.eligible,
        score_breakdown_json=excluded.score_breakdown_json,
        updated_at=strftime('%Y-%m-%d %H:%M:%f','now')`,
    )
    .run(
      existing?.id ?? randomUUID(),
      deal.id,
      project.id,
      project.organization_id,
      result.score,
      result.eligible ? 1 : 0,
      breakdown,
      existing?.status ?? "recommended",
    );
}

export function recalculateDealMatch(
  database: DatabaseSync,
  dealId: string,
  projectId: string,
) {
  if (!tableExists(database, "deal_matches")) return;
  const deal = dealFor(database, dealId);
  const project = projectFor(database, projectId);
  if (deal && project && marketplaceEnvironmentsMatch(database, deal, project))
    recalculatePair(database, deal, project);
}

export function recalculateDealMatches(database: DatabaseSync, dealId: string) {
  if (!tableExists(database, "deal_matches")) return;
  const deal = dealFor(database, dealId);
  if (!deal) return;
  const isDemo = userIsDemo(database, deal.owner_id);
  if (isDemo === undefined) return;
  const projects = database
    .prepare(
      `SELECT bp.id FROM buyer_projects bp
       JOIN users u ON u.id=bp.created_by_user_id
       WHERE u.is_demo=? ORDER BY bp.id`,
    )
    .all(isDemo) as { id: string }[];
  for (const { id } of projects) {
    const project = projectFor(database, id);
    if (project) recalculatePair(database, deal, project);
  }
}

export function recalculateBuyerProjectMatches(
  database: DatabaseSync,
  projectId: string,
) {
  if (!tableExists(database, "deal_matches")) return;
  const project = projectFor(database, projectId);
  if (!project) return;
  const isDemo = userIsDemo(database, project.created_by_user_id);
  if (isDemo === undefined) return;
  const deals = database
    .prepare(
      `SELECT d.* FROM deals d
       JOIN users u ON u.id=d.owner_id
       WHERE u.is_demo=? ORDER BY d.id`,
    )
    .all(isDemo) as unknown as Deal[];
  for (const deal of deals) recalculatePair(database, deal, project);
}

export function recalculateBuyerOrganizationMatches(
  database: DatabaseSync,
  organizationId: string,
) {
  if (!tableExists(database, "deal_matches")) return;
  const projects = database
    .prepare(
      "SELECT id FROM buyer_projects WHERE organization_id=? ORDER BY id",
    )
    .all(organizationId) as { id: string }[];
  for (const { id } of projects) recalculateBuyerProjectMatches(database, id);
}

export function recalculateBuyerOrganizationDealMatches(
  database: DatabaseSync,
  organizationId: string,
  dealId: string,
) {
  if (!tableExists(database, "deal_matches")) return;
  const deal = dealFor(database, dealId);
  if (!deal) return;
  const projects = database
    .prepare(
      "SELECT id FROM buyer_projects WHERE organization_id=? ORDER BY id",
    )
    .all(organizationId) as { id: string }[];
  for (const { id } of projects) {
    const project = projectFor(database, id);
    if (project && marketplaceEnvironmentsMatch(database, deal, project))
      recalculatePair(database, deal, project);
  }
}

export function recalculateAllMatches(database: DatabaseSync) {
  if (!tableExists(database, "deal_matches")) return;
  const deals = database.prepare("SELECT id FROM deals ORDER BY id").all() as {
    id: string;
  }[];
  for (const { id } of deals) recalculateDealMatches(database, id);
}

export function ensureInitialMatchBackfill(database: DatabaseSync) {
  if (
    !tableExists(database, "deal_matches") ||
    !tableExists(database, "matching_engine_state") ||
    database
      .prepare(
        "SELECT value FROM matching_engine_state WHERE key='initial_backfill_v1'",
      )
      .get()
  )
    return;
  inImmediateTransaction(database, () => {
    if (
      database
        .prepare(
          "SELECT value FROM matching_engine_state WHERE key='initial_backfill_v1'",
        )
        .get()
    )
      return;
    recalculateAllMatches(database);
    database
      .prepare(
        "INSERT INTO matching_engine_state(key,value) VALUES('initial_backfill_v1','complete')",
      )
      .run();
  });
}
