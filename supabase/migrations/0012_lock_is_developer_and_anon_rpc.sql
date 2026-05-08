-- Lock down two privilege-escalation / enumeration vectors.
--
-- 1) profiles.is_developer was writable by the row's owner under the
--    "self can update" policy. Anyone could promote themselves to
--    developer with a single Supabase REST call and then call the
--    developer-only RPCs (delete_promo_code, generate_promo_code, …).
--
-- 2) is_promo_code_valid() and get_email_by_username() were granted to
--    anon. Anyone with the public anon key (i.e. the whole internet,
--    since the key ships in the client bundle) could hit
--    /rest/v1/rpc/get_email_by_username with arbitrary usernames and
--    enumerate registered emails for phishing. Promo-code probing is
--    less critical (36^8 entropy makes brute-force infeasible) but
--    we revoke it for symmetry and defence-in-depth.
--
-- Operational note for #2:
-- The auth flow needs server-side access to these RPCs while the user
-- is logging in / signing up (no auth.uid() yet). The codebase will
-- now call them via a service-role client created in lib/supabase/admin.ts.
-- That requires SUPABASE_SERVICE_ROLE_KEY in the Vercel env. Apply
-- THIS migration only AFTER that env var is set and the new code is
-- deployed, otherwise sign-in/sign-up will break.

-- 1) Block is_developer self-promotion -----------------------------------
-- The UPDATE policy locks household_id swaps to ledgers the user is a
-- member of. The is_developer rule is enforced by a BEFORE UPDATE
-- trigger in migration 0017 — putting it in the policy as a subquery
-- against `profiles` itself caused infinite RLS recursion.
DROP POLICY IF EXISTS "profiles: self can update" ON public.profiles;
DROP POLICY IF EXISTS "profiles: self can update safe fields" ON public.profiles;
CREATE POLICY "profiles: self can update safe fields"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      household_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.household_members hm
        WHERE hm.household_id = profiles.household_id
          AND hm.profile_id = auth.uid()
      )
    )
  );

-- 2) Revoke anon enumeration ---------------------------------------------
-- Also revoke from PUBLIC: PostgreSQL grants EXECUTE to PUBLIC by default
-- on new functions, and that grant is inherited by `anon`. Just revoking
-- from anon is not enough.
REVOKE EXECUTE ON FUNCTION public.is_promo_code_valid(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_email_by_username(TEXT) FROM PUBLIC, anon;
-- Authenticated grant remains — and the auth-flow callers will use the
-- service role key, which bypasses RLS and these grants entirely.
