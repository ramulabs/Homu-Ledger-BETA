-- RAM-27 — Split transactions
--
-- Allows a single transaction to be divided across multiple categories
-- (e.g. Rp 450k at Hypermart → Rp 200k Groceries + Rp 150k Household +
-- Rp 100k Personal Care). The parent transaction keeps its total `amount`
-- and primary `category_id` (or null); the `splits` JSONB column holds
-- the breakdown when the user has divided it.
--
-- Null = no split (default, existing behaviour is fully preserved).
-- When present: an array of { amount, category_id, notes? } objects.
-- The split amounts must sum to the parent transaction's amount — this
-- invariant is enforced client-side; Postgres stores whatever we send.
--
-- JSONB is the right type here:
--   * No fixed schema needed (notes is optional).
--   * Searchable via jsonb_array_elements for the budget RPC.
--   * No FK cascade concern — category_ids inside splits are "soft"
--     references; if a category is deleted the split data remains but
--     simply won't join (same pattern as nullable category_id today).

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS splits jsonb;

COMMENT ON COLUMN public.transactions.splits IS
  'Optional array of split line items: [{amount, category_id, notes?}]. '
  'When present, amounts must sum to transactions.amount. '
  'Null = unsplit (default). Transfers never have splits.';
