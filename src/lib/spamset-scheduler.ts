/**
 * Keeps spam set notifications in step with the app: re-plans when the schedule, equipment
 * or targets change and whenever the app returns to the foreground, and opens the mini
 * session when a notification is tapped.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { getExercise } from '@/core/exercises';
import { initialPrescription } from '@/core/progression';
import { planSpamsets, slotMessage, spamCandidates, spamTarget, targetText, type ExtensionConfig, type SpamSlot } from '@/core/spamset';
import { ownedEquipment, spamSchedule, useApp } from '@/store/app-store';

import { MAX_PENDING, scheduleSpamsets, shareWithExtension, useSpamsetTaps } from './spamset-notify';

/** Current target text for an exercise ("12 reps", "30 s"). */
export function useTargetText() {
  const prescriptions = useApp((s) => s.prescriptions);
  const bells = useApp((s) => s.settings.bells);
  return useCallback(
    (exercise: string) => targetText(exercise, spamTarget(exercise, prescriptions[exercise] ?? initialPrescription(exercise, bells))),
    [prescriptions, bells],
  );
}

export function openSpamset(exercise: string) {
  router.push({ pathname: '/spamset', params: { exercise } });
}

export function useSpamsetScheduler() {
  const settings = useApp((s) => s.settings);
  const schedule = spamSchedule(settings);
  const owned = useMemo(() => ownedEquipment(settings), [settings]);
  const target = useTargetText();
  const swaps = useApp((s) => s.spamSwaps);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    const message = (slot: SpamSlot) => slotMessage(getExercise(slot.exercise).name, target(slot.exercise));
    const slots = planSpamsets(schedule, owned, new Date(), MAX_PENDING, swaps);
    scheduleSpamsets(slots, message).catch((e) => console.warn('Scheduling spam sets failed', e));
    if (Platform.OS === 'web') {
      const exercises: ExtensionConfig['exercises'] = {};
      for (const id of spamCandidates(schedule, owned)) exercises[id] = { name: getExercise(id).name, target: target(id) };
      shareWithExtension({ schedule, exercises, appUrl: window.location.origin });
    }
  }, [schedule, owned, target, swaps, tick]);

  useSpamsetTaps(openSpamset, refresh);
}
