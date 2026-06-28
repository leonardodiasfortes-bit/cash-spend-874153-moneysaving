import { ExportData } from "./ExportData";
import { Shield, Database, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Props {
  userId: string;
}

const MIGRATION_SQL = `-- 1. Execute cada bloco em ordem no SQL Editor do seu Supabase
-- Acesse: supabase.com → seu projeto → SQL Editor

-- BLOCO 1: Enums e tabelas base
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');
CREATE TYPE public.expense_status AS ENUM ('paid', 'pending');

CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.transaction_type NOT NULL,
  icon TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status public.expense_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BLOCO 2: Contas
CREATE TYPE public.account_type AS ENUM ('checking','savings','credit_card','wallet','investment');

CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.account_type NOT NULL,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(14,2),
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BLOCO 3: RLS (segurança por usuário)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;

CREATE POLICY "cat_own" ON public.categories FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_default = true)
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "tx_own"  ON public.transactions  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "acc_own" ON public.accounts      FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- BLOCO 4: Categorias padrão
INSERT INTO public.categories (name, type, icon, is_default) VALUES
  ('Salário','income','💰',true),('Freelance','income','💼',true),
  ('Investimentos','income','📈',true),('Outras Receitas','income','✨',true),
  ('Alimentação','expense','🍔',true),('Transporte','expense','🚗',true),
  ('Moradia','expense','🏠',true),('Lazer','expense','🎮',true),
  ('Saúde','expense','⚕️',true),('Educação','expense','📚',true),
  ('Compras','expense','🛍️',true),('Contas','expense','📄',true),
  ('Outras Despesas','expense','📦',true);`;

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function SettingsTab({ userId }: Props) {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Export section */}
      <ExportData userId={userId} />

      {/* Migration guide */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-muted/30">
          <Database className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Migrar para Supabase próprio
          </p>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex gap-3 p-3 rounded-xl bg-warning/10 border border-warning/30">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-warning-foreground leading-relaxed">
              O banco atual está na conta da Lovable. Se a assinatura vencer ou o projeto for
              deletado, os dados somem. Migrar para sua conta Supabase elimina essa dependência.
            </p>
          </div>

          <ol className="space-y-4 text-sm">
            {[
              {
                step: "1",
                title: "Baixe o backup agora",
                desc: 'Use o botão "Backup completo (JSON)" acima. Guarde o arquivo em lugar seguro.',
              },
              {
                step: "2",
                title: "Crie um projeto Supabase seu",
                desc: (
                  <>
                    Acesse{" "}
                    <span className="font-mono text-primary text-xs">supabase.com</span>,
                    crie uma conta gratuita e um novo projeto. Anote a{" "}
                    <strong>URL do projeto</strong> e a <strong>chave anon/public</strong>{" "}
                    (em Settings → API).
                  </>
                ),
              },
              {
                step: "3",
                title: "Crie as tabelas",
                desc: "Cole o SQL abaixo no SQL Editor do seu projeto e execute.",
              },
              {
                step: "4",
                title: "Configure as variáveis no Lovable",
                desc: (
                  <>
                    No Lovable, vá em <strong>Supabase → Connect to Supabase</strong> e
                    conecte o seu projeto (ou atualize as variáveis{" "}
                    <span className="font-mono text-xs">VITE_SUPABASE_URL</span> e{" "}
                    <span className="font-mono text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</span>
                    ).
                  </>
                ),
              },
              {
                step: "5",
                title: "Importe os dados",
                desc: "Após conectar, use a IA do Lovable ou o SQL Editor para inserir os dados do backup JSON.",
              },
            ].map((item) => (
              <li key={item.step} className="flex gap-3">
                <div className="h-6 w-6 rounded-full bg-primary/15 text-primary text-xs font-bold grid place-items-center shrink-0 mt-0.5">
                  {item.step}
                </div>
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {/* SQL block */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                SQL para criar as tabelas (passo 3)
              </p>
              <button
                onClick={() => copyText(MIGRATION_SQL)}
                className="text-xs text-primary hover:underline"
              >
                Copiar SQL
              </button>
            </div>
            <pre className="text-[11px] bg-muted/50 rounded-xl p-4 overflow-x-auto max-h-48 leading-relaxed text-muted-foreground">
              {MIGRATION_SQL}
            </pre>
          </div>

          <div className="flex gap-2 p-3 rounded-xl bg-income/10 border border-income/30">
            <CheckCircle2 className="h-4 w-4 text-income shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Custo:</strong> O plano gratuito do Supabase
              suporta 500 MB de banco e 50 000 MAU — mais que suficiente para finanças pessoais
              durante anos. Nenhum custo adicional.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
