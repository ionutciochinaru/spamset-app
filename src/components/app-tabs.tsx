/**
 * Tab bar for every platform, drawn with the visual library rather than the system tab bar, so
 * iOS, Android and web look the same: a floating rounded bar where inactive tabs are icons and
 * the active one grows into an orange pill with its label.
 */
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DisplayFont, Palette, Psx } from '@/constants/theme';

import { TABS } from './tabs';

/** The floating bar's height (padding, 48 pt buttons, border) and its gap from the bottom edge. */
export const TAB_DOCK_HEIGHT = 66;
export const tabDockBottom = (insetBottom: number) => Math.max(insetBottom, 12);

export default function AppTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList style={[styles.dock, { bottom: tabDockBottom(insets.bottom) }]}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.name === 'index' ? '/' : `/${tab.name}`} asChild>
            <TabButton tab={tab}>{tab.label}</TabButton>
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, tab, ...props }: TabTriggerSlotProps & { tab: (typeof TABS)[number] }) {
  return (
    // Fixed shares (1 per icon, 2 for the active pill), not content sizing, so the bar never overflows.
    <View style={isFocused ? styles.slotActive : styles.slot}>
      <Pressable
        {...props}
        accessibilityRole="tab"
        accessibilityLabel={String(children)}
        accessibilityState={{ selected: isFocused }}
        style={({ pressed }) => [styles.button, isFocused && styles.pill, pressed && { transform: [{ scale: 0.96 }] }]}>
        <SymbolView name={{ ios: tab.sf, android: tab.md, web: tab.web }} tintColor={isFocused ? '#000' : Palette.muted} size={22} />
        {isFocused && (
          <Text style={styles.label} numberOfLines={1}>
            {children}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
    borderRadius: 26,
    backgroundColor: Palette.panel,
    borderWidth: 1,
    borderColor: Psx.edge,
    borderTopColor: Psx.edgeTop,
    boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
  },
  slot: { flex: 1 },
  slotActive: { flex: 2 },
  button: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  pill: { backgroundColor: Palette.accent, paddingHorizontal: 12 },
  label: { color: '#000', fontFamily: DisplayFont.bold, fontSize: 14, flexShrink: 1 },
});
