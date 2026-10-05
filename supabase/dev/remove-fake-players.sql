-- DEV ONLY (dev-spamset): remove the players added by fake-players.sql (emails fake-*@example.invalid).
-- Sessions go first so the XP trigger doesn't rebuild days for users being deleted; the rest
-- (profiles, XP days, rivals) cascades from auth.users.
delete from public.sessions where user_id in (select id from auth.users where email like 'fake-%@example.invalid');
delete from public.xp_days where user_id in (select id from auth.users where email like 'fake-%@example.invalid');
delete from auth.users where email like 'fake-%@example.invalid';
