-- v1.48.0 — Pending transactions (builds on the RAM-25 inbox_items table).
--
-- inbox_items already holds per-USER items that aren't in any ledger yet.
-- Pending transactions adds:
--   • a choice of ledger on accept → remember which ledger each accepted
--     item went to (accepted_household_id) and the key used to recognise
--     similar items (match_key = normalised merchant or description), so
--     the accept screen can pre-select the ledger once the user has put
--     similar items in the same ledger twice;
--   • a new source: AI agents via the Homu MCP server (parse_method
--     'agent').
--
-- Purely additive; existing rows and the email / API-key paths are
-- unaffected.

alter table public.inbox_items
  add column if not exists match_key text,
  add column if not exists accepted_household_id uuid
    references public.households(id) on delete set null;

alter table public.inbox_items drop constraint if exists inbox_items_parse_method_check;
alter table public.inbox_items add constraint inbox_items_parse_method_check
  check (parse_method is null or parse_method in ('pattern', 'llm', 'manual', 'agent'));

-- Ledger learning lookup: "this user's most recent accepts for this key".
create index if not exists inbox_items_learning_idx
  on public.inbox_items (user_id, match_key, reviewed_at desc)
  where status = 'accepted';
