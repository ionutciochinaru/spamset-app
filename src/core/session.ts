import { getExercise, isStretch } from './exercises';
import { initialPrescription, progressByEffort, progressSets, type Effort, type Prescription, type Progress } from './progression';
import type { BlockKind, Target, Workout } from './workouts';

export type SetEntry = {
  exercise: string;
  blockKind: BlockKind;
  block: number;
  load: number;
  target: Target;
  /** Completed reps (reps work) or seconds (timed work). */
  done: number;
};

export type SessionLog = {
  id: string;
  workoutId: string;
  workoutName: string;
  startedAt: string;
  finishedAt: string;
  entries: SetEntry[];
  /** AMRAP rounds completed, keyed by block index. */
  amrapRounds: Record<number, number>;
  effort: Record<string, Effort>;
  /** Progression applied at save time, for History to explain (`suggest`: a harder variant). */
  progress: Record<string, { change: Progress['change']; reason: string; suggest?: string }>;
};

/** Reps of a rep-counted entry, both sides counted for unilateral exercises. */
function entryReps(e: SetEntry): number {
  if (!('reps' in e.target)) return 0;
  return e.done * (getExercise(e.exercise).unilateral ? 2 : 1);
}

/** Total kilograms moved: load × reps for rep work (timed work excluded). */
export function volumeKg(log: SessionLog): number {
  return log.entries.reduce((sum, e) => sum + e.load * entryReps(e), 0);
}

export function totalReps(log: SessionLog): number {
  return log.entries.reduce((sum, e) => sum + entryReps(e), 0);
}

function summary({ change, reason, suggest }: Progress): SessionLog['progress'][string] {
  return suggest ? { change, reason, suggest } : { change, reason };
}

/**
 * Apply progression to every exercise a finished session trained. Strength
 * sets use double progression per block; everything else follows effort.
 */
export function applyProgression(
  workout: Workout,
  entries: SetEntry[],
  effort: Record<string, Effort>,
  current: Record<string, Prescription>,
  bells: number[],
): { prescriptions: Record<string, Prescription>; progress: SessionLog['progress'] } {
  const prescriptions = { ...current };
  const progress: SessionLog['progress'] = {};
  const seen = new Set<string>();

  workout.blocks.forEach((block, index) => {
    const blockEntries = entries.filter((e) => e.block === index);
    if (block.kind === 'sets' && !isStretch(getExercise(block.exercise))) {
      const prev = prescriptions[block.exercise] ?? initialPrescription(block.exercise, bells, block.repRange[0]);
      const reps = blockEntries.filter((e) => e.exercise === block.exercise).map((e) => e.done);
      if (!reps.length) return;
      const result = progressSets(prev, block.repRange, reps, effort[block.exercise], bells, block.exercise);
      prescriptions[block.exercise] = result.next;
      progress[block.exercise] = summary(result);
      seen.add(block.exercise);
    }
  });

  for (const exercise of new Set(entries.map((e) => e.exercise))) {
    if (seen.has(exercise) || isStretch(getExercise(exercise))) continue;
    const prev = prescriptions[exercise] ?? initialPrescription(exercise, bells);
    const result = progressByEffort(prev, effort[exercise], bells, exercise);
    prescriptions[exercise] = result.next;
    progress[exercise] = summary(result);
  }
  return { prescriptions, progress };
}
