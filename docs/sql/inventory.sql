-- ══════════════════════════════════════════════════════════════
-- Inventário + Compras planejadas
-- Rode UMA VEZ no SQL Editor do seu Supabase (migrations não se
-- aplicam sozinhas por git neste projeto — ver docs/whatsapp-integration-plan.md).
-- Re-executável com segurança.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.inventory (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  kind            text not null default 'owned' check (kind in ('owned','planned')), -- meus itens vs compra planejada
  name            text not null,
  category        text,
  quantity        integer not null default 1 check (quantity >= 0),
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  shared          boolean not null default false,   -- uso compartilhado?
  purchased       boolean not null default false,   -- usado nas compras planejadas
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
