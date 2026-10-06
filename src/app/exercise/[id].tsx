import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { clips } from '@/animation/clips';
import { BellPicker } from '@/components/bell-picker';
import { FigureViewer } from '@/components/figure-viewer';
import { getExerciseTraining } from '@/core/exercise-training';
import { Body, Card, ExerciseTrainingPreview, Heading, Label, Row, Screen, ScreenHeader, Steps, Tag } from '@/components/ui';
import { Palette } from '@/constants/theme';
import { canDo, EQUIPMENT_LABELS, getExercise, isLoaded, isStretch, isTimed } from '@/core/exercises';
import { initialPrescription } from '@/core/progression';
import { joinDetail, loadLabel, ownedEquipment, useApp } from '@/store/app-store';

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exercise = getExercise(id);
  const training = getExerciseTraining(exercise);
  const clip = clips[exercise.animation];
  const prescription = useApp((s) => s.prescriptions[id]) ?? initialPrescription(id, useApp.getState().settings.bells);
  const units = useApp((s) => s.settings.units);
  const owned = ownedEquipment(useApp((s) => s.settings));
  const harder = exercise.harder ? getExercise(exercise.harder) : undefined;
  const unit = isTimed(exercise) ? 's' : 'reps';
  const sessions = useApp((s) => s.sessions);
  const recent = useMemo(
    () =>
      sessions
        .flatMap((session) => session.entries.filter((e) => e.exercise === id).map((e) => ({ ...e, date: session.startedAt })))
        .slice(0, 8),
    [sessions, id],
  );

  return (
    <Screen>
      <ScreenHeader title={exercise.name} back />
      {training ? (
        <ExerciseTrainingPreview exercise={exercise} training={training}>
          <FigureViewer clipId={exercise.animation} />
        </ExerciseTrainingPreview>
      ) : (
        <FigureViewer clipId={exercise.animation} />
      )}
      <Row style={{ flexWrap: 'wrap' }}>
        {exercise.primary.map((m) => (
          <Tag key={m} label={m} accent />
        ))}
        {exercise.support.map((m) => (
          <Tag key={m} label={m} />
        ))}
        {exercise.equipment !== 'none' && exercise.equipment !== 'kettlebell' && (
          <Tag label={canDo(exercise, owned) ? EQUIPMENT_LABELS[exercise.equipment] : `Needs ${EQUIPMENT_LABELS[exercise.equipment].toLowerCase()}`} />
        )}
      </Row>

      <Card>
        <Label>How to</Label>
        <Steps items={exercise.cues} />
        <Body muted style={{ fontSize: 14 }}>
          Counting: {exercise.counting}.
        </Body>
        {clip.contract?.phases && (
          <Body muted style={{ fontSize: 14 }}>
            Phases: {clip.contract.phases}.
          </Body>
        )}
      </Card>

      {isLoaded(exercise) ? (
        <Card>
          <Label>Your bell</Label>
          <BellPicker exercise={id} load={prescription.load} />
          <Body muted style={{ fontSize: 14 }}>
            Spam sets ask for {prescription.reps} reps next. Rate them Easy twice at 20 reps and you move up a bell.
          </Body>
        </Card>
      ) : isStretch(exercise) ? (
        <Card>
          <Label>Stretch</Label>
          <Body muted style={{ fontSize: 14 }}>
            Ease in to mild tension and breathe. Never bounce. Stretches do not progress; just show up.
          </Body>
        </Card>
      ) : (
        <Card>
          <Label>Progression</Label>
          <Body muted style={{ fontSize: 14 }}>
            Spam sets ask for {prescription.reps} {unit} next. Two Easy ratings add {isTimed(exercise) ? '5 s' : 'a rep'}, up to{' '}
            {isTimed(exercise) ? '60 s' : '20 reps'}
            {harder ? `, then it suggests ${harder.name}.` : '.'}
          </Body>
          {harder && (
            <Card onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: harder.id } })} style={{ backgroundColor: Palette.tonal }}>
              <Body>Next step: {harder.name} →</Body>
            </Card>
          )}
        </Card>
      )}

      {recent.length > 0 && (
        <Card>
          <Heading>Recent sets</Heading>
          {recent.map((e, i) => (
            <Row key={i} style={{ justifyContent: 'space-between' }}>
              <Body muted>{new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Body>
              <Body>
                {joinDetail('reps' in e.target ? `${e.done} reps` : `${e.done} s`, loadLabel(id, e.load, units))}
              </Body>
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}
