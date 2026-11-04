-- 2026-10-14 (Geoxis Lead / Grok): DRAFT, NOT APPLIED. Permanent card-payment ledger/receipts.
-- Apply after sql/005. Undo: drop table public.geoxis_payments;
create table if not exists public.geoxis_payments (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  stripe_object_id text not null,
  product text not null default 'geoxis' check (product = 'geoxis'),
  sku text not null,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  quantity integer not null default 1,
  amount_cents integer not null,
  currency text not null default 'usd',
  receipt_url text,
  raw_type text not null,
  created_at timestamptz not null default now()
);
create index if not exists geoxis_payments_tenant_idx on public.geoxis_payments (tenant_id, created_at desc);
alter table public.geoxis_payments enable row level security;
drop policy if exists geoxis_payments_member_select on public.geoxis_payments;
create policy geoxis_payments_member_select on public.geoxis_payments for select using (public.is_member(tenant_id) or public.is_admin_user());
revoke all on public.geoxis_payments from anon;
-- Ledger rows are never updated or deleted by the app (service role inserts only).
