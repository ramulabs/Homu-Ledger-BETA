---
id: "ram-25"
title: "Email Inbox — auto-journal transactions from forwarded bank emails"
status: "planned"
priority: "P1"
assignee: "ramu-labs"
project: "homu-ledger-beta"
labels:
  - "Feature"
  - "Backend"
  - "Integration"
  - "Indonesian-finance"
created_at: "2026-05-26T00:00:00Z"
updated_at: "2026-05-26T00:00:00Z"
---

# Email Inbox — auto-journal transactions from forwarded bank emails

A new top-level feature: HOMU receives transaction emails forwarded from
the user's mailbox, parses them with a hybrid LLM-first / cached-pattern
pipeline, and stages each one as a row the user can confirm with one tap
(or edit in the full Add Transaction sheet). Goal: 80% of transactions
get into the ledger with zero typing.

Productized for every HOMU user. Indonesian banks first (BCA, Mandiri,
BNI, BRI); e-wallets / cards added later via the same infrastructure.

---

## 1. Problem

Logging every transaction by hand is the largest friction point in
HOMU. Users get a notification email from their bank within seconds of
swiping; that email contains everything HOMU needs (amount, time,
merchant). We're making them re-key it.

The user's stated requirement: "Method for it to know my transaction,
amount, type, name — triggered by the transaction email in my personal
email, then journal it directly there. Once it's journaled, it has some
kind of notification on undocumented transaction, then I can choose
which ledger that money goes to."

## 2. Decisions locked

These were settled in the design conversation. They constrain the rest
of this doc:

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Productized** — every HOMU user can connect | The feature kills the biggest UX papercut; can't justify shipping it for one account only. |
| 2 | **Inbox queue (not real until confirmed)** — separate `inbox_items` table, only becomes a `transactions` row on accept | Cleanest. Nothing pollutes the ledger until the user opts in. Rejecting is a no-op. |
| 3 | **Hybrid parsing**: LLM first; successful patterns cached per sender | LLM handles anything; cache keeps cost ≈ 0 for stable senders. |
| 4 | **Indonesian banks first** (BCA, Mandiri, BNI, BRI) | Marcel's primary use case + biggest coverage in the target market. E-wallets / cards in a Phase 5+ additive release. |
| 5 | **Inbound email forwarding** via Cloudflare Email Routing → webhook | Skips Google's restricted-scope verification ($75k/yr CASA). Works with any email provider. Better privacy (HOMU only sees forwarded mail, never the full mailbox). |
| 6 | **Accept UI**: two-step — one-tap confirm in the inbox list using defaults, OR open Add Transaction to edit before saving | Optimised for the common case (parse is right → one tap) without losing power. |
| 7 | **n8n is optional**, not the primary path | Power users hit the same `POST /api/inbox/transactions` endpoint with an API key; documented as an alternative. Default for everyone is forwarding. |

## 3. Architecture

```
┌─────────────────────────┐
│ User's mailbox (Gmail,  │
│ Outlook, iCloud, …)     │
│                         │
│ Filter: From contains   │
│ bca.co.id / mandiri…    │
│ → Forward to            │
│ <user>@inbox.homu.app   │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│ Cloudflare Email        │
│ Routing                 │
│ • catch-all on          │
│   inbox.homu.app        │
│ • POSTs JSON to a       │
│   HOMU webhook          │
└──────────┬──────────────┘
           │ POST /api/inbox/email
           ▼
┌─────────────────────────────────────────────────────┐
│ HOMU (Next.js on Vercel)                            │
│                                                     │
│  1. Verify Cloudflare signature                     │
│  2. Resolve <user>@inbox.homu.app → user_id        │
│  3. Idempotency: UNIQUE(user_id, message_id)        │
│  4. Parsing pipeline:                               │
│     a. Try cached pattern for sender                │
│     b. Else LLM (Gemini 2.5 Flash Lite)             │
│     c. On LLM success → distil + cache pattern      │
│  5. Insert inbox_items row (status: pending)        │
│  6. (Optional) push notification — Phase 4          │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│ Supabase Postgres                                   │
│ • inbox_items (RLS: owner only)                     │
│ • inbox_sender_patterns (RLS: owner only)           │
│ • user_api_keys (RLS: owner only) — n8n path        │
└──────────┬──────────────────────────────────────────┘
           │ (real-time / on app open)
           ▼
┌─────────────────────────┐
│ HOMU app                │
│ • Home: "3 to review"   │
│   chip                  │
│ • Inbox bento (list)    │
│ • Quick-confirm OR edit │
│   → creates transaction │
└─────────────────────────┘
```

The same `POST /api/inbox/transactions` endpoint is the n8n entry point
(API-key auth). Forwarding hits `POST /api/inbox/email` (raw email,
Cloudflare-signed). Both end up in the same `inbox_items` table.

## 4. Data model (Supabase migration `00XX_email_inbox.sql`)

### 4.1 `inbox_items`

```sql
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Source / idempotency
  source_domain text not null,        -- 'bca.co.id'
  sender_email text not null,         -- raw From: address
  message_id text not null,           -- email Message-ID header
  received_at timestamptz not null,

  -- Raw payload (kept for audit / re-parse)
  raw_subject text,
  raw_body text not null,             -- text or html, whichever Cloudflare delivers
  raw_body_format text not null,      -- 'text' | 'html'

  -- Parsed result (nullable until parsing finishes)
  parsed jsonb,                       -- { amount, type, name, date, currency, confidence, notes? }
  parse_method text,                  -- 'pattern' | 'llm' | 'manual'
  parse_confidence real,              -- 0..1
  parse_error text,                   -- non-null if parsing failed

  -- Lifecycle
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'duplicate')),
  accepted_transaction_id uuid references public.transactions(id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),

  unique (user_id, message_id)
);

create index inbox_items_user_status_idx
  on public.inbox_items (user_id, status, received_at desc);

alter table public.inbox_items enable row level security;
create policy "inbox: select own"
  on public.inbox_items for select using (user_id = auth.uid());
create policy "inbox: update own"
  on public.inbox_items for update using (user_id = auth.uid());
-- INSERT is server-only (via the webhook / API endpoint).
```

### 4.2 `inbox_sender_patterns`

```sql
create table public.inbox_sender_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_domain text not null,
  pattern jsonb not null,             -- regex set + field mapping; see §6
  successful_uses int not null default 0,
  failed_uses int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sender_domain)
);

alter table public.inbox_sender_patterns enable row level security;
create policy "sender_patterns: select own"
  on public.inbox_sender_patterns for select using (user_id = auth.uid());
```

A small global table `inbox_sender_patterns_seed` (admin-managed, no RLS
or RLS read-only) ships the four seed templates for the major Indonesian
banks. The user-specific table can override / refine.

### 4.3 `user_api_keys` (for the n8n / power-user path)

```sql
create table public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_prefix text not null,           -- first 8 chars, shown in UI
  key_hash text not null,             -- bcrypt of full key
  name text not null,                 -- user label, e.g. "n8n at home"
  scopes text[] not null default '{inbox:write}',
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (key_hash)
);

alter table public.user_api_keys enable row level security;
create policy "api_keys: select own"
  on public.user_api_keys for select using (user_id = auth.uid());
create policy "api_keys: insert own"
  on public.user_api_keys for insert with check (user_id = auth.uid());
create policy "api_keys: update own"
  on public.user_api_keys for update using (user_id = auth.uid());
```

### 4.4 `user_inbox_addresses`

```sql
create table public.user_inbox_addresses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  local_part text not null unique,    -- e.g. 'marcel-a1b2c3'
  created_at timestamptz not null default now()
);

alter table public.user_inbox_addresses enable row level security;
create policy "inbox_addresses: select own"
  on public.user_inbox_addresses for select using (user_id = auth.uid());
```

The local part is generated on first opt-in: `lower(username[0..7])` +
`-` + 6 random base-32 chars. Collisions retry. The full address is
`{local_part}@inbox.homu.app`.

## 5. API surface

### 5.1 `POST /api/inbox/email` — Cloudflare → HOMU

Cloudflare Email Routing's webhook payload. Auth: HMAC signature header
verified against `CF_EMAIL_WEBHOOK_SECRET`. Body (Cloudflare's format,
adapted):

```ts
{
  to: 'marcel-a1b2c3@inbox.homu.app',
  from: { name: 'BCA', email: 'noreply@bca.co.id' },
  message_id: '<...>',
  date: '2026-05-26T03:14:00Z',
  subject: 'BCA - Notifikasi transaksi…',
  text: '...plain body...',
  html: '<html>...</html>',
}
```

Server flow:

1. Verify HMAC.
2. Look up `user_inbox_addresses` by `local_part` from `to`. 404 if not found (we never accept mail for an unknown address).
3. `INSERT … ON CONFLICT (user_id, message_id) DO NOTHING` → if already
   present, return 200 with `{ duplicate: true }`.
4. Kick off the parsing pipeline (§6). Synchronous for v1 — the request
   stays open until parsed (avg ~1s with LLM, ~50ms cache hit).
5. Return 200 with the new inbox item id.

### 5.2 `POST /api/inbox/transactions` — n8n / power-user → HOMU

Same destination as the email webhook but accepts pre-parsed payloads
and authenticates via `Authorization: Bearer <api_key>`.

```ts
// Request
{
  source_domain: 'bca.co.id',
  message_id: '<abc@bca.co.id>',
  received_at: '2026-05-26T03:14:00Z',
  // Either:
  raw_body: '...',                    // HOMU parses
  // Or:
  parsed: {
    amount: 50000,
    type: 'expense',
    name: 'Indomaret',
    date: '2026-05-26',
    currency: 'IDR',
  },
}
// Response
{ id, status: 'pending', parsed }
```

Full setup recipe — Gmail trigger, sample workflow JSON, common
gotchas — is in **Appendix A** at the bottom of this doc.

### 5.3 Server actions (used by the Inbox UI)

```ts
acceptInboxItem(itemId, opts: {
  household_id?: string,    // defaults to user's primary
  wallet_id?: string,       // defaults to user's default wallet
  category_id?: string,     // defaults to AI suggestion
  overrides?: Partial<Parsed>,
})
  → { transaction_id }

rejectInboxItem(itemId, reason?: string)
  → { ok: true }

editInboxItem(itemId, overrides: Partial<Parsed>)
  → { item }                // stays pending, with edits applied
```

### 5.4 Settings actions

```ts
generateApiKey(name: string) → { key, prefix }      // key shown ONCE
revokeApiKey(keyId)
generateInboxAddress()      → { address }           // idempotent
```

## 6. Parsing pipeline (hybrid)

```
input: { user_id, sender_domain, raw_body, subject, received_at }

1. pattern_id ← inbox_sender_patterns WHERE user_id=$ AND sender_domain=$
              (else fallback to inbox_sender_patterns_seed WHERE sender_domain=$)
2. if pattern_id and successful_uses ≥ 5 and failed_uses / total < 0.1:
     parsed ← try_pattern(pattern, raw_body)
     if parsed.confidence ≥ 0.8:
       increment successful_uses
       return parsed, method='pattern'
     else:
       increment failed_uses
       fall through to LLM
3. parsed ← gemini_parse(raw_body, subject, sender_domain)
   prompt: §6.1 below
4. if parsed.confidence ≥ 0.7:
     return parsed, method='llm'
     (background) if no user_pattern for this sender:
       pattern ← distil_pattern_from(parsed, raw_body)
       upsert inbox_sender_patterns
5. else:
     return null, parse_error='low_confidence'
     inbox item is still stored but flagged for full manual entry
```

### 6.1 LLM prompt sketch (Gemini 2.5 Flash Lite)

```
System:
You are a parser for Indonesian and English bank/payment notification
emails. Output STRICT JSON only. No prose.

Schema:
{
  "amount": number,             // positive integer in smallest unit (rupiah, not sen)
  "type": "expense" | "income" | "transfer",
  "name": string,               // merchant or counterparty, ≤ 60 chars
  "date": "YYYY-MM-DD",
  "currency": "IDR",
  "confidence": number          // 0..1, your confidence in the parse
}

Rules:
- amount = transaction amount, integer rupiah, no thousand separators
- type = "expense" if money left the user's account ("debit", "bayar",
  "pembelian", "kartu kredit charge"). "income" if it arrived
  ("kredit", "masuk", "refund", "diterima"). "transfer" only when the
  email explicitly says transfer to ANOTHER OWN account.
- name = the merchant from the email — strip prefixes like "DBT/",
  "QR-", "VA-", store IDs, terminal IDs.
- date = the transaction date stated in the email body. If only a
  timestamp is given, take the date in Asia/Jakarta.
- confidence = 1.0 if all fields are unambiguous; 0.5 if you had to
  guess any; ≤ 0.3 if the email doesn't look like a transaction
  notification.

User:
Sender: {{sender_email}}
Subject: {{subject}}
Body:
{{raw_body}}
```

### 6.2 Seed patterns

Four hand-written templates ship in `0XXX_email_inbox.sql` as
`inbox_sender_patterns_seed` rows:

| Sender domain | Anchor strings | Regex shape |
|---|---|---|
| `klikbca.com` / `bca.co.id` | "Telah dilakukan transaksi sebesar" | amount: `Rp\s*([\d.]+)`; merchant: `di\s+(.+?)\s+pada`; date: `pada\s+tanggal\s+(\d{2}-\d{2}-\d{4})` |
| `bankmandiri.co.id` | "Transaksi DEBET" / "Transaksi KREDIT" | matching pair of regexes |
| `bni.co.id` | "Transaksi Berhasil" | shape TBD during build |
| `bri.co.id` | "Notifikasi Mutasi Rekening" | shape TBD during build |

Templates store a JSON of `{ amount_regex, type_indicator: { expense_keywords, income_keywords }, name_regex, date_regex, date_format }`.

## 7. UI surfaces

### 7.1 Settings → Integrations (new page)

```
┌─────────────────────────────────────────────┐
│ ← Integrations                              │
├─────────────────────────────────────────────┤
│ EMAIL INBOX                                 │
│ Forward transaction emails to this address  │
│ and HOMU will journal them for you.         │
│                                             │
│ Your inbox address                          │
│ ┌─────────────────────────────────────────┐ │
│ │ marcel-a1b2c3@inbox.homu.app   📋 Copy  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Set up Gmail filter ⓘ                       │
│ Tap to open Gmail with the filter ready     │
│ for BCA / Mandiri / BNI / BRI.              │
│ → [Open Gmail filter setup]                 │
│                                             │
│ Senders seen so far (4)                     │
│ • bca.co.id         12 emails               │
│ • mandiri.co.id      3                      │
│ • bni.co.id          1                      │
│ • Unknown sender …   0  (will use LLM)      │
│                                             │
│ ────────────────────────                    │
│                                             │
│ API KEYS (for n8n / Zapier / scripts)       │
│ + Generate a key                            │
│                                             │
│ • n8n at home          last used 2 min ago  │
│   homu_pk_a1b2…        [Revoke]             │
└─────────────────────────────────────────────┘
```

The "Open Gmail filter setup" button deep-links to Gmail's filter
creator pre-filled:
`https://mail.google.com/mail/u/0/#create-filter?from=bca.co.id+OR+mandiri.co.id+OR+bni.co.id+OR+bri.co.id`
The doc page shows the screenshot of selecting "Forward it to" with the
inbox address.

### 7.2 Home screen — inbox chip

A small chip on the home screen, placed below the top bar (next to the
account switcher or as a banner above the type tabs). Visible only when
`pending` count > 0:

```
┌─────────────────────────────────────┐
│ 📬 3 transactions to review  →     │
└─────────────────────────────────────┘
```

Tapping opens the Inbox bento (§7.3). The count is fetched on app open
and refreshed on Supabase realtime channel `inbox_items` if connected.

### 7.3 Inbox bento (new sheet)

A bento card sheet, same family as the category/wallet pickers (10px
margins, 28px radius, 560ms slide-up):

```
┌─────────────────────────────────────┐
│ Inbox — 3 to review          ✕     │
├─────────────────────────────────────┤
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🏦 BCA                          │ │
│ │ Indomaret                       │ │
│ │ -Rp 45.000  •  Today 14:23     │ │
│ │                                 │ │
│ │ [✓ Confirm]   [✎ Edit]   [✕]    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🏦 Mandiri                      │ │
│ │ Tokopedia                       │ │
│ │ -Rp 285.000  •  Today 09:11    │ │
│ │ ⚠ Low confidence — please edit  │ │
│ │ [✎ Edit]   [✕ Reject]           │ │
│ └─────────────────────────────────┘ │
│                                     │
│ …                                   │
└─────────────────────────────────────┘
```

Per-row actions:

- **✓ Confirm** (one-tap accept) — only visible when `parse_confidence ≥
  0.85`. Uses the user's primary ledger + default wallet + AI-suggested
  category. Creates the transaction immediately; the row animates to
  "accepted" and disappears.
- **✎ Edit** — opens the existing Add Transaction sheet with `editing`
  prop and `inbox_item_id` in extra state. The sheet's existing logic
  handles ledger/wallet/category. Saving the sheet flips the inbox row
  to `accepted`.
- **✕ Reject** — soft-deletes (status `rejected`); a brief toast offers
  Undo for 5s.

Low-confidence rows (< 0.85) hide the Confirm button to prevent silent
mistakes — the user must Edit before saving.

### 7.4 Onboarding nudge (one-time)

The first time the user opens Settings → Integrations or sees the
feature surfaced (intro card on Settings home), a single-screen explainer:

```
┌──────────────────────────────────────────┐
│ ┌────────────┐                           │
│ │  📬 → ✓    │                           │
│ └────────────┘                           │
│                                          │
│  Skip the typing                         │
│  HOMU can read your bank emails and      │
│  pre-fill your transactions. You stay    │
│  in control — confirm or edit each one. │
│                                          │
│  • Only the senders you forward         │
│  • Works with any email provider        │
│  • Confirmed transactions only          │
│                                          │
│  [Get started]   [Later]                 │
└──────────────────────────────────────────┘
```

## 8. Phasing

Each phase ships independently. The system has end-to-end value after
Phase 1 (even though parsing-quality keeps improving in later phases).

### Phase 1 — Foundation (target: 2 days)
- Migrations: `inbox_items`, `inbox_sender_patterns`,
  `inbox_sender_patterns_seed`, `user_api_keys`, `user_inbox_addresses`.
- Cloudflare Email Routing: `*@inbox.homu.app` → webhook.
- `POST /api/inbox/email` endpoint (no parsing yet — accept pre-parsed
  via `POST /api/inbox/transactions` only). Verify CF signature.
- Settings → Integrations: generate inbox address, generate API key.
- Inbox bento UI + home-screen chip (read-only list of rows).
- Accept flow (open Add Transaction with pre-fill).
- Reject flow.

Outcome: Marcel can use n8n (or curl, or a manual `POST`) to send
parsed transactions to HOMU, review them in the Inbox, accept them.
End-to-end value with no parsing investment yet.

### Phase 2 — Parsing in HOMU (target: 1 day)
- Seed patterns for BCA / Mandiri / BNI / BRI (hand-written regex).
- Gemini 2.5 Flash Lite fallback (the same call surface used by category
  suggestion / voice; new prompt).
- `POST /api/inbox/email` (the Cloudflare path) now parses server-side.

Outcome: forwarding works end-to-end with zero user config beyond the
Gmail filter.

### Phase 3 — Pattern caching / learning (target: 1 day)
- Distil LLM success → `inbox_sender_patterns` row.
- Pipeline tries cache first; LLM fallback as before.
- Settings shows learned senders + per-sender confidence stats.

Outcome: parsing cost drops to ≈ 0 for stable senders.

### Phase 4 — Notifications (separate, larger)
- Web Push (iOS 16.4+) for "1 new transaction to review".
- Per-user opt-in; honours existing analytics/privacy preferences.

### Phase 5 — More senders (additive, ongoing)
- E-wallets: OVO, GoPay, ShopeePay, DANA.
- Credit-card statements.
- Marketplaces (Shopee, Tokopedia order confirmations).
- Patterns add to `inbox_sender_patterns_seed`; LLM handles new ones in
  the meantime.

## 9. Security & privacy

- **Forwarded mail only.** HOMU never reads the user's full inbox. The
  user explicitly forwards specific senders via their own filter.
- **Cloudflare signature** verifies all inbound webhooks. Endpoint
  rejects anything else.
- **API keys**: shown once on creation, stored as bcrypt hash, revocable.
- **LLM data flow**: the email body is sent to Google's Gemini API for
  parsing. This must be disclosed in the Settings → Integrations
  explainer and added to the Privacy doc (RAM-15). Optionally strip
  obvious PII (account numbers, balances) before sending — defer to
  Phase 3 once we see real data.
- **At-rest encryption**: Supabase already encrypts on disk. The
  `raw_body` field will contain transaction details — keep RLS strict.
- **Retention**: `accepted` and `rejected` inbox_items can be purged
  after 90 days. The `transactions` row is the source of truth once
  accepted. Add a scheduled function in Phase 3+.
- **Idempotency**: `UNIQUE(user_id, message_id)` guarantees we never
  double-create a transaction even if a webhook fires twice.

## 10. Open questions to resolve during build

These don't block writing the migration; resolve when each phase lands:

1. **Confidence threshold for one-tap Confirm**: 0.85 picked here; tune
   on real data. Show the threshold in Settings (dev-only) for
   in-flight tuning.
2. **Where does the home-screen chip live exactly** — above the type
   tabs feels right; designs need a quick mock.
3. **Default ledger / wallet on one-tap accept**: for a multi-ledger
   user, "primary" is ambiguous. Suggestion: most-recently-used ledger
   in the last 7 days; default wallet of that ledger.
4. **Editing an inbox item without accepting** (`editInboxItem`) — keep
   it or drop the action and let the user just hit Edit → cancel?
   YAGNI lean: drop for v1.
5. **Per-user n8n vs per-user forwarding** — both can be active. UI
   should make this obvious without overloading new users.
6. **Setting up the Gmail filter from inside the app** — explore the
   `https://mail.google.com/…#create-filter` deep-link's actual
   reliability across Workspace / consumer Gmail.

## 11. Out of scope (v1)

- Outlook / Apple Mail / Yahoo provider-specific helpers — works
  generically through forwarding but no setup-guide screenshots.
- Pre-strip PII before LLM call (Phase 3 candidate).
- Multi-currency parsing (IDR only).
- Transfer-pair detection (matching a debit on one wallet with a credit
  on another) — v1 treats every email as a standalone expense/income.
- Server-pushed notifications (Phase 4).
- A web UI to edit seed patterns — admin-managed via migrations.

## 12. References

- **RAM-15** — Privacy toggle (privacy doc to extend).
- **RAM-18** — Analytics dashboard (feature-adoption events to add).
- **RAM-19** — Event tracking infra (will instrument funnels:
  `inbox_email_received`, `inbox_parse_success/failure`,
  `inbox_one_tap_accept`, `inbox_edit_accept`, `inbox_reject`).
- Cloudflare Email Routing docs: <https://developers.cloudflare.com/email-routing/>
- Gemini API used elsewhere in the codebase: `app/actions/ai.ts`,
  `app/actions/voice.ts`.

---

## Appendix A — n8n setup (power-user path)

The alternative to forwarding for users who already run n8n or want
custom parsing logic. Same destination as forwarding —
`POST /api/inbox/transactions` with Bearer auth — but routed through
their own pipeline. **Documented as an alternative; forwarding stays
the default.**

### A.1 When to choose n8n vs forwarding

| | Forwarding | n8n |
|---|---|---|
| Setup time | 60s (one Gmail filter) | 15–30 min (workflow setup) |
| Custom logic | None — HOMU parses | Yes — Code/Function nodes |
| Multi-account aggregation | One filter per account | One workflow fans in many mailboxes |
| Non-Gmail support | Any provider | Any provider |
| Privacy footprint | HOMU sees only forwarded mail | n8n's Gmail scope sees the full mailbox before filtering |
| Recommendation | **Default for everyone** | Power users only |

### A.2 Workflow shape

```
[Gmail Trigger / IMAP]  →  [Build payload]  →  [HTTP Request → HOMU]
                          (Set / Code node)    (POST /api/inbox/transactions)
```

### A.3 Auth setup

1. In HOMU → Settings → Integrations → **API keys** → "Generate a key",
   name it (e.g. `n8n at home`). Copy the full key — shown ONCE.
2. In n8n → **Credentials** → **+ Add** → type **Header Auth**:
   - Name: `Authorization`
   - Value: `Bearer <paste the key>`
3. Reuse that credential on every HTTP Request node that hits HOMU.

### A.4 Gmail trigger config (recommended)

- **Search query**: `from:(bca.co.id OR bankmandiri.co.id OR bni.co.id OR bri.co.id) newer_than:7d`
- **Polling interval**: every 5 minutes (Gmail API quota is generous).
- **Label / mark-read after process**: optional but recommended so reruns don't re-send.
- **Format**: include `Raw` so the `Message-ID` header is preserved (n8n's default sometimes drops headers).

### A.5 Two operating modes

**Mode A — let HOMU parse (recommended starting point):**

```http
POST https://homu.ramu.app/api/inbox/transactions
Authorization: Bearer <key>
Content-Type: application/json

{
  "source_domain": "bca.co.id",
  "message_id": "{{ $json.headers['message-id'] }}",
  "received_at": "{{ $json.internalDate }}",
  "raw_subject": "{{ $json.subject }}",
  "raw_body": "{{ $json.body.text || $json.body.html }}",
  "sender_email": "{{ $json.from.value[0].address }}"
}
```

HOMU runs the full hybrid parsing pipeline (§6) on the raw body and
stores the parsed result.

**Mode B — pre-parse in n8n:**

```http
POST https://homu.ramu.app/api/inbox/transactions
Authorization: Bearer <key>
Content-Type: application/json

{
  "source_domain": "bca.co.id",
  "message_id": "{{ $json.headers['message-id'] }}",
  "received_at": "{{ $json.internalDate }}",
  "parsed": {
    "amount": {{ $node["Extract"].json.amount }},
    "type": "expense",
    "name": "{{ $node["Extract"].json.merchant }}",
    "date": "{{ $node["Extract"].json.date }}",
    "currency": "IDR",
    "confidence": 1.0
  }
}
```

With Mode B, HOMU stores `parse_method='manual'`, skips its own
parser, and goes straight to `status='pending'`. Useful for users who
want to chain HOMU together with their own LLM / regex / data-source
mashups in n8n.

### A.6 Sample n8n workflow (importable)

```json
{
  "name": "HOMU — Indonesian bank inbox",
  "nodes": [
    {
      "name": "Gmail Trigger",
      "type": "n8n-nodes-base.gmailTrigger",
      "position": [240, 300],
      "parameters": {
        "pollTimes": { "item": [{ "mode": "everyMinute", "minute": 5 }] },
        "filters": {
          "q": "from:(bca.co.id OR bankmandiri.co.id OR bni.co.id OR bri.co.id) newer_than:7d",
          "readStatus": "unread"
        },
        "options": { "downloadAttachments": false, "format": "resolved" }
      }
    },
    {
      "name": "Build HOMU payload",
      "type": "n8n-nodes-base.set",
      "position": [480, 300],
      "parameters": {
        "values": {
          "string": [
            { "name": "source_domain", "value": "={{ ($json.from.value[0].address || '').split('@')[1] }}" },
            { "name": "message_id",   "value": "={{ $json.headers['message-id'] }}" },
            { "name": "received_at",  "value": "={{ new Date($json.internalDate * 1).toISOString() }}" },
            { "name": "sender_email", "value": "={{ $json.from.value[0].address }}" },
            { "name": "raw_subject",  "value": "={{ $json.subject }}" },
            { "name": "raw_body",     "value": "={{ $json.body.text || $json.body.html }}" }
          ]
        }
      }
    },
    {
      "name": "POST to HOMU",
      "type": "n8n-nodes-base.httpRequest",
      "position": [720, 300],
      "parameters": {
        "method": "POST",
        "url": "https://homu.ramu.app/api/inbox/transactions",
        "authentication": "headerAuth",
        "jsonParameters": true,
        "bodyParametersJson": "={{ JSON.stringify($json) }}",
        "options": { "redirect": { "redirect": { "followRedirects": false } } }
      },
      "credentials": { "headerAuth": "HOMU bearer (n8n at home)" }
    }
  ],
  "connections": {
    "Gmail Trigger": { "main": [[{ "node": "Build HOMU payload", "type": "main", "index": 0 }]] },
    "Build HOMU payload": { "main": [[{ "node": "POST to HOMU", "type": "main", "index": 0 }]] }
  }
}
```

We'll publish a canonical, maintained version at
`https://homu.ramu.app/n8n-template.json` once Phase 1 ships, so users
can use n8n's "Import from URL" with one click.

### A.7 Common gotchas

- **`Message-ID` propagation.** This is the idempotency key — HOMU
  refuses duplicates on `(user_id, message_id)`. Make sure the Gmail
  Trigger is configured to include raw headers (`format: resolved`
  works). If you see HOMU 200-ing with `{ duplicate: true }`, that's
  fine — it means a previous run already journaled it.
- **Body format.** Gmail returns both `text` and `html`. HOMU prefers
  `text`. Send whichever exists. The parser handles both.
- **Timezone.** `internalDate` is UTC milliseconds since epoch. HOMU
  normalises to `Asia/Jakarta` server-side; pass it through as ISO and
  don't try to fix the timezone in n8n.
- **Rate limiting.** HOMU's endpoint accepts bursts. Gmail Trigger's
  default 5-minute poll is comfortable; the polling tier doesn't need
  IMAP IDLE.
- **NAT / firewalls.** Data flow is one-way (n8n → HOMU), so no
  inbound exposure is needed on the user's side.
- **OAuth refresh on Gmail.** n8n manages it. If the credential
  expires (90 days of no use is the Gmail rule for unverified apps),
  the workflow fails silently — set up an n8n error notification.
- **HOMU API key rotation.** Generate a new key, paste into the n8n
  credential, save the workflow, then revoke the old key in HOMU.

### A.8 Why we still default to forwarding

Forwarding has parity with n8n for the common case — read transaction
email → call HOMU — at a fraction of the setup time, with a strictly
smaller blast radius if anything goes wrong (HOMU never sees mail
beyond what the user actively forwarded). n8n earns its place when the
user wants to:

- Aggregate multiple email accounts into one HOMU stream.
- Pre-process emails (PII redaction, custom enrichment).
- Chain HOMU into a larger automation pipeline (Notion logging, Slack
  alerts on big transactions, deduplication against a separate system).
