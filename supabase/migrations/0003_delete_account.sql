-- Delete your own account from the app (App Store guideline 5.1.1(v)).
-- Additive only. Every user table cascades from auth.users, but sessions go first: their XP
-- trigger rebuilds the day from the sessions left, and during the cascade it could write an
-- xp_days row for the user being deleted.

create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.sessions where user_id = uid;
  delete from public.xp_days where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
