import { defaultLoad, initialPrescription, progressSpamset, spamRange, type Prescription } from '../progression';

const bells = [8, 12, 16, 20, 24];
const at = (load: number, reps: number, extra: Partial<Prescription> = {}): Prescription => ({
  load,
  reps,
  missStreak: 0,
  easyStreak: 0,
  ...extra,
});

describe('starting point', () => {
  it('starts reps at 8, holds at 20 s, bodyweight with no load', () => {
    expect(initialPrescription('pushup', bells)).toMatchObject({ load: 0, reps: 8 });
    expect(initialPrescription('plank', bells).reps).toBe(20);
    expect(defaultLoad('kb-swing', bells)).toBeGreaterThan(0);
  });

  it('starts hinges mid-range and presses on the lightest bell', () => {
    expect(defaultLoad('kb-deadlift', bells)).toBe(16);
    expect(defaultLoad('kb-press', bells)).toBe(8);
  });
});

describe('progressSpamset', () => {
  it('needs two easy ratings to add a rep', () => {
    const first = progressSpamset(at(0, 10), 'easy', 'pushup', bells);
    expect(first.change).toBe('hold');
    const second = progressSpamset(first.next, 'easy', 'pushup', bells);
    expect(second.change).toBe('reps-up');
    expect(second.next.reps).toBe(11);
  });

  it('adds 5 s to holds', () => {
    const r = progressSpamset(at(0, 30, { easyStreak: 1 }), 'easy', 'plank', bells);
    expect(r.next.reps).toBe(35);
    expect(r.reason).toContain('35 s');
  });

  it('moves a kettlebell exercise up a bell at the top of the range', () => {
    const r = progressSpamset(at(16, 20, { easyStreak: 1 }), 'easy', 'kb-swing', bells);
    expect(r.change).toBe('load-up');
    expect(r.next).toMatchObject({ load: 20, reps: 8 });
  });

  it('suggests the harder variant when bodyweight tops out', () => {
    const r = progressSpamset(at(0, spamRange('pushup')[1], { easyStreak: 1 }), 'easy', 'pushup', bells);
    expect(r.change).toBe('maxed');
    expect(r.suggest).toBe('close-pushup');
  });

  it('steps back after two hard ratings, then to a lighter bell at the bottom', () => {
    const first = progressSpamset(at(0, 10), 'hard', 'pushup', bells);
    expect(first.change).toBe('hold');
    expect(progressSpamset(first.next, 'hard', 'pushup', bells).next.reps).toBe(9);
    const bottom = progressSpamset(at(16, 3, { missStreak: 1 }), 'hard', 'kb-swing', bells);
    expect(bottom).toMatchObject({ change: 'load-down', next: { load: 12, reps: 8 } });
  });

  it('good resets the streaks and keeps the target', () => {
    const r = progressSpamset(at(0, 10, { easyStreak: 1, missStreak: 1 }), 'good', 'pushup', bells);
    expect(r.next).toMatchObject({ reps: 10, easyStreak: 0, missStreak: 0 });
  });

  it('never changes a stretch', () => {
    const prev = at(0, 30, { easyStreak: 1 });
    expect(progressSpamset(prev, 'easy', 'cat-cow', bells).next).toBe(prev);
  });
});
