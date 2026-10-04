/**
 * Local-first app state. Everything lives on the device (SQLite-backed
 * localStorage on iOS/Android, browser localStorage on web) and works fully
 * offline. When signed in, lib/sync.ts mirrors it to Supabase.
 */
import 'expo-sqlite/localStorage/install';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isLoaded, getExercise, type Equipment } from '@/core/exercises';
import { initialPrescription, targetReps, type Effort, type Prescription } from '@/core/progression';
import { applyProgression, type SessionLog, type SetEntry } from '@/core/session';
import type { LoadPlan } from '@/core/timeline';
import type { Workout } from '@/core/workouts';

export type AuthMode = 'offline' | 'account';
export type Units = 'kg' | 'lb';

export type Settings = {
  units: Units;
  /** Kettlebells you own, in kg. Progression only moves between these. */
  bells: number[];
  /** Equipment you own; the library and workouts hide what needs anything else. Read with ownedEquipment(). */
  equipment?: Equipment[];
  haptics: boolean;
};

type State = {
  authMode?: AuthMode;
  settings: Settings;
  prescriptions: Record<string, Prescription>;
  sessions: SessionLog[];
  customWorkouts: Workout[];
  /** Session ids already uploaded, and when app state last changed / synced. */
  syncedSessionIds: string[];
  stateUpdatedAt: string;
  lastSyncedAt?: string;
  /** Your animation ratings from the review page, keyed by exercise id. */
  animationReviews: Record<string, AnimationRating>;
};

export type AnimationRating = { score: number; note: string; revision: string; updatedAt: string };

type Actions = {
  setAuthMode: (mode: AuthMode | undefined) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setPrescriptionLoad: (exercise: string, load: number) => void;
  loadPlan: () => LoadPlan;
  saveSession: (input: {
    workout: Workout;
    startedAt: string;
    entries: SetEntry[];
    amrapRounds: Record<number, number>;
    effort: Record<string, Effort>;
  }) => SessionLog;
  deleteSession: (id: string) => void;
  saveCustomWorkout: (workout: Workout) => void;
  deleteCustomWorkout: (id: string) => void;
  mergeRemote: (remote: { sessions: SessionLog[]; state?: RemoteState }) => void;
  markSynced: (ids: string[]) => void;
  rateAnimation: (exercise: string, rating: Omit<AnimationRating, 'updatedAt'>) => void;
};

export type RemoteState = Pick<State, 'settings' | 'prescriptions' | 'customWorkouts' | 'stateUpdatedAt'>;

export const DEFAULT_SETTINGS: Settings = { units: 'kg', bells: [8, 12, 16, 20, 24], equipment: ['kettlebell'], haptics: true };

/** Settings saved before equipment existed (or synced from such a device) owned kettlebells only. */
export function ownedEquipment(settings: Settings): Equipment[] {
  return settings.equipment ?? ['kettlebell'];
}

const STORAGE_KEY = 'spamset';
// The app was called Kettlebell Swing: move data saved under the old key on first launch.
const LEGACY_STORAGE_KEY = 'kettlebell-swing';
try {
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy !== null && localStorage.getItem(STORAGE_KEY) === null) localStorage.setItem(STORAGE_KEY, legacy);
  if (legacy !== null) localStorage.removeItem(LEGACY_STORAGE_KEY);
} catch {
  // Storage unavailable: start fresh under the new key.
}

const now = () => new Date().toISOString();
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const useApp = create<State & Actions>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      prescriptions: {},
      sessions: [],
      customWorkouts: [],
      syncedSessionIds: [],
      stateUpdatedAt: now(),
      animationReviews: {},

      setAuthMode: (authMode) => set({ authMode }),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch }, stateUpdatedAt: now() })),

      setPrescriptionLoad: (exercise, load) =>
        set((s) => {
          const prev = s.prescriptions[exercise] ?? initialPrescription(exercise, s.settings.bells);
          return {
            prescriptions: { ...s.prescriptions, [exercise]: { ...prev, load, missStreak: 0, easyStreak: 0 } },
            stateUpdatedAt: now(),
          };
        }),

      loadPlan: () => {
        const { prescriptions, settings } = get();
        return {
          load: (exercise) => (prescriptions[exercise] ?? initialPrescription(exercise, settings.bells)).load,
          reps: (exercise, range) =>
            targetReps(prescriptions[exercise] ?? initialPrescription(exercise, settings.bells, range[0]), range),
        };
      },

      saveSession: ({ workout, startedAt, entries, amrapRounds, effort }) => {
        const { prescriptions, settings } = get();
        const result = applyProgression(workout, entries, effort, prescriptions, settings.bells);
        const log: SessionLog = {
          id: newId(),
          workoutId: workout.id,
          workoutName: workout.name,
          startedAt,
          finishedAt: now(),
          entries,
          amrapRounds,
          effort,
          progress: result.progress,
        };
        set((s) => ({ sessions: [log, ...s.sessions], prescriptions: result.prescriptions, stateUpdatedAt: now() }));
        return log;
      },

      deleteSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id), stateUpdatedAt: now() })),

      saveCustomWorkout: (workout) =>
        set((s) => {
          const exists = s.customWorkouts.some((w) => w.id === workout.id);
          return {
            customWorkouts: exists
              ? s.customWorkouts.map((w) => (w.id === workout.id ? workout : w))
              : [...s.customWorkouts, workout],
            stateUpdatedAt: now(),
          };
        }),

      deleteCustomWorkout: (id) =>
        set((s) => ({ customWorkouts: s.customWorkouts.filter((w) => w.id !== id), stateUpdatedAt: now() })),

      mergeRemote: ({ sessions, state }) =>
        set((s) => {
          const known = new Set(s.sessions.map((x) => x.id));
          const merged = [...s.sessions, ...sessions.filter((x) => !known.has(x.id))].sort((a, b) =>
            b.startedAt.localeCompare(a.startedAt),
          );
          const remoteNewer = state && state.stateUpdatedAt > s.stateUpdatedAt;
          return {
            sessions: merged,
            syncedSessionIds: [...new Set([...s.syncedSessionIds, ...sessions.map((x) => x.id)])],
            ...(remoteNewer ? state : {}),
            lastSyncedAt: now(),
          };
        }),

      rateAnimation: (exercise, rating) =>
        set((s) => ({ animationReviews: { ...s.animationReviews, [exercise]: { ...rating, updatedAt: now() } } })),

      markSynced: (ids) => set((s) => ({ syncedSessionIds: [...new Set([...s.syncedSessionIds, ...ids])], lastSyncedAt: now() })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function formatLoad(kg: number, units: Units): string {
  if (!kg) return 'Bodyweight';
  return units === 'kg' ? `${kg} kg` : `${Math.round(kg * 2.20462)} lb`;
}

/** Load for an exercise line: the bell for kettlebell work, nothing for bodyweight and stretches. */
export function loadLabel(exerciseId: string, kg: number, units: Units): string {
  return isLoaded(getExercise(exerciseId)) ? formatLoad(kg, units) : '';
}

/** Join the non-empty parts of a detail line with middle dots. */
export function joinDetail(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' · ');
}
