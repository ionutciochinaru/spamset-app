import { useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DisplayFont, Palette, Psx } from '@/constants/theme';
import type { ExerciseTraining } from '@/core/exercise-training';
import type { Exercise } from '@/core/exercises';
import { getExerciseTracking, getTrackingLabelPlacement, type LabelPlacement } from '@/core/exercise-tracking';
import type { TrackedPoint, TrackingFrame, TrainingTracking } from '@/components/training-tracking';

type Point = { x: number; y: number };

function centroid(frame: TrackingFrame, names: readonly string[]): TrackedPoint | undefined {
  const points = names.map((name) => frame[name]).filter((point): point is TrackedPoint => !!point);
  if (!points.length) return undefined;
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
}

function at(point: TrackedPoint | undefined, width: number, height: number): Point | undefined {
  return point ? { x: point.x * width, y: point.y * height } : undefined;
}

function noteStyle(placement: LabelPlacement, labelWidth: number) {
  return { width: labelWidth, top: placement.top, ...(placement.side === 'left' ? { left: 12 } : { right: 12 }) };
}

function leaderStart(placement: LabelPlacement, labelWidth: number, width: number): Point {
  return { x: placement.side === 'left' ? labelWidth + 17 : width - labelWidth - 17, y: placement.top + 26 };
}

function Leader({ from, to, color }: { from: Point; to: Point; color: string }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return <View style={{ position: 'absolute', left: (from.x + to.x - length) / 2, top: (from.y + to.y) / 2, width: length, height: 1, backgroundColor: color, opacity: 0.58, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
}

function Target({ point, color, id }: { point: Point; color: string; id: number }) {
  return (
    <View testID={`training-tracking-target-${id}`} style={{ position: 'absolute', left: point.x - 10, top: point.y - 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: color, opacity: 0.15 }} />
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

function TrackingBox({ frame, width, height }: { frame: TrackingFrame; width: number; height: number }) {
  const points = ['shoulder_l', 'shoulder_r', 'hip_l', 'hip_r'].map((name) => at(frame[name], width, height)).filter((point): point is Point => !!point);
  if (points.length < 3) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const boxWidth = Math.max(32, maxX - minX + 18);
  const boxHeight = Math.max(32, maxY - minY + 18);
  const left = (minX + maxX - boxWidth) / 2;
  const top = (minY + maxY - boxHeight) / 2;
  return (
    <View style={{ position: 'absolute', left, top, width: boxWidth, height: boxHeight }}>
      <View style={[styles.corner, styles.topLeft]} />
      <View style={[styles.corner, styles.topRight]} />
      <View style={[styles.corner, styles.bottomLeft]} />
      <View style={[styles.corner, styles.bottomRight]} />
    </View>
  );
}

/** Text stays readable at the frame edges while the thin marks follow the sampled pose. */
export function TrainingTrackingOverlay({
  tracking,
  width,
  height,
  exercise,
  training,
  topSafe,
}: {
  tracking: TrainingTracking;
  width: number;
  height: number;
  exercise: Pick<Exercise, 'id' | 'kind' | 'pattern' | 'primary' | 'support'>;
  training: ExerciseTraining;
  topSafe: number;
}) {
  const frame = useSyncExternalStore(tracking.subscribe, tracking.getSnapshot, tracking.getSnapshot);
  const [noteHeights, setNoteHeights] = useState({ training: 130, muscles: 90 });
  const wide = width > 560;
  const labelWidth = wide ? Math.min(188, width * 0.24) : Math.min(124, Math.max(105, width * 0.29));
  const trackingSpec = getExerciseTracking(exercise);
  const placement = getTrackingLabelPlacement(trackingSpec.layout, width, height, noteHeights.training, noteHeights.muscles, topSafe);
  const first = at(centroid(frame, trackingSpec.focusJoints), width, height);
  const second = at(centroid(frame, trackingSpec.muscleJoints), width, height);
  const effectsLabel = training.effectsLabel ?? 'Builds';
  const summary = `Training focus: ${training.focus}. Cardio: ${training.cardio}. ${effectsLabel}: ${training.effects.join(', ')}. Main muscles: ${exercise.primary.join(', ')}. Also works: ${exercise.support.join(', ')}.`;
  return (
    <View pointerEvents="none" accessible accessibilityLabel={summary} style={StyleSheet.absoluteFill}>
      {width > 0 && height > 0 && <>
        <TrackingBox frame={frame} width={width} height={height} />
        {first && <><Leader from={leaderStart(placement.training, labelWidth, width)} to={first} color={Palette.accent} /><Target point={first} color={Palette.accent} id={0} /></>}
        {second && <><Leader from={leaderStart(placement.muscles, labelWidth, width)} to={second} color={Psx.cyan} /><Target point={second} color={Psx.cyan} id={1} /></>}
      </>}
      <View onLayout={(event) => { const next = event.nativeEvent.layout.height; if (Math.abs(next - noteHeights.training) > 1) setNoteHeights((current) => ({ ...current, training: next })); }} style={[styles.note, noteStyle(placement.training, labelWidth)]}>
        <Text style={[styles.kicker, wide && styles.kickerWide, { color: Palette.accent }]}>01  /  TRAINING</Text>
        <Text style={[styles.key, wide && styles.keyWide]}>FOCUS</Text>
        <Text style={[styles.value, wide && styles.valueWide]}>{training.focus}</Text>
        <Text style={[styles.key, wide && styles.keyWide]}>CARDIO</Text>
        <Text style={[styles.detail, wide && styles.detailWide]}>{training.cardio}</Text>
        <Text style={[styles.key, wide && styles.keyWide]}>{effectsLabel.toUpperCase()}</Text>
        <Text style={[styles.detail, wide && styles.detailWide]}>{training.effects.join(' · ')}</Text>
      </View>
      <View onLayout={(event) => { const next = event.nativeEvent.layout.height; if (Math.abs(next - noteHeights.muscles) > 1) setNoteHeights((current) => ({ ...current, muscles: next })); }} style={[styles.note, noteStyle(placement.muscles, labelWidth)]}>
        <Text style={[styles.kicker, wide && styles.kickerWide, { color: Psx.cyan }]}>02  /  MUSCLES</Text>
        <Text style={[styles.key, wide && styles.keyWide]}>PRIMARY</Text>
        <Text style={[styles.value, wide && styles.valueWide]}>{exercise.primary.join(', ')}</Text>
        {exercise.support.length > 0 && <><Text style={[styles.key, wide && styles.keyWide]}>SUPPORT</Text><Text style={[styles.detail, wide && styles.detailWide]}>{exercise.support.join(', ')}</Text></>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { position: 'absolute', gap: 1 },
  kicker: { fontFamily: DisplayFont.bold, fontSize: 10, letterSpacing: 1.1, marginBottom: 5, textShadowColor: '#000', textShadowRadius: 4 },
  kickerWide: { fontSize: 12 },
  key: { color: '#aeb5b8', fontFamily: DisplayFont.bold, fontSize: 9, letterSpacing: 1.1, marginTop: 5, textShadowColor: '#000', textShadowRadius: 4 },
  keyWide: { fontSize: 11, marginTop: 8 },
  value: { color: '#fff', fontFamily: DisplayFont.semibold, fontSize: 12, lineHeight: 15, textShadowColor: '#000', textShadowRadius: 5 },
  valueWide: { fontSize: 15, lineHeight: 19 },
  detail: { color: '#e5e9e8', fontSize: 11, lineHeight: 14, textShadowColor: '#000', textShadowRadius: 5 },
  detailWide: { fontSize: 14, lineHeight: 18 },
  corner: { position: 'absolute', width: 13, height: 13, borderColor: 'rgba(255,255,255,0.62)' },
  topLeft: { left: 0, top: 0, borderLeftWidth: 1, borderTopWidth: 1 },
  topRight: { right: 0, top: 0, borderRightWidth: 1, borderTopWidth: 1 },
  bottomLeft: { left: 0, bottom: 0, borderLeftWidth: 1, borderBottomWidth: 1 },
  bottomRight: { right: 0, bottom: 0, borderRightWidth: 1, borderBottomWidth: 1 },
});
