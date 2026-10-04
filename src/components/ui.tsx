import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Palette, Radius, Spacing } from '@/constants/theme';

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  const padding = { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + 96 };
  const inner = <View style={[styles.column, style]}>{children}</View>;
  return scroll ? (
    <ScrollView style={styles.screen} contentContainerStyle={padding}>
      {inner}
    </ScrollView>
  ) : (
    <View style={[styles.screen, padding]}>{inner}</View>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Heading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.heading, style]}>{children}</Text>;
}

export function Body({ children, style, muted }: { children: ReactNode; style?: TextStyle; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted, style]}>{children}</Text>;
}

export function Label({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}>
      {children}
    </Pressable>
  );
}

type ButtonKind = 'primary' | 'go' | 'tonal' | 'ghost' | 'danger';

const BUTTON_COLORS: Record<ButtonKind, [string, string, string]> = {
  primary: [Palette.primaryFill, Palette.primaryPressed, Palette.onPrimary],
  go: [Palette.go, Palette.goPressed, Palette.onPrimary],
  tonal: [Palette.tonal, Palette.tonalPressed, Palette.text],
  ghost: ['transparent', Palette.pressed, Palette.text],
  danger: [Palette.danger, '#9e2428', Palette.onPrimary],
};

export function Button({
  label,
  onPress,
  kind = 'primary',
  large,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  large?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const [fill, pressedFill, text] = BUTTON_COLORS[kind];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        large && styles.buttonLarge,
        { backgroundColor: pressed ? pressedFill : fill, opacity: disabled ? 0.4 : 1 },
        style,
      ]}>
      <Text style={[styles.buttonText, large && styles.buttonTextLarge, { color: text }]}>{label}</Text>
    </Pressable>
  );
}

export function Tag({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <View style={[styles.tag, accent && styles.tagAccent]}>
      <Text style={[styles.tagText, accent && styles.tagTextAccent]}>{label}</Text>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && styles.segmentActive]}>
          <Text style={[styles.segmentText, o.value === value && styles.segmentTextActive]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  unit = '',
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable accessibilityLabel={`Decrease ${label}`} onPress={() => set(value - step)} style={({ pressed }) => [styles.stepperButton, pressed && styles.cardPressed]}>
          <Text style={styles.stepperSymbol}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>
          {value}
          {unit}
        </Text>
        <Pressable accessibilityLabel={`Increase ${label}`} onPress={() => set(value + step)} style={({ pressed }) => [styles.stepperButton, pressed && styles.cardPressed]}>
          <Text style={styles.stepperSymbol}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Pill toggles that scroll sideways on narrow screens. Pass `selected` as one value for a
 * single choice or several for a multi-select; `onToggle` gets the tapped value.
 */
export function Chips<T extends string>({
  options,
  selected,
  onToggle,
  wrap,
}: {
  options: { value: T; label: string }[];
  selected: T | readonly T[];
  onToggle: (value: T) => void;
  /** Wrap onto several lines instead of scrolling (settings cards). */
  wrap?: boolean;
}) {
  const isOn = (v: T) => (Array.isArray(selected) ? selected.includes(v) : selected === v);
  const chips = options.map((o) => {
    const on = isOn(o.value);
    return (
      <Pressable
        key={o.value}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        hitSlop={4}
        onPress={() => onToggle(o.value)}
        style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && !on && { backgroundColor: Palette.tonalPressed }]}>
        <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
      </Pressable>
    );
  });
  if (wrap) return <View style={[styles.row, { flexWrap: 'wrap' }]}>{chips}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips}
    </ScrollView>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.bg },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three, gap: Spacing.three },
  title: { color: Palette.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  heading: { color: Palette.text, fontSize: 20, fontWeight: '700' },
  body: { color: Palette.text, fontSize: 16, lineHeight: 22 },
  muted: { color: Palette.muted },
  label: { color: Palette.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  card: { backgroundColor: Palette.panel, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.two },
  cardPressed: { backgroundColor: Palette.pressed },
  button: { borderRadius: Radius.button, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonLarge: { paddingVertical: 18, borderRadius: Radius.card },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextLarge: { fontSize: 19 },
  tag: { backgroundColor: Palette.tonal, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  tagAccent: { backgroundColor: 'rgba(255,107,43,0.16)' },
  tagText: { color: Palette.muted, fontSize: 12, fontWeight: '700' },
  tagTextAccent: { color: Palette.accent },
  segmented: { flexDirection: 'row', backgroundColor: Palette.tonal, borderRadius: Radius.button, padding: 3 },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: Radius.button - 3 },
  segmentActive: { backgroundColor: Palette.text },
  segmentText: { color: Palette.muted, fontWeight: '700', fontSize: 14 },
  segmentTextActive: { color: Palette.bg },
  stat: { flex: 1, gap: 2 },
  statValue: { color: Palette.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: Palette.muted, fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: Palette.tonal, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: Palette.accent },
  chipText: { color: Palette.muted, fontWeight: '700', fontSize: 14 },
  chipTextOn: { color: Palette.bg },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  stepperLabel: { color: Palette.text, fontSize: 15, flex: 1 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: Palette.tonal, alignItems: 'center', justifyContent: 'center' },
  stepperSymbol: { color: Palette.text, fontSize: 20, fontWeight: '700' },
  stepperValue: { color: Palette.text, fontSize: 17, fontWeight: '800', minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
