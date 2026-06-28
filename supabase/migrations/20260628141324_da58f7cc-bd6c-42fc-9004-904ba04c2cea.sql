
-- Enum types
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense');
CREATE TYPE public.expense_status AS ENUM ('paid', 'pending');

-- Categories table
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.transaction_type NOT NULL,
  icon TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own + default categories" ON public.categories
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_default = true);
CREATE POLICY "Users insert own categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own categories" ON public.categories
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Seed default categories
INSERT INTO public.categories (name, type, icon, is_default) VALUES
  ('Salário', 'income', '💰', true),
  ('Freelance', 'income', '💼', true),
  ('Investimentos', 'income', '📈', true),
  ('Outras Receitas', 'income', '✨', true),
  ('Alimentação', 'expense', '🍔', true),
  ('Transporte', 'expense', '🚗', true),
  ('Moradia', 'expense', '🏠', true),
  ('Lazer', 'expense', '🎮', true),
  ('Saúde', 'expense', '⚕️', true),
  ('Educação', 'expense', '📚', true),
  ('Compras', 'expense', '🛍️', true),
  ('Contas', 'expense', '📄', true),
  ('Outras Despesas', 'expense', '📦', true);

-- Transactions table
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

CREATE INDEX idx_transactions_user_date ON public.transactions(user_id, transaction_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own transactions" ON public.transactions
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
