import { getExercise, exerciseCategory } from '../exercises';
import {
  DEFAULT_SCHEDULE,
  liveSwaps,
  pickFor,
  planSpamsets,
  spamCandidates,
  spamTarget,
  swapPick,
  targetText,
  upcomingTimes,
  type SpamSchedule,
} from '../spamset';

const on: SpamSchedule = { ...DEFAULT_SCHEDULE, enabled: true };
// Monday 5 October 2026, local time.
const monday = (h: number, m = 0) => new Date(2026, 9, 5, h, m);

describe('spam set schedule', () => {
  it('fires on the interval inside active hours, start and end included', () => {
    const times = upcomingTimes({ ...on, every: 180 }, monday(8), 10).filter((t) => t.getDate() === 5);
    expect(times.map((t) => t.getHours())).toEqual([9, 12, 15, 18]);
  });

  it('starts after the given moment', () => {
    expect(upcomingTimes(on, monday(9, 30), 1)[0]).toEqual(monday(10));
  });

  it('skips inactive days', () => {
    const friday = new Date(2026, 9, 9, 18, 30);
    expect(upcomingTimes(on, friday, 1)[0]).toEqual(new Date(2026, 9, 12, 9, 0));
  });

  it('returns nothing without days or with an inverted window', () => {
    expect(upcomingTimes({ ...on, days: [] }, monday(8), 5)).toEqual([]);
    expect(upcomingTimes({ ...on, start: 600, end: 500 }, monday(8), 5)).toEqual([]);
  });
});

describe('spam set picks', () => {
  it('draws from the pool and your equipment', () => {
    const ids = spamCandidates({ ...on, pool: ['stretch'] }, []);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => exerciseCategory(getExercise(id)) === 'stretch')).toBe(true);
    expect(spamCandidates({ ...on, pool: ['kettlebell'] }, [])).toEqual([]);
  });

  it('is stable per slot and never repeats back to back', () => {
    const candidates = spamCandidates(on, ['kettlebell']);
    expect(pickFor(monday(10), candidates)).toBe(pickFor(monday(10), candidates));
    const plan = planSpamsets(on, ['kettlebell'], monday(8), 40);
    expect(plan).toHaveLength(40);
    plan.slice(1).forEach((s, i) => expect(s.exercise).not.toBe(plan[i].exercise));
  });

  it('plans nothing when off', () => {
    expect(planSpamsets(DEFAULT_SCHEDULE, [], monday(8), 5)).toEqual([]);
  });

  it('uses a swapped exercise for its slot only, while it is still a candidate', () => {
    const candidates = spamCandidates(on, []);
    const [first, second] = planSpamsets(on, [], monday(8), 2);
    const other = candidates.find((id) => id !== first.exercise && id !== second.exercise)!;
    const swapped = planSpamsets(on, [], monday(8), 2, { [first.at.toISOString()]: other });
    expect(swapped[0]).toEqual({ at: first.at, exercise: other });
    expect(swapped[1].at).toEqual(second.at);
    expect(planSpamsets(on, [], monday(8), 1, { [first.at.toISOString()]: 'kb-swing' })[0].exercise).toBe(first.exercise);
  });

  it('swaps to a different candidate and forgets past swaps', () => {
    expect(swapPick(['a', 'b', 'c'], 'a', () => 0)).toBe('b');
    expect(swapPick(['a', 'b', 'c'], 'a', () => 0.99)).toBe('c');
    expect(swapPick(['a'], 'a')).toBeUndefined();
    const swaps = { [monday(9).toISOString()]: 'a', [monday(11).toISOString()]: 'b' };
    expect(liveSwaps(swaps, monday(10))).toEqual({ [monday(11).toISOString()]: 'b' });
  });

  it('asks for your current target', () => {
    const p = { load: 0, reps: 12, missStreak: 0, easyStreak: 0 };
    expect(spamTarget('pushup', p)).toEqual({ reps: 12 });
    expect(spamTarget('plank', { ...p, reps: 35 })).toEqual({ seconds: 35 });
    expect(spamTarget('cat-cow', p)).toEqual({ seconds: 30 });
    expect(targetText('kb-reverse-lunge', { reps: 8 })).toBe('8 reps per side');
  });
});
