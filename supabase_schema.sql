-- ============================================================
-- RentEase — Complete Supabase PostgreSQL Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run on existing databases (all statements are idempotent)
-- Last updated: is_vacant default true enforced on units; payments.outstanding/status are generated columns (cannot UPDATE directly)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (one per authenticated landlord / property manager)
-- ============================================================
create table if not exists public.profiles (
  id                           uuid primary key references auth.users(id) on delete cascade,
  full_name                    text,
  email                        text,
  phone                        text,
  phone_number                 text,
  dob                          date,
  role                         text not null default 'client' check (role in ('admin', 'client')),
  is_active                    boolean not null default true,
  valid_until                  timestamptz default (now() + interval '30 days'),
  upi_id                       text,
  bank_name                    text,
  bank_account                 text,
  bank_ifsc                    text,
  subscription_plan            text default 'unlimited',
  subscription_starts_at       timestamptz,
  subscription_expires_at      timestamptz,
  subscription_tenant_count    integer default 0,
  subscription_property_count  integer default 0,
  created_at                   timestamptz default now()
);

-- Safe column additions (idempotent for existing tables)
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

-- Unique index on phone_number (allows null, prevents duplicate phones)
create unique index if not exists profiles_phone_number_key
  on public.profiles (phone_number)
  where phone_number is not null;

alter table public.profiles enable row level security;

-- Helper function: returns current user's role WITHOUT triggering RLS
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Profiles policies
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
-- BUILDINGS / PROPERTIES / COMMUNITIES
-- ============================================================
create table if not exists public.buildings (
  id                          uuid primary key default uuid_generate_v4(),
  owner_id                    uuid not null references public.profiles(id) on delete cascade,
  name                        text not null,
  address                     text,
  building_type               text not null default 'residential',
  society_name                text,
  monthly_maintenance_charge  numeric(10,2) default 0,
  maintenance_due_day         int default 5,
  amenities                   text[] default '{}',
  gate_phone                  text,
  rules                       text,
  created_at                  timestamptz default now()
);

alter table public.buildings drop constraint if exists buildings_building_type_check;
alter table public.buildings add column if not exists society_name                text;
alter table public.buildings add column if not exists monthly_maintenance_charge  numeric(10,2) default 0;
alter table public.buildings add column if not exists maintenance_due_day         int default 5;
alter table public.buildings add column if not exists amenities                   text[] default '{}';
alter table public.buildings add column if not exists gate_phone                  text;
alter table public.buildings add column if not exists rules                       text;
alter table public.buildings add constraint buildings_building_type_check check (
  building_type in ('residential', 'individual_house', 'commercial', 'pg', 'apartment', 'gated_community')
);

alter table public.buildings enable row level security;
drop policy if exists "Owner only" on public.buildings;
create policy "Owner only" on public.buildings using (auth.uid() = owner_id);

-- ============================================================
-- UNITS (Flats, Houses, Rooms, PG Beds)
-- ============================================================
create table if not exists public.units (
  id                  uuid primary key default uuid_generate_v4(),
  building_id         uuid not null references public.buildings(id) on delete cascade,
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  unit_number         text not null,
  unit_type           text not null,
  floor_number        text,
  total_beds          int default 1,
  rent_per_bed        numeric(10,2) not null default 0,
  monthly_maintenance numeric(10,2) default 0,
  resident_type       text default 'tenant' check (resident_type in ('tenant', 'owner_occupant')),
  is_vacant           boolean not null default true,
  created_at          timestamptz default now()
);

alter table public.units add column if not exists floor_number        text;
alter table public.units add column if not exists monthly_maintenance  numeric(10,2) default 0;
alter table public.units add column if not exists resident_type        text default 'tenant';

alter table public.units enable row level security;
drop policy if exists "Owner only" on public.units;
create policy "Owner only" on public.units using (auth.uid() = owner_id);

-- ============================================================
-- TENANTS / OCCUPANTS / RESIDENTS
-- ============================================================
create table if not exists public.tenants (
  id                   uuid primary key default uuid_generate_v4(),
  owner_id             uuid not null references public.profiles(id) on delete cascade,
  unit_id              uuid not null references public.units(id) on delete cascade,
  full_name            text not null,
  phone                text not null,
  email                text,
  id_type              text,
  id_number            text,
  resident_type        text default 'tenant',
  stay_type            text default 'month' check (stay_type in ('month', 'week', 'day')),
  move_in_date         date not null,
  move_out_date        date,
  notice_date          date,
  expected_vacate_date date,
  rent_override        numeric(10,2),
  deposit_amount       numeric(10,2) default 0,
  deposit_returned     numeric(10,2) default 0,
  emergency_name       text,
  emergency_phone      text,
  notes                text,
  is_active            boolean not null default true,
  created_at           timestamptz default now()
);

alter table public.tenants drop constraint if exists tenants_resident_type_check;
alter table public.tenants add column if not exists resident_type        text default 'tenant';
alter table public.tenants add constraint tenants_resident_type_check
  check (resident_type in ('tenant', 'owner_occupant', 'guest'));
alter table public.tenants add column if not exists stay_type            text default 'month'
  check (stay_type in ('month', 'week', 'day'));
alter table public.tenants add column if not exists notice_date          date;
alter table public.tenants add column if not exists expected_vacate_date date;

alter table public.tenants enable row level security;
drop policy if exists "Owner only" on public.tenants;
create policy "Owner only" on public.tenants using (auth.uid() = owner_id);

-- ============================================================
-- PAYMENTS & DUES
-- ============================================================
create table if not exists public.payments (
  id                 uuid primary key default uuid_generate_v4(),
  owner_id           uuid not null references public.profiles(id) on delete cascade,
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  payment_month      date not null,
  amount_due         numeric(10,2) not null,
  amount_paid        numeric(10,2) not null default 0,
  advance_paid       numeric(10,2) not null default 0,
  payment_date       date,
  payment_mode       text check (payment_mode in ('Cash','UPI','Bank Transfer','Cheque')),
  electricity        numeric(10,2) default 0,
  water              numeric(10,2) default 0,
  maintenance_charge numeric(10,2) default 0,
  other_charges      numeric(10,2) default 0,
  other_label        text,
  notes              text,
  receipt_number     text unique,
  created_at         timestamptz default now()
);

-- Safe migration: drop generated columns before re-adding
drop view if exists public.v_monthly_summary;
alter table public.payments add column if not exists advance_paid       numeric(10,2) not null default 0;
alter table public.payments add column if not exists maintenance_charge  numeric(10,2) default 0;
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

alter table public.payments enable row level security;
drop policy if exists "Owner only" on public.payments;
create policy "Owner only" on public.payments using (auth.uid() = owner_id);

-- ============================================================
-- MAINTENANCE REQUESTS & SERVICE TRACKING
-- ============================================================
create table if not exists public.maintenance_requests (
  id               uuid primary key default uuid_generate_v4(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  building_id      uuid not null references public.buildings(id) on delete cascade,
  unit_id          uuid references public.units(id) on delete set null,
  tenant_id        uuid references public.tenants(id) on delete set null,
  title            text not null,
  description      text not null,
  category         text not null default 'Plumbing',
  priority         text not null default 'Medium'
    check (priority in ('Low', 'Medium', 'High', 'Emergency')),
  status           text not null default 'Reported'
    check (status in ('Reported', 'In Progress', 'Scheduled', 'Resolved', 'Cancelled')),
  estimated_cost   numeric(10,2),
  actual_cost      numeric(10,2),
  vendor_name      text,
  vendor_phone     text,
  reported_by      text,
  scheduled_date   timestamptz,
  resolved_date    timestamptz,
  resolution_notes text,
  created_at       timestamptz default now()
);

alter table public.maintenance_requests enable row level security;
drop policy if exists "Owner only" on public.maintenance_requests;
create policy "Owner only" on public.maintenance_requests using (auth.uid() = owner_id);

-- ============================================================
-- SERVICE VENDORS DIRECTORY
-- ============================================================
create table if not exists public.service_vendors (
  id              uuid primary key default uuid_generate_v4(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  name            text not null,
  category        text not null default 'Plumbing',
  phone           text not null,
  alternate_phone text,
  email           text,
  address         text,
  rating          numeric(2,1) default 5.0,
  is_verified     boolean not null default true,
  notes           text,
  created_at      timestamptz default now()
);

alter table public.service_vendors enable row level security;
drop policy if exists "Owner only" on public.service_vendors;
create policy "Owner only" on public.service_vendors using (auth.uid() = owner_id);

-- ============================================================
-- SOCIETY NOTICES & ANNOUNCEMENTS
-- ============================================================
create table if not exists public.society_notices (
  id           uuid primary key default uuid_generate_v4(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  building_id  uuid not null references public.buildings(id) on delete cascade,
  title        text not null,
  content      text not null,
  category     text not null default 'General',
  priority     text not null default 'Normal'
    check (priority in ('Normal', 'Important', 'Urgent')),
  publish_date date not null default current_date,
  expiry_date  date,
  created_at   timestamptz default now()
);

alter table public.society_notices enable row level security;
drop policy if exists "Owner only" on public.society_notices;
create policy "Owner only" on public.society_notices using (auth.uid() = owner_id);

-- ============================================================
-- RECEIPT SEQUENCE (per financial year per owner)
-- ============================================================
create table if not exists public.receipt_sequences (
  owner_id    uuid primary key references public.profiles(id) on delete cascade,
  fiscal_year int not null,
  last_seq    int not null default 0
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
                 then extract(year from now())
                 else extract(year from now()) - 1
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
-- SUBSCRIPTION PLANS
-- ============================================================
create table if not exists public.subscription_plans (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  label              text not null,
  days               integer,                     -- null = unlimited
  price_per_tenant   numeric(10,2) default 0,
  price_per_property numeric(10,2) default 0,
  is_active          boolean not null default true,
  created_at         timestamptz default now()
);

insert into public.subscription_plans (name, label, days, price_per_tenant, price_per_property) values
  ('unlimited', 'Unlimited (Free)', null, 0,  0  ),
  ('30days',    '30 Days Trial',    30,   0,  0  ),
  ('1year',     '1 Year',           365,  99, 499),
  ('custom',    'Custom',           null, 99, 499)
on conflict do nothing;

alter table public.subscription_plans enable row level security;
drop policy if exists "Public read"  on public.subscription_plans;
drop policy if exists "Admin write"  on public.subscription_plans;
create policy "Public read"  on public.subscription_plans for select using (true);
create policy "Admin write"  on public.subscription_plans for all    using (public.get_my_role() = 'admin');

-- ============================================================
-- APP SETTINGS
-- ============================================================
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;
drop policy if exists "Public read" on public.app_settings;
drop policy if exists "Admin write" on public.app_settings;
create policy "Public read" on public.app_settings for select using (true);
create policy "Admin write" on public.app_settings for all    using (public.get_my_role() = 'admin');

-- Default app settings (safe — skips if already exists)
insert into public.app_settings (key, value) values
  ('default_otp',          '123456'),
  ('use_supabase_otp',     'false'),
  ('login_mode',           'bypass'),
  ('subscription_model',   'free')
on conflict (key) do nothing;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_buildings_owner     on public.buildings(owner_id);
create index if not exists idx_units_building      on public.units(building_id);
create index if not exists idx_tenants_unit        on public.tenants(unit_id);
create index if not exists idx_tenants_owner       on public.tenants(owner_id);
create index if not exists idx_payments_tenant     on public.payments(tenant_id);
create index if not exists idx_payments_month      on public.payments(payment_month);
create index if not exists idx_payments_owner      on public.payments(owner_id);
create index if not exists idx_maintenance_bld     on public.maintenance_requests(building_id);
create index if not exists idx_maintenance_status  on public.maintenance_requests(status);
create index if not exists idx_notices_bld         on public.society_notices(building_id);

-- ============================================================
-- VIEWS
-- ============================================================
create or replace view public.v_vacant_units as
select
  u.id, u.unit_number, u.unit_type, u.rent_per_bed, u.total_beds, u.owner_id,
  b.name as building_name, b.building_type, b.id as building_id
from public.units u
join public.buildings b on b.id = u.building_id
where u.is_vacant = true;

create or replace view public.v_monthly_summary as
select
  p.owner_id,
  date_trunc('month', p.payment_month) as month,
  count(*)                                                  as total_records,
  sum(p.amount_due)                                         as total_due,
  sum(p.amount_paid)                                        as total_collected,
  sum(p.outstanding)                                        as total_outstanding,
  count(*) filter (where p.status = 'Paid')                as paid_count,
  count(*) filter (where p.status = 'Partial')             as partial_count,
  count(*) filter (where p.status = 'Pending')             as pending_count
from public.payments p
group by p.owner_id, date_trunc('month', p.payment_month);

notify pgrst, 'reload schema';
