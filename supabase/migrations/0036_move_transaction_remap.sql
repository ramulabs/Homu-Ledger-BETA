-- v1.48.3 — Move a transaction to another ledger, remapping its wallet and
-- category into the target ledger.
--
-- The production move_transaction (migration "fix_move_transaction_reassign_
-- creator") cleared category_id but KEPT wallet_id. Wallets belong to one
-- ledger, so the validate_transaction_ledger_refs trigger rejected every move
-- of a transaction that had a wallet with "Wallet does not belong to this
-- ledger" — i.e. moving basically never worked unless the row had no wallet.
--
-- New behaviour:
--   • wallet   — p_wallet_id if given (must be in the target ledger). With
--                p_remap (the default) a NULL wallet is remapped: the target
--                wallet with the same name (case/space-insensitive), else the
--                target's default wallet, else its oldest wallet. A
--                transaction that had no wallet keeps none.
--   • category — p_category_id if given (must be in the target ledger and the
--                same type). With p_remap a NULL category is remapped to the
--                target category with the same name and type, else none.
--   • p_remap = false — the app sends exactly what the user picked in the
--                Move panel; NULL then means "no wallet" / "uncategorised".
--   • recurring_item_id is cleared (the rule lives in the source ledger).
--   • created_by becomes the mover (unchanged from production).
--   • Transfers can't be moved (one leg would leave its pair behind).
--
-- The new parameters all have defaults, so the old 2-argument call keeps
-- working (with the automatic remap) while the app rolls out.

DROP FUNCTION IF EXISTS public.move_transaction(UUID, UUID);

CREATE OR REPLACE FUNCTION public.move_transaction(
  p_transaction_id UUID,
  p_target_household_id UUID,
  p_wallet_id UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_remap BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (new_wallet_id UUID, new_category_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_tx RECORD;
  v_wallet UUID;
  v_category UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT t.household_id, t.type, t.wallet_id, t.category_id, t.transfer_pair_id
    INTO v_tx
    FROM public.transactions t
    WHERE t.id = p_transaction_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = v_tx.household_id AND hm.profile_id = v_user
  ) THEN
    RAISE EXCEPTION 'Not a member of the source ledger' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = p_target_household_id AND hm.profile_id = v_user
  ) THEN
    RAISE EXCEPTION 'Not a member of the target ledger' USING ERRCODE = '42501';
  END IF;

  IF v_tx.household_id = p_target_household_id THEN
    RAISE EXCEPTION 'Transaction is already in this ledger' USING ERRCODE = '22023';
  END IF;

  IF v_tx.transfer_pair_id IS NOT NULL THEN
    RAISE EXCEPTION 'Transfers can''t be moved to another ledger' USING ERRCODE = '22023';
  END IF;

  -- Wallet
  IF p_wallet_id IS NOT NULL THEN
    SELECT w.id INTO v_wallet
      FROM public.wallets w
      WHERE w.id = p_wallet_id AND w.household_id = p_target_household_id;
    IF v_wallet IS NULL THEN
      RAISE EXCEPTION 'That wallet isn''t in the target ledger' USING ERRCODE = '23503';
    END IF;
  ELSIF p_remap AND v_tx.wallet_id IS NOT NULL THEN
    SELECT w.id INTO v_wallet
      FROM public.wallets w
      LEFT JOIN public.wallets src ON src.id = v_tx.wallet_id
      WHERE w.household_id = p_target_household_id
      ORDER BY (lower(btrim(w.name)) = lower(btrim(src.name))) IS TRUE DESC,
               w.is_default DESC,
               w.created_at ASC
      LIMIT 1;
  END IF;

  -- Category
  IF p_category_id IS NOT NULL THEN
    SELECT c.id INTO v_category
      FROM public.categories c
      WHERE c.id = p_category_id
        AND c.household_id = p_target_household_id
        AND c.type = v_tx.type;
    IF v_category IS NULL THEN
      RAISE EXCEPTION 'That category isn''t in the target ledger' USING ERRCODE = '23503';
    END IF;
  ELSIF p_remap AND v_tx.category_id IS NOT NULL THEN
    SELECT c.id INTO v_category
      FROM public.categories c
      JOIN public.categories src ON src.id = v_tx.category_id
      WHERE c.household_id = p_target_household_id
        AND c.type = v_tx.type
        AND lower(btrim(c.name)) = lower(btrim(src.name))
      ORDER BY c.created_at ASC
      LIMIT 1;
  END IF;

  UPDATE public.transactions t
    SET household_id      = p_target_household_id,
        wallet_id         = v_wallet,
        category_id       = v_category,
        recurring_item_id = NULL,
        created_by        = v_user
    WHERE t.id = p_transaction_id;

  RETURN QUERY SELECT v_wallet, v_category;
END;
$function$;

REVOKE ALL ON FUNCTION public.move_transaction(UUID, UUID, UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_transaction(UUID, UUID, UUID, UUID, BOOLEAN) TO authenticated;
