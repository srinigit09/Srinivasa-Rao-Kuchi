-- ============================================================
-- PropEase — Additive Migration Schema
-- Run AFTER supabase_schema.sql (RentEase base schema)
-- Safe to re-run — all statements are idempotent
-- ============================================================

-- ============================================================
-- PROFILES — remember last selected property
-- ============================================================
alter table public.profiles
  add column if not exists last_property_id   uuid,
  add column if not exists last_property_type text
    check (last_property_type in (
      'residential','pg','open_plots','housing_villa','farm_land'
    ));

-- ============================================================
-- BUILDINGS — extend building_type to include real estate types
-- ============================================================
-- Drop old constraint and recreate with all 5 types
alter table public.buildings
  drop constraint if exists buildings_building_type_check;

alter table public.buildings
  add constraint buildings_building_type_check
  check (building_type in (
    'residential',
    'pg',
    'open_plots',
    'housing_villa',
    'farm_land'
  ));

-- ============================================================
-- UNITS — extend for rental new types + real estate fields
-- ============================================================

-- Rental: new unit types are stored as free text — no constraint
-- on unit_type column (already text, no check constraint)

-- Real estate fields
alter table public.units
  add column if not exists area_sqft     numeric(10,2),   -- sq.ft / sq.yd for plots & housing
  add column if not exists area_acres    numeric(10,4),   -- acres for farm land
  add column if not exists facing        text             -- N/S/E/W/NE/NW/SE/SW
    check (facing in ('N','S','E','W','NE','NW','SE','SW') or facing is null),
  add column if not exists plot_status   text default 'available'
    check (plot_status in ('available','booked','under_construction','ready','sold') or plot_status is null),
  add column if not exists sale_price    numeric(12,2),   -- asking / agreed sale price
  add column if not exists custom_type   text;            -- owner-defined type for real estate

-- ============================================================
-- BEDS — individual beds under PG units
-- ============================================================
create table if not exists public.beds (
  id          uuid primary key default uuid_generate_v4(),
  unit_id     uuid not null references public.units(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  bed_label   text not null,      -- e.g. "5A", "5B", "5C"
  is_vacant   boolean not null default true,
  created_at  timestamptz default now()
);
alter table public.beds enable row level security;
drop policy if exists "Owner only" on public.beds;
create policy "Owner only" on public.beds using (auth.uid() = owner_id);
create index if not exists idx_beds_unit    on public.beds(unit_id);
create index if not exists idx_beds_owner   on public.beds(owner_id);

-- ============================================================
-- TENANTS — add optional bed_id for PG tenants
-- ============================================================
alter table public.tenants
  add column if not exists bed_id uuid references public.beds(id) on delete set null;

-- ============================================================
-- BUYERS — real estate buyers (one per plot/unit)
-- ============================================================
create table if not exists public.buyers (
  id              uuid primary key default uuid_generate_v4(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  unit_id         uuid not null references public.units(id) on delete cascade,
  full_name       text not null,
  phone           text not null,
  email           text,
  id_type         text check (id_type in ('Aadhaar','PAN','Passport','Driving License') or id_type is null),
  id_number       text,
  booking_date    date not null default current_date,
  sale_price      numeric(12,2) not null default 0,
  amount_paid     numeric(12,2) not null default 0,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz default now()
);
alter table public.buyers enable row level security;
drop policy if exists "Owner only" on public.buyers;
create policy "Owner only" on public.buyers using (auth.uid() = owner_id);
create index if not exists idx_buyers_unit    on public.buyers(unit_id);
create index if not exists idx_buyers_owner   on public.buyers(owner_id);

-- ============================================================
-- SALE PAYMENTS — installments for real estate buyers
-- ============================================================
create table if not exists public.sale_payments (
  id              uuid primary key default uuid_generate_v4(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  buyer_id        uuid not null references public.buyers(id) on delete cascade,
  amount          numeric(12,2) not null,
  payment_date    date not null default current_date,
  payment_mode    text check (payment_mode in ('Cash','UPI','Bank Transfer','Cheque') or payment_mode is null),
  installment_no  int,
  notes           text,
  receipt_number  text unique,
  created_at      timestamptz default now()
);
alter table public.sale_payments enable row level security;
drop policy if exists "Owner only" on public.sale_payments;
create policy "Owner only" on public.sale_payments using (auth.uid() = owner_id);
create index if not exists idx_sale_payments_buyer  on public.sale_payments(buyer_id);
create index if not exists idx_sale_payments_owner  on public.sale_payments(owner_id);

-- ============================================================
-- CONSTRUCTION STAGES — per real estate unit (Flat/House/Villa)
-- ============================================================
create table if not exists public.construction_stages (
  id            uuid primary key default uuid_generate_v4(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  unit_id       uuid not null references public.units(id) on delete cascade,
  stage_name    text not null,   -- Foundation / Structure / Roofing / Plastering / Finishing / Handover
  stage_order   int  not null,   -- 1 to 6
  completed     boolean not null default false,
  completed_at  date,
  notes         text,
  created_at    timestamptz default now(),
  unique (unit_id, stage_order)
);
alter table public.construction_stages enable row level security;
drop policy if exists "Owner only" on public.construction_stages;
create policy "Owner only" on public.construction_stages using (auth.uid() = owner_id);
create index if not exists idx_stages_unit   on public.construction_stages(unit_id);
create index if not exists idx_stages_owner  on public.construction_stages(owner_id);

-- ============================================================
-- VIEWS — update v_vacant_units to include real estate status
-- ============================================================
create or replace view public.v_vacant_units as
select
  u.id, u.unit_number, u.unit_type, u.rent_per_bed, u.total_beds,
  u.owner_id, u.area_sqft, u.area_acres, u.facing, u.sale_price,
  u.plot_status, u.custom_type,
  b.name as building_name, b.building_type, b.id as building_id
from public.units u
join public.buildings b on b.id = u.building_id
where
  -- rental/pg: is_vacant flag
  (b.building_type in ('residential','pg') and u.is_vacant = true)
  or
  -- real estate: plot_status = available
  (b.building_type in ('open_plots','housing_villa','farm_land')
   and (u.plot_status = 'available' or u.plot_status is null));

-- ============================================================
-- FUNCTION — auto-create construction stages for a unit
-- Called after inserting a Flat/House/Villa unit
-- ============================================================
create or replace function public.create_construction_stages(
  p_unit_id  uuid,
  p_owner_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  stages text[] := array[
    'Foundation',
    'Structure / Framing',
    'Roofing',
    'Plastering',
    'Finishing',
    'Handover'
  ];
  i int;
begin
  for i in 1..array_length(stages, 1) loop
    insert into public.construction_stages
      (unit_id, owner_id, stage_name, stage_order)
    values
      (p_unit_id, p_owner_id, stages[i], i)
    on conflict (unit_id, stage_order) do nothing;
  end loop;
end;
$$;

-- ============================================================
-- FUNCTION — auto-update buyers.amount_paid after sale_payment
-- ============================================================
create or replace function public.sync_buyer_amount_paid()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.buyers
  set amount_paid = (
    select coalesce(sum(amount), 0)
    from public.sale_payments
    where buyer_id = coalesce(new.buyer_id, old.buyer_id)
  )
  where id = coalesce(new.buyer_id, old.buyer_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_buyer_amount_paid_insert on public.sale_payments;
drop trigger if exists trg_sync_buyer_amount_paid_delete on public.sale_payments;

create trigger trg_sync_buyer_amount_paid_insert
  after insert or update on public.sale_payments
  for each row execute function public.sync_buyer_amount_paid();

create trigger trg_sync_buyer_amount_paid_delete
  after delete on public.sale_payments
  for each row execute function public.sync_buyer_amount_paid();

-- ============================================================
-- Reload PostgREST schema cache
-- ============================================================
notify pgrst, 'reload schema';
