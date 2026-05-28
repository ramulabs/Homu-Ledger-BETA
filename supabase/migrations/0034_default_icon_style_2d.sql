-- v1.46.14 — Default icon_style for NEW users to '2d' instead of '3d'.
--
-- Background: the original 0007 migration set the column default to '3d'
-- because the 3D emoji icons were the launch style. Hands-on testing
-- showed the 2D line icons read more cleanly across category icons /
-- wallet pills, so we're flipping the default for everyone who signs
-- up from v1.46.14 onward. Existing users keep their current value —
-- they can still flip in Settings → Icon Style at any time.

ALTER TABLE public.profiles
  ALTER COLUMN icon_style SET DEFAULT '2d';
