alter table public.households
  add column owner_id uuid references public.profiles(id) on delete set null;
