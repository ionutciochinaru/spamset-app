/**
 * Progressive overload.
 *
 * Strength sets use double progression inside a rep range: add reps until every
 * set reaches the top of the range, then move to the next heavier bell you own
 * and restart at the bottom. Two sessions in a row below the range step back
 * down. Timed and circuit work progress load from effort ratings instead:
 * two Easy ratings in a row move to the next bell.
 *
 * Bodyweight and other unloaded exercises climb the same range (seconds for
 * holds), and once it is topped suggest the exercise's harder variant.
 * Stretches never progress.
 */
import { getExercise, isLoaded, isTimed, type Pattern } from './exercises';

export type Effort = 'easy' | 'good' | 'hard';

export type Prescription = {
  load: number;
  /** Next target reps for strength sets. */
  reps: number;
  missStreak: number;
  easyStreak: number;
};

export type Change = 'load-up' | 'load-down' | 'reps-up' | 'hold' | 'maxed';

/** `suggest`: a harder variant to swap in, for unloaded exercises that topped their range. */
export type Progress = { next: Prescription; change: Change; reason: string; suggest?: string };

export function sortedBells(bells: number[]): number[] {
  return [...new Set(bells)].filter((b) => b > 0).sort((a, b) => a - b);
}

export function heavierBell(load: number, bells: number[]): number | undefined {
  return sortedBells(bells).find((b) => b > load);
}

export function lighterBell(load: number, bells: number[]): number | undefined {
  return sortedBells(bells).reverse().find((b) => b < load);
}

const START_FRACTION: Record<Pattern, number> = {
  hinge: 0.5,
  squat: 0.34,
  lunge: 0.2,
  pull: 0.2,
  press: 0,
  arms: 0,
  core: 0,
  'full-body': 0,
  mobility: 0,
};

/** Conservative starting bell: hinges start mid-range, small muscles lightest. */
export function defaultLoad(exerciseId: string, bells: number[]): number {
  const exercise = getExercise(exerciseId);
  const sorted = sortedBells(bells);
  if (!isLoaded(exercise) || !sorted.length) return 0;
  const fraction = START_FRACTION[exercise.pattern];
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

/** Starting point: the conservative bell, 8 reps (20 s for holds) unless a range says otherwise. */
export function initialPrescription(exerciseId: string, bells: number[], repMin?: number): Prescription {
  const start = repMin ?? (isTimed(getExercise(exerciseId)) ? 20 : 8);
  return { load: defaultLoad(exerciseId, bells), reps: start, missStreak: 0, easyStreak: 0 };
}

/** Clamp a stored target into a block's rep range. */
export function targetReps(prev: Prescription, repRange: [number, number]): number {
  return Math.min(repRange[1], Math.max(repRange[0], prev.reps));
}

/** Reps or seconds, for progression messages. */
function amount(value: number, timed: boolean): string {
  return timed ? `${value} s` : `${value} reps`;
}

function harderSuggestion(exerciseId: string): { suggest?: string; text: string } {
  const harder = getExercise(exerciseId).harder;
  return harder ? { suggest: harder, text: ` Ready for ${getExercise(harder).name}: swap it into your workout.` } : { text: '' };
}

export function progressSets(
  prev: Prescription,
  repRange: [number, number],
  setReps: number[],
  effort: Effort | undefined,
  bells: number[],
  exerciseId?: string,
): Progress {
  const exercise = exerciseId ? getExercise(exerciseId) : undefined;
  const loaded = exercise ? isLoaded(exercise) : true;
  const timed = exercise ? isTimed(exercise) : false;
  const [min, max] = repRange;
  const target = targetReps(prev, repRange);
  const base = { ...prev, reps: target, easyStreak: 0 };
  if (!setReps.length) return { next: base, change: 'hold', reason: 'No sets completed.' };

  if (setReps.some((r) => r < min)) {
    const missStreak = prev.missStreak + 1;
    const lighter = loaded ? lighterBell(prev.load, bells) : undefined;
    if (missStreak >= 2 && lighter !== undefined) {
      return {
        next: { ...base, load: lighter, reps: min, missStreak: 0 },
        change: 'load-down',
        reason: `Below ${min} reps two sessions running. Dropping to ${lighter} kg to rebuild.`,
      };
    }
    return {
      next: { ...base, missStreak },
      change: 'hold',
      reason: `A set fell below ${amount(min, timed)}. Same target next time.`,
    };
  }

  if (effort === 'hard') {
    return { next: { ...base, missStreak: 0 }, change: 'hold', reason: 'Rated hard. Repeat this target.' };
  }

  if (setReps.every((r) => r >= max)) {
    const heavier = loaded ? heavierBell(prev.load, bells) : undefined;
    if (heavier === undefined) {
      const harder = exerciseId && !loaded ? harderSuggestion(exerciseId) : { text: '' };
      return {
        next: { ...base, reps: max, missStreak: 0 },
        change: 'maxed',
        reason: loaded
          ? `Top of the range with your heaviest bell. Add a set, slow the tempo or get a heavier bell.`
          : `Every set hit ${amount(max, timed)}.${harder.text || ' Add a set or slow the tempo.'}`,
        ...(harder.suggest ? { suggest: harder.suggest } : {}),
      };
    }
    return {
      next: { ...base, load: heavier, reps: min, missStreak: 0 },
      change: 'load-up',
      reason: `Every set hit ${max}. Move up to ${heavier} kg at ${min} reps.`,
    };
  }

  const reached = setReps.every((r) => r >= target);
  if (!reached) {
    return { next: { ...base, missStreak: 0 }, change: 'hold', reason: `Aim for ${amount(target, timed)} on every set again.` };
  }
  // Holds climb in 5-second steps, reps one at a time; Easy doubles the step.
  const step = (timed ? 5 : 1) * (effort === 'easy' ? 2 : 1);
  const reps = Math.min(max, target + step);
  return {
    next: { ...base, reps, missStreak: 0 },
    change: 'reps-up',
    reason: `All sets reached ${amount(target, timed)}. Next target ${amount(reps, timed)}.`,
  };
}

/**
 * Circuits, intervals, EMOM, AMRAP and ladders: load follows effort. Unloaded exercises
 * keep their target and, after two Easy sessions, suggest their harder variant.
 */
export function progressByEffort(prev: Prescription, effort: Effort | undefined, bells: number[], exerciseId?: string): Progress {
  if (exerciseId && !isLoaded(getExercise(exerciseId))) {
    if (effort !== 'easy') {
      return { next: { ...prev, easyStreak: 0 }, change: 'hold', reason: effort === 'hard' ? 'Hard. Keep this target.' : 'Good. Keep this target.' };
    }
    const easyStreak = prev.easyStreak + 1;
    const harder = easyStreak >= 2 ? harderSuggestion(exerciseId) : { text: '' };
    if (harder.suggest) {
      return { next: { ...prev, easyStreak: 0 }, change: 'hold', reason: `Easy twice in a row.${harder.text}`, suggest: harder.suggest };
    }
    return { next: { ...prev, easyStreak }, change: 'hold', reason: 'Easy. Add reps or time to this station next time.' };
  }
  if (effort === 'easy') {
    const easyStreak = prev.easyStreak + 1;
    const heavier = heavierBell(prev.load, bells);
    if (easyStreak >= 2 && heavier !== undefined) {
      return {
        next: { ...prev, load: heavier, easyStreak: 0 },
        change: 'load-up',
        reason: `Easy twice in a row. Next time use ${heavier} kg.`,
      };
    }
    return { next: { ...prev, easyStreak }, change: 'hold', reason: 'Easy. One more easy session moves you up a bell.' };
  }
  if (effort === 'hard') {
    return { next: { ...prev, easyStreak: 0 }, change: 'hold', reason: 'Hard. Stay at this bell.' };
  }
  return { next: prev, change: 'hold', reason: 'Good. Keep this bell.' };
}
