/**
 * Spam set notifications on iOS and Android: local notifications scheduled on the device,
 * so they fire with the app closed. The web build uses spamset-notify.web.ts instead.
 */
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';

import type { ExtensionConfig, SpamSlot } from '@/core/spamset';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';
export type SlotMessage = { title: string; body: string };

/** iOS keeps at most 64 pending notifications per app; stay under it. */
export const MAX_PENDING = 48;
const CHANNEL = 'spamset';
const PREFIX = 'spamset-';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Spam sets',
    description: 'A short exercise at the interval you choose',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#ff6b2b',
  });
}

function toState(p: Notifications.NotificationPermissionsStatus): PermissionState {
  if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

export async function notificationPermission(): Promise<PermissionState> {
  return toState(await Notifications.getPermissionsAsync());
}

/** Android 13+ only shows the system prompt once a channel exists, so create it first. */
export async function requestNotificationPermission(): Promise<PermissionState> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) return toState(current);
  return toState(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
}

/** Where to turn notifications back on after the user said no. */
export function openNotificationSettings() {
  Linking.openSettings();
}

/**
 * Replace the pending spam set notifications with `slots`. Skips the work when the same
 * slots are already pending, since this runs every time the app comes to the foreground.
 */
export async function scheduleSpamsets(slots: SpamSlot[], message: (slot: SpamSlot) => SlotMessage): Promise<void> {
  const wanted = slots.slice(0, MAX_PENDING);
  const messages = wanted.map(message);
  // The id carries the text too, so a new target replaces the pending notification.
  const ids = wanted.map((s, i) => `${PREFIX}${s.at.getTime()}-${s.exercise}-${messages[i].body}`);
  const pending = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(PREFIX));
  const pendingIds = new Set(pending.map((n) => n.identifier));
  if (pending.length === ids.length && ids.every((id) => pendingIds.has(id))) return;

  await Promise.all(pending.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (!wanted.length || (await notificationPermission()) !== 'granted') return;
  await ensureChannel();
  for (const [i, slot] of wanted.entries()) {
    await Notifications.scheduleNotificationAsync({
      identifier: ids[i],
      content: { ...messages[i], sound: true, data: { kind: 'spamset', exercise: slot.exercise } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: slot.at, channelId: CHANNEL },
    });
  }
}

/** Show one right away (the "Send a test" button). */
export async function notifyNow(slot: SpamSlot, message: SlotMessage): Promise<void> {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { ...message, sound: true, data: { kind: 'spamset', exercise: slot.exercise } },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
}

/** Call `onOpen` with the exercise when the user taps a spam set notification, including the one that launched the app. */
export function useSpamsetTaps(onOpen: (exercise: string) => void, _fired?: () => void) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { identifier, content } = response.notification.request;
    const data = content.data as { kind?: string; exercise?: string } | undefined;
    if (handled.current === identifier || data?.kind !== 'spamset' || !data.exercise) return;
    handled.current = identifier;
    onOpen(data.exercise);
  }, [response, onOpen]);
}

/** Whether the Chrome extension delivers spam sets for this browser. Never on a phone. */
export function useExtensionInstalled(): boolean {
  return false;
}

/** Push the schedule to the Chrome extension. Web only. */
export function shareWithExtension(_config: ExtensionConfig) {}
