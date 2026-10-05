-- Leaderboards: profiles, rivals and server-side XP for spam sets.
-- Additive only. The rules mirror src/core/xp.ts (keep them in step):
--   a spam set earns 10 + work + bell bonus, at most 60; work is reps, or seconds / 3 for
--   holds; "done" counts at most twice the target; bell bonus is kg x reps / 20.
--   Sets under 3 minutes after the day's last earning set earn nothing; a day earns at
--   most 1500. Each missed day costs 2%, except one free rest day per week (Mon-Sun),
--   which also keeps the streak alive.
-- Days are the player's local days (profiles.tz). Clients can't write XP: a trigger on
-- sessions rebuilds the affected day, and boards are read through functions.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- True for a time zone name Postgres knows. Public because CHECK constraints run it as the
-- inserting user (and can't hold subqueries).
create function public.is_time_zone(name text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform now() at time zone name;
  return true;
exception when others then
  return false;
end;
$$;

-- ---- Profiles ---------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 24),
  is_public boolean not null default false,
  tz text not null default 'UTC' check (public.is_time_zone(tz)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_display_name_key on public.profiles (lower(btrim(display_name)));

alter table public.profiles enable row level security;

create policy "Read public profiles and your own" on public.profiles
  for select to authenticated
  using (is_public or (select auth.uid()) = user_id);

create policy "Create your profile" on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Update your profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---- Rivals (one-way: you follow anyone public) ----------------------------------

create table public.rivals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rival_id uuid not null references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, rival_id),
  check (user_id <> rival_id)
);

alter table public.rivals enable row level security;

create policy "Read your rivals" on public.rivals
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Add a public rival" on public.rivals
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profiles p where p.user_id = rival_id and p.is_public)
  );

create policy "Remove your rivals" on public.rivals
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---- XP ---------------------------------------------------------------------------

-- XP per local day, written only by the trigger below. Owners can read their own rows.
create table public.xp_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  xp integer not null check (xp between 0 and 1500),
  primary key (user_id, day)
);

alter table public.xp_days enable row level security;

create policy "Read your XP days" on public.xp_days
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- XP one session payload (an app SessionLog) is worth on its own.
create function private.set_xp(payload jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
  done numeric;
  amount numeric;
  load numeric;
begin
  if payload ->> 'workoutId' is distinct from 'spamset'
     or jsonb_typeof(payload -> 'entries') <> 'array'
     or jsonb_array_length(payload -> 'entries') <> 1 then
    return 0;
  end if;
  e := payload -> 'entries' -> 0;
  done := (e ->> 'done')::numeric;
  if done is null or done <= 0 then
    return 0;
  end if;
  if e -> 'target' ? 'reps' then
    amount := floor(least(done, 2 * (e -> 'target' ->> 'reps')::numeric, 50));
    load := least(greatest(coalesce((e ->> 'load')::numeric, 0), 0), 100);
    return least(60, 10 + amount + floor(load * amount / 20))::integer;
  end if;
  amount := least(done, 2 * (e -> 'target' ->> 'seconds')::numeric, 180);
  return least(60, 10 + floor(amount / 3))::integer;
exception when others then
  -- Malformed payloads earn nothing rather than failing the sync.
  return 0;
end;
$$;

-- Recompute one local day for one player from their sessions. Sessions count only when
-- uploaded within 72 hours of being done (no backfilling old days) and not in the future.
create function private.rebuild_xp_day(uid uuid, local_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  zone text;
  s record;
  last_at timestamptz;
  earned integer;
  total integer := 0;
begin
  select p.tz into zone from public.profiles p where p.user_id = uid;
  zone := coalesce(zone, 'UTC');
  for s in
    select ss.started_at, private.set_xp(ss.payload) as earned
    from public.sessions ss
    where ss.user_id = uid
      and (ss.started_at at time zone zone)::date = local_day
      and ss.created_at - ss.started_at < interval '72 hours'
      and ss.started_at <= ss.created_at + interval '5 minutes'
    order by ss.started_at
  loop
    earned := s.earned;
    continue when earned = 0;
    continue when last_at is not null and s.started_at - last_at < interval '3 minutes';
    last_at := s.started_at;
    total := least(1500, total + earned);
  end loop;

  if total > 0 then
    insert into public.xp_days (user_id, day, xp) values (uid, local_day, total)
    on conflict (user_id, day) do update set xp = excluded.xp;
  else
    delete from public.xp_days where user_id = uid and day = local_day;
  end if;
end;
$$;

create function private.sessions_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  zone text;
begin
  select p.tz into zone from public.profiles p
  where p.user_id = coalesce(new.user_id, old.user_id);
  zone := coalesce(zone, 'UTC');
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.rebuild_xp_day(old.user_id, (old.started_at at time zone zone)::date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.rebuild_xp_day(new.user_id, (new.started_at at time zone zone)::date);
  end if;
  return null;
end;
$$;

create trigger sessions_xp
  after insert or update or delete on public.sessions
  for each row execute function private.sessions_xp();

-- Rebuild every day for a player (after a time zone change, and once for existing data).
create function private.rebuild_xp_all(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  zone text;
  d date;
begin
  select p.tz into zone from public.profiles p where p.user_id = uid;
  zone := coalesce(zone, 'UTC');
  delete from public.xp_days where user_id = uid;
  for d in
    select distinct (ss.started_at at time zone zone)::date from public.sessions ss where ss.user_id = uid
  loop
    perform private.rebuild_xp_day(uid, d);
  end loop;
end;
$$;

create function private.profiles_xp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.tz is distinct from old.tz then
    perform private.rebuild_xp_all(new.user_id);
  end if;
  return null;
end;
$$;

create trigger profiles_xp
  after insert or update of tz on public.profiles
  for each row execute function private.profiles_xp();

-- Sessions synced before this migration.
select private.rebuild_xp_all(u.user_id) from (select distinct user_id from public.sessions) u;

-- Replay a player's days to today: add each day's XP; for a missed day before today use
-- the week's free rest day, otherwise lose 2% and reset the streak.
create function private.player_stats(uid uuid)
returns table (total integer, week integer, today integer, streak integer, best_streak integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  zone text;
  local_today date;
  this_week date;
  first_day date;
  rest_week date;
  d record;
  wk date;
  t integer := 0;
  w integer := 0;
  td integer := 0;
  s integer := 0;
  b integer := 0;
begin
  select p.tz into zone from public.profiles p where p.user_id = uid;
  zone := coalesce(zone, 'UTC');
  local_today := (now() at time zone zone)::date;
  this_week := date_trunc('week', local_today)::date;
  select min(x.day) into first_day from public.xp_days x where x.user_id = uid;
  if first_day is null or first_day > local_today then
    return query select 0, 0, 0, 0, 0;
    return;
  end if;

  for d in
    select g::date as day, coalesce(x.xp, 0) as xp
    from generate_series(first_day, local_today, interval '1 day') g
    left join public.xp_days x on x.user_id = uid and x.day = g::date
    order by g
  loop
    wk := date_trunc('week', d.day)::date;
    if d.xp > 0 then
      t := t + d.xp;
      s := s + 1;
      if wk = this_week then
        w := w + d.xp;
      end if;
      if d.day = local_today then
        td := d.xp;
      end if;
    elsif d.day <> local_today then
      if rest_week is distinct from wk then
        rest_week := wk;
      else
        t := floor(t * 0.98)::integer;
        s := 0;
      end if;
    end if;
    b := greatest(b, s);
  end loop;

  return query select t, w, td, s, b;
end;
$$;

-- ---- Reading boards ---------------------------------------------------------------

-- Your own numbers, whether or not your profile is public.
create function public.my_stats()
returns table (total integer, week integer, today integer, streak integer, best_streak integer)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.player_stats((select auth.uid()));
$$;

-- board: 'all' (all-time XP after decay), 'week' (XP this week) or 'streak'.
-- scope: 'everyone' (public profiles) or 'rivals' (the players you follow). You are always
-- included once you have a profile, so you can see where you stand.
create function public.leaderboard(board text default 'all', scope text default 'everyone', max_rows integer default 50)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  value integer,
  total integer,
  week integer,
  streak integer,
  is_me boolean,
  is_rival boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select auth.uid() as id),
  players as (
    select p.user_id, p.display_name
    from public.profiles p, me
    where p.user_id = me.id
       or (p.is_public and (scope <> 'rivals'
           or exists (select 1 from public.rivals r where r.user_id = me.id and r.rival_id = p.user_id)))
  ),
  scored as (
    select pl.user_id, pl.display_name, st.total, st.week, st.streak,
           case board when 'week' then st.week when 'streak' then st.streak else st.total end as value
    from players pl
    cross join lateral private.player_stats(pl.user_id) st
  )
  select rank() over (order by sc.value desc, sc.total desc) as rank,
         sc.user_id, sc.display_name, sc.value, sc.total, sc.week, sc.streak,
         sc.user_id = (select id from me) as is_me,
         exists (select 1 from public.rivals r where r.user_id = (select id from me) and r.rival_id = sc.user_id) as is_rival
  from scored sc
  order by rank, sc.display_name
  limit least(greatest(max_rows, 1), 200);
$$;

revoke all on function private.set_xp(jsonb), private.rebuild_xp_day(uuid, date),
  private.rebuild_xp_all(uuid), private.sessions_xp(), private.profiles_xp(), private.player_stats(uuid)
  from public, anon, authenticated;
revoke all on function public.my_stats(), public.leaderboard(text, text, integer) from public, anon;
grant execute on function public.my_stats(), public.leaderboard(text, text, integer) to authenticated;

-- Let PostgREST see the new tables and functions.
notify pgrst, 'reload schema';
