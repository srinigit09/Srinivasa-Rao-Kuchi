-- ============================================================
-- RentEase — Complete Supabase PostgreSQL Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ✅ Safe to re-run on existing databases — all statements are idempotent
-- ✅ New install: creates all tables, policies, indexes, views, seed data
-- ✅ Upgrade: adds missing columns / constraints via ALTER TABLE IF NOT EXISTS
-- Last updated: Added NoticePeriodTenants support; removed upi/bank from
--   Settings UI (columns kept in DB for backward compatibility)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. PROFILES
--    One row per authenticated landlord / property manager.
--    Admin users have role = 'admin'.
-- ============================================================
create table if not exists public.profiles (
  id                           uuid        primary key references auth.users(id) on delete cascade,
  full_name                    text,
  email                        text,
  phone                        text,
  phone_number                 text,
  dob                          date,
  role                         text        not null default 'client'
                                           check (role in ('admin', 'client')),
  is_active                    boolean     not null default true,
  valid_until                  timestamptz default (now() + interval '30 days'),
  -- payment details (kept for backward compat; no longer shown in Settings UI)
  upi_id                       text,
  bank_name                    text,
  bank_account                 text,
  bank_ifsc                    text,
  -- subscription
  subscription_plan            text        default 'unlimited',
  subscription_starts_at       timestamptz,
  subscription_expires_at      timestamptz,
  subscription_tenant_count    integer     default 0,
  subscription_property_count  integer     default 0,
  created_at                   timestamptz default now()
);

-- Idempotent column additions (safe on fresh or upgraded databases)
alter table public.profiles add column if not exists email                        text;
alter table public.profiles add column if not exists phone                        text;
alter table public.profiles add column if not exists phone_number                 text;
alter table public.profiles add column if not exists dob                          date;
alter table public.profiles add column if not exists upi_id                       text;
alter table public.profiles add column if not exists bank_name                    text;
alter table public.profiles add column if not exists bank_account                 text;
alter table public.profiles add column if not exists bank_ifsc                    text;
alter table public.profiles add column if not exists subscription_plan            text default 'unlimited';
alter table public.profiles add column if not exists subscription_starts_at       timestamptz;
alter table public.profiles add column if not exists subscription_expires_at      timestamptz;
alter table public.profiles add column if not exists subscription_tenant_count    integer default 0;
alter table public.profiles add column if not exists subscription_property_count  integer default 0;

-- Unique index on phone_number (nulls are allowed and ignored)
create unique index if not exists profiles_phone_number_key
  on public.profiles (phone_number)
  where phone_number is not null;

-- ── Row Level Security ────────────────────────────────────
alter table public.profiles enable row level security;

-- Helper: returns caller's role without triggering RLS recursion
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

drop policy if exists "Owner only"               on public.profiles;
drop policy if exists "Allow select own or admin" on public.profiles;
drop policy if exists "Allow update own or admin" on public.profiles;
drop policy if exists "Allow insert own or admin" on public.profiles;
drop policy if exists "Allow delete admin"        on public.profiles;

create policy "Allow select own or admin" on public.profiles
  for select using (auth.uid() = id or public.get_my_role() = 'admin');

create policy "Allow insert own or admin" on public.profiles
  for insert with check (auth.uid() = id or public.get_my_role() = 'admin');

create policy "Allow update own or admin" on public.profiles
  for update using (auth.uid() = id or public.get_my_role() = 'admin');

create policy "Allow delete admin" on public.profiles
  for delete using (public.get_my_role() = 'admin');

notify pgrst, 'reload schema';

-- ============================================================
-- 2. BUILDINGS / PROPERTIES / COMMUNITIES
-- ============================================================
create table if not exists public.buildings (
  id                          uuid        primary key default uuid_generate_v4(),
  owner_id                    uuid        not null references public.profiles(id) on delete cascade,
  name                        text        not null,
  address                     text,
  building_type               text        not null default 'residential',
  society_name                text,
  monthly_maintenance_charge  numeric(10,2) default 0,
  maintenance_due_day         int         default 5,
  amenities                   text[]      default '{}',
  gate_phone                  text,
  rules                       text,
  created_at                  timestamptz default now()
);

-- Idempotent column additions
alter table public.buildings add column if not exists society_name                text;
alter table public.buildings add column if not exists monthly_maintenance_charge  numeric(10,2) default 0;
alter table public.buildings add column if not exists maintenance_due_day         int default 5;
alter table public.buildings add column if not exists amenities                   text[] default '{}';
alter table public.buildings add column if not exists gate_phone                  text;
alter table public.buildings add column if not exists rules                       text;

-- Re-apply building_type check to include all supported property types
alter table public.buildings drop constraint if exists buildings_building_type_check;
alter table public.buildings add constraint buildings_building_type_check check (
  building_type in (
    'residential',       -- Multi-storied / Flats
    'individual_house',  -- Independent House / Villa / Bungalow
    'commercial',        -- Shops, Offices, Showrooms, Warehouses
    'pg',                -- PG / Hostel / Bed-sharing
    'apartment',         -- Standalone Apartment block
    'gated_community'    -- Gated Community / Society with amenities
  )
);

-- ── Row Level Security ────────────────────────────────────
alter table public.buildings enable row level security;
drop policy if exists "Owner only" on public.buildings;
create policy "Owner only" on public.buildings using (auth.uid() = owner_id);

-- ============================================================
-- 3. UNITS (Flats, Houses, Rooms, PG Beds, Shops, etc.)
-- ============================================================
create table if not exists public.units (
  id                  uuid          primary key default uuid_generate_v4(),
  building_id         uuid          not null references public.buildings(id) on delete cascade,
  owner_id            uuid          not null references public.profiles(id) on delete cascade,
  unit_number         text          not null,
  unit_type           text          not null,
  floor_number        text,
  total_beds          int           default 1,
  rent_per_bed        numeric(10,2) not null default 0,
  monthly_maintenance numeric(10,2) default 0,
  resident_type       text          default 'tenant'
                                    check (resident_type in ('tenant', 'owner_occupant')),
  is_vacant           boolean       not null default true,
  created_at          timestamptz   default now()
);

-- Idempotent column additions
alter table public.units add column if not exists floor_number        text;
alter table public.units add column if not exists monthly_maintenance numeric(10,2) default 0;
alter table public.units add column if not exists resident_type       text default 'tenant';

-- ── Row Level Security ────────────────────────────────────
alter table public.units enable row level security;
drop policy if exists "Owner only" on public.units;
create policy "Owner only" on public.units using (auth.uid() = owner_id);

-- ============================================================
-- 4. TENANTS / OCCUPANTS / RESIDENTS
-- ============================================================
create table if not exists public.tenants (
  id                   uuid          primary key default uuid_generate_v4(),
  owner_id             uuid          not null references public.profiles(id) on delete cascade,
  unit_id              uuid          not null references public.units(id) on delete cascade,
  full_name            text          not null,
  phone                text          not null,
  email                text,
  id_type              text,
  id_number            text,
  resident_type        text          default 'tenant',
  stay_type            text          default 'month'
                                     check (stay_type in ('month', 'week', 'day')),
  move_in_date         date          not null,
  move_out_date        date,
  notice_date          date,
  -- expected_vacate_date: set when tenant gives notice / is placed under notice period.
  -- Queried by NoticePeriodTenantsScreen: WHERE expected_vacate_date >= today AND is_active = true
  expected_vacate_date date,
  rent_override        numeric(10,2),
  deposit_amount       numeric(10,2) default 0,
  deposit_returned     numeric(10,2) default 0,
  emergency_name       text,
  emergency_phone      text,
  notes                text,
  is_active            boolean       not null default true,
  created_at           timestamptz   default now()
);

-- Idempotent column / constraint additions
alter table public.tenants add column if not exists resident_type        text default 'tenant';
alter table public.tenants add column if not exists stay_type            text default 'month';
alter table public.tenants add column if not exists notice_date          date;
alter table public.tenants add column if not exists expected_vacate_date date;
alter table public.tenants add column if not exists deposit_returned     numeric(10,2) default 0;
alter table public.tenants add column if not exists emergency_name       text;
alter table public.tenants add column if not exists emergency_phone      text;

-- Resident type constraint (tenant / owner_occupant / guest)
alter table public.tenants drop constraint if exists tenants_resident_type_check;
alter table public.tenants add constraint tenants_resident_type_check
  check (resident_type in ('tenant', 'owner_occupant', 'guest'));

-- ── Row Level Security ────────────────────────────────────
alter table public.tenants enable row level security;
drop policy if exists "Owner only" on public.tenants;
create policy "Owner only" on public.tenants using (auth.uid() = owner_id);

-- ============================================================
-- 5. PAYMENTS & DUES
--    outstanding and status are GENERATED columns — never UPDATE them directly.
-- ============================================================

-- Drop the view that depends on generated columns before we recreate them
drop view if exists public.v_monthly_summary;

create table if not exists public.payments (
  id                 uuid          primary key default uuid_generate_v4(),
  owner_id           uuid          not null references public.profiles(id) on delete cascade,
  tenant_id          uuid          not null references public.tenants(id) on delete cascade,
  payment_month      date          not null,
  amount_due         numeric(10,2) not null,
  amount_paid        numeric(10,2) not null default 0,
  advance_paid       numeric(10,2) not null default 0,
  payment_date       date,
  payment_mode       text          check (payment_mode in ('Cash','UPI','Bank Transfer','Cheque')),
  electricity        numeric(10,2) default 0,
  water              numeric(10,2) default 0,
  maintenance_charge numeric(10,2) default 0,
  other_charges      numeric(10,2) default 0,
  other_label        text,
  notes              text,
  receipt_number     text          unique,
  created_at         timestamptz   default now()
  -- NOTE: outstanding and status are added as generated columns below
  --       so they cannot appear in the CREATE TABLE column list
);

-- Idempotent column additions (non-generated)
alter table public.payments add column if not exists advance_paid       numeric(10,2) not null default 0;
alter table public.payments add column if not exists maintenance_charge numeric(10,2) default 0;
alter table public.payments add column if not exists electricity        numeric(10,2) default 0;
alter table public.payments add column if not exists water              numeric(10,2) default 0;
alter table public.payments add column if not exists other_charges      numeric(10,2) default 0;
alter table public.payments add column if not exists other_label        text;
alter table public.payments add column if not exists notes              text;
alter table public.payments add column if not exists receipt_number     text;

-- Drop and re-create generated columns (idempotent)
alter table public.payments drop column if exists outstanding;
alter table public.payments drop column if exists status;
alter table public.payments
  add column outstanding numeric(10,2) generated always as (
    amount_due
    + coalesce(electricity, 0)
    + coalesce(water, 0)
    + coalesce(maintenance_charge, 0)
    + coalesce(other_charges, 0)
    - amount_paid
    - coalesce(advance_paid, 0)
  ) stored,
  add column status text generated always as (
    case
      when amount_paid = 0 and coalesce(advance_paid, 0) = 0 then 'Pending'
      when (amount_paid + coalesce(advance_paid, 0)) >=
           (amount_due + coalesce(electricity, 0) + coalesce(water, 0)
            + coalesce(maintenance_charge, 0) + coalesce(other_charges, 0))
        then 'Paid'
      else 'Partial'
    end
  ) stored;

-- Unique receipt number index (null-safe)
create unique index if not exists payments_receipt_number_key
  on public.payments (receipt_number)
  where receipt_number is not null;

-- ── Row Level Security ────────────────────────────────────
alter table public.payments enable row level security;
drop policy if exists "Owner only" on public.payments;
create policy "Owner only" on public.payments using (auth.uid() = owner_id);

-- ============================================================
-- 6. MAINTENANCE REQUESTS & SERVICE TRACKING
-- ============================================================
create table if not exists public.maintenance_requests (
  id               uuid          primary key default uuid_generate_v4(),
  owner_id         uuid          not null references public.profiles(id) on delete cascade,
  building_id      uuid          not null references public.buildings(id) on delete cascade,
  unit_id          uuid          references public.units(id) on delete set null,
  tenant_id        uuid          references public.tenants(id) on delete set null,
  title            text          not null,
  description      text          not null,
  category         text          not null default 'Plumbing',
  priority         text          not null default 'Medium'
                                 check (priority in ('Low', 'Medium', 'High', 'Emergency')),
  status           text          not null default 'Reported'
                                 check (status in ('Reported', 'In Progress', 'Scheduled', 'Resolved', 'Cancelled')),
  estimated_cost   numeric(10,2),
  actual_cost      numeric(10,2),
  vendor_name      text,
  vendor_phone     text,
  reported_by      text,
  scheduled_date   timestamptz,
  resolved_date    timestamptz,
  resolution_notes text,
  created_at       timestamptz   default now()
);

-- Idempotent column additions
alter table public.maintenance_requests add column if not exists estimated_cost   numeric(10,2);
alter table public.maintenance_requests add column if not exists actual_cost      numeric(10,2);
alter table public.maintenance_requests add column if not exists vendor_name      text;
alter table public.maintenance_requests add column if not exists vendor_phone     text;
alter table public.maintenance_requests add column if not exists reported_by      text;
alter table public.maintenance_requests add column if not exists scheduled_date   timestamptz;
alter table public.maintenance_requests add column if not exists resolved_date    timestamptz;
alter table public.maintenance_requests add column if not exists resolution_notes text;

-- ── Row Level Security ────────────────────────────────────
alter table public.maintenance_requests enable row level security;
drop policy if exists "Owner only" on public.maintenance_requests;
create policy "Owner only" on public.maintenance_requests using (auth.uid() = owner_id);

-- ============================================================
-- 7. SERVICE VENDORS DIRECTORY
-- ============================================================
create table if not exists public.service_vendors (
  id              uuid          primary key default uuid_generate_v4(),
  owner_id        uuid          not null references public.profiles(id) on delete cascade,
  name            text          not null,
  category        text          not null default 'Plumbing',
  phone           text          not null,
  alternate_phone text,
  email           text,
  address         text,
  rating          numeric(2,1)  default 5.0,
  is_verified     boolean       not null default true,
  notes           text,
  created_at      timestamptz   default now()
);

-- Idempotent column additions
alter table public.service_vendors add column if not exists alternate_phone text;
alter table public.service_vendors add column if not exists email           text;
alter table public.service_vendors add column if not exists address         text;
alter table public.service_vendors add column if not exists notes           text;

-- ── Row Level Security ────────────────────────────────────
alter table public.service_vendors enable row level security;
drop policy if exists "Owner only" on public.service_vendors;
create policy "Owner only" on public.service_vendors using (auth.uid() = owner_id);

-- ============================================================
-- 8. SOCIETY NOTICES & ANNOUNCEMENTS
-- ============================================================
create table if not exists public.society_notices (
  id           uuid        primary key default uuid_generate_v4(),
  owner_id     uuid        not null references public.profiles(id) on delete cascade,
  building_id  uuid        not null references public.buildings(id) on delete cascade,
  title        text        not null,
  content      text        not null,
  category     text        not null default 'General',
  priority     text        not null default 'Normal'
                           check (priority in ('Normal', 'Important', 'Urgent')),
  publish_date date        not null default current_date,
  expiry_date  date,
  created_at   timestamptz default now()
);

-- Idempotent column additions
alter table public.society_notices add column if not exists expiry_date date;

-- ── Row Level Security ────────────────────────────────────
alter table public.society_notices enable row level security;
drop policy if exists "Owner only" on public.society_notices;
create policy "Owner only" on public.society_notices using (auth.uid() = owner_id);

-- ============================================================
-- 9. RECEIPT SEQUENCES (per financial year, per owner)
-- ============================================================
create table if not exists public.receipt_sequences (
  owner_id    uuid primary key references public.profiles(id) on delete cascade,
  fiscal_year int  not null,
  last_seq    int  not null default 0
);

alter table public.receipt_sequences enable row level security;
drop policy if exists "Owner only" on public.receipt_sequences;
create policy "Owner only" on public.receipt_sequences using (auth.uid() = owner_id);

-- Function: generate next receipt number
create or replace function public.next_receipt_number(p_owner_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_year int;
  v_seq  int;
begin
  v_year := case when extract(month from now()) >= 4
                 then extract(year from now())::int
                 else (extract(year from now()) - 1)::int
            end;

  insert into public.receipt_sequences(owner_id, fiscal_year, last_seq)
    values (p_owner_id, v_year, 1)
  on conflict (owner_id) do update
    set last_seq = case
          when receipt_sequences.fiscal_year < v_year then 1
          else receipt_sequences.last_seq + 1
        end,
        fiscal_year = v_year
  returning last_seq into v_seq;

  return 'RCP-' || v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- ============================================================
-- 10. SUBSCRIPTION PLANS
--     Seed rows for the four standard plans.
--     On conflict = do nothing (preserves existing prices).
-- ============================================================
create table if not exists public.subscription_plans (
  id                 uuid          primary key default gen_random_uuid(),
  name               text          not null,
  label              text          not null,
  days               integer,                        -- null = unlimited
  price_per_tenant   numeric(10,2) default 0,
  price_per_property numeric(10,2) default 0,
  is_active          boolean       not null default true,
  created_at         timestamptz   default now()
);

-- Idempotent column additions
alter table public.subscription_plans add column if not exists is_active boolean not null default true;

-- Deduplicate subscription_plans rows by name (keep the newest), then add unique constraint
-- Both steps are idempotent: dedup is a no-op when already clean; constraint add is skipped if present.
do $$
begin
  -- Step 1: remove duplicate rows, keeping only the row with the greatest id (stable tie-break)
  delete from public.subscription_plans
  where id not in (
    select distinct on (name) id
    from public.subscription_plans
    order by name, created_at desc nulls last, id desc
  );

  -- Step 2: add unique constraint only if it does not already exist
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.subscription_plans'::regclass
      and conname   = 'subscription_plans_name_key'
  ) then
    alter table public.subscription_plans add constraint subscription_plans_name_key unique (name);
  end if;
end;
$$;

-- Seed standard plans (skipped if already present)
insert into public.subscription_plans (name, label, days, price_per_tenant, price_per_property) values
  ('unlimited', 'Unlimited (Free)',  null, 0,   0  ),
  ('30days',    '30 Days Trial',     30,   0,   0  ),
  ('1year',     '1 Year',            365,  99,  499),
  ('custom',    'Custom',            null, 99,  499)
on conflict (name) do nothing;

-- ── Row Level Security ────────────────────────────────────
alter table public.subscription_plans enable row level security;
drop policy if exists "Public read" on public.subscription_plans;
drop policy if exists "Admin write" on public.subscription_plans;
create policy "Public read" on public.subscription_plans for select using (true);
create policy "Admin write" on public.subscription_plans for all    using (public.get_my_role() = 'admin');

-- ============================================================
-- 11. APP SETTINGS
--     Global key-value settings managed by the admin.
--     login_mode: 'bypass' | 'phone' | 'email'
--     subscription_model: 'free' | 'paid'
-- ============================================================
create table if not exists public.app_settings (
  key        text        primary key,
  value      text        not null,
  updated_at timestamptz default now()
);

-- Idempotent column additions
alter table public.app_settings add column if not exists updated_at timestamptz default now();

-- ── Row Level Security ────────────────────────────────────
alter table public.app_settings enable row level security;
drop policy if exists "Public read" on public.app_settings;
drop policy if exists "Admin write" on public.app_settings;
create policy "Public read" on public.app_settings for select using (true);
create policy "Admin write" on public.app_settings for all    using (public.get_my_role() = 'admin');

-- Default settings (skips if key already exists)
insert into public.app_settings (key, value) values
  ('default_otp',        '123456'),
  ('use_supabase_otp',   'false' ),
  ('use_sms_gateway',    'false' ),   -- set 'true' only after MSG91 is fully configured
  ('login_mode',         'bypass'),   -- options: bypass | phone | email
  ('subscription_model', 'free'  )    -- options: free | paid
on conflict (key) do nothing;

-- ============================================================
-- 12. INDEXES
-- ============================================================
create index if not exists idx_buildings_owner            on public.buildings(owner_id);
create index if not exists idx_units_building             on public.units(building_id);
create index if not exists idx_units_owner                on public.units(owner_id);
create index if not exists idx_units_is_vacant            on public.units(is_vacant);
create index if not exists idx_tenants_unit               on public.tenants(unit_id);
create index if not exists idx_tenants_owner              on public.tenants(owner_id);
create index if not exists idx_tenants_is_active          on public.tenants(is_active);
create index if not exists idx_tenants_expected_vacate    on public.tenants(expected_vacate_date)
  where expected_vacate_date is not null;
create index if not exists idx_payments_tenant            on public.payments(tenant_id);
create index if not exists idx_payments_month             on public.payments(payment_month);
create index if not exists idx_payments_owner             on public.payments(owner_id);
create index if not exists idx_maintenance_building       on public.maintenance_requests(building_id);
create index if not exists idx_maintenance_owner          on public.maintenance_requests(owner_id);
create index if not exists idx_maintenance_status         on public.maintenance_requests(status);
create index if not exists idx_notices_building           on public.society_notices(building_id);
create index if not exists idx_notices_owner              on public.society_notices(owner_id);

-- ============================================================
-- 13. VIEWS
-- ============================================================

-- Vacant units (for quick lookup)
create or replace view public.v_vacant_units as
select
  u.id,
  u.unit_number,
  u.unit_type,
  u.rent_per_bed,
  u.total_beds,
  u.owner_id,
  b.name         as building_name,
  b.building_type,
  b.id           as building_id
from public.units u
join public.buildings b on b.id = u.building_id
where u.is_vacant = true;

-- Monthly payment summary per owner (re-created after generated columns)
create or replace view public.v_monthly_summary as
select
  p.owner_id,
  date_trunc('month', p.payment_month)                  as month,
  count(*)                                               as total_records,
  sum(p.amount_due)                                      as total_due,
  sum(p.amount_paid)                                     as total_collected,
  sum(p.outstanding)                                     as total_outstanding,
  count(*) filter (where p.status = 'Paid')              as paid_count,
  count(*) filter (where p.status = 'Partial')           as partial_count,
  count(*) filter (where p.status = 'Pending')           as pending_count
from public.payments p
group by p.owner_id, date_trunc('month', p.payment_month);

-- Tenants currently under notice period
-- (is_active = true AND expected_vacate_date >= today)
create or replace view public.v_notice_period_tenants as
select
  t.id,
  t.full_name,
  t.phone,
  t.move_in_date,
  t.expected_vacate_date,
  t.owner_id,
  u.unit_number,
  u.building_id,
  b.name as building_name
from public.tenants t
join public.units     u on u.id = t.unit_id
join public.buildings b on b.id = u.building_id
where t.is_active = true
  and t.expected_vacate_date >= current_date;

-- ────────────────────────────────────────────────────────────
-- Reload PostgREST schema cache
-- ────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';
