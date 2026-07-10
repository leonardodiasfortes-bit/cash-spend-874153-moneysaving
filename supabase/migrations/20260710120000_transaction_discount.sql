-- Add a "discount" column to transactions to record value adjustments
-- without losing the original amount. Written idempotently so it applies
-- cleanly regardless of the current schema state.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS discount NUMERIC(14,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_discount_nonneg'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_discount_nonneg CHECK (discount >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_discount_le_amount'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_discount_le_amount CHECK (discount <= amount);
  END IF;
END $$;
