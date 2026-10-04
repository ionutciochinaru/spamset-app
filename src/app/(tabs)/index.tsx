import { router } from 'expo-router';
import { useMemo } from 'react';

import { Body, Button, Card, Heading, Label, Row, Screen, Stat, Title } from '@/components/ui';
import { WorkoutCard } from '@/components/workout-card';
import { totalReps, volumeKg } from '@/core/session';
import { PRESET_WORKOUTS, workoutEquipment, workoutFocus } from '@/core/workouts';
import { formatLoad, useApp, ownedEquipment } from '@/store/app-store';

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export default function Today() {
  const sessions = useApp((s) => s.sessions);
  const customWorkouts = useApp((s) => s.customWorkouts);
  const settings = useApp((s) => s.settings);
  const units = settings.units;

  const week = useMemo(() => {
    const since = startOfWeek().toISOString();
    const recent = sessions.filter((s) => s.startedAt >= since);
    return {
      count: recent.length,
      volume: recent.reduce((sum, s) => sum + volumeKg(s), 0),
      reps: recent.reduce((sum, s) => sum + totalReps(s), 0),
    };
  }, [sessions]);

  // Suggest the training session done least recently that your equipment allows, so the week
  // rotates through training types. Stretch-only sessions are extras, not the main suggestion.
  const next = useMemo(() => {
    const owned = ownedEquipment(settings);
    const all = [...PRESET_WORKOUTS, ...customWorkouts].filter(
      (w) => workoutFocus(w) !== 'mobility' && workoutEquipment(w).every((e) => owned.includes(e)),
    );
    const lastDone = (id: string) => sessions.find((s) => s.workoutId === id)?.startedAt ?? '';
    return [...all].sort((a, b) => lastDone(a.id).localeCompare(lastDone(b.id)))[0];
  }, [sessions, customWorkouts, settings]);

  const last = sessions[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen>
      <Label>{today}</Label>
      <Title>Ready to work?</Title>

      <Card>
        <Label>This week</Label>
        <Row>
          <Stat value={String(week.count)} label="Sessions" />
          <Stat value={String(week.reps)} label="Reps" />
          <Stat value={week.volume ? formatLoad(week.volume, units) : '0'} label="Volume" />
        </Row>
      </Card>

      {next && (
        <>
          <Heading>Up next</Heading>
          <WorkoutCard workout={next} />
          <Button
            label={`Start ${next.name}`}
            kind="go"
            large
            onPress={() => router.push({ pathname: '/session', params: { workout: next.id } })}
          />
        </>
      )}

      {last && (
        <Card onPress={() => router.push('/history')}>
          <Label>Last session</Label>
          <Heading>{last.workoutName}</Heading>
          <Body muted>
            {new Date(last.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
            {totalReps(last)} reps · {formatLoad(volumeKg(last), units)} moved
          </Body>
        </Card>
      )}
    </Screen>
  );
}
