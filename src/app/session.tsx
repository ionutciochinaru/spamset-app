import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FigureViewer } from '@/components/figure-viewer';
import { Body, Button, Card, Heading, Label, Row, Segmented, Title } from '@/components/ui';
import { MaxContentWidth, Palette, PixelFont, Psx, Radius, Spacing } from '@/constants/theme';
import { getExercise, isStretch } from '@/core/exercises';
import type { Effort } from '@/core/progression';
import { currentStep, elapsed, remaining, runnerReducer, startRunner, type RunnerState } from '@/core/runner';
import type { SessionLog } from '@/core/session';
import { compileWorkout, formatTarget, type Step } from '@/core/timeline';
import { getWorkout } from '@/core/workouts';
import { joinDetail, loadLabel, useApp } from '@/store/app-store';

function clock(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function haptic(kind: 'tick' | 'step') {
  if (Platform.OS === 'web' || !useApp.getState().settings.haptics) return;
  if (kind === 'tick') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export default function Session() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { workout: workoutId } = useLocalSearchParams<{ workout: string }>();
  const custom = useApp((s) => s.customWorkouts);
  const workout = getWorkout(workoutId, custom)!;
  const [startedAt] = useState(() => new Date().toISOString());
  const steps = useMemo(() => compileWorkout(workout, useApp.getState().loadPlan()), [workout]);
  const [state, dispatch] = useReducer(runnerReducer, undefined, () => startRunner(steps, Date.now()));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: 'tick', now: t });
    }, 200);
    return () => clearInterval(id);
  }, []);

  // Haptics on each new step and the last three seconds of a countdown.
  const lastIndex = useRef(state.index);
  const lastSecond = useRef<number>(undefined);
  const left = remaining(state, now);
  useEffect(() => {
    if (state.index !== lastIndex.current) {
      lastIndex.current = state.index;
      haptic('step');
    }
    const second = left === undefined ? undefined : Math.ceil(left);
    if (second !== undefined && second <= 3 && second > 0 && second !== lastSecond.current && state.pausedAt === undefined) haptic('tick');
    lastSecond.current = second;
  }, [state.index, left, state.pausedAt]);

  const step = currentStep(state);
  const paused = state.pausedAt !== undefined;
  const quit = () => (state.entries.length ? dispatch({ type: 'finish' }) : router.back());

  if (state.finished) return <Finish state={state} workoutId={workout.id} startedAt={startedAt} />;
  if (!step) return null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.column}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Button label="End" kind="ghost" onPress={quit} />
          <Body muted>
            {workout.name} · {state.index + 1}/{state.steps.length}
          </Body>
          <Button
            label={paused ? 'Resume' : 'Pause'}
            kind="tonal"
            onPress={() => dispatch({ type: paused ? 'resume' : 'pause', now: Date.now() })}
          />
        </Row>
        <View style={styles.track}>
          <View style={[styles.progress, { width: `${(state.index / state.steps.length) * 100}%` }]} />
        </View>

        {step.kind === 'work' && <WorkView state={state} step={step} now={now} dispatch={dispatch} />}
        {step.kind === 'rest' && <RestView state={state} step={step} now={now} dispatch={dispatch} />}
        {step.kind === 'amrap' && <AmrapView state={state} step={step} now={now} dispatch={dispatch} />}
      </View>
    </View>
  );
}

type ViewProps<K extends Step['kind']> = {
  state: RunnerState;
  step: Extract<Step, { kind: K }>;
  now: number;
  dispatch: (a: Parameters<typeof runnerReducer>[1]) => void;
};

function WorkView({ state, step, now, dispatch }: ViewProps<'work'>) {
  const units = useApp((s) => s.settings.units);
  const exercise = getExercise(step.exercise);
  const left = remaining(state, now);
  const big = step.mode === 'reps' ? clock(elapsed(state, now)) : clock(left ?? 0);

  return (
    <View style={styles.body}>
      <Label>{step.label}</Label>
      <Title>{exercise.name}</Title>
      <FigureViewer clipId={exercise.animation} controls={false} style={styles.viewer} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Heading style={{ color: Palette.accent }}>
          {joinDetail(formatTarget(step.target, step.exercise), loadLabel(step.exercise, step.load, units))}
        </Heading>
        <Text style={styles.clock}>{big}</Text>
      </Row>

      {state.review !== undefined ? (
        <Card>
          <Label>Reps completed{exercise.unilateral ? ' per side' : ''}</Label>
          <Row style={{ justifyContent: 'space-between' }}>
            <Button label="−" kind="tonal" large style={styles.stepper} onPress={() => dispatch({ type: 'adjust', delta: -1 })} />
            <Text style={styles.review}>{state.review}</Text>
            <Button label="+" kind="tonal" large style={styles.stepper} onPress={() => dispatch({ type: 'adjust', delta: 1 })} />
          </Row>
          <Button label="Log set" kind="go" large onPress={() => dispatch({ type: 'confirm', now: Date.now() })} />
        </Card>
      ) : step.mode === 'window' ? (
        state.windowLogged ? (
          <Body muted style={styles.center}>
            Logged. Rest until the next minute.
          </Body>
        ) : (
          <Row>
            <Button label="Missed" kind="tonal" large style={{ flex: 1 }} onPress={() => dispatch({ type: 'skip', now: Date.now() })} />
            <Button label="Done" kind="go" large style={{ flex: 2 }} onPress={() => dispatch({ type: 'done', now: Date.now() })} />
          </Row>
        )
      ) : (
        <Row>
          <Button label="Skip" kind="tonal" large style={{ flex: 1 }} onPress={() => dispatch({ type: 'skip', now: Date.now() })} />
          <Button
            label={step.mode === 'timed' ? 'End early' : 'Done'}
            kind="go"
            large
            style={{ flex: 2 }}
            onPress={() => dispatch({ type: 'done', now: Date.now() })}
          />
        </Row>
      )}
    </View>
  );
}

function RestView({ state, step, now, dispatch }: ViewProps<'rest'>) {
  const units = useApp((s) => s.settings.units);
  const next = state.steps.slice(state.index + 1).find((s) => s.kind !== 'rest');
  const nextExercise = next?.kind === 'work' ? getExercise(next.exercise) : undefined;
  return (
    <View style={styles.body}>
      <Label>{step.label}</Label>
      <Text style={styles.restClock}>{clock(remaining(state, now) ?? 0)}</Text>
      {next && (
        <Card>
          <Label>Up next</Label>
          {nextExercise && next.kind === 'work' ? (
            <>
              <Heading>{nextExercise.name}</Heading>
              <Body muted>
                {joinDetail(formatTarget(next.target, next.exercise), loadLabel(next.exercise, next.load, units), next.label)}
              </Body>
              <FigureViewer clipId={nextExercise.animation} controls={false} style={styles.nextViewer} />
            </>
          ) : (
            <Heading>{next.label}</Heading>
          )}
        </Card>
      )}
      <Row>
        <Button label="+15 s" kind="tonal" large style={{ flex: 1 }} onPress={() => dispatch({ type: 'extendRest', seconds: 15 })} />
        <Button label="Skip rest" kind="primary" large style={{ flex: 2 }} onPress={() => dispatch({ type: 'skip', now: Date.now() })} />
      </Row>
    </View>
  );
}

function AmrapView({ state, step, now, dispatch }: ViewProps<'amrap'>) {
  const units = useApp((s) => s.settings.units);
  const rounds = state.amrapRounds[step.block] ?? 0;
  const [focus, setFocus] = useState(0);
  const station = step.stations[focus];
  return (
    <View style={styles.body}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>{step.label}</Label>
        <Text style={styles.clock}>{clock(remaining(state, now) ?? 0)}</Text>
      </Row>
      <FigureViewer clipId={getExercise(station.exercise).animation} controls={false} style={styles.viewer} />
      <Card>
        {step.stations.map((s, i) => (
          <Row key={i} style={{ justifyContent: 'space-between' }}>
            <Pressable onPress={() => setFocus(i)} hitSlop={8}>
              <Body style={{ color: i === focus ? Palette.accent : Palette.text }}>{getExercise(s.exercise).name}</Body>
            </Pressable>
            <Body muted>
              {joinDetail(formatTarget(s.target, s.exercise), loadLabel(s.exercise, s.load, units))}
            </Body>
          </Row>
        ))}
      </Card>
      <Row>
        <Button label="End" kind="tonal" large style={{ flex: 1 }} onPress={() => dispatch({ type: 'skip', now: Date.now() })} />
        <Button label={`Round done (${rounds})`} kind="go" large style={{ flex: 2 }} onPress={() => dispatch({ type: 'round' })} />
      </Row>
    </View>
  );
}

function Finish({ state, workoutId, startedAt }: { state: RunnerState; workoutId: string; startedAt: string }) {
  const insets = useSafeAreaInsets();
  const saveSession = useApp((s) => s.saveSession);
  const custom = useApp((s) => s.customWorkouts);
  // Stretches never progress, so only training exercises are rated.
  const exercises = [...new Set(state.entries.map((e) => e.exercise))].filter((id) => !isStretch(getExercise(id)));
  const [effort, setEffort] = useState<Record<string, Effort>>(() => Object.fromEntries(exercises.map((e) => [e, 'good'])));
  const [saved, setSaved] = useState<SessionLog>();

  const save = () => {
    const workout = getWorkout(workoutId, custom)!;
    setSaved(saveSession({ workout, startedAt, entries: state.entries, amrapRounds: state.amrapRounds, effort }));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }}>
      <View style={[styles.column, { gap: Spacing.three }]}>
        <Title>{saved ? 'Saved' : 'Workout done'}</Title>
        {!state.entries.length && <Body muted>Nothing was logged.</Body>}
        {state.entries.length > 0 && !exercises.length && !saved && <Body muted>Nice stretch. Save it to your history.</Body>}
        {!saved &&
          exercises.map((id) => (
            <Card key={id}>
              <Heading>{getExercise(id).name}</Heading>
              <Body muted style={{ fontSize: 14 }}>
                How did it feel?
              </Body>
              <Segmented<Effort>
                options={[
                  { value: 'easy', label: 'Easy' },
                  { value: 'good', label: 'Good' },
                  { value: 'hard', label: 'Hard' },
                ]}
                value={effort[id]}
                onChange={(value) => setEffort((e) => ({ ...e, [id]: value }))}
              />
            </Card>
          ))}
        {saved &&
          Object.entries(saved.progress).map(([id, p]) => (
            <Card key={id}>
              <Heading>{getExercise(id).name}</Heading>
              <Body style={{ color: p.change === 'hold' ? Palette.muted : Palette.accent }}>{p.reason}</Body>
            </Card>
          ))}
        {saved ? (
          <Button label="Done" kind="primary" large onPress={() => router.dismissTo('/')} />
        ) : (
          <>
            {state.entries.length > 0 && <Button label="Save session" kind="go" large onPress={save} />}
            <Button label="Discard" kind="ghost" onPress={() => router.back()} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

/** Timers and counts in HUD pixel type. */
const HUD = { color: Psx.hud, fontFamily: PixelFont, textShadowColor: '#000', textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0 } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.bg },
  column: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three, gap: Spacing.two },
  body: { flex: 1, gap: Spacing.three, justifyContent: 'flex-end' },
  track: { height: 6, backgroundColor: Palette.track, borderRadius: 3, overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: Palette.accent },
  viewer: { flex: 1, aspectRatio: undefined, minHeight: 220 },
  nextViewer: { height: 160, aspectRatio: undefined, borderRadius: Radius.button },
  clock: { ...HUD, fontSize: 32, lineHeight: 44 },
  restClock: { ...HUD, fontSize: 64, lineHeight: 90, textAlign: 'center' },
  review: { ...HUD, fontSize: 48, lineHeight: 64 },
  stepper: { width: 80 },
  center: { textAlign: 'center', paddingVertical: 20 },
});
