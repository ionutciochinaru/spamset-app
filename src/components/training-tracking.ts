import { createContext } from 'react';

export type TrackedPoint = { x: number; y: number };
export type TrackingFrame = Readonly<Record<string, TrackedPoint>>;

/** A tiny external store keeps animation frames out of the home screen's React tree. */
export function createTrainingTracking() {
  let frame: TrackingFrame = {};
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => frame,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish(next: TrackingFrame) {
      const names = Object.keys(next);
      if (names.length === Object.keys(frame).length && names.every((name) => {
        const previous = frame[name];
        return previous && Math.abs(previous.x - next[name].x) < 0.0005 && Math.abs(previous.y - next[name].y) < 0.0005;
      })) return;
      frame = next;
      listeners.forEach((listener) => listener());
    },
  };
}

export type TrainingTracking = ReturnType<typeof createTrainingTracking>;
export const TrainingTrackingContext = createContext<TrainingTracking | null>(null);
