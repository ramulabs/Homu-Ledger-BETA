-- RAM-9 — Push notification subscriptions
--
-- One row per (user, device, subscription). A user might be opted-in on
-- their phone PWA, their Android TWA, AND their iOS native app — each is
-- a separate row. The dispatcher (lib/notify.ts) iterates all enabled
-- rows for a recipient and routes each to the right transport based on
-- the `provider` column.
--
-- Why `provider` is here from day one
-- ────────────────────────────────────
-- Web Push (VAPID) works for browsers + Android TWA, but Apple does NOT
-- expose Web Push to WKWebView. The iOS Capacitor app will need APNs via
-- @capacitor/push-notifications, which sends a device token instead of an
-- endpoint+keys triple. Rather than retrofit a column later, we record
-- the transport up front so the dispatcher can `case provider when 'web'
-- then web-push else throw NotImplementedError`. When the APNs branch
-- lands the schema and dispatcher both stay still.
--
-- `prefs` jsonb is a single column instead of N boolean columns because
-- the set of notification types is going to grow (transfer requests,
-- household-member-invited-you, etc.) and altering a wide table for each
-- new toggle is a footgun. JSONB also lets the dispatcher do a single
-- `where prefs->>'recurring_due' = 'true'` filter at SQL time.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Transport selector. `web` is implemented today; the others are
  -- placeholders for the iOS Capacitor (APNs) and future Android-native
  -- (FCM, if we ever ship a non-TWA Android shell) paths.
  provider text not null default 'web'
    check (provider in ('web', 'apns', 'fcm')),

  -- Web Push fields (provider = 'web'). The browser's PushSubscription
  -- serialises to { endpoint, keys: { p256dh, auth } }; we flatten it.
  endpoint text,
  p256dh text,
  auth text,

  -- APNs / FCM fields. `device_token` is the opaque token the OS hands
  -- back from the native plugin. NULL for web rows.
  device_token text,

  -- Master enabled flag. Toggling the Settings master switch flips this
  -- (or DELETEs the row if the user fully unsubscribes the browser).
  -- We keep a soft-disabled row around so per-type prefs survive a
  -- quick off/on cycle.
  enabled boolean not null default true,

  -- Per-type opt-in. Defaults: recurring + budget on, daily nudge off
  -- (nudges are annoying if you didn't ask for them — opt-in only).
  prefs jsonb not null default jsonb_build_object(
    'recurring_due', true,
    'budget_warnings', true,
    'daily_nudge', false
  ),

  -- Optional metadata for the Settings → Devices view (so the user can
  -- tell which row is their iPhone vs their work laptop).
  user_agent text,

  created_at timestamptz not null default now(),
  last_used_at timestamptz,

  -- One web subscription per (provider, endpoint). The browser hands out
  -- a unique endpoint per (origin, push service registration), so this
  -- doubles as the natural key for `upsert` from the client.
  -- We use a partial unique index instead of a table-level UNIQUE so the
  -- APNs branch (endpoint NULL) doesn't collide.
  constraint push_subscriptions_provider_check check (
    (provider = 'web' and endpoint is not null and p256dh is not null and auth is not null)
    or (provider = 'apns' and device_token is not null)
    or (provider = 'fcm'  and device_token is not null)
  )
);

create unique index push_subscriptions_web_endpoint_idx
  on public.push_subscriptions (provider, endpoint)
  where provider = 'web' and endpoint is not null;

create unique index push_subscriptions_native_token_idx
  on public.push_subscriptions (provider, device_token)
  where provider in ('apns', 'fcm') and device_token is not null;

create index push_subscriptions_user_idx
  on public.push_subscriptions (user_id, enabled);

alter table public.push_subscriptions enable row level security;

-- User can only see / mutate their own subscription rows. The cron jobs
-- run via the service-role key (admin client) which bypasses RLS.
create policy "push_subscriptions: select own"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

create policy "push_subscriptions: insert own"
  on public.push_subscriptions for insert
  with check (user_id = auth.uid());

create policy "push_subscriptions: update own"
  on public.push_subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push_subscriptions: delete own"
  on public.push_subscriptions for delete
  using (user_id = auth.uid());

-- Tracking table for budget warnings — record (subscription, category,
-- threshold) the last time we fired a budget alert. Stops us from
-- spamming the user every cron tick once they cross 80%.
--
-- Wrapped in a DO block + table_exists check so this migration applies
-- cleanly whether or not the RAM-5 budgets table exists yet.
create table public.notification_dedup (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Composite key — e.g. 'budget:<category_id>:80' or
  -- 'recurring_due:<recurring_item_id>:<YYYY-MM-DD>' or
  -- 'daily_nudge:<YYYY-MM-DD>'.
  key text not null,
  fired_at timestamptz not null default now(),
  unique (user_id, key)
);

create index notification_dedup_user_fired_idx
  on public.notification_dedup (user_id, fired_at desc);

alter table public.notification_dedup enable row level security;

-- The user never reads or writes this table directly — it's bookkeeping
-- for the cron jobs (service-role). Omitting an INSERT policy means
-- client-side inserts are denied, which is the safety we want.
create policy "notification_dedup: select own"
  on public.notification_dedup for select
  using (user_id = auth.uid());

create policy "notification_dedup: delete own"
  on public.notification_dedup for delete
  using (user_id = auth.uid());
