# 3. Packs and a daily challenge

The library is 75 exercises against Wakeout's 3,000+ in 102 packs. Themed packs and a daily challenge make it feel bigger without new animations.

## Tasks

- [ ] Packs: named sets of existing exercises, such as Desk break, Back care, Legs, Kettlebell and Mobility. Define them in `src/core/` with tests.
- [ ] Let a pack be the spam set pool, alongside or instead of the category chips in Spam set settings.
- [ ] Daily challenge: one exercise and target a day, the same for everyone (seeded by date, like the spam set picks). Show it on Today and give it bonus XP. The server rules in `supabase/migrations/` must agree, so a new migration is needed for the bonus.
- [ ] A leaderboard for today's challenge, optional.
