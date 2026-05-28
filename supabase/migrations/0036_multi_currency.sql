-- RAM-25: Multi-currency wallets
-- Adds a `currency` column to wallets, an `fx_rates` table for daily
-- exchange-rate snapshots, and a `home_currency` column to households.

-- Add currency to wallets (default IDR for existing wallets)
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'IDR';

-- Add FX rates table for daily snapshots (populated by /api/cron/update-fx-rates)
CREATE TABLE IF NOT EXISTS public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base text NOT NULL,           -- e.g. 'IDR'
  target text NOT NULL,         -- e.g. 'USD'
  rate numeric(18, 8) NOT NULL, -- how many TARGET units per 1 BASE unit
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(base, target, date)
);

-- Add home_currency to households (existing table)
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS home_currency text NOT NULL DEFAULT 'IDR';

-- RLS for fx_rates: read-only for all authenticated users
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fx_rates_select" ON public.fx_rates
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Insert is restricted to the service role only (used by the cron job).
-- No INSERT policy is created here, so anon/authenticated roles cannot write.
