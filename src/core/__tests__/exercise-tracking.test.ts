import { clips } from '@/animation/clips';
import { EXERCISES, getExercise } from '../exercises';
import { getExerciseTracking, getTrackingLabelPlacement } from '../exercise-tracking';

describe('exercise tracking', () => {
  it('uses joints present in each exercise animation', () => {
    for (const exercise of EXERCISES) {
      const clip = clips[exercise.animation];
      const available = new Set(clip.joints);
      const tracking = getExerciseTracking(exercise);
      for (const joint of [...tracking.focusJoints, ...tracking.muscleJoints]) {
        expect(available.has(joint)).toBe(true);
      }
    }
  });

  it('varies composition by movement posture and follows the relevant anatomy', () => {
    expect(getExerciseTracking(getExercise('kb-swing')).layout).toBe('diagonal');
    expect(getExerciseTracking(getExercise('pushup')).layout).toBe('top-pair');
    expect(getExerciseTracking(getExercise('seated-knee')).layout).toBe('reverse');
    expect(getExerciseTracking(getExercise('overhead-reach')).layout).toBe('split');
    expect(getExerciseTracking(getExercise('calf-raise')).muscleJoints).toContain('ankle_l');
    expect(getExerciseTracking(getExercise('neck-flexion')).muscleJoints).toContain('neck');
  });

  it('fits measured labels between top controls and the bottom caption at phone widths', () => {
    for (const width of [320, 390]) {
      for (const layout of ['diagonal', 'reverse', 'top-pair', 'split'] as const) {
        const notes = getTrackingLabelPlacement(layout, width, 288, 180, 110, 42);
        expect(notes.training.top).toBeGreaterThanOrEqual(42);
        expect(notes.muscles.top).toBeGreaterThanOrEqual(42);
        expect(notes.training.top + 180).toBeLessThanOrEqual(228);
        expect(notes.muscles.top + 110).toBeLessThanOrEqual(228);
        expect(notes.training.side).not.toBe(notes.muscles.side);
      }
    }
  });
});
