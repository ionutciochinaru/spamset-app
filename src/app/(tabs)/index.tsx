import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FigureViewer } from '@/components/figure-viewer';
import { Blink, Body, Button, Card, Heading, Label, Meter, PixelText, Stage, Stat, Tag, Thumb, Title } from '@/components/ui';
import { workoutMinutes } from '@/components/workout-card';
import { DisplayFont, MaxContentWidth, Palette, PixelSize, Psx, Radius, Spacing } from '@/constants/theme';
import { getExercise } from '@/core/exercises';
import { dayStreak, totalReps, volumeKg } from '@/core/session';
import { clockText, planSpamsets, spamCandidates, upcomingTimes } from '@/core/spamset';
import { BLOCK_LABELS, PRESET_WORKOUTS, workoutEquipment, workoutExercises, workoutFocus } from '@/core/workouts';
import { openSpamset, useTargetText } from '@/lib/spamset-scheduler';
import { formatLoad, ownedEquipment, spamSchedule, SPAMSET_WORKOUT_ID, useApp } from '@/store/app-store';

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Re-render every `ms`, for the countdown. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "00:42:13" within a day, otherwise "MON 09:00". */
function countdown(at: Date, now: Date): string {
  const s = Math.max(0, Math.floor((at.getTime() - now.getTime()) / 1000));
  if (s < 86400) return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  return `${at.toLocaleDateString('en', { weekday: 'short' }).toUpperCase()} ${clockText(at.getHours() * 60 + at.getMinutes())}`;
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const sessions = useApp((s) => s.sessions);
  const customWorkouts = useApp((s) => s.customWorkouts);
  const settings = useApp((s) => s.settings);
  const owned = useMemo(() => ownedEquipment(settings), [settings]);
  const schedule = spamSchedule(settings);
  const target = useTargetText();
  const now = useNow(1000);

  const next = planSpamsets(schedule, owned, now, 1)[0];
  // With spam sets off, still show one to try, picked once per hour.
  const tryable = spamCandidates({ ...schedule, pool: schedule.pool.length ? schedule.pool : ['bodyweight'] }, owned);
  const fallback = tryable[Math.floor(now.getTime() / 3600000) % Math.max(1, tryable.length)];
  const featured = next?.exercise ?? fallback;
  const exercise = featured ? getExercise(featured) : undefined;

  // Today's spam sets as a meter: done out of scheduled (at least what you've done).
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const slotsToday = schedule.enabled
    ? upcomingTimes(schedule, new Date(dayStart.getTime() - 1), 200, 0).filter((t) => t.getDate() === dayStart.getDate()).length
    : 0;

  const streak = useMemo(() => dayStreak(sessions), [sessions]);
  const week = useMemo(() => {
    const since = startOfWeek().toISOString();
    const recent = sessions.filter((s) => s.startedAt >= since);
    const today = new Date().toDateString();
    return {
      count: recent.filter((s) => s.workoutId !== SPAMSET_WORKOUT_ID).length,
      spam: sessions.filter((s) => s.workoutId === SPAMSET_WORKOUT_ID && new Date(s.startedAt).toDateString() === today).length,
      volume: recent.reduce((sum, s) => sum + volumeKg(s), 0),
      reps: recent.reduce((sum, s) => sum + totalReps(s), 0),
    };
  }, [sessions]);

  // Main quest: the training session done least recently that your equipment allows.
  const quest = useMemo(() => {
    const all = [...PRESET_WORKOUTS, ...customWorkouts].filter(
      (w) => workoutFocus(w) !== 'mobility' && workoutEquipment(w).every((e) => owned.includes(e)),
    );
    const lastDone = (id: string) => sessions.find((s) => s.workoutId === id)?.startedAt ?? '';
    return [...all].sort((a, b) => lastDone(a.id).localeCompare(lastDone(b.id)))[0];
  }, [sessions, customWorkouts, owned]);

  const date = now.toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase().replace(',', '');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + 110 }}>
      <View style={styles.column}>
        {/* Header: wordmark and streak are the HUD moments; the date is plain. */}
        <View style={styles.hud}>
          <View style={{ gap: 6 }}>
            <Label>{date}</Label>
            <PixelText size={PixelSize.large} color={Palette.accent}>
              SPAMSET
            </PixelText>
          </View>
          <View style={[styles.streak, streak > 0 && styles.streakOn]} accessibilityLabel={`${streak} day streak`}>
            <PixelText size={PixelSize.medium} color={streak ? Psx.hud : Palette.dim}>
              {streak}
            </PixelText>
            <Text style={styles.streakLabel}>day streak</Text>
          </View>
        </View>

        {/* Next spam set: the game hub moment. */}
        {exercise && featured && (
          <Stage>
            <Pressable onPress={() => openSpamset(featured)} accessibilityLabel={`Start ${exercise.name}`}>
              <View>
                <FigureViewer clipId={exercise.animation} controls={false} scan={false} style={styles.stage} />
                <View style={styles.stageTop} pointerEvents="none">
                  <Label color={Psx.cyan}>{next ? 'Next spam set' : 'Try a spam set'}</Label>
                  {next && (
                    <PixelText size={PixelSize.medium} color={Psx.hud}>
                      {countdown(next.at, now)}
                    </PixelText>
                  )}
                </View>
                <View style={styles.stageBottom} pointerEvents="none">
                  <Title style={{ fontSize: 28, lineHeight: 32 }}>{exercise.name}</Title>
                  <View style={styles.stageRow}>
                    <PixelText size={PixelSize.medium} color={Palette.accent}>
                      {target(featured).toUpperCase()}
                    </PixelText>
                    <Blink>
                      <PixelText size={PixelSize.small}>PRESS START</PixelText>
                    </Blink>
                  </View>
                </View>
              </View>
            </Pressable>
          </Stage>
        )}
        {featured && <Button label="Start spam set" large onPress={() => openSpamset(featured)} />}
        <Pressable onPress={() => router.push('/spamset-settings')} accessibilityRole="button" style={styles.status}>
          <Body muted style={{ fontSize: 14, color: schedule.enabled ? Palette.muted : Psx.hud }}>
            {schedule.enabled
              ? `Every ${schedule.every < 60 ? `${schedule.every} min` : `${schedule.every / 60} h`}, ${clockText(schedule.start)}–${clockText(schedule.end)} ›`
              : 'Spam sets are off. Turn them on ›'}
          </Body>
        </Pressable>

        {/* This week, with today's spam sets as a charge meter. */}
        <Card>
          <Label>This week</Label>
          <View style={styles.counters}>
            <Stat label="Sessions" value={String(week.count)} />
            <Stat label="Reps" value={String(week.reps)} />
            <Stat label="Volume" value={week.volume ? formatLoad(week.volume, settings.units) : '0'} />
          </View>
          {slotsToday + week.spam > 0 && (
            <View style={{ gap: 8, marginTop: 4 }}>
              <View style={styles.hud}>
                <Label>Spam sets today</Label>
                <PixelText size={PixelSize.small} color={Psx.hud}>
                  {week.spam}/{Math.max(slotsToday, week.spam)}
                </PixelText>
              </View>
              <Meter value={week.spam} max={Math.min(24, Math.max(slotsToday, week.spam))} />
            </View>
          )}
        </Card>

        {/* Up next: the suggested workout. */}
        {quest && (
          <Card>
            <Pressable onPress={() => router.push({ pathname: '/workout/[id]', params: { id: quest.id } })} style={{ gap: 10 }}>
              <View style={styles.hud}>
                <Label>Up next</Label>
                <Body muted style={{ fontSize: 14 }}>
                  ~{workoutMinutes(quest)} min
                </Body>
              </View>
              <Heading style={{ fontSize: 22, lineHeight: 28 }}>{quest.name}</Heading>
              <View style={styles.counters}>
                {[...new Set(quest.blocks.map((b) => BLOCK_LABELS[b.kind]))].map((k) => (
                  <Tag key={k} label={k} accent />
                ))}
              </View>
              <View style={styles.thumbs}>
                {workoutExercises(quest)
                  .slice(0, 4)
                  .map((id) => (
                    <Thumb key={id} clip={getExercise(id).animation} style={{ flex: 1 }} />
                  ))}
              </View>
            </Pressable>
            <Button label={`Start ${quest.name}`} kind="go" onPress={() => router.push({ pathname: '/session', params: { workout: quest.id } })} />
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.bg },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three, gap: Spacing.three },
  hud: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  stage: { borderRadius: 0, borderWidth: 0, aspectRatio: 0.95 },
  streak: { alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.button, backgroundColor: Palette.panel },
  streakOn: { backgroundColor: 'rgba(255,210,63,0.1)' },
  streakLabel: { color: Palette.muted, fontFamily: DisplayFont.semibold, fontSize: 11 },
  stageTop: { position: 'absolute', top: 14, left: 16, right: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  stageBottom: { position: 'absolute', bottom: 16, left: 16, right: 16, gap: 10 },
  stageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { alignItems: 'center', paddingVertical: 6, minHeight: 32, justifyContent: 'center' },
  counters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  thumbs: { flexDirection: 'row', gap: 6 },
});
