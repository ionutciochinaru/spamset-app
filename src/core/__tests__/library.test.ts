import { canDo, EXERCISES, exerciseCategory, getExercise } from '../exercises';

describe('exercise library', () => {
  it('has unique ids and valid harder variants', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EXERCISES) if (e.harder) expect(() => getExercise(e.harder!)).not.toThrow();
  });

  it('every exercise has a 3D clip', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clips } = require('@/animation/clips');
    expect(EXERCISES.filter((e) => !clips[e.animation]).map((e) => e.id)).toEqual([]);
  });

  it('groups exercises and filters by owned equipment', () => {
    expect(exerciseCategory(getExercise('kb-swing'))).toBe('kettlebell');
    expect(exerciseCategory(getExercise('plank'))).toBe('core');
    expect(exerciseCategory(getExercise('pushup'))).toBe('bodyweight');
    expect(exerciseCategory(getExercise('chin-ups'))).toBe('gear');
    expect(exerciseCategory(getExercise('cat-cow'))).toBe('stretch');
    expect(canDo(getExercise('pushup'), [])).toBe(true);
    expect(canDo(getExercise('chin-ups'), ['kettlebell'])).toBe(false);
    expect(canDo(getExercise('chin-ups'), ['pullup-bar'])).toBe(true);
  });
});
