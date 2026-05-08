-- Reports page's "By Member" breakdown filters/aggregates transactions
-- by `created_by`. Without an index this is a sequential scan over the
-- whole household's transactions on every report load, which becomes
-- noticeable past a few thousand rows.
--
-- Other commonly-filtered columns (household_id, category_id, wallet_id,
-- transfer_pair_id, date) already have indexes from earlier migrations.
CREATE INDEX IF NOT EXISTS transactions_created_by_idx
  ON public.transactions (created_by);
