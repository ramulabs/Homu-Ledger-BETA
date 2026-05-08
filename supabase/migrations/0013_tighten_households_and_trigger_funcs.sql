-- Follow-on to 0012 surfaced by Supabase's security advisor.
--
-- 1) Tighten households INSERT
-- The previous policy used `WITH CHECK (true)`, which let any authenticated
-- user insert a households row with an arbitrary `owner_id`. Combined with
-- the household_members policy (which requires `households.owner_id = auth.uid()`
-- for owner-membership inserts), this didn't immediately give them access
-- to someone else's ledger — but it allowed creating ghost ledgers under
-- another user's owner_id, which is a clear escalation surface.
DROP POLICY IF EXISTS "households: authenticated can insert" ON public.households;
CREATE POLICY "households: owner can insert own household"
  ON public.households FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- 2) Lock down trigger-only functions
-- These run as triggers (SECURITY DEFINER) and have no caller-side use.
-- They were previously exposed via PostgREST at /rest/v1/rpc/* through
-- the default PUBLIC grant. Revoking has no effect on trigger execution.
REVOKE EXECUTE ON FUNCTION public.cascade_delete_transfer_pair() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.maintain_single_default_wallet() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_categories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_wallet() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
