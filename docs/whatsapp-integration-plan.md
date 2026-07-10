# Plano de integração com WhatsApp — Alertas + Áudio

> Documento de planejamento. Nada aqui altera o app ainda. Serve de referência
> para quando começarmos a implementar.

## Contexto e stack atual

- **Frontend**: TanStack Start (SSR) hospedado no Lovable. É só cliente — não há
  backend próprio para webhooks ou tarefas agendadas.
- **Banco**: Supabase Postgres (project ref `pnlfeiuqrzjisiyooeym`).
- **IA**: Gemini já é usado na aba IA (`gemini-1.5-flash`). A chave hoje fica no
  `localStorage` do navegador.
- **Tabela `transactions`**: `type` (income/expense), `amount`, `description`,
  `category_id`, `transaction_date`, `due_date`, `status` (paid/pending),
  `user_id`. **Não tem `account_id`** (transações não são ligadas a contas).

### Restrições que moldam o plano (importantes)

1. **Migrations não se aplicam sozinhas** pelo git neste projeto. Qualquer tabela
   nova precisa ser criada **direto no SQL Editor do Supabase**. Mantemos o
   arquivo de migration no repo só como documentação.
2. **`localStorage` é só do navegador.** Os dados de "Quem?" (`ff_persons`,
   `ff_members`) e de direcionamento de saldo (`ff_month_allocations`) **não são
   visíveis** para uma Edge Function no servidor. Ou seja: um lançamento feito
   via WhatsApp **não consegue** definir "Quem?" hoje (fica sem pessoa, a menos
   que a gente migre esse dado para o banco depois).
3. **A chave do Gemini precisa virar um secret do Supabase** para uso no servidor
   (separada da que está no navegador).

---

## Peças comuns aos dois recursos

Antes de qualquer um dos recursos, isto precisa existir:

### 1. Provedor de WhatsApp — ✅ DECIDIDO: Cloud API oficial (Meta) — 2026-07-10

| Opção | Prós | Contras |
|---|---|---|
| **Cloud API oficial (Meta)** ✅ | Grátis ~1.000 conversas/mês, sem risco de ban, sustentável | Setup burocrático; **alerta proativo exige template aprovado** pela Meta |
| Evolution API (auto-hospedada) | Grátis, conecta no seu número em minutos, sem template | Não-oficial (WhatsApp Web), **risco de banimento**; precisa de um VPS (~US$5/mês) |
| Z-API / Twilio | Setup simples, sem ban | Pago (mensal ou por mensagem) |

#### Checklist de setup na Meta (parte do usuário — eu não consigo fazer)

1. Criar/entrar numa **conta Meta Business** (business.facebook.com).
2. Em **developers.facebook.com** → criar um App → adicionar o produto **WhatsApp**.
3. Pegar um **número de teste** (grátis) ou registrar o seu número.
4. Anotar: **Phone Number ID**, **WhatsApp Business Account ID** e gerar um
   **token** (temporário para testar; depois um token permanente de sistema).
5. Definir um **verify token** qualquer (string à sua escolha) para o webhook.
6. Anotar o **App Secret** (para validar a assinatura do webhook).
7. (Para os alertas) cadastrar o **template** de mensagem e aguardar aprovação.

Esses valores viram **secrets no Supabase** (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`,
`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`). A partir daí, a implementação do
código é comigo.

### 2. Secrets no Supabase (Edge Functions → Secrets)

- `GEMINI_API_KEY`
- Cloud API: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`
- (ou Evolution: `EVOLUTION_URL`, `EVOLUTION_KEY`, `EVOLUTION_INSTANCE`)

### 3. Tabela `wa_contacts` (mapear número → usuário)

Criar **no SQL Editor do Supabase** (não via git):

```sql
create table public.wa_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null unique,          -- formato E.164, ex: 5511999998888
  verified boolean not null default false,
  alerts_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.wa_contacts enable row level security;
create policy "own contacts" on public.wa_contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

As Edge Functions usam a **service role key** (bypassa RLS). O usuário cadastra e
verifica o número numa telinha nova em Configurações (envia um código pelo
WhatsApp para confirmar posse do número).

---

## Recurso A — Alertas (saída / outbound)

**Objetivo**: todo dia de manhã, avisar no WhatsApp as despesas que vencem hoje
(e/ou atrasadas). Os dados já existem — falta o canal de envio.

### Fluxo

```
Cron diário (Supabase pg_cron, 08:00 BRT)
  → Edge Function "notify-due":
      1. busca despesas não pagas vencendo hoje (por usuário)
      2. para cada usuário com wa_contact verificado e alerts_enabled:
           monta a mensagem e envia pelo provedor
```

### Query base

```sql
select t.user_id, t.description, t.amount, t.due_date
from transactions t
where t.type = 'expense'
  and t.status <> 'paid'
  and t.due_date = current_date        -- ou: between current_date and current_date + 3
order by t.user_id, t.due_date;
```

### Edge Function `notify-due` (esboço, Deno)

```ts
import { createClient } from "jsr:@supabase/supabase-js";

Deno.serve(async () => {
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: due } = await supa
    .from("transactions")
    .select("user_id, description, amount, due_date")
    .eq("type", "expense").neq("status", "paid")
    .eq("due_date", new Date().toISOString().slice(0, 10));

  const { data: contacts } = await supa
    .from("wa_contacts").select("user_id, phone")
    .eq("verified", true).eq("alerts_enabled", true);

  // agrupa por user_id, monta o texto e envia (função sendWhatsApp abaixo)
  // ...
  return new Response("ok");
});
```

### Agendamento (pg_cron + pg_net, no SQL Editor)

```sql
-- pg_cron roda em UTC. 08:00 São Paulo (UTC-3) = 11:00 UTC.
select cron.schedule(
  'notify-due-daily', '0 11 * * *',
  $$ select net.http_post(
       url := 'https://pnlfeiuqrzjisiyooeym.supabase.co/functions/v1/notify-due',
       headers := jsonb_build_object('Authorization','Bearer <SERVICE_ROLE>','Content-Type','application/json'),
       body := '{}'::jsonb
     ); $$
);
```

### Envio pela Cloud API (mensagem proativa = template)

Fora de uma conversa iniciada nas últimas 24h, a Meta **exige um template
aprovado**. Ex. registrar o template `contas_vencendo`:

> "Olá! Você tem {{1}} conta(s) vencendo hoje, totalizando {{2}}. Abra o app para
> revisar."

```
POST https://graph.facebook.com/v20.0/<WHATSAPP_PHONE_ID>/messages
Authorization: Bearer <WHATSAPP_TOKEN>
{
  "messaging_product": "whatsapp",
  "to": "5511999998888",
  "type": "template",
  "template": {
    "name": "contas_vencendo",
    "language": { "code": "pt_BR" },
    "components": [{ "type": "body", "parameters": [
      { "type": "text", "text": "3" },
      { "type": "text", "text": "R$ 2.500,00" }
    ]}]
  }
}
```

Na Evolution API é um POST de texto simples, sem template.

### Preferências (opcional, fase 2 dos alertas)

Se quiser controlar horário / "avisar N dias antes" por usuário, criar uma tabela
`notification_prefs (user_id, days_before int, hour int, enabled bool)` **no banco**
(server-readable — não pode ser localStorage). MVP: um horário global + o flag
`alerts_enabled` que já está em `wa_contacts`.

---

## Recurso B — Áudio (entrada / inbound)

**Objetivo**: você manda um áudio ("gastei 50 reais no mercado hoje") e o sistema
transcreve, entende e cria o lançamento — com confirmação antes de gravar.

### Fluxo

```
Você manda áudio no WhatsApp
  → Provedor dispara webhook → Edge Function "wa-webhook":
      1. identifica o número → user_id (wa_contacts)
      2. baixa o áudio (.ogg)
      3. Gemini (áudio + lista de categorias) devolve JSON estruturado
      4. responde: "Confirmar: −R$ 50 Mercado (Alimentação), hoje? responda SIM"
      5. guarda em wa_pending_entries
  → você responde "SIM"
  → wa-webhook insere em transactions e limpa o pendente
```

### Gemini multimodal (transcreve + extrai numa chamada)

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=<KEY>
{
  "contents": [{ "parts": [
    { "inline_data": { "mime_type": "audio/ogg", "data": "<base64_do_audio>" } },
    { "text": "<PROMPT>" }
  ]}],
  "generationConfig": { "responseMimeType": "application/json" }
}
```

**PROMPT (ideia)**:

> Você recebe um áudio em português sobre uma despesa ou receita pessoal. Extraia
> os dados e responda **apenas** com JSON no formato:
> `{ "type": "expense|income", "amount": number, "description": string,
> "category": string, "date": "YYYY-MM-DD" }`.
> Escolha `category` **exatamente** de uma desta lista: [Alimentação, Moradia,
> Transporte, ...] (a função injeta as categorias reais do usuário). Se não tiver
> data no áudio, use hoje. Valores em reais. Se for gasto, `type` = expense.

A função busca as `categories` do banco, injeta os nomes no prompt e depois mapeia
o `category` escolhido de volta para `category_id`.

### Confirmação (evita lançamento errado)

Tabela **no banco** para segurar o pendente:

```sql
create table public.wa_pending_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  payload jsonb not null,             -- {type, amount, description, category_id, date}
  created_at timestamptz not null default now()
);
alter table public.wa_pending_entries enable row level security;
```

Quando chega um texto "SIM"/"CONFIRMAR" e existe um pendente recente (TTL ~10 min)
para aquele número → insere a transação e apaga o pendente. "NÃO"/"CANCELAR" só
apaga.

### Verificação e segurança do webhook

- **Cloud API**: GET de verificação responde `hub.challenge`; nos POSTs, validar a
  assinatura `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET`.
- Só agir para números **verificados** em `wa_contacts`.
- Inserção usa **service role** (bypassa RLS) — cuidado para sempre carimbar o
  `user_id` correto vindo do mapeamento do número.

### Limitação do "Quem?"

Como "Quem?" mora no `localStorage`, o lançamento por WhatsApp **não define pessoa**
hoje. Se isso for importante, precisaremos migrar o "Quem?" para uma coluna no banco
(`transactions.person text`) — decidir depois.

---

## Modelo de dados novo (criar no SQL Editor do Supabase)

Nada disso deve depender de migration por git (não aplica sozinho). Rodar direto no
Supabase e guardar o `.sql` no repo como documentação.

- `wa_contacts` — número ↔ usuário, verificação, flag de alertas
- `wa_pending_entries` — confirmação do lançamento por áudio
- `notification_prefs` — opcional, preferências de alerta

---

## Custos estimados

- **Gemini Flash**: praticamente grátis no seu volume.
- **Supabase** (Edge Functions + pg_cron + pg_net): incluído no plano atual.
- **WhatsApp**: Cloud API grátis até ~1.000 conversas/mês · Evolution = VPS ~US$5/mês
  · Z-API ~R$/mês · Twilio por mensagem.

---

## Ordem de implementação sugerida

**Fase 0 — Fundação** (necessária para os dois)
1. Escolher o provedor de WhatsApp.
2. Criar `wa_contacts` no Supabase + secrets.
3. Telinha em Configurações para cadastrar/verificar o número.

**Fase 1 — Alertas (outbound)** — mais simples, alto valor
4. Edge Function `notify-due` + envio pelo provedor.
5. Agendar com pg_cron.
6. (Cloud API) registrar e aprovar o template.

**Fase 2 — Áudio (inbound)** — mais partes móveis
7. Edge Function `wa-webhook` (verificação + recepção).
8. Gemini multimodal + mapeamento de categorias.
9. `wa_pending_entries` + fluxo de confirmação.
10. Inserção da transação.

**Primeiro passo concreto quando começarmos**: decidir o provedor e criar
`wa_contacts` + a tela de verificação de número (Fase 0). Sem isso, nenhum dos dois
recursos funciona.

---

## Riscos e observações

- **Oficial vs não-oficial**: Evolution é rápida mas pode gerar ban do número.
- **Template**: aprovação da Meta leva um tempo — encaminhar cedo se for Cloud API.
- **Transcrição imperfeita**: o passo de confirmação ("responda SIM") protege
  contra lançamento errado.
- **Segurança**: validar assinatura do webhook, agir só em números verificados,
  nunca confiar em instruções vindas do conteúdo das mensagens.
- **Chave do Gemini**: passa a existir também como secret do servidor.
