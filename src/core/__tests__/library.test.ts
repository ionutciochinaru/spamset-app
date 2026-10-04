import { validateWorkout, retarget } from '../builder';
import { canDo, EXERCISES, exerciseCategory, getExercise } from '../exercises';
import { defaultLoad, initialPrescription, progressByEffort, progressSets, type Prescription } from '../progression';
import { applyProgression } from '../session';
import { compileWorkout, type LoadPlan } from '../timeline';
import { PRESET_WORKOUTS, getWorkout, workoutEquipment, workoutFocus, type Workout } from '../workouts';

const bells = [8, 12, 16, 20, 24];
const at = (reps: number, extra: Partial<Prescription> = {}): Prescription => ({
  load: 0,
  reps,
  missStreak: 0,
  easyStreak: 0,
  ...extra,
});
const plan: LoadPlan = { load: () => 0, reps: (_, range) => range[0] };

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

describe('preset workouts', () => {
  it('all validate and compile', () => {
    for (const w of PRESET_WORKOUTS) {
      expect({ id: w.id, errors: validateWorkout(w) }).toEqual({ id: w.id, errors: [] });
      expect(compileWorkout(w, plan).length).toBeGreaterThan(0);
    }
  });

  it('derive focus and equipment', () => {
    const get = (id: string) => getWorkout(id) as Workout;
    expect(workoutFocus(get('swing-foundations'))).toBe('kettlebell');
    expect(workoutFocus(get('bodyweight-basics'))).toBe('bodyweight');
    expect(workoutFocus(get('core-circuit'))).toBe('core');
    expect(workoutFocus(get('bells-and-bodyweight'))).toBe('mixed');
    expect(workoutFocus(get('cool-down'))).toBe('mobility');
    expect(workoutEquipment(get('bodyweight-basics'))).toEqual([]);
    expect(workoutEquipment(get('bar-pulls'))).toEqual(['pullup-bar', 'doorframe']);
  });
});

describe('unloaded progression', () => {
  it('starts holds at 20 seconds', () => {
    expect(initialPrescription('plank', bells).reps).toBe(20);
    expect(initialPrescription('pushup', bells).reps).toBe(8);
  });

  it('starts bodyweight work with no load', () => {
    expect(defaultLoad('pushup', bells)).toBe(0);
    expect(defaultLoad('kb-swing', bells)).toBeGreaterThan(0);
  });

  it('suggests the harder variant once every set tops the range', () => {
    const r = progressSets(at(15), [8, 15], [15, 15, 15], 'good', bells, 'pushup');
    expect(r.change).toBe('maxed');
    expect(r.suggest).toBe('close-pushup');
    expect(r.next.load).toBe(0);
  });

  it('never moves a bodyweight exercise onto a bell', () => {
    const r = progressSets(at(8, { missStreak: 1 }), [8, 15], [5, 5], 'hard', bells, 'pushup');
    expect(r.change).toBe('hold');
    expect(r.next.load).toBe(0);
  });

  it('holds climb in 5-second steps', () => {
    const r = progressSets(at(30), [30, 60], [30, 30], 'good', bells, 'plank');
    expect(r.next.reps).toBe(35);
    expect(r.reason).toContain('35 s');
  });

  it('suggests the harder variant after two easy circuit sessions', () => {
    const first = progressByEffort(at(10), 'easy', bells, 'wall-pushup');
    expect(first.suggest).toBeUndefined();
    expect(progressByEffort(first.next, 'easy', bells, 'wall-pushup').suggest).toBe('pushup');
  });

  it('skips stretches entirely', () => {
    const workout = getWorkout('cool-down') as Workout;
    const entries = [{ exercise: 'cat-cow', blockKind: 'intervals' as const, block: 0, load: 0, target: { seconds: 40 }, done: 40 }];
    const result = applyProgression(workout, entries, { 'cat-cow': 'easy' }, {}, bells);
    expect(result.progress).toEqual({});
  });
});

describe('timed exercises', () => {
  it('strength sets of a hold count seconds', () => {
    const workout: Workout = { id: 'x', name: 'x', summary: '', blocks: [{ kind: 'sets', exercise: 'plank', sets: 2, repRange: [30, 60], rest: 30 }] };
    const work = compileWorkout(workout, plan).filter((s) => s.kind === 'work');
    expect(work.map((s) => s.kind === 'work' && s.target)).toEqual([{ seconds: 30 }, { seconds: 30 }]);
  });

  it('switching a station between reps and seconds resets its target', () => {
    expect(retarget({ exercise: 'pushup', target: { reps: 12 } }, 'plank').target).toEqual({ seconds: 30 });
    expect(retarget({ exercise: 'pushup', target: { reps: 12 } }, 'squat').target).toEqual({ reps: 12 });
  });

  it('ladders reject timed exercises', () => {
    const workout: Workout = { id: 'x', name: 'x', summary: '', blocks: [{ kind: 'ladder', exercise: 'plank', from: 2, to: 6, step: 2, rest: 30 }] };
    expect(validateWorkout(workout).join()).toContain('counted in reps');
  });
});
