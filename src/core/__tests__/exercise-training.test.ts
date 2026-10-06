import { EXERCISES } from '../exercises';
import { EXERCISE_TRAINING, getExerciseTraining, KETTLEBELL_TRAINING } from '../exercise-training';

describe('exercise training profiles', () => {
  it('covers exactly the full exercise catalog, including every equipment type and stretch', () => {
    expect(Object.keys(EXERCISE_TRAINING).sort()).toEqual(EXERCISES.map((exercise) => exercise.id).sort());
    expect(new Set(EXERCISES.map((exercise) => exercise.id)).size).toBe(EXERCISES.length);
    for (const exercise of EXERCISES) {
      expect(getExerciseTraining(exercise)).toBe(EXERCISE_TRAINING[exercise.id]);
    }
  });

  it('preserves the kettlebell profiles', () => {
    const kettlebells = EXERCISES.filter((exercise) => exercise.equipment === 'kettlebell');
    expect(Object.keys(KETTLEBELL_TRAINING).sort()).toEqual(kettlebells.map((exercise) => exercise.id).sort());
    for (const exercise of kettlebells) {
      expect(getExerciseTraining(exercise)).toBe(KETTLEBELL_TRAINING[exercise.id]);
    }
  });

  it('rejects unknown, inherited and mismatched exercise IDs', () => {
    for (const exercise of EXERCISES) {
      for (const equipment of new Set(EXERCISES.map((item) => item.equipment))) {
        if (equipment !== exercise.equipment) {
          expect(getExerciseTraining({ id: exercise.id, equipment })).toBeUndefined();
        }
      }
    }
    expect(getExerciseTraining({ id: 'kb-unknown', equipment: 'kettlebell' })).toBeUndefined();
    expect(getExerciseTraining({ id: 'toString', equipment: 'kettlebell' })).toBeUndefined();
    expect(getExerciseTraining({ id: '__proto__', equipment: 'kettlebell' })).toBeUndefined();
    expect(getExerciseTraining({ id: 'kb-swing', equipment: 'none' })).toBeUndefined();
  });

  it('uses concise, complete, exercise-specific labels', () => {
    for (const profile of Object.values(EXERCISE_TRAINING)) {
      expect(profile.focus.trim()).not.toBe('');
      expect(['Good for intervals', 'Pace dependent', 'Low focus']).toContain(profile.cardio);
      expect(profile.effects).toHaveLength(2);
      expect(profile.effects.every((effect) => effect.trim().length > 0)).toBe(true);
    }
    expect(KETTLEBELL_TRAINING['kb-swing'].focus).toBe('Explosive hip power');
    expect(KETTLEBELL_TRAINING['kb-getup'].effects).toEqual(['Shoulder stability', 'Coordination']);
    expect(KETTLEBELL_TRAINING['kb-curl'].cardio).toBe('Low focus');
    expect(EXERCISE_TRAINING['wall-pushup'].focus).not.toBe(EXERCISE_TRAINING['pushup'].focus);
    expect(EXERCISE_TRAINING['chin-ups'].effects).not.toEqual(EXERCISE_TRAINING['pull-ups'].effects);
    expect(EXERCISE_TRAINING['calf-raise'].effects).toContain('Ankle extension');
  });

  it('describes stretches as movement practice, separately from strength work', () => {
    for (const exercise of EXERCISES) {
      const profile = EXERCISE_TRAINING[exercise.id];
      if (exercise.kind === 'stretch') {
        expect(profile.effectsLabel).toBe('Practices');
        expect(profile.cardio).toBe('Low focus');
        expect(profile.effects.join(' ')).not.toMatch(/strength|hypertrophy|power/i);
      } else {
        expect(profile.effectsLabel).toBeUndefined();
      }
    }
  });
});
