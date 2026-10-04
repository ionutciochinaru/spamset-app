# Spamset (app)

Expo (SDK 57) app for iOS, Android and web. Spam sets (one short exercise at your interval, via notifications) with a live 3D form demonstration. See README.md for features and setup.

## Layout

- `src/core/`: pure TypeScript domain logic (exercises, spam set schedule, progression, session logs). Keep it free of React/Expo imports and covered by `src/core/__tests__`.
- `src/animation/`: 3D figure (`figure.ts`), clip sampling, and generated `clips.ts` / `thumbnails.ts` (do not edit; regenerate with `npm run animations`).
- `src/store/app-store.ts`: local-first zustand store persisted to `expo-sqlite/localStorage`.
- `src/lib/`: Supabase client, auth (Google / Apple / offline), sync.
- `extension/`: Chrome extension (MV3) for web spam sets; bundles `src/core/spamset.ts` with esbuild (`npm run extension`). Typechecked by `npm run typecheck` via `extension/tsconfig.json`.
- `tools/animation/`: Python rig and motion authoring shared with the Spamset watch app. The 3D figure must keep matching the watch renderer's look (`render.py`).

## UI

- Build every screen from the visual library in `src/components/ui.tsx` (a modern app with a game layer; pixel type for HUD numbers only). Follow `docs/design-system.md`, and add missing components to the library and to `/debug/ui` rather than styling one-offs.

## Supabase environments

- Spamset has two self-hosted Supabase stacks on the Hostinger VPS: `dev-spamset` and `prod-spamset` (see `docs/supabase-vps.md`). Development and preview builds use `dev-spamset`; production builds use `prod-spamset`. Never fall back from development to production.
- The same VPS hosts Loadout's stacks (`dev-loadout`, `prod-loadout`). Never use, query, migrate or modify them, or any Checkmate project, from this repo.
- Verify the target is a Spamset stack before any Supabase operation. Never delete, reset, truncate or drop data; prefer additive, reversible migrations.
- Confirm any production database write, migration or configuration change with the user before running it.

## Checks

Run before declaring work done: `npm test`, `npm run typecheck`, `npx expo lint`.

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
