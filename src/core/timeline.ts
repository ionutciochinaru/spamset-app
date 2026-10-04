import { getExercise, isTimed } from './exercises';
import type { Block, BlockKind, Target, Workout } from './workouts';

export type WorkMode =
  /** Tap Done after the reps; an elapsed clock runs. */
  | 'reps'
  /** Countdown for a timed target; completes automatically. */
  | 'timed'
  /** EMOM minute: do the reps, then rest out the remaining window. */
  | 'window';

export type WorkStep = {
  kind: 'work';
  mode: WorkMode;
  exercise: string;
  target: Target;
  load: number;
  /** Countdown length for 'timed' and 'window'. */
  duration?: number;
  block: number;
  blockKind: BlockKind;
  /** e.g. "Set 2 of 5", "Round 3 of 4", "Minute 7 of 10". */
  label: string;
};

export type RestStep = { kind: 'rest'; duration: number; block: number; blockKind: BlockKind; label: string };

export type AmrapStep = {
  kind: 'amrap';
  duration: number;
  stations: { exercise: string; target: Target; load: number }[];
  block: number;
  blockKind: 'amrap';
  label: string;
};

export type Step = WorkStep | RestStep | AmrapStep;

export type LoadPlan = {
  load: (exerciseId: string) => number;
  /** Target reps (seconds for holds) for a strength-sets block, from the exercise's progression. */
  reps: (exerciseId: string, repRange: [number, number]) => number;
};

export const BETWEEN_BLOCKS_REST = 60;

function compileBlock(block: Block, index: number, plan: LoadPlan): Step[] {
  const steps: Step[] = [];
  const rest = (duration: number, label: string) => {
    if (duration > 0) steps.push({ kind: 'rest', duration, block: index, blockKind: block.kind, label });
  };
  const work = (exercise: string, target: Target, label: string, load?: number, mode?: WorkMode, duration?: number) => {
    const timed = 'seconds' in target;
    steps.push({
      kind: 'work',
      mode: mode ?? (timed ? 'timed' : 'reps'),
      exercise,
      target,
      load: load ?? plan.load(exercise),
      duration: duration ?? (timed ? target.seconds : undefined),
      block: index,
      blockKind: block.kind,
      label,
    });
  };

  switch (block.kind) {
    case 'sets': {
      const reps = plan.reps(block.exercise, block.repRange);
      // Timed exercises (planks, holds) count the range in seconds.
      const target: Target = isTimed(getExercise(block.exercise)) ? { seconds: reps } : { reps };
      for (let s = 0; s < block.sets; s++) {
        work(block.exercise, target, `Set ${s + 1} of ${block.sets}`);
        if (s < block.sets - 1) rest(block.rest, 'Rest');
      }
      break;
    }
    case 'circuit':
      for (let r = 0; r < block.rounds; r++) {
        block.stations.forEach((station, s) => {
          work(station.exercise, station.target, `Round ${r + 1} of ${block.rounds}`, station.load);
          if (s < block.stations.length - 1) rest(block.restBetweenStations, 'Next station');
        });
        if (r < block.rounds - 1) rest(block.restBetweenRounds, 'Rest between rounds');
      }
      break;
    case 'emom':
      for (let m = 0; m < block.minutes; m++) {
        const station = block.stations[m % block.stations.length];
        work(station.exercise, station.target, `Minute ${m + 1} of ${block.minutes}`, station.load, 'window', 60);
      }
      break;
    case 'intervals':
      for (let r = 0; r < block.rounds; r++) {
        const station = block.stations[r % block.stations.length];
        work(station.exercise, { seconds: block.work }, `Interval ${r + 1} of ${block.rounds}`, station.load, 'timed', block.work);
        if (r < block.rounds - 1) rest(block.rest, 'Rest');
      }
      break;
    case 'amrap':
      steps.push({
        kind: 'amrap',
        duration: block.minutes * 60,
        stations: block.stations.map((s) => ({ ...s, load: s.load ?? plan.load(s.exercise) })),
        block: index,
        blockKind: 'amrap',
        label: `${block.minutes}-minute AMRAP`,
      });
      break;
    case 'ladder': {
      const direction = block.to >= block.from ? 1 : -1;
      const step = Math.max(1, Math.abs(block.step)) * direction;
      const rungs: number[] = [];
      for (let reps = block.from; direction > 0 ? reps <= block.to : reps >= block.to; reps += step) rungs.push(reps);
      rungs.forEach((reps, i) => {
        work(block.exercise, { reps }, `Rung ${i + 1} of ${rungs.length}`);
        if (i < rungs.length - 1) rest(block.rest, 'Rest');
      });
      break;
    }
  }
  return steps;
}

export function compileWorkout(workout: Workout, plan: LoadPlan): Step[] {
  return workout.blocks.flatMap((block, index) => {
    const steps = compileBlock(block, index, plan);
    return index < workout.blocks.length - 1
      ? [...steps, { kind: 'rest' as const, duration: BETWEEN_BLOCKS_REST, block: index, blockKind: block.kind, label: 'Next block' }]
      : steps;
  });
}

/** Rough duration in seconds, from each exercise's typical seconds per rep. */
export function estimateSeconds(steps: Step[]): number {
  return steps.reduce((total, step) => {
    if (step.kind !== 'work') return total + step.duration;
    if (step.duration) return total + step.duration;
    const reps = 'reps' in step.target ? step.target.reps : 0;
    const exercise = getExercise(step.exercise);
    return total + reps * (exercise.repSeconds ?? 3) * (exercise.unilateral ? 2 : 1);
  }, 0);
}

export function formatTarget(target: Target, exerciseId: string): string {
  if ('seconds' in target) return `${target.seconds} s`;
  const perSide = getExercise(exerciseId).unilateral ? ' / side' : '';
  return `${target.reps} reps${perSide}`;
}
