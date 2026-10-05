/**
 * Spam sets: one short exercise at a fixed interval through the day, delivered as a
 * notification. This module plans the slots and picks the exercise for each one. It is
 * shared by the app (local notifications on iOS/Android, page timers on web) and the
 * Chrome extension, so every surface agrees on what fires when.
 */
import { canDo, EXERCISES, exerciseCategory, getExercise, isStretch, isTimed, type Category, type Equipment } from './exercises';
import type { Prescription } from './progression';
import type { Target } from './session';

export type SpamSchedule = {
  enabled: boolean;
  /** Minutes between spam sets. */
  every: number;
  /** Active hours as minutes after midnight, local time. The first set fires at `start`. */
  start: number;
  end: number;
  /** Active weekdays, 0 = Sunday. */
  days: number[];
  /** Categories the exercise is drawn from. */
  pool: Category[];
  /** Exercises you switched off in the library, never drawn. */
  off?: string[];
};

export const DEFAULT_SCHEDULE: SpamSchedule = {
  enabled: false,
  every: 60,
  start: 9 * 60,
  end: 18 * 60,
  days: [1, 2, 3, 4, 5],
  pool: ['bodyweight', 'core', 'stretch'],
};

export const INTERVALS = [15, 30, 45, 60, 90, 120];

export type SpamSlot = { at: Date; exercise: string };

/** Exercises a schedule can draw from: in the pool and possible with your equipment. */
export function spamCandidates(schedule: SpamSchedule, owned: Equipment[]): string[] {
  const off = new Set(schedule.off ?? []);
  return EXERCISES.filter((e) => schedule.pool.includes(exerciseCategory(e)) && canDo(e, owned) && !off.has(e.id)).map((e) => e.id);
}

/** Slot times strictly after `from`, at most `count`, looking up to `horizonDays` ahead. */
export function upcomingTimes(schedule: SpamSchedule, from: Date, count: number, horizonDays = 14): Date[] {
  const out: Date[] = [];
  if (!schedule.days.length || schedule.every <= 0 || schedule.end < schedule.start) return out;
  for (let d = 0; d <= horizonDays && out.length < count; d++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d);
    if (!schedule.days.includes(day.getDay())) continue;
    for (let m = schedule.start; m <= schedule.end && out.length < count; m += schedule.every) {
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60);
      if (at > from) out.push(at);
    }
  }
  return out;
}

/** Stable 32-bit hash, so a slot draws the same exercise on every device. */
function hash(n: number): number {
  let h = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The exercise for a slot: drawn from the candidates by the slot's minute, never the same twice in a row. */
export function pickFor(at: Date, candidates: string[], previous?: string): string | undefined {
  if (!candidates.length) return undefined;
  const minute = Math.floor(at.getTime() / 60000);
  const pick = candidates[hash(minute) % candidates.length];
  if (pick !== previous || candidates.length === 1) return pick;
  return candidates[(hash(minute) + 1) % candidates.length];
}

/** Switch one exercise on or off for spam sets. */
export function setExerciseOn(schedule: SpamSchedule, id: string, on: boolean): SpamSchedule {
  const off = (schedule.off ?? []).filter((x) => x !== id);
  return { ...schedule, off: on ? off : [...off, id] };
}

/** Exercises you swapped in for upcoming slots, keyed by the slot's ISO time. */
export type SpamSwaps = Record<string, string>;

/**
 * The next `count` spam sets after `from`. Empty when the schedule is off or nothing fits your
 * equipment. A swap replaces a slot's pick while it is still a candidate.
 */
export function planSpamsets(schedule: SpamSchedule, owned: Equipment[], from: Date, count: number, swaps: SpamSwaps = {}): SpamSlot[] {
  return planFrom(schedule, spamCandidates(schedule, owned), from, count, swaps);
}

/** Plan over a fixed candidate list (the Chrome extension gets the list from the web app). */
export function planFrom(schedule: SpamSchedule, candidates: string[], from: Date, count: number, swaps: SpamSwaps = {}): SpamSlot[] {
  if (!schedule.enabled) return [];
  const slots: SpamSlot[] = [];
  for (const at of upcomingTimes(schedule, from, count)) {
    const swapped = swaps[at.toISOString()];
    const exercise = swapped && candidates.includes(swapped) ? swapped : pickFor(at, candidates, slots.at(-1)?.exercise);
    if (exercise) slots.push({ at, exercise });
  }
  return slots;
}

/** A different candidate than `current`, at random (the swap button); undefined when there is none. */
export function swapPick(candidates: string[], current: string | undefined, random = Math.random): string | undefined {
  const others = candidates.filter((id) => id !== current);
  return others.length ? others[Math.floor(random() * others.length)] : undefined;
}

/** Swaps for slots still ahead of `now` (older ones are dropped). */
export function liveSwaps(swaps: SpamSwaps, now: Date): SpamSwaps {
  return Object.fromEntries(Object.entries(swaps).filter(([at]) => new Date(at) > now));
}

/** Notification text for a slot. */
export function slotMessage(name: string, target: string): { title: string; body: string } {
  return { title: `Spam set: ${name}`, body: `${target}. Tap to start.` };
}

/**
 * What the web app hands the Chrome extension (window.postMessage → content script), so the
 * extension can keep firing spam sets with the tab closed. `exercises` are the candidates with
 * their current names and targets.
 */
export type ExtensionConfig = {
  schedule: SpamSchedule;
  exercises: Record<string, { name: string; target: string }>;
  appUrl: string;
};

/** What a spam set asks for: your current target, or 30 s for a stretch. */
export function spamTarget(exerciseId: string, prescription: Prescription): Target {
  const e = getExercise(exerciseId);
  if (isStretch(e)) return { seconds: 30 };
  return isTimed(e) ? { seconds: prescription.reps } : { reps: prescription.reps };
}

/** "12 reps", "30 s", "8 reps per side". */
export function targetText(exerciseId: string, target: Target): string {
  const base = 'reps' in target ? `${target.reps} reps` : `${target.seconds} s`;
  return getExercise(exerciseId).unilateral ? `${base} per side` : base;
}

/** "9:00 AM" for minutes after midnight (the app uses 12-hour time everywhere). */
export function clockText(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "12:15 PM" for a moment, in local time. */
export function timeText(at: Date): string {
  return clockText(at.getHours() * 60 + at.getMinutes());
}
