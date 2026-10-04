import '@/global.css';

import { Platform } from 'react-native';

/** Watch palette (design/visual-tokens.json): black stage, ivory text, orange accent. */
export const Palette = {
  bg: '#000000',
  stage: '#0b0b0a',
  panel: '#151514',
  pressed: '#30302c',
  text: '#eeede4',
  muted: '#a6a69e',
  dim: '#66665f',
  track: '#32322e',
  accent: '#ff6b2b',
  accentPressed: '#da5720',
  primaryFill: '#c94a16',
  primaryPressed: '#a63c10',
  onPrimary: '#ffffff',
  go: '#00a600',
  goPressed: '#008500',
  danger: '#c52e32',
  tonal: '#30312b',
  tonalPressed: '#45473d',
} as const;

export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;

/** Modern rounded corners; the retro lives in the HUD type and the 3D, not the shapes. */
export const Radius = { card: 16, button: 14, pill: 999 } as const;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  web: { sans: 'var(--font-display)', rounded: 'var(--font-rounded)', mono: 'var(--font-mono)' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
});

export const MaxContentWidth = 720;

/**
 * Visual library tokens (docs/design-system.md): a modern app with a game layer.
 * Space Grotesk for titles, buttons and chips; the system font for reading; the pixel font
 * only for HUD moments (numbers, timers, streak, countdown, wordmark, PRESS START).
 */
export const DisplayFont = { bold: 'SpaceGrotesk_700Bold', semibold: 'SpaceGrotesk_600SemiBold' } as const;

export const PixelFont = 'PressStart2P_400Regular';

/** Press Start 2P is drawn on an 8 px grid: keep it to multiples of 8. */
export const PixelSize = { small: 8, medium: 16, large: 24, huge: 32 } as const;

export const Psx = {
  /** Card edge, with a lighter top edge for a hint of depth. */
  edge: '#232320',
  edgeTop: '#33332e',
  well: '#0c0c0b',
  /** Counters, timers, scores. */
  hud: '#ffd23f',
  /** Live/system accents on the home HUD. */
  cyan: '#4fd8ff',
} as const;

/** Darker edge under tactile buttons, per fill. */
export const ButtonEdge: Record<string, string> = {
  '#ff6b2b': '#b8481a',
  '#00a600': '#006b00',
  '#30312b': '#1b1c18',
  '#c52e32': '#7f1c1f',
};
