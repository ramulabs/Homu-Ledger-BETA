-- Pin search_path on three functions flagged by Supabase's security advisor
-- (lint 0011_function_search_path_mutable). A SECURITY DEFINER function with
-- a caller-controlled search_path is a classic privilege-escalation vector
-- if a hostile schema gets onto the path; pinning it to `public` removes
-- that surface area.
ALTER FUNCTION public.generate_invite_code() SET search_path TO 'public';
ALTER FUNCTION public.get_email_by_username(TEXT) SET search_path TO 'public';
ALTER FUNCTION public.generate_promo_code_string() SET search_path TO 'public';
