export type Role = "buyer" | "owner" | "advisor";
export const ORGANIZATION_TYPES = [
  "buyer",
  "advisor",
  "business",
  "private_equity",
  "family_office",
  "search_fund",
  "independent_sponsor",
  "strategic",
  "other",
] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];
export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  buyer: "Buyer",
  advisor: "M&A advisory firm",
  business: "Operating business",
  private_equity: "Private equity",
  family_office: "Family office",
  search_fund: "Search fund",
  independent_sponsor: "Independent sponsor",
  strategic: "Strategic acquirer",
  other: "Other",
};
export const BUYER_ORGANIZATION_TYPES = [
  "buyer",
  "private_equity",
  "family_office",
  "search_fund",
  "independent_sponsor",
  "strategic",
] as const satisfies readonly OrganizationType[];
export const BUYER_PROJECT_STATUSES = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;
export type BuyerProjectStatus = (typeof BUYER_PROJECT_STATUSES)[number];
export const BUYER_PROJECT_TRANSACTION_TYPES = [
  "full_acquisition",
  "majority_acquisition",
  "minority_investment",
  "add_on",
  "recapitalization",
  "other",
] as const;
export type BuyerProjectTransactionType =
  (typeof BUYER_PROJECT_TRANSACTION_TYPES)[number];
export const BUYER_PROJECT_OWNERSHIP_PREFERENCES = [
  "100_percent",
  "majority",
  "minority",
  "flexible",
] as const;
export type BuyerProjectOwnershipPreference =
  (typeof BUYER_PROJECT_OWNERSHIP_PREFERENCES)[number];
export const DEAL_TRANSACTION_TYPES = BUYER_PROJECT_TRANSACTION_TYPES;
export type DealTransactionType = (typeof DEAL_TRANSACTION_TYPES)[number];
export const DEAL_DISTRIBUTION_MODES = [
  "invite_only",
  "private_outreach",
  "qualified_discovery",
] as const;
export type DealDistributionMode = (typeof DEAL_DISTRIBUTION_MODES)[number];
export const DEAL_FINANCIAL_PERIOD_TYPES = [
  "annual",
  "trailing_twelve_months",
  "year_to_date",
] as const;
export type DealFinancialPeriodType =
  (typeof DEAL_FINANCIAL_PERIOD_TYPES)[number];
export type BuyerProject = {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  name: string;
  status: BuyerProjectStatus;
  thesis: string;
  min_revenue: number | null;
  max_revenue: number | null;
  min_ebitda: number | null;
  max_ebitda: number | null;
  min_ebitda_margin: number | null;
  max_ebitda_margin: number | null;
  min_enterprise_value: number | null;
  max_enterprise_value: number | null;
  min_equity_check: number | null;
  max_equity_check: number | null;
  ownership_preference: BuyerProjectOwnershipPreference;
  transaction_type: BuyerProjectTransactionType;
  created_at: string;
  updated_at: string;
  sectors: string[];
  provinces: string[];
  keywords: string[];
  can_manage: boolean;
};
export type BuyerProjectSector = {
  id: string;
  buyer_project_id: string;
  sector: string;
  created_at: string;
};
export type BuyerProjectProvince = {
  id: string;
  buyer_project_id: string;
  province: string;
  created_at: string;
};
export type BuyerProjectKeyword = {
  id: string;
  buyer_project_id: string;
  keyword: string;
  created_at: string;
};
export type BuyerProjectFilters = {
  sectors?: string[];
  provinces?: string[];
  keywords?: string[];
  min_revenue?: number | null;
  max_revenue?: number | null;
  min_ebitda?: number | null;
  max_ebitda?: number | null;
  min_ebitda_margin?: number | null;
  max_ebitda_margin?: number | null;
  min_enterprise_value?: number | null;
  max_enterprise_value?: number | null;
  min_equity_check?: number | null;
  max_equity_check?: number | null;
};
export type BuyerProjectFilter = BuyerProjectFilters;
export type OrganizationMemberRole = "owner" | "admin" | "member" | "viewer";
export type User = {
  id: string;
  email: string;
  name: string;
  company: string;
  role: Role;
  province: string;
  bio: string;
  sectors: string;
  min_revenue: number;
  max_revenue: number;
  is_demo: number;
};
export type Organization = {
  id: string;
  name: string;
  slug: string;
  organization_type: OrganizationType;
  website: string;
  province: string;
  description: string;
  verification_status: string;
  created_at: string;
  updated_at: string;
  membership_role: OrganizationMemberRole;
  can_manage: boolean;
};
export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationMemberRole;
  status: "active" | "invited" | "suspended";
  created_at: string;
  name: string;
  email: string;
  persona: Role;
};
export type Deal = {
  id: string;
  title: string;
  company_name: string;
  sector: string;
  province: string;
  city: string;
  revenue: number;
  ebitda: number;
  asking_price: number;
  employees: number;
  founded: number;
  description: string;
  confidential_summary: string;
  transaction_type: DealTransactionType;
  ownership_percentage_available: number;
  seller_rollover_possible: number;
  seller_financing_possible: number;
  management_transition: string;
  reason_for_transaction: string;
  min_expected_value: number | null;
  max_expected_value: number | null;
  distribution_mode: DealDistributionMode;
  owner_id: string;
  advisor_id: string | null;
  owner_organization_id: string | null;
  advisor_organization_id: string | null;
  created_by_user_id: string | null;
  stage: string;
  published: number;
  created_at: string;
  access_status?: string;
  can_manage?: boolean;
  can_manage_owner_side?: boolean;
  has_access?: boolean;
  preview_only?: boolean;
  match_score?: number;
  match_reasons?: string[];
};
export type DealFinancial = {
  id: string;
  deal_id: string;
  fiscal_year: number;
  period_type: DealFinancialPeriodType;
  revenue: number;
  ebitda: number;
  gross_profit: number | null;
  is_projected: number;
  created_at: string;
  updated_at: string;
};
export const DEAL_MATCH_STATUSES = [
  "recommended",
  "selected",
  "excluded",
  "contacted",
] as const;
export type DealMatchStatus = (typeof DEAL_MATCH_STATUSES)[number];
export type DealMatch = {
  id: string;
  deal_id: string;
  buyer_project_id: string;
  buyer_organization_id: string;
  buyer_project_name: string;
  buyer_project_thesis: string;
  buyer_organization_name: string;
  buyer_organization_type: OrganizationType;
  buyer_organization_province: string;
  buyer_organization_verification_status: string;
  buyer_organization_website: string;
  buyer_organization_description: string;
  relevant_acquisitions: number;
  score: number;
  eligible: number;
  status: DealMatchStatus;
  score_breakdown: {
    reasons: Array<{
      dimension: string;
      score: number;
      maximum: number;
      explanation: string;
    }>;
    hard_exclusions: string[];
  };
  created_at: string;
  updated_at: string;
};
export type Access = {
  id: string;
  deal_id: string;
  buyer_id: string;
  status: string;
  nda_status: string;
  nda_document_id: string | null;
  notes: string;
  created_at: string;
  name: string;
  company: string;
  email: string;
};
export type Document = {
  id: string;
  deal_id: string;
  name: string;
  category: string;
  size: number;
  version: number;
  audience: string;
  buyer_id: string | null;
  uploaded_by: string;
  created_at: string;
  uploader_name: string;
  deal_title: string;
};
export type Message = {
  id: string;
  deal_id: string;
  buyer_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name: string;
  sender_role: Role;
  deal_title: string;
  buyer_name: string;
};
export type Task = {
  id: string;
  deal_id: string;
  title: string;
  due_date: string;
  status: string;
  buyer_id: string | null;
  created_by: string;
  created_at: string;
  deal_title: string;
};
export type Offer = {
  id: string;
  deal_id: string;
  buyer_id: string;
  amount: number;
  structure: string;
  notes: string;
  status: string;
  document_id: string;
  created_at: string;
  buyer_name: string;
};
export type Activity = {
  id: string;
  deal_id: string;
  actor_id: string;
  action: string;
  created_at: string;
  actor_name: string;
  deal_title: string;
};
export type WorkspaceData = {
  user: User;
  organization: Organization;
  organization_members: OrganizationMember[];
  buyer_projects: BuyerProject[];
  can_manage_buyer_projects: boolean;
  deals: Deal[];
  deal_matches?: DealMatch[];
  deal_financials: DealFinancial[];
  access: Access[];
  documents: Document[];
  messages: Message[];
  tasks: Task[];
  offers: Offer[];
  activity: Activity[];
  advisors: Pick<User, "id" | "name" | "company" | "province" | "bio">[];
  demo: boolean;
};
export const SECTORS = [
  "Business services",
  "Manufacturing",
  "Healthcare",
  "Technology",
  "Consumer & retail",
  "Food & beverage",
  "Transportation",
  "Construction",
];
export const PROVINCES = [
  "Ontario",
  "Québec",
  "British Columbia",
  "Alberta",
  "Manitoba",
  "Saskatchewan",
  "Nova Scotia",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Prince Edward Island",
  "Yukon",
  "Northwest Territories",
  "Nunavut",
];
export const STAGES = [
  "Preparation",
  "On market",
  "LOI review",
  "Due diligence",
  "Closing",
  "Closed",
];
export const money = (n: number, compact = true) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(n);
