import { CELEBRATIONS, caughtUp, pickCelebration } from '../celebrations';
import { DEFAULT_SCHEDULE, type SpamSchedule } from '../spamset';

const on: SpamSchedule = { ...DEFAULT_SCHEDULE, enabled: true };
// Monday 5 October 2026, local time.
const monday = (h: number, m = 0) => new Date(2026, 9, 5, h, m);

describe('celebrations', () => {
  it('has unique ids', () => {
    expect(new Set(CELEBRATIONS.map((c) => c.id)).size).toBe(CELEBRATIONS.length);
  });

  it('picks the same celebration for the same set', () => {
    expect(pickCelebration('set-1')).toEqual(pickCelebration('set-1'));
    const picks = new Set(Array.from({ length: 200 }, (_, i) => pickCelebration(`set-${i}`).id));
    expect(picks.size).toBe(CELEBRATIONS.length);
  });
});

describe('caught up', () => {
  it('needs a set', () => {
    expect(caughtUp(on, undefined, monday(10, 30))).toBe(false);
  });

  it('holds until the next slot comes due', () => {
    expect(caughtUp(on, monday(10, 5), monday(10, 59))).toBe(true);
    expect(caughtUp(on, monday(10, 5), monday(11))).toBe(false);
  });

  it('counts a set done a little early', () => {
    expect(caughtUp(on, monday(10, 50), monday(11, 10))).toBe(true);
    expect(caughtUp(on, monday(10, 20), monday(11, 10))).toBe(false);
  });

  it('stays caught up after the last slot of the day', () => {
    expect(caughtUp(on, monday(18, 2), monday(22))).toBe(true);
  });

  it('lasts an hour with spam sets off or before the first slot', () => {
    expect(caughtUp(DEFAULT_SCHEDULE, monday(14), monday(14, 59))).toBe(true);
    expect(caughtUp(DEFAULT_SCHEDULE, monday(14), monday(15, 1))).toBe(false);
    expect(caughtUp(on, monday(7), monday(7, 30))).toBe(true);
  });
});
