-- RAM-27 — Budget RPC: handle split transactions
--
-- The original `get_budget_spent_this_month()` (0034_budgets.sql) groups
-- spending by `transactions.category_id`.  For split transactions the
-- real per-category amounts live in `transactions.splits` (a JSONB array
-- of { amount, category_id, notes? } objects); the parent row's
-- `category_id` may be null or just the primary category.
--
-- This migration replaces the function with a version that:
--   1. Sums all NON-SPLIT expense transactions per category_id (original
--      behaviour — unchanged for the vast majority of rows).
--   2. UNIONs in the per-split-line amounts by unnesting `splits` with
--      jsonb_array_elements, casting the JSONB fields to the right types.
--
-- The two sets are combined with UNION ALL then aggregated again so the
-- final result set is still `(category_id, spent)` — exactly the same
-- shape the client already consumes.
--
-- security definer + pinned search_path follows the pattern from 0015
-- and the original function definition in 0034.

create or replace function public.get_budget_spent_this_month()
returns table (category_id uuid, spent numeric)
language sql
stable
security definer
set search_path = public
as $$
  -- Non-split expense transactions (original behaviour).
  select t.category_id,
         coalesce(sum(t.amount), 0)::numeric as spent
  from public.transactions t
  where t.household_id = public.current_household_id()
    and t.type         = 'expense'
    and t.transfer_pair_id is null
    and t.category_id  is not null
    and (t.splits is null or jsonb_array_length(t.splits) = 0)
    and t.date >= date_trunc('month', current_date)::date
    and t.date <  (date_trunc('month', current_date) + interval '1 month')::date
  group by t.category_id

  union all

  -- Split transactions: each line item counted against its own category.
  select (line->>'category_id')::uuid              as category_id,
         coalesce(sum((line->>'amount')::numeric), 0)::numeric as spent
  from public.transactions t,
       jsonb_array_elements(t.splits) as line
  where t.household_id = public.current_household_id()
    and t.type         = 'expense'
    and t.transfer_pair_id is null
    and t.splits       is not null
    and jsonb_array_length(t.splits) > 0
    and (line->>'category_id') is not null
    and t.date >= date_trunc('month', current_date)::date
    and t.date <  (date_trunc('month', current_date) + interval '1 month')::date
  group by (line->>'category_id')::uuid
$$;

-- Grant is idempotent — the function already existed.
grant execute on function public.get_budget_spent_this_month() to authenticated;
