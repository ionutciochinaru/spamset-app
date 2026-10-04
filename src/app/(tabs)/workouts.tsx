import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { Body, Button, Chips, Label, Screen, Title } from '@/components/ui';
import { WorkoutCard } from '@/components/workout-card';
import { FOCUS_LABELS, FOCUS_ORDER, PRESET_WORKOUTS, workoutEquipment, workoutFocus, type Focus } from '@/core/workouts';
import { ownedEquipment, useApp } from '@/store/app-store';

type Filter = Focus | 'all';

export default function Workouts() {
  const custom = useApp((s) => s.customWorkouts);
  const settings = useApp((s) => s.settings);
  const owned = useMemo(() => ownedEquipment(settings), [settings]);
  const [filter, setFilter] = useState<Filter>('all');

  const fits = (w: (typeof PRESET_WORKOUTS)[number]) => workoutEquipment(w).every((e) => owned.includes(e));
  const shown = PRESET_WORKOUTS.filter((w) => filter === 'all' || workoutFocus(w) === filter);
  const ready = shown.filter(fits);
  const needsGear = shown.filter((w) => !fits(w));
  const focuses = FOCUS_ORDER.filter((f) => PRESET_WORKOUTS.some((w) => workoutFocus(w) === f));

  return (
    <Screen>
      <Title>Workouts</Title>
      <Body muted>Kettlebell, bodyweight, core and mobility sessions. Loads and reps come from your progression.</Body>
      <Button label="+ Create workout" kind="tonal" onPress={() => router.push('/builder')} />
      <Chips<Filter>
        options={[{ value: 'all', label: 'All' }, ...focuses.map((f) => ({ value: f, label: FOCUS_LABELS[f] }))]}
        selected={filter}
        onToggle={setFilter}
      />
      {custom.length > 0 && filter === 'all' && <Label>Your workouts</Label>}
      {filter === 'all' && custom.map((w) => <WorkoutCard key={w.id} workout={w} />)}
      {focuses.map((focus) => {
        const matching = ready.filter((w) => workoutFocus(w) === focus);
        if (!matching.length) return null;
        return [
          <Label key={`${focus}-label`}>{FOCUS_LABELS[focus]}</Label>,
          ...matching.map((w) => <WorkoutCard key={w.id} workout={w} />),
        ];
      })}
      {needsGear.length > 0 && <Label>Needs more equipment</Label>}
      {needsGear.map((w) => (
        <WorkoutCard key={w.id} workout={w} />
      ))}
    </Screen>
  );
}
