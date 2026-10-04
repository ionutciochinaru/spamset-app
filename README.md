# Spamset

A kettlebell training app for iOS, Android and web, built with Expo. It runs circuits, EMOMs, AMRAPs, intervals, ladders and strength sets, tracks every set, and applies progressive overload using the bells you own. Each exercise is demonstrated by a looping 3D figure you can drag to inspect the form from any angle.

## Features

- **Spam sets** (`src/core/spamset.ts`, `src/app/spamset.tsx`): one short exercise at your interval through the day.
  - Set the interval, active hours, days and which exercise groups to draw from (`src/app/spamset-settings.tsx`). Picks respect your equipment and use your current targets.
  - iOS/Android: local notifications scheduled on the device (`src/lib/spamset-notify.ts`), so they arrive with the app closed. Tapping one opens a one-exercise session; Done logs it to History.
  - Web: the open page notifies with a timer (`src/lib/spamset-notify.web.ts`). The Chrome extension (`extension/`) delivers them with the tab closed.
- **Exercises (75):**
  - 15 kettlebell lifts: swing, deadlift, goblet squat, lunges, rows, side bend, curl, halo, pullover, clean, press, snatch and the Turkish get-up.
  - 46 bodyweight and small-gear exercises (chair, pull-up bar, doorframe, dumbbells, band) and 14 stretches.
  - Set the equipment you own in Profile; lists, the picker and suggestions hide what you can't do.
- **Workout builder** (`src/app/builder.tsx`, `src/core/builder.ts`): combine any blocks and exercises into your own workouts. They sync with your account.
- **Training types:** strength sets (double progression), circuits, EMOM, AMRAP, intervals/Tabata, ladders. Workouts are lists of blocks, compiled into a step timeline (`src/core/timeline.ts`).
- **Progressive overload** (`src/core/progression.ts`)
  - **Strength sets:** add reps within the rep range; when every set hits the top, move to your next heavier bell. Two sessions in a row below the range step back down.
  - **Timed and circuit work:** two Easy ratings in a row move you up a bell.
  - **Bodyweight:** reps climb by one (holds by 5 s) to the top of the range, then the app suggests the harder variant. Stretches don't progress.
- **Session runner** (`src/core/runner.ts`, `src/app/session.tsx`)
  - Rep sets: Done, then confirm the reps you actually did.
  - Countdowns for timed work, rest, EMOM minutes and AMRAPs.
  - Pause, +15 s rest, haptic cues and keep-awake.
- **3D demonstrations:** the figure from the Spamset watch app, rendered live with three.js. It uses the same proportions, tapered limbs, orange shirt, trousers, shoes and kettlebell. The side nearer the camera is drawn in ivory, as on the watch.
- **Accounts:** Google, Apple, or offline. Data is local-first (SQLite-backed storage on device) and syncs to Supabase when you sign in.

## Develop

```sh
npm install
npx expo start          # press w for web; use a development build for iOS/Android
npm test                # jest: progression, timelines, runner
npm run typecheck
npx expo lint
```

Expo Go does not include every native module this app uses (GL, Apple sign-in). Build a development client with `npx expo run:ios|android` or `eas build --profile development`.

## Accounts (optional)

Without Supabase keys the app runs offline-only. Accounts sync to Spamset's own self-hosted
Supabase stacks on the Hostinger VPS: **dev-spamset** for development and preview builds,
**prod-spamset** for production. `app.config.ts` maps each EAS profile to its stack and refuses a
mismatched URL; nothing falls back to production. Setup: [docs/supabase-vps.md](docs/supabase-vps.md).

1. Copy `.env.example` to `.env.local` and fill in dev-spamset's `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (its `ANON_KEY`).
2. Apply `supabase/migrations/0001_init.sql`. It creates the tables with row-level security.
3. Enable the Google and Apple providers in the stack's `.env`. Redirect URLs: `spamset://auth-callback` and your web origin.

On iOS, Apple sign-in is native; on Android and web it uses browser OAuth. Google uses browser OAuth everywhere.

## Chrome extension

`extension/` holds a Manifest V3 extension that fires spam sets with the web app closed. The page passes it the schedule through a content script. The extension then plans with the same `src/core/spamset.ts`, keeps one `chrome.alarms` alarm for the next slot, and opens `/spamset` when a notification is clicked.

```sh
npm run extension                                         # build extension/dist for http://localhost:8081
SPAMSET_WEB_ORIGINS=https://your.web.app npm run extension  # also connect to a deployed web app
```

Load it in Chrome from `chrome://extensions` → Developer mode → Load unpacked → `extension/dist`. Then open the web app once so the extension receives your schedule.

## Animation pipeline

`tools/animation/` is the rig from the Spamset watch app: a fixed-length 3D stick skeleton, contact-driven motions, kettlebell choreography, a geometry validator and the PNG renderer.

```sh
npm run animations            # export 3D joint tracks + list thumbnails
npm run validate:animations   # geometry checks (segment lengths, contacts, loops)
```

- `export_3d.py` samples each motion at 30 fps into `assets/animations/*.json` (joint positions in mm) and regenerates `src/animation/clips.ts`. The export fails on any IK error.
- `export_thumbs.py` draws list thumbnails with the unchanged watch renderer.
- `src/animation/figure.ts` builds the 3D figure from those joints.

`python3 tools/make_icons.py` regenerates the app icon, Android adaptive layers, splash image and favicon from the same renderer.

To add an exercise, author its motion in `tools/animation/` following `skills/exercise-animation/SKILL.md`. Then add it to `EXERCISES` in `export_3d.py` and `src/core/exercises.ts`, and run `npm run animations`.
