-- Succera's complete structured-data schema, translated from the final SQLite
-- migration state. Existing text identifiers are intentionally preserved so a
-- one-time import can retain every relationship without remapping identities.

create table public.users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  name text not null,
  company text not null,
  role text not null check (role in ('buyer','owner','advisor')),
  province text not null default '',
  bio text not null default '',
  sectors text not null default '',
  min_revenue bigint not null default 1000000 check (min_revenue >= 0),
  max_revenue bigint not null default 20000000 check (max_revenue >= 0),
  is_demo smallint not null default 0 check (is_demo in (0,1)),
  is_platform_admin smallint not null default 0 check (is_platform_admin in (0,1)),
  check (min_revenue <= max_revenue)
);

create table public.sessions (
  token_hash text primary key,
  user_id text not null references public.users(id) on delete cascade,
  expires_at bigint not null
);

create table public.rate_limits (
  key text primary key,
  attempts integer not null check (attempts >= 0),
  resets_at bigint not null
);

create table public.organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  organization_type text not null check (organization_type in ('buyer','advisor','business','private_equity','family_office','search_fund','independent_sponsor','strategic','other')),
  website text not null default '',
  province text not null default '',
  description text not null default '',
  verification_status text not null default 'unverified' check (verification_status in ('unverified','email_verified','firm_verified','capital_reviewed','verified_acquirer','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id text primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  status text not null default 'active' check (status in ('active','invited','suspended')),
  created_at timestamptz not null default now(),
  unique (organization_id,user_id)
);

create table public.organization_public_profiles (
  organization_id text primary key references public.organizations(id) on delete cascade,
  is_public smallint not null default 0 check (is_public in (0,1)),
  headline text not null default '' check (length(headline) <= 160),
  public_description text not null default '' check (length(public_description) <= 4000),
  show_website smallint not null default 0 check (show_website in (0,1)),
  show_province smallint not null default 0 check (show_province in (0,1)),
  show_verified_transactions smallint not null default 0 check (show_verified_transactions in (0,1)),
  revision integer not null default 1 check (revision >= 1),
  updated_by_user_id text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_public_industries (
  organization_id text not null references public.organizations(id) on delete cascade,
  industry text not null check (industry in ('Business services','Manufacturing','Healthcare','Technology','Consumer & retail','Food & beverage','Transportation','Construction')),
  primary key (organization_id,industry)
);

create table public.organization_public_locations (
  organization_id text not null references public.organizations(id) on delete cascade,
  province text not null check (province in ('Ontario','Québec','British Columbia','Alberta','Manitoba','Saskatchewan','Nova Scotia','New Brunswick','Newfoundland and Labrador','Prince Edward Island','Yukon','Northwest Territories','Nunavut')),
  primary key (organization_id,province)
);

create function public.ensure_organization_public_profile() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.organization_public_profiles(organization_id)
  values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger organizations_public_profile_insert
after insert on public.organizations
for each row execute function public.ensure_organization_public_profile();

create table public.buyer_verification_profiles (
  organization_id text primary key references public.organizations(id) on delete cascade,
  legal_name text not null default '',
  principals text not null default '' check (length(principals) <= 4000),
  acquisition_history text not null default '' check (length(acquisition_history) <= 5000),
  capital_source text not null default '' check (length(capital_source) <= 3000),
  min_equity_check bigint check (min_equity_check is null or min_equity_check >= 0),
  max_equity_check bigint check (max_equity_check is null or max_equity_check >= 0),
  financing_approach text not null default '' check (length(financing_approach) <= 3000),
  submitted_at timestamptz,
  submitted_by_user_id text references public.users(id) on delete set null,
  updated_by_user_id text references public.users(id) on delete set null,
  submission_revision integer not null default 0 check (submission_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_equity_check is null or max_equity_check is null or min_equity_check <= max_equity_check)
);

create table public.verification_reviews (
  id text primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  reviewer_user_id text not null references public.users(id) on delete restrict,
  submission_revision integer not null default 0 check (submission_revision >= 0),
  previous_status text not null check (previous_status in ('unverified','email_verified','firm_verified','capital_reviewed','verified_acquirer','rejected')),
  decision text not null check (decision in ('email_verified','firm_verified','capital_reviewed','verified_acquirer','rejected')),
  notes text not null check (length(trim(notes)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table public.buyer_firm_profiles (
  organization_id text primary key references public.organizations(id) on delete cascade,
  fund_structure text not null default '' check (length(fund_structure) <= 2000),
  financing_profile text not null default '' check (length(financing_profile) <= 3000),
  self_reported_acquisition_count integer check (self_reported_acquisition_count between 0 and 10000),
  revision integer not null default 1 check (revision >= 1),
  updated_by_user_id text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.buyer_projects (
  id text primary key,
  organization_id text not null references public.organizations(id) on delete cascade,
  created_by_user_id text not null references public.users(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  thesis text not null default '',
  min_revenue bigint check (min_revenue is null or min_revenue >= 0),
  max_revenue bigint check (max_revenue is null or max_revenue >= 0),
  min_ebitda bigint check (min_ebitda is null or min_ebitda >= 0),
  max_ebitda bigint check (max_ebitda is null or max_ebitda >= 0),
  min_ebitda_margin numeric(5,2) check (min_ebitda_margin is null or min_ebitda_margin between 0 and 100),
  max_ebitda_margin numeric(5,2) check (max_ebitda_margin is null or max_ebitda_margin between 0 and 100),
  min_enterprise_value bigint check (min_enterprise_value is null or min_enterprise_value >= 0),
  max_enterprise_value bigint check (max_enterprise_value is null or max_enterprise_value >= 0),
  min_equity_check bigint check (min_equity_check is null or min_equity_check >= 0),
  max_equity_check bigint check (max_equity_check is null or max_equity_check >= 0),
  ownership_preference text not null default 'flexible' check (ownership_preference in ('100_percent','majority','minority','flexible')),
  transaction_type text not null default 'full_acquisition' check (transaction_type in ('full_acquisition','majority_acquisition','minority_investment','add_on','recapitalization','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_revenue is null or max_revenue is null or min_revenue <= max_revenue),
  check (min_ebitda is null or max_ebitda is null or min_ebitda <= max_ebitda),
  check (min_ebitda_margin is null or max_ebitda_margin is null or min_ebitda_margin <= max_ebitda_margin),
  check (min_enterprise_value is null or max_enterprise_value is null or min_enterprise_value <= max_enterprise_value),
  check (min_equity_check is null or max_equity_check is null or min_equity_check <= max_equity_check)
);

create table public.buyer_project_sectors (
  id text primary key,
  buyer_project_id text not null references public.buyer_projects(id) on delete cascade,
  sector text not null check (length(trim(sector)) > 0),
  created_at timestamptz not null default now(),
  unique (buyer_project_id,sector)
);

create table public.buyer_project_provinces (
  id text primary key,
  buyer_project_id text not null references public.buyer_projects(id) on delete cascade,
  province text not null check (length(trim(province)) > 0),
  created_at timestamptz not null default now(),
  unique (buyer_project_id,province)
);

create table public.buyer_project_keywords (
  id text primary key,
  buyer_project_id text not null references public.buyer_projects(id) on delete cascade,
  keyword text not null check (length(trim(keyword)) > 0),
  created_at timestamptz not null default now(),
  unique (buyer_project_id,keyword)
);

create table public.deals (
  id text primary key,
  title text not null,
  company_name text not null,
  sector text not null,
  province text not null,
  city text not null,
  revenue bigint not null,
  ebitda bigint not null,
  asking_price bigint not null,
  employees integer not null,
  founded integer not null,
  description text not null,
  confidential_summary text not null,
  owner_id text not null references public.users(id),
  advisor_id text references public.users(id),
  stage text not null default 'Preparation',
  published smallint not null default 0 check (published in (0,1)),
  created_at timestamptz not null default now(),
  owner_organization_id text references public.organizations(id),
  advisor_organization_id text references public.organizations(id),
  created_by_user_id text references public.users(id),
  transaction_type text not null default 'full_acquisition' check (transaction_type in ('full_acquisition','majority_acquisition','minority_investment','add_on','recapitalization','other')),
  ownership_percentage_available numeric(5,2) not null default 100 check (ownership_percentage_available between 0 and 100),
  seller_rollover_possible smallint not null default 0 check (seller_rollover_possible in (0,1)),
  seller_financing_possible smallint not null default 0 check (seller_financing_possible in (0,1)),
  management_transition text not null default '',
  reason_for_transaction text not null default '',
  min_expected_value bigint check (min_expected_value is null or min_expected_value >= 0),
  max_expected_value bigint check (max_expected_value is null or max_expected_value >= 0),
  distribution_mode text not null default 'private_outreach' check (distribution_mode in ('invite_only','private_outreach','qualified_discovery')),
  check (min_expected_value is null or max_expected_value is null or min_expected_value <= max_expected_value)
);

create table public.deal_financials (
  id text primary key,
  deal_id text not null references public.deals(id) on delete cascade,
  fiscal_year integer not null check (fiscal_year between 1800 and 2200),
  period_type text not null default 'annual' check (period_type in ('annual','trailing_twelve_months','year_to_date')),
  revenue bigint not null check (revenue >= 0),
  ebitda bigint not null,
  gross_profit bigint,
  is_projected smallint not null default 0 check (is_projected in (0,1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id,fiscal_year,period_type)
);

create table public.deal_internal_notes (
  id text primary key,
  deal_id text not null references public.deals(id) on delete cascade,
  author_user_id text references public.users(id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table public.deal_matches (
  id text primary key,
  deal_id text not null references public.deals(id) on delete cascade,
  buyer_project_id text not null references public.buyer_projects(id) on delete cascade,
  buyer_organization_id text not null references public.organizations(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  eligible smallint not null check (eligible in (0,1)),
  score_breakdown_json jsonb not null,
  status text not null default 'recommended' check (status in ('recommended','selected','excluded','contacted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id,buyer_project_id)
);

create table public.deal_outreach (
  id text primary key,
  deal_id text not null references public.deals(id) on delete cascade,
  sender_user_id text not null references public.users(id) on delete restrict,
  subject text not null check (length(trim(subject)) between 1 and 200),
  message text not null check (length(trim(message)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table public.deal_outreach_recipients (
  id text primary key,
  outreach_id text not null references public.deal_outreach(id) on delete cascade,
  buyer_organization_id text not null references public.organizations(id) on delete cascade,
  buyer_project_id text not null references public.buyer_projects(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','sent','viewed','pursued','passed','expired')),
  sent_at timestamptz,
  viewed_at timestamptz,
  pursued_at timestamptz,
  passed_at timestamptz,
  unique (outreach_id,buyer_project_id)
);

create table public.introduction_requests (
  id text primary key,
  deal_id text not null references public.deals(id) on delete cascade,
  buyer_organization_id text not null references public.organizations(id) on delete cascade,
  buyer_project_id text not null references public.buyer_projects(id) on delete restrict,
  requested_by_user_id text not null references public.users(id) on delete restrict,
  message text not null check (length(trim(message)) between 20 and 3000),
  status text not null default 'pending' check (status in ('pending','approved','declined','withdrawn')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id text references public.users(id) on delete restrict
);

create table public.access (
  id text primary key,
  deal_id text not null references public.deals(id),
  buyer_id text not null references public.users(id),
  status text not null default 'requested',
  nda_status text not null default 'not_requested',
  nda_document_id text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  nda_method text not null default 'external_upload' check (nda_method in ('external_upload','electronic_signature')),
  electronic_signature_envelope_id text,
  unique (deal_id,buyer_id)
);

create table public.documents (
  id text primary key,
  deal_id text not null references public.deals(id),
  name text not null,
  storage_key text not null,
  mime text not null,
  category text not null,
  size bigint not null check (size >= 0),
  version integer not null default 1,
  audience text not null check (audience in ('team','approved','buyer')),
  buyer_id text references public.users(id),
  uploaded_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  watermark_enabled smallint not null default 0 check (watermark_enabled in (0,1))
);

create table public.messages (
  id text primary key,
  deal_id text not null references public.deals(id),
  buyer_id text not null references public.users(id),
  sender_id text not null references public.users(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id text primary key,
  deal_id text not null references public.deals(id),
  title text not null,
  due_date date not null,
  status text not null default 'open',
  buyer_id text references public.users(id),
  created_by text not null references public.users(id),
  created_at timestamptz not null default now()
);

create table public.offers (
  id text primary key,
  deal_id text not null references public.deals(id),
  buyer_id text not null references public.users(id),
  amount bigint not null,
  structure text not null,
  notes text not null,
  status text not null default 'Submitted',
  document_id text not null references public.documents(id),
  created_at timestamptz not null default now()
);

create table public.activity (
  id text primary key,
  deal_id text not null references public.deals(id),
  actor_id text not null references public.users(id),
  action text not null,
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id text not null references public.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('new_match','opportunity_shared','introduction_requested','introduction_approved','buyer_pursued','nda_requested','nda_approved','new_message','new_task','document_shared','ioi_received','loi_received','access_revoked')),
  frequency text not null default 'immediate' check (frequency in ('immediate','daily_digest','weekly_digest','disabled')),
  updated_at timestamptz not null default now(),
  primary key (user_id,notification_type)
);

create table public.notifications (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  type text not null check (type in ('new_match','opportunity_shared','introduction_requested','introduction_approved','buyer_pursued','nda_requested','nda_approved','new_message','new_task','document_shared','ioi_received','loi_received','access_revoked')),
  title text not null check (length(trim(title)) between 1 and 160),
  body text not null check (length(trim(body)) between 1 and 1000),
  href text not null check (length(trim(href)) between 1 and 500),
  deal_id text references public.deals(id) on delete cascade,
  actor_user_id text references public.users(id) on delete set null,
  source_key text not null check (length(trim(source_key)) between 1 and 300),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id,source_key)
);

create table public.email_outbox (
  id text primary key,
  notification_id text not null unique references public.notifications(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  recipient_email text not null check (length(trim(recipient_email)) between 3 and 254),
  subject text not null check (length(trim(subject)) between 1 and 200),
  body text not null check (length(trim(body)) between 1 and 10000),
  frequency text not null check (frequency in ('immediate','daily_digest','weekly_digest')),
  status text not null default 'queued' check (status in ('recorded','queued','processing','sent','failed')),
  available_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  provider text,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  processing_at timestamptz,
  processing_token text
);

create table public.electronic_signature_envelopes (
  id text primary key,
  access_id text not null references public.access(id) on delete cascade,
  deal_id text not null references public.deals(id) on delete cascade,
  buyer_id text not null references public.users(id),
  provider text not null,
  provider_name text not null,
  provider_envelope_id text,
  status text not null check (status in ('creating','sent','buyer_signed','completed','declined','voided','failed')),
  executed_document_id text references public.documents(id),
  requested_by_user_id text not null references public.users(id),
  buyer_signed_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider,provider_envelope_id)
);

create table public.electronic_signature_events (
  id text primary key,
  envelope_id text not null references public.electronic_signature_envelopes(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  status text not null check (status in ('buyer_signed','completed','declined','voided','failed')),
  payload_digest text not null,
  occurred_at timestamptz,
  processed_at timestamptz not null default now(),
  unique (provider,provider_event_id)
);

create table public.document_watermark_variants (
  id text primary key,
  document_id text not null references public.documents(id) on delete cascade,
  buyer_id text not null references public.users(id) on delete cascade,
  storage_key text not null unique,
  source_sha256 text not null,
  watermark_signature text not null,
  content_sha256 text not null,
  generated_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  unique (document_id,buyer_id)
);

create table public.teaser_safety_reviews (
  id text primary key,
  deal_id text not null references public.deals(id) on delete cascade,
  requested_by_user_id text not null references public.users(id),
  provider text not null,
  provider_name text not null,
  external_data_processing smallint not null default 0 check (external_data_processing in (0,1)),
  input_sha256 text not null,
  status text not null check (status in ('ready','attention','high_risk')),
  findings_json jsonb not null,
  suggested_teaser text not null,
  investment_highlights_json jsonb not null,
  missing_financials_json jsonb not null,
  applied_at timestamptz,
  applied_by_user_id text references public.users(id),
  created_at timestamptz not null default now()
);

create table public.closed_transactions (
  id text primary key,
  buyer_organization_id text not null references public.organizations(id) on delete cascade,
  seller_organization_id text references public.organizations(id) on delete set null,
  advisor_organization_id text references public.organizations(id) on delete set null,
  industry text not null check (length(trim(industry)) between 2 and 160),
  province text not null check (length(trim(province)) between 2 and 100),
  enterprise_value bigint check (enterprise_value between 0 and 10000000000),
  closed_date date not null,
  description text not null check (length(trim(description)) between 10 and 2000),
  verified smallint not null default 0 check (verified in (0,1)),
  created_by_user_id text references public.users(id) on delete set null,
  verified_by_user_id text references public.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  public_slug text check (public_slug is null or (length(trim(public_slug)) between 8 and 220 and public_slug ~ '^[a-z0-9-]+$')),
  public_opt_in smallint not null default 0 check (public_opt_in in (0,1)),
  check ((verified=0 and verified_by_user_id is null and verified_at is null) or (verified=1 and verified_by_user_id is not null and verified_at is not null))
);

create table public.deal_buyer_events (
  id text primary key,
  deal_id text not null references public.deals(id) on delete cascade,
  buyer_organization_id text not null references public.organizations(id) on delete cascade,
  buyer_project_id text references public.buyer_projects(id) on delete set null,
  event_type text not null check (event_type in ('matched','selected','excluded','teaser_sent','teaser_viewed','pursued','passed','intro_requested','intro_approved','intro_declined','nda_requested','nda_uploaded','nda_approved','cim_shared','ioi_received','loi_received','shortlisted','not_proceeding','exclusive','closed','access_revoked')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id text references public.users(id) on delete set null,
  source_key text not null check (length(trim(source_key)) > 0),
  created_at timestamptz not null default now(),
  unique (deal_id,buyer_organization_id,event_type,source_key)
);

create table public.transaction_attribution (
  id text primary key,
  deal_id text not null references public.deals(id) on delete cascade,
  buyer_organization_id text not null references public.organizations(id) on delete cascade,
  source text not null check (source in ('acquire_match','seller_invitation','buyer_discovery','external_relationship')),
  introduced_by_acquire smallint not null check ((source in ('acquire_match','buyer_discovery') and introduced_by_acquire=1) or (source in ('seller_invitation','external_relationship') and introduced_by_acquire=0)),
  introduction_date date not null,
  closed_date date,
  enterprise_value bigint check (enterprise_value between 0 and 10000000000),
  origin_event_id text references public.deal_buyer_events(id) on delete set null,
  created_by_user_id text references public.users(id) on delete set null,
  updated_by_user_id text references public.users(id) on delete set null,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id,buyer_organization_id),
  check ((closed_date is null and enterprise_value is null) or (closed_date is not null and enterprise_value is not null)),
  check (closed_date is null or closed_date >= introduction_date)
);

create table public.matching_engine_state (key text primary key, value text not null, updated_at timestamptz not null default now());
create table public.buyer_funnel_state (key text primary key, value text not null, updated_at timestamptz not null default now());
create table public.transaction_attribution_state (key text primary key, value text not null, updated_at timestamptz not null default now());

create index idx_access_buyer on public.access(buyer_id);
create index idx_docs_deal on public.documents(deal_id);
create index idx_messages_deal on public.messages(deal_id,buyer_id);
create index idx_deals_owner on public.deals(owner_id,advisor_id);
create index idx_deals_owner_organization on public.deals(owner_organization_id);
create index idx_deals_advisor_organization on public.deals(advisor_organization_id);
create index idx_organization_members_user on public.organization_members(user_id,status);
create index idx_organization_members_organization on public.organization_members(organization_id,status);
create index idx_buyer_projects_created_by on public.buyer_projects(created_by_user_id);
create index idx_buyer_projects_organization_status on public.buyer_projects(organization_id,status);
create index idx_buyer_project_sectors_project on public.buyer_project_sectors(buyer_project_id);
create index idx_buyer_project_provinces_project on public.buyer_project_provinces(buyer_project_id);
create index idx_buyer_project_keywords_project on public.buyer_project_keywords(buyer_project_id);
create index idx_deal_financials_deal_period on public.deal_financials(deal_id,fiscal_year desc,period_type);
create index idx_deal_internal_notes_deal_created on public.deal_internal_notes(deal_id,created_at desc,id desc);
create index idx_deal_matches_deal_eligible_score on public.deal_matches(deal_id,eligible,score desc);
create index idx_deal_matches_project_eligible_score on public.deal_matches(buyer_project_id,eligible,score desc);
create index idx_deal_matches_buyer_organization on public.deal_matches(buyer_organization_id,eligible,score desc);
create index idx_deal_outreach_deal_created on public.deal_outreach(deal_id,created_at desc);
create index idx_outreach_recipients_organization_status on public.deal_outreach_recipients(buyer_organization_id,status);
create index idx_outreach_recipients_project on public.deal_outreach_recipients(buyer_project_id);
create unique index idx_introduction_requests_active_decision on public.introduction_requests(deal_id,buyer_organization_id) where status <> 'withdrawn';
create index idx_introduction_requests_buyer_status on public.introduction_requests(buyer_organization_id,status,created_at desc);
create index idx_introduction_requests_deal_status on public.introduction_requests(deal_id,status,created_at desc);
create index idx_introduction_requests_project on public.introduction_requests(buyer_project_id);
create index idx_notifications_user_created on public.notifications(user_id,created_at desc,id desc);
create index idx_notifications_user_unread on public.notifications(user_id,read_at,created_at desc);
create index idx_email_outbox_delivery on public.email_outbox(status,available_at,created_at);
create index idx_email_outbox_user on public.email_outbox(user_id,created_at desc);
create index idx_email_outbox_processing_token on public.email_outbox(processing_token);
create index idx_electronic_signature_envelopes_access on public.electronic_signature_envelopes(access_id,created_at desc);
create index idx_electronic_signature_envelopes_deal on public.electronic_signature_envelopes(deal_id,buyer_id,status);
create index idx_electronic_signature_events_envelope on public.electronic_signature_events(envelope_id,processed_at desc);
create index idx_teaser_safety_reviews_deal_created on public.teaser_safety_reviews(deal_id,created_at desc);
create index idx_closed_transactions_buyer on public.closed_transactions(buyer_organization_id,closed_date desc,id);
create index idx_closed_transactions_review on public.closed_transactions(verified,created_at,id);
create unique index idx_closed_transactions_public_slug on public.closed_transactions(public_slug) where public_slug is not null;
create index idx_closed_transactions_public_feed on public.closed_transactions(closed_date desc,public_slug) where verified=1 and public_opt_in=1 and public_slug is not null;
create index idx_deal_buyer_events_buyer_created on public.deal_buyer_events(buyer_organization_id,created_at,id);
create index idx_deal_buyer_events_deal_created on public.deal_buyer_events(deal_id,created_at,id);
create index idx_transaction_attribution_deal on public.transaction_attribution(deal_id,introduction_date,buyer_organization_id);
create index idx_transaction_attribution_buyer on public.transaction_attribution(buyer_organization_id,introduction_date,deal_id);

-- Custom Succera authentication is server-side. The Data API receives no table
-- privileges and no auth.uid()-based policies are installed.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema public from anon;
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema public from authenticated;
    revoke all on all tables in schema public from authenticated;
    revoke all on all sequences in schema public from authenticated;
  end if;
  for table_name in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

alter default privileges in schema public revoke all on tables from public;
alter default privileges in schema public revoke all on sequences from public;
