-- Fix onboarding failure caused by recursive profiles RLS.
--
-- `profiles: self or same household can read` previously called
-- current_household_id(), and that helper reads public.profiles. When Supabase
-- evaluated the policy on public.profiles, it re-entered the same policy and
-- raised "infinite recursion detected in policy for relation profiles".
--
-- Keep the same access rule, but check membership directly through
-- household_members instead of calling a helper that reads profiles.
DROP POLICY IF EXISTS "profiles: self or same household can read" ON public.profiles;

CREATE POLICY "profiles: self or same household can read"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR (
      household_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.household_members hm
        WHERE hm.household_id = profiles.household_id
          AND hm.profile_id = auth.uid()
      )
    )
  );
