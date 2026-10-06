import { EXERCISES, type Exercise } from './exercises';

export type ExerciseTraining = {
  readonly focus: string;
  readonly cardio: string;
  readonly effects: readonly [string, string];
  /** Stretches practice range and control rather than building strength. */
  readonly effectsLabel?: 'Practices';
};

// Editorial movement descriptions, not measured physiological outcomes.
// Sources: https://www.acefitness.org/resources/pros/expert-articles/5269/how-to-get-started-with-kettlebells/
// https://www.acefitness.org/continuing-education/certified/october-2018/7097/women-and-kettlebells-better-together/
// https://www.acefitness.org/continuing-education/certified/march-2025/8824/the-ace-do-it-better-series-the-turkish-get-up/
// https://www.acefitness.org/continuing-education/certified/january-2025/8788/the-ace-do-it-better-series-the-two-handed-kettlebell-swing/
export const KETTLEBELL_TRAINING: Readonly<Record<string, ExerciseTraining>> = {
  'kb-swing': { focus: 'Explosive hip power', cardio: 'Good for intervals', effects: ['Hip drive', 'Grip strength'] },
  'kb-deadlift': { focus: 'Hip and leg strength', cardio: 'Pace dependent', effects: ['Hip hinge', 'Core bracing'] },
  'goblet-squat': { focus: 'Squat strength', cardio: 'Pace dependent', effects: ['Leg drive', 'Upright control'] },
  'kb-reverse-lunge': { focus: 'Single-leg strength', cardio: 'Pace dependent', effects: ['Leg drive', 'Balance'] },
  'kb-side-lunge': { focus: 'Side-to-side strength', cardio: 'Pace dependent', effects: ['Lateral control', 'Inner-thigh strength'] },
  'kb-upright-row': { focus: 'Upper-body pulling', cardio: 'Low focus', effects: ['Shoulder strength', 'Grip strength'] },
  'kb-bent-row': { focus: 'Back strength', cardio: 'Low focus', effects: ['Pulling strength', 'Torso control'] },
  'kb-side-bend': { focus: 'Side-core strength', cardio: 'Low focus', effects: ['Side bending', 'Grip strength'] },
  'kb-curl': { focus: 'Arm strength', cardio: 'Low focus', effects: ['Elbow flexion', 'Grip strength'] },
  'kb-halo': { focus: 'Shoulder control', cardio: 'Low focus', effects: ['Shoulder mobility', 'Core bracing'] },
  'kb-clean': { focus: 'Explosive hip power', cardio: 'Good for intervals', effects: ['Hip drive', 'Rack control'] },
  'kb-press': { focus: 'Overhead strength', cardio: 'Low focus', effects: ['Pressing strength', 'Core bracing'] },
  'kb-snatch': { focus: 'Full-body power', cardio: 'Good for intervals', effects: ['Hip drive', 'Overhead control'] },
  'kb-getup': { focus: 'Full-body control', cardio: 'Low focus', effects: ['Shoulder stability', 'Coordination'] },
  'kb-pullover': { focus: 'Overhead arm strength', cardio: 'Low focus', effects: ['Arm control', 'Core bracing'] },
};

const BODYWEIGHT_AND_GEAR_TRAINING: Readonly<Record<string, ExerciseTraining>> = {
  // Legs and hips
  squat: { focus: 'Bodyweight squat', cardio: 'Pace dependent', effects: ['Knee and hip drive', 'Foot pressure'] },
  'reverse-lunge': { focus: 'Alternating leg work', cardio: 'Pace dependent', effects: ['Front-leg drive', 'Step-back balance'] },
  'calf-raise': { focus: 'Calf work', cardio: 'Low focus', effects: ['Ankle extension', 'Controlled lowering'] },
  'glute-bridge': { focus: 'Hip extension', cardio: 'Low focus', effects: ['Glute contraction', 'Pelvic control'] },
  'fly-steps': { focus: 'Single-leg hinge', cardio: 'Low focus', effects: ['Hip balance', 'Hamstring control'] },
  'side-leg-raises': { focus: 'Side hip work', cardio: 'Low focus', effects: ['Hip abduction', 'Upright balance'] },
  'standing-knee': { focus: 'Alternating knee lifts', cardio: 'Pace dependent', effects: ['Hip flexion', 'Standing balance'] },
  'side-step': { focus: 'Lateral stepping', cardio: 'Pace dependent', effects: ['Side hip control', 'Steady footwork'] },

  // Pressing and arms
  'wall-pushup': { focus: 'Supported chest press', cardio: 'Low focus', effects: ['Pressing pattern', 'Straight-body control'] },
  pushup: { focus: 'Floor pressing', cardio: 'Pace dependent', effects: ['Chest and triceps work', 'Plank bracing'] },
  'wide-pushup': { focus: 'Wide-hand press', cardio: 'Pace dependent', effects: ['Chest emphasis', 'Shoulder control'] },
  'close-pushup': { focus: 'Close-hand press', cardio: 'Pace dependent', effects: ['Triceps emphasis', 'Elbow tracking'] },
  'staggered-pushup': { focus: 'Offset-hand press', cardio: 'Pace dependent', effects: ['Uneven-hand control', 'Square hips'] },
  'stacked-pushup': { focus: 'Narrow-base press', cardio: 'Pace dependent', effects: ['Pressing control', 'Anti-rotation bracing'] },
  'raised-leg-pushup': { focus: 'Single-leg press', cardio: 'Pace dependent', effects: ['Chest and triceps work', 'Level-hip control'] },
  'spiderman-pushup': { focus: 'Press with knee drive', cardio: 'Good for intervals', effects: ['Pressing coordination', 'Side-core control'] },
  'power-pushup': { focus: 'Explosive floor press', cardio: 'Good for intervals', effects: ['Fast arm drive', 'Soft landing'] },
  'clapping-pushup': { focus: 'Explosive clap press', cardio: 'Good for intervals', effects: ['Fast chest press', 'Hand-landing control'] },
  'pike-pushup': { focus: 'Shoulder-led press', cardio: 'Low focus', effects: ['Overhead pressing pattern', 'Elbow control'] },
  'pseudo-planche': { focus: 'Forward plank lean', cardio: 'Low focus', effects: ['Shoulder loading', 'Straight-arm bracing'] },
  'tricep-dips': { focus: 'Floor-supported dip', cardio: 'Low focus', effects: ['Elbow extension', 'Shoulder positioning'] },
  'tricep-extensions': { focus: 'Forearm-to-hand press', cardio: 'Low focus', effects: ['Triceps press', 'Plank control'] },

  // Core and back
  plank: { focus: 'Forearm plank hold', cardio: 'Low focus', effects: ['Trunk bracing', 'Hip alignment'] },
  'shoulder-taps': { focus: 'Plank with hand lifts', cardio: 'Pace dependent', effects: ['Anti-rotation control', 'One-arm support'] },
  'alt-arm-leg-plank': { focus: 'Opposite-limb plank', cardio: 'Low focus', effects: ['Cross-body balance', 'Level hips'] },
  'bird-dog': { focus: 'Quadruped reach', cardio: 'Low focus', effects: ['Cross-body coordination', 'Spine control'] },
  'sit-ups': { focus: 'Trunk curl', cardio: 'Pace dependent', effects: ['Abdominal flexion', 'Controlled descent'] },
  'reverse-crunches': { focus: 'Pelvic curl', cardio: 'Low focus', effects: ['Lower-trunk control', 'Slow hip lowering'] },
  'bicycle-crunches': { focus: 'Alternating trunk twist', cardio: 'Pace dependent', effects: ['Oblique rotation', 'Opposite-side timing'] },
  'flutter-kicks': { focus: 'Alternating leg hold', cardio: 'Pace dependent', effects: ['Hip flexor work', 'Low-back positioning'] },
  'leg-raises': { focus: 'Straight-leg raise', cardio: 'Low focus', effects: ['Hip flexion', 'Controlled leg lowering'] },
  superman: { focus: 'Prone back hold', cardio: 'Low focus', effects: ['Back extension', 'Glute engagement'] },
  'back-lifts': { focus: 'Prone chest lift', cardio: 'Low focus', effects: ['Back extension', 'Neck alignment'] },

  // Full-body movement
  climbers: { focus: 'Fast plank knee drives', cardio: 'Good for intervals', effects: ['Alternating hip drive', 'Plank support'] },
  'plank-jump-ins': { focus: 'Plank-to-crouch jumps', cardio: 'Good for intervals', effects: ['Two-foot landing', 'Trunk bracing'] },
  punches: { focus: 'Jab and cross', cardio: 'Good for intervals', effects: ['Hip-to-arm rotation', 'Quick hand return'] },
  'side-to-side-chops': { focus: 'Standing torso turns', cardio: 'Pace dependent', effects: ['Oblique rotation', 'Foot pivoting'] },
  'chest-expansions': { focus: 'Arm opening', cardio: 'Low focus', effects: ['Shoulder-blade squeeze', 'Chest opening'] },

  // Assisted and other equipment
  'sit-stand': { focus: 'Chair-assisted squat', cardio: 'Pace dependent', effects: ['Stand-up drive', 'Controlled sitting'] },
  'seated-knee': { focus: 'Seated knee lifts', cardio: 'Low focus', effects: ['Hip flexion', 'Upright sitting'] },
  'decline-pushup': { focus: 'Feet-elevated press', cardio: 'Pace dependent', effects: ['Upper-chest and shoulder work', 'Rigid-body support'] },
  'chin-ups': { focus: 'Underhand bar pull', cardio: 'Pace dependent', effects: ['Lat and biceps pull', 'Controlled lowering'] },
  'pull-ups': { focus: 'Overhand bar pull', cardio: 'Pace dependent', effects: ['Lat and upper-back pull', 'Grip control'] },
  'doorframe-rows': { focus: 'Leaning body row', cardio: 'Low focus', effects: ['Upper-back pull', 'Straight-body tension'] },
  'db-curl': { focus: 'Dumbbell arm curl', cardio: 'Low focus', effects: ['Elbow flexion', 'Slow arm lowering'] },
  'band-pull': { focus: 'Band pull-apart', cardio: 'Low focus', effects: ['Shoulder-blade retraction', 'Rear-shoulder control'] },
};

const STRETCH_TRAINING: Readonly<Record<string, ExerciseTraining>> = {
  'shoulder-circle': { focus: 'Shoulder circles', cardio: 'Low focus', effects: ['Smooth shoulder motion', 'Relaxed neck posture'], effectsLabel: 'Practices' },
  'neck-flexion': { focus: 'Gentle neck flexion', cardio: 'Low focus', effects: ['Chin-to-chest range', 'Slow return to neutral'], effectsLabel: 'Practices' },
  'neck-extension': { focus: 'Gentle upward gaze', cardio: 'Low focus', effects: ['Comfortable neck extension', 'Controlled head return'], effectsLabel: 'Practices' },
  'side-neck': { focus: 'Side neck stretch', cardio: 'Low focus', effects: ['Gentle side-neck range', 'Level shoulders'], effectsLabel: 'Practices' },
  'overhead-reach': { focus: 'Overhead reach', cardio: 'Low focus', effects: ['Shoulder reach', 'Ribs-down alignment'], effectsLabel: 'Practices' },
  'behind-back-clasp': { focus: 'Chest and shoulder opening', cardio: 'Low focus', effects: ['Behind-back shoulder range', 'Tall chest posture'], effectsLabel: 'Practices' },
  'torso-extension': { focus: 'Gentle back bend', cardio: 'Low focus', effects: ['Standing extension range', 'Easy upright return'], effectsLabel: 'Practices' },
  'side-bend': { focus: 'Side-body reach', cardio: 'Low focus', effects: ['Lateral torso range', 'Alternating side control'], effectsLabel: 'Practices' },
  'oblique-twist': { focus: 'Standing torso twist', cardio: 'Low focus', effects: ['Gentle trunk rotation', 'Forward-facing hips'], effectsLabel: 'Practices' },
  'cat-cow': { focus: 'Spinal flexion and extension', cardio: 'Low focus', effects: ['Smooth back movement', 'Breath-led pacing'], effectsLabel: 'Practices' },
  'quad-stretch': { focus: 'Standing front-thigh stretch', cardio: 'Low focus', effects: ['Gentle quad range', 'One-leg balance'], effectsLabel: 'Practices' },
  'hamstring-stretch': { focus: 'Standing back-thigh stretch', cardio: 'Low focus', effects: ['Gentle hamstring range', 'Hip-hinge control'], effectsLabel: 'Practices' },
  'hip-flexor-lunge': { focus: 'Half-kneeling hip stretch', cardio: 'Low focus', effects: ['Front-hip range', 'Tall torso posture'], effectsLabel: 'Practices' },
  'reclined-twist': { focus: 'Reclined knee rolls', cardio: 'Low focus', effects: ['Gentle trunk rotation', 'Shoulder-down control'], effectsLabel: 'Practices' },
};

/** Editorial labels for every exercise in the catalog. */
export const EXERCISE_TRAINING: Readonly<Record<string, ExerciseTraining>> = {
  ...KETTLEBELL_TRAINING,
  ...BODYWEIGHT_AND_GEAR_TRAINING,
  ...STRETCH_TRAINING,
};

const equipmentById = new Map(EXERCISES.map(({ id, equipment }) => [id, equipment]));

export function getExerciseTraining(exercise: Pick<Exercise, 'id' | 'equipment'>): ExerciseTraining | undefined {
  if (equipmentById.get(exercise.id) !== exercise.equipment) return undefined;
  return Object.prototype.hasOwnProperty.call(EXERCISE_TRAINING, exercise.id)
    ? EXERCISE_TRAINING[exercise.id]
    : undefined;
}
