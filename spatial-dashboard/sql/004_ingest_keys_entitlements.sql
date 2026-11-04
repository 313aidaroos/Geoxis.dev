-- Change note (Claude, Oct 2026): real fleet ingest + entitlement rows. Paste in the Geoxis Supabase
-- SQL editor after 001-003. Safe to re-run. The app reads and writes these with the service role
-- (lib/supabaseServer.js), filtered by tenant, so browser roles get no access.

-- Per-tenant ingest keys. The plain key (gxk_…) is shown once; only its sha256 is stored.
create table if not exists public.ingest_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  label text not null default 'default',
  key_prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists ingest_keys_tenant_idx on public.ingest_keys (tenant_id);

-- Plan access bought with Ixis (api/redeem.js provision step). The charge itself lives in Apixis Wallet;
-- this row is what Geoxis grants in return, so a captured hold always has a matching access row.
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  owner text not null,                -- Apixis ID `sub` or verified email that paid
  product_key text not null,
  reservation_id text not null unique,
  receipt_id text,
  wallet_entitlement_id text,
  status text not null default 'active' check (status in ('active','expired','revoked')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,             -- null = one-off (export report); tracking seats = 30 days (D2)
  created_at timestamptz not null default now()
);
create index if not exists entitlements_tenant_idx on public.entitlements (tenant_id, status);

alter table public.ingest_keys enable row level security;
alter table public.entitlements enable row level security;

drop policy if exists ingest_keys_member_select on public.ingest_keys;
create policy ingest_keys_member_select on public.ingest_keys for select using (public.is_member(tenant_id) or public.is_admin_user());

drop policy if exists entitlements_member_select on public.entitlements;
create policy entitlements_member_select on public.entitlements for select using (public.is_member(tenant_id) or public.is_admin_user());

revoke all on public.ingest_keys from anon;
revoke all on public.entitlements from anon;
