create table public.buyer_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','needs_info','approved','rejected')),
  buyer_type text not null check (buyer_type in ('independent_sponsor','search_fund','self_funded_searcher','private_equity_firm','family_office','holding_company','strategic_corporate_acquirer','individual_buyer','other')),
  linkedin_url text,
  website_url text,
  source_of_capital text not null check (source_of_capital in ('personal_capital','committed_investment_fund','family_office_capital','corporate_balance_sheet','investor_sponsor_equity','equity_plus_acquisition_financing','other')),
  equity_range text not null check (equity_range in ('under_250k','250k_500k','500k_1m','1m_2_5m','2_5m_5m','5m_plus')),
  completed_acquisitions integer not null default 0 check (completed_acquisitions >= 0),
  experience_summary text not null check (length(trim(experience_summary)) between 20 and 4000),
  acquisition_strategy text not null check (length(trim(acquisition_strategy)) between 20 and 4000),
  authorized_to_represent boolean not null default false,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text references public.users(id) on delete set null,
  review_notes text not null default '' check (length(review_notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_buyer_verifications_status on public.buyer_verifications(status);
alter table public.buyer_verifications enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.buyer_verifications from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.buyer_verifications from authenticated;
  end if;
end $$;
