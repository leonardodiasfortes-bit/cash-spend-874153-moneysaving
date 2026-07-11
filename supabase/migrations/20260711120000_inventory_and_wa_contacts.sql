-- ══════════════════════════════════════════════════════════════
-- Tabelas das features novas: inventory (aba Inventário) + wa_contacts (WhatsApp)
--
-- IMPORTANTE: neste projeto (Lovable Cloud) as migrations do git NÃO se
-- aplicam sozinhas. Para criar de fato as tabelas, rode este SQL UMA VEZ:
--   • no SQL Editor do backend (Lovable Cloud), ou
--   • pedindo ao Lovable no chat: "aplique este SQL / crie estas tabelas".
-- Idempotente: seguro rodar mais de uma vez.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Inventário + Compras planejadas ─────────────────────────────
create table if not exists public.inventory (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  kind            text not null default 'owned' check (kind in ('owned','planned')),
  name            text not null,
  category        text,
  quantity        integer not null default 1 check (quantity >= 0),
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  shared          boolean not null default false,
  purchased       boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table public.inventory enable row level security;
grant select, insert, update, delete on public.inventory to authenticated;
grant all on public.inventory to service_role;

drop policy if exists "inv_own" on public.inventory;
create policy "inv_own" on public.inventory
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_inventory_user_kind on public.inventory(user_id, kind);

-- ── 2. Contatos WhatsApp ───────────────────────────────────────────
create table if not exists public.wa_contacts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  phone          text not null unique,
  label          text,
  verified       boolean not null default false,
  alerts_enabled boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table public.wa_contacts enable row level security;
grant select, insert, update, delete on public.wa_contacts to authenticated;
grant all on public.wa_contacts to service_role;

drop policy if exists "wa_own" on public.wa_contacts;
create policy "wa_own" on public.wa_contacts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
