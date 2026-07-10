-- ══════════════════════════════════════════════════════════════
-- Integração WhatsApp — Fase 0
-- Rode UMA VEZ no SQL Editor do seu Supabase (migrations não se
-- aplicam sozinhas por git neste projeto — ver docs/whatsapp-integration-plan.md).
-- Re-executável com segurança (if not exists / drop policy if exists).
-- ══════════════════════════════════════════════════════════════

create table if not exists public.wa_contacts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  phone          text not null unique,          -- E.164 só dígitos, ex: 5511999998888
  label          text,                           -- nome amigável (ex: "Léo", "Paola")
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
