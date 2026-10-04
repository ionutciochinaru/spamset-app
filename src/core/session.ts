/**
 * Logged activity. Every spam set is saved as a one-entry session log, the same shape the
 * app used for full workouts, so History and sync keep reading older logs.
 */
import { getExercise } from './exercises';
import type { Effort, Progress } from './progression';

/** What a set asks for: reps, or seconds for holds and stretches. */
export type Target = { reps: number } | { seconds: number };

export type SetEntry = {
  exercise: string;
  /** 'spamset' for spam sets; older workout logs hold their block kind. */
  blockKind: string;
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
  /** AMRAP rounds from older workout logs; empty for spam sets. */
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

/**
 * Consecutive local days with at least one logged session or spam set, counting back from
 * today. A day not yet trained today doesn't break the streak until it ends.
 */
export function dayStreak(sessions: Pick<SessionLog, 'startedAt'>[], now = new Date()): number {
  const days = new Set(sessions.map((s) => new Date(s.startedAt).toDateString()));
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(day.toDateString())) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (days.has(day.toDateString())) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}
