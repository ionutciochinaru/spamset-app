import type { SessionLog, Target } from '../session';
import { dailyXp, levelOf, setXp, xpState } from '../xp';

let n = 0;
function log(at: Date, target: Target, done: number, load = 0, workoutId = 'spamset'): SessionLog {
  return {
    id: String(n++),
    workoutId,
    workoutName: 'Spam set',
    startedAt: at.toISOString(),
    finishedAt: at.toISOString(),
    entries: [{ exercise: 'pushup', blockKind: 'spamset', block: 0, load, target, done }],
    amrapRounds: {},
    effort: {},
    progress: {},
  };
}
const day = (d: number, h = 12, m = 0) => new Date(2026, 9, d, h, m); // October 2026; the 5th is a Monday

describe('setXp', () => {
  it('pays base + reps, seconds / 3 for holds', () => {
    expect(setXp(log(day(5), { reps: 10 }, 10))).toBe(20);
    expect(setXp(log(day(5), { seconds: 30 }, 30))).toBe(20);
  });

  it('adds a bell bonus and caps a set at 60', () => {
    expect(setXp(log(day(5), { reps: 10 }, 10, 16))).toBe(28);
    expect(setXp(log(day(5), { reps: 20 }, 20, 32))).toBe(60);
  });

  it('counts at most twice the target and nothing for zero', () => {
    expect(setXp(log(day(5), { reps: 5 }, 200))).toBe(20);
    expect(setXp(log(day(5), { reps: 5 }, 0))).toBe(0);
  });

  it('ignores older workout logs', () => {
    expect(setXp(log(day(5), { reps: 10 }, 10, 0, 'swing-foundations'))).toBe(0);
  });
});

describe('dailyXp', () => {
  it('skips sets within 3 minutes of the last earning set', () => {
    const days = dailyXp([log(day(5, 9, 0), { reps: 10 }, 10), log(day(5, 9, 2), { reps: 10 }, 10), log(day(5, 9, 5), { reps: 10 }, 10)]);
    expect(days.get('2026-10-05')).toBe(40);
  });

  it('caps a day at 1500', () => {
    // 40 max-value sets, 5 minutes apart from 06:00: 2400 XP before the cap.
    const logs = Array.from({ length: 40 }, (_, i) => log(new Date(day(5, 6).getTime() + i * 5 * 60000), { reps: 20 }, 20, 32));
    expect(dailyXp(logs).get('2026-10-05')).toBe(1500);
  });
});

describe('xpState', () => {
  const set = (d: number) => log(day(d), { reps: 10 }, 10); // 20 XP

  it('totals, this week and today', () => {
    const s = xpState([set(5), set(6), set(7)], day(7, 20));
    expect(s).toMatchObject({ total: 60, week: 60, today: 20, streak: 3 });
  });

  it('forgives one missed day a week, then decays 2% per missed day', () => {
    // Active Mon 5 and Tue 6; Wed 7 is the free rest day; Thu 8 and Fri 9 decay.
    const monday = Array.from({ length: 50 }, (_, i) => log(new Date(day(5, 6).getTime() + i * 4 * 60000), { reps: 10 }, 10));
    const s = xpState([...monday, set(6)], day(10, 9));
    const before = 50 * 20 + 20;
    expect(s.total).toBe(Math.floor(Math.floor(before * 0.98) * 0.98));
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
  });

  it('a free rest day keeps the streak going', () => {
    expect(xpState([set(5), set(7)], day(7, 20)).streak).toBe(2);
  });

  it('today without a set yet does not decay or break the streak', () => {
    expect(xpState([set(5), set(6)], day(7, 8))).toMatchObject({ total: 40, streak: 2, today: 0 });
  });

  it('the rest day resets each week', () => {
    // Miss Wed 7 (rest), active to Sun 11, miss Mon 12 (new week's rest), active Tue 13.
    const s = xpState([set(5), set(6), set(8), set(9), set(10), set(11), set(13)], day(13, 20));
    expect(s.total).toBe(140);
    expect(s.streak).toBe(7);
  });
});

describe('levelOf', () => {
  it('levels at 50, 200, 450', () => {
    expect(levelOf(0)).toMatchObject({ level: 1, levelXp: 0, levelSize: 50 });
    expect(levelOf(50).level).toBe(2);
    expect(levelOf(199).level).toBe(2);
    expect(levelOf(450)).toMatchObject({ level: 4, levelXp: 0, levelSize: 350 });
  });
});
