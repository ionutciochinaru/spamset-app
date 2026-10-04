import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';

import { FigureViewer } from '@/components/figure-viewer';
import { Body, Button, Card, Label, PixelText, Row, Screen, Stepper, Steps, Title } from '@/components/ui';
import { Palette, PixelSize, Psx } from '@/constants/theme';
import { getExercise, isTimed } from '@/core/exercises';
import { initialPrescription } from '@/core/progression';
import { pickFor, planSpamsets, spamCandidates, spamTarget, targetText } from '@/core/spamset';
import { ownedEquipment, spamSchedule, useApp } from '@/store/app-store';

/**
 * One spam set: the exercise from a notification (or "Do one now"), its 3D demo and your
 * current target. Done logs it to History; Swap draws another from your pool.
 */
export default function Spamset() {
  const params = useLocalSearchParams<{ exercise?: string }>();
  const settings = useApp((s) => s.settings);
  const schedule = spamSchedule(settings);
  const owned = useMemo(() => ownedEquipment(settings), [settings]);
  const candidates = useMemo(() => spamCandidates(schedule, owned), [schedule, owned]);
  const [exerciseId, setExerciseId] = useState(() => params.exercise ?? pickFor(new Date(), candidates) ?? 'squat');
  const exercise = getExercise(exerciseId);
  const prescription = useApp((s) => s.prescriptions[exerciseId]) ?? initialPrescription(exerciseId, settings.bells);
  const target = spamTarget(exerciseId, prescription);
  const timed = 'seconds' in target;
  const goal = timed ? target.seconds : target.reps;
  const logSpamset = useApp((s) => s.logSpamset);

  const [startedAt] = useState(() => new Date().toISOString());
  const goalFor = (id: string) => {
    const t = spamTarget(id, useApp.getState().prescriptions[id] ?? initialPrescription(id, settings.bells));
    return 'seconds' in t ? t.seconds : t.reps;
  };
  const [done, setDone] = useState(goal);
  const [left, setLeft] = useState<number | undefined>(undefined);
  const [logged, setLogged] = useState(false);

  const finish = (amount: number) => {
    logSpamset(exerciseId, target, amount, startedAt);
    setLogged(true);
  };

  // Countdown for holds and stretches; logs itself at zero.
  useEffect(() => {
    if (left === undefined || left <= 0) return;
    const id = setTimeout(() => {
      if (left === 1) {
        if (Platform.OS !== 'web' && settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        finish(goal);
      }
      setLeft(left - 1);
    }, 1000);
    return () => clearTimeout(id);
  });

  const swap = () => {
    const others = candidates.filter((id) => id !== exerciseId);
    if (!others.length) return;
    const id = others[Math.floor(Math.random() * others.length)];
    setExerciseId(id);
    setDone(goalFor(id));
    setLeft(undefined);
  };

  const next = planSpamsets(schedule, owned, new Date(), 1)[0];
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (logged) {
    return (
      <Screen>
        <View style={{ height: 40 }} />
        <Label>Spam set logged</Label>
        <Title>Nice. {exercise.name} done.</Title>
        <Body muted>
          {next
            ? `Next one at ${next.at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}${
                next.at.toDateString() === new Date().toDateString() ? '' : ` on ${next.at.toLocaleDateString(undefined, { weekday: 'long' })}`
              }.`
            : 'Spam sets are off. Turn them on to get one at your interval.'}
        </Body>
        <Button label="Close" kind="primary" large onPress={close} />
        <Button label="One more" kind="tonal" onPress={() => { swap(); setLogged(false); }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>Spam set</Label>
        <Button label="Skip" kind="ghost" onPress={close} />
      </Row>
      <FigureViewer clipId={exercise.animation} />
      <Title>{exercise.name}</Title>
      <PixelText size={PixelSize.large} color={left !== undefined ? Psx.hud : Palette.accent}>
        {(left !== undefined ? `${left} s` : targetText(exerciseId, target)).toUpperCase()}
      </PixelText>
      <Card>
        <Steps items={exercise.cues.slice(0, 3)} />
      </Card>

      {timed ? (
        left === undefined ? (
          <Button label={`Start ${goal} s`} kind="go" large onPress={() => setLeft(goal)} />
        ) : (
          <Button label="Stop and log" kind="primary" large onPress={() => finish(goal - left)} />
        )
      ) : (
        <>
          <Card>
            <Stepper label={isTimed(exercise) ? 'Seconds done' : 'Reps done'} value={done} onChange={setDone} min={0} max={200} />
          </Card>
          <Button label="Done" kind="go" large onPress={() => finish(done)} />
        </>
      )}
      {candidates.length > 1 && left === undefined && <Button label="Swap exercise" kind="tonal" onPress={swap} />}
    </Screen>
  );
}
