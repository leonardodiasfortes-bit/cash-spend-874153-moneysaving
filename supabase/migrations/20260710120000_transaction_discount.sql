ALTER TABLE public.transactions
  ADD COLUMN discount NUMERIC NOT NULL DEFAULT 0 CHECK (discount >= 0);
