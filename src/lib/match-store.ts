import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "./db";
import { matchDealToBuyerProject } from "./matching.ts";
import { inTransaction } from "./transaction";
import {
  BUYER_ORGANIZATION_TYPES,
  type BuyerProject,
  type Deal,
  type DealMatch,
} from "./types.ts";
import { recordDealBuyerEvent } from "./buyer-funnel.ts";
import { dealManagerUserIds, notifyUsers } from "./notifications.ts";
import { tableExists } from "./schema";

const list = async (database: DatabaseClient, sql: string, id: string) =>
  await database
    .prepare(sql)
    .all(id)
    .map((row) => String((row as { value: string }).value));

async function projectFor(database: DatabaseClient, projectId: string) {
  const row = (await database
    .prepare("SELECT * FROM buyer_projects WHERE id=?")
    .get(projectId)) as
    | Omit<BuyerProject, "sectors" | "provinces" | "keywords" | "can_manage">
    | undefined;
  if (!row) return undefined;
  return {
    ...row,
    sectors: await list(
      database,
      "SELECT sector value FROM buyer_project_sectors WHERE buyer_project_id=? ORDER BY sector",
      projectId,
    ),
    provinces: await list(
      database,
      "SELECT province value FROM buyer_project_provinces WHERE buyer_project_id=? ORDER BY province",
      projectId,
    ),
    keywords: await list(
      database,
      "SELECT keyword value FROM buyer_project_keywords WHERE buyer_project_id=? ORDER BY keyword",
      projectId,
    ),
    can_manage: false,
  } satisfies BuyerProject;
}

const dealFor = async (database: DatabaseClient, dealId: string) =>
  (await database.prepare("SELECT * FROM deals WHERE id=?").get(dealId)) as
    Deal | undefined;

const userIsDemo = async (database: DatabaseClient, userId: string) =>
  (
    (await database
      .prepare("SELECT is_demo FROM users WHERE id=?")
      .get(userId)) as { is_demo: number } | undefined
  )?.is_demo;

async function buyerIsBlocked(
  database: DatabaseClient,
  dealId: string,
  organizationId: string,
) {
  return Boolean(
    await database
      .prepare(
        `SELECT 1 FROM access a
         JOIN organization_members om ON om.user_id=a.buyer_id AND om.status='active'
         WHERE a.deal_id=? AND om.organization_id=? AND a.status IN ('denied','revoked')
         LIMIT 1`,
      )
      .get(dealId, organizationId),
  );
}

async function marketplaceEnvironmentsMatch(
  database: DatabaseClient,
  deal: Deal,
  project: BuyerProject,
) {
  const dealOwner = await userIsDemo(database, deal.owner_id);
  const projectCreator = await userIsDemo(database, project.created_by_user_id);
  return Boolean(
    dealOwner !== undefined &&
    projectCreator !== undefined &&
    Boolean(dealOwner) === Boolean(projectCreator),
  );
}

async function recalculatePair(
  database: DatabaseClient,
  deal: Deal,
  project: BuyerProject,
) {
  const existing = (await database
    .prepare(
      "SELECT id,status,eligible FROM deal_matches WHERE deal_id=? AND buyer_project_id=?",
    )
    .get(deal.id, project.id)) as
    { id: string; status: DealMatch["status"]; eligible: number } | undefined;
  const buyerOrganization = (await database
    .prepare("SELECT organization_type FROM organizations WHERE id=?")
    .get(project.organization_id)) as { organization_type: string } | undefined;
  const result = matchDealToBuyerProject(deal, project, {
    buyerExplicitlyBlocked: await buyerIsBlocked(
      database,
      deal.id,
      project.organization_id,
    ),
    sellerExcluded: existing?.status === "excluded",
    marketplaceEnvironmentsMatch: true,
  });
  const hardExclusions = [...result.hard_exclusions];
  if (
    !buyerOrganization ||
    !BUYER_ORGANIZATION_TYPES.includes(
      buyerOrganization.organization_type as (typeof BUYER_ORGANIZATION_TYPES)[number],
    )
  )
    hardExclusions.push(
      "The buyer organization is not currently an eligible buyer.",
    );
  const eligible = hardExclusions.length === 0;
  const breakdown = JSON.stringify({
    reasons: result.reasons,
    hard_exclusions: hardExclusions,
  });
  const matchId = existing?.id ?? randomUUID();
  await database
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
      matchId,
      deal.id,
      project.id,
      project.organization_id,
      result.score,
      eligible ? 1 : 0,
      breakdown,
      existing?.status ?? "recommended",
    );
  if (eligible)
    await recordDealBuyerEvent(database, {
      dealId: deal.id,
      buyerOrganizationId: project.organization_id,
      buyerProjectId: project.id,
      eventType: "matched",
      sourceKey: `match:${matchId}`,
    });
  if (eligible && !existing?.eligible) {
    const organization = (await database
      .prepare("SELECT name FROM organizations WHERE id=?")
      .get(project.organization_id)) as { name: string } | undefined;
    await notifyUsers(database, {
      userIds: await dealManagerUserIds(database, deal.id),
      type: "new_match",
      title: "New buyer match",
      body: `${organization?.name ?? "A buyer"} matched ${deal.title} through ${project.name} at ${result.score}%.`,
      href: `/app/deals/${deal.id}`,
      dealId: deal.id,
      sourceKey: `match:${matchId}:new`,
    });
  }
}

export async function recalculateDealMatch(
  database: DatabaseClient,
  dealId: string,
  projectId: string,
) {
  if (!(await tableExists(database, "deal_matches"))) return;
  const deal = await dealFor(database, dealId);
  const project = await projectFor(database, projectId);
  if (
    deal &&
    project &&
    (await marketplaceEnvironmentsMatch(database, deal, project))
  )
    await recalculatePair(database, deal, project);
}

export async function recalculateDealMatches(
  database: DatabaseClient,
  dealId: string,
) {
  if (!(await tableExists(database, "deal_matches"))) return;
  const deal = await dealFor(database, dealId);
  if (!deal) return;
  const isDemo = await userIsDemo(database, deal.owner_id);
  if (isDemo === undefined) return;
  const projects = (await database
    .prepare(
      `SELECT bp.id FROM buyer_projects bp
       JOIN users u ON u.id=bp.created_by_user_id
       WHERE u.is_demo=? ORDER BY bp.id`,
    )
    .all(isDemo)) as { id: string }[];
  for (const { id } of projects) {
    const project = await projectFor(database, id);
    if (project) await recalculatePair(database, deal, project);
  }
}

export async function recalculateBuyerProjectMatches(
  database: DatabaseClient,
  projectId: string,
) {
  if (!(await tableExists(database, "deal_matches"))) return;
  const project = await projectFor(database, projectId);
  if (!project) return;
  const isDemo = await userIsDemo(database, project.created_by_user_id);
  if (isDemo === undefined) return;
  const deals = (await database
    .prepare(
      `SELECT d.* FROM deals d
       JOIN users u ON u.id=d.owner_id
       WHERE u.is_demo=? ORDER BY d.id`,
    )
    .all(isDemo)) as unknown as Deal[];
  for (const deal of deals) await recalculatePair(database, deal, project);
}

export async function recalculateBuyerOrganizationMatches(
  database: DatabaseClient,
  organizationId: string,
) {
  if (!(await tableExists(database, "deal_matches"))) return;
  const projects = (await database
    .prepare(
      "SELECT id FROM buyer_projects WHERE organization_id=? ORDER BY id",
    )
    .all(organizationId)) as { id: string }[];
  for (const { id } of projects)
    await recalculateBuyerProjectMatches(database, id);
}

export async function recalculateBuyerOrganizationDealMatches(
  database: DatabaseClient,
  organizationId: string,
  dealId: string,
) {
  if (!(await tableExists(database, "deal_matches"))) return;
  const deal = await dealFor(database, dealId);
  if (!deal) return;
  const projects = (await database
    .prepare(
      "SELECT id FROM buyer_projects WHERE organization_id=? ORDER BY id",
    )
    .all(organizationId)) as { id: string }[];
  for (const { id } of projects) {
    const project = await projectFor(database, id);
    if (
      project &&
      (await marketplaceEnvironmentsMatch(database, deal, project))
    )
      await recalculatePair(database, deal, project);
  }
}

export async function recalculateAllMatches(database: DatabaseClient) {
  if (!(await tableExists(database, "deal_matches"))) return;
  const deals = (await database
    .prepare("SELECT id FROM deals ORDER BY id")
    .all()) as {
    id: string;
  }[];
  for (const { id } of deals) await recalculateDealMatches(database, id);
}

export async function ensureInitialMatchBackfill(database: DatabaseClient) {
  if (
    !(await tableExists(database, "deal_matches")) ||
    !(await tableExists(database, "matching_engine_state")) ||
    (await database
      .prepare(
        "SELECT value FROM matching_engine_state WHERE key='initial_backfill_v1'",
      )
      .get())
  )
    return;
  await inTransaction(database, async (transaction) => {
    if (
      await transaction
        .prepare(
          "SELECT value FROM matching_engine_state WHERE key='initial_backfill_v1'",
        )
        .get()
    )
      return;
    await recalculateAllMatches(transaction);
    await transaction
      .prepare(
        "INSERT INTO matching_engine_state(key,value) VALUES('initial_backfill_v1','complete')",
      )
      .run();
  });
}
