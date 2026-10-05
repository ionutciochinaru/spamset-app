# Spamset visual library

Spamset is **a modern app with a game layer**. The base is a clean dark fitness app: rounded cards, a readable type system, and plenty of room. The game layer is a small set of signature moments: the PSX 3D figure, HUD numbers in pixel type, tactile buttons and charge meters.

Every screen builds from `src/components/ui.tsx`, and every token lives in `src/constants/theme.ts`. Browse the whole library in the app at **Profile → Visual library** (`/debug/ui`).

## Why this blend

- **Pixel type is a display accent, not a reading face.** Pixel fonts work best in titles and short accents, paired with a clean sans for everything else ([Speckyboy](https://speckyboy.com/free-pixel-fonts/), [Design Work Life](https://designworklife.com/pixel-fonts-for-video-game-tech-design/)). Press Start 2P in particular is a display face drawn on an 8 px grid and is tiring in quantity ([Typogram](https://typogram.co/font-discovery/how-to-use-press-start-2p-font), [Google Fonts](https://fonts.google.com/specimen/Press+Start+2P)).
- **A signature font earns its keep in a few places.** Nothing OS used its dot-matrix face widely, cut it back for readability, then brought it back only for titles and widgets ([Android Authority](https://www.androidauthority.com/nothing-os-3-hands-on-3488739/), [Tech Issues Today](https://techissuestoday.com/nothing-ndot-font-nothing-os-3-0/)).
- **Gamified fitness apps that last look clean.** They use cards and layered depth, and keep the game in streaks, XP and levels rather than in the whole skin ([Stormotion](https://stormotion.io/blog/fitness-app-ux/), [Yu-kai Chou](https://yukaichou.com/gamification-analysis/top-10-gamification-in-fitness/)).

## Rules

1. **Build screens from the library.** Don't use React Native `Switch` or `TextInput` directly, or hand-roll pressables. If something is missing, add it to `ui.tsx` and to `/debug/ui`.
2. **Three typefaces, three jobs.**

   | Face | Token | Use |
   |---|---|---|
   | Space Grotesk | `DisplayFont` | titles, headings, labels, buttons, chips, tabs |
   | System | (default) | sentences, help, form cues, list detail |
   | Press Start 2P | `PixelFont` | HUD only: numbers, timers, countdowns, streak, the SPAMSET wordmark |

   Pixel sizes are multiples of 8 (`PixelSize`: 8, 16, 24, 32). Never set a sentence or a name in pixel type.
3. **Colour has a job.** Orange (`Palette.accent`) marks the main action and targets, green (`Palette.go`) starts a set or rates it Easy, and yellow (`Psx.hud`) is for HUD numbers. Cyan (`Psx.cyan`) is used sparingly for live labels on the home hero; red (`Palette.danger`) means destructive.
4. **The PSX lives in the 3D.** Scanlines go on 3D stages and the home hero only, never over text. The figure keeps its PSX rendering.
5. **Buttons are tactile.** A thick darker bottom edge that the button presses into. Cards dip slightly when pressed. There are no bevels and no hard pixel shadows on surfaces.
6. **One game moment per screen.** The home screen is the game hub: the player card (level, streak, four PS2-style stat bars and a gym-meme caption) and the hero stage with its countdown. Other screens stay calm, with HUD numbers where there are numbers. `Blink` appears at most once per screen.
7. **Phone first.** Touch targets are at least 40 pt (50 for buttons and fields), with a 16 pt side gutter. Every component works on iOS, Android and web, with no platform forks for looks.
8. **One header row per screen.** Every screen starts with `ScreenHeader`: the back arrow on the left on pushed screens (`back`), the title next to it, and your profile picture on the far right, which opens Profile (hidden on Profile itself with `profile={false}`). Never use the system navigation header or a spacer above the title. Today keeps its own header (date and wordmark) with the picture in the same place.

## Components

| Group | Components |
|---|---|
| Layout | `Screen`, `ScreenHeader` (back, title, profile picture), `Row`, `Scanlines` |
| Type | `Title`, `Heading`, `Label`, `Body`, `Steps`, `PixelText` (HUD) |
| Surfaces | `Card`, `HudCard` (the home player card), `Divider`, `Well`, `Stage`, `Thumb` |
| Actions | `Button` (primary, go, tonal, ghost, danger; `large`), `IconButton` (text or `icon`), `Avatar`, `Toggle`, `Field`, `Chips`, `Segmented`, `Stepper` |
| Data | `Stat` (HUD number + label, or `inline`), `StatBar` (PS2-style stat bar with percent), `Meter`, `Tag` |
| Motion | `Blink` |
| Meme | `MemeText` (white caption with a black outline; one per screen, on the player card) |
| App chrome | `AppTabs` (one tab bar for every platform), `FigureViewer` (3D stage with scanlines) |
