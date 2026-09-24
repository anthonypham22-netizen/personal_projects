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
  type User,
  type Deal,
  type Access,
  type Document,
  type Message,
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
} from "./types";
import { inImmediateTransaction } from "./sqlite-transaction";
import {
  recalculateDealMatch,
  recalculateBuyerOrganizationDealMatches,
  recalculateBuyerProjectMatches,
  recalculateDealMatches,
} from "./match-store";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const userColumns =
  "id,email,name,company,role,province,bio,sectors,min_revenue,max_revenue,is_demo";
const text = (min = 1, max = 200) => z.string().trim().min(min).max(max);
const idSchema = text(1, 100);
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
const slugPart = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "firm";
const organizationFor = (userId: string) => {
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

function dealMatchesForDeals(dealIds: string[]): DealMatch[] {
  if (!dealIds.length) return [];
  const placeholders = dealIds.map(() => "?").join(",");
  const rows = all<
    Omit<DealMatch, "score_breakdown"> & { score_breakdown_json: string }
  >(
    `SELECT dm.*,
       bp.name buyer_project_name,
       bp.thesis buyer_project_thesis,
       o.name buyer_organization_name,
       o.organization_type buyer_organization_type,
       o.province buyer_organization_province,
       o.verification_status buyer_organization_verification_status,
       o.website buyer_organization_website,
       o.description buyer_organization_description,
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
     WHERE dm.deal_id IN (${placeholders})
     ORDER BY dm.eligible DESC,dm.score DESC,bp.name`,
    ...dealIds,
  );
  return rows.map(({ score_breakdown_json, ...row }) => ({
    ...row,
    score_breakdown: JSON.parse(
      score_breakdown_json,
    ) as DealMatch["score_breakdown"],
  }));
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
        "INSERT INTO organization_members(id,organization_id,user_id,role,status) VALUES(?,?,?,'owner','active')",
      )
      .run(randomUUID(), organizationId, id);
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
const isEligibleBuyerOrganization = (organization: Organization) =>
  buyerOrganizationTypes.has(organization.organization_type);
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
  const grouped = <T extends { buyer_project_id: string }, K extends keyof T>(
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
  const sectors = grouped(
    all<{ buyer_project_id: string; sector: string }>(
      `SELECT bps.buyer_project_id,bps.sector FROM buyer_project_sectors bps
       JOIN buyer_projects bp ON bp.id=bps.buyer_project_id
       WHERE bp.organization_id=? ORDER BY bps.rowid`,
      organizationId,
    ),
    "sector",
  );
  const provinces = grouped(
    all<{ buyer_project_id: string; province: string }>(
      `SELECT bpp.buyer_project_id,bpp.province FROM buyer_project_provinces bpp
       JOIN buyer_projects bp ON bp.id=bpp.buyer_project_id
       WHERE bp.organization_id=? ORDER BY bpp.rowid`,
      organizationId,
    ),
    "province",
  );
  const keywords = grouped(
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
  const rawDeals = all<Deal & { owner_is_demo: number }>(
    `SELECT d.*,owner.is_demo owner_is_demo FROM deals d JOIN users owner ON owner.id=d.owner_id
    WHERE (owner.is_demo=? OR (?='buyer' AND ?=1 AND owner.is_demo=0 AND d.published=1 AND d.distribution_mode='qualified_discovery'))
    AND ((d.owner_id=? AND d.owner_organization_id IS NULL) OR (d.advisor_id=? AND d.advisor_organization_id IS NULL)
      OR (?<>'buyer' AND EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id=? AND om.status='active' AND om.organization_id IN (d.owner_organization_id,d.advisor_organization_id)))
      OR (?='buyer' AND ((d.published=1 AND d.distribution_mode='qualified_discovery')
        OR d.id IN (SELECT deal_id FROM access WHERE buyer_id=?)
        OR EXISTS (
          SELECT 1 FROM deal_outreach o
          JOIN deal_outreach_recipients dor ON dor.outreach_id=o.id
          WHERE o.deal_id=d.id AND dor.buyer_organization_id=?
            AND dor.status IN ('sent','viewed','pursued','passed')
        ))))
    ORDER BY d.created_at DESC,d.title`,
    user.is_demo,
    user.role,
    user.is_demo,
    user.id,
    user.id,
    user.role,
    user.id,
    user.role,
    user.id,
    organization.id,
  );
  const deals = rawDeals.map((d) => {
    const previewOnly =
      user.role === "buyer" && !!user.is_demo && !d.owner_is_demo;
    const { owner_is_demo: _, ...deal } = d;
    if (previewOnly)
      return {
        id: d.id,
        title: d.title,
        company_name: "Confidential company",
        sector: d.sector,
        province: d.province,
        city: "",
        revenue: d.revenue,
        ebitda: d.ebitda,
        asking_price: d.asking_price,
        employees: 0,
        founded: 0,
        description: d.description,
        confidential_summary: "",
        transaction_type: d.transaction_type,
        ownership_percentage_available: d.ownership_percentage_available,
        seller_rollover_possible: d.seller_rollover_possible,
        seller_financing_possible: d.seller_financing_possible,
        management_transition: "",
        reason_for_transaction: "",
        min_expected_value: d.min_expected_value,
        max_expected_value: d.max_expected_value,
        distribution_mode: d.distribution_mode,
        owner_id: "",
        advisor_id: null,
        owner_organization_id: null,
        advisor_organization_id: null,
        created_by_user_id: null,
        stage: d.stage,
        published: d.published,
        created_at: d.created_at,
        can_manage: false,
        can_manage_owner_side: false,
        has_access: false,
        preview_only: true,
        access_status: "none",
        ...match(user, d),
      };
    const member = membershipByDeal.get(d.id),
      managing = canManageDeal(d),
      teamMember = teamMemberForDeal(d),
      allowed = teamMember || member?.status === "approved";
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
      ...match(user, d),
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
  const documents = all<Document>(
    "SELECT d.id,d.deal_id,d.name,d.category,d.size,d.version,d.audience,d.buyer_id,d.uploaded_by,d.created_at,u.name uploader_name,p.title deal_title FROM documents d JOIN users u ON u.id=d.uploaded_by JOIN deals p ON p.id=d.deal_id ORDER BY d.created_at DESC",
  ).filter((doc) => {
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
  });
  const messages = all<Message>(
    "SELECT m.*,u.name sender_name,u.role sender_role,d.title deal_title,b.name buyer_name FROM messages m JOIN users u ON u.id=m.sender_id JOIN users b ON b.id=m.buyer_id JOIN deals d ON d.id=m.deal_id ORDER BY m.created_at,m.rowid",
  ).filter((m) => ids.has(m.deal_id) && activeThread(m.deal_id, m.buyer_id));
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
  const buyerProjectsEnabled = isEligibleBuyerOrganization(organization);
  const canManageBuyerProjects =
    buyerProjectsEnabled && organization.membership_role !== "viewer";
  const managedDealIds = rawDeals
    .filter((deal) => canManageDeal(deal))
    .map((deal) => deal.id);
  const dealMatches =
    user.role === "buyer" ? undefined : dealMatchesForDeals(managedDealIds);
  const dealOutreach = dealOutreachFor(user, organization.id, managedDealIds);
  return {
    user,
    organization,
    organization_members: organizationMembers(organization.id),
    buyer_projects: buyerProjectsEnabled
      ? buyerProjectsFor(organization.id, canManageBuyerProjects)
      : [],
    can_manage_buyer_projects: canManageBuyerProjects,
    deals,
    ...(dealMatches ? { deal_matches: dealMatches } : {}),
    deal_outreach: dealOutreach,
    deal_financials: dealFinancials,
    access,
    documents,
    messages,
    tasks,
    offers,
    activity,
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
        website: z.union([z.literal(""), z.url().max(300)]),
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
          `SELECT id,buyer_project_id,eligible FROM deal_matches
           WHERE deal_id=? AND id IN (${placeholders})`,
        )
        .all(p.deal_id, ...matchIds) as {
        id: string;
        buyer_project_id: string;
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
      for (const match of available)
        recalculateDealMatch(database, p.deal_id, match.buyer_project_id);
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
          `SELECT dm.id,dm.buyer_project_id,dm.buyer_organization_id
           FROM deal_matches dm
           JOIN buyer_projects bp
             ON bp.id=dm.buyer_project_id
            AND bp.organization_id=dm.buyer_organization_id
           WHERE dm.deal_id=? AND dm.id IN (${placeholders})
             AND dm.eligible=1 AND dm.status='selected'`,
        )
        .all(deal.id, ...matchIds) as {
        id: string;
        buyer_project_id: string;
        buyer_organization_id: string;
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
      for (const recipient of recipients)
        insertRecipient.run(
          randomUUID(),
          outreachId,
          recipient.buyer_organization_id,
          recipient.buyer_project_id,
        );
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
      }>(
        `SELECT dor.id,dor.status,dor.buyer_organization_id
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
      const sentIds = recipients
        .filter((recipient) => recipient.status === "sent")
        .map((recipient) => recipient.id);
      if (sentIds.length) {
        const sentPlaceholders = sentIds.map(() => "?").join(",");
        run(
          `UPDATE deal_outreach_recipients
           SET status='viewed',viewed_at=CURRENT_TIMESTAMP
           WHERE id IN (${sentPlaceholders}) AND status='sent'`,
          ...sentIds,
        );
        audit(
          user,
          deal.id,
          `Viewed ${sentIds.length} private teaser recipient${sentIds.length === 1 ? "" : "s"}`,
        );
      }
      return { message: "Opportunity marked as viewed." };
    }
    const recipientId = parse(idSchema, data.recipient_id);
    const recipient = one<{
      id: string;
      status: string;
      buyer_organization_id: string;
    }>(
      `SELECT dor.id,dor.status,dor.buyer_organization_id
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
      if (response === "interested" && !existingAccess)
        database
          .prepare(
            "INSERT INTO access(id,deal_id,buyer_id,status,nda_status,notes) VALUES(?,?,?,'requested','not_requested','Interest submitted from private teaser outreach')",
          )
          .run(randomUUID(), deal.id, user.id);
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
  if (action === "requestAccess") {
    if (
      user.role !== "buyer" ||
      !deal.published ||
      deal.distribution_mode !== "qualified_discovery"
    )
      throw new AppError("This opportunity is not accepting requests.", 403);
    const existing = membership(deal.id, user.id);
    if (existing)
      throw new AppError("You already have an access request for this deal.");
    const notes = parse(text(0, 2000), data.notes || "");
    run(
      "INSERT INTO access(id,deal_id,buyer_id,notes) VALUES(?,?,?,?)",
      randomUUID(),
      deal.id,
      user.id,
      notes,
    );
    audit(user, deal.id, "Requested confidential access");
    return { message: "Request sent to the deal team." };
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
    run(
      "INSERT INTO access(id,deal_id,buyer_id,status,nda_status,notes) VALUES(?,?,?,'nda_pending','requested','Invited by the deal team')",
      randomUUID(),
      deal.id,
      buyer.id,
    );
    audit(user, deal.id, `Invited ${buyer.company}`);
    return {
      message:
        "Buyer invited in-app. Upload their NDA in the data room; email delivery is not configured.",
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
    if (p.status === "approved") {
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
            "UPDATE access SET status='approved',nda_status='verified',nda_document_id=? WHERE id=?",
          )
          .run(doc.id, member.id);
        if (buyerOrganization)
          recalculateBuyerOrganizationDealMatches(
            database,
            buyerOrganization.id,
            deal.id,
          );
      });
    } else {
      inImmediateTransaction(database, () => {
        database
          .prepare("UPDATE access SET status=?,nda_status=? WHERE id=?")
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
    run(
      "INSERT INTO messages(id,deal_id,buyer_id,sender_id,body) VALUES(?,?,?,?,?)",
      randomUUID(),
      deal.id,
      p.buyer_id,
      user.id,
      p.body,
    );
    return { message: "Message sent." };
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
    run(
      "INSERT INTO tasks(id,deal_id,title,due_date,buyer_id,created_by) VALUES(?,?,?,?,?,?)",
      randomUUID(),
      deal.id,
      p.title,
      p.due_date,
      p.buyer_id || null,
      user.id,
    );
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
    run(
      "INSERT INTO offers(id,deal_id,buyer_id,amount,structure,notes,document_id) VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      deal.id,
      user.id,
      p.amount,
      p.structure,
      p.notes,
      p.document_id,
    );
    audit(user, deal.id, "Submitted an indicative LOI");
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
    if (
      !one(
        "SELECT id FROM offers WHERE id=? AND deal_id=?",
        p.offer_id,
        deal.id,
      )
    )
      throw new AppError("Offer not found.", 404);
    run("UPDATE offers SET status=? WHERE id=?", p.status, p.offer_id);
    audit(user, deal.id, `Marked LOI as ${p.status}`);
    return {
      message:
        "Offer review status saved. This does not execute or accept a legal agreement.",
    };
  }
  throw new AppError("Unknown action.");
}
