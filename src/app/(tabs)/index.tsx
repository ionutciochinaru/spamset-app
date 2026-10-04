import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FigureViewer } from '@/components/figure-viewer';
import { Blink, Body, Button, Card, Label, Meter, PixelText, Row, Stage, Stat, Thumb, Title } from '@/components/ui';
import { DisplayFont, MaxContentWidth, Palette, PixelSize, Psx, Radius, Spacing } from '@/constants/theme';
import { getExercise } from '@/core/exercises';
import { dayStreak, totalReps, volumeKg } from '@/core/session';
import { clockText, planSpamsets, spamCandidates, upcomingTimes } from '@/core/spamset';
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

  const todays = sessions.filter(
    (s) => s.workoutId === SPAMSET_WORKOUT_ID && s.entries.length && new Date(s.startedAt).toDateString() === now.toDateString(),
  );

  const streak = useMemo(() => dayStreak(sessions), [sessions]);
  const week = useMemo(() => {
    const since = startOfWeek().toISOString();
    const recent = sessions.filter((s) => s.startedAt >= since);
    const today = new Date().toDateString();
    return {
      count: recent.length,
      spam: sessions.filter((s) => s.workoutId === SPAMSET_WORKOUT_ID && new Date(s.startedAt).toDateString() === today).length,
      volume: recent.reduce((sum, s) => sum + volumeKg(s), 0),
      reps: recent.reduce((sum, s) => sum + totalReps(s), 0),
    };
  }, [sessions]);


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
            <Stat label="Spam sets" value={String(week.count)} />
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

        {/* Today's spam sets. */}
        {todays.length > 0 && (
          <Card onPress={() => router.push('/history')}>
            <View style={styles.hud}>
              <Label>Done today</Label>
              <Body muted style={{ fontSize: 14 }}>
                History ›
              </Body>
            </View>
            {todays.slice(0, 5).map((s) => (
              <Row key={s.id}>
                <Thumb clip={getExercise(s.entries[0].exercise).animation} size={40} />
                <Body style={{ flex: 1 }}>{getExercise(s.entries[0].exercise).name}</Body>
                <Body muted style={{ fontSize: 14 }}>
                  {new Date(s.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </Body>
              </Row>
            ))}
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
