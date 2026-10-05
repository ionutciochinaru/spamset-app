/**
 * XP, levels, decay and streaks for spam sets. The server (supabase/migrations/
 * 0002_leaderboard.sql) is the authority for leaderboards and implements these same rules;
 * this module shows your own numbers offline and right after a set.
 *
 * - A spam set earns 10 + work + bell bonus, at most 60. Work is reps, or seconds / 3 for
 *   holds; "done" counts at most twice the target. Bell bonus is kg x reps / 20.
 * - Sets less than 3 minutes after the day's last XP-earning set earn nothing (no farming
 *   "One more"), and a day earns at most 1500.
 * - Each missed day costs 2% of your XP, except one free rest day per week (Monday-Sunday).
 * - The streak counts days with XP; the week's free rest day doesn't break it.
 */
import type { SessionLog } from './session';

export const XP = {
  base: 10,
  perSetMax: 60,
  dayMax: 1500,
  gapMinutes: 3,
  decay: 0.02,
  maxReps: 50,
  maxSeconds: 180,
  maxLoad: 100,
} as const;

export const SPAMSET_LOG_ID = 'spamset';

/** XP one spam set log is worth on its own (before the gap and day caps). */
export function setXp(log: SessionLog): number {
  if (log.workoutId !== SPAMSET_LOG_ID || log.entries.length !== 1) return 0;
  const e = log.entries[0];
  if (!(e.done > 0)) return 0;
  if ('reps' in e.target) {
    const reps = Math.min(e.done, 2 * e.target.reps, XP.maxReps);
    const bell = Math.floor((Math.min(Math.max(e.load, 0), XP.maxLoad) * reps) / 20);
    return Math.min(XP.perSetMax, XP.base + reps + bell);
  }
  const seconds = Math.min(e.done, 2 * e.target.seconds, XP.maxSeconds);
  return Math.min(XP.perSetMax, XP.base + Math.floor(seconds / 3));
}

/** Local calendar day, YYYY-MM-DD. */
export function dayOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** XP per day: sets sorted by time, the 3-minute gap applied within each day, then the day cap. */
export function dailyXp(logs: SessionLog[]): Map<string, number> {
  const days = new Map<string, number>();
  const lastEarned = new Map<string, number>();
  for (const log of [...logs].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const xp = setXp(log);
    if (!xp) continue;
    const at = Date.parse(log.startedAt);
    const day = dayOf(new Date(at));
    if (at - (lastEarned.get(day) ?? -Infinity) < XP.gapMinutes * 60000) continue;
    lastEarned.set(day, at);
    days.set(day, Math.min(XP.dayMax, (days.get(day) ?? 0) + xp));
  }
  return days;
}

/** Monday of the week containing `day`, as YYYY-MM-DD. */
function weekOf(day: Date): string {
  const d = new Date(day);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayOf(d);
}

export type XpState = {
  /** All-time XP after decay. */
  total: number;
  /** XP earned this week (Monday-Sunday), before decay. */
  week: number;
  /** Earned today. */
  today: number;
  streak: number;
  bestStreak: number;
  level: number;
  /** XP into the current level, and the size of that level. */
  levelXp: number;
  levelSize: number;
};

/** Level n starts at 50 x (n - 1)^2 XP: 50, 200, 450, 800... */
export function levelOf(total: number): { level: number; levelXp: number; levelSize: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, total) / 50)) + 1;
  const start = 50 * (level - 1) ** 2;
  const end = 50 * level ** 2;
  return { level, levelXp: Math.floor(total - start), levelSize: end - start };
}

/**
 * Replay every day from the first XP day to today: add the day's XP, or, for a missed day
 * before today, use the week's free rest day or lose 2%.
 */
export function xpState(logs: SessionLog[], now = new Date()): XpState {
  const days = dailyXp(logs);
  const todayKey = dayOf(now);
  const empty = { total: 0, week: 0, today: 0, streak: 0, bestStreak: 0, ...levelOf(0) };
  if (!days.size) return empty;

  const first = [...days.keys()].sort()[0];
  const [y, m, d] = first.split('-').map(Number);
  const cursor = new Date(y, m - 1, d);
  const thisWeek = weekOf(now);
  let total = 0;
  let week = 0;
  let streak = 0;
  let best = 0;
  let restWeek = '';

  for (let key = dayOf(cursor); key <= todayKey; cursor.setDate(cursor.getDate() + 1), key = dayOf(cursor)) {
    const xp = days.get(key) ?? 0;
    const wk = weekOf(cursor);
    if (xp > 0) {
      total += xp;
      streak += 1;
      if (wk === thisWeek) week += xp;
    } else if (key !== todayKey) {
      if (restWeek !== wk) restWeek = wk;
      else {
        total = Math.floor(total * (1 - XP.decay));
        streak = 0;
      }
    }
    best = Math.max(best, streak);
  }
  return { total, week, today: days.get(todayKey) ?? 0, streak, bestStreak: best, ...levelOf(total) };
}
