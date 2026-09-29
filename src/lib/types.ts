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
export const BUYER_VERIFICATION_STATUSES = [
  "unverified",
  "email_verified",
  "firm_verified",
  "capital_reviewed",
  "verified_acquirer",
  "rejected",
] as const;
export type BuyerVerificationStatus =
  (typeof BUYER_VERIFICATION_STATUSES)[number];
export const BUYER_VERIFICATION_STATUS_LABELS: Record<
  BuyerVerificationStatus,
  string
> = {
  unverified: "Unverified",
  email_verified: "Email verified",
  firm_verified: "Firm verified",
  capital_reviewed: "Capital reviewed",
  verified_acquirer: "Verified acquirer",
  rejected: "Needs attention",
};
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
  is_platform_admin: number;
};
export type Organization = {
  id: string;
  name: string;
  slug: string;
  organization_type: OrganizationType;
  website: string;
  province: string;
  description: string;
  verification_status: BuyerVerificationStatus;
  created_at: string;
  updated_at: string;
  membership_role: OrganizationMemberRole;
  can_manage: boolean;
};
export type BuyerVerificationProfile = {
  organization_id: string;
  legal_name: string;
  website: string;
  buyer_type: OrganizationType;
  principals: string;
  acquisition_history: string;
  capital_source: string;
  min_equity_check: number | null;
  max_equity_check: number | null;
  financing_approach: string;
  submitted_at: string | null;
  submitted_by_user_id: string | null;
  submission_revision: number;
  updated_at: string;
  can_manage: boolean;
};
export type BuyerFirmProfile = {
  organization_id: string;
  fund_structure: string;
  financing_profile: string;
  self_reported_acquisition_count: number | null;
  revision: number;
  updated_at: string;
  can_manage: boolean;
};
export type ClosedTransactionVerificationLabel =
  "Self-reported" | "Succera verified";
export type ClosedTransaction = {
  id: string;
  buyer_organization_id: string;
  seller_organization_id: string | null;
  advisor_organization_id: string | null;
  industry: string;
  province: string;
  enterprise_value: number | null;
  closed_date: string;
  description: string;
  verified: number;
  verification_label: ClosedTransactionVerificationLabel;
  created_by_user_id: string | null;
  verified_by_user_id: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  can_manage: boolean;
};
export type SellerVisibleClosedTransaction = Pick<
  ClosedTransaction,
  | "id"
  | "industry"
  | "province"
  | "enterprise_value"
  | "closed_date"
  | "description"
  | "verified"
  | "verification_label"
>;
export type ClosedTransactionReviewEntry = ClosedTransaction & {
  buyer_organization_name: string;
  submitted_by_name: string | null;
};
export type SellerVisibleBuyerProject = {
  id: string;
  name: string;
  min_revenue: number | null;
  max_revenue: number | null;
  min_ebitda: number | null;
  max_ebitda: number | null;
  min_equity_check: number | null;
  max_equity_check: number | null;
  ownership_preference: BuyerProjectOwnershipPreference;
  transaction_type: BuyerProjectTransactionType;
  sectors: string[];
  provinces: string[];
};
export type BuyerReputationMetrics = {
  response_rate: number | null;
  response_opportunities: number;
  median_response_hours: number | null;
  opportunities_pursued: number;
  lois_submitted: number;
  transactions_closed: number;
  relevant_transactions: number;
};
export type SellerVisibleBuyerFirmProfile = Pick<
  BuyerFirmProfile,
  | "organization_id"
  | "fund_structure"
  | "financing_profile"
  | "self_reported_acquisition_count"
  | "updated_at"
> & {
  active_projects: SellerVisibleBuyerProject[];
  closed_transactions: SellerVisibleClosedTransaction[];
  reputation: BuyerReputationMetrics;
};
export type VerificationReview = {
  id: string;
  organization_id: string;
  organization_name: string;
  reviewer_user_id: string;
  reviewer_name: string;
  submission_revision: number;
  previous_status: BuyerVerificationStatus;
  decision: Exclude<BuyerVerificationStatus, "unverified">;
  notes: string;
  created_at: string;
};
export type VerificationAdminEntry = BuyerVerificationProfile & {
  organization_name: string;
  province: string;
  verification_status: BuyerVerificationStatus;
  submitted_by_name: string | null;
  latest_decision: Exclude<BuyerVerificationStatus, "unverified"> | null;
  latest_review_notes: string | null;
  latest_reviewed_at: string | null;
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
  matched_project_id?: string;
  matched_project_name?: string;
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
  buyer_organization_verification_status: BuyerVerificationStatus;
  buyer_organization_website: string;
  buyer_organization_description: string;
  buyer_firm_profile: SellerVisibleBuyerFirmProfile;
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
export const DEAL_OUTREACH_RECIPIENT_STATUSES = [
  "queued",
  "sent",
  "viewed",
  "pursued",
  "passed",
  "expired",
] as const;
export type DealOutreachRecipientStatus =
  (typeof DEAL_OUTREACH_RECIPIENT_STATUSES)[number];
export type DealOutreachRecipient = {
  id: string;
  outreach_id: string;
  deal_id: string;
  sender_user_id: string;
  sender_name: string;
  subject: string;
  message: string;
  created_at: string;
  buyer_organization_id: string;
  buyer_organization_name: string;
  buyer_project_id: string;
  buyer_project_name: string;
  status: DealOutreachRecipientStatus;
  sent_at: string | null;
  viewed_at: string | null;
  pursued_at: string | null;
  passed_at: string | null;
  match_score: number;
  match_reasons: string[];
};
export const INTRODUCTION_REQUEST_STATUSES = [
  "pending",
  "approved",
  "declined",
  "withdrawn",
] as const;
export type IntroductionRequestStatus =
  (typeof INTRODUCTION_REQUEST_STATUSES)[number];
export type IntroductionRequest = {
  id: string;
  deal_id: string;
  deal_title: string;
  buyer_organization_id: string;
  buyer_organization_name: string;
  buyer_organization_verification_status: BuyerVerificationStatus;
  buyer_project_id: string;
  buyer_project_name: string;
  requested_by_user_id: string;
  requested_by_user_name: string;
  message: string;
  status: IntroductionRequestStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  match_score: number;
  match_reasons: string[];
  relevant_acquisitions: number;
};
export const DEAL_BUYER_EVENT_TYPES = [
  "matched",
  "selected",
  "excluded",
  "teaser_sent",
  "teaser_viewed",
  "pursued",
  "passed",
  "intro_requested",
  "intro_approved",
  "intro_declined",
  "nda_requested",
  "nda_uploaded",
  "nda_approved",
  "cim_shared",
  "ioi_received",
  "loi_received",
  "shortlisted",
  "not_proceeding",
  "exclusive",
  "closed",
  "access_revoked",
] as const;
export type DealBuyerEventType = (typeof DEAL_BUYER_EVENT_TYPES)[number];
export const BUYER_FUNNEL_STAGES = [
  "Recommended",
  "Contacted",
  "Interested",
  "NDA",
  "CIM",
  "IOI",
  "LOI",
  "Exclusive",
  "Closed",
] as const;
export type BuyerFunnelStage = (typeof BUYER_FUNNEL_STAGES)[number];
export type DealBuyerEvent = {
  id: string;
  deal_id: string;
  buyer_organization_id: string;
  buyer_project_id: string | null;
  buyer_project_name: string | null;
  event_type: DealBuyerEventType;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
  created_by_user_name: string | null;
  created_at: string;
};
export type BuyerFunnelEntry = {
  deal_id: string;
  buyer_organization_id: string;
  buyer_organization_name: string;
  buyer_organization_verification_status: BuyerVerificationStatus;
  buyer_project_id: string | null;
  buyer_project_name: string | null;
  match_score: number | null;
  match_status: DealMatchStatus | null;
  current_stage: BuyerFunnelStage;
  outcome: string;
  first_contacted_at: string | null;
  last_event_at: string;
  response_hours: number | null;
  events: DealBuyerEvent[];
};
export type BuyerFunnelMetrics = {
  stage_counts: Record<BuyerFunnelStage, number>;
  pursuit_rate: number | null;
  nda_conversion: number | null;
  cim_conversion: number | null;
  ioi_conversion: number | null;
  loi_conversion: number | null;
  average_response_hours: number | null;
};
export type DealBuyerFunnel = {
  deal_id: string;
  buyers: BuyerFunnelEntry[];
  metrics: BuyerFunnelMetrics;
};
export type Access = {
  id: string;
  deal_id: string;
  buyer_id: string;
  status: string;
  nda_status: string;
  nda_document_id: string | null;
  nda_method: "external_upload" | "electronic_signature";
  electronic_signature_envelope_id: string | null;
  notes: string;
  created_at: string;
  name: string;
  company: string;
  email: string;
};
export const ELECTRONIC_SIGNATURE_STATUSES = [
  "creating",
  "sent",
  "buyer_signed",
  "completed",
  "declined",
  "voided",
  "failed",
] as const;
export type ElectronicSignatureStatus =
  (typeof ELECTRONIC_SIGNATURE_STATUSES)[number];
export type ElectronicSignatureEnvelope = {
  id: string;
  access_id: string;
  deal_id: string;
  buyer_id: string;
  provider_name: string;
  status: ElectronicSignatureStatus;
  buyer_signed_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};
export type ElectronicSignatureCapability = {
  available: boolean;
  provider_name: string | null;
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
export type DealInternalNote = {
  id: string;
  deal_id: string;
  author_user_id: string | null;
  body: string;
  created_at: string;
  author_name: string;
  author_role: Role | null;
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
export const NOTIFICATION_TYPES = [
  "new_match",
  "opportunity_shared",
  "introduction_requested",
  "introduction_approved",
  "buyer_pursued",
  "nda_requested",
  "nda_approved",
  "new_message",
  "new_task",
  "document_shared",
  "ioi_received",
  "loi_received",
  "access_revoked",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const NOTIFICATION_FREQUENCIES = [
  "immediate",
  "daily_digest",
  "weekly_digest",
  "disabled",
] as const;
export type NotificationFrequency = (typeof NOTIFICATION_FREQUENCIES)[number];
export type Notification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  deal_id: string | null;
  actor_user_id: string | null;
  read_at: string | null;
  created_at: string;
};
export type NotificationPreferences = Record<
  NotificationType,
  NotificationFrequency
>;
export type WorkspaceData = {
  user: User;
  organization: Organization;
  organization_members: OrganizationMember[];
  buyer_projects: BuyerProject[];
  can_manage_buyer_projects: boolean;
  deals: Deal[];
  deal_matches?: DealMatch[];
  deal_outreach: DealOutreachRecipient[];
  introduction_requests: IntroductionRequest[];
  buyer_funnels?: DealBuyerFunnel[];
  deal_internal_notes?: DealInternalNote[];
  qualified_discovery_min_score: number;
  qualified_discovery_min_verification_status: BuyerVerificationStatus;
  deal_financials: DealFinancial[];
  access: Access[];
  electronic_signature: ElectronicSignatureCapability;
  electronic_signature_envelopes: ElectronicSignatureEnvelope[];
  documents: Document[];
  messages: Message[];
  tasks: Task[];
  offers: Offer[];
  activity: Activity[];
  notifications: Notification[];
  notification_unread_count: number;
  notification_preferences: NotificationPreferences;
  buyer_verification_profile?: BuyerVerificationProfile;
  buyer_firm_profile?: BuyerFirmProfile;
  closed_transactions: ClosedTransaction[];
  is_platform_admin: boolean;
  verification_admin_queue?: VerificationAdminEntry[];
  verification_reviews?: VerificationReview[];
  closed_transaction_review_queue?: ClosedTransactionReviewEntry[];
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
