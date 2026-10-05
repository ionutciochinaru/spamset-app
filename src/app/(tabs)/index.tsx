import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FigureViewer } from '@/components/figure-viewer';
import { Body, Button, Card, Divider, Glow, HudCard, Icon, IconButton, Label, Meter, PixelText, Row, Stage, Stat, Thumb, Title, Well } from '@/components/ui';
import { DisplayFont, MaxContentWidth, Palette, PixelSize, Psx, Radius, Spacing } from '@/constants/theme';
import { getExercise } from '@/core/exercises';
import { totalReps, volumeKg } from '@/core/session';
import { xpState } from '@/core/xp';
import { clockText, planSpamsets, spamCandidates, swapPick, timeText, upcomingTimes } from '@/core/spamset';
import { openSpamset, useTargetText } from '@/lib/spamset-scheduler';
import { ownedEquipment, spamSchedule, SPAMSET_WORKOUT_ID, useApp } from '@/store/app-store';

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
  return `${at.toLocaleDateString('en', { weekday: 'short' }).toUpperCase()} ${timeText(at)}`;
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const sessions = useApp((s) => s.sessions);
  const settings = useApp((s) => s.settings);
  const owned = useMemo(() => ownedEquipment(settings), [settings]);
  const schedule = spamSchedule(settings);
  const target = useTargetText();
  const now = useNow(1000);

  const swaps = useApp((s) => s.spamSwaps);
  const swapSpamset = useApp((s) => s.swapSpamset);
  const next = planSpamsets(schedule, owned, now, 1, swaps)[0];
  // With spam sets off, still show one to try, picked once per hour (or swapped).
  const tryable = spamCandidates({ ...schedule, pool: schedule.pool.length ? schedule.pool : ['bodyweight'] }, owned);
  const [tryPick, setTryPick] = useState<string>();
  const fallback = tryPick ?? tryable[Math.floor(now.getTime() / 3600000) % Math.max(1, tryable.length)];
  const featured = next?.exercise ?? fallback;
  // Swap: the next scheduled set (its notification follows), or the one to try.
  const swap = () => {
    if (next) {
      const pick = swapPick(spamCandidates(schedule, owned), next.exercise);
      if (pick) swapSpamset(next.at, pick);
    } else setTryPick(swapPick(tryable, featured) ?? featured);
  };
  const canSwap = (next ? spamCandidates(schedule, owned) : tryable).length > 1;
  const exercise = featured ? getExercise(featured) : undefined;

  // Today's spam sets as a meter: done out of scheduled (at least what you've done).
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const slotsToday = schedule.enabled
    ? upcomingTimes(schedule, new Date(dayStart.getTime() - 1), 200, 0).filter((t) => t.getDate() === dayStart.getDate()).length
    : 0;

  const todays = sessions.filter(
    (s) => s.workoutId === SPAMSET_WORKOUT_ID && s.entries.length && new Date(s.startedAt).toDateString() === now.toDateString(),
  );

  // Recomputed hourly (and on every new set), so a day rolling over shows up.
  const hour = now.getHours();
  const xp = useMemo(() => xpState(sessions, new Date()), [sessions, hour]); // eslint-disable-line react-hooks/exhaustive-deps
  const streak = xp.streak;
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
    <View style={styles.screen}>
      <Glow height={420} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + 110 }}>
        <View style={styles.column}>
          {/* Player card: who you are in the game. Tapping it opens the boards. */}
          <HudCard onPress={() => router.push('/ranks')} label={`Level ${xp.level}, ${xp.total} XP, ${streak} day streak. Open ranks`}>
            <View style={styles.hud}>
              <View style={{ gap: 6 }}>
                <Label>{date}</Label>
                <PixelText size={PixelSize.large} color={Palette.accent}>
                  SPAMSET
                </PixelText>
              </View>
              <View style={[styles.streak, streak > 0 && styles.streakOn]}>
                <Row style={{ gap: 6 }}>
                  <Icon ios="flame.fill" md="local_fire_department" color={streak ? Psx.hud : Palette.dim} size={18} />
                  <PixelText size={PixelSize.medium} color={streak ? Psx.hud : Palette.dim}>
                    {streak}
                  </PixelText>
                </Row>
                <Text style={styles.streakLabel}>day streak</Text>
              </View>
            </View>

            {/* Level: XP from spam sets, the game's progress bar. */}
            <View style={styles.level}>
              <View style={styles.levelBadge}>
                <PixelText size={PixelSize.small} color="#000" style={{ textShadowColor: 'transparent' }}>
                  LV {xp.level}
                </PixelText>
              </View>
              <View style={{ flex: 1 }}>
                <Meter value={Math.round((xp.levelXp / xp.levelSize) * 12)} max={12} color={Psx.hud} />
              </View>
              <PixelText size={PixelSize.small} color={Palette.muted}>
                {xp.total} XP
              </PixelText>
            </View>

            <Divider />

            {/* This week's sets, reps and XP, and today's spam sets as a charge meter. */}
            <View style={{ gap: 12 }}>
              <View style={styles.weekRow}>
                <Stat inline label="Sets" value={String(week.count)} />
                <Stat inline label="Reps" value={String(week.reps)} />
                <Stat inline label="XP" value={String(xp.week)} />
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
            </View>
          </HudCard>

          {/* The schedule, or a way to turn it on; both open spam set settings. */}
          <Button
            label={
              schedule.enabled
                ? `Every ${schedule.every < 60 ? `${schedule.every} min` : `${schedule.every / 60} h`} · ${clockText(schedule.start)}–${clockText(schedule.end)}`
                : 'Spam sets are off · Turn on'
            }
            kind="tonal"
            onPress={() => router.push('/spamset-settings')}
          />

          {/* Next spam set: the game hub moment. */}
          {exercise && featured && (
            <Stage style={styles.hero} scan={false}>
              <Pressable onPress={() => openSpamset(featured)} accessibilityLabel={`Start ${exercise.name}`}>
                <View>
                  <FigureViewer clipId={exercise.animation} controls={false} style={styles.stage} />
                  <View style={styles.stageTop} pointerEvents="box-none">
                    {canSwap && (
                      <IconButton icon={{ ios: 'shuffle', md: 'shuffle' }} hint="Swap exercise" onPress={swap} style={styles.swap} />
                    )}
                  </View>
                </View>
              </Pressable>
              <View style={styles.stageAction}>
                <Well style={styles.timer}>
                  <Title style={{ fontSize: 24, lineHeight: 28 }}>{exercise.name}</Title>
                  {next && (
                    <View style={styles.hud}>
                      <Row style={{ gap: 8 }}>
                        <Label>Next at:</Label>
                        <Text style={styles.timerClock}>
                          {timeText(next.at)}
                        </Text>
                      </Row>
                      <PixelText size={PixelSize.medium} color={Psx.hud}>
                        {countdown(next.at, now)}
                      </PixelText>
                    </View>
                  )}
                </Well>
                <Button label={`Start spam set · ${target(featured)}`} large onPress={() => openSpamset(featured)} />
              </View>
            </Stage>
          )}

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
                    {timeText(new Date(s.startedAt))}
                  </Body>
                </Row>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.bg },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.three, gap: Spacing.three },
  hud: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  stage: { borderRadius: 0, borderWidth: 0, aspectRatio: 0.95 },
  streak: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.button,
    backgroundColor: Palette.panel,
  },
  streakOn: { backgroundColor: 'rgba(255,210,63,0.12)' },
  streakLabel: { color: Palette.muted, fontFamily: DisplayFont.semibold, fontSize: 11 },
  stageTop: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  level: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  levelBadge: { backgroundColor: Palette.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  swap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(48,49,43,0.9)' },
  timer: { paddingVertical: 12, paddingHorizontal: 14, gap: 8 },
  timerClock: { color: Palette.text, fontFamily: DisplayFont.bold, fontSize: 16 },
  stageAction: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  hero: { boxShadow: '0 0 0 1px rgba(255,107,43,0.25), 0 12px 40px rgba(255,107,43,0.18)' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  thumbs: { flexDirection: 'row', gap: 6 },
});
