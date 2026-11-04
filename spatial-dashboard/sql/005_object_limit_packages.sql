-- Change note (Grok, Oct 2026): per-object plans and the public package tracker.
-- Paste in the Geoxis Supabase SQL editor after 004. Safe to re-run.
-- object_limit is optional: one geoxis.tracking.object row still counts as 1 seat if this column is absent.
-- The package tables make the 3 free lookups and the $1 unlock stick across server restarts.

alter table public.entitlements add column if not exists object_limit integer;

create table if not exists public.package_lookups (
  id uuid primary key default gen_random_uuid(),
  viewer_key text not null,
  tracking_number text not null,
  created_at timestamptz not null default now(),
  unique (viewer_key, tracking_number)
);

create table if not exists public.package_unlocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  owner text not null,
  tracking_number text not null,
  carrier text,
  reservation_id text unique,
  receipt_id text,
  status text not null default 'active',
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner, tracking_number)
);

alter table public.package_lookups enable row level security;
alter table public.package_unlocks enable row level security;
revoke all on public.package_lookups from anon, authenticated;
revoke all on public.package_unlocks from anon, authenticated;
