import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EQUIPMENT_LABELS, getExercise } from '@/core/exercises';
import { compileWorkout, estimateSeconds } from '@/core/timeline';
import { BLOCK_LABELS, workoutEquipment, workoutExercises, type Workout } from '@/core/workouts';
import { ownedEquipment, useApp } from '@/store/app-store';

import { Body, Card, Heading, Row, Tag, Thumb } from './ui';

export function workoutMinutes(workout: Workout, plan = useApp.getState().loadPlan()): number {
  return Math.max(1, Math.round(estimateSeconds(compileWorkout(workout, plan)) / 60));
}

export function WorkoutCard({ workout }: { workout: Workout }) {
  const kinds = [...new Set(workout.blocks.map((b) => BLOCK_LABELS[b.kind]))];
  const exercises = workoutExercises(workout);
  const owned = ownedEquipment(useApp((s) => s.settings));
  const missing = workoutEquipment(workout).filter((e) => !owned.includes(e));
  return (
    <Card onPress={() => router.push({ pathname: '/workout/[id]', params: { id: workout.id } })}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Heading style={{ flex: 1 }}>{workout.name}</Heading>
        <Body muted>~{workoutMinutes(workout)} min</Body>
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        {kinds.map((k) => (
          <Tag key={k} label={k} accent />
        ))}
        {missing.map((e) => (
          <Tag key={e} label={`Needs ${EQUIPMENT_LABELS[e].toLowerCase()}`} />
        ))}
      </Row>
      <Body muted style={{ fontSize: 14 }}>
        {workout.summary}
      </Body>
      <View style={styles.thumbs}>
        {exercises.slice(0, 5).map((id) => (
          <Thumb key={id} clip={getExercise(id).animation} style={styles.thumb} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  thumbs: { flexDirection: 'row', gap: 6 },
  thumb: { flex: 1, maxWidth: 110 },
});
