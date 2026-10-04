/**
 * Training types. Every workout is a list of blocks; each block compiles into
 * a flat timeline of steps the session runner walks through.
 */
import { getExercise, isLoaded, isStretch, type Equipment } from './exercises';

export type Target = { reps: number } | { seconds: number };

export type Station = {
  exercise: string;
  target: Target;
  /** Kilograms. Omitted = use the exercise's current progression load. */
  load?: number;
};

export type SetsBlock = {
  kind: 'sets';
  exercise: string;
  sets: number;
  /** Double progression: work within [min, max] reps before adding load. */
  repRange: [number, number];
  rest: number;
};

export type CircuitBlock = {
  kind: 'circuit';
  rounds: number;
  stations: Station[];
  restBetweenStations: number;
  restBetweenRounds: number;
};

export type EmomBlock = { kind: 'emom'; minutes: number; stations: Station[] };

export type AmrapBlock = { kind: 'amrap'; minutes: number; stations: Station[] };

export type IntervalBlock = {
  kind: 'intervals';
  work: number;
  rest: number;
  rounds: number;
  stations: Station[];
};

export type LadderBlock = {
  kind: 'ladder';
  exercise: string;
  from: number;
  to: number;
  step: number;
  rest: number;
};

export type Block = SetsBlock | CircuitBlock | EmomBlock | AmrapBlock | IntervalBlock | LadderBlock;
export type BlockKind = Block['kind'];

/** How the Workouts tab groups a workout. Derived from its exercises unless set. */
export type Focus = 'kettlebell' | 'bodyweight' | 'core' | 'mixed' | 'mobility';

export type Workout = {
  id: string;
  name: string;
  summary: string;
  focus?: Focus;
  blocks: Block[];
};

export const BLOCK_LABELS: Record<BlockKind, string> = {
  sets: 'Strength sets',
  circuit: 'Circuit',
  emom: 'EMOM',
  amrap: 'AMRAP',
  intervals: 'Intervals',
  ladder: 'Ladder',
};

const KETTLEBELL_WORKOUTS: Workout[] = [
  {
    id: 'swing-foundations',
    name: 'Swing Foundations',
    summary: 'Hinge strength with double progression. Add load when every set hits the top of the range.',
    blocks: [
      { kind: 'sets', exercise: 'kb-deadlift', sets: 3, repRange: [8, 12], rest: 60 },
      { kind: 'sets', exercise: 'kb-swing', sets: 5, repRange: [10, 15], rest: 60 },
      { kind: 'sets', exercise: 'goblet-squat', sets: 3, repRange: [8, 12], rest: 75 },
    ],
  },
  {
    id: 'full-body-circuit',
    name: 'Full-Body Circuit',
    summary: 'Five stations, four rounds. Short rests between stations, longer between rounds.',
    blocks: [
      {
        kind: 'circuit',
        rounds: 4,
        restBetweenStations: 20,
        restBetweenRounds: 90,
        stations: [
          { exercise: 'kb-swing', target: { reps: 15 } },
          { exercise: 'goblet-squat', target: { reps: 10 } },
          { exercise: 'kb-bent-row', target: { reps: 10 } },
          { exercise: 'kb-reverse-lunge', target: { reps: 8 } },
          { exercise: 'kb-halo', target: { reps: 5 } },
        ],
      },
    ],
  },
  {
    id: 'swing-emom',
    name: 'Swing EMOM 10',
    summary: 'Every minute on the minute: 15 swings, rest for the remainder. Ten minutes.',
    blocks: [{ kind: 'emom', minutes: 10, stations: [{ exercise: 'kb-swing', target: { reps: 15 } }] }],
  },
  {
    id: 'tabata-swings',
    name: 'Tabata Swings',
    summary: 'Twenty seconds of swings, ten seconds rest, eight rounds.',
    blocks: [
      {
        kind: 'intervals',
        work: 20,
        rest: 10,
        rounds: 8,
        stations: [{ exercise: 'kb-swing', target: { seconds: 20 } }],
      },
    ],
  },
  {
    id: 'amrap-12',
    name: 'AMRAP 12',
    summary: 'As many rounds as possible in 12 minutes.',
    blocks: [
      {
        kind: 'amrap',
        minutes: 12,
        stations: [
          { exercise: 'kb-deadlift', target: { reps: 10 } },
          { exercise: 'kb-upright-row', target: { reps: 10 } },
          { exercise: 'kb-side-lunge', target: { reps: 6 } },
        ],
      },
    ],
  },
  {
    id: 'swing-ladder',
    name: 'Swing Ladder',
    summary: '5, 10, 15, 20 swings, then back down. Rest as long as the last set took.',
    blocks: [
      { kind: 'ladder', exercise: 'kb-swing', from: 5, to: 20, step: 5, rest: 30 },
      { kind: 'ladder', exercise: 'kb-swing', from: 15, to: 5, step: 5, rest: 30 },
    ],
  },
  {
    id: 'clean-and-press',
    name: 'Clean & Press',
    summary: 'Five rounds of cleans and presses on each arm. Strict presses from a solid rack.',
    blocks: [
      {
        kind: 'circuit',
        rounds: 5,
        restBetweenStations: 15,
        restBetweenRounds: 75,
        stations: [
          { exercise: 'kb-clean', target: { reps: 5 } },
          { exercise: 'kb-press', target: { reps: 5 } },
        ],
      },
    ],
  },
  {
    id: 'snatch-emom',
    name: 'Snatch EMOM 12',
    summary: 'Every minute: 6 snatches per arm, switching hands at the top. Twelve minutes.',
    blocks: [{ kind: 'emom', minutes: 12, stations: [{ exercise: 'kb-snatch', target: { reps: 6 } }] }],
  },
  {
    id: 'getup-practice',
    name: 'Get-up Practice',
    summary: 'Slow, perfect Turkish get-ups. Owning every position matters more than the load.',
    blocks: [{ kind: 'sets', exercise: 'kb-getup', sets: 5, repRange: [1, 3], rest: 60 }],
  },
  {
    id: 'arms-and-core',
    name: 'Arms & Core',
    summary: 'Curls, side bends and halos for the smaller muscles.',
    blocks: [
      { kind: 'sets', exercise: 'kb-curl', sets: 3, repRange: [8, 12], rest: 45 },
      { kind: 'sets', exercise: 'kb-side-bend', sets: 3, repRange: [10, 15], rest: 45 },
      { kind: 'sets', exercise: 'kb-halo', sets: 3, repRange: [5, 8], rest: 45 },
    ],
  },
  {
    id: 'hinge-and-squat-trio',
    name: 'Swing, Squat, Deadlift',
    summary: 'Ten swings, ten goblet squats, ten deadlifts, back to back. Four rounds with up to two minutes rest.',
    blocks: [
      {
        kind: 'circuit',
        rounds: 4,
        restBetweenStations: 0,
        restBetweenRounds: 120,
        stations: [
          { exercise: 'kb-swing', target: { reps: 10 } },
          { exercise: 'goblet-squat', target: { reps: 10 } },
          { exercise: 'kb-deadlift', target: { reps: 10 } },
        ],
      },
    ],
  },
  {
    id: 'rows-and-lunges',
    name: 'Rows & Lunges',
    summary: 'Metcon circuit alternating lunges and rows without a break. Five rounds with up to two minutes rest.',
    blocks: [
      {
        kind: 'circuit',
        rounds: 5,
        restBetweenStations: 0,
        restBetweenRounds: 120,
        stations: [
          { exercise: 'kb-reverse-lunge', target: { reps: 3 } },
          { exercise: 'kb-upright-row', target: { reps: 6 } },
          { exercise: 'kb-reverse-lunge', target: { reps: 3 } },
          { exercise: 'kb-bent-row', target: { reps: 6 } },
          { exercise: 'kb-upright-row', target: { reps: 6 } },
          { exercise: 'kb-bent-row', target: { reps: 6 } },
          { exercise: 'kb-side-lunge', target: { reps: 3 } },
        ],
      },
    ],
  },
  {
    id: 'six-by-three',
    name: 'Six by Three',
    summary: 'Six exercises, three sets of ten each, 20 seconds between sets. Head to toe in one bell.',
    blocks: [
      { kind: 'sets', exercise: 'goblet-squat', sets: 3, repRange: [10, 12], rest: 20 },
      { kind: 'sets', exercise: 'kb-swing', sets: 3, repRange: [10, 12], rest: 20 },
      { kind: 'sets', exercise: 'kb-deadlift', sets: 3, repRange: [10, 12], rest: 20 },
      { kind: 'sets', exercise: 'kb-bent-row', sets: 3, repRange: [10, 12], rest: 20 },
      { kind: 'sets', exercise: 'kb-side-bend', sets: 3, repRange: [10, 12], rest: 20 },
      { kind: 'sets', exercise: 'kb-curl', sets: 3, repRange: [10, 12], rest: 20 },
    ],
  },
  {
    id: 'total-body-intervals',
    name: 'Total-Body Intervals',
    summary: '40 seconds on, 20 off, cycling six movements. Two passes, twelve minutes.',
    blocks: [
      {
        kind: 'intervals',
        work: 40,
        rest: 20,
        rounds: 12,
        stations: [
          { exercise: 'kb-swing', target: { seconds: 40 } },
          { exercise: 'goblet-squat', target: { seconds: 40 } },
          { exercise: 'kb-pullover', target: { seconds: 40 } },
          { exercise: 'kb-reverse-lunge', target: { seconds: 40 } },
          { exercise: 'kb-upright-row', target: { seconds: 40 } },
          { exercise: 'kb-halo', target: { seconds: 40 } },
        ],
      },
    ],
  },
  {
    id: 'full-body-emom-20',
    name: 'Full-Body EMOM 20',
    summary: 'A new station every minute for twenty minutes: hinge, squat, pull, press, lunge.',
    blocks: [
      {
        kind: 'emom',
        minutes: 20,
        stations: [
          { exercise: 'kb-swing', target: { reps: 15 } },
          { exercise: 'goblet-squat', target: { reps: 10 } },
          { exercise: 'kb-bent-row', target: { reps: 8 } },
          { exercise: 'kb-press', target: { reps: 5 } },
          { exercise: 'kb-reverse-lunge', target: { reps: 5 } },
        ],
      },
    ],
  },
  {
    id: 'strength-and-conditioning',
    name: 'Strength & Conditioning',
    summary: 'Heavy get-ups and presses first, then a 10-minute snatch, squat and pullover AMRAP.',
    blocks: [
      { kind: 'sets', exercise: 'kb-getup', sets: 3, repRange: [1, 2], rest: 60 },
      { kind: 'sets', exercise: 'kb-press', sets: 3, repRange: [5, 8], rest: 60 },
      {
        kind: 'amrap',
        minutes: 10,
        stations: [
          { exercise: 'kb-snatch', target: { reps: 5 } },
          { exercise: 'goblet-squat', target: { reps: 10 } },
          { exercise: 'kb-pullover', target: { reps: 8 } },
        ],
      },
    ],
  },
  {
    id: 'clean-squat-complex',
    name: 'Clean, Squat, Press',
    summary: 'Cleans, goblet squats, presses, swings and side lunges. Five rounds, short transitions.',
    blocks: [
      {
        kind: 'circuit',
        rounds: 5,
        restBetweenStations: 10,
        restBetweenRounds: 90,
        stations: [
          { exercise: 'kb-clean', target: { reps: 5 } },
          { exercise: 'goblet-squat', target: { reps: 8 } },
          { exercise: 'kb-press', target: { reps: 5 } },
          { exercise: 'kb-swing', target: { reps: 15 } },
          { exercise: 'kb-side-lunge', target: { reps: 4 } },
        ],
      },
    ],
  },
];

const BODYWEIGHT_WORKOUTS: Workout[] = [
  {
    id: 'bodyweight-basics',
    name: 'Bodyweight Basics',
    summary: 'Squats, push-ups, lunges, bridges and a plank. Four rounds, anywhere, no equipment.',
    blocks: [
      {
        kind: 'circuit',
        rounds: 4,
        restBetweenStations: 15,
        restBetweenRounds: 75,
        stations: [
          { exercise: 'squat', target: { reps: 15 } },
          { exercise: 'pushup', target: { reps: 10 } },
          { exercise: 'reverse-lunge', target: { reps: 12 } },
          { exercise: 'glute-bridge', target: { reps: 15 } },
          { exercise: 'plank', target: { seconds: 30 } },
        ],
      },
    ],
  },
  {
    id: 'pushup-ladder',
    name: 'Push-up Ladder',
    summary: '2, 4, 6, 8, 10 push-ups and back down. Short rests; finish with a plank.',
    blocks: [
      { kind: 'ladder', exercise: 'pushup', from: 2, to: 10, step: 2, rest: 30 },
      { kind: 'ladder', exercise: 'pushup', from: 8, to: 2, step: 2, rest: 30 },
      { kind: 'sets', exercise: 'plank', sets: 2, repRange: [30, 60], rest: 45 },
    ],
  },
  {
    id: 'bodyweight-tabata',
    name: 'No-Equipment Tabata',
    summary: 'Twenty seconds hard, ten seconds rest: climbers, squats, jump-ins and punches. Two passes.',
    blocks: [
      {
        kind: 'intervals',
        work: 20,
        rest: 10,
        rounds: 8,
        stations: [
          { exercise: 'climbers', target: { seconds: 20 } },
          { exercise: 'squat', target: { seconds: 20 } },
          { exercise: 'plank-jump-ins', target: { seconds: 20 } },
          { exercise: 'punches', target: { seconds: 20 } },
        ],
      },
    ],
  },
  {
    id: 'legs-no-gear',
    name: 'Legs, No Gear',
    summary: 'High-rep squats, lunges, bridges and calf raises. Add reps each session.',
    blocks: [
      { kind: 'sets', exercise: 'squat', sets: 3, repRange: [15, 25], rest: 60 },
      { kind: 'sets', exercise: 'reverse-lunge', sets: 3, repRange: [10, 20], rest: 60 },
      { kind: 'sets', exercise: 'glute-bridge', sets: 3, repRange: [12, 20], rest: 45 },
      { kind: 'sets', exercise: 'calf-raise', sets: 3, repRange: [15, 25], rest: 45 },
    ],
  },
  {
    id: 'upper-push',
    name: 'Upper-Body Push',
    summary: 'Push-ups, pike push-ups and dips. Top the range and the app suggests the harder variant.',
    blocks: [
      { kind: 'sets', exercise: 'pushup', sets: 4, repRange: [8, 15], rest: 75 },
      { kind: 'sets', exercise: 'pike-pushup', sets: 3, repRange: [5, 10], rest: 75 },
      { kind: 'sets', exercise: 'tricep-dips', sets: 3, repRange: [8, 15], rest: 60 },
    ],
  },
  {
    id: 'bar-pulls',
    name: 'Bar Pulls',
    summary: 'Chin-ups and pull-ups on a bar, then doorframe rows for volume.',
    blocks: [
      { kind: 'sets', exercise: 'chin-ups', sets: 4, repRange: [3, 8], rest: 90 },
      { kind: 'sets', exercise: 'pull-ups', sets: 3, repRange: [3, 8], rest: 90 },
      { kind: 'sets', exercise: 'doorframe-rows', sets: 3, repRange: [8, 15], rest: 60 },
    ],
  },
  {
    id: 'chair-strength',
    name: 'Chair Strength',
    summary: 'Gentle strength with a sturdy chair: sit-to-stands, seated knee lifts, wall push-ups.',
    blocks: [
      { kind: 'sets', exercise: 'sit-stand', sets: 3, repRange: [8, 15], rest: 60 },
      { kind: 'sets', exercise: 'seated-knee', sets: 3, repRange: [10, 20], rest: 45 },
      { kind: 'sets', exercise: 'wall-pushup', sets: 3, repRange: [8, 15], rest: 45 },
    ],
  },
];

const CORE_WORKOUTS: Workout[] = [
  {
    id: 'core-circuit',
    name: 'Core Circuit',
    summary: 'Plank, bicycles, leg raises, bird dogs and superman holds. Three rounds.',
    blocks: [
      {
        kind: 'circuit',
        rounds: 3,
        restBetweenStations: 15,
        restBetweenRounds: 60,
        stations: [
          { exercise: 'plank', target: { seconds: 40 } },
          { exercise: 'bicycle-crunches', target: { reps: 20 } },
          { exercise: 'leg-raises', target: { reps: 10 } },
          { exercise: 'bird-dog', target: { reps: 10 } },
          { exercise: 'superman', target: { seconds: 20 } },
        ],
      },
    ],
  },
  {
    id: 'abs-emom',
    name: 'Abs EMOM 12',
    summary: 'A new core move every minute: sit-ups, reverse crunches, shoulder taps.',
    blocks: [
      {
        kind: 'emom',
        minutes: 12,
        stations: [
          { exercise: 'sit-ups', target: { reps: 12 } },
          { exercise: 'reverse-crunches', target: { reps: 10 } },
          { exercise: 'shoulder-taps', target: { reps: 20 } },
        ],
      },
    ],
  },
];

const MIXED_WORKOUTS: Workout[] = [
  {
    id: 'bells-and-bodyweight',
    name: 'Bells & Bodyweight',
    summary: 'Swings and goblet squats between push-ups, climbers and a plank. Four rounds.',
    blocks: [
      {
        kind: 'circuit',
        rounds: 4,
        restBetweenStations: 15,
        restBetweenRounds: 90,
        stations: [
          { exercise: 'kb-swing', target: { reps: 15 } },
          { exercise: 'pushup', target: { reps: 10 } },
          { exercise: 'goblet-squat', target: { reps: 10 } },
          { exercise: 'climbers', target: { seconds: 30 } },
          { exercise: 'plank', target: { seconds: 30 } },
        ],
      },
    ],
  },
  {
    id: 'swings-and-finisher',
    name: 'Swings + Finisher',
    summary: 'Five heavy sets of swings, then a six-minute bodyweight finisher.',
    blocks: [
      { kind: 'sets', exercise: 'kb-swing', sets: 5, repRange: [10, 20], rest: 60 },
      {
        kind: 'intervals',
        work: 30,
        rest: 15,
        rounds: 8,
        stations: [
          { exercise: 'climbers', target: { seconds: 30 } },
          { exercise: 'plank-jump-ins', target: { seconds: 30 } },
          { exercise: 'punches', target: { seconds: 30 } },
          { exercise: 'squat', target: { seconds: 30 } },
        ],
      },
    ],
  },
];

const MOBILITY_WORKOUTS: Workout[] = [
  {
    id: 'warm-up',
    name: 'Warm-up',
    summary: 'Five minutes to get moving before any session: shoulders, spine, hips.',
    focus: 'mobility',
    blocks: [
      {
        kind: 'intervals',
        work: 30,
        rest: 5,
        rounds: 8,
        stations: [
          { exercise: 'shoulder-circle', target: { seconds: 30 } },
          { exercise: 'cat-cow', target: { seconds: 30 } },
          { exercise: 'oblique-twist', target: { seconds: 30 } },
          { exercise: 'side-bend', target: { seconds: 30 } },
          { exercise: 'standing-knee', target: { seconds: 30 } },
          { exercise: 'side-step', target: { seconds: 30 } },
          { exercise: 'torso-extension', target: { seconds: 30 } },
          { exercise: 'chest-expansions', target: { seconds: 30 } },
        ],
      },
    ],
  },
  {
    id: 'cool-down',
    name: 'Cool-down Stretch',
    summary: 'Eight held stretches, forty seconds each. Breathe and ease in; never bounce.',
    blocks: [
      {
        kind: 'intervals',
        work: 40,
        rest: 10,
        rounds: 8,
        stations: [
          { exercise: 'hamstring-stretch', target: { seconds: 40 } },
          { exercise: 'quad-stretch', target: { seconds: 40 } },
          { exercise: 'hip-flexor-lunge', target: { seconds: 40 } },
          { exercise: 'reclined-twist', target: { seconds: 40 } },
          { exercise: 'cat-cow', target: { seconds: 40 } },
          { exercise: 'behind-back-clasp', target: { seconds: 40 } },
          { exercise: 'overhead-reach', target: { seconds: 40 } },
          { exercise: 'side-neck', target: { seconds: 40 } },
        ],
      },
    ],
  },
  {
    id: 'full-mobility',
    name: 'Full Mobility',
    summary: 'Neck to ankles in fifteen minutes. Two slow passes through every stretch.',
    blocks: [
      {
        kind: 'intervals',
        work: 45,
        rest: 10,
        rounds: 16,
        stations: [
          { exercise: 'neck-flexion', target: { seconds: 45 } },
          { exercise: 'side-neck', target: { seconds: 45 } },
          { exercise: 'shoulder-circle', target: { seconds: 45 } },
          { exercise: 'overhead-reach', target: { seconds: 45 } },
          { exercise: 'cat-cow', target: { seconds: 45 } },
          { exercise: 'hip-flexor-lunge', target: { seconds: 45 } },
          { exercise: 'hamstring-stretch', target: { seconds: 45 } },
          { exercise: 'reclined-twist', target: { seconds: 45 } },
        ],
      },
    ],
  },
];

export const PRESET_WORKOUTS: Workout[] = [
  ...KETTLEBELL_WORKOUTS,
  ...BODYWEIGHT_WORKOUTS,
  ...CORE_WORKOUTS,
  ...MIXED_WORKOUTS,
  ...MOBILITY_WORKOUTS,
];

export function getWorkout(id: string, custom: Workout[] = []): Workout | undefined {
  return [...PRESET_WORKOUTS, ...custom].find((w) => w.id === id);
}

/** Distinct exercises a workout uses, in order of first appearance. */
export function workoutExercises(workout: Workout): string[] {
  const ids = workout.blocks.flatMap((b) =>
    'exercise' in b ? [b.exercise] : b.stations.map((s) => s.exercise),
  );
  return [...new Set(ids)];
}

export const FOCUS_LABELS: Record<Focus, string> = {
  kettlebell: 'Kettlebell',
  bodyweight: 'No equipment',
  core: 'Core',
  mixed: 'Bells + bodyweight',
  mobility: 'Stretch & mobility',
};

export const FOCUS_ORDER: Focus[] = ['kettlebell', 'bodyweight', 'core', 'mixed', 'mobility'];

/** Equipment a workout needs (bodyweight needs none). */
export function workoutEquipment(workout: Workout): Exclude<Equipment, 'none'>[] {
  const needed = workoutExercises(workout).map((id) => getExercise(id).equipment);
  return [...new Set(needed)].filter((e): e is Exclude<Equipment, 'none'> => e !== 'none');
}

export function workoutFocus(workout: Workout): Focus {
  if (workout.focus) return workout.focus;
  const exercises = workoutExercises(workout).map(getExercise);
  if (exercises.every(isStretch)) return 'mobility';
  const loaded = exercises.filter(isLoaded).length;
  if (loaded === exercises.length) return 'kettlebell';
  if (loaded > 0) return 'mixed';
  return exercises.every((e) => e.pattern === 'core') ? 'core' : 'bodyweight';
}
