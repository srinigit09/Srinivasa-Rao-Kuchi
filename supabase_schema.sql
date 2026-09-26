-- ============================================================
-- RentEase — Supabase PostgreSQL Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (one per authenticated landlord)
-- ============================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  email        text,
  phone        text,
  dob          date,
  role         text not null default 'client' check (role in ('admin', 'client')),
  is_active    boolean not null default true,
  valid_until  timestamptz default (now() + interval '30 days'),
  upi_id       text,
  bank_name    text,
  bank_account text,
  bank_ifsc    text,
  created_at   timestamptz default now()
);
-- Ensure all columns exist on pre-existing tables (safe no-ops if already present)
alter table public.profiles add column if not exists email        text;
alter table public.profiles add column if not exists dob          date;
alter table public.profiles add column if not exists upi_id       text;
alter table public.profiles add column if not exists bank_name    text;
alter table public.profiles add column if not exists bank_account text;
alter table public.profiles add column if not exists bank_ifsc    text;
alter table public.profiles enable row level security;
-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

-- Helper function: returns current user's role WITHOUT triggering RLS
-- (security definer runs as the function owner, bypassing row-level policies)
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Profiles policies: user can view/update their own, admin can view/update all
drop policy if exists "Owner only" on public.profiles;
drop policy if exists "Allow select own or admin" on public.profiles;
drop policy if exists "Allow update own or admin" on public.profiles;
drop policy if exists "Allow insert own or admin" on public.profiles;
drop policy if exists "Allow delete admin" on public.profiles;

create policy "Allow select own or admin" on public.profiles
  for select using (auth.uid() = id or public.get_my_role() = 'admin');

create policy "Allow insert own or admin" on public.profiles
  for insert with check (auth.uid() = id or public.get_my_role() = 'admin');

create policy "Allow update own or admin" on public.profiles
  for update using (auth.uid() = id or public.get_my_role() = 'admin');

create policy "Allow delete admin" on public.profiles
  for delete using (public.get_my_role() = 'admin');

-- ============================================================
-- BUILDINGS
-- ============================================================
create table if not exists public.buildings (
  id           uuid primary key default uuid_generate_v4(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  address      text,
  building_type text not null check (building_type in ('residential','pg')),
  created_at   timestamptz default now()
);
alter table public.buildings enable row level security;
drop policy if exists "Owner only" on public.buildings;
create policy "Owner only" on public.buildings using (auth.uid() = owner_id);

-- ============================================================
-- UNITS  (Flats for residential / Rooms for PG)
-- ============================================================
create table if not exists public.units (
  id           uuid primary key default uuid_generate_v4(),
  building_id  uuid not null references public.buildings(id) on delete cascade,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  unit_number  text not null,
  unit_type    text not null,
  -- residential: 1RK | 1BHK | 2BHK | 3BHK | Villa
  -- pg: Single | 2-Sharing | 3-Sharing | 4-Sharing | 5-Sharing
  total_beds   int default 1,
  rent_per_bed numeric(10,2) not null default 0,
  is_vacant    boolean not null default true,
  created_at   timestamptz default now()
);
alter table public.units enable row level security;
drop policy if exists "Owner only" on public.units;
create policy "Owner only" on public.units using (auth.uid() = owner_id);

-- ============================================================
-- TENANTS
-- ============================================================
create table if not exists public.tenants (
  id               uuid primary key default uuid_generate_v4(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  unit_id          uuid not null references public.units(id) on delete cascade,
  full_name        text not null,
  phone            text not null,
  email            text,
  id_type          text,  -- Aadhaar | PAN | Passport | DL
  id_number        text,
  move_in_date     date not null,
  move_out_date    date,
  rent_override    numeric(10,2),   -- if null use unit rent_per_bed
  deposit_amount   numeric(10,2) default 0,
  deposit_returned numeric(10,2) default 0,
  emergency_name   text,
  emergency_phone  text,
  notes            text,
  is_active        boolean not null default true,
  created_at       timestamptz default now()
);
alter table public.tenants enable row level security;
drop policy if exists "Owner only" on public.tenants;
create policy "Owner only" on public.tenants using (auth.uid() = owner_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
create table if not exists public.payments (
  id              uuid primary key default uuid_generate_v4(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  payment_month   date not null,  -- always 1st of the month e.g. 2024-06-01
  amount_due      numeric(10,2) not null,
  amount_paid     numeric(10,2) not null default 0,
  payment_date    date,
  payment_mode    text check (payment_mode in ('Cash','UPI','Bank Transfer','Cheque')),
  electricity     numeric(10,2) default 0,
  water           numeric(10,2) default 0,
  other_charges   numeric(10,2) default 0,
  other_label     text,
  outstanding     numeric(10,2) generated always as (amount_due + coalesce(electricity,0) + coalesce(water,0) + coalesce(other_charges,0) - amount_paid) stored,
  status          text generated always as (
    case
      when amount_paid = 0 then 'Pending'
      when amount_paid >= (amount_due + coalesce(electricity,0) + coalesce(water,0) + coalesce(other_charges,0)) then 'Paid'
      else 'Partial'
    end
  ) stored,
  notes           text,
  receipt_number  text unique,
  created_at      timestamptz default now()
);
alter table public.payments enable row level security;
drop policy if exists "Owner only" on public.payments;
create policy "Owner only" on public.payments using (auth.uid() = owner_id);

-- ============================================================
-- RECEIPT SEQUENCE (per financial year per owner)
-- ============================================================
create table if not exists public.receipt_sequences (
  owner_id     uuid primary key references public.profiles(id) on delete cascade,
  fiscal_year  int not null,   -- e.g. 2024 for Apr 2024 – Mar 2025
  last_seq     int not null default 0
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
  -- Financial year starts in April
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
-- APP SETTINGS (admin-controlled global flags)
-- ============================================================
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);
alter table public.app_settings enable row level security;

-- Anyone can read settings (needed by login screen before auth)
drop policy if exists "Public read" on public.app_settings;
create policy "Public read" on public.app_settings
  for select using (true);

-- Only admin can write
drop policy if exists "Admin write" on public.app_settings;
create policy "Admin write" on public.app_settings
  for all using (public.get_my_role() = 'admin');

-- Seed defaults
insert into public.app_settings (key, value) values
  ('default_otp', '123456'),
  ('use_supabase_otp', 'false')
on conflict (key) do nothing;

-- ============================================================
-- INDEXES for common queries
-- ============================================================
create index if not exists idx_buildings_owner on public.buildings(owner_id);
create index if not exists idx_units_building  on public.units(building_id);
create index if not exists idx_tenants_unit    on public.tenants(unit_id);
create index if not exists idx_tenants_owner   on public.tenants(owner_id);
create index if not exists idx_payments_tenant on public.payments(tenant_id);
create index if not exists idx_payments_month  on public.payments(payment_month);
create index if not exists idx_payments_owner  on public.payments(owner_id);

-- ============================================================
-- VIEWS
-- ============================================================

-- Vacancy overview
create or replace view public.v_vacant_units as
select
  u.id, u.unit_number, u.unit_type, u.rent_per_bed, u.total_beds, u.owner_id,
  b.name as building_name, b.building_type, b.id as building_id
from public.units u
join public.buildings b on b.id = u.building_id
where u.is_vacant = true;

-- Monthly collection summary
create or replace view public.v_monthly_summary as
select
  p.owner_id,
  date_trunc('month', p.payment_month) as month,
  count(*) as total_records,
  sum(p.amount_due) as total_due,
  sum(p.amount_paid) as total_collected,
  sum(p.outstanding) as total_outstanding,
  count(*) filter (where p.status = 'Paid') as paid_count,
  count(*) filter (where p.status = 'Partial') as partial_count,
  count(*) filter (where p.status = 'Pending') as pending_count
from public.payments p
group by p.owner_id, date_trunc('month', p.payment_month);
