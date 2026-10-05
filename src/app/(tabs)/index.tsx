import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FigureViewer } from '@/components/figure-viewer';
import { Body, Button, Card, Glow, IconButton, Label, MemeText, PixelText, Row, ScreenHeader, Stage, StatBar, Thumb, Title, Well } from '@/components/ui';
import { DisplayFont, MaxContentWidth, Palette, PixelSize, Psx, Radius, Spacing } from '@/constants/theme';
import { caughtUp, pickCelebration } from '@/core/celebrations';
import { getExercise } from '@/core/exercises';
import { hudStats, memeCaption, rankTitle, xpState } from '@/core/xp';
import { clockText, planSpamsets, setsPerDay, spamCandidates, swapPick, timeText } from '@/core/spamset';
import { openSpamset, useTargetText } from '@/lib/spamset-scheduler';
import { ownedEquipment, spamSchedule, SPAMSET_WORKOUT_ID, useApp } from '@/store/app-store';

/** Re-render every `ms`, for the countdown. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Bar colours, after the PS2 HUD: red, green, yellow, cyan. */
const HUD_COLORS = { strength: '#e5483b', stamina: '#43c24c', discipline: Psx.hud, reputation: Psx.cyan } as const;

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
  const tryable = spamCandidates(schedule, owned);
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
  const slotsToday = schedule.enabled && schedule.days.includes(now.getDay()) ? setsPerDay(schedule) : 0;

  const todays = sessions.filter(
    (s) => s.workoutId === SPAMSET_WORKOUT_ID && s.entries.length && new Date(s.startedAt).toDateString() === now.toDateString(),
  );

  // Caught up (your latest set answers the latest due slot): the figure celebrates instead.
  const lastSet = todays.reduce<(typeof todays)[number] | undefined>((a, s) => (!a || s.startedAt > a.startedAt ? s : a), undefined);
  const celebration = lastSet && caughtUp(schedule, new Date(lastSet.startedAt), now) ? pickCelebration(lastSet.id) : undefined;

  // Recomputed hourly (and on every new set), so a day rolling over shows up.
  const hour = now.getHours();
  const xp = useMemo(() => xpState(sessions, new Date()), [sessions, hour]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = hudStats(xp, todays.length, slotsToday);

  const date = now.toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase().replace(',', '');

  return (
    <View style={styles.screen}>
      <Glow height={420} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + 110 }}>
        <View style={styles.column}>

          {/* Header: date and wordmark; your picture opens Profile. */}
          <ScreenHeader
            title={
              <View style={{ gap: 6 }}>
                <Label>{date}</Label>
                <PixelText size={PixelSize.large} color={Palette.accent}>
                  SPAMSET
                </PixelText>
              </View>
            }
          />

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
              {/* Player HUD: who you are in the game. Tapping it opens the boards. */}
              <Pressable
                onPress={() => router.push('/ranks')}
                accessibilityRole="button"
                accessibilityLabel={`Level ${xp.level}, ${rankTitle(xp.level)}. Open ranks`}
                style={styles.player}>
                <View style={styles.hud}>
                  <View style={{ gap: 4, flex: 1 }}>
                    <Row style={{ gap: 10 }}>
                      <View style={styles.levelBadge}>
                        <PixelText size={PixelSize.small} color="#000" style={{ textShadowColor: 'transparent' }}>
                          LV {xp.level}
                        </PixelText>
                      </View>
                      <Text style={styles.rank} numberOfLines={1}>
                        {rankTitle(xp.level)}
                      </Text>
                    </Row>
                    <Text style={styles.rankNext}>
                      {xp.levelSize - xp.levelXp} XP to {rankTitle(xp.level + 1)}
                    </Text>
                  </View>
                  {/* Today's counter: done out of what the schedule sends today. */}
                  <View
                    style={[styles.counter, todays.length > 0 && styles.counterOn]}
                    accessibilityLabel={slotsToday ? `${todays.length} of ${slotsToday} spam sets today` : `${todays.length} spam sets today`}>
                    <PixelText size={PixelSize.medium} color={slotsToday > 0 && todays.length >= slotsToday ? Psx.cyan : todays.length ? Psx.hud : Palette.dim}>
                      {slotsToday ? `${todays.length}/${slotsToday}` : todays.length}
                    </PixelText>
                    <Text style={styles.counterLabel}>sets today</Text>
                  </View>
                </View>
                {/* PS2-era stat HUD: level, streak, today and the week as four bars. */}
                <View style={styles.stats}>
                  <StatBar label="Strength" value={stats.strength} color={HUD_COLORS.strength} icon={{ ios: 'bolt.fill', md: 'bolt' }} />
                  <StatBar label="Stamina" value={stats.stamina} color={HUD_COLORS.stamina} icon={{ ios: 'heart.fill', md: 'favorite' }} />
                  <StatBar label="Discipline" value={stats.discipline} color={HUD_COLORS.discipline} icon={{ ios: 'star.fill', md: 'star' }} />
                  <StatBar label="Reputation" value={stats.reputation} color={HUD_COLORS.reputation} icon={{ ios: 'crown.fill', md: 'military_tech' }} />
                </View>
              </Pressable>

              <Pressable onPress={() => openSpamset(featured)} accessibilityLabel={`Start ${exercise.name}`}>
                <View>
                  <FigureViewer
                    key={celebration?.id ?? exercise.animation}
                    clipId={celebration?.id ?? exercise.animation}
                    auraKind={celebration?.aura}
                    locked={!!celebration}
                    controls={false}
                    style={styles.stage}
                  />
                  <View style={styles.stageTop} pointerEvents="box-none">
                    {canSwap && (
                      <IconButton icon={{ ios: 'shuffle', md: 'shuffle' }} hint="Swap exercise" onPress={swap} style={styles.swap} />
                    )}
                  </View>
                  {/* The meme caption sits on the figure, like the screenshots it copies. */}
                  <View style={styles.caption} pointerEvents="none">
                    <MemeText>{memeCaption(xp, stats, todays.length)}</MemeText>
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
                <Button label={`${target(featured)} · Start`} large onPress={() => openSpamset(featured)} />
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
  counter: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.button,
    backgroundColor: Palette.panel,
  },
  counterOn: { backgroundColor: 'rgba(255,210,63,0.12)' },
  counterLabel: { color: Palette.muted, fontFamily: DisplayFont.semibold, fontSize: 11 },
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
  levelBadge: { backgroundColor: Palette.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  swap: { backgroundColor: 'rgba(48,49,43,0.9)' },
  timer: { paddingVertical: 12, paddingHorizontal: 14, gap: 8 },
  timerClock: { color: Palette.text, fontFamily: DisplayFont.bold, fontSize: 16 },
  stageAction: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  hero: { boxShadow: '0 0 0 1px rgba(255,107,43,0.25), 0 12px 40px rgba(255,107,43,0.18)' },
  rank: { color: Psx.hud, fontFamily: DisplayFont.bold, fontSize: 20, flexShrink: 1 },
  rankNext: { color: Palette.muted, fontSize: 12 },
  player: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 14 },
  caption: { position: 'absolute', left: 12, right: 12, bottom: 14 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 12 },
  thumbs: { flexDirection: 'row', gap: 6 },
});
