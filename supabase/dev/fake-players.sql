-- DEV ONLY (dev-spamset): fake public players to see the leaderboards with a crowd.
-- Never run on prod-spamset. Remove them with supabase/dev/remove-fake-players.sql.
-- Each player gets spam sets over the last 14 days (their own activity level, set 1..5 a day,
-- 20 minutes apart) so the server's own XP rules give them totals, weeks and streaks.
do $$
declare
  names text[] := array['SquatDaddy', 'CurlGirl', 'DeskGoblin42', 'Benchjamin', 'PlankTank', 'LungeLord',
                        'KettleKate', 'GluteusMax', 'TwoSetTerry', 'DeadliftDana', 'ProteinPete', 'CardioCarl'];
  -- Chance of training on a given day, per player.
  activity numeric[] := array[0.95, 0.9, 0.8, 0.75, 0.7, 0.6, 0.55, 0.5, 0.4, 0.3, 0.2, 0.1];
  uid uuid;
  day int;
  n int;
  k int;
  reps int;
  at timestamptz;
begin
  if exists (select 1 from auth.users where email like 'fake-%@example.invalid') then
    raise notice 'Fake players already exist; run remove-fake-players.sql first to reseed.';
    return;
  end if;
  for i in 1 .. array_length(names, 1) loop
    uid := gen_random_uuid();
    insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (uid, 'authenticated', 'authenticated', 'fake-' || lower(names[i]) || '@example.invalid', now(), now());
    insert into public.profiles (user_id, display_name, is_public, tz) values (uid, names[i], true, 'Europe/Bucharest');
    for day in 0 .. 13 loop
      continue when random() > activity[i];
      n := 1 + floor(random() * 5)::int;
      for k in 1 .. n loop
        reps := 8 + floor(random() * 15)::int;
        at := date_trunc('day', now() at time zone 'Europe/Bucharest') at time zone 'Europe/Bucharest'
              - make_interval(days => day) + make_interval(hours => 9, mins => k * 20);
        continue when at > now();
        insert into public.sessions (id, user_id, started_at, created_at, payload)
        values (
          'fake-' || day || '-' || k, uid, at, at + interval '1 minute',
          jsonb_build_object(
            'id', 'fake-' || day || '-' || k, 'workoutId', 'spamset', 'workoutName', 'Spam set',
            'startedAt', at, 'finishedAt', at + interval '1 minute',
            'entries', jsonb_build_array(jsonb_build_object(
              'exercise', 'pushup', 'blockKind', 'spamset', 'block', 0, 'load', 0,
              'target', jsonb_build_object('reps', reps), 'done', reps)),
            'amrapRounds', '{}'::jsonb, 'effort', '{}'::jsonb, 'progress', '{}'::jsonb));
      end loop;
    end loop;
  end loop;
end $$;
