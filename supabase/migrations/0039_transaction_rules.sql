-- RAM-28 — User-defined categorization rules engine
--
-- Each household can define ordered rules that auto-assign a category
-- and/or notes to a transaction based on its description or amount.
-- Rules run on the CLIENT before AI categorization fires, so they are
-- fast (no round-trip) and deterministic.
--
-- Rule evaluation:
--   1. Iterate rules in order_idx ASC.
--   2. If ALL triggers match, apply the rule's actions.
--   3. If stop_processing is true, stop after the first match (default).
--      If false, continue to the next rule.
--
-- Trigger shapes  (stored in triggers jsonb[]):
--   { field: 'name'|'amount', op: 'contains'|'starts_with'|'equals'|'gt'|'lt', value: string }
--
-- Action shapes (stored in actions jsonb[]):
--   { field: 'category_id'|'notes', value: string }
--
-- Safety surface:
--   * RLS mirrors budgets / categories — only household members can
--     read or write their own rules.
--   * current_household_id() (added in 0001) enforces active ledger.

-- =========================================================================
-- 1. TABLE
-- =========================================================================
create table public.transaction_rules (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null,
  triggers        jsonb not null default '[]',
  actions         jsonb not null default '[]',
  order_idx       integer not null default 0,
  enabled         boolean not null default true,
  stop_processing boolean not null default true,
  created_at      timestamptz not null default now()
);

create index idx_transaction_rules_household
  on public.transaction_rules (household_id, order_idx);

-- =========================================================================
-- 2. ROW LEVEL SECURITY
-- =========================================================================
alter table public.transaction_rules enable row level security;

-- Single combined policy (covers SELECT, INSERT, UPDATE, DELETE)
-- mirrors the pattern used in budgets (0034).
create policy "transaction_rules: members can read"
  on public.transaction_rules for select
  using (household_id = public.current_household_id());

create policy "transaction_rules: members can insert"
  on public.transaction_rules for insert
  with check (household_id = public.current_household_id());

create policy "transaction_rules: members can update"
  on public.transaction_rules for update
  using  (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy "transaction_rules: members can delete"
  on public.transaction_rules for delete
  using (household_id = public.current_household_id());
