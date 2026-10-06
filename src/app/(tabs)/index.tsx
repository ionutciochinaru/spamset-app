import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FigureViewer } from '@/components/figure-viewer';
import { Body, Button, Card, ExerciseTrainingPreview, Glow, IconButton, Label, MemeText, PixelText, Row, ScreenHeader, Stage, StatBar, Thumb, Title, Well, YouTubeSearchButton } from '@/components/ui';
import { DisplayFont, MaxContentWidth, Palette, PixelSize, Psx, Radius, Spacing } from '@/constants/theme';
import { pickCelebration } from '@/core/celebrations';
import { getExerciseTraining } from '@/core/exercise-training';
import { getExercise } from '@/core/exercises';
import { hudStats, memeCaption, rankTitle, xpState } from '@/core/xp';
import { clockText, planSpamsets, setsPerDay, spamCandidates, swapPick, timeText } from '@/core/spamset';
import { openSpamset, useTargetText } from '@/lib/spamset-scheduler';
import { ownedEquipment, spamSchedule, SPAMSET_WORKOUT_ID, useApp } from '@/store/app-store';

/** Keep the next scheduled set and today's totals current. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
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

  // Today's spam sets as a meter: done out of the full daily schedule.
  const slotsToday = schedule.enabled && schedule.days.includes(now.getDay()) ? setsPerDay(schedule) : 0;

  const todays = sessions.filter(
    (s) => s.workoutId === SPAMSET_WORKOUT_ID && s.entries.length && new Date(s.startedAt).toDateString() === now.toDateString(),
  );

  // Celebrate only after completing the full target shown in today's counter.
  const dailyTargetMet = slotsToday > 0 && todays.length >= slotsToday;
  const lastSet = todays.reduce<(typeof todays)[number] | undefined>((a, s) => (!a || s.startedAt > a.startedAt ? s : a), undefined);
  const celebration = dailyTargetMet && lastSet ? pickCelebration(lastSet.id) : undefined;
  const training = exercise && !celebration ? getExerciseTraining(exercise) : undefined;

  // Recomputed hourly (and on every new set), so a day rolling over shows up.
  const hour = now.getHours();
  const xp = useMemo(() => xpState(sessions, new Date()), [sessions, hour]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = hudStats(xp, todays.length, slotsToday);

  const date = now.toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase().replace(',', '');

  const previewFigure = exercise && (
    <View>
      <FigureViewer
        key={celebration?.id ?? exercise.animation}
        clipId={celebration?.id ?? exercise.animation}
        auraKind={celebration?.aura}
        auraFx={celebration?.fx}
        locked={!!celebration}
        controls={false}
        style={styles.stage}
      />
      {celebration && (
        <View style={styles.caption} pointerEvents="none">
          <MemeText>{memeCaption(xp, stats, todays.length)}</MemeText>
        </View>
      )}
    </View>
  );
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
              {/* Player HUD: who you are in the game. */}
              <View style={styles.player}>
                <View style={styles.hud}>
                  <View style={styles.rankSummary}>
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
                    <Row>
                      <StatBar label="Next rank" showLabel={false} value={stats.strength} valueLabel={`${xp.levelXp}/${xp.levelSize}`} color="#e5483b" icon={{ ios: 'bolt.fill', md: 'bolt' }} />
                    </Row>
                  </View>
                  {/* Today's counter: done out of what the schedule sends today. */}
                  <View
                    style={[styles.counter, todays.length > 0 && styles.counterOn]}
                    accessibilityLabel={slotsToday ? `${todays.length} of ${slotsToday} spam sets today` : `${todays.length} spam sets today`}>
                    <PixelText size={PixelSize.medium} color={dailyTargetMet ? Psx.cyan : todays.length ? Psx.hud : Palette.dim}>
                      {slotsToday ? `${todays.length}/${slotsToday}` : todays.length}
                    </PixelText>
                    <Text style={styles.counterLabel}>sets today</Text>
                  </View>
                </View>
              </View>

              {training ? (
                <ExerciseTrainingPreview exercise={exercise} training={training}>
                  {previewFigure}
                </ExerciseTrainingPreview>
              ) : (
                previewFigure
              )}
              <View style={styles.stageAction}>
                <Well style={styles.timer}>
                  <YouTubeSearchButton query={exercise.name} />
                  <View style={styles.timerDetails}>
                    <Title style={{ fontSize: 24, lineHeight: 28 }}>{exercise.name}</Title>
                    {next && (
                      <Row style={styles.timerSchedule}>
                        <Label>Next at:</Label>
                        <Text style={styles.timerClock}>
                          {timeText(next.at)}
                        </Text>
                      </Row>
                    )}
                  </View>
                  {canSwap && (
                    <IconButton icon={{ ios: 'shuffle', md: 'shuffle' }} iconColor={Palette.bg} hint="Swap exercise" onPress={swap} style={styles.stageControl} />
                  )}
                </Well>
                <Button label={`${target(featured)} · Do it now`} large onPress={() => openSpamset(featured)} />
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
  levelBadge: { backgroundColor: Palette.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  stageControl: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff' },
  timer: { paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  timerDetails: { flex: 1, minWidth: 0, gap: 8 },
  timerSchedule: { flexWrap: 'wrap', gap: 8 },
  timerClock: { color: Palette.text, fontFamily: DisplayFont.bold, fontSize: 16 },
  stageAction: { padding: 16, gap: 12 },
  hero: { boxShadow: '0 0 0 1px rgba(255,107,43,0.25), 0 12px 40px rgba(255,107,43,0.18)' },
  rank: { color: Psx.hud, fontFamily: DisplayFont.bold, fontSize: 20, flexShrink: 1 },
  rankSummary: { gap: 8, flex: 1, minWidth: 0 },
  player: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20, gap: 14 },
  caption: { position: 'absolute', left: 12, right: 12, bottom: 14 },
  thumbs: { flexDirection: 'row', gap: 6 },
});
