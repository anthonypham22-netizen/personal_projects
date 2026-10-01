import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { all, one, run, db } from "./db";
import { hashPassword, verifyPassword, tokenHash } from "./passwords";
import {
  PROVINCES,
  SECTORS,
  STAGES,
  ORGANIZATION_TYPES,
  BUYER_ORGANIZATION_TYPES,
  BUYER_PROJECT_STATUSES,
  BUYER_PROJECT_TRANSACTION_TYPES,
  BUYER_PROJECT_OWNERSHIP_PREFERENCES,
  DEAL_TRANSACTION_TYPES,
  DEAL_DISTRIBUTION_MODES,
  DEAL_FINANCIAL_PERIOD_TYPES,
  DEAL_MATCH_STATUSES,
  DEAL_BUYER_EVENT_TYPES,
  TRANSACTION_ATTRIBUTION_SOURCES,
  introducedByAcquireForSource,
  NOTIFICATION_TYPES,
  NOTIFICATION_FREQUENCIES,
  type User,
  type Deal,
  type Access,
  type Document,
  type Message,
  type DealInternalNote,
  type Task,
  type Offer,
  type Activity,
  type WorkspaceData,
  type Organization,
  type OrganizationMember,
  type OrganizationMemberRole,
  type OrganizationType,
  type BuyerProject,
  type DealFinancial,
  type DealMatch,
  type DealOutreachRecipient,
  type IntroductionRequest,
  type DealBuyerEventType,
  type NotificationPreferences,
  type BuyerVerificationProfile,
  type BuyerFirmProfile,
  type PublicOrganizationProfile,
  type SellerVisibleBuyerProject,
  type ClosedTransaction,
  type ClosedTransactionReviewEntry,
  type SellerVisibleClosedTransaction,
  type VerificationAdminEntry,
  type VerificationReview,
  type BuyerVerificationStatus,
  type ElectronicSignatureEnvelope,
  type TeaserSafetyReview,
} from "./types";
import { electronicSignatureCapability } from "./electronic-signature-provider";
import { teaserSafetyCapability } from "./teaser-safety-provider";
import { teaserSafetyReviewInputDigest } from "./teaser-safety";
import { slugify } from "./utils";
import { inImmediateTransaction } from "./sqlite-transaction";
import {
  recalculateDealMatch,
  recalculateBuyerOrganizationMatches,
  recalculateBuyerOrganizationDealMatches,
  recalculateBuyerProjectMatches,
  recalculateDealMatches,
} from "./match-store";
import { qualifiedDiscoveryMinimumScore } from "./discovery";
import {
  qualifiedDiscoveryEligibleVerificationStatuses,
  qualifiedDiscoveryMinimumVerificationStatus,
  verificationStatusMeets,
} from "./verification";
import {
  bestBuyerProjectForDeal,
  buyerFunnelsForDeals,
  buyerOrganizationIdForUser,
  recordDealBuyerEvent,
} from "./buyer-funnel";
import {
  deriveBuyerReputationMetrics,
  type BuyerReputationEvent,
  type VerifiedTransactionEvidence,
} from "./buyer-reputation";
import {
  buyerMarketplaceAnalytics as buyerMarketplaceAnalyticsFor,
  deriveDealManagerMarketplaceAnalytics,
} from "./marketplace-analytics";
import {
  recordInitialTransactionAttribution,
  transactionAttributionsForDeals,
} from "./transaction-attribution";
import {
  activeOrganizationUserIds,
  dealManagerUserIds,
  dealTeamUserIds,
  notificationUnreadCountForUser,
  notificationPreferencesForUser,
  notificationsForUser,
  notifyUsers,
  saveNotificationPreferences,
} from "./notifications";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const userColumns =
  "id,email,name,company,role,province,bio,sectors,min_revenue,max_revenue,is_demo,is_platform_admin";
const text = (min = 1, max = 200) => z.string().trim().min(min).max(max);
const idSchema = text(1, 100);
const websiteUrl = z.url().max(300);
const amount = z.coerce.number().int().min(0).max(10000000000);
const optionalAmount = z.preprocess(
  (value) =>
    value === "" || value === undefined || value === null ? null : value,
  amount.nullable(),
);
const optionalSignedAmount = z.preprocess(
  (value) =>
    value === "" || value === undefined || value === null ? null : value,
  z.coerce.number().int().min(-10_000_000_000).max(10_000_000_000).nullable(),
);
const closedDate = z.iso
  .date()
  .refine(
    (value) =>
      value >= "1900-01-01" && value <= new Date().toISOString().slice(0, 10),
    "Closing date must be between 1900 and today.",
  );
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError(
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    );
  return result.data;
};
const statusTextForAudit = (status: DealMatch["status"]) =>
  ({
    recommended: "Restored",
    selected: "Selected",
    excluded: "Excluded",
    contacted: "Contacted",
  })[status];
const organizationTypeFor = (role: User["role"]): OrganizationType =>
  role === "advisor" ? "advisor" : role === "owner" ? "business" : "buyer";
const slugPart = (value: string) => slugify(value, "firm");
export const organizationFor = (userId: string) => {
  const organization = one<
    Omit<Organization, "can_manage"> & { can_manage: number }
  >(
    `SELECT o.*,om.role membership_role,
  CASE WHEN om.role IN ('owner','admin') THEN 1 ELSE 0 END can_manage
  FROM organizations o JOIN organization_members om ON om.organization_id=o.id
  WHERE om.user_id=? AND om.status='active'
  ORDER BY CASE om.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'member' THEN 3 ELSE 4 END,om.created_at,om.id LIMIT 1`,
    userId,
  );
  return organization
    ? { ...organization, can_manage: Boolean(organization.can_manage) }
    : undefined;
};
const organizationMembers = (organizationId: string) =>
  all<OrganizationMember>(
    `SELECT om.*,u.name,u.email,u.role persona
  FROM organization_members om JOIN users u ON u.id=om.user_id
  WHERE om.organization_id=? ORDER BY CASE om.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'member' THEN 3 ELSE 4 END,u.name`,
    organizationId,
  );
const isPlatformAdmin = (user: User) => {
  return Boolean(user.is_platform_admin);
};
const buyerVerificationProfileFor = (
  organization: Organization,
): BuyerVerificationProfile | undefined => {
  const profile = one<Omit<BuyerVerificationProfile, "can_manage">>(
    `SELECT profile.*,organization.website,
       organization.organization_type buyer_type
     FROM buyer_verification_profiles profile
     JOIN organizations organization ON organization.id=profile.organization_id
     WHERE profile.organization_id=?`,
    organization.id,
  );
  return profile
    ? { ...profile, can_manage: organization.can_manage }
    : undefined;
};
const buyerFirmProfileFor = (
  organization: Organization,
): BuyerFirmProfile | undefined => {
  const profile = one<Omit<BuyerFirmProfile, "can_manage">>(
    `SELECT organization_id,fund_structure,financing_profile,
       self_reported_acquisition_count,revision,updated_at
     FROM buyer_firm_profiles WHERE organization_id=?`,
    organization.id,
  );
  return profile
    ? { ...profile, can_manage: organization.can_manage }
    : undefined;
};
const publicOrganizationProfileFor = (
  organization: Organization,
): PublicOrganizationProfile | undefined => {
  const profile = one<
    Omit<
      PublicOrganizationProfile,
      | "can_manage"
      | "industries"
      | "locations"
      | "is_public"
      | "show_website"
      | "show_province"
      | "show_verified_transactions"
    > & {
      is_public: number;
      show_website: number;
      show_province: number;
      show_verified_transactions: number;
    }
  >(
    `SELECT organization_id,is_public,headline,public_description,
       show_website,show_province,show_verified_transactions,revision,updated_at
     FROM organization_public_profiles WHERE organization_id=?`,
    organization.id,
  );
  if (!profile) return undefined;
  return {
    ...profile,
    is_public: Boolean(profile.is_public),
    show_website: Boolean(profile.show_website),
    show_province: Boolean(profile.show_province),
    show_verified_transactions: Boolean(profile.show_verified_transactions),
    industries: all<{ industry: string }>(
      `SELECT industry FROM organization_public_industries
       WHERE organization_id=? ORDER BY rowid`,
      organization.id,
    ).map(({ industry }) => industry),
    locations: all<{ province: string }>(
      `SELECT province FROM organization_public_locations
       WHERE organization_id=? ORDER BY rowid`,
      organization.id,
    ).map(({ province }) => province),
    can_manage: organization.can_manage,
  };
};
const transactionVerificationLabel = (verified: number) =>
  verified ? ("Succera verified" as const) : ("Self-reported" as const);
const closedTransactionsForOrganization = (
  organization: Organization,
): ClosedTransaction[] =>
  all<Omit<ClosedTransaction, "can_manage" | "verification_label">>(
    `SELECT * FROM closed_transactions
     WHERE buyer_organization_id=?
     ORDER BY closed_date DESC,created_at DESC,id DESC`,
    organization.id,
  ).map((transaction) => ({
    ...transaction,
    verification_label: transactionVerificationLabel(transaction.verified),
    can_manage: organization.can_manage,
  }));
const closedTransactionReviewQueue = (
  reviewer: User,
): ClosedTransactionReviewEntry[] =>
  all<Omit<ClosedTransactionReviewEntry, "can_manage" | "verification_label">>(
    `SELECT ct.*,organization.name buyer_organization_name,
       submitter.name submitted_by_name
     FROM closed_transactions ct
     JOIN organizations organization
       ON organization.id=ct.buyer_organization_id
     LEFT JOIN users submitter
       ON submitter.id=ct.created_by_user_id
     WHERE ct.verified=0
       AND EXISTS (
         SELECT 1
         FROM organization_members realm_owner_members
         JOIN users realm_owner ON realm_owner.id=realm_owner_members.user_id
         WHERE realm_owner_members.organization_id=ct.buyer_organization_id
           AND realm_owner_members.role='owner'
           AND realm_owner_members.status='active'
           AND realm_owner.is_demo=?
       )
       AND NOT EXISTS (
         SELECT 1
         FROM organization_members cross_realm_members
         JOIN users cross_realm_user ON cross_realm_user.id=cross_realm_members.user_id
         WHERE cross_realm_members.organization_id=ct.buyer_organization_id
           AND cross_realm_members.status='active'
           AND cross_realm_user.is_demo<>?
       )
       AND NOT EXISTS (
         SELECT 1 FROM organization_members reviewer_membership
         WHERE reviewer_membership.organization_id=ct.buyer_organization_id
           AND reviewer_membership.user_id=?
           AND reviewer_membership.status='active'
       )
     ORDER BY ct.created_at,ct.id
     LIMIT 100`,
    reviewer.is_demo,
    reviewer.is_demo,
    reviewer.id,
  ).map((transaction) => ({
    ...transaction,
    verification_label: transactionVerificationLabel(transaction.verified),
    can_manage: false,
  }));
const verificationAdminQueue = (reviewer: User): VerificationAdminEntry[] =>
  all<VerificationAdminEntry>(
    `SELECT profile.*,organization.name organization_name,
       organization.website,organization.organization_type buyer_type,
       organization.province,organization.verification_status,
       submitter.name submitted_by_name,
       review.decision latest_decision,
       review.notes latest_review_notes,
       review.created_at latest_reviewed_at,
       0 can_manage
     FROM buyer_verification_profiles profile
     JOIN organizations organization ON organization.id=profile.organization_id
     LEFT JOIN users submitter ON submitter.id=profile.submitted_by_user_id
     LEFT JOIN verification_reviews review ON review.id=(
       SELECT latest.id FROM verification_reviews latest
     WHERE latest.organization_id=profile.organization_id
       ORDER BY latest.created_at DESC,latest.rowid DESC LIMIT 1
     )
     WHERE profile.submitted_at IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM organization_members realm_owner_members
         JOIN users realm_owner ON realm_owner.id=realm_owner_members.user_id
         WHERE realm_owner_members.organization_id=profile.organization_id
           AND realm_owner_members.role='owner'
           AND realm_owner_members.status='active'
           AND realm_owner.is_demo=?
       )
       AND NOT EXISTS (
         SELECT 1
         FROM organization_members cross_realm_members
         JOIN users cross_realm_user ON cross_realm_user.id=cross_realm_members.user_id
         WHERE cross_realm_members.organization_id=profile.organization_id
           AND cross_realm_members.status='active'
           AND cross_realm_user.is_demo<>?
       )
     ORDER BY profile.submitted_at,organization.name
     LIMIT ?`,
    reviewer.is_demo,
    reviewer.is_demo,
    // The queue is intentionally bounded so a reviewer workspace cannot grow
    // without limit as buyer organizations accumulate.
    100,
  ).map((entry) => ({ ...entry, can_manage: false }));
const verificationReviews = (reviewer: User): VerificationReview[] =>
  all<VerificationReview>(
    `SELECT review.*,reviewer.name reviewer_name,
       organization.name organization_name
     FROM verification_reviews review
     JOIN users reviewer ON reviewer.id=review.reviewer_user_id
     JOIN organizations organization ON organization.id=review.organization_id
     WHERE EXISTS (
       SELECT 1
       FROM organization_members realm_owner_members
       JOIN users realm_owner ON realm_owner.id=realm_owner_members.user_id
       WHERE realm_owner_members.organization_id=review.organization_id
         AND realm_owner_members.role='owner'
         AND realm_owner_members.status='active'
         AND realm_owner.is_demo=?
     )
       AND NOT EXISTS (
         SELECT 1
         FROM organization_members cross_realm_members
         JOIN users cross_realm_user ON cross_realm_user.id=cross_realm_members.user_id
         WHERE cross_realm_members.organization_id=review.organization_id
           AND cross_realm_members.status='active'
           AND cross_realm_user.is_demo<>?
       )
     ORDER BY review.created_at DESC,review.rowid DESC LIMIT 20`,
    reviewer.is_demo,
    reviewer.is_demo,
  );
const dealOrganizationMembership = (userId: string, deal: Deal) =>
  one<{ role: "owner" | "admin" | "member" | "viewer" }>(
    `SELECT role FROM organization_members
  WHERE user_id=? AND status='active' AND organization_id IN (?,?)
  ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'member' THEN 3 ELSE 4 END LIMIT 1`,
    userId,
    deal.owner_organization_id || "",
    deal.advisor_organization_id || "",
  );
const legacyDirectAccess = (user: User, deal: Deal) =>
  (!deal.owner_organization_id && deal.owner_id === user.id) ||
  (!deal.advisor_organization_id && deal.advisor_id === user.id);
const isDealTeamMember = (user: User, deal: Deal) =>
  user.role !== "buyer" &&
  (!!dealOrganizationMembership(user.id, deal) ||
    legacyDirectAccess(user, deal));
export const isManager = (user: User, deal: Deal) => {
  const role = dealOrganizationMembership(user.id, deal)?.role;
  return (
    user.role !== "buyer" &&
    (["owner", "admin", "member"].includes(role || "") ||
      legacyDirectAccess(user, deal))
  );
};
const canManageOwnerSide = (user: User, deal: Deal) =>
  user.role !== "buyer" &&
  ((!deal.owner_organization_id && deal.owner_id === user.id) ||
    ["owner", "admin", "member"].includes(
      one<{ role: string }>(
        "SELECT role FROM organization_members WHERE user_id=? AND organization_id=? AND status='active'",
        user.id,
        deal.owner_organization_id || "",
      )?.role || "",
    ));
export const getDeal = (id: string) => {
  const deal = one<Deal>("SELECT * FROM deals WHERE id=?", id);
  if (!deal) throw new AppError("This deal is not available.", 404);
  return deal;
};
export function dealMatchesForUser(user: User, dealId: string): DealMatch[] {
  const deal = getDeal(dealId);
  requireManager(user, deal);
  return dealMatchesForDeals([dealId]);
}

const groupedProjectValues = <
  T extends { buyer_project_id: string },
  K extends keyof T,
>(
  rows: T[],
  valueKey: K,
) => {
  const values = new Map<string, string[]>();
  for (const row of rows) {
    const projectValues = values.get(row.buyer_project_id) ?? [];
    projectValues.push(String(row[valueKey]));
    values.set(row.buyer_project_id, projectValues);
  }
  return values;
};

function dealMatchesForDeals(dealIds: string[]): DealMatch[] {
  if (!dealIds.length) return [];
  const placeholders = dealIds.map(() => "?").join(",");
  type DealMatchRow = Omit<
    DealMatch,
    "score_breakdown" | "buyer_firm_profile"
  > & {
    score_breakdown_json: string;
    buyer_project_status: BuyerProject["status"];
    buyer_project_min_revenue: number | null;
    buyer_project_max_revenue: number | null;
    buyer_project_min_ebitda: number | null;
    buyer_project_max_ebitda: number | null;
    buyer_project_min_equity_check: number | null;
    buyer_project_max_equity_check: number | null;
    buyer_project_ownership_preference: BuyerProject["ownership_preference"];
    buyer_project_transaction_type: BuyerProject["transaction_type"];
    buyer_firm_fund_structure: string;
    buyer_firm_financing_profile: string;
    buyer_firm_acquisition_count: number | null;
    buyer_firm_profile_updated_at: string;
    deal_sector: string;
  };
  const rows = all<DealMatchRow>(
    `SELECT dm.*,
       bp.name buyer_project_name,
       bp.thesis buyer_project_thesis,
       bp.status buyer_project_status,
       bp.min_revenue buyer_project_min_revenue,
       bp.max_revenue buyer_project_max_revenue,
       bp.min_ebitda buyer_project_min_ebitda,
       bp.max_ebitda buyer_project_max_ebitda,
       bp.min_equity_check buyer_project_min_equity_check,
       bp.max_equity_check buyer_project_max_equity_check,
       bp.ownership_preference buyer_project_ownership_preference,
       bp.transaction_type buyer_project_transaction_type,
       o.name buyer_organization_name,
       o.organization_type buyer_organization_type,
       o.province buyer_organization_province,
       o.verification_status buyer_organization_verification_status,
       o.website buyer_organization_website,
       o.description buyer_organization_description,
       COALESCE(profile.fund_structure,'') buyer_firm_fund_structure,
       COALESCE(profile.financing_profile,'') buyer_firm_financing_profile,
       profile.self_reported_acquisition_count buyer_firm_acquisition_count,
       COALESCE(profile.updated_at,o.updated_at) buyer_firm_profile_updated_at,
       d.sector deal_sector,
       (
         SELECT COUNT(DISTINCT previous.id)
         FROM deals previous
         WHERE previous.stage='Closed'
           AND previous.sector=d.sector
           AND EXISTS (
             SELECT 1 FROM offers completed_offer
             JOIN organization_members offer_member
               ON offer_member.user_id=completed_offer.buyer_id
              AND offer_member.status='active'
             WHERE completed_offer.deal_id=previous.id
               AND completed_offer.status='Shortlisted'
               AND offer_member.organization_id=o.id
           )
       ) relevant_acquisitions
     FROM deal_matches dm
     JOIN buyer_projects bp ON bp.id=dm.buyer_project_id
     JOIN organizations o ON o.id=dm.buyer_organization_id
     JOIN deals d ON d.id=dm.deal_id
     LEFT JOIN buyer_firm_profiles profile
       ON profile.organization_id=dm.buyer_organization_id
     WHERE dm.deal_id IN (${placeholders})
       AND o.organization_type IN (${BUYER_ORGANIZATION_TYPES.map(() => "?").join(",")})
       AND bp.status='active'
     ORDER BY dm.eligible DESC,dm.score DESC,bp.name`,
    ...dealIds,
    ...BUYER_ORGANIZATION_TYPES,
  );
  const visibleProjectRows = rows.filter(
    (row) => row.buyer_project_status === "active" && row.eligible,
  );
  const projectIds = [
    ...new Set(visibleProjectRows.map((row) => row.buyer_project_id)),
  ];
  const projectPlaceholders = projectIds.map(() => "?").join(",");
  let sectors = new Map<string, string[]>();
  let provinces = new Map<string, string[]>();
  if (projectIds.length) {
    sectors = groupedProjectValues(
      all<{ buyer_project_id: string; sector: string }>(
        `SELECT buyer_project_id,sector FROM buyer_project_sectors
         WHERE buyer_project_id IN (${projectPlaceholders}) ORDER BY rowid`,
        ...projectIds,
      ),
      "sector",
    );
    provinces = groupedProjectValues(
      all<{ buyer_project_id: string; province: string }>(
        `SELECT buyer_project_id,province FROM buyer_project_provinces
         WHERE buyer_project_id IN (${projectPlaceholders}) ORDER BY rowid`,
        ...projectIds,
      ),
      "province",
    );
  }
  const activeProjects = new Map<string, SellerVisibleBuyerProject[]>();
  for (const row of visibleProjectRows) {
    const key = `${row.deal_id}:${row.buyer_organization_id}`;
    const projects = activeProjects.get(key) ?? [];
    projects.push({
      id: row.buyer_project_id,
      name: row.buyer_project_name,
      min_revenue: row.buyer_project_min_revenue,
      max_revenue: row.buyer_project_max_revenue,
      min_ebitda: row.buyer_project_min_ebitda,
      max_ebitda: row.buyer_project_max_ebitda,
      min_equity_check: row.buyer_project_min_equity_check,
      max_equity_check: row.buyer_project_max_equity_check,
      ownership_preference: row.buyer_project_ownership_preference,
      transaction_type: row.buyer_project_transaction_type,
      sectors: sectors.get(row.buyer_project_id) ?? [],
      provinces: provinces.get(row.buyer_project_id) ?? [],
    });
    activeProjects.set(key, projects);
  }
  for (const projects of activeProjects.values())
    projects.sort((left, right) => left.name.localeCompare(right.name));
  const buyerOrganizationIds = [
    ...new Set(rows.map((row) => row.buyer_organization_id)),
  ];
  const closedTransactions = new Map<
    string,
    SellerVisibleClosedTransaction[]
  >();
  const reputationEvents = new Map<string, BuyerReputationEvent[]>();
  const verifiedTransactions = new Map<string, VerifiedTransactionEvidence[]>();
  if (buyerOrganizationIds.length) {
    const organizationPlaceholders = buyerOrganizationIds
      .map(() => "?")
      .join(",");
    const transactions = all<
      SellerVisibleClosedTransaction & { buyer_organization_id: string }
    >(
      `SELECT id,buyer_organization_id,industry,province,enterprise_value,
         closed_date,description,verified,
         CASE WHEN verified=1 THEN 'Succera verified'
              ELSE 'Self-reported' END verification_label
       FROM closed_transactions ct
       WHERE buyer_organization_id IN (${organizationPlaceholders})
         AND id IN (
           SELECT recent.id FROM closed_transactions recent
           WHERE recent.buyer_organization_id=ct.buyer_organization_id
           ORDER BY recent.closed_date DESC,recent.created_at DESC,recent.id DESC
           LIMIT 20
         )
       ORDER BY buyer_organization_id,closed_date DESC,created_at DESC,id DESC`,
      ...buyerOrganizationIds,
    );
    for (const { buyer_organization_id, ...transaction } of transactions) {
      const organizationTransactions =
        closedTransactions.get(buyer_organization_id) ?? [];
      organizationTransactions.push(transaction);
      closedTransactions.set(buyer_organization_id, organizationTransactions);
    }
    for (const event of all<
      BuyerReputationEvent & { buyer_organization_id: string }
    >(
      `SELECT buyer_organization_id,deal_id,event_type,created_at
       FROM deal_buyer_events
       WHERE buyer_organization_id IN (${organizationPlaceholders})
         AND event_type IN (
           'teaser_sent','pursued','passed','intro_requested','loi_received'
         )
       ORDER BY buyer_organization_id,created_at,rowid`,
      ...buyerOrganizationIds,
    )) {
      const organizationEvents =
        reputationEvents.get(event.buyer_organization_id) ?? [];
      const { buyer_organization_id, ...safeEvent } = event;
      organizationEvents.push(safeEvent);
      reputationEvents.set(buyer_organization_id, organizationEvents);
    }
    for (const transaction of all<
      VerifiedTransactionEvidence & { buyer_organization_id: string }
    >(
      `SELECT buyer_organization_id,industry
       FROM closed_transactions
       WHERE verified=1
         AND buyer_organization_id IN (${organizationPlaceholders})
       ORDER BY buyer_organization_id,closed_date DESC,id`,
      ...buyerOrganizationIds,
    )) {
      const organizationTransactions =
        verifiedTransactions.get(transaction.buyer_organization_id) ?? [];
      organizationTransactions.push({ industry: transaction.industry });
      verifiedTransactions.set(
        transaction.buyer_organization_id,
        organizationTransactions,
      );
    }
  }
  const reputationCache = new Map<
    string,
    ReturnType<typeof deriveBuyerReputationMetrics>
  >();
  const reputationFor = (organizationId: string, sector: string) => {
    const cacheKey = `${organizationId}\0${sector.trim().toLocaleLowerCase("en-CA")}`;
    const cached = reputationCache.get(cacheKey);
    if (cached) return cached;
    const reputation = deriveBuyerReputationMetrics(
      reputationEvents.get(organizationId) ?? [],
      verifiedTransactions.get(organizationId) ?? [],
      sector,
    );
    reputationCache.set(cacheKey, reputation);
    return reputation;
  };
  return rows.map(
    ({
      score_breakdown_json,
      buyer_project_status: _buyerProjectStatus,
      buyer_project_min_revenue: _buyerProjectMinRevenue,
      buyer_project_max_revenue: _buyerProjectMaxRevenue,
      buyer_project_min_ebitda: _buyerProjectMinEbitda,
      buyer_project_max_ebitda: _buyerProjectMaxEbitda,
      buyer_project_min_equity_check: _buyerProjectMinEquityCheck,
      buyer_project_max_equity_check: _buyerProjectMaxEquityCheck,
      buyer_project_ownership_preference: _buyerProjectOwnershipPreference,
      buyer_project_transaction_type: _buyerProjectTransactionType,
      buyer_firm_fund_structure,
      buyer_firm_financing_profile,
      buyer_firm_acquisition_count,
      buyer_firm_profile_updated_at,
      deal_sector,
      ...row
    }) => ({
      ...row,
      buyer_firm_profile: {
        organization_id: row.buyer_organization_id,
        fund_structure: buyer_firm_fund_structure,
        financing_profile: buyer_firm_financing_profile,
        self_reported_acquisition_count: buyer_firm_acquisition_count,
        updated_at: buyer_firm_profile_updated_at,
        active_projects:
          activeProjects.get(`${row.deal_id}:${row.buyer_organization_id}`) ??
          [],
        closed_transactions:
          closedTransactions.get(row.buyer_organization_id) ?? [],
        reputation: reputationFor(row.buyer_organization_id, deal_sector),
      },
      score_breakdown: JSON.parse(
        score_breakdown_json,
      ) as DealMatch["score_breakdown"],
    }),
  );
}

function dealOutreachFor(
  user: User,
  organizationId: string,
  managedDealIds: string[],
): DealOutreachRecipient[] {
  const managerView = user.role !== "buyer";
  if (managerView && !managedDealIds.length) return [];
  const managerPlaceholders = managedDealIds.map(() => "?").join(",");
  const rows = all<
    Omit<DealOutreachRecipient, "match_reasons"> & {
      score_breakdown_json: string;
    }
  >(
    `SELECT dor.id,dor.outreach_id,o.deal_id,o.sender_user_id,
       sender.name sender_name,o.subject,o.message,o.created_at,
       dor.buyer_organization_id,organization.name buyer_organization_name,
       dor.buyer_project_id,project.name buyer_project_name,dor.status,
       dor.sent_at,dor.viewed_at,dor.pursued_at,dor.passed_at,
       dm.score match_score,dm.score_breakdown_json
     FROM deal_outreach_recipients dor
     JOIN deal_outreach o ON o.id=dor.outreach_id
     JOIN users sender ON sender.id=o.sender_user_id
     JOIN organizations organization ON organization.id=dor.buyer_organization_id
     JOIN buyer_projects project ON project.id=dor.buyer_project_id
     JOIN deal_matches dm
       ON dm.deal_id=o.deal_id AND dm.buyer_project_id=dor.buyer_project_id
     WHERE ${
       managerView
         ? `o.deal_id IN (${managerPlaceholders})`
         : "dor.buyer_organization_id=?"
     }
     ORDER BY o.created_at DESC,dor.rowid DESC`,
    ...(managerView ? managedDealIds : [organizationId]),
  );
  return rows.map(({ score_breakdown_json, ...row }) => ({
    ...row,
    match_reasons: (
      JSON.parse(score_breakdown_json) as DealMatch["score_breakdown"]
    ).reasons
      .filter((reason) => reason.score > 0)
      .map((reason) => reason.dimension),
  }));
}

type QualifiedDiscoveryMatch = {
  deal_id: string;
  buyer_project_id: string;
  buyer_project_name: string;
  score: number;
  match_reasons: string[];
};

function qualifiedDiscoveryMatchesFor(
  organizationId: string,
  minimumScore: number,
  minimumVerificationStatus: BuyerVerificationStatus,
) {
  const eligibleVerificationStatuses =
    qualifiedDiscoveryEligibleVerificationStatuses(minimumVerificationStatus);
  if (!eligibleVerificationStatuses.length)
    return new Map<string, QualifiedDiscoveryMatch>();
  const verificationPlaceholders = eligibleVerificationStatuses
    .map(() => "?")
    .join(",");
  const rows = all<{
    deal_id: string;
    buyer_project_id: string;
    buyer_project_name: string;
    score: number;
    score_breakdown_json: string;
  }>(
    `SELECT dm.deal_id,dm.buyer_project_id,bp.name buyer_project_name,
       dm.score,dm.score_breakdown_json
     FROM deal_matches dm
     JOIN buyer_projects bp
       ON bp.id=dm.buyer_project_id
      AND bp.organization_id=dm.buyer_organization_id
     JOIN organizations buyer_organization
       ON buyer_organization.id=dm.buyer_organization_id
     JOIN deals d ON d.id=dm.deal_id
     WHERE dm.buyer_organization_id=?
       AND buyer_organization.verification_status IN (${verificationPlaceholders})
       AND dm.eligible=1 AND dm.score>=?
       AND bp.status='active' AND d.published=1
       AND d.distribution_mode='qualified_discovery'
     ORDER BY dm.deal_id,dm.score DESC,bp.name,bp.id`,
    organizationId,
    ...eligibleVerificationStatuses,
    minimumScore,
  );
  const bestByDeal = new Map<string, QualifiedDiscoveryMatch>();
  for (const row of rows) {
    if (bestByDeal.has(row.deal_id)) continue;
    const breakdown = JSON.parse(
      row.score_breakdown_json,
    ) as DealMatch["score_breakdown"];
    bestByDeal.set(row.deal_id, {
      deal_id: row.deal_id,
      buyer_project_id: row.buyer_project_id,
      buyer_project_name: row.buyer_project_name,
      score: row.score,
      match_reasons: breakdown.reasons
        .filter((reason) => reason.score > 0)
        .map((reason) => reason.dimension),
    });
  }
  return bestByDeal;
}

function introductionRequestsFor(
  user: User,
  organizationId: string,
  managedDealIds: string[],
): IntroductionRequest[] {
  const managerView = user.role !== "buyer";
  if (managerView && !managedDealIds.length) return [];
  const placeholders = managedDealIds.map(() => "?").join(",");
  const rows = all<
    Omit<IntroductionRequest, "match_reasons"> & {
      score_breakdown_json: string;
    }
  >(
    `SELECT ir.*,d.title deal_title,organization.name buyer_organization_name,
       organization.verification_status buyer_organization_verification_status,
       project.name buyer_project_name,requester.name requested_by_user_name,
       dm.score match_score,dm.score_breakdown_json,
       (
         SELECT COUNT(DISTINCT previous.id)
         FROM deals previous
         WHERE previous.stage='Closed' AND previous.sector=d.sector
           AND EXISTS (
             SELECT 1 FROM offers completed_offer
             JOIN organization_members offer_member
               ON offer_member.user_id=completed_offer.buyer_id
              AND offer_member.status='active'
             WHERE completed_offer.deal_id=previous.id
               AND completed_offer.status='Shortlisted'
               AND offer_member.organization_id=organization.id
           )
       ) relevant_acquisitions
     FROM introduction_requests ir
     JOIN deals d ON d.id=ir.deal_id
     JOIN organizations organization ON organization.id=ir.buyer_organization_id
     JOIN buyer_projects project ON project.id=ir.buyer_project_id
     JOIN users requester ON requester.id=ir.requested_by_user_id
     JOIN deal_matches dm
       ON dm.deal_id=ir.deal_id AND dm.buyer_project_id=ir.buyer_project_id
     WHERE ${
       managerView
         ? `ir.deal_id IN (${placeholders})`
         : "ir.buyer_organization_id=?"
     }
     ORDER BY CASE ir.status WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 WHEN 'declined' THEN 3 ELSE 4 END,
       ir.created_at DESC,ir.id`,
    ...(managerView ? managedDealIds : [organizationId]),
  );
  return rows.map(({ score_breakdown_json, ...row }) => ({
    ...row,
    match_reasons: (
      JSON.parse(score_breakdown_json) as DealMatch["score_breakdown"]
    ).reasons
      .filter((reason) => reason.score > 0)
      .map((reason) => reason.dimension),
  }));
}
export const membership = (dealId: string, userId: string) =>
  one<Access>(
    "SELECT * FROM access WHERE deal_id=? AND buyer_id=?",
    dealId,
    userId,
  );
const hasApprovedAccess = (
  user: User,
  deal: Deal,
  member?: Pick<Access, "status">,
) => isDealTeamMember(user, deal) || member?.status === "approved";
export const canAccess = (user: User, deal: Deal) =>
  hasApprovedAccess(user, deal, membership(deal.id, user.id));
export function requireManager(user: User, deal: Deal) {
  if (!isManager(user, deal))
    throw new AppError("Only an authorized deal-team member can do that.", 403);
}
export function requireAccess(user: User, deal: Deal) {
  if (!canAccess(user, deal))
    throw new AppError("Confidential access has not been approved.", 403);
}
function canReadDocumentWithMembership(
  user: User,
  deal: Deal,
  doc: Pick<Document, "audience" | "buyer_id" | "category">,
  member?: Pick<Access, "status">,
  teamMember = isDealTeamMember(user, deal),
) {
  if (teamMember) return true;
  if (!member || ["denied", "revoked"].includes(member.status)) return false;
  if (
    doc.category === "NDA" &&
    doc.audience === "buyer" &&
    doc.buyer_id === user.id
  )
    return true;
  return (
    member.status === "approved" &&
    (doc.audience === "approved" ||
      (doc.audience === "buyer" && doc.buyer_id === user.id))
  );
}
export function canReadDocument(
  user: User,
  deal: Deal,
  doc: Pick<Document, "audience" | "buyer_id" | "category">,
) {
  return canReadDocumentWithMembership(
    user,
    deal,
    doc,
    membership(deal.id, user.id),
  );
}
export function audit(user: User, dealId: string, action: string) {
  run(
    "INSERT INTO activity(id,deal_id,actor_id,action) VALUES(?,?,?,?)",
    randomUUID(),
    dealId,
    user.id,
    action,
  );
}
export function limit(key: string, maximum: number, seconds = 900) {
  const now = Date.now();
  run("DELETE FROM rate_limits WHERE resets_at < ?", now);
  run(
    "INSERT INTO rate_limits(key,attempts,resets_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1",
    key,
    now + seconds * 1000,
  );
  if (
    (one<{ attempts: number }>(
      "SELECT attempts FROM rate_limits WHERE key=?",
      key,
    )?.attempts || 0) > maximum
  )
    throw new AppError("Too many attempts. Please try again later.", 429);
}
export function sessionUser(token?: string): User | undefined {
  if (!token) return undefined;
  return one<User>(
    `SELECT ${userColumns
      .split(",")
      .map((c) => `u.${c}`)
      .join(
        ",",
      )} FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND (u.is_demo=0 OR ?=1)`,
    tokenHash(token),
    Date.now(),
    process.env.ALLOW_DEMO === "true" ? 1 : 0,
  );
}
export function createSession(userId: string) {
  run("DELETE FROM sessions WHERE expires_at<?", Date.now());
  const token = randomBytes(32).toString("hex");
  run(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
    tokenHash(token),
    userId,
    Date.now() + 7 * 86400000,
  );
  return token;
}
export function login(input: unknown) {
  const data = parse(
    z.object({
      email: z.email().max(254),
      password: z.string().min(1).max(128),
    }),
    input,
  );
  const email = data.email.toLowerCase();
  limit(`login:${tokenHash(email)}`, 10);
  const user = one<User & { password_hash: string }>(
    "SELECT * FROM users WHERE email=? AND is_demo=0",
    email,
  );
  if (!user || !verifyPassword(data.password, user.password_hash))
    throw new AppError("Email or password is incorrect.", 401);
  return createSession(user.id);
}
export function register(input: unknown) {
  if (process.env.ALLOW_REGISTRATION === "false")
    throw new AppError(
      "Registration is currently closed. Contact your pilot administrator.",
      403,
    );
  const data = parse(
    z.object({
      name: text(2, 100),
      company: text(2, 160),
      email: z.email().max(254),
      password: z.string().min(12).max(128),
      role: z.enum(["buyer", "owner", "advisor"]),
    }),
    input,
  );
  limit("registration", 30, 3600);
  const email = data.email.toLowerCase();
  if (one("SELECT id FROM users WHERE email=?", email))
    throw new AppError(
      "An account with this email already exists. Please sign in.",
    );
  const id = randomUUID(),
    organizationId = randomUUID(),
    database = db(),
    passwordHash = hashPassword(data.password);
  inImmediateTransaction(database, () => {
    database
      .prepare(
        "INSERT INTO users(id,email,password_hash,name,company,role) VALUES(?,?,?,?,?,?)",
      )
      .run(id, email, passwordHash, data.name, data.company, data.role);
    database
      .prepare(
        "INSERT INTO organizations(id,name,slug,organization_type) VALUES(?,?,?,?)",
      )
      .run(
        organizationId,
        data.company,
        `${slugPart(data.company)}-${organizationId.slice(0, 12)}`,
        organizationTypeFor(data.role),
      );
    database
      .prepare(
        "INSERT OR IGNORE INTO organization_public_profiles(organization_id) VALUES(?)",
      )
      .run(organizationId);
    database
      .prepare(
        "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'owner','active')",
      )
      .run(randomUUID(), organizationId, id);
    if (data.role === "buyer") {
      database
        .prepare(
          `INSERT INTO buyer_verification_profiles(
             organization_id,legal_name,updated_by_user_id
           ) VALUES(?,?,?)`,
        )
        .run(organizationId, data.company, id);
      database
        .prepare(
          `INSERT INTO buyer_firm_profiles(
             organization_id,updated_by_user_id
           ) VALUES(?,?)`,
        )
        .run(organizationId, id);
    }
  });
  return createSession(id);
}
export function match(user: User, deal: Deal) {
  const reasons: string[] = [];
  const sectors = user.sectors.split(",").filter(Boolean);
  if (!sectors.length || sectors.includes(deal.sector))
    reasons.push("Industry fit");
  if (!user.province || user.province === deal.province)
    reasons.push("Geography fit");
  if (deal.revenue >= user.min_revenue && deal.revenue <= user.max_revenue)
    reasons.push("Revenue fit");
  return {
    match_score: Math.round((reasons.length / 3) * 100),
    match_reasons: reasons,
  };
}

const dealDetailsFields = {
  title: text(3, 120),
  company_name: text(2, 180),
  sector: z.enum(SECTORS),
  province: z.enum(PROVINCES),
  city: text(1, 100),
  revenue: amount,
  ebitda: amount,
  asking_price: amount,
  employees: z.coerce.number().int().min(0).max(100000),
  founded: z.coerce.number().int().min(1800).max(new Date().getFullYear()),
  description: text(30, 1200),
  confidential_summary: text(0, 5000),
  transaction_type: z.enum(DEAL_TRANSACTION_TYPES),
  ownership_percentage_available: z.coerce.number().min(0).max(100),
  seller_rollover_possible: z.boolean(),
  seller_financing_possible: z.boolean(),
  management_transition: text(0, 2000),
  reason_for_transaction: text(0, 2000),
  min_expected_value: optionalAmount,
  max_expected_value: optionalAmount,
  distribution_mode: z.enum(DEAL_DISTRIBUTION_MODES),
};
const dealDetailsSchema = z.object({
  ...dealDetailsFields,
  transaction_type:
    dealDetailsFields.transaction_type.default("full_acquisition"),
  ownership_percentage_available:
    dealDetailsFields.ownership_percentage_available.default(100),
  seller_rollover_possible:
    dealDetailsFields.seller_rollover_possible.default(false),
  seller_financing_possible:
    dealDetailsFields.seller_financing_possible.default(false),
  management_transition: dealDetailsFields.management_transition.default(""),
  reason_for_transaction: dealDetailsFields.reason_for_transaction.default(""),
  min_expected_value: dealDetailsFields.min_expected_value.default(null),
  max_expected_value: dealDetailsFields.max_expected_value.default(null),
  distribution_mode:
    dealDetailsFields.distribution_mode.default("private_outreach"),
});
const dealCreateSchema = dealDetailsSchema.extend({
  financial_year: z.coerce
    .number()
    .int()
    .min(1800)
    .max(2200)
    .default(new Date().getFullYear()),
  gross_profit: optionalSignedAmount.default(null),
  financial_is_projected: z.boolean().default(false),
});
const dealDetailsUpdateSchema = z
  .object(dealDetailsFields)
  .partial()
  .extend({ deal_id: idSchema });
const dealFinancialSchema = z.object({
  fiscal_year: z.coerce.number().int().min(1800).max(2200),
  period_type: z.enum(DEAL_FINANCIAL_PERIOD_TYPES),
  revenue: amount,
  ebitda: z.coerce.number().int().min(-10_000_000_000).max(10_000_000_000),
  gross_profit: optionalSignedAmount,
  is_projected: z.boolean(),
});
const validateExpectedValueRange = (deal: {
  min_expected_value: number | null;
  max_expected_value: number | null;
}) => {
  if (
    deal.min_expected_value !== null &&
    deal.max_expected_value !== null &&
    deal.min_expected_value > deal.max_expected_value
  )
    throw new AppError(
      "Minimum expected value must not exceed maximum expected value.",
    );
};

const buyerOrganizationTypes = new Set<OrganizationType>(
  BUYER_ORGANIZATION_TYPES,
);
const buyerProjectNumber = (maximum: number, integer = true) =>
  z.preprocess(
    (value) =>
      value === "" || value === undefined || value === null ? null : value,
    (integer ? z.coerce.number().int() : z.coerce.number())
      .min(0)
      .max(maximum)
      .nullable(),
  );
const buyerVerificationProfileSchema = z.object({
  legal_name: text(2, 200),
  website: websiteUrl,
  buyer_type: z.enum(BUYER_ORGANIZATION_TYPES),
  principals: text(5, 4000),
  acquisition_history: text(10, 5000),
  capital_source: text(10, 3000),
  min_equity_check: buyerProjectNumber(10_000_000_000),
  max_equity_check: buyerProjectNumber(10_000_000_000),
  financing_approach: text(10, 3000),
});
type BuyerVerificationProfileInput = z.infer<
  typeof buyerVerificationProfileSchema
>;
const validateBuyerVerificationProfile = (
  profile: BuyerVerificationProfileInput,
) => {
  if (
    profile.min_equity_check !== null &&
    profile.max_equity_check !== null &&
    profile.min_equity_check > profile.max_equity_check
  )
    throw new AppError(
      "Minimum equity cheque must not exceed maximum equity cheque.",
    );
  return profile;
};
const buyerProjectSectorList = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === "string" ? item.trim() : item))
      : value,
  z.array(z.enum(SECTORS)).max(SECTORS.length),
);
const buyerProjectProvinceList = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === "string" ? item.trim() : item))
      : value,
  z.array(z.enum(PROVINCES)).max(PROVINCES.length),
);
const buyerProjectKeywordList = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === "string" ? item.trim() : item))
      : value,
  z.array(z.string().min(1).max(100)).max(100),
);
const publicIndustryList = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === "string" ? item.trim() : item))
      : value,
  z.array(z.enum(SECTORS)).max(SECTORS.length),
);
const publicLocationList = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === "string" ? item.trim() : item))
      : value,
  z.array(z.enum(PROVINCES)).max(PROVINCES.length),
);
const buyerProjectFields = {
  name: text(1, 160),
  status: z.enum(BUYER_PROJECT_STATUSES),
  thesis: text(0, 5000),
  min_revenue: buyerProjectNumber(10_000_000_000),
  max_revenue: buyerProjectNumber(10_000_000_000),
  min_ebitda: buyerProjectNumber(10_000_000_000),
  max_ebitda: buyerProjectNumber(10_000_000_000),
  min_ebitda_margin: buyerProjectNumber(100, false),
  max_ebitda_margin: buyerProjectNumber(100, false),
  min_enterprise_value: buyerProjectNumber(10_000_000_000),
  max_enterprise_value: buyerProjectNumber(10_000_000_000),
  min_equity_check: buyerProjectNumber(10_000_000_000),
  max_equity_check: buyerProjectNumber(10_000_000_000),
  ownership_preference: z.enum(BUYER_PROJECT_OWNERSHIP_PREFERENCES),
  transaction_type: z.enum(BUYER_PROJECT_TRANSACTION_TYPES),
  sectors: buyerProjectSectorList,
  provinces: buyerProjectProvinceList,
  keywords: buyerProjectKeywordList,
};
const buyerProjectSchema = z.object({
  ...buyerProjectFields,
  status: buyerProjectFields.status.default("draft"),
  thesis: buyerProjectFields.thesis.default(""),
  ownership_preference:
    buyerProjectFields.ownership_preference.default("flexible"),
  transaction_type:
    buyerProjectFields.transaction_type.default("full_acquisition"),
  sectors: buyerProjectFields.sectors.default([]),
  provinces: buyerProjectFields.provinces.default([]),
  keywords: buyerProjectFields.keywords.default([]),
});
const buyerProjectUpdateSchema = z
  .object(buyerProjectFields)
  .partial()
  .extend({ buyer_project_id: idSchema });
type BuyerProjectInput = z.infer<typeof buyerProjectSchema>;

const normalizeUnique = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};
const validateBuyerProjectRanges = (project: BuyerProjectInput) => {
  const ranges = [
    ["Revenue", project.min_revenue, project.max_revenue],
    ["EBITDA", project.min_ebitda, project.max_ebitda],
    ["EBITDA margin", project.min_ebitda_margin, project.max_ebitda_margin],
    [
      "Enterprise value",
      project.min_enterprise_value,
      project.max_enterprise_value,
    ],
    ["Equity check", project.min_equity_check, project.max_equity_check],
  ] as const;
  for (const [label, minimum, maximum] of ranges) {
    if (minimum !== null && maximum !== null && minimum > maximum)
      throw new AppError(`${label} minimum must not exceed maximum.`);
  }
};
const normalizedBuyerProject = (
  project: BuyerProjectInput,
): BuyerProjectInput => {
  const normalized = {
    ...project,
    sectors: normalizeUnique(project.sectors),
    provinces: normalizeUnique(project.provinces),
    keywords: normalizeUnique(project.keywords),
  };
  validateBuyerProjectRanges(normalized);
  return normalized;
};
const isEligibleBuyerOrganizationType = (organizationType: OrganizationType) =>
  buyerOrganizationTypes.has(organizationType);
const isEligibleBuyerOrganization = (organization: Organization) =>
  isEligibleBuyerOrganizationType(organization.organization_type);
const requireBuyerProjectManager = (user: User) => {
  const organization = organizationFor(user.id);
  if (!organization)
    throw new AppError(
      "Your account is not connected to an organization.",
      403,
    );
  if (!isEligibleBuyerOrganization(organization))
    throw new AppError(
      "Only eligible buyer organizations can create or manage acquisition projects.",
      403,
    );
  if (organization.membership_role === "viewer")
    throw new AppError(
      "Read-only organization members cannot create or manage acquisition projects.",
      403,
    );
  return organization;
};
const projectRow = (id: string, organizationId: string) =>
  one<BuyerProject>(
    "SELECT * FROM buyer_projects WHERE id=? AND organization_id=?",
    id,
    organizationId,
  );
const projectWithFilters = (id: string, organizationId: string) => {
  const project = projectRow(id, organizationId);
  if (!project) throw new AppError("This buyer project is not available.", 404);
  return {
    ...project,
    sectors: all<{ sector: string }>(
      "SELECT sector FROM buyer_project_sectors WHERE buyer_project_id=? ORDER BY rowid",
      id,
    ).map(({ sector }) => sector),
    provinces: all<{ province: string }>(
      "SELECT province FROM buyer_project_provinces WHERE buyer_project_id=? ORDER BY rowid",
      id,
    ).map(({ province }) => province),
    keywords: all<{ keyword: string }>(
      "SELECT keyword FROM buyer_project_keywords WHERE buyer_project_id=? ORDER BY rowid",
      id,
    ).map(({ keyword }) => keyword),
  };
};
const replaceBuyerProjectFilters = (
  database: ReturnType<typeof db>,
  projectId: string,
  project: Pick<BuyerProjectInput, "sectors" | "provinces" | "keywords">,
) => {
  database
    .prepare("DELETE FROM buyer_project_sectors WHERE buyer_project_id=?")
    .run(projectId);
  database
    .prepare("DELETE FROM buyer_project_provinces WHERE buyer_project_id=?")
    .run(projectId);
  database
    .prepare("DELETE FROM buyer_project_keywords WHERE buyer_project_id=?")
    .run(projectId);
  const sector = database.prepare(
    "INSERT INTO buyer_project_sectors(id,buyer_project_id,sector) VALUES(?,?,?)",
  );
  const province = database.prepare(
    "INSERT INTO buyer_project_provinces(id,buyer_project_id,province) VALUES(?,?,?)",
  );
  const keyword = database.prepare(
    "INSERT INTO buyer_project_keywords(id,buyer_project_id,keyword) VALUES(?,?,?)",
  );
  project.sectors.forEach((value) =>
    sector.run(randomUUID(), projectId, value),
  );
  project.provinces.forEach((value) =>
    province.run(randomUUID(), projectId, value),
  );
  project.keywords.forEach((value) =>
    keyword.run(randomUUID(), projectId, value),
  );
};
const projectValues = (project: BuyerProjectInput) => [
  project.name,
  project.status,
  project.thesis,
  project.min_revenue,
  project.max_revenue,
  project.min_ebitda,
  project.max_ebitda,
  project.min_ebitda_margin,
  project.max_ebitda_margin,
  project.min_enterprise_value,
  project.max_enterprise_value,
  project.min_equity_check,
  project.max_equity_check,
  project.ownership_preference,
  project.transaction_type,
];
export function createBuyerProject(user: User, input: unknown) {
  const organization = requireBuyerProjectManager(user);
  const project = normalizedBuyerProject(parse(buyerProjectSchema, input));
  const id = randomUUID();
  const database = db();
  inImmediateTransaction(database, () => {
    database
      .prepare(
        `INSERT INTO buyer_projects(
          id,organization_id,created_by_user_id,name,status,thesis,
          min_revenue,max_revenue,min_ebitda,max_ebitda,min_ebitda_margin,max_ebitda_margin,
          min_enterprise_value,max_enterprise_value,min_equity_check,max_equity_check,
          ownership_preference,transaction_type
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, organization.id, user.id, ...projectValues(project));
    replaceBuyerProjectFilters(database, id, project);
    recalculateBuyerProjectMatches(database, id);
  });
  return { id, message: "Acquisition project created." };
}
export function updateBuyerProject(user: User, input: unknown) {
  const organization = requireBuyerProjectManager(user);
  const update = parse(buyerProjectUpdateSchema, input);
  const existing = projectWithFilters(update.buyer_project_id, organization.id);
  const merged = normalizedBuyerProject(
    parse(buyerProjectSchema, {
      ...existing,
      ...update,
      id: undefined,
      organization_id: undefined,
      created_by_user_id: undefined,
      created_at: undefined,
      updated_at: undefined,
      can_manage: undefined,
      buyer_project_id: undefined,
    }),
  );
  const database = db();
  inImmediateTransaction(database, () => {
    database
      .prepare(
        `UPDATE buyer_projects SET
          name=?,status=?,thesis=?,min_revenue=?,max_revenue=?,min_ebitda=?,max_ebitda=?,
          min_ebitda_margin=?,max_ebitda_margin=?,min_enterprise_value=?,max_enterprise_value=?,
          min_equity_check=?,max_equity_check=?,ownership_preference=?,transaction_type=?,
          updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE id=? AND organization_id=?`,
      )
      .run(...projectValues(merged), update.buyer_project_id, organization.id);
    replaceBuyerProjectFilters(database, update.buyer_project_id, merged);
    recalculateBuyerProjectMatches(database, update.buyer_project_id);
  });
  return {
    id: update.buyer_project_id,
    message: "Acquisition project updated.",
  };
}
export function setBuyerProjectStatus(user: User, input: unknown) {
  const organization = requireBuyerProjectManager(user);
  const project = parse(
    z.object({
      buyer_project_id: idSchema,
      status: z.enum(BUYER_PROJECT_STATUSES),
    }),
    input,
  );
  if (!projectRow(project.buyer_project_id, organization.id))
    throw new AppError("This buyer project is not available.", 404);
  const database = db();
  inImmediateTransaction(database, () => {
    database
      .prepare(
        "UPDATE buyer_projects SET status=?,updated_at=strftime('%Y-%m-%d %H:%M:%f','now') WHERE id=? AND organization_id=?",
      )
      .run(project.status, project.buyer_project_id, organization.id);
    recalculateBuyerProjectMatches(database, project.buyer_project_id);
  });
  return {
    id: project.buyer_project_id,
    message: "Acquisition project status updated.",
  };
}
const buyerProjectsFor = (organizationId: string, canManage: boolean) => {
  const projects = all<BuyerProject>(
    "SELECT * FROM buyer_projects WHERE organization_id=? ORDER BY created_at DESC,name",
    organizationId,
  );
  const sectors = groupedProjectValues(
    all<{ buyer_project_id: string; sector: string }>(
      `SELECT bps.buyer_project_id,bps.sector FROM buyer_project_sectors bps
       JOIN buyer_projects bp ON bp.id=bps.buyer_project_id
       WHERE bp.organization_id=? ORDER BY bps.rowid`,
      organizationId,
    ),
    "sector",
  );
  const provinces = groupedProjectValues(
    all<{ buyer_project_id: string; province: string }>(
      `SELECT bpp.buyer_project_id,bpp.province FROM buyer_project_provinces bpp
       JOIN buyer_projects bp ON bp.id=bpp.buyer_project_id
       WHERE bp.organization_id=? ORDER BY bpp.rowid`,
      organizationId,
    ),
    "province",
  );
  const keywords = groupedProjectValues(
    all<{ buyer_project_id: string; keyword: string }>(
      `SELECT bpk.buyer_project_id,bpk.keyword FROM buyer_project_keywords bpk
       JOIN buyer_projects bp ON bp.id=bpk.buyer_project_id
       WHERE bp.organization_id=? ORDER BY bpk.rowid`,
      organizationId,
    ),
    "keyword",
  );
  return projects.map((project) => ({
    ...project,
    sectors: sectors.get(project.id) ?? [],
    provinces: provinces.get(project.id) ?? [],
    keywords: keywords.get(project.id) ?? [],
    can_manage: canManage,
  }));
};

export function workspace(user: User): WorkspaceData {
  const organization = organizationFor(user.id);
  if (!organization)
    throw new AppError(
      "Your account is not connected to an organization. Contact your administrator.",
      500,
    );
  const memberships =
    user.role === "buyer"
      ? all<Access>("SELECT * FROM access WHERE buyer_id=?", user.id)
      : [];
  const membershipByDeal = new Map(
    memberships.map((member) => [member.deal_id, member]),
  );
  const organizationRoles = new Map(
    all<{ organization_id: string; role: OrganizationMemberRole }>(
      "SELECT organization_id,role FROM organization_members WHERE user_id=? AND status='active'",
      user.id,
    ).map((member) => [member.organization_id, member.role]),
  );
  const rolesForDeal = (deal: Deal) =>
    [deal.owner_organization_id, deal.advisor_organization_id]
      .map((organizationId) =>
        organizationId ? organizationRoles.get(organizationId) : undefined,
      )
      .filter((role): role is OrganizationMemberRole => Boolean(role));
  const legacyDealAccess = (deal: Deal) => legacyDirectAccess(user, deal);
  const teamMemberForDeal = (deal: Deal) =>
    user.role !== "buyer" &&
    (rolesForDeal(deal).length > 0 || legacyDealAccess(deal));
  const canManageDeal = (deal: Deal) =>
    user.role !== "buyer" &&
    (rolesForDeal(deal).some((role) => role !== "viewer") ||
      legacyDealAccess(deal));
  const canManageOwnerSideForDeal = (deal: Deal) => {
    const role = deal.owner_organization_id
      ? organizationRoles.get(deal.owner_organization_id)
      : undefined;
    return (
      user.role !== "buyer" &&
      ((role !== undefined && role !== "viewer") ||
        (!deal.owner_organization_id && deal.owner_id === user.id))
    );
  };
  const qualifiedDiscoveryMinScore = qualifiedDiscoveryMinimumScore();
  const qualifiedDiscoveryMinVerificationStatus =
    qualifiedDiscoveryMinimumVerificationStatus();
  const qualifiedDiscoveryVerificationStatuses =
    qualifiedDiscoveryEligibleVerificationStatuses(
      qualifiedDiscoveryMinVerificationStatus,
    );
  const qualifiedDiscoveryVerificationStatusPlaceholders =
    qualifiedDiscoveryVerificationStatuses.map(() => "?").join(",");
  const qualifiedDiscoveryVerificationEligible =
    isEligibleBuyerOrganization(organization) &&
    verificationStatusMeets(
      organization.verification_status,
      qualifiedDiscoveryMinVerificationStatus,
    );
  const qualifiedDiscoveryMatches =
    user.role === "buyer" && qualifiedDiscoveryVerificationEligible
      ? qualifiedDiscoveryMatchesFor(
          organization.id,
          qualifiedDiscoveryMinScore,
          qualifiedDiscoveryMinVerificationStatus,
        )
      : new Map<string, QualifiedDiscoveryMatch>();
  const rawDeals = all<Deal & { owner_is_demo: number }>(
    `SELECT d.*,owner.is_demo owner_is_demo FROM deals d JOIN users owner ON owner.id=d.owner_id
    WHERE owner.is_demo=?
    AND ((d.owner_id=? AND d.owner_organization_id IS NULL) OR (d.advisor_id=? AND d.advisor_organization_id IS NULL)
      OR (?<>'buyer' AND EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id=? AND om.status='active' AND om.organization_id IN (d.owner_organization_id,d.advisor_organization_id)))
      OR (?='buyer' AND ((d.published=1 AND d.distribution_mode='qualified_discovery'
          AND ?=1
          AND EXISTS (
            SELECT 1 FROM deal_matches dm
            JOIN buyer_projects bp
              ON bp.id=dm.buyer_project_id
             AND bp.organization_id=dm.buyer_organization_id
            JOIN organizations buyer_discovery_organization
              ON buyer_discovery_organization.id=dm.buyer_organization_id
            WHERE dm.deal_id=d.id AND dm.buyer_organization_id=?
              AND buyer_discovery_organization.verification_status IN (${qualifiedDiscoveryVerificationStatusPlaceholders})
              AND dm.eligible=1 AND dm.score>=? AND bp.status='active'
          ))
        OR d.id IN (SELECT deal_id FROM access WHERE buyer_id=?)
        OR EXISTS (
          SELECT 1 FROM deal_outreach o
          JOIN deal_outreach_recipients dor ON dor.outreach_id=o.id
          WHERE o.deal_id=d.id AND dor.buyer_organization_id=?
            AND dor.status IN ('sent','viewed','pursued','passed')
        ))))
    ORDER BY d.created_at DESC,d.title`,
    user.is_demo,
    user.id,
    user.id,
    user.role,
    user.id,
    user.role,
    qualifiedDiscoveryVerificationEligible ? 1 : 0,
    organization.id,
    ...qualifiedDiscoveryVerificationStatuses,
    qualifiedDiscoveryMinScore,
    user.id,
    organization.id,
  );
  const deals = rawDeals.map((d) => {
    const { owner_is_demo: _, ...deal } = d;
    const member = membershipByDeal.get(d.id),
      managing = canManageDeal(d),
      teamMember = teamMemberForDeal(d),
      allowed = teamMember || member?.status === "approved",
      discoveryMatch = qualifiedDiscoveryMatches.get(d.id);
    return {
      ...deal,
      company_name: allowed ? d.company_name : "Confidential company",
      city: allowed ? d.city : "",
      employees: allowed ? d.employees : 0,
      founded: allowed ? d.founded : 0,
      confidential_summary: allowed ? d.confidential_summary : "",
      management_transition: allowed ? d.management_transition : "",
      reason_for_transaction: allowed ? d.reason_for_transaction : "",
      owner_id: allowed ? d.owner_id : "",
      advisor_id: allowed ? d.advisor_id : null,
      owner_organization_id: allowed ? d.owner_organization_id : null,
      advisor_organization_id: allowed ? d.advisor_organization_id : null,
      created_by_user_id: allowed ? d.created_by_user_id : null,
      can_manage: managing,
      can_manage_owner_side: canManageOwnerSideForDeal(d),
      has_access: allowed,
      preview_only: false,
      access_status: member?.status || "none",
      ...(discoveryMatch
        ? {
            match_score: discoveryMatch.score,
            match_reasons: discoveryMatch.match_reasons,
            matched_project_id: discoveryMatch.buyer_project_id,
            matched_project_name: discoveryMatch.buyer_project_name,
          }
        : match(user, d)),
    };
  });
  const ids = new Set(deals.map((d) => d.id));
  const previewIds = new Set(
    deals.filter((d) => d.preview_only).map((d) => d.id),
  );
  const rawDealById = new Map(rawDeals.map((d) => [d.id, d]));
  const accessibleIds = new Set(
    deals.filter((d) => d.has_access).map((d) => d.id),
  );
  const dealFinancials = all<DealFinancial>(
    `SELECT * FROM deal_financials
     ORDER BY fiscal_year DESC,
       CASE period_type WHEN 'annual' THEN 1 WHEN 'trailing_twelve_months' THEN 2 ELSE 3 END`,
  ).filter(
    (financial) =>
      ids.has(financial.deal_id) && accessibleIds.has(financial.deal_id),
  );
  const teamMember = (id: string) => {
    const deal = rawDealById.get(id);
    return !!deal && !previewIds.has(id) && teamMemberForDeal(deal);
  };
  const has = (id: string) => accessibleIds.has(id);
  const activeThread = (id: string, buyerId: string) =>
    !previewIds.has(id) &&
    (teamMember(id) ||
      (buyerId === user.id &&
        !["denied", "revoked"].includes(
          membershipByDeal.get(id)?.status || "denied",
        )));
  const access = all<Access>(
    "SELECT a.*,u.name,u.company,u.email FROM access a JOIN users u ON u.id=a.buyer_id ORDER BY a.created_at DESC",
  ).filter(
    (a) =>
      ids.has(a.deal_id) &&
      !previewIds.has(a.deal_id) &&
      (teamMember(a.deal_id) || a.buyer_id === user.id),
  );
  const visibleAccessIds = new Set(access.map((entry) => entry.id));
  const electronicSignatureEnvelopes = visibleAccessIds.size
    ? all<ElectronicSignatureEnvelope>(
        `SELECT id,access_id,deal_id,buyer_id,provider_name,status,buyer_signed_at,
           completed_at,failure_reason,created_at,updated_at
         FROM electronic_signature_envelopes
         WHERE access_id IN (${[...visibleAccessIds].map(() => "?").join(",")})
         ORDER BY created_at DESC,rowid DESC`,
        ...visibleAccessIds,
      )
    : [];
  const documents = all<
    Omit<Document, "watermark_enabled"> & { watermark_enabled: number }
  >(
    "SELECT d.id,d.deal_id,d.name,d.category,d.size,d.version,d.audience,d.buyer_id,d.watermark_enabled,d.uploaded_by,d.created_at,u.name uploader_name,p.title deal_title FROM documents d JOIN users u ON u.id=d.uploaded_by JOIN deals p ON p.id=d.deal_id ORDER BY d.created_at DESC",
  )
    .filter((doc) => {
      const deal = rawDealById.get(doc.deal_id);
      return (
        !!deal &&
        !previewIds.has(doc.deal_id) &&
        canReadDocumentWithMembership(
          user,
          deal,
          doc,
          membershipByDeal.get(doc.deal_id),
          teamMemberForDeal(deal),
        )
      );
    })
    .map((document) => ({
      ...document,
      watermark_enabled: Boolean(document.watermark_enabled),
    }));
  const messages = all<Message>(
    "SELECT m.*,u.name sender_name,u.role sender_role,d.title deal_title,b.name buyer_name FROM messages m JOIN users u ON u.id=m.sender_id JOIN users b ON b.id=m.buyer_id JOIN deals d ON d.id=m.deal_id ORDER BY m.created_at,m.rowid",
  ).filter((m) => ids.has(m.deal_id) && activeThread(m.deal_id, m.buyer_id));
  const teamDealIds = rawDeals
    .filter((deal) => teamMemberForDeal(deal))
    .map((deal) => deal.id);
  const dealInternalNotes =
    user.role !== "buyer" && teamDealIds.length
      ? all<DealInternalNote>(
          `SELECT n.*,COALESCE(u.name,'Former team member') author_name,u.role author_role
           FROM deal_internal_notes n
           LEFT JOIN users u ON u.id=n.author_user_id
           WHERE n.deal_id IN (${teamDealIds.map(() => "?").join(",")})
           ORDER BY n.created_at DESC,n.rowid DESC`,
          ...teamDealIds,
        )
      : undefined;
  const tasks = all<Task>(
    "SELECT t.*,d.title deal_title FROM tasks t JOIN deals d ON d.id=t.deal_id ORDER BY t.due_date",
  ).filter(
    (t) =>
      ids.has(t.deal_id) &&
      (teamMember(t.deal_id) || (has(t.deal_id) && t.buyer_id === user.id)),
  );
  const offers = all<Offer>(
    "SELECT o.*,u.company buyer_name FROM offers o JOIN users u ON u.id=o.buyer_id ORDER BY o.created_at DESC",
  ).filter(
    (o) =>
      ids.has(o.deal_id) &&
      (teamMember(o.deal_id) || (has(o.deal_id) && o.buyer_id === user.id)),
  );
  const activity = all<Activity>(
    "SELECT a.*,u.name actor_name,d.title deal_title FROM activity a JOIN users u ON u.id=a.actor_id JOIN deals d ON d.id=a.deal_id ORDER BY a.created_at DESC,a.rowid DESC LIMIT 200",
  ).filter(
    (a) => teamMember(a.deal_id) || (has(a.deal_id) && a.actor_id === user.id),
  );
  const advisors = all<WorkspaceData["advisors"][number]>(
    "SELECT id,name,company,province,bio FROM users WHERE role='advisor' AND (is_demo=0 OR ?=1)",
    user.is_demo && process.env.ALLOW_DEMO === "true" ? 1 : 0,
  );
  const notifications = notificationsForUser(db(), user.id);
  const notificationUnreadCount = notificationUnreadCountForUser(db(), user.id);
  const notificationPreferences = notificationPreferencesForUser(db(), user.id);
  const buyerProjectsEnabled = isEligibleBuyerOrganization(organization);
  const canManageBuyerProjects =
    buyerProjectsEnabled && organization.membership_role !== "viewer";
  const managedDealIds = rawDeals
    .filter((deal) => canManageDeal(deal))
    .map((deal) => deal.id);
  const teaserSafetyReviews = managedDealIds.length
    ? all<
        Omit<
          TeaserSafetyReview,
          | "findings"
          | "investment_highlights"
          | "missing_financials"
          | "external_data_processing"
        > & {
          findings_json: string;
          investment_highlights_json: string;
          missing_financials_json: string;
          external_data_processing: number;
          review_count: number;
          review_rank: number;
        }
      >(
        `WITH ranked_reviews AS (
           SELECT r.*,u.name requested_by_name,
             COUNT(*) OVER (PARTITION BY r.deal_id) review_count,
             ROW_NUMBER() OVER (
               PARTITION BY r.deal_id
               ORDER BY r.created_at DESC,r.rowid DESC
             ) review_rank
           FROM teaser_safety_reviews r
           JOIN users u ON u.id=r.requested_by_user_id
           WHERE r.deal_id IN (${managedDealIds.map(() => "?").join(",")})
         )
         SELECT * FROM ranked_reviews
         WHERE review_rank=1
         ORDER BY created_at DESC`,
        ...managedDealIds,
      ).map(
        ({
          findings_json,
          investment_highlights_json,
          missing_financials_json,
          review_rank: _reviewRank,
          ...review
        }) => ({
          ...review,
          external_data_processing: Boolean(review.external_data_processing),
          findings: JSON.parse(findings_json),
          investment_highlights: JSON.parse(investment_highlights_json),
          missing_financials: JSON.parse(missing_financials_json),
        }),
      )
    : undefined;
  const dealMatches =
    user.role === "buyer" ? undefined : dealMatchesForDeals(managedDealIds);
  const dealOutreach = dealOutreachFor(user, organization.id, managedDealIds);
  const introductionRequests = introductionRequestsFor(
    user,
    organization.id,
    managedDealIds,
  );
  const buyerFunnels =
    user.role !== "buyer" && managedDealIds.length
      ? buyerFunnelsForDeals(db(), managedDealIds)
      : undefined;
  const transactionAttributions =
    user.role !== "buyer" && managedDealIds.length
      ? transactionAttributionsForDeals(db(), managedDealIds)
      : undefined;
  const dealManagerMarketplaceAnalytics = buyerFunnels?.map((funnel) =>
    deriveDealManagerMarketplaceAnalytics(
      funnel,
      rawDealById.get(funnel.deal_id)?.title ?? "Private mandate",
    ),
  );
  const buyerMarketplaceAnalytics =
    user.role === "buyer" && buyerProjectsEnabled
      ? buyerMarketplaceAnalyticsFor(db(), organization.id)
      : undefined;
  const platformAdmin = isPlatformAdmin(user);
  const buyerVerificationProfile = isEligibleBuyerOrganization(organization)
    ? buyerVerificationProfileFor(organization)
    : undefined;
  const buyerFirmProfile = isEligibleBuyerOrganization(organization)
    ? buyerFirmProfileFor(organization)
    : undefined;
  const publicNetworkProfile = publicOrganizationProfileFor(organization);
  const closedTransactions = isEligibleBuyerOrganization(organization)
    ? closedTransactionsForOrganization(organization)
    : [];
  return {
    user,
    organization,
    organization_members: organizationMembers(organization.id),
    buyer_projects: buyerProjectsEnabled
      ? buyerProjectsFor(organization.id, canManageBuyerProjects)
      : [],
    can_manage_buyer_projects: canManageBuyerProjects,
    deals,
    teaser_safety: teaserSafetyCapability(),
    ...(teaserSafetyReviews
      ? { teaser_safety_reviews: teaserSafetyReviews }
      : {}),
    ...(dealMatches ? { deal_matches: dealMatches } : {}),
    deal_outreach: dealOutreach,
    introduction_requests: introductionRequests,
    ...(buyerFunnels ? { buyer_funnels: buyerFunnels } : {}),
    ...(transactionAttributions
      ? { transaction_attributions: transactionAttributions }
      : {}),
    ...(dealManagerMarketplaceAnalytics
      ? { deal_manager_marketplace_analytics: dealManagerMarketplaceAnalytics }
      : {}),
    ...(buyerMarketplaceAnalytics
      ? { buyer_marketplace_analytics: buyerMarketplaceAnalytics }
      : {}),
    ...(dealInternalNotes ? { deal_internal_notes: dealInternalNotes } : {}),
    qualified_discovery_min_score: qualifiedDiscoveryMinScore,
    qualified_discovery_min_verification_status:
      qualifiedDiscoveryMinVerificationStatus,
    deal_financials: dealFinancials,
    access,
    electronic_signature: electronicSignatureCapability(),
    electronic_signature_envelopes: electronicSignatureEnvelopes,
    documents,
    messages,
    tasks,
    offers,
    activity,
    notifications,
    notification_unread_count: notificationUnreadCount,
    notification_preferences: notificationPreferences,
    ...(buyerVerificationProfile
      ? { buyer_verification_profile: buyerVerificationProfile }
      : {}),
    ...(buyerFirmProfile ? { buyer_firm_profile: buyerFirmProfile } : {}),
    ...(publicNetworkProfile
      ? { public_network_profile: publicNetworkProfile }
      : {}),
    closed_transactions: closedTransactions,
    is_platform_admin: platformAdmin,
    ...(platformAdmin
      ? {
          verification_admin_queue: verificationAdminQueue(user),
          verification_reviews: verificationReviews(user),
          closed_transaction_review_queue: closedTransactionReviewQueue(user),
        }
      : {}),
    advisors,
    demo: !!user.is_demo,
  };
}

export function mutate(
  user: User,
  input: unknown,
): { id?: string; message: string } {
  const envelope = parse(
    z.object({
      action: text(),
      data: z.record(z.string(), z.unknown()).default({}),
    }),
    input,
  );
  const { action, data } = envelope;
  limit(`mutation:${user.id}`, 180, 60);
  if (action === "setNotificationRead") {
    const p = parse(
      z.object({ notification_id: idSchema, read: z.boolean() }),
      data,
    );
    const result = run(
      `UPDATE notifications
       SET read_at=CASE WHEN ?=1 THEN COALESCE(read_at,CURRENT_TIMESTAMP) ELSE NULL END
       WHERE id=? AND user_id=?
         AND ((?=1 AND read_at IS NULL) OR (?=0 AND read_at IS NOT NULL))`,
      p.read ? 1 : 0,
      p.notification_id,
      user.id,
      p.read ? 1 : 0,
      p.read ? 1 : 0,
    );
    if (
      !result.changes &&
      !one(
        "SELECT id FROM notifications WHERE id=? AND user_id=?",
        p.notification_id,
        user.id,
      )
    )
      throw new AppError("Notification not found.", 404);
    return {
      message: p.read
        ? "Notification marked read."
        : "Notification marked unread.",
    };
  }
  if (action === "markAllNotificationsRead") {
    run(
      "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL",
      user.id,
    );
    return { message: "Notifications marked read." };
  }
  if (action === "notificationPreferences") {
    const preferenceSchema = z.partialRecord(
      z.enum(NOTIFICATION_TYPES),
      z.enum(NOTIFICATION_FREQUENCIES),
    );
    const p = parse(z.object({ preferences: preferenceSchema }), data);
    saveNotificationPreferences(
      db(),
      user.id,
      p.preferences as Partial<NotificationPreferences>,
    );
    return { message: "Notification preferences saved." };
  }
  if (action === "createClosedTransaction") {
    const organization = organizationFor(user.id);
    if (
      !organization ||
      !isEligibleBuyerOrganization(organization) ||
      !organization.can_manage
    )
      throw new AppError(
        "Only buyer organization owners and administrators can add transaction history.",
        403,
      );
    const p = parse(
      z.object({
        industry: text(2, 160),
        province: z.enum(PROVINCES),
        enterprise_value: optionalAmount,
        closed_date: closedDate,
        description: text(10, 2000),
      }),
      data,
    );
    const id = randomUUID();
    run(
      `INSERT INTO closed_transactions(
         id,buyer_organization_id,industry,province,enterprise_value,
         closed_date,description,created_by_user_id
       ) VALUES(?,?,?,?,?,?,?,?)`,
      id,
      organization.id,
      p.industry,
      p.province,
      p.enterprise_value,
      p.closed_date,
      p.description,
      user.id,
    );
    return {
      id,
      message:
        "Transaction added as self-reported history and sent for platform review.",
    };
  }
  if (action === "verifyClosedTransaction") {
    if (!isPlatformAdmin(user))
      throw new AppError(
        "Only platform verification reviewers can verify transaction history.",
        403,
      );
    const p = parse(z.object({ transaction_id: idSchema }), data);
    const database = db();
    inImmediateTransaction(database, () => {
      const target = database
        .prepare(
          `SELECT ct.id
           FROM closed_transactions ct
           WHERE ct.id=? AND ct.verified=0
             AND EXISTS (
               SELECT 1
               FROM organization_members realm_owner_members
               JOIN users realm_owner ON realm_owner.id=realm_owner_members.user_id
               WHERE realm_owner_members.organization_id=ct.buyer_organization_id
                 AND realm_owner_members.role='owner'
                 AND realm_owner_members.status='active'
                 AND realm_owner.is_demo=?
             )
             AND NOT EXISTS (
               SELECT 1
               FROM organization_members cross_realm_members
               JOIN users cross_realm_user
                 ON cross_realm_user.id=cross_realm_members.user_id
               WHERE cross_realm_members.organization_id=ct.buyer_organization_id
                 AND cross_realm_members.status='active'
                 AND cross_realm_user.is_demo<>?
             )
             AND NOT EXISTS (
               SELECT 1 FROM organization_members reviewer_membership
               WHERE reviewer_membership.organization_id=ct.buyer_organization_id
                 AND reviewer_membership.user_id=?
                 AND reviewer_membership.status='active'
             )`,
        )
        .get(p.transaction_id, user.is_demo, user.is_demo, user.id);
      if (!target)
        throw new AppError(
          "Transaction record is unavailable or has already been reviewed.",
          404,
        );
      const updated = database
        .prepare(
          `UPDATE closed_transactions
           SET verified=1,verified_by_user_id=?,verified_at=CURRENT_TIMESTAMP,
             updated_at=CURRENT_TIMESTAMP
           WHERE id=? AND verified=0`,
        )
        .run(user.id, p.transaction_id);
      if (updated.changes !== 1)
        throw new AppError(
          "Transaction record was already reviewed. Refresh and try again.",
          409,
        );
    });
    return { message: "Transaction history verified by Succera." };
  }
  if (action === "updateBuyerFirmProfile") {
    const organization = organizationFor(user.id);
    if (
      !organization ||
      !isEligibleBuyerOrganization(organization) ||
      !organization.can_manage
    )
      throw new AppError(
        "Only buyer organization owners and administrators can update the seller-facing firm profile.",
        403,
      );
    const profile = parse(
      z.object({
        fund_structure: text(0, 2000),
        financing_profile: text(0, 3000),
        revision: z.coerce.number().int().min(1),
        self_reported_acquisition_count: z.preprocess(
          (value) =>
            value === "" || value === undefined || value === null
              ? null
              : value,
          z.coerce.number().int().min(0).max(10_000).nullable(),
        ),
      }),
      data,
    );
    const database = db();
    inImmediateTransaction(database, () => {
      const updated = database
        .prepare(
          `UPDATE buyer_firm_profiles SET
             fund_structure=?,financing_profile=?,
             self_reported_acquisition_count=?,updated_by_user_id=?,
             revision=revision+1,updated_at=CURRENT_TIMESTAMP
           WHERE organization_id=? AND revision=?`,
        )
        .run(
          profile.fund_structure,
          profile.financing_profile,
          profile.self_reported_acquisition_count,
          user.id,
          organization.id,
          profile.revision,
        );
      if (!updated.changes)
        throw new AppError(
          "This firm profile changed in another session. Refresh and try again.",
          409,
        );
    });
    return { message: "Seller-facing firm profile saved." };
  }
  if (action === "updatePublicNetworkProfile") {
    const organization = organizationFor(user.id);
    if (!organization || !organization.can_manage)
      throw new AppError(
        "Only organization owners and administrators can update the public network profile.",
        403,
      );
    const profile = parse(
      z.object({
        is_public: z.boolean(),
        headline: text(0, 160),
        public_description: text(0, 4000),
        show_website: z.boolean(),
        show_province: z.boolean(),
        show_verified_transactions: z.boolean(),
        industries: publicIndustryList,
        locations: publicLocationList,
        revision: z.coerce.number().int().min(1),
      }),
      data,
    );
    if (
      new Set(profile.industries).size !== profile.industries.length ||
      new Set(profile.locations).size !== profile.locations.length
    )
      throw new AppError("Public industries and locations must not repeat.");
    const publicProfileEligible =
      organization.organization_type === "advisor" ||
      isEligibleBuyerOrganization(organization);
    if (profile.is_public && !publicProfileEligible)
      throw new AppError(
        "Public network profiles are available only to acquisition firms and M&A advisors.",
        403,
      );
    if (
      profile.is_public &&
      (!profile.headline.trim() || !profile.public_description.trim())
    )
      throw new AppError(
        "Add a public headline and description before publishing the profile.",
      );
    const database = db();
    inImmediateTransaction(database, () => {
      const updated = database
        .prepare(
          `UPDATE organization_public_profiles SET
             is_public=?,headline=?,public_description=?,show_website=?,
             show_province=?,show_verified_transactions=?,updated_by_user_id=?,
             revision=revision+1,updated_at=CURRENT_TIMESTAMP
           WHERE organization_id=? AND revision=?`,
        )
        .run(
          profile.is_public ? 1 : 0,
          profile.headline,
          profile.public_description,
          profile.show_website ? 1 : 0,
          profile.show_province ? 1 : 0,
          profile.show_verified_transactions ? 1 : 0,
          user.id,
          organization.id,
          profile.revision,
        );
      if (!updated.changes)
        throw new AppError(
          "This public network profile changed in another session. Refresh and try again.",
          409,
        );
      database
        .prepare(
          "DELETE FROM organization_public_industries WHERE organization_id=?",
        )
        .run(organization.id);
      const insertIndustry = database.prepare(
        "INSERT INTO organization_public_industries(organization_id,industry) VALUES(?,?)",
      );
      for (const industry of profile.industries)
        insertIndustry.run(organization.id, industry);
      database
        .prepare(
          "DELETE FROM organization_public_locations WHERE organization_id=?",
        )
        .run(organization.id);
      const insertLocation = database.prepare(
        "INSERT INTO organization_public_locations(organization_id,province) VALUES(?,?)",
      );
      for (const province of profile.locations)
        insertLocation.run(organization.id, province);
    });
    return { message: "Public network profile saved." };
  }
  if (action === "setClosedTransactionPublic") {
    const organization = organizationFor(user.id);
    if (!organization || !organization.can_manage)
      throw new AppError(
        "Only organization owners and administrators can publish transaction history.",
        403,
      );
    const p = parse(
      z.object({ transaction_id: idSchema, public_opt_in: z.boolean() }),
      data,
    );
    const database = db();
    inImmediateTransaction(database, () => {
      const target = database
        .prepare(
          `SELECT ct.id,ct.public_slug,ct.verified,ct.industry,ct.province,
             profile.is_public,profile.show_verified_transactions
           FROM closed_transactions ct
           LEFT JOIN organization_public_profiles profile
             ON profile.organization_id=ct.buyer_organization_id
           WHERE ct.id=? AND ct.buyer_organization_id=?`,
        )
        .get(p.transaction_id, organization.id) as
        | {
            id: string;
            public_slug: string | null;
            verified: number;
            industry: string;
            province: string;
            is_public: number | null;
            show_verified_transactions: number | null;
          }
        | undefined;
      if (!target)
        throw new AppError(
          "Transaction record is not available to your organization.",
          404,
        );
      if (!p.public_opt_in) {
        database
          .prepare(
            `UPDATE closed_transactions
             SET public_opt_in=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          )
          .run(target.id);
        return;
      }
      if (!isEligibleBuyerOrganization(organization))
        throw new AppError(
          "Only eligible buyer organizations can publish transaction history.",
          403,
        );
      if (!target.verified)
        throw new AppError(
          "Only independently verified transactions can be published.",
          409,
        );
      if (!target.is_public || !target.show_verified_transactions)
        throw new AppError(
          "Enable the public profile and verified transactions before publishing transaction history.",
          409,
        );
      const slug =
        target.public_slug ||
        `${slugPart(target.industry)}-${slugPart(target.province)}-${slugPart(
          target.id,
        ).slice(0, 32)}`;
      database
        .prepare(
          `UPDATE closed_transactions
           SET public_slug=?,public_opt_in=1,updated_at=CURRENT_TIMESTAMP
           WHERE id=? AND verified=1`,
        )
        .run(slug, target.id);
    });
    return {
      message: p.public_opt_in
        ? "Verified transaction published to the public network."
        : "Transaction removed from the public network.",
    };
  }
  if (action === "updateBuyerVerificationProfile") {
    const organization = organizationFor(user.id);
    if (
      !organization ||
      !isEligibleBuyerOrganization(organization) ||
      !organization.can_manage
    )
      throw new AppError(
        "Only buyer organization owners and administrators can update verification information.",
        403,
      );
    const profile = validateBuyerVerificationProfile(
      parse(buyerVerificationProfileSchema, data),
    );
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          `INSERT INTO buyer_verification_profiles(
             organization_id,legal_name,principals,acquisition_history,
             capital_source,min_equity_check,max_equity_check,
             financing_approach,updated_by_user_id
           ) VALUES(?,?,?,?,?,?,?,?,?)
           ON CONFLICT(organization_id) DO UPDATE SET
             legal_name=excluded.legal_name,
             principals=excluded.principals,
             acquisition_history=excluded.acquisition_history,
             capital_source=excluded.capital_source,
             min_equity_check=excluded.min_equity_check,
             max_equity_check=excluded.max_equity_check,
             financing_approach=excluded.financing_approach,
             submitted_at=NULL,
             submitted_by_user_id=NULL,
             updated_by_user_id=excluded.updated_by_user_id,
             updated_at=CURRENT_TIMESTAMP`,
        )
        .run(
          organization.id,
          profile.legal_name,
          profile.principals,
          profile.acquisition_history,
          profile.capital_source,
          profile.min_equity_check,
          profile.max_equity_check,
          profile.financing_approach,
          user.id,
        );
      database
        .prepare(
          `UPDATE organizations SET website=?,organization_type=?,
             verification_status=CASE
               WHEN verification_status IN ('unverified','rejected')
                 THEN verification_status
               ELSE 'unverified'
             END,
             updated_at=CURRENT_TIMESTAMP
           WHERE id=?`,
        )
        .run(profile.website, profile.buyer_type, organization.id);
    });
    return {
      message:
        organization.verification_status === "unverified" ||
        organization.verification_status === "rejected"
          ? "Verification profile saved."
          : "Verification profile saved. Prior verification was reset for review.",
    };
  }
  if (action === "submitBuyerVerification") {
    const organization = organizationFor(user.id);
    if (
      !organization ||
      !isEligibleBuyerOrganization(organization) ||
      !organization.can_manage
    )
      throw new AppError(
        "Only buyer organization owners and administrators can submit verification information.",
        403,
      );
    const profile = buyerVerificationProfileFor(organization);
    if (!profile)
      throw new AppError("Complete the verification profile first.", 409);
    validateBuyerVerificationProfile(
      parse(buyerVerificationProfileSchema, profile),
    );
    const result = run(
      `UPDATE buyer_verification_profiles
       SET submitted_at=CURRENT_TIMESTAMP,submitted_by_user_id=?,
           submission_revision=submission_revision+1,
           updated_at=CURRENT_TIMESTAMP
       WHERE organization_id=? AND submitted_at IS NULL`,
      user.id,
      organization.id,
    );
    if (!result.changes)
      throw new AppError(
        "This verification profile is already under review.",
        409,
      );
    return { message: "Verification profile submitted for internal review." };
  }
  if (action === "reviewBuyerVerification") {
    if (!isPlatformAdmin(user))
      throw new AppError(
        "Only platform verification reviewers can make this decision.",
        403,
      );
    const p = parse(
      z.object({
        organization_id: idSchema,
        submission_revision: z.coerce.number().int().positive(),
        decision: z.enum([
          "email_verified",
          "firm_verified",
          "capital_reviewed",
          "verified_acquirer",
          "rejected",
        ]),
        notes: text(3, 5000),
      }),
      data,
    );
    const target = one<{
      organization_id: string;
      organization_type: OrganizationType;
      verification_status: BuyerVerificationStatus;
      submitted_at: string | null;
      submission_revision: number;
    }>(
      `SELECT profile.organization_id,organization.organization_type,
         organization.verification_status,profile.submitted_at,
         profile.submission_revision
       FROM buyer_verification_profiles profile
       JOIN organizations organization ON organization.id=profile.organization_id
       JOIN organization_members realm_owner_members
         ON realm_owner_members.organization_id=profile.organization_id
        AND realm_owner_members.role='owner'
        AND realm_owner_members.status='active'
       JOIN users realm_owner ON realm_owner.id=realm_owner_members.user_id
       WHERE profile.organization_id=? AND realm_owner.is_demo=?
         AND NOT EXISTS (
           SELECT 1
           FROM organization_members cross_realm_members
           JOIN users cross_realm_user ON cross_realm_user.id=cross_realm_members.user_id
           WHERE cross_realm_members.organization_id=profile.organization_id
             AND cross_realm_members.status='active'
             AND cross_realm_user.is_demo<>?
         )`,
      p.organization_id,
      user.is_demo,
      user.is_demo,
    );
    if (!target || !isEligibleBuyerOrganizationType(target.organization_type))
      throw new AppError("Buyer verification profile not found.", 404);
    if (!target.submitted_at)
      throw new AppError(
        "This buyer has not submitted a profile for review.",
        409,
      );
    const database = db();
    inImmediateTransaction(database, () => {
      const claimed = database
        .prepare(
          `UPDATE buyer_verification_profiles
           SET submitted_at=NULL,submitted_by_user_id=NULL,
             updated_at=CURRENT_TIMESTAMP
           WHERE organization_id=? AND submitted_at IS NOT NULL
             AND submission_revision=?`,
        )
        .run(target.organization_id, p.submission_revision);
      if (!claimed.changes) {
        const current = database
          .prepare(
            `SELECT submitted_at,submission_revision
             FROM buyer_verification_profiles WHERE organization_id=?`,
          )
          .get(target.organization_id) as
          | { submitted_at: string | null; submission_revision: number }
          | undefined;
        throw new AppError(
          current?.submitted_at &&
            current.submission_revision !== p.submission_revision
            ? "This verification submission has been replaced. Refresh the review queue and try again."
            : "This verification submission was already reviewed.",
          409,
        );
      }
      database
        .prepare(
          `INSERT INTO verification_reviews(
             id,organization_id,reviewer_user_id,submission_revision,
             previous_status,decision,notes
           ) VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          target.organization_id,
          user.id,
          target.submission_revision,
          target.verification_status,
          p.decision,
          p.notes,
        );
      database
        .prepare(
          "UPDATE organizations SET verification_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .run(p.decision, target.organization_id);
    });
    return { message: "Buyer verification decision recorded." };
  }
  if (action === "profile") {
    const p = parse(
      z.object({
        name: text(2, 100),
        company: text(2, 160).optional(),
        province: z.union([z.enum(PROVINCES), z.literal("")]),
        bio: text(0, 2000),
        sectors: text(0, 500),
        min_revenue: amount,
        max_revenue: amount,
      }),
      data,
    );
    if (p.min_revenue > p.max_revenue)
      throw new AppError("Minimum revenue must not exceed maximum revenue.");
    if (
      p.sectors
        .split(",")
        .filter(Boolean)
        .some((s) => !SECTORS.includes(s))
    )
      throw new AppError("Select a supported industry.");
    const organization = organizationFor(user.id);
    if (p.company !== undefined && !organization?.can_manage)
      throw new AppError(
        "Only organization owners and administrators can update the firm name.",
        403,
      );
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          "UPDATE users SET name=?,province=?,bio=?,sectors=?,min_revenue=?,max_revenue=? WHERE id=?",
        )
        .run(
          p.name,
          p.province,
          p.bio,
          p.sectors,
          p.min_revenue,
          p.max_revenue,
          user.id,
        );
      if (p.company !== undefined && organization) {
        database
          .prepare(
            "UPDATE organizations SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          )
          .run(p.company, organization.id);
        database
          .prepare(
            "UPDATE users SET company=? WHERE id IN (SELECT user_id FROM organization_members WHERE organization_id=? AND status='active')",
          )
          .run(p.company, organization.id);
      }
    });
    return { message: "Profile saved." };
  }
  if (action === "organization") {
    const p = parse(
      z.object({
        name: text(2, 160),
        organization_type: z.enum(ORGANIZATION_TYPES),
        website: z.union([z.literal(""), websiteUrl]),
        province: z.union([z.enum(PROVINCES), z.literal("")]),
        description: text(0, 2000),
      }),
      data,
    );
    const organization = organizationFor(user.id);
    if (!organization || !organization.can_manage)
      throw new AppError(
        "Only organization owners and administrators can update firm settings.",
        403,
      );
    const verificationRelevantChange =
      p.name !== organization.name ||
      p.organization_type !== organization.organization_type ||
      p.website !== organization.website;
    const wasBuyerOrganization = isEligibleBuyerOrganization(organization);
    const remainsBuyerOrganization = isEligibleBuyerOrganizationType(
      p.organization_type,
    );
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          "UPDATE organizations SET name=?,organization_type=?,website=?,province=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .run(
          p.name,
          p.organization_type,
          p.website,
          p.province,
          p.description,
          organization.id,
        );
      database
        .prepare(
          "UPDATE users SET company=? WHERE id IN (SELECT user_id FROM organization_members WHERE organization_id=? AND status='active')",
        )
        .run(p.name, organization.id);
      if (remainsBuyerOrganization) {
        database
          .prepare(
            `INSERT OR IGNORE INTO buyer_verification_profiles(
               organization_id,legal_name,updated_by_user_id
             ) VALUES(?,?,?)`,
          )
          .run(organization.id, p.name, user.id);
        database
          .prepare(
            `INSERT OR IGNORE INTO buyer_firm_profiles(
               organization_id,updated_by_user_id
             ) VALUES(?,?)`,
          )
          .run(organization.id, user.id);
      }
      if (
        verificationRelevantChange &&
        (wasBuyerOrganization || remainsBuyerOrganization)
      ) {
        database
          .prepare(
            `UPDATE organizations SET
               verification_status=CASE
                 WHEN verification_status='rejected' THEN 'rejected'
                 ELSE 'unverified'
               END
             WHERE id=?`,
          )
          .run(organization.id);
        database
          .prepare(
            `UPDATE buyer_verification_profiles
             SET submitted_at=NULL,submitted_by_user_id=NULL,
               updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP
             WHERE organization_id=?`,
          )
          .run(user.id, organization.id);
      }
      if (wasBuyerOrganization && !remainsBuyerOrganization) {
        database
          .prepare(
            `UPDATE buyer_projects
             SET status='paused',updated_at=strftime('%Y-%m-%d %H:%M:%f','now')
             WHERE organization_id=? AND status='active'`,
          )
          .run(organization.id);
        recalculateBuyerOrganizationMatches(database, organization.id);
      }
    });
    return { message: "Firm settings saved." };
  }
  if (action === "password") {
    const p = parse(
      z.object({
        current: z.string().min(1).max(128),
        password: z.string().min(12).max(128),
      }),
      data,
    );
    if (user.is_demo)
      throw new AppError("Demo account passwords cannot be changed.");
    const stored = one<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id=?",
      user.id,
    )!;
    if (!verifyPassword(p.current, stored.password_hash))
      throw new AppError("Current password is incorrect.");
    run(
      "UPDATE users SET password_hash=? WHERE id=?",
      hashPassword(p.password),
      user.id,
    );
    run("DELETE FROM sessions WHERE user_id=?", user.id);
    return { message: "Password changed. Please sign in again." };
  }
  if (action === "createBuyerProject") return createBuyerProject(user, data);
  if (action === "updateBuyerProject") return updateBuyerProject(user, data);
  if (action === "setBuyerProjectStatus")
    return setBuyerProjectStatus(user, data);
  if (action === "updateDealMatchStatus") {
    const p = parse(
      z.object({
        deal_id: idSchema,
        match_ids: z.array(idSchema).min(1).max(100),
        status: z.enum(DEAL_MATCH_STATUSES),
      }),
      data,
    );
    const deal = getDeal(p.deal_id);
    requireManager(user, deal);
    const matchIds = [...new Set(p.match_ids)];
    const placeholders = matchIds.map(() => "?").join(",");
    const database = db();
    inImmediateTransaction(database, () => {
      const available = database
        .prepare(
          `SELECT dm.id,dm.buyer_project_id,dm.buyer_organization_id,dm.eligible
           FROM deal_matches dm
           JOIN buyer_projects bp ON bp.id=dm.buyer_project_id
            AND bp.organization_id=dm.buyer_organization_id
           JOIN organizations buyer_organization
             ON buyer_organization.id=dm.buyer_organization_id
           WHERE dm.deal_id=? AND dm.id IN (${placeholders})
             AND buyer_organization.organization_type IN (${BUYER_ORGANIZATION_TYPES.map(() => "?").join(",")})
             AND bp.status='active'`,
        )
        .all(p.deal_id, ...matchIds, ...BUYER_ORGANIZATION_TYPES) as {
        id: string;
        buyer_project_id: string;
        buyer_organization_id: string;
        eligible: number;
      }[];
      if (available.length !== matchIds.length)
        throw new AppError(
          "One or more recommendations are not available for this mandate.",
          404,
        );
      if (p.status === "selected" && available.some((match) => !match.eligible))
        throw new AppError(
          "Only eligible buyer recommendations can be selected.",
          409,
        );
      database
        .prepare(
          `UPDATE deal_matches SET status=?,updated_at=strftime('%Y-%m-%d %H:%M:%f','now')
           WHERE deal_id=? AND id IN (${placeholders})`,
        )
        .run(p.status, p.deal_id, ...matchIds);
      for (const match of available) {
        if (p.status === "selected" || p.status === "excluded")
          recordDealBuyerEvent(database, {
            dealId: p.deal_id,
            buyerOrganizationId: match.buyer_organization_id,
            buyerProjectId: match.buyer_project_id,
            eventType: p.status,
            sourceKey:
              p.status === "selected"
                ? `match-selection:${match.id}`
                : `match-exclusion:${match.id}`,
            createdByUserId: user.id,
          });
        recalculateDealMatch(database, p.deal_id, match.buyer_project_id);
      }
      audit(
        user,
        p.deal_id,
        `${statusTextForAudit(p.status)} ${matchIds.length} buyer recommendation${matchIds.length === 1 ? "" : "s"}`,
      );
    });
    return {
      message: `${matchIds.length} buyer recommendation${matchIds.length === 1 ? "" : "s"} updated.`,
    };
  }
  if (action === "createDeal") {
    if (user.role === "buyer")
      throw new AppError("Only owners and advisors can create mandates.", 403);
    const p = parse(dealCreateSchema, data);
    validateExpectedValueRange(p);
    const id = randomUUID(),
      financialId = randomUUID(),
      organization = organizationFor(user.id);
    if (!organization)
      throw new AppError(
        "Your account is not connected to an organization.",
        403,
      );
    if (organization.membership_role === "viewer")
      throw new AppError(
        "Read-only organization members cannot create mandates.",
        403,
      );
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          `INSERT INTO deals(
            id,title,company_name,sector,province,city,revenue,ebitda,asking_price,
            employees,founded,description,confidential_summary,owner_id,advisor_id,
            owner_organization_id,advisor_organization_id,created_by_user_id,
            transaction_type,ownership_percentage_available,seller_rollover_possible,
            seller_financing_possible,management_transition,reason_for_transaction,
            min_expected_value,max_expected_value,distribution_mode
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          p.title,
          p.company_name,
          p.sector,
          p.province,
          p.city,
          p.revenue,
          p.ebitda,
          p.asking_price,
          p.employees,
          p.founded,
          p.description,
          p.confidential_summary,
          user.id,
          user.role === "advisor" ? user.id : null,
          organization.id,
          user.role === "advisor" ? organization.id : null,
          user.id,
          p.transaction_type,
          p.ownership_percentage_available,
          p.seller_rollover_possible ? 1 : 0,
          p.seller_financing_possible ? 1 : 0,
          p.management_transition,
          p.reason_for_transaction,
          p.min_expected_value,
          p.max_expected_value,
          p.distribution_mode,
        );
      database
        .prepare(
          `INSERT INTO deal_financials(
            id,deal_id,fiscal_year,period_type,revenue,ebitda,gross_profit,is_projected
          ) VALUES(?,?,?,'annual',?,?,?,?)`,
        )
        .run(
          financialId,
          id,
          p.financial_year,
          p.revenue,
          p.ebitda,
          p.gross_profit,
          p.financial_is_projected ? 1 : 0,
        );
      recalculateDealMatches(database, id);
    });
    audit(user, id, "Created a private mandate");
    return {
      id,
      message:
        "Mandate created privately. Publish its anonymous teaser when ready.",
    };
  }
  const deal = getDeal(parse(idSchema, data.deal_id));
  const dealOwner = one<{ is_demo: number }>(
    "SELECT is_demo FROM users WHERE id=?",
    deal.owner_id,
  );
  if (!dealOwner || !!dealOwner.is_demo !== !!user.is_demo)
    throw new AppError("This deal is not available.", 404);
  if (action === "applyTeaserSafetySuggestion") {
    requireManager(user, deal);
    const reviewId = parse(idSchema, data.review_id);
    const database = db();
    inImmediateTransaction(database, () => {
      const currentDeal = database
        .prepare("SELECT * FROM deals WHERE id=?")
        .get(deal.id) as Deal | undefined;
      if (!currentDeal) throw new AppError("Deal not found.", 404);
      if (currentDeal.published)
        throw new AppError(
          "Make the teaser private before applying an assistant suggestion.",
          409,
        );
      const review = database
        .prepare(
          `SELECT id,input_sha256,suggested_teaser,applied_at
           FROM teaser_safety_reviews WHERE id=? AND deal_id=?`,
        )
        .get(reviewId, deal.id) as
        | {
            id: string;
            input_sha256: string;
            suggested_teaser: string;
            applied_at: string | null;
          }
        | undefined;
      if (!review) throw new AppError("Teaser safety review not found.", 404);
      if (review.applied_at)
        throw new AppError(
          "This teaser suggestion has already been applied.",
          409,
        );
      const historicalFinancialPeriods = (
        database
          .prepare(
            `SELECT COUNT(*) count FROM deal_financials
             WHERE deal_id=? AND is_projected=0`,
          )
          .get(deal.id) as { count: number }
      ).count;
      const currentInputSha256 = teaserSafetyReviewInputDigest({
        companyName: currentDeal.company_name,
        sector: currentDeal.sector,
        province: currentDeal.province,
        city: currentDeal.city,
        revenue: currentDeal.revenue,
        ebitda: currentDeal.ebitda,
        askingPrice: currentDeal.asking_price,
        employees: currentDeal.employees,
        founded: currentDeal.founded,
        transactionType: currentDeal.transaction_type,
        ownershipPercentageAvailable:
          currentDeal.ownership_percentage_available,
        sellerRolloverPossible: Boolean(currentDeal.seller_rollover_possible),
        description: currentDeal.description,
        historicalFinancialPeriods,
      });
      if (currentInputSha256 !== review.input_sha256)
        throw new AppError(
          "The mandate changed after this review. Run a new safety review before applying its suggestion.",
          409,
        );
      const applied = database
        .prepare(
          `UPDATE teaser_safety_reviews
           SET applied_at=CURRENT_TIMESTAMP,applied_by_user_id=?
           WHERE id=? AND deal_id=? AND applied_at IS NULL`,
        )
        .run(user.id, review.id, deal.id);
      if (applied.changes !== 1)
        throw new AppError(
          "This teaser suggestion has already been applied.",
          409,
        );
      database
        .prepare("UPDATE deals SET description=? WHERE id=?")
        .run(review.suggested_teaser, deal.id);
      recalculateDealMatches(database, deal.id);
    });
    audit(user, deal.id, "Applied a reviewed teaser safety suggestion");
    return {
      message:
        "Suggestion applied to the private teaser draft. Review and publish it separately when ready.",
    };
  }
  if (action === "upsertTransactionAttribution") {
    requireManager(user, deal);
    const optionalAttributionDate = z.preprocess(
      (value) =>
        value === "" || value === undefined || value === null ? null : value,
      closedDate.nullable(),
    );
    const p = parse(
      z.object({
        buyer_organization_id: idSchema,
        source: z.enum(TRANSACTION_ATTRIBUTION_SOURCES),
        introduction_date: closedDate,
        closed_date: optionalAttributionDate,
        enterprise_value: optionalAmount,
        revision: z.coerce.number().int().min(0),
      }),
      data,
    );
    if ((p.closed_date === null) !== (p.enterprise_value === null))
      throw new AppError(
        "Closing date and enterprise value must be recorded together.",
      );
    if (p.closed_date && p.closed_date < p.introduction_date)
      throw new AppError(
        "Closing date cannot be earlier than the introduction date.",
      );
    const database = db();
    const relationship = database
      .prepare(
        `SELECT 1 FROM deal_buyer_events
         WHERE deal_id=? AND buyer_organization_id=? LIMIT 1`,
      )
      .get(deal.id, p.buyer_organization_id);
    if (!relationship)
      throw new AppError("This buyer is not part of the deal funnel.", 404);
    if (
      p.closed_date &&
      !database
        .prepare(
          `SELECT 1 FROM deal_buyer_events
           WHERE deal_id=? AND buyer_organization_id=? AND event_type='closed'
           LIMIT 1`,
        )
        .get(deal.id, p.buyer_organization_id)
    )
      throw new AppError(
        "Record the Closed buyer-funnel milestone before adding closing details.",
        409,
      );
    const existing = database
      .prepare(
        `SELECT id,revision FROM transaction_attribution
         WHERE deal_id=? AND buyer_organization_id=?`,
      )
      .get(deal.id, p.buyer_organization_id) as
      { id: string; revision: number } | undefined;
    inImmediateTransaction(database, () => {
      if (existing) {
        const updated = database
          .prepare(
            `UPDATE transaction_attribution SET
               source=?,introduced_by_acquire=?,introduction_date=?,
               closed_date=?,enterprise_value=?,origin_event_id=NULL,
               updated_by_user_id=?,revision=revision+1,
               updated_at=strftime('%Y-%m-%d %H:%M:%f','now')
             WHERE id=? AND deal_id=? AND revision=?`,
          )
          .run(
            p.source,
            introducedByAcquireForSource(p.source) ? 1 : 0,
            p.introduction_date,
            p.closed_date,
            p.enterprise_value,
            user.id,
            existing.id,
            deal.id,
            p.revision,
          );
        if (updated.changes !== 1)
          throw new AppError(
            "This attribution record changed in another session. Refresh and try again.",
            409,
          );
      } else {
        if (p.revision !== 0)
          throw new AppError(
            "This attribution record changed in another session. Refresh and try again.",
            409,
          );
        const inserted = database
          .prepare(
            `INSERT INTO transaction_attribution(
               id,deal_id,buyer_organization_id,source,introduced_by_acquire,
               introduction_date,closed_date,enterprise_value,
               created_by_user_id,updated_by_user_id
             ) VALUES(?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(deal_id,buyer_organization_id) DO NOTHING`,
          )
          .run(
            randomUUID(),
            deal.id,
            p.buyer_organization_id,
            p.source,
            introducedByAcquireForSource(p.source) ? 1 : 0,
            p.introduction_date,
            p.closed_date,
            p.enterprise_value,
            user.id,
            user.id,
          );
        if (inserted.changes !== 1)
          throw new AppError(
            "This attribution record changed in another session. Refresh and try again.",
            409,
          );
      }
      audit(
        user,
        deal.id,
        `Updated transaction attribution: ${p.source.replaceAll("_", " ")}`,
      );
    });
    return { message: "Transaction attribution saved." };
  }
  if (action === "recordBuyerFunnelEvent") {
    requireManager(user, deal);
    const p = parse(
      z.object({
        buyer_organization_id: idSchema,
        buyer_project_id: idSchema.nullish(),
        event_type: z.enum(DEAL_BUYER_EVENT_TYPES),
      }),
      data,
    );
    const allowed: DealBuyerEventType[] = [
      "cim_shared",
      "ioi_received",
      "exclusive",
      "closed",
    ];
    if (!allowed.includes(p.event_type))
      throw new AppError(
        "This milestone is recorded by its existing workflow.",
      );
    const database = db();
    const relationship = database
      .prepare(
        `SELECT 1 FROM deal_buyer_events
         WHERE deal_id=? AND buyer_organization_id=? LIMIT 1`,
      )
      .get(deal.id, p.buyer_organization_id);
    if (!relationship)
      throw new AppError("This buyer is not part of the deal funnel.", 404);
    if (
      p.buyer_project_id &&
      !database
        .prepare(
          `SELECT 1 FROM buyer_projects
           WHERE id=? AND organization_id=?`,
        )
        .get(p.buyer_project_id, p.buyer_organization_id)
    )
      throw new AppError(
        "The acquisition project does not belong to this buyer.",
      );
    let inserted = false;
    inImmediateTransaction(database, () => {
      inserted = recordDealBuyerEvent(database, {
        dealId: deal.id,
        buyerOrganizationId: p.buyer_organization_id,
        buyerProjectId:
          p.buyer_project_id ??
          bestBuyerProjectForDeal(database, deal.id, p.buyer_organization_id)
            ?.buyer_project_id ??
          null,
        eventType: p.event_type,
        sourceKey: `manual:${p.event_type}`,
        createdByUserId: user.id,
      });
      if (inserted)
        audit(
          user,
          deal.id,
          `Recorded buyer milestone: ${p.event_type.replaceAll("_", " ")}`,
        );
      if (inserted && p.event_type === "ioi_received")
        notifyUsers(database, {
          userIds: dealManagerUserIds(database, deal.id),
          type: "ioi_received",
          title: "IOI received",
          body: `${deal.title} has advanced to the IOI stage.`,
          href: `/app/deals/${deal.id}`,
          dealId: deal.id,
          actorUserId: user.id,
          sourceKey: `funnel:${deal.id}:${p.buyer_organization_id}:ioi_received`,
        });
    });
    return {
      message: inserted
        ? "Buyer milestone recorded."
        : "Milestone already recorded.",
    };
  }
  if (action === "shareTeaser") {
    requireManager(user, deal);
    const p = parse(
      z.object({
        match_ids: z.array(idSchema).min(1).max(100),
        subject: text(1, 200),
        message: text(1, 5000),
      }),
      data,
    );
    const matchIds = [...new Set(p.match_ids)];
    const placeholders = matchIds.map(() => "?").join(",");
    const database = db();
    const outreachId = randomUUID();
    inImmediateTransaction(database, () => {
      const recipients = database
        .prepare(
          `SELECT dm.id,dm.buyer_project_id,dm.buyer_organization_id,
             bp.name buyer_project_name
           FROM deal_matches dm
           JOIN buyer_projects bp
             ON bp.id=dm.buyer_project_id
            AND bp.organization_id=dm.buyer_organization_id
           JOIN organizations buyer_organization
             ON buyer_organization.id=dm.buyer_organization_id
           WHERE dm.deal_id=? AND dm.id IN (${placeholders})
             AND dm.eligible=1 AND dm.status='selected'
             AND buyer_organization.organization_type IN (${BUYER_ORGANIZATION_TYPES.map(() => "?").join(",")})
             AND bp.status='active'`,
        )
        .all(deal.id, ...matchIds, ...BUYER_ORGANIZATION_TYPES) as {
        id: string;
        buyer_project_id: string;
        buyer_organization_id: string;
        buyer_project_name: string;
      }[];
      if (recipients.length !== matchIds.length)
        throw new AppError(
          "Every recipient must be an eligible selected recommendation.",
          409,
        );
      const duplicate = database
        .prepare(
          `SELECT 1 FROM deal_outreach existing_outreach
           JOIN deal_outreach_recipients existing_recipient
             ON existing_recipient.outreach_id=existing_outreach.id
           WHERE existing_outreach.deal_id=?
             AND existing_recipient.buyer_project_id IN (${recipients.map(() => "?").join(",")})
             AND existing_recipient.status<>'expired' LIMIT 1`,
        )
        .get(
          deal.id,
          ...recipients.map((recipient) => recipient.buyer_project_id),
        );
      if (duplicate)
        throw new AppError(
          "One or more selected projects already received this opportunity.",
          409,
        );
      database
        .prepare(
          "INSERT INTO deal_outreach(id,deal_id,sender_user_id,subject,message) VALUES(?,?,?,?,?)",
        )
        .run(outreachId, deal.id, user.id, p.subject, p.message);
      const insertRecipient = database.prepare(
        `INSERT INTO deal_outreach_recipients(
          id,outreach_id,buyer_organization_id,buyer_project_id,status,sent_at
        ) VALUES(?,?,?,?,'sent',CURRENT_TIMESTAMP)`,
      );
      for (const recipient of recipients) {
        const recipientId = randomUUID();
        insertRecipient.run(
          recipientId,
          outreachId,
          recipient.buyer_organization_id,
          recipient.buyer_project_id,
        );
        recordDealBuyerEvent(database, {
          dealId: deal.id,
          buyerOrganizationId: recipient.buyer_organization_id,
          buyerProjectId: recipient.buyer_project_id,
          eventType: "teaser_sent",
          sourceKey: `outreach:${recipientId}:sent`,
          createdByUserId: user.id,
        });
        recordInitialTransactionAttribution(database, {
          dealId: deal.id,
          buyerOrganizationId: recipient.buyer_organization_id,
          source: "acquire_match",
          createdByUserId: user.id,
        });
        notifyUsers(database, {
          userIds: activeOrganizationUserIds(
            database,
            recipient.buyer_organization_id,
          ),
          type: "opportunity_shared",
          title: "New private opportunity",
          body: `${deal.title} was shared with ${recipient.buyer_project_name}.`,
          href: `/app/deals/${deal.id}`,
          dealId: deal.id,
          actorUserId: user.id,
          sourceKey: `outreach:${recipientId}:shared`,
        });
      }
      database
        .prepare(
          `UPDATE deal_matches
           SET status='contacted',updated_at=strftime('%Y-%m-%d %H:%M:%f','now')
           WHERE deal_id=? AND id IN (${placeholders})`,
        )
        .run(deal.id, ...matchIds);
      audit(
        user,
        deal.id,
        `Shared private teaser with ${recipients.length} buyer project${recipients.length === 1 ? "" : "s"}`,
      );
    });
    return {
      id: outreachId,
      message: `Private teaser shared with ${matchIds.length} buyer project${matchIds.length === 1 ? "" : "s"}.`,
    };
  }
  if (action === "viewOutreach" || action === "respondToOutreach") {
    if (user.role !== "buyer")
      throw new AppError("Only recipient buyers can access outreach.", 403);
    const organization = organizationFor(user.id);
    if (!organization)
      throw new AppError(
        "Your account is not connected to an organization.",
        403,
      );
    if (action === "viewOutreach") {
      const recipientIds = [
        ...new Set(
          parse(
            z.array(idSchema).min(1).max(100),
            data.recipient_ids ?? [data.recipient_id],
          ),
        ),
      ];
      const placeholders = recipientIds.map(() => "?").join(",");
      const recipients = all<{
        id: string;
        status: string;
        buyer_organization_id: string;
        buyer_project_id: string;
      }>(
        `SELECT dor.id,dor.status,dor.buyer_organization_id,dor.buyer_project_id
         FROM deal_outreach_recipients dor
         JOIN deal_outreach o ON o.id=dor.outreach_id
         WHERE dor.id IN (${placeholders}) AND o.deal_id=?`,
        ...recipientIds,
        deal.id,
      );
      if (
        recipients.length !== recipientIds.length ||
        recipients.some(
          (recipient) => recipient.buyer_organization_id !== organization.id,
        )
      )
        throw new AppError("This private outreach is not available.", 404);
      const sentRecipients = recipients.filter(
        (recipient) => recipient.status === "sent",
      );
      if (sentRecipients.length) {
        const sentPlaceholders = sentRecipients.map(() => "?").join(",");
        const database = db();
        inImmediateTransaction(database, () => {
          database
            .prepare(
              `UPDATE deal_outreach_recipients
               SET status='viewed',viewed_at=CURRENT_TIMESTAMP
               WHERE id IN (${sentPlaceholders}) AND status='sent'`,
            )
            .run(...sentRecipients.map((recipient) => recipient.id));
          for (const recipient of sentRecipients)
            recordDealBuyerEvent(database, {
              dealId: deal.id,
              buyerOrganizationId: recipient.buyer_organization_id,
              buyerProjectId: recipient.buyer_project_id,
              eventType: "teaser_viewed",
              sourceKey: `outreach:${recipient.id}:teaser_viewed`,
              createdByUserId: user.id,
            });
          audit(
            user,
            deal.id,
            `Viewed ${sentRecipients.length} private teaser recipient${sentRecipients.length === 1 ? "" : "s"}`,
          );
        });
      }
      return { message: "Opportunity marked as viewed." };
    }
    const recipientId = parse(idSchema, data.recipient_id);
    const recipient = one<{
      id: string;
      status: string;
      buyer_organization_id: string;
      buyer_project_id: string;
    }>(
      `SELECT dor.id,dor.status,dor.buyer_organization_id,dor.buyer_project_id
       FROM deal_outreach_recipients dor
       JOIN deal_outreach o ON o.id=dor.outreach_id
       WHERE dor.id=? AND o.deal_id=?`,
      recipientId,
      deal.id,
    );
    if (!recipient || recipient.buyer_organization_id !== organization.id)
      throw new AppError("This private outreach is not available.", 404);
    if (organization.membership_role === "viewer")
      throw new AppError(
        "Read-only organization members cannot respond to outreach.",
        403,
      );
    const response = parse(z.enum(["interested", "pass"]), data.response);
    const targetStatus = response === "interested" ? "pursued" : "passed";
    if (recipient.status === targetStatus)
      return {
        message:
          response === "interested"
            ? "Interest already recorded."
            : "Pass already recorded.",
      };
    if (!["sent", "viewed"].includes(recipient.status))
      throw new AppError("This outreach already has a final response.", 409);
    const existingAccess = membership(deal.id, user.id);
    if (
      response === "interested" &&
      existingAccess &&
      ["denied", "revoked"].includes(existingAccess.status)
    )
      throw new AppError(
        "Your organization cannot pursue this opportunity at this time.",
        403,
      );
    const database = db();
    inImmediateTransaction(database, () => {
      const updated = database
        .prepare(
          `UPDATE deal_outreach_recipients SET status=?,
             viewed_at=COALESCE(viewed_at,CURRENT_TIMESTAMP),
             pursued_at=CASE WHEN ?='pursued' THEN CURRENT_TIMESTAMP ELSE pursued_at END,
             passed_at=CASE WHEN ?='passed' THEN CURRENT_TIMESTAMP ELSE passed_at END
           WHERE id=? AND status IN ('sent','viewed')`,
        )
        .run(targetStatus, targetStatus, targetStatus, recipient.id);
      if (!updated.changes)
        throw new AppError("This outreach already has a final response.", 409);
      if (recipient.status === "sent")
        recordDealBuyerEvent(database, {
          dealId: deal.id,
          buyerOrganizationId: recipient.buyer_organization_id,
          buyerProjectId: recipient.buyer_project_id,
          eventType: "teaser_viewed",
          sourceKey: `outreach:${recipient.id}:teaser_viewed`,
          createdByUserId: user.id,
        });
      if (response === "interested" && !existingAccess)
        database
          .prepare(
            "INSERT INTO access(id,deal_id,buyer_id,status,nda_status,notes) VALUES(?,?,?,'requested','not_requested','Interest submitted from private teaser outreach')",
          )
          .run(randomUUID(), deal.id, user.id);
      recordDealBuyerEvent(database, {
        dealId: deal.id,
        buyerOrganizationId: recipient.buyer_organization_id,
        buyerProjectId: recipient.buyer_project_id,
        eventType: targetStatus === "pursued" ? "pursued" : "passed",
        sourceKey: `outreach:${recipient.id}:${targetStatus === "pursued" ? "pursued" : "passed"}`,
        createdByUserId: user.id,
      });
      if (response === "interested")
        notifyUsers(database, {
          userIds: dealManagerUserIds(database, deal.id),
          type: "buyer_pursued",
          title: "Buyer expressed interest",
          body: `${organization.name} is interested in ${deal.title}.`,
          href: `/app/deals/${deal.id}`,
          dealId: deal.id,
          actorUserId: user.id,
          sourceKey: `outreach:${recipient.id}:buyer-pursued`,
        });
      audit(
        user,
        deal.id,
        response === "interested"
          ? "Expressed interest in private outreach"
          : "Passed on private outreach",
      );
    });
    return {
      message:
        response === "interested"
          ? "Interest shared with the deal team."
          : "Opportunity passed.",
    };
  }
  if (action === "requestIntroduction") {
    if (
      user.role !== "buyer" ||
      !deal.published ||
      deal.distribution_mode !== "qualified_discovery"
    )
      throw new AppError(
        "This opportunity is not available for Qualified Discovery.",
        403,
      );
    const organization = organizationFor(user.id);
    if (!organization || !isEligibleBuyerOrganization(organization))
      throw new AppError("A buyer organization is required.", 403);
    const minimumVerificationStatus =
      qualifiedDiscoveryMinimumVerificationStatus();
    if (
      !verificationStatusMeets(
        organization.verification_status,
        minimumVerificationStatus,
      )
    )
      throw new AppError(
        "Your buyer organization has not reached the verification level required for Qualified Discovery.",
        403,
      );
    if (organization.membership_role === "viewer")
      throw new AppError(
        "Read-only organization members cannot request introductions.",
        403,
      );
    const p = parse(
      z.object({
        buyer_project_id: idSchema,
        message: text(20, 3000),
      }),
      data,
    );
    const projectMatch = one<{
      buyer_project_id: string;
      organization_id: string;
      project_status: string;
      score: number;
      eligible: number;
    }>(
      `SELECT dm.buyer_project_id,bp.organization_id,bp.status project_status,
         dm.score,dm.eligible
       FROM deal_matches dm
       JOIN buyer_projects bp
         ON bp.id=dm.buyer_project_id
        AND bp.organization_id=dm.buyer_organization_id
       JOIN organizations buyer_organization
         ON buyer_organization.id=dm.buyer_organization_id
        AND buyer_organization.verification_status IN (${qualifiedDiscoveryEligibleVerificationStatuses(
          minimumVerificationStatus,
        )
          .map(() => "?")
          .join(",")})
       WHERE dm.deal_id=? AND dm.buyer_project_id=?`,
      ...qualifiedDiscoveryEligibleVerificationStatuses(
        minimumVerificationStatus,
      ),
      deal.id,
      p.buyer_project_id,
    );
    if (
      !projectMatch ||
      projectMatch.organization_id !== organization.id ||
      projectMatch.project_status !== "active" ||
      !projectMatch.eligible ||
      projectMatch.score < qualifiedDiscoveryMinimumScore()
    )
      throw new AppError(
        "This acquisition project is not eligible for the opportunity.",
        403,
      );
    const prior = one<{ status: string }>(
      `SELECT status FROM introduction_requests
       WHERE deal_id=? AND buyer_organization_id=? AND status<>'withdrawn'
       ORDER BY created_at DESC,id DESC LIMIT 1`,
      deal.id,
      organization.id,
    );
    if (prior)
      throw new AppError(
        prior.status === "declined"
          ? "The deal team declined this organization’s introduction request."
          : `Your organization already has a ${prior.status} introduction request.`,
        409,
      );
    const id = randomUUID();
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          `INSERT INTO introduction_requests(
            id,deal_id,buyer_organization_id,buyer_project_id,requested_by_user_id,message
          ) VALUES(?,?,?,?,?,?)`,
        )
        .run(
          id,
          deal.id,
          organization.id,
          p.buyer_project_id,
          user.id,
          p.message,
        );
      recordDealBuyerEvent(database, {
        dealId: deal.id,
        buyerOrganizationId: organization.id,
        buyerProjectId: p.buyer_project_id,
        eventType: "intro_requested",
        sourceKey: `introduction:${id}:requested`,
        createdByUserId: user.id,
      });
      notifyUsers(database, {
        userIds: dealManagerUserIds(database, deal.id),
        type: "introduction_requested",
        title: "Introduction requested",
        body: `${organization.name} requested an introduction to ${deal.title}.`,
        href: `/app/deals/${deal.id}`,
        dealId: deal.id,
        actorUserId: user.id,
        sourceKey: `introduction:${id}:requested`,
      });
      audit(user, deal.id, "Requested a Qualified Discovery introduction");
    });
    return { id, message: "Introduction request sent to the deal team." };
  }
  if (action === "withdrawIntroduction") {
    if (user.role !== "buyer")
      throw new AppError(
        "Only buyer organizations can withdraw requests.",
        403,
      );
    const organization = organizationFor(user.id);
    if (!organization || organization.membership_role === "viewer")
      throw new AppError("You cannot withdraw this request.", 403);
    const requestId = parse(idSchema, data.introduction_request_id);
    const request = one<{ id: string; status: string }>(
      `SELECT id,status FROM introduction_requests
       WHERE id=? AND deal_id=? AND buyer_organization_id=?`,
      requestId,
      deal.id,
      organization.id,
    );
    if (!request) throw new AppError("Introduction request not found.", 404);
    if (request.status !== "pending")
      throw new AppError("Only pending requests can be withdrawn.", 409);
    run(
      "UPDATE introduction_requests SET status='withdrawn' WHERE id=? AND status='pending'",
      request.id,
    );
    audit(user, deal.id, "Withdrew a Qualified Discovery introduction");
    return { message: "Introduction request withdrawn." };
  }
  if (action === "reviewIntroduction") {
    requireManager(user, deal);
    const p = parse(
      z.object({
        introduction_request_id: idSchema,
        status: z.enum(["approved", "declined"]),
      }),
      data,
    );
    const request = one<{
      id: string;
      status: string;
      requested_by_user_id: string;
      buyer_organization_id: string;
    }>(
      `SELECT id,status,requested_by_user_id,buyer_organization_id
       FROM introduction_requests WHERE id=? AND deal_id=?`,
      p.introduction_request_id,
      deal.id,
    );
    if (!request) throw new AppError("Introduction request not found.", 404);
    if (request.status !== "pending")
      throw new AppError(
        "This introduction request was already reviewed.",
        409,
      );
    const buyerOrganization = one<{
      verification_status: BuyerVerificationStatus;
      organization_type: OrganizationType;
    }>(
      "SELECT verification_status,organization_type FROM organizations WHERE id=?",
      request.buyer_organization_id,
    );
    const requestProjectStatus = one<{ status: BuyerProject["status"] }>(
      `SELECT bp.status
       FROM introduction_requests ir
       JOIN buyer_projects bp ON bp.id=ir.buyer_project_id
       WHERE ir.id=? AND bp.organization_id=?`,
      request.id,
      request.buyer_organization_id,
    )?.status;
    if (
      p.status === "approved" &&
      !verificationStatusMeets(
        buyerOrganization?.verification_status || "unverified",
        qualifiedDiscoveryMinimumVerificationStatus(),
      )
    )
      throw new AppError(
        "The buyer organization no longer meets the Qualified Discovery verification requirement.",
        409,
      );
    if (
      p.status === "approved" &&
      (!buyerOrganization ||
        !isEligibleBuyerOrganizationType(buyerOrganization.organization_type) ||
        requestProjectStatus !== "active")
    )
      throw new AppError(
        "The buyer organization or acquisition project is no longer eligible for Qualified Discovery.",
        409,
      );
    const existingAccess = membership(deal.id, request.requested_by_user_id);
    if (
      p.status === "approved" &&
      existingAccess &&
      ["denied", "revoked"].includes(existingAccess.status)
    )
      throw new AppError(
        "This buyer is currently blocked in the deal access workflow.",
        409,
      );
    const database = db();
    inImmediateTransaction(database, () => {
      const updated = database
        .prepare(
          `UPDATE introduction_requests SET status=?,reviewed_at=CURRENT_TIMESTAMP,
             reviewed_by_user_id=? WHERE id=? AND status='pending'`,
        )
        .run(p.status, user.id, request.id);
      if (!updated.changes)
        throw new AppError(
          "This introduction request was already reviewed.",
          409,
        );
      if (p.status === "approved" && !existingAccess)
        database
          .prepare(
            `INSERT INTO access(id,deal_id,buyer_id,status,nda_status,notes)
             VALUES(?,?,?,'requested','not_requested','Approved Qualified Discovery introduction')`,
          )
          .run(randomUUID(), deal.id, request.requested_by_user_id);
      const requestProject = database
        .prepare(
          "SELECT buyer_project_id FROM introduction_requests WHERE id=?",
        )
        .get(request.id) as { buyer_project_id: string };
      recordDealBuyerEvent(database, {
        dealId: deal.id,
        buyerOrganizationId: request.buyer_organization_id,
        buyerProjectId: requestProject.buyer_project_id,
        eventType:
          p.status === "approved" ? "intro_approved" : "intro_declined",
        sourceKey: `introduction:${request.id}:${p.status}`,
        createdByUserId: user.id,
      });
      if (p.status === "approved")
        recordInitialTransactionAttribution(database, {
          dealId: deal.id,
          buyerOrganizationId: request.buyer_organization_id,
          source: "buyer_discovery",
          createdByUserId: user.id,
        });
      if (p.status === "approved")
        notifyUsers(database, {
          userIds: activeOrganizationUserIds(
            database,
            request.buyer_organization_id,
          ),
          type: "introduction_approved",
          title: "Introduction approved",
          body: `Your introduction request for ${deal.title} was approved. Confidential access remains gated by NDA review.`,
          href: `/app/deals/${deal.id}`,
          dealId: deal.id,
          actorUserId: user.id,
          sourceKey: `introduction:${request.id}:approved-notification`,
        });
      recalculateBuyerOrganizationDealMatches(
        database,
        request.buyer_organization_id,
        deal.id,
      );
      audit(
        user,
        deal.id,
        `${p.status === "approved" ? "Approved" : "Declined"} a Qualified Discovery introduction`,
      );
    });
    return {
      message:
        p.status === "approved"
          ? "Introduction approved and moved to Buyer access."
          : "Introduction declined.",
    };
  }
  if (action === "requestAccess") {
    throw new AppError(
      "Qualified Discovery access starts with a matched introduction request.",
      403,
    );
  }
  if (action === "updateDeal") {
    requireManager(user, deal);
    const p = parse(
      z.object({
        stage: z.enum(STAGES),
        published: z.boolean(),
        distribution_mode: z.enum(DEAL_DISTRIBUTION_MODES).optional(),
      }),
      data,
    );
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          "UPDATE deals SET stage=?,published=?,distribution_mode=? WHERE id=?",
        )
        .run(
          p.stage,
          p.published ? 1 : 0,
          p.distribution_mode ?? deal.distribution_mode,
          deal.id,
        );
      recalculateDealMatches(database, deal.id);
    });
    audit(
      user,
      deal.id,
      `Updated stage to ${p.stage}; teaser ${p.published ? "published" : "private"}`,
    );
    return { message: "Deal settings saved." };
  }
  if (action === "updateDealDetails") {
    requireManager(user, deal);
    const update = parse(dealDetailsUpdateSchema, data);
    const p = parse(dealDetailsSchema, {
      ...deal,
      ...update,
      seller_rollover_possible:
        update.seller_rollover_possible ??
        Boolean(deal.seller_rollover_possible),
      seller_financing_possible:
        update.seller_financing_possible ??
        Boolean(deal.seller_financing_possible),
    });
    validateExpectedValueRange(p);
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          `UPDATE deals SET
        title=?,company_name=?,sector=?,province=?,city=?,revenue=?,ebitda=?,asking_price=?,
        employees=?,founded=?,description=?,confidential_summary=?,transaction_type=?,
        ownership_percentage_available=?,seller_rollover_possible=?,seller_financing_possible=?,
        management_transition=?,reason_for_transaction=?,min_expected_value=?,max_expected_value=?,
        distribution_mode=? WHERE id=?`,
        )
        .run(
          p.title,
          p.company_name,
          p.sector,
          p.province,
          p.city,
          p.revenue,
          p.ebitda,
          p.asking_price,
          p.employees,
          p.founded,
          p.description,
          p.confidential_summary,
          p.transaction_type,
          p.ownership_percentage_available,
          p.seller_rollover_possible ? 1 : 0,
          p.seller_financing_possible ? 1 : 0,
          p.management_transition,
          p.reason_for_transaction,
          p.min_expected_value,
          p.max_expected_value,
          p.distribution_mode,
          deal.id,
        );
      recalculateDealMatches(database, deal.id);
    });
    audit(user, deal.id, "Updated the confidential sell-side mandate");
    return { message: "Mandate details saved." };
  }
  if (action === "upsertDealFinancial") {
    requireManager(user, deal);
    const p = parse(dealFinancialSchema, data);
    const existing = one<{ id: string }>(
      "SELECT id FROM deal_financials WHERE deal_id=? AND fiscal_year=? AND period_type=?",
      deal.id,
      p.fiscal_year,
      p.period_type,
    );
    const id = existing?.id ?? randomUUID();
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          `INSERT INTO deal_financials(
        id,deal_id,fiscal_year,period_type,revenue,ebitda,gross_profit,is_projected
      ) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(deal_id,fiscal_year,period_type) DO UPDATE SET
        revenue=excluded.revenue,ebitda=excluded.ebitda,gross_profit=excluded.gross_profit,
        is_projected=excluded.is_projected,updated_at=CURRENT_TIMESTAMP`,
        )
        .run(
          id,
          deal.id,
          p.fiscal_year,
          p.period_type,
          p.revenue,
          p.ebitda,
          p.gross_profit,
          p.is_projected ? 1 : 0,
        );
      recalculateDealMatches(database, deal.id);
    });
    audit(user, deal.id, `Updated ${p.fiscal_year} financial history`);
    return { id, message: "Financial period saved." };
  }
  if (action === "deleteDealFinancial") {
    requireManager(user, deal);
    const financialId = parse(idSchema, data.financial_id);
    const database = db();
    inImmediateTransaction(database, () => {
      const result = database
        .prepare("DELETE FROM deal_financials WHERE id=? AND deal_id=?")
        .run(financialId, deal.id);
      if (!result.changes)
        throw new AppError("Financial period not found.", 404);
      recalculateDealMatches(database, deal.id);
    });
    audit(user, deal.id, "Removed a financial history period");
    return { message: "Financial period removed." };
  }
  if (action === "appointAdvisor") {
    if (!canManageOwnerSide(user, deal))
      throw new AppError(
        "Only the owner organization can appoint its advisor.",
        403,
      );
    const advisorId = parse(idSchema, data.advisor_id);
    const advisor = one<User>(
      `SELECT ${userColumns} FROM users WHERE id=? AND role='advisor'`,
      advisorId,
    );
    if (!advisor || !!advisor.is_demo !== !!user.is_demo)
      throw new AppError("Advisor is not available.");
    const advisorOrganization = organizationFor(advisor.id);
    if (!advisorOrganization)
      throw new AppError("The advisor is not connected to an organization.");
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          "UPDATE deals SET advisor_id=?,advisor_organization_id=? WHERE id=?",
        )
        .run(advisor.id, advisorOrganization.id, deal.id);
      recalculateDealMatches(database, deal.id);
    });
    audit(user, deal.id, `Appointed ${advisor.company} as advisor`);
    return { message: "Advisor appointed and granted firm access." };
  }
  if (action === "connectOwner") {
    if (
      user.role !== "advisor" ||
      deal.owner_id !== user.id ||
      deal.advisor_id !== user.id ||
      !isManager(user, deal)
    )
      throw new AppError(
        "Only the creating advisor can connect an owner to an unassigned mandate.",
        403,
      );
    const email = parse(z.email(), data.email).toLowerCase();
    if (data.confirm_authority !== true)
      throw new AppError(
        "Confirm that you are authorized to connect this owner.",
      );
    const owner = one<User>(
      `SELECT ${userColumns} FROM users WHERE email=? AND role='owner'`,
      email,
    );
    if (!owner || !!owner.is_demo !== !!user.is_demo)
      throw new AppError(
        "An eligible owner account was not found. Ask the owner to register first.",
      );
    const ownerOrganization = organizationFor(owner.id);
    if (!ownerOrganization)
      throw new AppError("The owner is not connected to an organization.");
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          "UPDATE deals SET owner_id=?,owner_organization_id=? WHERE id=?",
        )
        .run(owner.id, ownerOrganization.id, deal.id);
      recalculateDealMatches(database, deal.id);
    });
    audit(user, deal.id, "Connected the business owner to the mandate");
    return {
      message:
        "Owner connected. Their firm now controls the mandate and can change the appointed advisor.",
    };
  }
  if (action === "inviteBuyer") {
    requireManager(user, deal);
    const email = parse(z.email(), data.email).toLowerCase();
    const buyer = one<User>(
      `SELECT ${userColumns} FROM users WHERE email=? AND role='buyer'`,
      email,
    );
    if (!buyer || !!buyer.is_demo !== !!user.is_demo)
      throw new AppError(
        "No eligible buyer account was found. Ask the buyer to register first.",
      );
    if (membership(deal.id, buyer.id))
      throw new AppError("This buyer already has a request or invitation.");
    const buyerOrganization = organizationFor(buyer.id);
    if (!buyerOrganization)
      throw new AppError("The buyer is not connected to an organization.");
    const database = db();
    const accessId = randomUUID();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          "INSERT INTO access(id,deal_id,buyer_id,status,nda_status,notes) VALUES(?,?,?,'nda_pending','requested','Invited by the deal team')",
        )
        .run(accessId, deal.id, buyer.id);
      recordDealBuyerEvent(database, {
        dealId: deal.id,
        buyerOrganizationId: buyerOrganization.id,
        buyerProjectId:
          bestBuyerProjectForDeal(database, deal.id, buyerOrganization.id)
            ?.buyer_project_id ?? null,
        eventType: "nda_requested",
        sourceKey: `access:${accessId}:nda-requested`,
        createdByUserId: user.id,
      });
      recordInitialTransactionAttribution(database, {
        dealId: deal.id,
        buyerOrganizationId: buyerOrganization.id,
        source: "seller_invitation",
        createdByUserId: user.id,
      });
      notifyUsers(database, {
        userIds: [buyer.id],
        type: "nda_requested",
        title: "NDA requested",
        body: `The deal team invited you to continue with ${deal.title}.`,
        href: `/app/deals/${deal.id}`,
        dealId: deal.id,
        actorUserId: user.id,
        sourceKey: `access:${accessId}:nda-requested-notification`,
      });
      audit(user, deal.id, `Invited ${buyer.company}`);
    });
    return {
      message:
        "Buyer invited and notified in-app. Upload their NDA in the data room when ready.",
    };
  }
  if (action === "reviewAccess") {
    requireManager(user, deal);
    const p = parse(
      z.object({
        buyer_id: idSchema,
        status: z.enum(["nda_pending", "approved", "denied", "revoked"]),
        nda_document_id: z.string().optional(),
      }),
      data,
    );
    const member = membership(deal.id, p.buyer_id);
    if (!member) throw new AppError("Request not found.", 404);
    const buyerOrganization = organizationFor(p.buyer_id);
    const database = db();
    const buyerProjectId = buyerOrganization
      ? (bestBuyerProjectForDeal(database, deal.id, buyerOrganization.id)
          ?.buyer_project_id ?? null)
      : null;
    if (p.status === "approved") {
      if (member.nda_method === "electronic_signature")
        throw new AppError(
          "Electronic NDA access is granted only after verified provider completion. Use external upload first if you need to review the agreement manually.",
        );
      const doc = one<Document>(
        "SELECT * FROM documents WHERE id=? AND deal_id=? AND category='NDA' AND audience='buyer' AND buyer_id=?",
        p.nda_document_id || "",
        deal.id,
        p.buyer_id,
      );
      if (!doc)
        throw new AppError(
          "Upload and select this buyer’s executed NDA before approving access.",
        );
      if (data.confirm_reviewed !== true)
        throw new AppError("Confirm you reviewed the externally executed NDA.");
      inImmediateTransaction(database, () => {
        database
          .prepare(
            `UPDATE access SET status='approved',nda_status='verified',
               nda_document_id=?,nda_method='external_upload',
               electronic_signature_envelope_id=NULL WHERE id=?`,
          )
          .run(doc.id, member.id);
        if (buyerOrganization)
          recalculateBuyerOrganizationDealMatches(
            database,
            buyerOrganization.id,
            deal.id,
          );
        if (buyerOrganization) {
          recordDealBuyerEvent(database, {
            dealId: deal.id,
            buyerOrganizationId: buyerOrganization.id,
            buyerProjectId,
            eventType: "nda_approved",
            sourceKey: `access:${member.id}:nda-approved`,
            createdByUserId: user.id,
          });
          const sharedCims = database
            .prepare(
              `SELECT id,uploaded_by FROM documents
               WHERE deal_id=? AND category='Company overview'
                 AND audience='approved'`,
            )
            .all(deal.id) as { id: string; uploaded_by: string }[];
          for (const document of sharedCims)
            recordDealBuyerEvent(database, {
              dealId: deal.id,
              buyerOrganizationId: buyerOrganization.id,
              buyerProjectId,
              eventType: "cim_shared",
              sourceKey: `document:${document.id}`,
              createdByUserId: document.uploaded_by,
            });
        }
        notifyUsers(database, {
          userIds: [p.buyer_id],
          type: "nda_approved",
          title: "NDA approved",
          body: `The deal team approved your confidential access to ${deal.title}.`,
          href: `/app/deals/${deal.id}`,
          dealId: deal.id,
          actorUserId: user.id,
          sourceKey: `access:${member.id}:nda-approved-notification`,
        });
      });
    } else {
      inImmediateTransaction(database, () => {
        database
          .prepare(
            `UPDATE access SET status=?,nda_status=?,nda_method='external_upload',
               electronic_signature_envelope_id=NULL WHERE id=?`,
          )
          .run(
            p.status,
            p.status === "nda_pending" ? "requested" : member.nda_status,
            member.id,
          );
        if (buyerOrganization)
          recalculateBuyerOrganizationDealMatches(
            database,
            buyerOrganization.id,
            deal.id,
          );
        if (buyerOrganization && p.status === "nda_pending") {
          recordDealBuyerEvent(database, {
            dealId: deal.id,
            buyerOrganizationId: buyerOrganization.id,
            buyerProjectId,
            eventType: "nda_requested",
            sourceKey: `access:${member.id}:nda-requested`,
            createdByUserId: user.id,
          });
          recordInitialTransactionAttribution(database, {
            dealId: deal.id,
            buyerOrganizationId: buyerOrganization.id,
            source: "seller_invitation",
            createdByUserId: user.id,
          });
        }
        if (p.status === "nda_pending")
          notifyUsers(database, {
            userIds: [p.buyer_id],
            type: "nda_requested",
            title: "NDA requested",
            body: `The deal team asked you to complete the NDA step for ${deal.title}.`,
            href: `/app/deals/${deal.id}`,
            dealId: deal.id,
            actorUserId: user.id,
            sourceKey: `access:${member.id}:nda-requested-notification`,
          });
        if (buyerOrganization && p.status === "revoked")
          recordDealBuyerEvent(database, {
            dealId: deal.id,
            buyerOrganizationId: buyerOrganization.id,
            buyerProjectId,
            eventType: "access_revoked",
            sourceKey: `access:${member.id}:revoked`,
            createdByUserId: user.id,
          });
        if (p.status === "revoked" || p.status === "denied") {
          database
            .prepare("DELETE FROM notifications WHERE user_id=? AND deal_id=?")
            .run(p.buyer_id, deal.id);
        }
        if (p.status === "revoked") {
          notifyUsers(database, {
            userIds: [p.buyer_id],
            type: "access_revoked",
            title: "Deal-room access revoked",
            body: `Your access to ${deal.title} was revoked by the deal team.`,
            href: "/app/deals",
            dealId: deal.id,
            actorUserId: user.id,
            sourceKey: `access:${member.id}:revoked-notification`,
          });
        }
        if (buyerOrganization && p.status === "denied")
          recordDealBuyerEvent(database, {
            dealId: deal.id,
            buyerOrganizationId: buyerOrganization.id,
            buyerProjectId,
            eventType: "not_proceeding",
            sourceKey: `access:${member.id}:denied`,
            createdByUserId: user.id,
          });
      });
    }
    audit(
      user,
      deal.id,
      `${p.status === "approved" ? "Verified external NDA and approved" : p.status.replaceAll("_", " ")} access for ${p.buyer_id}`,
    );
    return { message: "Buyer access updated." };
  }
  if (action === "message") {
    const p = parse(
      z.object({ buyer_id: idSchema, body: text(1, 5000) }),
      data,
    );
    const member = membership(deal.id, p.buyer_id);
    if (
      !member ||
      ["denied", "revoked"].includes(member.status) ||
      (!isManager(user, deal) && user.id !== p.buyer_id)
    )
      throw new AppError("You cannot access this conversation.", 403);
    const messageId = randomUUID();
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          "INSERT INTO messages(id,deal_id,buyer_id,sender_id,body) VALUES(?,?,?,?,?)",
        )
        .run(messageId, deal.id, p.buyer_id, user.id, p.body);
      notifyUsers(database, {
        userIds:
          user.id === p.buyer_id
            ? dealTeamUserIds(database, deal.id)
            : [p.buyer_id],
        type: "new_message",
        title: `New message · ${deal.title}`,
        body: `${user.name}: ${p.body.slice(0, 240)}`,
        href: `/app/deals/${deal.id}`,
        dealId: deal.id,
        actorUserId: user.id,
        sourceKey: `message:${messageId}`,
      });
    });
    return { message: "Message sent." };
  }
  if (action === "createInternalNote") {
    requireManager(user, deal);
    const p = parse(z.object({ body: text(1, 5000) }), data);
    const id = randomUUID();
    run(
      "INSERT INTO deal_internal_notes(id,deal_id,author_user_id,body) VALUES(?,?,?,?)",
      id,
      deal.id,
      user.id,
      p.body,
    );
    audit(user, deal.id, "Added an internal deal-team note");
    return { id, message: "Internal note added." };
  }
  if (action === "createTask") {
    requireManager(user, deal);
    const p = parse(
      z.object({
        title: text(3, 200),
        due_date: z.iso.date(),
        buyer_id: z.string().optional(),
      }),
      data,
    );
    if (p.buyer_id && membership(deal.id, p.buyer_id)?.status !== "approved")
      throw new AppError("Select an approved buyer or an internal task.");
    const taskId = randomUUID();
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          "INSERT INTO tasks(id,deal_id,title,due_date,buyer_id,created_by) VALUES(?,?,?,?,?,?)",
        )
        .run(taskId, deal.id, p.title, p.due_date, p.buyer_id || null, user.id);
      notifyUsers(database, {
        userIds: p.buyer_id ? [p.buyer_id] : dealTeamUserIds(database, deal.id),
        type: "new_task",
        title: "New diligence task",
        body: `${p.title} is due ${p.due_date} for ${deal.title}.`,
        href: `/app/deals/${deal.id}`,
        dealId: deal.id,
        actorUserId: user.id,
        sourceKey: `task:${taskId}`,
      });
    });
    audit(user, deal.id, "Added a diligence task");
    return { message: "Task added." };
  }
  if (action === "toggleTask") {
    const task = one<Task>(
      "SELECT * FROM tasks WHERE id=? AND deal_id=?",
      parse(idSchema, data.task_id),
      deal.id,
    );
    if (
      !task ||
      (!isManager(user, deal) &&
        !(canAccess(user, deal) && task.buyer_id === user.id))
    )
      throw new AppError("Task is not available.", 403);
    const next = task.status === "done" ? "open" : "done";
    run("UPDATE tasks SET status=? WHERE id=?", next, task.id);
    audit(
      user,
      deal.id,
      `${next === "done" ? "Completed" : "Reopened"} task: ${task.title}`,
    );
    return { message: "Task updated." };
  }
  if (action === "submitOffer") {
    requireAccess(user, deal);
    if (user.role !== "buyer")
      throw new AppError("Only buyers can submit offers.", 403);
    const p = parse(
      z.object({
        amount: amount.refine((n) => n > 0),
        structure: z.enum([
          "Share purchase",
          "Asset purchase",
          "To be negotiated",
        ]),
        notes: text(0, 5000),
        document_id: idSchema,
      }),
      data,
    );
    const doc = one<Document>(
      "SELECT * FROM documents WHERE id=? AND deal_id=? AND uploaded_by=? AND category='LOI' AND audience='buyer' AND buyer_id=?",
      p.document_id,
      deal.id,
      user.id,
      user.id,
    );
    if (!doc)
      throw new AppError(
        "Upload your LOI document before submitting the offer.",
      );
    const organization = organizationFor(user.id);
    if (!organization)
      throw new AppError("Your account is not connected to an organization.");
    const database = db();
    const offerId = randomUUID();
    inImmediateTransaction(database, () => {
      database
        .prepare(
          "INSERT INTO offers(id,deal_id,buyer_id,amount,structure,notes,document_id) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          offerId,
          deal.id,
          user.id,
          p.amount,
          p.structure,
          p.notes,
          p.document_id,
        );
      recordDealBuyerEvent(database, {
        dealId: deal.id,
        buyerOrganizationId: organization.id,
        buyerProjectId:
          bestBuyerProjectForDeal(database, deal.id, organization.id)
            ?.buyer_project_id ?? null,
        eventType: "loi_received",
        sourceKey: `offer:${offerId}:received`,
        metadata: { offer_id: offerId, amount: p.amount },
        createdByUserId: user.id,
      });
      notifyUsers(database, {
        userIds: dealManagerUserIds(database, deal.id),
        type: "loi_received",
        title: "LOI received",
        body: `${organization.name} submitted an indicative LOI for ${deal.title}.`,
        href: `/app/deals/${deal.id}`,
        dealId: deal.id,
        actorUserId: user.id,
        sourceKey: `offer:${offerId}:loi-received`,
      });
      audit(user, deal.id, "Submitted an indicative LOI");
    });
    return { message: "LOI submitted to the deal team." };
  }
  if (action === "reviewOffer") {
    requireManager(user, deal);
    const p = parse(
      z.object({
        offer_id: idSchema,
        status: z.enum(["Under review", "Shortlisted", "Not proceeding"]),
      }),
      data,
    );
    const offer = one<{ id: string; buyer_id: string; amount: number }>(
      "SELECT id,buyer_id,amount FROM offers WHERE id=? AND deal_id=?",
      p.offer_id,
      deal.id,
    );
    if (!offer) throw new AppError("Offer not found.", 404);
    const buyerOrganizationId = buyerOrganizationIdForUser(
      db(),
      offer.buyer_id,
    );
    const database = db();
    inImmediateTransaction(database, () => {
      database
        .prepare("UPDATE offers SET status=? WHERE id=?")
        .run(p.status, p.offer_id);
      if (buyerOrganizationId && p.status !== "Under review")
        recordDealBuyerEvent(database, {
          dealId: deal.id,
          buyerOrganizationId,
          buyerProjectId:
            bestBuyerProjectForDeal(database, deal.id, buyerOrganizationId)
              ?.buyer_project_id ?? null,
          eventType:
            p.status === "Shortlisted" ? "shortlisted" : "not_proceeding",
          sourceKey: `offer:${offer.id}:${p.status === "Shortlisted" ? "shortlisted" : "not-proceeding"}`,
          metadata: { offer_id: offer.id, amount: offer.amount },
          createdByUserId: user.id,
        });
      audit(user, deal.id, `Marked LOI as ${p.status}`);
    });
    return {
      message:
        "Offer review status saved. This does not execute or accept a legal agreement.",
    };
  }
  throw new AppError("Unknown action.");
}
