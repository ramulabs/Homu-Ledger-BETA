-- RAM-5 — Budgets & spending limits per category
--
-- Each household can set a monthly spending cap on each EXPENSE category.
-- The cap is per calendar month; "spent this month" is computed on read by
-- summing the household's expense transactions for that category in the
-- current month. There is no rollover — the counter resets implicitly on
-- the 1st of every month because the spent calculation is date-scoped.
--
-- v1 scope locked with product:
--   * Per-category only (no overall household cap).
--   * One row per (household_id, category_id) — UNIQUE enforced.
--   * Amount stored as numeric(14,2) to match transactions/wallets — using
--     bigint cents here would break currency formatting (households can be
--     IDR which has no fractional digits and amounts up to ~10^11).
--   * Currency mirrors the household at the moment the budget was set; if
--     the household currency changes we keep the original — re-edit to
--     refresh. (Simpler than chasing CASCADE updates.)
--
-- Safety surface:
--   * RLS mirrors transactions/categories — only members of the household
--     can read or write. The current_household_id() helper added in 0001
--     enforces "active ledger == own ledger".
--   * created_by is tracked so future audits can attribute who set a cap
--     in a shared household.

-- =========================================================================
-- 1. TABLE
-- =========================================================================
create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  category_id   uuid not null references public.categories(id) on delete cascade,
  amount        numeric(14,2) not null check (amount > 0),
  currency      text not null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, category_id)
);

create index budgets_household_idx on public.budgets (household_id);
create index budgets_category_idx  on public.budgets (category_id);

-- Reuse the shared updated_at trigger from 0028.
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- =========================================================================
-- 2. ROW LEVEL SECURITY
-- =========================================================================
alter table public.budgets enable row level security;

create policy "budgets: members can read"
  on public.budgets for select
  using (household_id = public.current_household_id());

create policy "budgets: members can insert"
  on public.budgets for insert
  with check (
    household_id = public.current_household_id()
    and (created_by is null or created_by = auth.uid())
  );

create policy "budgets: members can update"
  on public.budgets for update
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy "budgets: members can delete"
  on public.budgets for delete
  using (household_id = public.current_household_id());

-- =========================================================================
-- 3. RPC — spent-this-month per category, in one round-trip
-- =========================================================================
-- Returns { category_id, spent } rows for the CURRENT calendar month in the
-- caller's active household. Only expense transactions count (income / transfer
-- pairs are excluded). Used by the Settings → Budgets list and the home
-- budget card so neither needs to fetch the full transactions table just to
-- compute progress.
--
-- security definer + pinned search_path follows the policy from 0015.
create or replace function public.get_budget_spent_this_month()
returns table (category_id uuid, spent numeric)
language sql
stable
security definer
set search_path = public
as $$
  select t.category_id,
         coalesce(sum(t.amount), 0)::numeric as spent
  from public.transactions t
  where t.household_id = public.current_household_id()
    and t.type = 'expense'
    and t.transfer_pair_id is null
    and t.category_id is not null
    and t.date >= date_trunc('month', current_date)::date
    and t.date <  (date_trunc('month', current_date) + interval '1 month')::date
  group by t.category_id;
$$;

grant execute on function public.get_budget_spent_this_month() to authenticated;
