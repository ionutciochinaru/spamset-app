/**
 * Spamset visual library: every screen builds from these (docs/design-system.md).
 * A modern app with a game layer:
 * - modern base: rounded cards, Space Grotesk titles and buttons, system-font reading text;
 * - game layer: tactile buttons with a thick bottom edge, pixel type only for HUD values
 *   (numbers, timers, streak), segmented meters, and the PSX 3D stage with scanlines.
 * Browse every component at /debug/ui.
 */
import { Image as ExpoImage } from 'expo-image';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { thumbnails } from '@/animation/thumbnails';
import { ButtonEdge, DisplayFont, MaxContentWidth, Palette, PixelFont, PixelSize, Psx, Radius, Spacing } from '@/constants/theme';

const scanlines = require('@/assets/images/scanlines.png');

// ---- Depth --------------------------------------------------------------------------

/** A CSS gradient as a style: `backgroundImage` on web, the native equivalent elsewhere. */
export function gradient(css: string): ViewStyle {
  return (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css }) as ViewStyle;
}

/** Warm light falling from the top of a screen, behind the content. */
export function Glow({ height = 360 }: { height?: number }) {
  return <View pointerEvents="none" style={[styles.glow, { height }, gradient('linear-gradient(180deg, rgba(255,107,43,0.13) 0%, rgba(255,107,43,0.04) 45%, rgba(0,0,0,0) 100%)')]} />;
}

/** A small symbol: SF Symbols on iOS, Material Symbols on Android and web. */
export function Icon({ ios, md, color = Palette.muted, size = 16 }: { ios: SymbolViewProps['name'] & string; md: string; color?: string; size?: number }) {
  return <SymbolView name={{ ios, android: md, web: md } as SymbolViewProps['name']} tintColor={color} size={size} />;
}

// ---- Layout -------------------------------------------------------------------------

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const padding = { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + 110 };
  const inner = <View style={[styles.column, style]}>{children}</View>;
  return (
    <View style={styles.screen}>
      <Glow />
      {scroll ? (
        <ScrollView style={styles.fill} contentContainerStyle={padding} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        <View style={[styles.fill, padding]}>{inner}</View>
      )}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/** CRT lines for 3D stages and the home hero. Not for screens of text. */
export function Scanlines({ opacity = 1 }: { opacity?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Image source={scanlines} resizeMode="repeat" style={styles.fill} />
    </View>
  );
}

// ---- Type ---------------------------------------------------------------------------

/** HUD type: numbers, timers, streaks, the wordmark. Keep it short; sizes are multiples of 8. */
export function PixelText({
  children,
  size = PixelSize.small,
  color = Palette.text,
  style,
  lines,
  center,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: TextStyle;
  lines?: number;
  center?: boolean;
}) {
  return (
    <Text
      numberOfLines={lines}
      style={[
        styles.pixel,
        { fontSize: size, lineHeight: Math.round(size * 1.5), color, textShadowOffset: { width: size / 8, height: size / 8 } },
        center && { textAlign: 'center' },
        style,
      ]}>
      {children}
    </Text>
  );
}

export function Title({ children, style, color = Palette.text }: { children: ReactNode; style?: TextStyle; color?: string }) {
  return <Text style={[styles.title, { color }, style]}>{children}</Text>;
}

export function Heading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.heading, style]}>{children}</Text>;
}

/** Small section label. */
export function Label({ children, style, color = Palette.muted }: { children: ReactNode; style?: TextStyle; color?: string }) {
  return <Text style={[styles.label, { color }, style]}>{children}</Text>;
}

/** Readable paragraph text in the system font. */
export function Body({ children, style, muted }: { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted, style]}>{children}</Text>;
}

/** Numbered steps (form cues). */
export function Steps({ items }: { items: readonly string[] }) {
  return (
    <View style={{ gap: Spacing.two + 2 }}>
      {items.map((item, i) => (
        <Row key={item} style={{ alignItems: 'flex-start' }}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>{i + 1}</Text>
          </View>
          <Body style={{ flex: 1 }}>{item}</Body>
        </Row>
      ))}
    </View>
  );
}

// ---- Surfaces -----------------------------------------------------------------------

/** Card surface. With onPress it dips while pressed. */
export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}>
      {children}
    </Pressable>
  );
}

/**
 * The home's player card: warm light from the top corner and an orange edge, for the one
 * summary of who you are in the game (wordmark, streak, level, week). One per screen.
 */
export function HudCard({ children, style, onPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  if (!onPress) return <View style={[styles.card, styles.hudCard, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.card, styles.hudCard, pressed && styles.cardPressed, style]}>
      {children}
    </Pressable>
  );
}

/** Hairline between sections of a card. */
export function Divider() {
  return <View style={styles.divider} />;
}

/** Recessed surface for stats, inputs and inset content. */
export function Well({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, styles.well, style]}>{children}</View>;
}

/** Frame for 3D figures and the home hero, with scanlines (the PSX layer). */
export function Stage({ children, style, scan = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; scan?: boolean }) {
  return (
    <View style={[styles.stage, style]}>
      {children}
      {scan && <Scanlines />}
    </View>
  );
}

/** Exercise thumbnail. Give it a size, or flex it with `style`. */
export function Thumb({ clip, size, style, dim }: { clip: string; size?: number; style?: StyleProp<ViewStyle>; dim?: boolean }) {
  return (
    <Stage scan={false} style={[size !== undefined && { width: size, height: size }, styles.thumb, dim && { opacity: 0.4 }, style]}>
      <ExpoImage source={thumbnails[clip]} style={styles.fill} contentFit="cover" />
    </Stage>
  );
}

// ---- Actions ------------------------------------------------------------------------

type ButtonKind = 'primary' | 'go' | 'tonal' | 'ghost' | 'danger';

/** [fill, label colour] per kind. */
const BUTTON_COLORS: Record<ButtonKind, [string, string]> = {
  primary: [Palette.accent, '#000000'],
  go: [Palette.go, '#000000'],
  tonal: [Palette.tonal, Palette.text],
  ghost: ['transparent', Palette.text],
  danger: [Palette.danger, Palette.onPrimary],
};

/** Tactile button: a thick darker bottom edge that it presses down into. */
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
  style?: StyleProp<ViewStyle>;
}) {
  const [fill, text] = BUTTON_COLORS[kind];
  const edge = kind === 'ghost' ? 'transparent' : ButtonEdge[fill];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        large && styles.buttonLarge,
        { backgroundColor: fill, borderBottomColor: edge, opacity: disabled ? 0.4 : 1 },
        pressed && styles.buttonPressed,
        pressed && kind === 'ghost' && { backgroundColor: Palette.pressed },
        style,
      ]}>
      <Text style={[styles.buttonText, large && styles.buttonTextLarge, { color: text }]}>{label}</Text>
    </Pressable>
  );
}

/** Small round action for rows (remove, move). */
export function IconButton({
  label,
  icon,
  hint,
  onPress,
  style,
}: {
  label?: string;
  icon?: { ios: SymbolViewProps['name'] & string; md: string };
  hint: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, style, pressed && styles.buttonPressed]}>
      {icon ? <Icon {...icon} color={Palette.text} size={18} /> : <Text style={styles.iconText}>{label}</Text>}
    </Pressable>
  );
}

/** On/off switch. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => onChange(!value)}
      style={[styles.toggle, value && styles.toggleOn]}>
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

/** Text input. */
export function Field(props: TextInputProps & { large?: boolean }) {
  const { large, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={Palette.dim}
      {...rest}
      style={[styles.field, large && { fontSize: 20, fontFamily: DisplayFont.bold }, style]}
    />
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
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && styles.segmentOn]}>
            <Text style={[styles.chipText, on && { color: Palette.bg }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Number picker; the value reads as a HUD number. */
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  unit = '',
  format,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  /** Shows the value another way (e.g. an hour as "9 AM"); replaces value and unit. */
  format?: (value: number) => string;
}) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  const button = (symbol: string, delta: number, name: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name} ${label}`}
      onPress={() => set(value + delta)}
      style={({ pressed }) => [styles.stepperButton, pressed && styles.buttonPressed]}>
      <Text style={styles.iconText}>{symbol}</Text>
    </Pressable>
  );
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        {button('−', -step, 'Decrease')}
        <PixelText size={PixelSize.medium} color={Psx.hud} center style={{ minWidth: 72 }}>
          {format ? format(value) : `${value}${unit}`}
        </PixelText>
        {button('+', step, 'Increase')}
      </View>
    </View>
  );
}

// ---- Data ---------------------------------------------------------------------------

export function Tag({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <View style={[styles.tag, accent && styles.tagAccent]}>
      <Text style={[styles.tagText, accent && { color: Palette.accent }]}>{label}</Text>
    </View>
  );
}

/** HUD counter: a pixel number over a plain label, with an optional icon. `inline` puts the label after the number. */
export function Stat({
  value,
  label,
  color = Psx.hud,
  icon,
  inline,
}: {
  value: string;
  label: string;
  color?: string;
  icon?: { ios: SymbolViewProps['name'] & string; md: string };
  inline?: boolean;
}) {
  if (inline) {
    return (
      <View style={styles.statInline} accessibilityLabel={`${value} ${label}`}>
        <PixelText size={PixelSize.medium} color={color}>
          {value}
        </PixelText>
        <Text style={styles.statInlineLabel}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={styles.stat}>
      <PixelText size={PixelSize.medium} color={color}>
        {value}
      </PixelText>
      <View style={styles.statLabelRow}>
        {icon && <Icon {...icon} size={13} />}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

/** Segmented bar, like a charge meter. */
export function Meter({ value, max, color = Palette.accent }: { value: number; max: number; color?: string }) {
  return (
    <View style={styles.meter} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }}>
      {Array.from({ length: Math.max(1, max) }, (_, i) => (
        <View key={i} style={[styles.meterSegment, { backgroundColor: i < value ? color : Palette.tonal }]} />
      ))}
    </View>
  );
}

/**
 * A PS2-era HUD stat: icon, name and percent over a chunky bar with a dark rim and a
 * glossy fill (the player card's Strength / Stamina / Discipline / Reputation).
 */
export function StatBar({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  /** 0-100. */
  value: number;
  color: string;
  icon: { ios: SymbolViewProps['name'] & string; md: string };
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.statBar} accessibilityRole="progressbar" accessibilityLabel={`${label} ${v}%`} accessibilityValue={{ min: 0, max: 100, now: v }}>
      <View style={styles.statBarHead}>
        <Icon {...icon} color={color} size={13} />
        <Text style={styles.statBarLabel}>
          {label} <Text style={{ color: Palette.text }}>{v}%</Text>
        </Text>
      </View>
      <View style={styles.statBarTrack}>
        <View style={[styles.statBarFill, { width: `${v}%`, backgroundColor: color }, gradient(`linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.25) 100%)`)]} />
      </View>
    </View>
  );
}

const MEME_STROKE = [
  [-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2],
] as const;

/** Meme caption: bold uppercase white with a thick black outline. One per screen, for a laugh. */
export function MemeText({ children, size = 22 }: { children: string; size?: number }) {
  const text = [styles.memeText, { fontSize: size, lineHeight: size * 1.15 }];
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={children}>
      {MEME_STROKE.map(([x, y]) => (
        <Text key={`${x},${y}`} style={[text, styles.memeStroke, { left: x, top: y }]} importantForAccessibility="no">
          {children}
        </Text>
      ))}
      <Text style={text}>{children}</Text>
    </View>
  );
}

/** Your profile picture in an orange ring, or a person icon without one. */
export function Avatar({ uri, size = 40, onPress, label = 'Profile' }: { uri?: string; size?: number; onPress?: () => void; label?: string }) {
  const face = uri ? (
    <ExpoImage source={{ uri }} style={{ width: size - 4, height: size - 4, borderRadius: size / 2 }} contentFit="cover" />
  ) : (
    <Icon ios="person.fill" md="person" color={Palette.muted} size={size * 0.5} />
  );
  const ring = [styles.avatar, { width: size, height: size, borderRadius: size / 2 }];
  if (!onPress) return <View style={ring}>{face}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => [ring, pressed && styles.buttonPressed]}>
      {face}
    </Pressable>
  );
}

/** On/off blink, the "PRESS START" way. Use once per screen at most. */
export function Blink({ children, period = 600 }: { children: ReactNode; period?: number }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), period);
    return () => clearInterval(id);
  }, [period]);
  return <View style={{ opacity: on ? 1 : 0.2 }}>{children}</View>;
}

// ---- Styles -------------------------------------------------------------------------

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.bg },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three, gap: Spacing.three },
  fill: { width: '100%', height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },

  pixel: { fontFamily: PixelFont, textShadowColor: '#000', textShadowRadius: 0 },
  title: { fontFamily: DisplayFont.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6 },
  heading: { fontFamily: DisplayFont.bold, fontSize: 19, lineHeight: 24, color: Palette.text, letterSpacing: -0.2 },
  label: { fontFamily: DisplayFont.semibold, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' },
  body: { color: Palette.text, fontSize: 16, lineHeight: 23 },
  muted: { color: Palette.muted },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,107,43,0.16)', alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: Palette.accent, fontFamily: DisplayFont.bold, fontSize: 13 },

  glow: { position: 'absolute', top: 0, left: 0, right: 0 },
  card: {
    backgroundColor: Palette.panel,
    ...gradient('linear-gradient(180deg, #1c1c1a 0%, #141413 100%)'),
    boxShadow: '0 10px 24px rgba(0,0,0,0.45)',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Psx.edge,
    borderTopColor: Psx.edgeTop,
    padding: Spacing.three,
    gap: Spacing.two + 2,
  },
  hudCard: {
    ...gradient('linear-gradient(155deg, #2b1b12 0%, #1b1714 42%, #141413 100%)'),
    borderColor: 'rgba(255,107,43,0.18)',
    borderTopColor: 'rgba(255,107,43,0.38)',
    boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 28px rgba(255,107,43,0.10)',
    padding: Spacing.three + 2,
    gap: Spacing.three,
  },
  divider: { height: 1, backgroundColor: Psx.edgeTop, marginHorizontal: -2 },
  cardPressed: { backgroundColor: Palette.pressed, transform: [{ scale: 0.99 }] },
  well: { backgroundColor: Psx.well, ...gradient('none'), boxShadow: 'none', borderTopColor: Psx.edge },
  stage: { backgroundColor: Palette.stage, borderRadius: Radius.card, overflow: 'hidden', borderWidth: 1, borderColor: Psx.edge },
  thumb: { aspectRatio: 1, borderRadius: Radius.button - 2 },

  button: {
    minHeight: 50,
    borderRadius: Radius.button,
    borderBottomWidth: 4,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLarge: { minHeight: 62, borderBottomWidth: 5 },
  buttonPressed: { transform: [{ translateY: 3 }], borderBottomWidth: 1, marginBottom: 3 },
  buttonText: { fontFamily: DisplayFont.bold, fontSize: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
  buttonTextLarge: { fontSize: 19 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.tonal,
    borderBottomWidth: 3,
    borderBottomColor: ButtonEdge[Palette.tonal],
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: Palette.text, fontFamily: DisplayFont.bold, fontSize: 18 },

  toggle: { width: 52, height: 32, borderRadius: 16, backgroundColor: Palette.track, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: Palette.accent },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: Palette.text },
  knobOn: { alignSelf: 'flex-end', backgroundColor: '#fff' },

  field: {
    color: Palette.text,
    fontSize: 16,
    backgroundColor: Psx.well,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Psx.edgeTop,
    paddingHorizontal: 16,
    minHeight: 50,
  },

  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: Radius.pill, backgroundColor: Palette.tonal, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: Palette.accent },
  chipText: { color: Palette.muted, fontFamily: DisplayFont.semibold, fontSize: 14 },
  chipTextOn: { color: '#000' },

  segmented: { flexDirection: 'row', backgroundColor: Palette.tonal, borderRadius: Radius.pill, padding: 3 },
  segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill },
  segmentOn: { backgroundColor: Palette.text },

  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  stepperLabel: { color: Palette.text, fontSize: 15, flex: 1 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepperButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Palette.tonal,
    borderBottomWidth: 3,
    borderBottomColor: ButtonEdge[Palette.tonal],
    alignItems: 'center',
    justifyContent: 'center',
  },

  tag: { backgroundColor: Palette.tonal, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  tagAccent: { backgroundColor: 'rgba(255,107,43,0.16)' },
  tagText: { color: Palette.muted, fontFamily: DisplayFont.semibold, fontSize: 12 },

  stat: { flex: 1, gap: 8 },
  statLabel: { color: Palette.muted, fontSize: 12, fontWeight: '600' },
  statInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statInlineLabel: { color: Palette.muted, fontFamily: DisplayFont.semibold, fontSize: 14 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.tonal,
    borderWidth: 2,
    borderColor: Palette.accent,
    overflow: 'hidden',
  },
  statBar: { flex: 1, minWidth: 130, gap: 5 },
  statBarHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statBarLabel: { color: Palette.muted, fontFamily: DisplayFont.semibold, fontSize: 12 },
  statBarTrack: {
    height: 12,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: '#000',
    backgroundColor: '#26261f',
    overflow: 'hidden',
  },
  statBarFill: { height: '100%', borderRadius: 1 },
  memeText: {
    color: '#ffffff',
    fontFamily: DisplayFont.bold,
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  memeStroke: { position: 'absolute', width: '100%', color: '#000' },
  meter: { flexDirection: 'row', gap: 3, height: 10 },
  meterSegment: { flex: 1, borderRadius: 2 },
});
