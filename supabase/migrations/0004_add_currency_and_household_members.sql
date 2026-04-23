-- Add per-household currency
ALTER TABLE public.households ADD COLUMN currency TEXT NOT NULL DEFAULT 'IDR';

-- Household membership junction table (supports multi-ledger per user)
CREATE TABLE public.household_members (
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, profile_id)
);

CREATE INDEX household_members_profile_idx ON public.household_members (profile_id);

-- Backfill from existing profiles
INSERT INTO public.household_members (household_id, profile_id, role)
SELECT
  p.household_id,
  p.id,
  CASE WHEN h.owner_id = p.id THEN 'owner' ELSE 'member' END
FROM public.profiles p
JOIN public.households h ON h.id = p.household_id
WHERE p.household_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household_members: can read own memberships"
  ON public.household_members FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "household_members: members can read same household"
  ON public.household_members FOR SELECT
  USING (household_id = public.current_household_id());

CREATE POLICY "household_members: can insert own"
  ON public.household_members FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "household_members: can delete own"
  ON public.household_members FOR DELETE
  USING (profile_id = auth.uid());
