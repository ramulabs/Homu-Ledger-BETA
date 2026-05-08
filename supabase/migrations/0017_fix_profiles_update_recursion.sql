-- Hotfix: the WITH CHECK clause on `profiles: self can update safe fields`
-- (introduced in 0012 to block is_developer self-promotion) referenced
-- profiles from inside its own RLS policy:
--
--   AND is_developer = (SELECT p2.is_developer FROM public.profiles p2 WHERE p2.id = auth.uid())
--
-- That caused "infinite recursion detected in policy for relation profiles"
-- on every authenticated UPDATE — including the household_id swap that
-- happens during onboarding when a user creates their first ledger.
--
-- Fix: drop the recursive subquery from the policy and enforce the
-- is_developer rule via a BEFORE UPDATE trigger instead. Triggers can
-- compare OLD vs NEW directly without re-querying the table.

DROP POLICY IF EXISTS "profiles: self can update safe fields" ON public.profiles;
CREATE POLICY "profiles: self can update safe fields"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      household_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.household_members hm
        WHERE hm.household_id = profiles.household_id
          AND hm.profile_id = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_is_developer_self_promotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_developer IS DISTINCT FROM OLD.is_developer THEN
    -- service_role (admin client) bypasses this — that's how we grant
    -- the flag to specific accounts manually.
    IF auth.role() <> 'service_role' THEN
      RAISE EXCEPTION 'is_developer can only be changed by an administrator' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_is_developer_self_promotion ON public.profiles;
CREATE TRIGGER prevent_is_developer_self_promotion
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_is_developer_self_promotion();

REVOKE EXECUTE ON FUNCTION public.prevent_is_developer_self_promotion() FROM PUBLIC, anon, authenticated;
