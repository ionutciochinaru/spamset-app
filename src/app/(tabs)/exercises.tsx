import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { thumbnails } from '@/animation/thumbnails';
import { Body, Card, Chips, Heading, Label, Row, Tag, Title } from '@/components/ui';
import { MaxContentWidth, Palette, Radius, Spacing } from '@/constants/theme';
import {
  canDo,
  CATEGORY_LABELS,
  EQUIPMENT_LABELS,
  EXERCISES,
  exerciseCategory,
  isLoaded,
  isTimed,
  type Category,
  type Exercise,
} from '@/core/exercises';
import { initialPrescription } from '@/core/progression';
import { formatLoad, ownedEquipment, useApp } from '@/store/app-store';

const CATEGORIES: Category[] = ['kettlebell', 'bodyweight', 'core', 'gear', 'stretch'];
type Filter = Category | 'all';

export default function Exercises() {
  const insets = useSafeAreaInsets();
  const settings = useApp((s) => s.settings);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [mineOnly, setMineOnly] = useState(true);
  const owned = useMemo(() => ownedEquipment(settings), [settings]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (e: Exercise) =>
      (!mineOnly || canDo(e, owned)) &&
      (filter === 'all' || exerciseCategory(e) === filter) &&
      (!q || e.name.toLowerCase().includes(q) || [...e.primary, ...e.support].some((m) => m.toLowerCase().includes(q)));
    return CATEGORIES.map((c) => ({ category: c, data: EXERCISES.filter((e) => exerciseCategory(e) === c && matches(e)) })).filter(
      (s) => s.data.length,
    );
  }, [query, filter, mineOnly, owned]);
  const hidden = EXERCISES.filter((e) => !canDo(e, owned)).length;

  return (
    <SectionList
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + 96 }}
      sections={sections}
      keyExtractor={(e) => e.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      stickySectionHeadersEnabled={false}
      initialNumToRender={8}
      ListHeaderComponent={
        <View style={[styles.column, { gap: Spacing.three, paddingBottom: Spacing.two }]}>
          <Title>Exercises</Title>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises or muscles"
            placeholderTextColor={Palette.dim}
            style={styles.search}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search exercises"
          />
          <Chips<Filter>
            options={[{ value: 'all', label: 'All' }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))]}
            selected={filter}
            onToggle={setFilter}
          />
          {hidden > 0 && (
            <Row style={{ justifyContent: 'space-between' }}>
              <Body muted style={{ fontSize: 14, flex: 1 }}>
                Only what my equipment allows ({hidden} hidden)
              </Body>
              <Switch
                value={mineOnly}
                onValueChange={setMineOnly}
                trackColor={{ true: Palette.accent, false: Palette.track }}
                accessibilityLabel="Only show exercises my equipment allows"
              />
            </Row>
          )}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={[styles.column, { paddingTop: Spacing.three, paddingBottom: Spacing.two }]}>
          <Label>
            {CATEGORY_LABELS[section.category]} · {section.data.length}
          </Label>
        </View>
      )}
      renderItem={({ item }) => (
        <View style={[styles.column, { paddingBottom: Spacing.two }]}>
          <ExerciseRow exercise={item} owned={canDo(item, owned)} />
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.column}>
          <Body muted>No exercises match. Clear the search or pick another filter.</Body>
        </View>
      }
    />
  );
}

function ExerciseRow({ exercise: e, owned }: { exercise: Exercise; owned: boolean }) {
  const settings = useApp((s) => s.settings);
  const prescription = useApp((s) => s.prescriptions[e.id]);
  const load = isLoaded(e) ? (prescription ?? initialPrescription(e.id, settings.bells)).load : 0;
  return (
    <Card onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: e.id } })} style={styles.card}>
      <Image source={thumbnails[e.animation]} style={[styles.thumb, !owned && { opacity: 0.4 }]} contentFit="cover" />
      <View style={styles.text}>
        <Heading style={{ fontSize: 18 }}>{e.name}</Heading>
        <Body muted style={{ fontSize: 14 }}>
          {e.primary.join(' · ')}
        </Body>
        <View style={styles.tags}>
          {load > 0 && <Tag label={formatLoad(load, settings.units)} accent />}
          {e.equipment !== 'none' && e.equipment !== 'kettlebell' && <Tag label={EQUIPMENT_LABELS[e.equipment]} accent={owned} />}
          {isTimed(e) && <Tag label="timed" />}
          {e.unilateral && <Tag label="per side" />}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.bg },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three },
  search: {
    color: Palette.text,
    fontSize: 16,
    backgroundColor: Palette.panel,
    borderRadius: Radius.button,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumb: { width: 88, height: 88, borderRadius: Radius.button, backgroundColor: Palette.bg },
  text: { flex: 1, gap: 4 },
  tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
});
