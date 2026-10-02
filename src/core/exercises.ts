export type Pattern = 'hinge' | 'squat' | 'lunge' | 'pull' | 'press' | 'arms' | 'core' | 'full-body';

export type Exercise = {
  id: string;
  name: string;
  /** Clip id in assets/animations (exported from tools/animation). */
  animation: string;
  pattern: Pattern;
  /** Worked one side at a time; targets are per side. */
  unilateral: boolean;
  /** How a single repetition is counted. */
  counting: string;
  /** Typical seconds per rep (per side), for workout length estimates. Default 3. */
  repSeconds?: number;
  primary: string[];
  support: string[];
  cues: string[];
};

export const EXERCISES: Exercise[] = [
  {
    id: 'kb-swing',
    name: 'Two-hand swing',
    animation: 'kb-swing',
    pattern: 'hinge',
    unilateral: false,
    counting: 'One backswing and float to chest height',
    primary: ['Glutes', 'Hamstrings'],
    support: ['Back', 'Core', 'Grip'],
    cues: [
      'Hike the bell back high between the thighs.',
      'Snap the hips forward; the arms stay long and just guide.',
      'Float to about chest height, then let it fall back into the hinge.',
      'Stand tall at the top: glutes tight, ribs down.',
    ],
  },
  {
    id: 'kb-deadlift',
    name: 'Deadlift',
    animation: 'kb-deadlift',
    pattern: 'hinge',
    unilateral: false,
    counting: 'One lift from the floor to standing',
    primary: ['Glutes', 'Hamstrings'],
    support: ['Core', 'Quads', 'Back'],
    cues: [
      'Bell between the feet, under the hips.',
      'Push the hips back with a long, neutral spine.',
      'Drive through the floor and finish tall.',
      'Lower by hinging, not by rounding.',
    ],
  },
  {
    id: 'goblet-squat',
    name: 'Goblet squat',
    animation: 'goblet-squat',
    pattern: 'squat',
    unilateral: false,
    counting: 'One descent and stand',
    primary: ['Quads', 'Glutes'],
    support: ['Core', 'Upper back'],
    cues: [
      'Hold the bell by the horns close to the chest.',
      'Sit between the heels, knees tracking over the toes.',
      'Go only as deep as you can keep a tall chest.',
      'Stand by driving the whole foot into the floor.',
    ],
  },
  {
    id: 'kb-reverse-lunge',
    name: 'Goblet reverse lunge',
    animation: 'kb-reverse-lunge',
    pattern: 'lunge',
    unilateral: true,
    counting: 'One step back and return, per side',
    primary: ['Quads', 'Glutes'],
    support: ['Core', 'Adductors'],
    cues: [
      'Step straight back; the front foot stays planted.',
      'Lower the back knee under the hip.',
      'Push through the front foot to return.',
    ],
  },
  {
    id: 'kb-side-lunge',
    name: 'Goblet side lunge',
    animation: 'kb-side-lunge',
    pattern: 'lunge',
    unilateral: true,
    counting: 'One shift and return, per side',
    primary: ['Adductors', 'Glutes', 'Quads'],
    support: ['Core'],
    cues: [
      'Wide stance, feet flat.',
      'Sit the hips back and over one foot; the other leg stays long.',
      'Push back to the centre.',
    ],
  },
  {
    id: 'kb-upright-row',
    name: 'Upright row',
    animation: 'kb-upright-row',
    pattern: 'pull',
    unilateral: false,
    counting: 'One pull and lower',
    primary: ['Shoulders', 'Upper back'],
    support: ['Biceps', 'Grip'],
    cues: [
      'Hold the handle in front of the thighs.',
      'Lead with the elbows, keeping the bell close.',
      'Stop at a comfortable height, usually below the shoulders.',
    ],
  },
  {
    id: 'kb-bent-row',
    name: 'Bent-over row',
    animation: 'kb-bent-row',
    pattern: 'pull',
    unilateral: true,
    counting: 'One row and lower, per side',
    primary: ['Upper back', 'Lats'],
    support: ['Biceps', 'Hamstrings', 'Core'],
    cues: [
      'Staggered stance: the leg opposite the bell steps forward; rest that hand on the front thigh.',
      'Hinge toward horizontal with a flat back and soft knees; keep the neck long.',
      'Pull from the elbow, back and up, until the bell reaches the hip.',
      'Keep the shoulder down, away from the ear; lower under control.',
    ],
  },
  {
    id: 'kb-side-bend',
    name: 'Side bend',
    animation: 'kb-side-bend',
    pattern: 'core',
    unilateral: true,
    counting: 'One bend and return, per side',
    primary: ['Obliques'],
    support: ['Grip'],
    cues: [
      'Bell in one hand, arm long; other hand on the hip.',
      'Bend sideways only, letting the bell slide down the outer thigh toward the knee.',
      'Keep the hips level and facing forward.',
      'Return to tall using the opposite side of the waist. Switch hands for the other side.',
    ],
  },
  {
    id: 'kb-curl',
    name: 'Curl',
    animation: 'kb-curl',
    pattern: 'arms',
    unilateral: false,
    counting: 'One curl and lower',
    primary: ['Biceps'],
    support: ['Forearms', 'Grip'],
    cues: [
      'Hold the bell by the horns, thumbs up, arms long.',
      'Elbows stay tucked at your sides, just in front of the hips.',
      'Curl the bell up to your chest without swinging the hips.',
      'Lower fully and slowly.',
    ],
  },
  {
    id: 'kb-halo',
    name: 'Halo',
    animation: 'kb-halo',
    pattern: 'core',
    unilateral: true,
    counting: 'One full circle, per direction',
    primary: ['Shoulders'],
    support: ['Upper back', 'Core', 'Triceps'],
    cues: [
      'Hold the bell upside down by the horns.',
      'Circle it close around the head.',
      'Ribs stay down; the torso does not sway.',
      'Alternate directions.',
    ],
  },
  {
    id: 'kb-clean',
    name: 'Single-arm clean',
    animation: 'kb-clean',
    pattern: 'hinge',
    unilateral: true,
    counting: 'One clean from the backswing to the rack, per side',
    primary: ['Glutes', 'Hamstrings'],
    support: ['Upper back', 'Core', 'Grip'],
    cues: [
      'Start like a one-arm swing: hike the bell back high.',
      'Snap the hips, then pull the elbow back and in close to the ribs.',
      'Let the hand come around the bell so it lands softly on the forearm.',
      'Rack: wrist straight, elbow tucked, bell resting outside the forearm.',
    ],
  },
  {
    id: 'kb-press',
    name: 'Single-arm press',
    animation: 'kb-press',
    pattern: 'press',
    unilateral: true,
    counting: 'One press from the rack to lockout, per side',
    primary: ['Shoulders', 'Triceps'],
    support: ['Upper back', 'Core', 'Glutes'],
    cues: [
      'Start in a solid rack; squeeze glutes and brace.',
      'Keep the forearm vertical under the bell as it rises.',
      'Finish with the arm straight and the biceps near the ear.',
      'Lower under control back to the rack.',
    ],
  },
  {
    id: 'kb-snatch',
    name: 'Single-arm snatch',
    animation: 'kb-snatch',
    pattern: 'hinge',
    unilateral: true,
    counting: 'One snatch from the backswing to lockout, per side',
    primary: ['Glutes', 'Hamstrings', 'Shoulders'],
    support: ['Upper back', 'Core', 'Grip'],
    cues: [
      'Hike the bell back and drive the hips hard.',
      'Pull high with the elbow, keeping the bell close.',
      'Punch the hand through as the bell floats so it does not flip onto the wrist.',
      'Lock out overhead, then turn the bell over and let it fall into the next backswing.',
    ],
  },
  {
    id: 'kb-getup',
    name: 'Turkish get-up',
    animation: 'kb-getup',
    pattern: 'full-body',
    unilateral: true,
    counting: 'One get-up to standing and back down, per side',
    repSeconds: 30,
    primary: ['Shoulders', 'Core'],
    support: ['Glutes', 'Upper back', 'Hips'],
    cues: [
      'Eyes on the bell; the bell arm stays vertical the whole time.',
      'Roll to the elbow, then post on the hand.',
      'Bridge the hips high, then sweep the straight leg under your hips so the knee lands behind you.',
      'Push off the hand to an upright half-kneel, then stand up and step the back foot beside the front one.',
      'Reverse every step slowly to lie back down.',
    ],
  },
  {
    id: 'kb-pullover',
    name: 'Standing pullover',
    animation: 'kb-pullover',
    pattern: 'press',
    unilateral: false,
    counting: 'One arc over the head and back to the chest',
    primary: ['Lats', 'Triceps'],
    support: ['Shoulders', 'Core'],
    cues: [
      'Hold the bell upside down by the horns at your chest, hands beside the handle.',
      'Keeping the elbows bent, carry it up over your head.',
      'Lower the bell behind your head; ribs stay down.',
      'Bring it back over your head to the chest.',
    ],
  },
];

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise {
  const exercise = byId.get(id);
  if (!exercise) throw new Error(`Unknown exercise: ${id}`);
  return exercise;
}
