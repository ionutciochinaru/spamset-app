import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { FigureViewer } from '@/components/figure-viewer';
import { Body, Button, Card, EffortChoice, ExerciseTrainingPreview, Icon, Label, MemeText, PixelText, Row, Screen, ScreenHeader, Stepper, Steps, Thumb, Title, YouTubeSearchButton } from '@/components/ui';
import type { SessionLog } from '@/core/session';
import { rankTitle, setCaption, xpState } from '@/core/xp';
import { syncNow } from '@/lib/sync';
import { Palette, PixelSize, Psx, Spacing } from '@/constants/theme';
import { pickCelebration } from '@/core/celebrations';
import { getExercise, isStretch, isTimed } from '@/core/exercises';
import { getExerciseTraining } from '@/core/exercise-training';
import { initialPrescription, type Effort } from '@/core/progression';
import { pickFor, planSpamsets, spamCandidates, spamTarget, targetText, timeText } from '@/core/spamset';
import { ownedEquipment, spamSchedule, useApp } from '@/store/app-store';

/**
 * One spam set: the exercise from a notification (or "Do one now"), its 3D demo and your
 * current target. Done asks how it felt (Easy / Good / Hard), which moves the target, then
 * logs it to History. Swap draws another of your switched-on exercises.
 */
export default function Spamset() {
  const params = useLocalSearchParams<{ exercise?: string }>();
  const settings = useApp((s) => s.settings);
  const schedule = spamSchedule(settings);
  const owned = useMemo(() => ownedEquipment(settings), [settings]);
  const candidates = useMemo(() => spamCandidates(schedule, owned), [schedule, owned]);
  const [exerciseId, setExerciseId] = useState(() => params.exercise ?? pickFor(new Date(), candidates) ?? 'squat');
  const exercise = getExercise(exerciseId);
  const training = getExerciseTraining(exercise);
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
  // Done → rate (skipped for stretches) → logged.
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [logged, setLogged] = useState<SessionLog | undefined>(undefined);

  const [gained, setGained] = useState(0);
  const [effortRated, setEffortRated] = useState<Effort>();
  const [newLevel, setNewLevel] = useState<number>();
  const log = (amount: number, effort?: Effort) => {
    const before = xpState(useApp.getState().sessions);
    setLogged(logSpamset({ exercise: exerciseId, target, done: amount, startedAt, effort }));
    const after = xpState(useApp.getState().sessions);
    setGained(after.today - before.today);
    setEffortRated(effort);
    setNewLevel(after.level > before.level ? after.level : undefined);
    setRating(undefined);
    // Put it on the boards straight away when signed in (a no-op offline).
    syncNow().catch(() => null);
  };
  const finish = (amount: number) => {
    setLeft(undefined);
    if (isStretch(exercise)) log(amount);
    else setRating(amount);
  };

  // Countdown for holds and stretches; logs itself at zero.
  useEffect(() => {
    if (left === undefined || left <= 0) return;
    const id = setTimeout(() => {
      if (left === 1) {
        if (Platform.OS !== 'web' && settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        finish(goal);
        return;
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

  const next = planSpamsets(schedule, owned, new Date(), 1, useApp.getState().spamSwaps)[0];
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (rating !== undefined) {
    const completed = targetText(exerciseId, timed ? { seconds: rating } : { reps: rating });
    return (
      <Screen style={styles.ratingScreen}>
        <ScreenHeader title="Finish set" back onBack={() => setRating(undefined)} profile={false} />
        <Card style={styles.completedSet}>
          <Row>
            <Icon ios="checkmark.circle.fill" md="check_circle" color="#6fd48a" size={18} />
            <Label color={Palette.text}>Set complete</Label>
          </Row>
          <Row style={styles.completedExercise}>
            <Thumb clip={exercise.animation} size={64} />
            <View style={styles.completedCopy}>
              <Title style={styles.completedTitle}>{exercise.name}</Title>
              <Body muted>{completed} completed</Body>
            </View>
          </Row>
        </Card>
        <View style={styles.ratingPrompt}>
          <Title style={styles.ratingTitle}>How did that feel?</Title>
          <Body muted>Tap a rating to save your set and tune your next target.</Body>
        </View>
        <View style={styles.ratingChoices}>
          <EffortChoice effort="easy" onPress={() => log(rating, 'easy')} />
          <EffortChoice effort="good" onPress={() => log(rating, 'good')} />
          <EffortChoice effort="hard" onPress={() => log(rating, 'hard')} />
        </View>
      </Screen>
    );
  }

  if (logged) {
    const progress = logged.progress[exerciseId];
    const celebration = pickCelebration(logged.id);
    return (
      <Screen>
        <View style={{ height: 24 }} />
        <FigureViewer key={celebration.id} clipId={celebration.id} auraKind={celebration.aura} auraFx={celebration.fx} locked controls={false} />
        <Label>Spam set logged</Label>
        <Title>Nice. {exercise.name} done.</Title>
        <PixelText size={PixelSize.large} color={gained ? Psx.hud : Palette.muted}>
          {gained ? `+${gained} XP` : '+0 XP'}
        </PixelText>
        {newLevel && (
          <PixelText size={PixelSize.medium} color={Palette.accent}>
            NEW RANK: {rankTitle(newLevel).toUpperCase()}
          </PixelText>
        )}
        <MemeText size={26}>{setCaption({ gained, effort: effortRated, leveledUp: newLevel !== undefined, seed: logged.id })}</MemeText>
        {!gained && <Body muted style={{ fontSize: 14 }}>Sets less than 3 minutes apart don&apos;t earn XP.</Body>}
        {progress && (
          <Card>
            <Body style={{ color: progress.change === 'hold' ? Palette.text : Palette.accent }}>{progress.reason}</Body>
            {progress.suggest && (
              <Button
                label={`See ${getExercise(progress.suggest).name}`}
                kind="tonal"
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: progress.suggest! } })}
              />
            )}
          </Card>
        )}
        <Body muted>
          {next
            ? `Next one at ${timeText(next.at)}${
                next.at.toDateString() === new Date().toDateString() ? '' : ` on ${next.at.toLocaleDateString(undefined, { weekday: 'long' })}`
              }.`
            : 'Spam sets are off. Turn them on to get one at your interval.'}
        </Body>
        <Button label="Close" kind="primary" large onPress={close} />
        <Button
          label="One more"
          kind="tonal"
          onPress={() => {
            swap();
            setLogged(undefined);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Spam set"
        back
        onBack={close}
        profile={false}
      />
      {training ? (
        <ExerciseTrainingPreview exercise={exercise} training={training}>
          <FigureViewer clipId={exercise.animation} />
        </ExerciseTrainingPreview>
      ) : (
        <FigureViewer clipId={exercise.animation} />
      )}
      <Row>
        <YouTubeSearchButton query={exercise.name} />
        <Title style={{ flex: 1 }}>{exercise.name}</Title>
      </Row>
      {left !== undefined && (
        <PixelText size={PixelSize.large} color={Psx.hud}>
          {`${left} s`.toUpperCase()}
        </PixelText>
      )}
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
          <Button label="Done" kind="go" textColor="#fff" large onPress={() => finish(done)} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ratingScreen: { maxWidth: 560, gap: Spacing.four },
  completedSet: { gap: Spacing.three },
  completedExercise: { gap: Spacing.three },
  completedCopy: { flex: 1, gap: Spacing.one },
  completedTitle: { fontSize: 20, lineHeight: 26 },
  ratingPrompt: { gap: Spacing.two },
  ratingTitle: { fontSize: 28, lineHeight: 34 },
  ratingChoices: { gap: 12 },
});
