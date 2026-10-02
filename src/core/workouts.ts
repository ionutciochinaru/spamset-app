/**
 * Training types. Every workout is a list of blocks; each block compiles into
 * a flat timeline of steps the session runner walks through.
 */

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

export type Workout = {
  id: string;
  name: string;
  summary: string;
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

export const PRESET_WORKOUTS: Workout[] = [
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
