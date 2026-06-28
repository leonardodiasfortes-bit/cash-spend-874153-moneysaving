import { useState } from "react";
import { ExportData } from "./ExportData";
import { ImportData } from "./ImportData";
import { Shield, Database, CheckCircle2, Copy, Check } from "lucide-react";

interface Props {
  userId: string;
}

// Complete SQL with ALL migrations in order
const FULL_SQL = `-- ══════════════════════════════════════════════════════
-- COLE ESTE SQL COMPLETO NO SQL EDITOR DO SEU SUPABASE
-- Execute tudo de uma vez (Ctrl+Enter ou botão RUN)
-- ══════════════════════════════════════════════════════

-- 1. Enums
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');
CREATE TYPE public.expense_status   AS ENUM ('paid', 'pending');
CREATE TYPE public.account_type     AS ENUM ('checking','savings','credit_card','wallet','investment');

-- 2. Tabela de categorias
CREATE TABLE public.categories (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  type        public.transaction_type NOT NULL,
  icon        TEXT,
  is_default  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de transações
CREATE TABLE public.transactions (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type             public.transaction_type NOT NULL,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description      TEXT        NOT NULL,
  category_id      UUID        REFERENCES public.categories(id) ON DELETE SET NULL,
  transaction_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE,
  status           public.expense_status,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_date ON public.transactions(user_id, transaction_date DESC);

-- 4. Tabela de contas
CREATE TABLE public.accounts (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  type         public.account_type NOT NULL,
  balance      NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(14,2),
  color        TEXT,
  icon         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_user ON public.accounts(user_id);

-- 5. RLS (Row Level Security)
ALTER TABLE public.categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts     ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts     TO authenticated;
GRANT ALL ON public.categories  TO service_role;
GRANT ALL ON public.transactions TO service_role;
GRANT ALL ON public.accounts     TO service_role;

CREATE POLICY "cat_select" ON public.categories
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_default = true);
CREATE POLICY "cat_insert" ON public.categories
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "cat_update" ON public.categories
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "cat_delete" ON public.categories
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "tx_all" ON public.transactions
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "acc_all" ON public.accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 6. Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Categorias padrão
INSERT INTO public.categories (name, type, icon, is_default) VALUES
  ('Salário',          'income',  '💰', true),
  ('Freelance',        'income',  '💼', true),
  ('Investimentos',    'income',  '📈', true),
  ('Outras Receitas',  'income',  '✨', true),
  ('Alimentação',      'expense', '🍔', true),
  ('Transporte',       'expense', '🚗', true),
  ('Moradia',          'expense', '🏠', true),
  ('Lazer',            'expense', '🎮', true),
  ('Saúde',            'expense', '⚕️', true),
  ('Educação',         'expense', '📚', true),
  ('Compras',          'expense', '🛍️', true),
  ('Contas',           'expense', '📄', true),
  ('Outras Despesas',  'expense', '📦', true);`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-xs text-primary hover:underline"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado!" : "Copiar SQL"}
    </button>
  );
}

const STEPS = [
  {
    n: "1",
    title: "Baixe o backup agora",
    content: (
      <p className="text-xs text-muted-foreground leading-relaxed">
        Use o botão <strong>"Backup completo (JSON)"</strong> na seção abaixo. Guarde o arquivo em lugar
        seguro — ele será usado para importar os dados depois.
      </p>
    ),
  },
  {
    n: "2",
    title: "Crie o banco no seu Supabase",
    content: (
      <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
        <p>
          Em <span className="font-mono text-primary">supabase.com</span> → seu projeto →{" "}
          <strong>SQL Editor</strong> → <strong>New Query</strong>.
          Cole o SQL completo abaixo e clique em <strong>RUN</strong>.
        </p>
      </div>
    ),
    sql: true,
  },
  {
    n: "3",
    title: "Reconecte o app ao novo Supabase",
    content: (
      <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
        <p>No Lovable, clique em <strong>Supabase</strong> (ícone verde no canto) → <strong>Connect to Supabase</strong>.</p>
        <p>Ou acesse <strong>Project Settings → Integrations → Supabase</strong> → desconecte o projeto atual → conecte o seu novo.</p>
        <p>
          Isso atualiza automaticamente as variáveis{" "}
          <span className="font-mono">VITE_SUPABASE_URL</span> e{" "}
          <span className="font-mono">VITE_SUPABASE_PUBLISHABLE_KEY</span>.
        </p>
        <div className="rounded-lg bg-warning/10 border border-warning/30 p-2 mt-1">
          Após reconectar, <strong>crie sua conta</strong> no app (o banco novo está vazio) antes de importar.
        </div>
      </div>
    ),
  },
  {
    n: "4",
    title: "Importe seus dados",
    content: (
      <p className="text-xs text-muted-foreground leading-relaxed">
        Use a seção <strong>"Importar backup"</strong> abaixo. Selecione o JSON que baixou no passo 1.
        O sistema mapeia as categorias automaticamente e recria tudo com seu novo usuário.
      </p>
    ),
  },
];

export function SettingsTab({ userId }: Props) {
  const [sqlOpen, setSqlOpen] = useState(false);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Export */}
      <ExportData userId={userId} />

      {/* Migration guide */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
          <Database className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Migrar para Supabase próprio — passo a passo
          </p>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex gap-2 p-3 rounded-xl bg-income/10 border border-income/30">
            <CheckCircle2 className="h-4 w-4 text-income shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              <strong className="text-foreground">Conta Supabase criada ✓</strong> — ótimo!
              Siga os passos abaixo. O plano gratuito do Supabase suporta anos de uso sem custo.
            </p>
          </div>

          <ol className="space-y-5">
            {STEPS.map((step) => (
              <li key={step.n} className="flex gap-3">
                <div className="h-6 w-6 rounded-full bg-primary/15 text-primary text-xs font-bold grid place-items-center shrink-0 mt-0.5">
                  {step.n}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">{step.title}</p>
                  {step.content}
                  {step.sql && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                          onClick={() => setSqlOpen((v) => !v)}
                        >
                          {sqlOpen ? "Ocultar SQL" : "Ver SQL completo"}
                        </button>
                        <CopyButton text={FULL_SQL} />
                      </div>
                      {sqlOpen && (
                        <pre className="text-[11px] bg-muted/50 rounded-xl p-4 overflow-x-auto max-h-64 leading-relaxed text-muted-foreground whitespace-pre-wrap">
                          {FULL_SQL}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Import */}
      <ImportData userId={userId} />

      {/* Shield note */}
      <div className="flex gap-2 p-4 rounded-xl border bg-muted/20 text-xs text-muted-foreground">
        <Shield className="h-4 w-4 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Após a migração, os dados do Supabase antigo (Lovable) continuam lá até você ou a Lovable
          deletarem o projeto. Nada é deletado automaticamente — você tem tempo para validar tudo
          antes de encerrar a assinatura da Lovable.
        </p>
      </div>
    </div>
  );
}
