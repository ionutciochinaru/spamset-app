/**
 * Done-state celebrations: anime victory poses the figure strikes once you finish a spam set
 * and while you are caught up (clips from tools/animation/celebrations.py). Each plays once,
 * then breathes in the pose, burning with its own anime-style power aura.
 */
import type { SpamSchedule } from './spamset';

/** Aura palettes: golden power-up, blue god form, red overdrive, violet cursed energy, silver instinct, green berserk. */
export type AuraKind = 'gold' | 'blue' | 'red' | 'violet' | 'silver' | 'green';

export type Celebration = { id: string; name: string; aura: AuraKind };

export const CELEBRATIONS: Celebration[] = [
  { id: 'gear-crouch', name: 'Gear crouch', aura: 'red' },
  { id: 'heart-salute', name: 'Heart salute', aura: 'green' },
];

export const getCelebration = (id: string) => CELEBRATIONS.find((c) => c.id === id);

/** The celebration for a set: drawn from its id, so it stays the same on every render and device. */
export function pickCelebration(seed: string, from: Celebration[] = CELEBRATIONS): Celebration {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return from[(h >>> 0) % from.length];
}

/** With spam sets off (or none due yet today), a set keeps you caught up this long. */
const FREE_HOLD_MS = 60 * 60 * 1000;

/**
 * Whether you are caught up: your latest set answers the latest slot that has come due today
 * (done at most half an interval early counts). Before the first slot, or with spam sets off,
 * a set counts for an hour.
 */
export function caughtUp(schedule: SpamSchedule, lastSet: Date | undefined, now: Date): boolean {
  if (!lastSet || lastSet > now) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const active = schedule.enabled && schedule.every > 0 && schedule.days.includes(now.getDay()) && minutes >= schedule.start;
  if (!active) return now.getTime() - lastSet.getTime() < FREE_HOLD_MS;
  const due = schedule.start + Math.floor((Math.min(minutes, schedule.end) - schedule.start) / schedule.every) * schedule.every;
  const slot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(due / 60), due % 60);
  return lastSet.getTime() >= slot.getTime() - (schedule.every / 2) * 60_000;
}
