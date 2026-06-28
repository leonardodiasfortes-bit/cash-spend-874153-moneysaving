CREATE TYPE public.recurrence_type AS ENUM ('none', 'monthly', 'yearly', 'installment');

ALTER TABLE public.transactions
  ADD COLUMN recurrence_type public.recurrence_type NOT NULL DEFAULT 'none',
  ADD COLUMN installment_current INTEGER CHECK (installment_current >= 1),
  ADD COLUMN installment_total  INTEGER CHECK (installment_total  >= 1),
  ADD COLUMN recurrence_group_id UUID;

CREATE INDEX idx_transactions_recurrence_group ON public.transactions(recurrence_group_id);
