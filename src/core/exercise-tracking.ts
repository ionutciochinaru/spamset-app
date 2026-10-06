import type { Exercise } from './exercises';

export type TrackingPosture = 'upright' | 'floor' | 'seated' | 'overhead';
export type TrackingLayout = 'diagonal' | 'reverse' | 'top-pair' | 'split';
export type TrackingAnchor = readonly string[];

export type ExerciseTracking = {
  posture: TrackingPosture;
  layout: TrackingLayout;
  /** A centroid of these sampled rig joints, projected through the live camera. */
  focusJoints: TrackingAnchor;
  muscleJoints: TrackingAnchor;
};

type TrackingExercise = Pick<Exercise, 'id' | 'kind' | 'pattern' | 'primary'>;

const FLOOR = new Set([
  'glute-bridge', 'pushup', 'wide-pushup', 'close-pushup', 'staggered-pushup',
  'stacked-pushup', 'raised-leg-pushup', 'spiderman-pushup', 'power-pushup',
  'clapping-pushup', 'pike-pushup', 'pseudo-planche', 'decline-pushup',
  'tricep-extensions',
  'plank', 'shoulder-taps', 'alt-arm-leg-plank', 'bird-dog', 'sit-ups',
  'reverse-crunches', 'bicycle-crunches', 'flutter-kicks', 'leg-raises',
  'superman', 'back-lifts', 'climbers', 'plank-jump-ins', 'cat-cow',
  'reclined-twist', 'kb-getup', 'kb-pullover',
]);
const SEATED = new Set(['tricep-dips', 'seated-knee']);
const OVERHEAD = new Set(['kb-halo', 'kb-press', 'kb-snatch', 'overhead-reach', 'chin-ups', 'pull-ups']);

const HIP = ['hip_l', 'hip_r'] as const;
const THIGH = ['hip_l', 'knee_l', 'hip_r', 'knee_r'] as const;
const CALF = ['knee_l', 'ankle_l', 'knee_r', 'ankle_r'] as const;
const SHOULDER = ['shoulder_l', 'shoulder_r'] as const;
const ARM = ['shoulder_l', 'elbow_l', 'shoulder_r', 'elbow_r'] as const;
const FOREARM = ['elbow_l', 'wrist_l', 'elbow_r', 'wrist_r'] as const;
const TORSO = ['chest', 'spine_mid', 'pelvis'] as const;

function muscleAnchor(primary: readonly string[]): TrackingAnchor {
  const name = primary[0]?.toLowerCase() ?? '';
  if (/neck|trap/.test(name)) return ['neck', 'head'];
  if (/calf|calves/.test(name)) return CALF;
  if (/quad|hamstring|adductor/.test(name)) return THIGH;
  if (/glute|hip flexor/.test(name)) return HIP;
  if (/bicep|tricep/.test(name)) return ARM;
  if (/grip|forearm/.test(name)) return FOREARM;
  if (/shoulder/.test(name)) return SHOULDER;
  if (/chest|pec/.test(name)) return ['chest'];
  if (/lat|back/.test(name)) return ['chest', 'spine_mid'];
  if (/oblique|core|ab/.test(name)) return TORSO;
  return TORSO;
}

/** Stable per-exercise placement and anatomical anchors for live tracking marks. */
export function getExerciseTracking(exercise: TrackingExercise): ExerciseTracking {
  const posture: TrackingPosture = FLOOR.has(exercise.id) ? 'floor'
    : SEATED.has(exercise.id) ? 'seated'
    : OVERHEAD.has(exercise.id) ? 'overhead' : 'upright';
  const layout: TrackingLayout = posture === 'floor' ? 'top-pair'
    : posture === 'seated' ? 'reverse'
    : posture === 'overhead' ? 'split'
    : exercise.pattern === 'pull' || exercise.pattern === 'press' || exercise.pattern === 'arms' || /^neck-|side-neck$/.test(exercise.id) ? 'reverse'
    : 'diagonal';
  let focusJoints: TrackingAnchor;
  if (exercise.kind === 'stretch') focusJoints = /neck/.test(exercise.id) ? ['head'] : /reach|clasp/.test(exercise.id) ? ['wrist_l', 'wrist_r'] : TORSO;
  else if (exercise.pattern === 'hinge' || exercise.pattern === 'lunge') focusJoints = ['pelvis', 'spine_mid'];
  else if (exercise.pattern === 'squat') focusJoints = exercise.id === 'calf-raise' ? ['ankle_l', 'ankle_r'] : HIP;
  else if (exercise.pattern === 'press') focusJoints = ['elbow_l', 'elbow_r'];
  else if (exercise.pattern === 'pull' || exercise.pattern === 'arms') focusJoints = FOREARM;
  else focusJoints = ['spine_mid'];
  return { posture, layout, focusJoints, muscleJoints: muscleAnchor(exercise.primary) };
}

export type LabelPlacement = { side: 'left' | 'right'; top: number };

/** Keeps both full labels within controls and caption safe areas at any preview size. */
export function getTrackingLabelPlacement(
  layout: TrackingLayout,
  width: number,
  height: number,
  trainingHeight: number,
  muscleHeight: number,
  topSafe = 72,
): { training: LabelPlacement; muscles: LabelPlacement } {
  const upper = width > 560 ? Math.max(topSafe, height * 0.16) : topSafe;
  const lower = (contentHeight: number) => width > 560
    ? Math.max(upper, Math.min(height * 0.52, height - 72 - contentHeight))
    : Math.max(upper, height - 72 - contentHeight);
  switch (layout) {
    case 'reverse': return { training: { side: 'right', top: upper }, muscles: { side: 'left', top: lower(muscleHeight) } };
    case 'top-pair': return { training: { side: 'left', top: upper }, muscles: { side: 'right', top: upper } };
    case 'split': return { training: { side: 'left', top: lower(trainingHeight) }, muscles: { side: 'right', top: upper } };
    default: return { training: { side: 'left', top: upper }, muscles: { side: 'right', top: lower(muscleHeight) } };
  }
}
