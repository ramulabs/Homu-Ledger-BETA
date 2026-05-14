-- v1.25.0 — AI auto-categorization with smart cache.
--
-- Three new tables:
--   1. category_hints     — per-household keyword → category cache.
--                           Most categorizations hit this and skip the
--                           AI entirely. Source = 'seed'|'ai'|'user'.
--   2. api_usage_logs     — one row per LLM call. Powers the dev panel
--                           (tokens, cost, cache hit-rate this month).
--   3. app_settings       — single-row key/value store for the Gemini
--                           API key. Developer-only via RLS.
--
-- Plus seed_default_category_hints(household_id) — bilingual EN/ID
-- keyword pre-population for the default category set we ship in
-- seed_default_categories. Fires automatically on new households and
-- is backfilled for existing ones at the bottom of this migration.

-- ─── 1. category_hints ────────────────────────────────────────────────
create table if not exists public.category_hints (
  household_id uuid not null references public.households(id) on delete cascade,
  -- Normalised keyword (lowercased, trimmed, units stripped). Lookups
  -- normalise the user's description the same way before comparing.
  keyword      text not null,
  category_id  uuid not null references public.categories(id) on delete cascade,
  -- Where this hint came from. Useful for debugging stale/wrong mappings:
  --   seed = pre-loaded with the household's default categories
  --   ai   = inserted after a Gemini call that filled a cache miss
  --   user = inserted/updated when the user corrected a suggestion
  source       text not null default 'ai' check (source in ('seed','ai','user')),
  hits         integer not null default 1,
  updated_at   timestamptz not null default now(),
  primary key (household_id, keyword)
);

create index if not exists category_hints_household_id_idx
  on public.category_hints (household_id);

-- Lookups go household-then-keyword, but the PK already covers that.
-- Add a tiny helper index for the dev-panel "wipe stale hints" view.
create index if not exists category_hints_updated_at_idx
  on public.category_hints (updated_at desc);

alter table public.category_hints enable row level security;

-- Members of the household can read + write the cache for their own
-- household. We re-use the current_household_id() helper that's
-- already used elsewhere (e.g. transactions RLS).
create policy "category_hints: members select"
  on public.category_hints for select
  using (household_id = public.current_household_id());

create policy "category_hints: members insert"
  on public.category_hints for insert
  with check (household_id = public.current_household_id());

create policy "category_hints: members update"
  on public.category_hints for update
  using (household_id = public.current_household_id())
  with check (household_id = public.current_household_id());

create policy "category_hints: members delete"
  on public.category_hints for delete
  using (household_id = public.current_household_id());

-- ─── 2. api_usage_logs ────────────────────────────────────────────────
create table if not exists public.api_usage_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete set null,
  household_id    uuid references public.households(id) on delete set null,
  provider        text not null,
  model           text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  total_tokens    integer generated always as (input_tokens + output_tokens) stored,
  estimated_cost_usd numeric(14,10) not null default 0,
  feature         text not null,
  -- 'miss' = cache miss → we called Gemini.
  -- 'hit'  = cache hit  → no Gemini call (logged with 0 tokens for accounting).
  -- 'error' = call failed (timeout, bad key, etc).
  cache_status    text not null default 'miss' check (cache_status in ('miss','hit','error')),
  -- Soft-link to the description for debugging — short truncated form so
  -- we don't accidentally store sensitive user data verbatim.
  preview         text,
  created_at      timestamptz not null default now()
);

create index if not exists api_usage_logs_created_at_idx
  on public.api_usage_logs (created_at desc);
create index if not exists api_usage_logs_user_idx
  on public.api_usage_logs (user_id, created_at desc);

alter table public.api_usage_logs enable row level security;

-- Only developers can read the full log. We don't grant write to anyone
-- via RLS — inserts go through a SECURITY DEFINER RPC so the row is
-- correctly attributed and validated.
create policy "api_usage_logs: developers select"
  on public.api_usage_logs for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_developer = true
    )
  );

-- ─── 3. app_settings ──────────────────────────────────────────────────
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.app_settings enable row level security;

create policy "app_settings: developers select"
  on public.app_settings for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_developer = true
    )
  );

-- Updates also gated on developer flag; only an authenticated developer
-- can rotate the key via the dev panel. INSERT/UPDATE go through the
-- save_app_setting RPC below for clearer error messages.
create policy "app_settings: developers update"
  on public.app_settings for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_developer = true
    )
  );

-- ─── 4. RPCs the app uses ─────────────────────────────────────────────

-- Log an LLM call (any source). SECURITY DEFINER so anonymous-side
-- session attribution still works — the RPC enforces auth.uid().
create or replace function public.log_api_usage(
  p_provider          text,
  p_model             text,
  p_input_tokens      integer,
  p_output_tokens     integer,
  p_estimated_cost    numeric,
  p_feature           text,
  p_cache_status      text,
  p_preview           text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user   uuid := auth.uid();
  v_hh     uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_cache_status not in ('miss','hit','error') then
    raise exception 'Invalid cache_status: %', p_cache_status using errcode = 'invalid_parameter_value';
  end if;

  -- Best-effort attribution to the user's current household — fine if
  -- they don't have one (e.g. mid-onboarding); we log anyway.
  select household_id into v_hh from public.profiles where id = v_user;

  insert into public.api_usage_logs (
    user_id, household_id, provider, model,
    input_tokens, output_tokens, estimated_cost_usd,
    feature, cache_status, preview
  )
  values (
    v_user, v_hh, p_provider, p_model,
    coalesce(p_input_tokens, 0), coalesce(p_output_tokens, 0), coalesce(p_estimated_cost, 0),
    p_feature, p_cache_status, p_preview
  );
end;
$function$;

-- Save (or rotate) an app setting. Developer-only.
create or replace function public.save_app_setting(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user   uuid := auth.uid();
  v_is_dev boolean;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select is_developer into v_is_dev from public.profiles where id = v_user;
  if v_is_dev is not true then
    raise exception 'Developer access required' using errcode = 'insufficient_privilege';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), v_user)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now(),
        updated_by = v_user;
end;
$function$;

-- Wipe the household's hint cache. Useful when the user wants a clean
-- restart (e.g. they renamed a bunch of categories). NOT exposed via
-- UI in v1 — call from psql / SQL editor only.
create or replace function public.clear_category_hints()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_hh   uuid;
  v_n    integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  select household_id into v_hh from public.profiles where id = v_user;
  if v_hh is null then
    return 0;
  end if;
  delete from public.category_hints where household_id = v_hh;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ─── 5. Seed default category hints ───────────────────────────────────
-- Bilingual EN + ID. Lowercased, no leading/trailing whitespace. Keys
-- mapped by category NAME so we look up the right id per-household.
--
-- IMPORTANT: keep these in sync with seed_default_categories() — if a
-- default category name changes there, update the mapping here.

create or replace function public.seed_default_category_hints(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rec record;
begin
  for v_rec in (
    select * from (values
      -- ── Food & Drink ──────────────────────────────────────────────
      ('Food & Drink', 'grocery'),
      ('Food & Drink', 'groceries'),
      ('Food & Drink', 'supermarket'),
      ('Food & Drink', 'market'),
      ('Food & Drink', 'food'),
      ('Food & Drink', 'lunch'),
      ('Food & Drink', 'dinner'),
      ('Food & Drink', 'breakfast'),
      ('Food & Drink', 'brunch'),
      ('Food & Drink', 'snack'),
      ('Food & Drink', 'coffee'),
      ('Food & Drink', 'tea'),
      ('Food & Drink', 'restaurant'),
      ('Food & Drink', 'cafe'),
      ('Food & Drink', 'mcdonald'),
      ('Food & Drink', 'mcdonalds'),
      ('Food & Drink', 'kfc'),
      ('Food & Drink', 'pizza'),
      ('Food & Drink', 'sushi'),
      ('Food & Drink', 'ramen'),
      ('Food & Drink', 'drinks'),
      ('Food & Drink', 'beer'),
      ('Food & Drink', 'wine'),
      ('Food & Drink', 'soda'),
      ('Food & Drink', 'ice cream'),
      ('Food & Drink', 'bakery'),
      ('Food & Drink', 'bread'),
      ('Food & Drink', 'fruit'),
      ('Food & Drink', 'vegetable'),
      ('Food & Drink', 'eggs'),
      ('Food & Drink', 'milk'),
      ('Food & Drink', 'starbucks'),
      ('Food & Drink', 'belanja'),
      ('Food & Drink', 'makanan'),
      ('Food & Drink', 'makan'),
      ('Food & Drink', 'sarapan'),
      ('Food & Drink', 'makan siang'),
      ('Food & Drink', 'makan malam'),
      ('Food & Drink', 'jajan'),
      ('Food & Drink', 'kopi'),
      ('Food & Drink', 'teh'),
      ('Food & Drink', 'warteg'),
      ('Food & Drink', 'padang'),
      ('Food & Drink', 'gado-gado'),
      ('Food & Drink', 'nasi'),
      ('Food & Drink', 'mie'),
      ('Food & Drink', 'ayam'),
      ('Food & Drink', 'sayur'),
      ('Food & Drink', 'buah'),
      ('Food & Drink', 'susu'),
      ('Food & Drink', 'telur'),
      ('Food & Drink', 'indomaret'),
      ('Food & Drink', 'alfamart'),
      ('Food & Drink', 'alfa'),
      ('Food & Drink', 'indomart'),

      -- ── Transport ─────────────────────────────────────────────────
      ('Transport', 'uber'),
      ('Transport', 'grab'),
      ('Transport', 'gojek'),
      ('Transport', 'taxi'),
      ('Transport', 'gas'),
      ('Transport', 'gasoline'),
      ('Transport', 'petrol'),
      ('Transport', 'fuel'),
      ('Transport', 'parking'),
      ('Transport', 'toll'),
      ('Transport', 'train'),
      ('Transport', 'bus'),
      ('Transport', 'mrt'),
      ('Transport', 'lrt'),
      ('Transport', 'krl'),
      ('Transport', 'transjakarta'),
      ('Transport', 'busway'),
      ('Transport', 'bensin'),
      ('Transport', 'parkir'),
      ('Transport', 'tol'),
      ('Transport', 'kereta'),
      ('Transport', 'ojek'),
      ('Transport', 'ojol'),
      ('Transport', 'angkot'),
      ('Transport', 'oli'),
      ('Transport', 'service motor'),
      ('Transport', 'montir'),

      -- ── Housing ───────────────────────────────────────────────────
      ('Housing', 'rent'),
      ('Housing', 'mortgage'),
      ('Housing', 'electricity'),
      ('Housing', 'electric bill'),
      ('Housing', 'water bill'),
      ('Housing', 'internet'),
      ('Housing', 'wifi'),
      ('Housing', 'gas bill'),
      ('Housing', 'repair'),
      ('Housing', 'maintenance'),
      ('Housing', 'cleaning'),
      ('Housing', 'furniture'),
      ('Housing', 'sewa'),
      ('Housing', 'sewa rumah'),
      ('Housing', 'kontrakan'),
      ('Housing', 'kost'),
      ('Housing', 'listrik'),
      ('Housing', 'air'),
      ('Housing', 'pln'),
      ('Housing', 'pdam'),
      ('Housing', 'indihome'),
      ('Housing', 'biznet'),
      ('Housing', 'perabot'),
      ('Housing', 'perbaikan'),
      ('Housing', 'kebersihan'),

      -- ── Health ────────────────────────────────────────────────────
      ('Health', 'doctor'),
      ('Health', 'hospital'),
      ('Health', 'clinic'),
      ('Health', 'pharmacy'),
      ('Health', 'drug'),
      ('Health', 'medicine'),
      ('Health', 'medication'),
      ('Health', 'paracetamol'),
      ('Health', 'ibuprofen'),
      ('Health', 'vitamin'),
      ('Health', 'supplement'),
      ('Health', 'dental'),
      ('Health', 'dentist'),
      ('Health', 'eye'),
      ('Health', 'eyeglasses'),
      ('Health', 'contacts'),
      ('Health', 'lab'),
      ('Health', 'blood test'),
      ('Health', 'x-ray'),
      ('Health', 'gym'),
      ('Health', 'fitness'),
      ('Health', 'yoga'),
      ('Health', 'panadol'),
      ('Health', 'mask'),
      ('Health', 'dokter'),
      ('Health', 'rumah sakit'),
      ('Health', 'klinik'),
      ('Health', 'apotek'),
      ('Health', 'obat'),
      ('Health', 'dokter gigi'),
      ('Health', 'kacamata'),
      ('Health', 'kebugaran'),
      ('Health', 'sakit'),
      ('Health', 'masker'),

      -- ── Shopping ──────────────────────────────────────────────────
      ('Shopping', 'clothes'),
      ('Shopping', 'clothing'),
      ('Shopping', 'shirt'),
      ('Shopping', 'shoes'),
      ('Shopping', 'pants'),
      ('Shopping', 'dress'),
      ('Shopping', 'sneakers'),
      ('Shopping', 'electronics'),
      ('Shopping', 'phone'),
      ('Shopping', 'laptop'),
      ('Shopping', 'computer'),
      ('Shopping', 'charger'),
      ('Shopping', 'headphones'),
      ('Shopping', 'kitchenware'),
      ('Shopping', 'amazon'),
      ('Shopping', 'tokopedia'),
      ('Shopping', 'shopee'),
      ('Shopping', 'lazada'),
      ('Shopping', 'blibli'),
      ('Shopping', 'baju'),
      ('Shopping', 'kaos'),
      ('Shopping', 'sepatu'),
      ('Shopping', 'celana'),
      ('Shopping', 'hp'),
      ('Shopping', 'handphone'),
      ('Shopping', 'headset'),
      ('Shopping', 'peralatan rumah'),
      ('Shopping', 'alat dapur'),

      -- ── Entertainment ─────────────────────────────────────────────
      ('Entertainment', 'movie'),
      ('Entertainment', 'cinema'),
      ('Entertainment', 'netflix'),
      ('Entertainment', 'spotify'),
      ('Entertainment', 'youtube'),
      ('Entertainment', 'disney'),
      ('Entertainment', 'hbo'),
      ('Entertainment', 'ps5'),
      ('Entertainment', 'xbox'),
      ('Entertainment', 'game'),
      ('Entertainment', 'games'),
      ('Entertainment', 'gaming'),
      ('Entertainment', 'steam'),
      ('Entertainment', 'concert'),
      ('Entertainment', 'ticket'),
      ('Entertainment', 'theme park'),
      ('Entertainment', 'museum'),
      ('Entertainment', 'bioskop'),
      ('Entertainment', 'film'),
      ('Entertainment', 'langganan'),
      ('Entertainment', 'konser'),
      ('Entertainment', 'tiket'),
      ('Entertainment', 'dufan'),
      ('Entertainment', 'ancol'),

      -- ── Education ─────────────────────────────────────────────────
      ('Education', 'book'),
      ('Education', 'books'),
      ('Education', 'course'),
      ('Education', 'courses'),
      ('Education', 'tuition'),
      ('Education', 'school'),
      ('Education', 'university'),
      ('Education', 'college'),
      ('Education', 'kindergarten'),
      ('Education', 'daycare'),
      ('Education', 'tutoring'),
      ('Education', 'udemy'),
      ('Education', 'coursera'),
      ('Education', 'buku'),
      ('Education', 'kursus'),
      ('Education', 'sekolah'),
      ('Education', 'universitas'),
      ('Education', 'kuliah'),
      ('Education', 'paud'),
      ('Education', 'tk'),
      ('Education', 'sd'),
      ('Education', 'smp'),
      ('Education', 'sma'),
      ('Education', 'les'),
      ('Education', 'bimbel'),

      -- ── Income: Salary ────────────────────────────────────────────
      ('Salary', 'salary'),
      ('Salary', 'payroll'),
      ('Salary', 'paycheck'),
      ('Salary', 'wage'),
      ('Salary', 'monthly salary'),
      ('Salary', 'freelance'),
      ('Salary', 'contract pay'),
      ('Salary', 'gaji'),
      ('Salary', 'gajian'),
      ('Salary', 'upah'),
      ('Salary', 'honor'),

      -- ── Income: Bonus ─────────────────────────────────────────────
      ('Bonus', 'bonus'),
      ('Bonus', 'year-end bonus'),
      ('Bonus', 'holiday bonus'),
      ('Bonus', 'commission'),
      ('Bonus', 'incentive'),
      ('Bonus', 'thr'),
      ('Bonus', 'bonus tahunan'),
      ('Bonus', 'komisi'),
      ('Bonus', 'insentif'),
      ('Bonus', 'hadiah'),
      ('Bonus', 'gift'),
      ('Bonus', 'prize'),

      -- ── Income: Reimburse ─────────────────────────────────────────
      ('Reimburse', 'reimburse'),
      ('Reimburse', 'reimbursement'),
      ('Reimburse', 'refund'),
      ('Reimburse', 'return'),
      ('Reimburse', 'expense claim'),
      ('Reimburse', 'pengembalian'),
      ('Reimburse', 'klaim'),
      ('Reimburse', 'klaim biaya'),
      ('Reimburse', 'pencairan')
    ) as t(cat_name, keyword)
  ) loop
    insert into public.category_hints (household_id, keyword, category_id, source)
    select p_household_id, v_rec.keyword, c.id, 'seed'
    from public.categories c
    where c.household_id = p_household_id
      and c.name = v_rec.cat_name
    on conflict (household_id, keyword) do nothing;
  end loop;
end;
$function$;

-- Auto-seed when a new household is created. Fires AFTER the existing
-- seed_default_categories trigger so the categories exist when we look
-- them up. (Trigger names sort alphabetically; appending zz_ ensures we
-- run last.)
create or replace function public.tg_seed_default_category_hints()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.seed_default_category_hints(new.id);
  return new;
end;
$function$;

drop trigger if exists zz_seed_default_category_hints on public.households;
create trigger zz_seed_default_category_hints
  after insert on public.households
  for each row execute function public.tg_seed_default_category_hints();

-- ─── 6. Backfill existing households ──────────────────────────────────
-- Idempotent (ON CONFLICT DO NOTHING in the seed function), so safe to
-- re-run if the migration is ever applied twice. Skip households that
-- have no categories yet — they'll get seeded when categories are
-- created.
do $$
declare
  v_hh uuid;
begin
  for v_hh in (
    select id from public.households
    where exists (select 1 from public.categories where household_id = households.id)
  )
  loop
    perform public.seed_default_category_hints(v_hh);
  end loop;
end $$;
