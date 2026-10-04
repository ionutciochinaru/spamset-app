import { dayStreak } from '../session';

const at = (d: number, h = 12) => ({ startedAt: new Date(2026, 9, d, h).toISOString() });
const now = new Date(2026, 9, 10, 15);

describe('dayStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(dayStreak([at(10), at(9), at(8), at(6)], now)).toBe(3);
  });

  it('keeps yesterday’s streak alive until today ends', () => {
    expect(dayStreak([at(9), at(8)], now)).toBe(2);
  });

  it('counts several sessions on one day once', () => {
    expect(dayStreak([at(10, 8), at(10, 18), at(9)], now)).toBe(2);
  });

  it('is zero after a missed day', () => {
    expect(dayStreak([at(8)], now)).toBe(0);
    expect(dayStreak([], now)).toBe(0);
  });
});
