# 4. Connect the watch app

The Spamset watch app exists separately and shares the figure and motions (`tools/animation/`), but this app doesn't talk to it. Wakeout and Moova both put reminders on the wrist.

## Tasks

- [ ] Decide the shape: spam set notifications mirrored to the watch only, or a watch app that runs the spam set itself (animation, countdown, Done and rating).
- [ ] Sync the schedule, targets and logged sets between phone and watch (Wear OS Data Layer and WatchConnectivity, or via Supabase).
- [ ] Count watch-logged spam sets toward XP and the boards.
