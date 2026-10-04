import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { thumbnails } from '@/animation/thumbnails';
import { Palette, Radius } from '@/constants/theme';
import { canDo, CATEGORY_LABELS, EXERCISES, exerciseCategory, getExercise, type Category } from '@/core/exercises';
import { ownedEquipment, useApp } from '@/store/app-store';

import { Chips } from './ui';

const CATEGORIES: Category[] = ['kettlebell', 'bodyweight', 'core', 'gear', 'stretch'];

/**
 * Category chips over a horizontal strip of exercise thumbnails; the selected one is outlined
 * in orange. Only exercises your equipment allows are offered (plus the current choice).
 */
export function ExercisePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const settings = useApp((s) => s.settings);
  const owned = useMemo(() => ownedEquipment(settings), [settings]);
  const [category, setCategory] = useState<Category>(() => exerciseCategory(getExercise(value)));
  const items = useMemo(
    () => EXERCISES.filter((e) => exerciseCategory(e) === category && (canDo(e, owned) || e.id === value)),
    [category, owned, value],
  );
  const available = CATEGORIES.filter((c) => EXERCISES.some((e) => exerciseCategory(e) === c && canDo(e, owned)));

  return (
    <View style={{ gap: 8 }}>
      <Chips
        options={available.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
        selected={category}
        onToggle={setCategory}
      />
      <FlatList
        horizontal
        data={items}
        keyExtractor={(e) => e.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        initialNumToRender={5}
        renderItem={({ item: e }) => {
          const selected = e.id === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={e.name}
              onPress={() => onChange(e.id)}
              style={[styles.item, selected && styles.selected]}>
              <Image source={thumbnails[e.animation]} style={styles.thumb} contentFit="cover" />
              <Text style={[styles.name, selected && styles.selectedName]} numberOfLines={2}>
                {e.name}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  item: { width: 88, borderRadius: Radius.button, padding: 4, borderWidth: 2, borderColor: 'transparent', gap: 4 },
  selected: { borderColor: Palette.accent },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: Radius.button - 4, backgroundColor: Palette.bg },
  name: { color: Palette.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  selectedName: { color: Palette.text },
});
