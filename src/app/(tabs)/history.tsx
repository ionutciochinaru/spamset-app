import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Body, Button, Card, Label, PixelText, Row, Screen, Stat, Tag, Thumb, Title } from '@/components/ui';
import { Palette, PixelSize, Psx } from '@/constants/theme';
import { getExercise, isLoaded } from '@/core/exercises';
import type { Change } from '@/core/progression';
import { dayStreak, totalReps, type SessionLog } from '@/core/session';
import { timeText } from '@/core/spamset';
import { deleteSession } from '@/lib/sync';
import { formatLoad, useApp } from '@/store/app-store';

const CHANGE_LABEL: Record<Change, string> = {
  'load-up': 'Heavier bell next',
  'load-down': 'Lighter bell next',
  'reps-up': 'More next time',
  'reps-down': 'Less next time',
  hold: 'Same next time',
  maxed: 'Top of the range',
};

const DAYS = 14;
const dayKey = (d: Date) => d.toDateString();

/** Logs per day for the last two weeks, oldest first. */
function dailyCounts(sessions: SessionLog[]): { date: Date; count: number }[] {
  const today = new Date();
  const days = Array.from({ length: DAYS }, (_, i) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS - 1 - i));
    return { date, count: 0 };
  });
  const index = new Map(days.map((d, i) => [dayKey(d.date), i]));
  for (const s of sessions) {
    const i = index.get(dayKey(new Date(s.startedAt)));
    if (i !== undefined) days[i].count++;
  }
  return days;
}

export default function History() {
  const sessions = useApp((s) => s.sessions);
  const [open, setOpen] = useState<string>();
  const days = useMemo(() => dailyCounts(sessions), [sessions]);
  const peak = Math.max(1, ...days.map((d) => d.count));
  const streak = useMemo(() => dayStreak(sessions), [sessions]);
  const weekCount = days.slice(-7).reduce((n, d) => n + d.count, 0);
  const weekReps = useMemo(() => {
    const since = days[DAYS - 7].date.getTime();
    return sessions.filter((s) => Date.parse(s.startedAt) >= since).reduce((n, s) => n + totalReps(s), 0);
  }, [sessions, days]);

  // Newest first, grouped by day.
  const groups = useMemo(() => {
    const map = new Map<string, SessionLog[]>();
    for (const s of sessions) {
      const key = dayKey(new Date(s.startedAt));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map];
  }, [sessions]);

  return (
    <Screen>
      <Title>History</Title>
      {!sessions.length && <Body muted>No spam sets yet. Do one from Today and it shows up here.</Body>}

      {sessions.length > 0 && (
        <Card>
          <Row>
            <Stat value={String(weekCount)} label="Last 7 days" />
            <Stat value={String(weekReps)} label="Reps" />
            <Stat value={String(streak)} label="Day streak" />
          </Row>
          <View style={styles.chart} accessibilityLabel="Spam sets per day, last two weeks">
            {days.map((d, i) => (
              <View key={i} style={styles.barColumn}>
                <View style={[styles.bar, { height: `${(d.count / peak) * 100}%` }, i === DAYS - 1 && styles.barToday]} />
              </View>
            ))}
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body muted style={styles.axis}>
              {days[0].date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </Body>
            <Body muted style={styles.axis}>
              Today
            </Body>
          </Row>
        </Card>
      )}

      {groups.map(([key, logs]) => (
        <View key={key} style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>
              {key === dayKey(new Date())
                ? 'Today'
                : new Date(logs[0].startedAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
            </Label>
            <PixelText size={PixelSize.small} color={Psx.hud}>
              {logs.length}
            </PixelText>
          </Row>
          {logs.map((s) => (
            <LogRow key={s.id} log={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? undefined : s.id)} />
          ))}
        </View>
      ))}
    </Screen>
  );
}

function LogRow({ log, open, onToggle }: { log: SessionLog; open: boolean; onToggle: () => void }) {
  const units = useApp((s) => s.settings.units);
  const entry = log.entries[0];
  const time = timeText(new Date(log.startedAt));
  // Logs from before the app focused on spam sets were whole workouts.
  if (!entry || log.entries.length > 1) {
    return (
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body style={{ flex: 1 }}>{log.workoutName}</Body>
          <Body muted>
            {time} · {totalReps(log)} reps
          </Body>
        </Row>
      </Card>
    );
  }
  const exercise = getExercise(entry.exercise);
  const done = 'reps' in entry.target ? `${entry.done} reps` : `${entry.done} s`;
  const effort = log.effort[entry.exercise];
  const progress = log.progress[entry.exercise];
  return (
    <Card onPress={onToggle} style={{ padding: 12 }}>
      <Row>
        <Thumb clip={exercise.animation} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Body style={{ fontWeight: '600' }}>{exercise.name}</Body>
          <Body muted style={{ fontSize: 14 }}>
            {time} · {done}
            {isLoaded(exercise) && entry.load ? ` · ${formatLoad(entry.load, units)}` : ''}
          </Body>
        </View>
        {effort && <Tag label={effort[0].toUpperCase() + effort.slice(1)} accent={effort === 'easy'} />}
      </Row>
      {open && (
        <View style={{ gap: 8, marginTop: 4 }}>
          {progress && (
            <Body style={{ fontSize: 14, color: progress.change === 'hold' ? Palette.muted : Palette.accent }}>
              {CHANGE_LABEL[progress.change]}. {progress.reason}
            </Body>
          )}
          {progress?.suggest && (
            <Pressable onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: progress.suggest! } })}>
              <Body style={{ color: Palette.accent }}>See {getExercise(progress.suggest).name} ›</Body>
            </Pressable>
          )}
          <Button label="Delete" kind="ghost" onPress={() => deleteSession(log.id)} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  chart: { height: 80, flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 4 },
  barColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: Palette.tonal, minHeight: 3, borderRadius: 3 },
  barToday: { backgroundColor: Palette.accent },
  axis: { fontSize: 12 },
});
