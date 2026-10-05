/**
 * Animation review page. Inspect every 3D clip from fixed camera angles,
 * frame by frame, read the reviewer agents' scores, and record your own
 * 1–10 score and note per exercise (exportable as JSON).
 *
 * Lists every exported clip: the app's kettlebell lifts and, after
 * `export_3d.py --review`, every Spamset exercise with its validator v2 result.
 *
 * Capture mode renders only the figure for evidence screenshots:
 *   /debug/animations?capture=1&clip=kb-swing&phase=0.25&az=0&el=10
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from 'react-native';

import { clips } from '@/animation/clips';
import type { ReviewBundle } from '@/animation/review-types';
import { ROLE_LABELS } from '@/animation/review-types';
import reviewsJson from '@/animation/reviews.json';
import { ANIMATION_REVISION, CELEBRATION_REVISION } from '@/animation/revision';
import { REVIEW_CATALOG } from '@/animation/review-catalog';
import { FigureViewer } from '@/components/figure-viewer';
import { Body, Button, Card, Heading, Label, Row, Screen, ScreenHeader } from '@/components/ui';
import { Palette, Radius } from '@/constants/theme';
import { getCelebration } from '@/core/celebrations';
import { useApp } from '@/store/app-store';

const reviews = reviewsJson as ReviewBundle;

/** Camera presets in degrees. Azimuth 0 looks at the figure's front; 90 at its left side. */
const VIEWS = [
  { label: 'Default', azimuth: undefined, elevation: undefined },
  { label: 'Front', azimuth: 0, elevation: 8 },
  { label: '¾ left', azimuth: 45, elevation: 12 },
  { label: 'Left', azimuth: 90, elevation: 5 },
  { label: 'Right', azimuth: -90, elevation: 5 },
  { label: 'Back', azimuth: 180, elevation: 8 },
  { label: 'Top', azimuth: 30, elevation: 70 },
] as const;

const SPEEDS = [0.25, 0.5, 1];

/** Exported clips in catalog order, grouped as in Spamset's exercise list. */
const ENTRIES = REVIEW_CATALOG.filter((e) => clips[e.id]);
const GROUPS = ['all', 'failing', ...Array.from(new Set(ENTRIES.map((e) => e.group)))];
const GROUP_LABELS: Record<string, string> = {
  all: 'All', failing: 'Failing check', bodyweight: 'Bodyweight', stretching: 'Stretching', chair: 'Chair',
  kettlebell: 'Kettlebell', dumbbells: 'Dumbbells', band: 'Band', 'pullup-bar': 'Pull-up bar', doorframe: 'Doorframe',
  celebration: 'Celebrations',
};
const passed = (id: string) => clips[id]?.validator?.passed !== false;
/** Celebrations are revised apart from the exercises, so new poses never make exercise ratings stale. */
const revisionOf = (id: string) => (getCelebration(id) ? CELEBRATION_REVISION : ANIMATION_REVISION);

export default function AnimationReview() {
  const params = useLocalSearchParams<{ capture?: string; clip?: string; phase?: string; az?: string; el?: string }>();
  if (params.capture) {
    return (
      <Capture
        initial={{
          clip: params.clip ?? 'kb-swing',
          phase: Number(params.phase ?? 0),
          az: Number(params.az ?? 0),
          el: Number(params.el ?? 8),
        }}
      />
    );
  }
  return <ReviewPage initial={params.clip} />;
}

type CaptureState = { clip: string; phase: number; az: number; el: number; zoom?: number; focus?: string };

/** Full-bleed figure only. On web, scripts can call window.__capture({...}) to repose without reloading. */
function Capture({ initial }: { initial: CaptureState }) {
  const [state, setState] = useState(initial);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const w = window as unknown as { __capture?: (next: Partial<CaptureState>) => void };
    w.__capture = (next) => setState((s) => ({ ...s, ...next }));
    return () => {
      delete w.__capture;
    };
  }, []);
  return (
    <View style={styles.capture}>
      <FigureViewer
        aura={false}
        key={state.clip}
        clipId={state.clip}
        controls={false}
        scan={false}
        phase={state.phase}
        view={{ azimuth: state.az, elevation: state.el }}
        zoom={state.zoom}
        focus={state.focus}
        style={styles.captureViewer}
      />
    </View>
  );
}

function ReviewPage({ initial }: { initial?: string }) {
  const [clipId, setClipId] = useState(initial && clips[initial] ? initial : ENTRIES[0].id);
  const [group, setGroup] = useState('all');
  const [viewIndex, setViewIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [phase, setPhase] = useState(0);
  const [live, setLive] = useState(0);
  const ratings = useApp((s) => s.animationReviews);
  const rate = useApp((s) => s.rateAnimation);
  useEffect(() => {
    if (Platform.OS === 'web') document.title = `Animation review ${ANIMATION_REVISION}`;
  }, []);

  const clip = clips[clipId];
  const listed = ENTRIES.filter((e) => group === 'all' || (group === 'failing' ? !passed(e.id) : e.group === group));
  const failingCount = ENTRIES.filter((e) => !passed(e.id)).length;
  const frames = clip.frames.length;
  const view = VIEWS[viewIndex];
  const shown = paused ? phase : live;
  const rating = ratings[clipId];
  const revision = revisionOf(clipId);
  const staleRating = rating && rating.revision !== revision;

  const step = (delta: number) => {
    setPaused(true);
    setPhase((p) => ((Math.round(p * frames) + delta + frames) % frames) / frames);
  };

  const exportRatings = async () => {
    const payload = JSON.stringify({ revision: ANIMATION_REVISION, celebrationRevision: CELEBRATION_REVISION, exportedAt: new Date().toISOString(), ratings }, null, 2);
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `animation-ratings-${ANIMATION_REVISION}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      await Share.share({ message: payload });
    }
  };

  return (
    <Screen>
      <ScreenHeader title={`Animation review ${ANIMATION_REVISION}`} back />
      {reviews.revision && reviews.revision !== ANIMATION_REVISION ? (
        <Body muted style={{ fontSize: 13 }}>Agent reviews are for revision {reviews.revision}</Body>
      ) : null}
      <Body muted style={{ fontSize: 13 }}>
        {ENTRIES.length} animations · {ENTRIES.length - failingCount} pass validator v2 · {failingCount} failing
      </Body>
      <Row style={{ flexWrap: 'wrap' }}>
        {GROUPS.map((g) => (
          <Chip key={g} label={GROUP_LABELS[g] ?? g} active={group === g} onPress={() => setGroup(g)} />
        ))}
      </Row>
      <Row style={{ flexWrap: 'wrap', gap: 6 }}>
        {listed.map((e) => (
          <Chip
            key={e.id}
            label={`${passed(e.id) ? '' : '✗ '}${e.name}`}
            active={e.id === clipId}
            onPress={() => {
              setClipId(e.id);
              setPhase(0);
            }}
          />
        ))}
      </Row>
      <Heading style={{ fontSize: 18 }}>{ENTRIES.find((e) => e.id === clipId)?.name ?? clipId}</Heading>
      {clip.validator && !clip.validator.passed ? (
        <Body style={{ color: Palette.accent, fontSize: 13 }}>Validator v2: {clip.validator.failures.join('; ')}</Body>
      ) : clip.validator ? (
        <Body muted style={{ fontSize: 13 }}>Validator v2: pass</Body>
      ) : null}

      <View>
        <FigureViewer
          key={clip.id}
          aura={false}
          auraKind={getCelebration(clip.id)?.aura}
          loop
          clipId={clip.id}
          controls={false}
          view={view.azimuth === undefined ? undefined : { azimuth: view.azimuth, elevation: view.elevation }}
          phase={paused ? phase : undefined}
          speed={speed}
          onPhase={setLive}
        />
        <Text style={styles.readout} pointerEvents="none">
          phase {shown.toFixed(3)} · frame {Math.round(shown * frames) % frames}/{frames} · {(shown * clip.duration).toFixed(2)} s
        </Text>
      </View>

      <Scrubber
        value={shown}
        onChange={(p) => {
          setPaused(true);
          setPhase(p);
        }}
      />
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label="◀" onPress={() => step(-1)} />
        <Chip
          label={paused ? 'Play' : 'Pause'}
          active={!paused}
          onPress={() => {
            if (!paused) setPhase(live);
            setPaused(!paused);
          }}
        />
        <Chip label="▶" onPress={() => step(1)} />
        {SPEEDS.map((s) => (
          <Chip key={s} label={`${s}×`} active={speed === s} onPress={() => setSpeed(s)} />
        ))}
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        {VIEWS.map((v, i) => (
          <Chip key={v.label} label={v.label} active={viewIndex === i} onPress={() => setViewIndex(i)} />
        ))}
      </Row>

      <Card>
        <Label>Your score</Label>
        <Row style={{ flexWrap: 'wrap', gap: 6 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <Pressable
              key={n}
              accessibilityLabel={`Score ${n}`}
              onPress={() => rate(clipId, { score: n, note: rating?.note ?? '', revision })}
              style={[styles.score, rating?.score === n && styles.scoreActive]}>
              <Text style={[styles.scoreText, rating?.score === n && styles.scoreTextActive]}>{n}</Text>
            </Pressable>
          ))}
        </Row>
        <TextInput
          value={rating?.note ?? ''}
          onChangeText={(note) => rate(clipId, { score: rating?.score ?? 0, note, revision })}
          placeholder="What looks wrong? Mention the view and phase (use the readout above)."
          placeholderTextColor={Palette.dim}
          multiline
          style={styles.note}
        />
        {staleRating && (
          <Body style={{ color: Palette.accent, fontSize: 13 }}>
            This rating was for revision {rating.revision}; the animation has changed since.
          </Body>
        )}
      </Card>

      <Card>
        <Label>Agent reviews</Label>
        {!reviews.reviewers.length && <Body muted>No agent reviews bundled yet.</Body>}
        {reviews.reviewers.map((r) => {
          const review = r.exercises[clipId];
          return (
            <View key={r.role} style={styles.review}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Heading style={{ fontSize: 16 }}>{ROLE_LABELS[r.role]}</Heading>
                <Text style={[styles.badge, review && review.score < 8 && styles.badgeLow]}>
                  {review ? `${review.score}/10 · ${review.confidence}` : '—'}
                </Text>
              </Row>
              {review && <Body style={{ fontSize: 14 }}>{review.summary}</Body>}
              {review?.defects.map((d, i) => (
                <Body key={i} muted style={{ fontSize: 13 }}>
                  • {[d.view, d.phase].filter(Boolean).join(' @ ')}
                  {d.view || d.phase ? ': ' : ''}
                  {d.issue}
                  {d.fix ? ` → ${d.fix}` : ''}
                </Body>
              ))}
            </View>
          );
        })}
      </Card>

      <Card>
        <Label>All animations</Label>
        <Row style={styles.tableHead}>
          <Text style={[styles.cell, styles.nameCell, styles.head]}>Exercise</Text>
          {(['form', 'visuals', 'anatomy'] as const).map((role) => (
            <Text key={role} style={[styles.cell, styles.head]}>
              {{ form: 'Form', visuals: 'Visuals', anatomy: 'Anatomy' }[role]}
            </Text>
          ))}
          <Text style={[styles.cell, styles.head]}>Check</Text>
          <Text style={[styles.cell, styles.head]}>You</Text>
        </Row>
        {listed.map((e) => (
          <Pressable key={e.id} onPress={() => setClipId(e.id)} style={[styles.tableRow, e.id === clipId && { backgroundColor: Palette.tonal }]}>
            <Text style={[styles.cell, styles.nameCell]} numberOfLines={1}>
              {e.name}
            </Text>
            {(['form', 'visuals', 'anatomy'] as const).map((role) => {
              const score = reviews.reviewers.find((r) => r.role === role)?.exercises[e.id]?.score;
              return (
                <Text key={role} style={[styles.cell, score !== undefined && score < 8 && { color: Palette.accent }]}>
                  {score ?? '—'}
                </Text>
              );
            })}
            <Text style={[styles.cell, !passed(e.id) && { color: Palette.accent }]}>{passed(e.id) ? '✓' : '✗'}</Text>
            <Text style={styles.cell}>{ratings[e.id]?.score || '—'}</Text>
          </Pressable>
        ))}
      </Card>

      <Button label="Export my ratings (JSON)" kind="tonal" onPress={exportRatings} />
    </Screen>
  );
}

function Scrubber({ value, onChange }: { value: number; onChange: (phase: number) => void }) {
  const [width, setWidth] = useState(1);
  const at = (e: GestureResponderEvent) => onChange(Math.min(0.999, Math.max(0, e.nativeEvent.locationX / width)));
  return (
    <View
      style={styles.track}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={at}
      onResponderMove={at}
      accessibilityRole="adjustable"
      accessibilityLabel="Animation phase">
      <View style={[styles.fill, { width: `${value * 100}%` }]} pointerEvents="none" />
      <View style={[styles.thumb, { left: `${value * 100}%` }]} pointerEvents="none" />
    </View>
  );
}

function Chip({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capture: { flex: 1, backgroundColor: Palette.stage, alignItems: 'center', justifyContent: 'center' },
  captureViewer: { width: '100%', height: '100%', aspectRatio: undefined, borderRadius: 0, borderWidth: 0 },
  readout: { position: 'absolute', top: 10, left: 12, color: Palette.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  track: { height: 28, justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, height: 4, backgroundColor: Palette.accent, borderRadius: 2 },
  thumb: { position: 'absolute', width: 18, height: 18, marginLeft: -9, borderRadius: 9, backgroundColor: Palette.text },
  chip: { backgroundColor: Palette.tonal, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.pill },
  chipActive: { backgroundColor: Palette.text },
  chipText: { color: Palette.text, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: Palette.bg },
  score: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.tonal, alignItems: 'center', justifyContent: 'center' },
  scoreActive: { backgroundColor: Palette.accent },
  scoreText: { color: Palette.text, fontWeight: '800' },
  scoreTextActive: { color: Palette.bg },
  note: { color: Palette.text, backgroundColor: Palette.bg, borderRadius: Radius.button, padding: 12, minHeight: 80, fontSize: 15, textAlignVertical: 'top' },
  review: { gap: 4, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.track },
  badge: { color: Palette.text, fontWeight: '800' },
  badgeLow: { color: Palette.accent },
  tableHead: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Palette.track, paddingBottom: 6 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
  cell: { color: Palette.text, width: 56, textAlign: 'center', fontVariant: ['tabular-nums'] },
  nameCell: { flex: 1, textAlign: 'left', paddingLeft: 6 },
  head: { color: Palette.muted, fontSize: 12, fontWeight: '700' },
});
