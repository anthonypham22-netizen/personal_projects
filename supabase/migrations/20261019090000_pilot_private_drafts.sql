-- Focused pilot: let owners create truthful private drafts before all optional
-- operating and valuation details are known. Existing zero values are left
-- unchanged; this migration does not reinterpret historical data.
alter table public.deals
  alter column city drop not null,
  alter column revenue drop not null,
  alter column ebitda drop not null,
  alter column asking_price drop not null,
  alter column employees drop not null,
  alter column founded drop not null;

