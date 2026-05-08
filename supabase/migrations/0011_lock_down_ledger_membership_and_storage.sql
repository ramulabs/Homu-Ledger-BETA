-- Lock down ledger membership and storage access.
--
-- The app uses profiles.household_id as the active ledger pointer, but access
-- must be granted by household_members. This migration makes that invariant
-- explicit and moves join/switch flows into SECURITY DEFINER RPCs.

-- Active ledger helper: only return the profile pointer when membership exists.
CREATE OR REPLACE FUNCTION public.current_household_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.household_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.household_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.household_members hm
      WHERE hm.household_id = p.household_id
        AND hm.profile_id = p.id
    );
$function$;

-- Profiles can still edit their own display data, but they can only point
-- household_id at a ledger where they are already a member.
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

-- Direct membership creation is only allowed for the owner creating their own
-- initial owner membership. Invite-code joins and accepted invitations use RPCs.
DROP POLICY IF EXISTS "household_members: can insert own" ON public.household_members;
DROP POLICY IF EXISTS "household_members: owner can insert own membership" ON public.household_members;
CREATE POLICY "household_members: owner can insert own membership"
  ON public.household_members FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1
      FROM public.households h
      WHERE h.id = household_id
        AND h.owner_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.switch_household(p_household_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this ledger' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
    SET household_id = p_household_id
    WHERE id = auth.uid();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.switch_household(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_household_by_invite_code(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_household_id UUID;
BEGIN
  SELECT h.id INTO v_household_id
  FROM public.households h
  WHERE h.invite_code = upper(trim(p_code))
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.household_members (household_id, profile_id, role)
  VALUES (v_household_id, auth.uid(), 'member')
  ON CONFLICT (household_id, profile_id) DO NOTHING;

  UPDATE public.profiles
    SET household_id = v_household_id
    WHERE id = auth.uid();

  RETURN v_household_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.join_household_by_invite_code(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_household_invitation(p_invitation_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_household_id UUID;
  v_invited_by UUID;
BEGIN
  SELECT household_id, invited_by INTO v_household_id, v_invited_by
  FROM public.household_invitations
  WHERE id = p_invitation_id
    AND invited_user_id = auth.uid()
    AND status = 'pending'
  FOR UPDATE;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found or no longer pending' USING ERRCODE = 'P0002';
  END IF;

  -- The inviter must STILL be a member of the household. Without this,
  -- a removed member's stale pending invitations would still grant
  -- access to their old ledger.
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = v_household_id
      AND hm.profile_id = v_invited_by
  ) THEN
    UPDATE public.household_invitations
      SET status = 'declined'
      WHERE id = p_invitation_id;
    RAISE EXCEPTION 'Inviter is no longer a member of this ledger' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.household_members (household_id, profile_id, role)
  VALUES (v_household_id, auth.uid(), 'member')
  ON CONFLICT (household_id, profile_id) DO NOTHING;

  UPDATE public.household_invitations
    SET status = 'accepted'
    WHERE id = p_invitation_id;

  UPDATE public.profiles
    SET household_id = v_household_id
    WHERE id = auth.uid();

  RETURN v_household_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.accept_household_invitation(UUID) TO authenticated;

-- Enforce that transaction category/wallet references belong to the same
-- household as the transaction row.
CREATE OR REPLACE FUNCTION public.validate_transaction_ledger_refs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = NEW.category_id
      AND c.household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'Category does not belong to this ledger' USING ERRCODE = '23503';
  END IF;

  IF NEW.wallet_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.wallets w
    WHERE w.id = NEW.wallet_id
      AND w.household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'Wallet does not belong to this ledger' USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_transaction_ledger_refs ON public.transactions;
CREATE TRIGGER validate_transaction_ledger_refs
  BEFORE INSERT OR UPDATE OF household_id, category_id, wallet_id ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_ledger_refs();

CREATE OR REPLACE FUNCTION public.get_ledger_totals()
RETURNS TABLE(income NUMERIC, expenses NUMERIC, balance NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH active AS (
    SELECT public.current_household_id() AS household_id
  ),
  totals AS (
    SELECT
      COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'income'), 0) AS income,
      COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'expense'), 0) AS expenses
    FROM public.transactions t
    JOIN active a ON a.household_id = t.household_id
    WHERE t.transfer_pair_id IS NULL
  )
  SELECT
    totals.income,
    totals.expenses,
    COALESCE(h.opening_balance, 0) + totals.income - totals.expenses AS balance
  FROM active a
  JOIN public.households h ON h.id = a.household_id
  CROSS JOIN totals;
$function$;

GRANT EXECUTE ON FUNCTION public.get_ledger_totals() TO authenticated;

-- Storage helpers and policies. Objects are stored under:
--   <household_id>/<random-id>.<ext>
CREATE OR REPLACE FUNCTION public.can_access_transaction_photo(p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id::TEXT = (storage.foldername(p_object_name))[1]
      AND hm.profile_id = auth.uid()
  );
$function$;

GRANT EXECUTE ON FUNCTION public.can_access_transaction_photo(TEXT) TO authenticated;

UPDATE storage.buckets
  SET public = FALSE
  WHERE id = 'transaction-photos';

DROP POLICY IF EXISTS "transaction_photos: authenticated can upload" ON storage.objects;
DROP POLICY IF EXISTS "transaction_photos: members can upload" ON storage.objects;
CREATE POLICY "transaction_photos: members can upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'transaction-photos'
    AND public.can_access_transaction_photo(name)
  );

DROP POLICY IF EXISTS "transaction_photos: public can read" ON storage.objects;
DROP POLICY IF EXISTS "transaction_photos: members can read" ON storage.objects;
CREATE POLICY "transaction_photos: members can read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'transaction-photos'
    AND public.can_access_transaction_photo(name)
  );
