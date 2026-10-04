import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { thumbnails } from '@/animation/thumbnails';
import { BellPicker } from '@/components/bell-picker';
import { Body, Button, Card, Heading, Label, Row, Screen, Tag, Title } from '@/components/ui';
import { workoutMinutes } from '@/components/workout-card';
import { Palette, Radius } from '@/constants/theme';
import { getExercise, isLoaded } from '@/core/exercises';
import { formatTarget } from '@/core/timeline';
import { BLOCK_LABELS, getWorkout, workoutExercises, type Block } from '@/core/workouts';
import { useApp } from '@/store/app-store';

function describe(block: Block): string {
  switch (block.kind) {
    case 'sets':
      return `${block.sets} sets of ${block.repRange[0]}–${block.repRange[1]} reps · ${block.rest} s rest`;
    case 'circuit':
      return `${block.rounds} rounds · ${block.restBetweenStations} s between stations · ${block.restBetweenRounds} s between rounds`;
    case 'emom':
      return `${block.minutes} minutes, a new set at the top of every minute`;
    case 'amrap':
      return `As many rounds as possible in ${block.minutes} minutes`;
    case 'intervals':
      return `${block.rounds} × ${block.work} s work / ${block.rest} s rest`;
    case 'ladder':
      return `${block.from} → ${block.to} reps, step ${Math.abs(block.step)} · ${block.rest} s rest`;
  }
}

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const custom = useApp((s) => s.customWorkouts);
  const prescriptions = useApp((s) => s.prescriptions);
  const loadPlan = useApp((s) => s.loadPlan);
  const workout = getWorkout(id, custom);
  if (!workout) return null;
  const plan = loadPlan();
  void prescriptions; // Re-render when progression or bells change.
  const loaded = workoutExercises(workout).filter((e) => isLoaded(getExercise(e)));

  return (
    <Screen>
      <View style={{ height: 40 }} />
      <Title>{workout.name}</Title>
      <Body muted>{workout.summary}</Body>
      <Tag label={`About ${workoutMinutes(workout, plan)} minutes`} />

      {workout.blocks.map((block, index) => {
        const stations = 'stations' in block ? block.stations : [];
        return (
          <Card key={index}>
            <Label>{BLOCK_LABELS[block.kind]}</Label>
            <Body muted style={{ fontSize: 14 }}>
              {describe(block)}
            </Body>
            {'exercise' in block && (
              <ExerciseLine
                id={block.exercise}
                detail={block.kind === 'sets' ? `${plan.reps(block.exercise, block.repRange)} reps next` : undefined}
              />
            )}
            {stations.map((s, i) => (
              <ExerciseLine key={i} id={s.exercise} detail={formatTarget(s.target, s.exercise)} />
            ))}
          </Card>
        );
      })}

      {loaded.length > 0 && (
        <Card>
          <Heading>Bells</Heading>
          <Body muted style={{ fontSize: 14 }}>
            Progression picks these automatically. Change one here if you want a different bell today.
          </Body>
          {loaded.map((exercise) => (
            <View key={exercise} style={{ gap: 6 }}>
              <Body>{getExercise(exercise).name}</Body>
              <BellPicker exercise={exercise} load={plan.load(exercise)} />
            </View>
          ))}
        </Card>
      )}

      <Button label="Start workout" kind="go" large onPress={() => router.push({ pathname: '/session', params: { workout: workout.id } })} />
      {custom.some((w) => w.id === workout.id) && (
        <Button label="Edit workout" kind="tonal" onPress={() => router.push({ pathname: '/builder', params: { id: workout.id } })} />
      )}
    </Screen>
  );
}

function ExerciseLine({ id, detail }: { id: string; detail?: string }) {
  const exercise = getExercise(id);
  return (
    <Row style={styles.line}>
      <Image source={thumbnails[exercise.animation]} style={styles.thumb} contentFit="cover" />
      <Body style={{ flex: 1 }} >{exercise.name}</Body>
      {detail && <Body muted>{detail}</Body>}
    </Row>
  );
}

const styles = StyleSheet.create({
  line: { gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: Radius.button - 6, backgroundColor: Palette.bg },
});
