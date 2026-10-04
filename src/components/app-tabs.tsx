/**
 * Tab bar for every platform, drawn with the visual library (a PSX menu strip) rather than
 * the system tab bar, so iOS, Android and web look the same.
 */
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DisplayFont, Palette, Psx } from '@/constants/theme';

import { TABS } from './tabs';

export default function AppTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
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
  const color = isFocused ? Palette.accent : Palette.muted;
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityState={{ selected: isFocused }} style={styles.button}>
      {({ pressed }) => (
        <>
          <View style={[styles.icon, isFocused && styles.iconActive, pressed && { transform: [{ translateY: 1 }] }]}>
            <SymbolView name={{ ios: tab.sf, android: tab.md, web: tab.web }} tintColor={color} size={22} />
          </View>
          <Text style={[styles.label, { color: isFocused ? Palette.text : Palette.muted }]}>{children}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: Palette.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Psx.edgeTop,
    paddingTop: 8,
  },
  button: { flex: 1, maxWidth: 120, minHeight: 52, alignItems: 'center', gap: 5 },
  // A fixed radius: Android draws a 999 radius on this small pill as square corners.
  icon: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 16 },
  iconActive: { backgroundColor: Palette.tonal },
  label: { fontFamily: DisplayFont.semibold, fontSize: 11 },
});
