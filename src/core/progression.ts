/**
 * Spam set progression. After each spam set you rate it Easy, Good or Hard:
 * - Easy twice in a row adds a rep (5 s for holds) next time. At the top of the range a
 *   kettlebell exercise moves to your next bell and restarts at 8 reps; a bodyweight
 *   exercise suggests its harder variant.
 * - Hard twice in a row steps back a rep (5 s), or to a lighter bell at the bottom.
 * - Good keeps the target. Stretches never progress.
 */
import { getExercise, isLoaded, isStretch, isTimed, type Pattern } from './exercises';

export type Effort = 'easy' | 'good' | 'hard';

export type Prescription = {
  load: number;
  /** Next target reps for strength sets. */
  reps: number;
  missStreak: number;
  easyStreak: number;
};

export type Change = 'load-up' | 'load-down' | 'reps-up' | 'reps-down' | 'hold' | 'maxed';

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

/** Starting point: the conservative bell, 8 reps (20 s for holds). */
export function initialPrescription(exerciseId: string, bells: number[]): Prescription {
  const start = isTimed(getExercise(exerciseId)) ? 20 : 8;
  return { load: defaultLoad(exerciseId, bells), reps: start, missStreak: 0, easyStreak: 0 };
}

/** Spam set range: reps, or seconds for holds. */
export function spamRange(exerciseId: string): [number, number] {
  return isTimed(getExercise(exerciseId)) ? [10, 60] : [3, 20];
}

/** Reps or seconds, for progression messages. */
function amount(value: number, timed: boolean): string {
  return timed ? `${value} s` : `${value} reps`;
}

/** Apply one spam set's rating to the exercise's target. */
export function progressSpamset(prev: Prescription, effort: Effort, exerciseId: string, bells: number[]): Progress {
  const exercise = getExercise(exerciseId);
  if (isStretch(exercise)) return { next: prev, change: 'hold', reason: 'Stretches stay as they are.' };
  const timed = isTimed(exercise);
  const step = timed ? 5 : 1;
  const [min, max] = spamRange(exerciseId);
  const reps = Math.min(max, Math.max(min, prev.reps));
  const base = { ...prev, reps };

  if (effort === 'good') {
    return { next: { ...base, easyStreak: 0, missStreak: 0 }, change: 'hold', reason: `Good. ${amount(reps, timed)} again next time.` };
  }

  if (effort === 'hard') {
    const missStreak = prev.missStreak + 1;
    if (missStreak < 2) {
      return { next: { ...base, easyStreak: 0, missStreak }, change: 'hold', reason: 'Hard. Same target next time; another hard one steps it back.' };
    }
    if (reps > min) {
      const lower = Math.max(min, reps - step);
      return { next: { ...base, reps: lower, easyStreak: 0, missStreak: 0 }, change: 'reps-down', reason: `Hard twice. Next time ${amount(lower, timed)}.` };
    }
    const lighter = isLoaded(exercise) ? lighterBell(prev.load, bells) : undefined;
    if (lighter !== undefined) {
      return {
        next: { ...base, load: lighter, reps: 8, easyStreak: 0, missStreak: 0 },
        change: 'load-down',
        reason: `Hard twice at the bottom of the range. Next time ${lighter} kg for 8 reps.`,
      };
    }
    return { next: { ...base, easyStreak: 0, missStreak: 0 }, change: 'hold', reason: 'Hard twice. Keep this target and take your time.' };
  }

  const easyStreak = prev.easyStreak + 1;
  if (easyStreak < 2) {
    return { next: { ...base, easyStreak, missStreak: 0 }, change: 'hold', reason: 'Easy. One more easy one and the target goes up.' };
  }
  if (reps < max) {
    const higher = Math.min(max, reps + step);
    return { next: { ...base, reps: higher, easyStreak: 0, missStreak: 0 }, change: 'reps-up', reason: `Easy twice. Next time ${amount(higher, timed)}.` };
  }
  const heavier = isLoaded(exercise) ? heavierBell(prev.load, bells) : undefined;
  if (heavier !== undefined) {
    return {
      next: { ...base, load: heavier, reps: 8, easyStreak: 0, missStreak: 0 },
      change: 'load-up',
      reason: `Top of the range. Next time ${heavier} kg for 8 reps.`,
    };
  }
  const harder = exercise.harder;
  return {
    next: { ...base, easyStreak: 0, missStreak: 0 },
    change: 'maxed',
    reason: harder ? `Top of the range. Ready for ${getExercise(harder).name}.` : 'Top of the range. Slow the tempo to keep it challenging.',
    ...(harder ? { suggest: harder } : {}),
  };
}
