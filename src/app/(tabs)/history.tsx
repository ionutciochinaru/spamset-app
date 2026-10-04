import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Body, Button, Card, Heading, Label, Row, Screen, Stat, Title } from '@/components/ui';
import { Palette } from '@/constants/theme';
import { getExercise } from '@/core/exercises';
import { totalReps, volumeKg, type SessionLog } from '@/core/session';
import { deleteSession } from '@/lib/sync';
import { formatLoad, SPAMSET_WORKOUT_ID, useApp } from '@/store/app-store';

const CHANGE_LABEL = { 'load-up': 'Heavier bell next', 'load-down': 'Lighter bell next', 'reps-up': 'More reps next', hold: 'Hold', maxed: 'Top of the range' };

/** Weekly volume for the last eight weeks, newest last. */
function weeklyVolume(sessions: SessionLog[]): { label: string; kg: number }[] {
  const weeks: { label: string; kg: number; start: Date }[] = [];
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (let i = 7; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(start.getDate() - i * 7);
    weeks.push({ start, kg: 0, label: start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) });
  }
  for (const s of sessions) {
    const at = new Date(s.startedAt);
    const week = [...weeks].reverse().find((w) => at >= w.start);
    if (week) week.kg += volumeKg(s);
  }
  return weeks;
}

export default function History() {
  const sessions = useApp((s) => s.sessions);
  const units = useApp((s) => s.settings.units);
  const [open, setOpen] = useState<string>();
  const weeks = useMemo(() => weeklyVolume(sessions), [sessions]);
  const peak = Math.max(1, ...weeks.map((w) => w.kg));

  return (
    <Screen>
      <Title>History</Title>
      {!sessions.length && <Body muted>No sessions yet. Finish a workout and it shows up here.</Body>}

      {sessions.length > 0 && (
        <Card>
          <Label>Weekly volume</Label>
          <View style={styles.chart} accessibilityLabel="Weekly volume, last eight weeks">
            {weeks.map((w, i) => (
              <View key={i} style={styles.barColumn}>
                <View style={[styles.bar, { height: `${(w.kg / peak) * 100}%` }, i === weeks.length - 1 && styles.barCurrent]} />
              </View>
            ))}
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body muted style={styles.axis}>{weeks[0].label}</Body>
            <Body muted style={styles.axis}>This week · {weeks.at(-1)!.kg ? formatLoad(weeks.at(-1)!.kg, units) : '0 kg'}</Body>
          </Row>
        </Card>
      )}

      {sessions.map((s) => {
        const minutes = Math.round((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60000);
        const expanded = open === s.id;
        return (
          <Card key={s.id} onPress={() => setOpen(expanded ? undefined : s.id)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Heading style={{ flex: 1 }}>
                {s.workoutId === SPAMSET_WORKOUT_ID && s.entries[0] ? `Spam set · ${getExercise(s.entries[0].exercise).name}` : s.workoutName}
              </Heading>
              <Body muted>
                {new Date(s.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
              </Body>
            </Row>
            <Row>
              <Stat value={`${minutes}`} label="Minutes" />
              <Stat value={`${totalReps(s)}`} label="Reps" />
              <Stat value={volumeKg(s) ? formatLoad(volumeKg(s), units) : '–'} label="Volume" />
            </Row>
            {expanded && (
              <View style={{ gap: 6, marginTop: 6 }}>
                {Object.entries(s.amrapRounds).map(([block, rounds]) => (
                  <Body key={block}>AMRAP: {rounds} rounds</Body>
                ))}
                {summarize(s).map((line) => (
                  <Row key={line.exercise} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Body style={{ flex: 1 }}>{getExercise(line.exercise).name}</Body>
                    <Body muted style={{ flex: 1, textAlign: 'right' }}>
                      {line.text}
                    </Body>
                  </Row>
                ))}
                {Object.entries(s.progress).map(([exercise, p]) => (
                  <Body key={exercise} style={{ fontSize: 14, color: p.change === 'hold' ? Palette.muted : Palette.accent }}>
                    {getExercise(exercise).name}: {CHANGE_LABEL[p.change]}. {p.reason}
                  </Body>
                ))}
                <Button label="Delete session" kind="ghost" onPress={() => deleteSession(s.id)} />
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

function summarize(s: SessionLog): { exercise: string; text: string }[] {
  const groups = new Map<string, string[]>();
  for (const e of s.entries) {
    const list = groups.get(e.exercise) ?? [];
    const done = 'reps' in e.target ? `${e.done}` : `${e.done}s`;
    list.push(e.load ? `${done}×${e.load}` : done);
    groups.set(e.exercise, list);
  }
  // Loads are kg; bodyweight and stretches have none.
  return [...groups].map(([exercise, sets]) => ({
    exercise,
    text: s.entries.some((e) => e.exercise === exercise && e.load) ? `${sets.join(', ')} kg` : sets.join(', '),
  }));
}

const styles = StyleSheet.create({
  chart: { height: 90, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: Palette.track, minHeight: 2, borderTopWidth: 2, borderTopColor: 'rgba(255,255,255,0.3)' },
  barCurrent: { backgroundColor: Palette.accent },
  axis: { fontSize: 12 },
});
