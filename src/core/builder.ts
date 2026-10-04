/** Custom workout editing: sensible block defaults, validation and ids. */
import { getExercise, isTimed } from './exercises';
import { BLOCK_LABELS, type Block, type BlockKind, type Station, type Target, type Workout } from './workouts';

const byIdTimed = (id: string) => {
  try {
    return isTimed(getExercise(id));
  } catch {
    return false;
  }
};

export const BLOCK_KINDS: BlockKind[] = ['sets', 'circuit', 'emom', 'amrap', 'intervals', 'ladder'];

export const BLOCK_HELP: Record<BlockKind, string> = {
  sets: 'Fixed sets of one exercise in a rep range. Adds reps, then load.',
  circuit: 'Stations back to back, repeated for rounds.',
  emom: 'A new set at the top of every minute; rest for the remainder.',
  amrap: 'As many rounds as possible before the clock runs out.',
  intervals: 'Work and rest on a timer, cycling through stations.',
  ladder: 'Reps climb (or descend) each rung with short rests.',
};

/** A target in the exercise's own unit: reps, or seconds for holds and timed moves. */
export function defaultTarget(exercise: string): Target {
  return isTimed(getExercise(exercise)) ? { seconds: 30 } : { reps: 10 };
}

/** Keep a station's target when the unit still fits, otherwise switch to the new exercise's default. */
export function retarget(station: Station, exercise: string): Station {
  const fits = isTimed(getExercise(exercise)) === 'seconds' in station.target;
  return { ...station, exercise, target: fits ? station.target : defaultTarget(exercise) };
}

const station = (exercise: string): Station => ({ exercise, target: defaultTarget(exercise) });

export function defaultBlock(kind: BlockKind, exercise = 'kb-swing'): Block {
  switch (kind) {
    case 'sets':
      return { kind, exercise, sets: 3, repRange: isTimed(getExercise(exercise)) ? [20, 45] : [8, 12], rest: 60 };
    case 'circuit':
      return { kind, rounds: 3, restBetweenStations: 15, restBetweenRounds: 60, stations: [station(exercise)] };
    case 'emom':
      return { kind, minutes: 10, stations: [station(exercise)] };
    case 'amrap':
      return { kind, minutes: 10, stations: [station(exercise)] };
    case 'intervals':
      return { kind, work: 30, rest: 30, rounds: 8, stations: [{ exercise, target: { seconds: 30 } }] };
    case 'ladder':
      return { kind, exercise: isTimed(getExercise(exercise)) ? 'kb-swing' : exercise, from: 2, to: 10, step: 2, rest: 30 };
  }
}

/** Keep interval station targets in step with the block's work time. */
export function normalizeBlock(block: Block): Block {
  if (block.kind !== 'intervals') return block;
  return { ...block, stations: block.stations.map((s) => ({ ...s, target: { seconds: block.work } })) };
}

export function validateWorkout(workout: Workout): string[] {
  const errors: string[] = [];
  if (!workout.name.trim()) errors.push('Give the workout a name.');
  if (!workout.blocks.length) errors.push('Add at least one block.');
  workout.blocks.forEach((block, i) => {
    const label = `${BLOCK_LABELS[block.kind]} (block ${i + 1})`;
    const exercises = 'exercise' in block ? [block.exercise] : block.stations.map((s) => s.exercise);
    if (!exercises.length) errors.push(`${label}: add an exercise.`);
    for (const id of exercises) {
      try {
        getExercise(id);
      } catch {
        errors.push(`${label}: unknown exercise ${id}.`);
      }
    }
    if (block.kind === 'sets' && block.repRange[0] > block.repRange[1]) errors.push(`${label}: minimum reps exceed maximum.`);
    if (block.kind === 'ladder' && block.from === block.to) errors.push(`${label}: start and end rungs are the same.`);
    if (block.kind === 'ladder' && exercises.some((id) => byIdTimed(id))) errors.push(`${label}: ladders need an exercise counted in reps.`);
  });
  return errors;
}

export function newWorkoutId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyWorkout(): Workout {
  return { id: newWorkoutId(), name: '', summary: '', blocks: [defaultBlock('circuit')] };
}

/** One-line description used as the summary of custom workouts. */
export function describeWorkout(workout: Workout): string {
  const names = [...new Set(workout.blocks.flatMap((b) => ('exercise' in b ? [b.exercise] : b.stations.map((s) => s.exercise))))];
  const kinds = [...new Set(workout.blocks.map((b) => BLOCK_LABELS[b.kind]))].join(' + ');
  return `${kinds}: ${names.map((id) => getExercise(id).name).join(', ')}.`;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
