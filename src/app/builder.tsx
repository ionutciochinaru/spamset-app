import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ExercisePicker } from '@/components/exercise-picker';
import { Body, Button, Card, Field, Heading, IconButton, Label, Row, Screen, Stepper, Title, Well } from '@/components/ui';
import { Palette, Spacing } from '@/constants/theme';
import { BLOCK_HELP, BLOCK_KINDS, defaultBlock, describeWorkout, emptyWorkout, moveItem, normalizeBlock, retarget, validateWorkout } from '@/core/builder';
import { getExercise, isTimed } from '@/core/exercises';
import { compileWorkout, estimateSeconds } from '@/core/timeline';
import { BLOCK_LABELS, type Block, type Station, type Workout } from '@/core/workouts';
import { useApp } from '@/store/app-store';

export default function Builder() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const saveWorkout = useApp((s) => s.saveCustomWorkout);
  const deleteWorkout = useApp((s) => s.deleteCustomWorkout);
  const loadPlan = useApp((s) => s.loadPlan);
  const [workout, setWorkout] = useState<Workout>(
    () => useApp.getState().customWorkouts.find((w) => w.id === id) ?? emptyWorkout(),
  );
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const editing = !!id;

  const setBlocks = (blocks: Block[]) => setWorkout((w) => ({ ...w, blocks }));
  const updateBlock = (index: number, block: Block) =>
    setBlocks(workout.blocks.map((b, i) => (i === index ? normalizeBlock(block) : b)));

  const minutes = workout.blocks.length
    ? Math.max(1, Math.round(estimateSeconds(compileWorkout(workout, loadPlan())) / 60))
    : 0;

  const save = () => {
    const problems = validateWorkout(workout);
    setErrors(problems);
    if (problems.length) return;
    const final = { ...workout, name: workout.name.trim(), summary: describeWorkout(workout) };
    saveWorkout(final);
    router.replace({ pathname: '/workout/[id]', params: { id: final.id } });
  };

  return (
    <Screen>
      <View style={{ height: 40 }} />
      <Title>{editing ? 'Edit workout' : 'New workout'}</Title>
      <Field
        large
        value={workout.name}
        onChangeText={(name) => setWorkout((w) => ({ ...w, name }))}
        placeholder="Workout name"
        maxLength={40}
      />
      {minutes > 0 && <Body muted>About {minutes} minutes</Body>}

      {workout.blocks.map((block, index) => (
        <Card key={index}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>
              {index + 1}. {BLOCK_LABELS[block.kind]}
            </Label>
            <Row style={{ gap: 4 }}>
              <IconButton label="↑" hint="Move block up" onPress={() => setBlocks(moveItem(workout.blocks, index, index - 1))} />
              <IconButton label="↓" hint="Move block down" onPress={() => setBlocks(moveItem(workout.blocks, index, index + 1))} />
              <IconButton label="X" hint="Remove block" onPress={() => setBlocks(workout.blocks.filter((_, i) => i !== index))} />
            </Row>
          </Row>
          <BlockEditor block={block} onChange={(b) => updateBlock(index, b)} />
        </Card>
      ))}

      {adding ? (
        <Card>
          <Label>Add a block</Label>
          {BLOCK_KINDS.map((kind) => (
            <Card
              key={kind}
              style={styles.kind}
              onPress={() => {
                const last = workout.blocks.at(-1);
                const exercise = last ? ('exercise' in last ? last.exercise : last.stations[0]?.exercise) : undefined;
                setBlocks([...workout.blocks, defaultBlock(kind, exercise)]);
                setAdding(false);
              }}>
              <Heading style={{ fontSize: 16 }}>{BLOCK_LABELS[kind]}</Heading>
              <Body muted style={{ fontSize: 13 }}>
                {BLOCK_HELP[kind]}
              </Body>
            </Card>
          ))}
          <Button label="Cancel" kind="ghost" onPress={() => setAdding(false)} />
        </Card>
      ) : (
        <Button label="+ Add block" kind="tonal" onPress={() => setAdding(true)} />
      )}

      {errors.map((e) => (
        <Body key={e} style={{ color: Palette.danger }}>
          {e}
        </Body>
      ))}
      <Button label="Save workout" kind="go" large onPress={save} />
      {editing && (
        <Button
          label="Delete workout"
          kind="ghost"
          onPress={() => {
            deleteWorkout(workout.id);
            router.dismissTo('/workouts');
          }}
        />
      )}
    </Screen>
  );
}


function BlockEditor({ block, onChange }: { block: Block; onChange: (block: Block) => void }) {
  switch (block.kind) {
    case 'sets': {
      // Holds (planks, timed moves) use a range in seconds.
      const timed = isTimed(getExercise(block.exercise));
      const unit = timed ? ' s' : '';
      return (
        <>
          <ExercisePicker
            value={block.exercise}
            onChange={(exercise) =>
              onChange(
                isTimed(getExercise(exercise)) === timed
                  ? { ...block, exercise }
                  : { ...block, exercise, repRange: isTimed(getExercise(exercise)) ? [20, 45] : [8, 12] },
              )
            }
          />
          <Stepper label="Sets" value={block.sets} min={1} max={20} onChange={(sets) => onChange({ ...block, sets })} />
          <Stepper
            label={timed ? 'Shortest hold' : 'Min reps'}
            unit={unit}
            value={block.repRange[0]}
            step={timed ? 5 : 1}
            min={timed ? 5 : 1}
            max={block.repRange[1]}
            onChange={(min) => onChange({ ...block, repRange: [min, block.repRange[1]] })}
          />
          <Stepper
            label={timed ? 'Longest hold' : 'Max reps'}
            unit={unit}
            value={block.repRange[1]}
            step={timed ? 5 : 1}
            min={block.repRange[0]}
            max={timed ? 300 : 50}
            onChange={(max) => onChange({ ...block, repRange: [block.repRange[0], max] })}
          />
          <Stepper label="Rest" unit=" s" value={block.rest} step={15} min={0} max={600} onChange={(rest) => onChange({ ...block, rest })} />
        </>
      );
    }
    case 'ladder':
      return (
        <>
          <ExercisePicker value={block.exercise} onChange={(exercise) => onChange({ ...block, exercise })} />
          <Stepper label="First rung" value={block.from} min={1} max={50} onChange={(from) => onChange({ ...block, from })} />
          <Stepper label="Last rung" value={block.to} min={1} max={50} onChange={(to) => onChange({ ...block, to })} />
          <Stepper label="Step" value={Math.abs(block.step)} min={1} max={10} onChange={(step) => onChange({ ...block, step })} />
          <Stepper label="Rest" unit=" s" value={block.rest} step={15} min={0} max={600} onChange={(rest) => onChange({ ...block, rest })} />
        </>
      );
    case 'circuit':
      return (
        <>
          <Stepper label="Rounds" value={block.rounds} min={1} max={20} onChange={(rounds) => onChange({ ...block, rounds })} />
          <Stepper
            label="Rest between stations"
            unit=" s"
            value={block.restBetweenStations}
            step={5}
            max={300}
            onChange={(restBetweenStations) => onChange({ ...block, restBetweenStations })}
          />
          <Stepper
            label="Rest between rounds"
            unit=" s"
            value={block.restBetweenRounds}
            step={15}
            max={600}
            onChange={(restBetweenRounds) => onChange({ ...block, restBetweenRounds })}
          />
          <Stations stations={block.stations} onChange={(stations) => onChange({ ...block, stations })} />
        </>
      );
    case 'emom':
    case 'amrap':
      return (
        <>
          <Stepper label="Minutes" value={block.minutes} min={1} max={60} onChange={(minutes) => onChange({ ...block, minutes })} />
          <Stations stations={block.stations} onChange={(stations) => onChange({ ...block, stations })} />
        </>
      );
    case 'intervals':
      return (
        <>
          <Stepper label="Work" unit=" s" value={block.work} step={5} min={5} max={300} onChange={(work) => onChange({ ...block, work })} />
          <Stepper label="Rest" unit=" s" value={block.rest} step={5} min={0} max={300} onChange={(rest) => onChange({ ...block, rest })} />
          <Stepper label="Rounds" value={block.rounds} min={1} max={40} onChange={(rounds) => onChange({ ...block, rounds })} />
          <Stations stations={block.stations} timed onChange={(stations) => onChange({ ...block, stations })} />
        </>
      );
  }
}

function Stations({ stations, onChange, timed }: { stations: Station[]; onChange: (stations: Station[]) => void; timed?: boolean }) {
  const update = (i: number, station: Station) => onChange(stations.map((s, k) => (k === i ? station : s)));
  return (
    <View style={{ gap: Spacing.two }}>
      {stations.map((station, i) => (
        <Well key={i} style={styles.station}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Heading style={{ flex: 1, fontSize: 16 }}>
              {i + 1}. {getExercise(station.exercise).name}
            </Heading>
            <IconButton label="X" hint="Remove station" onPress={() => onChange(stations.filter((_, k) => k !== i))} />
          </Row>
          <ExercisePicker value={station.exercise} onChange={(exercise) => update(i, timed ? { ...station, exercise } : retarget(station, exercise))} />
          {!timed && 'reps' in station.target && (
            <Stepper
              label={getExercise(station.exercise).unilateral ? 'Reps per side' : 'Reps'}
              value={station.target.reps}
              min={1}
              max={100}
              onChange={(reps) => update(i, { ...station, target: { reps } })}
            />
          )}
          {!timed && 'seconds' in station.target && (
            <Stepper
              label="Time"
              unit=" s"
              value={station.target.seconds}
              step={5}
              min={5}
              max={300}
              onChange={(seconds) => update(i, { ...station, target: { seconds } })}
            />
          )}
        </Well>
      ))}
      <Button
        label="+ Add station"
        kind="ghost"
        onPress={() => {
          const last = stations.at(-1);
          onChange([...stations, { exercise: last?.exercise ?? 'kb-swing', target: last?.target ?? { reps: 10 } }]);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  kind: { padding: 12, gap: 4 },
  station: { padding: 10, gap: 8 },
});
