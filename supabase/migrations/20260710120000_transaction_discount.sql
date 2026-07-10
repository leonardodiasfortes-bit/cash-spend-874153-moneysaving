ALTER TABLE public.transactions
  ADD COLUMN discount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  ADD CONSTRAINT transactions_discount_le_amount CHECK (discount <= amount);
