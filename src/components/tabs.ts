/** Shared by the native and web tab bars. */
export const TABS = [
  { name: 'index', label: 'Today', sf: 'flame.fill', md: 'local_fire_department', web: 'local_fire_department' },
  { name: 'ranks', label: 'Ranks', sf: 'trophy.fill', md: 'emoji_events', web: 'emoji_events' },
  { name: 'exercises', label: 'Exercises', sf: 'figure.strengthtraining.functional', md: 'sports_gymnastics', web: 'sports_gymnastics' },
  { name: 'history', label: 'History', sf: 'chart.bar.fill', md: 'bar_chart', web: 'bar_chart' },
] as const;
