-- ══════════════════════════════════════════════════════════════
-- Sincronizar "Pessoas" (Léo/Paola) e o dono de cada item do inventário.
-- Rode UMA VEZ no SQL Editor do Cloud. Idempotente.
-- ══════════════════════════════════════════════════════════════

-- Lista de pessoas, sincronizada entre aparelhos (substitui o localStorage só no inventário por ora)
create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.members enable row level security;
grant select, insert, update, delete on public.members to authenticated;
grant all on public.members to service_role;

drop policy if exists "members_own" on public.members;
create policy "members_own" on public.members
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Dono do item do inventário quando NÃO for compartilhado
alter table public.inventory add column if not exists person text;
