-- Update the seed_default_wallet() trigger so new ledgers get three default
-- wallets (Cash + Savings + Credit) instead of just Cash. Cash remains the
-- one marked is_default = true (selected by default when adding a
-- transaction); the other two are common complements that users can rename,
-- recolour, or delete from Settings → Wallets.

CREATE OR REPLACE FUNCTION public.seed_default_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.wallets (household_id, name, symbol, color, initial_balance, is_default) VALUES
    (NEW.id, 'Cash',    '💵', '#22c55e', 0, true),
    (NEW.id, 'Savings', '🐷', '#3b82f6', 0, false),
    (NEW.id, 'Credit',  '💳', '#8b5cf6', 0, false);
  RETURN NEW;
END;
$function$;
