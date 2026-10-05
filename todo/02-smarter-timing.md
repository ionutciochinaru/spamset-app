# 2. Smarter timing

Spam sets fire on a fixed clock. Wakeout and Moova read health data and only nudge you when you have been still, which feels less naggy.

## Tasks

- [ ] Read recent activity: Apple Health (steps, workouts, stand minutes) on iOS and Health Connect on Android. Choose Expo-compatible libraries and add their config plugins (development build needed).
- [ ] Skip or delay a spam set when you have been active in the last interval, e.g. more than N steps or a workout logged. Keep the rule in `src/core/spamset.ts` with tests.
- [ ] Permission prompts and a setting to turn it off; fall back to the fixed schedule without access or on web.
- [ ] Optionally write finished spam sets back to Health as workouts.
- [ ] Remove the 48-notification limit: if the app isn't opened for about five workdays, the scheduled notifications run out. Consider server push, or rescheduling from a background task.
