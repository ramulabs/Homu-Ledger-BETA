-- RAM-25 Phase 1 — Email Inbox foundation
--
-- New top-level feature: HOMU receives transaction emails forwarded from the
-- user's mailbox (or pushed by their own n8n / script via API), parses them,
-- and queues each one for one-tap confirmation. See `.forge/tasks/ram-25.md`
-- for the full PRD.
--
-- This migration is Phase 1: the SCHEMA only. Parsing logic, seed regex rows
-- for Indonesian banks, the Cloudflare Email Routing webhook, the Settings
-- UI and the Inbox bento all ship in subsequent PRs. Once this lands, n8n /
-- curl can already POST parsed transactions to `inbox_items` (via the API
-- endpoint shipped in the next sub-PR).
--
-- Purely additive — 5 new tables in `public`, no changes to existing tables
-- aside from a foreign-key reference INTO `transactions` (set-null on delete,
-- so dropping a transaction is non-blocking).

-- ─── 1. inbox_items ─────────────────────────────────────────────────────
-- Pending email-derived transactions awaiting user confirmation. Only
-- promoted to a real `transactions` row when the user accepts (the
-- accept-flow server action does the insert + flips `status` here).
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Source / idempotency
  source_domain text not null,                -- e.g. 'bca.co.id'
  sender_email text not null,                 -- raw From: address
  message_id text not null,                   -- email Message-ID header
  received_at timestamptz not null,

  -- Raw payload (kept for audit / re-parse)
  raw_subject text,
  raw_body text not null,
  raw_body_format text not null
    check (raw_body_format in ('text', 'html')),

  -- Parsed result (nullable until parsing finishes — Phase 2 fills these
  -- from the LLM / pattern pipeline; for now an n8n caller can post a
  -- pre-parsed payload and we store it here directly)
  parsed jsonb,
  parse_method text
    check (parse_method is null
        or parse_method in ('pattern', 'llm', 'manual')),
  parse_confidence real,
  parse_error text,

  -- Lifecycle
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'duplicate')),
  accepted_transaction_id uuid
    references public.transactions(id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),

  -- Idempotency: an email with the same Message-ID is never journaled twice
  -- for the same user. The webhook can fire repeatedly; we no-op.
  unique (user_id, message_id)
);

create index inbox_items_user_status_idx
  on public.inbox_items (user_id, status, received_at desc);

alter table public.inbox_items enable row level security;

-- INSERTs are server-only (via the API endpoints, using the service role).
-- Omitting an INSERT policy = all client-side inserts denied by RLS, which
-- is exactly the safety we want.
create policy "inbox_items: select own"
  on public.inbox_items for select using (user_id = auth.uid());

create policy "inbox_items: update own"
  on public.inbox_items for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── 2. inbox_sender_patterns ──────────────────────────────────────────
-- Per-user learned regex patterns — the cache layer in front of the LLM
-- parser (Phase 2+). Populated by the parser when an LLM call succeeds
-- and the pattern is distilled. Read-only from the client (mutations
-- happen server-side); the Settings page just surfaces stats.
create table public.inbox_sender_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_domain text not null,
  pattern jsonb not null,                     -- regex set + field mapping
  successful_uses int not null default 0,
  failed_uses int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sender_domain)
);

alter table public.inbox_sender_patterns enable row level security;

create policy "inbox_sender_patterns: select own"
  on public.inbox_sender_patterns for select using (user_id = auth.uid());

-- updated_at autoset (reuses the trigger function added in 0028).
create trigger inbox_sender_patterns_set_updated_at
  before update on public.inbox_sender_patterns
  for each row execute function public.set_updated_at();

-- ─── 3. inbox_sender_patterns_seed ─────────────────────────────────────
-- Global, admin-managed seed templates for well-known senders (Indonesian
-- banks first; e-wallets / cards in Phase 5+). Read-only for every user
-- via RLS. Rows ship in the Phase 2 migration alongside the parser; this
-- migration just provisions the table.
create table public.inbox_sender_patterns_seed (
  id uuid primary key default gen_random_uuid(),
  sender_domain text not null unique,
  pattern jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inbox_sender_patterns_seed enable row level security;

create policy "inbox_sender_patterns_seed: read all"
  on public.inbox_sender_patterns_seed for select using (true);

-- Admin writes happen via service-role / migrations; no client policies.

create trigger inbox_sender_patterns_seed_set_updated_at
  before update on public.inbox_sender_patterns_seed
  for each row execute function public.set_updated_at();

-- ─── 4. user_api_keys ──────────────────────────────────────────────────
-- API keys for the n8n / power-user path. The full key is shown ONCE on
-- creation; only the prefix (first 8 chars) is shown afterwards. Server
-- compares incoming Bearer tokens against `key_hash` (bcrypt).
create table public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_prefix text not null,                   -- first 8 chars, shown in UI
  key_hash text not null,                     -- bcrypt of the full key
  name text not null,                         -- user label, e.g. "n8n at home"
  scopes text[] not null default '{inbox:write}',
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (key_hash)
);

alter table public.user_api_keys enable row level security;

create policy "user_api_keys: select own"
  on public.user_api_keys for select using (user_id = auth.uid());

create policy "user_api_keys: insert own"
  on public.user_api_keys for insert with check (user_id = auth.uid());

create policy "user_api_keys: update own"
  on public.user_api_keys for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── 5. user_inbox_addresses ──────────────────────────────────────────
-- Maps a user to their personal `<local_part>@inbox.homu.app` address.
-- Generated server-side on first opt-in. UNIQUE on local_part so the
-- inbound-email webhook can resolve `to:` back to a user.
create table public.user_inbox_addresses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  local_part text not null unique,
  created_at timestamptz not null default now()
);

alter table public.user_inbox_addresses enable row level security;

create policy "user_inbox_addresses: select own"
  on public.user_inbox_addresses for select using (user_id = auth.uid());

-- INSERT is server-only (the local_part is generated server-side).
