/**
 * Spam set notifications on web. A page cannot schedule notifications for later, so:
 * - with the Spamset Chrome extension installed, the page hands it the schedule
 *   (shareWithExtension) and the extension fires them even with the tab closed;
 * - otherwise this page fires them with a timer while it stays open.
 */
import { useEffect, useState } from 'react';

import type { ExtensionConfig, SpamSlot } from '@/core/spamset';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';
export type SlotMessage = { title: string; body: string };

export const MAX_PENDING = 1;

const APP = 'spamset-app';
const EXTENSION = 'spamset-extension';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

function toState(p: NotificationPermission): PermissionState {
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'undetermined';
}

export async function notificationPermission(): Promise<PermissionState> {
  return supported() ? toState(Notification.permission) : 'unsupported';
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission !== 'default') return toState(Notification.permission);
  return toState(await Notification.requestPermission());
}

/** Browsers have no API to open site settings; the screen explains how instead. */
export function openNotificationSettings() {}

// ---- Chrome extension handshake -------------------------------------------------------

let extensionPresent = false;
let lastConfig: ExtensionConfig | undefined;
const listeners = new Set<(present: boolean) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== EXTENSION || event.data.type !== 'ready') return;
    if (extensionPresent) return;
    extensionPresent = true;
    // The content script may load after the page first shared its schedule.
    if (lastConfig) shareWithExtension(lastConfig);
    listeners.forEach((l) => l(true));
    stopTimer();
  });
  window.postMessage({ source: APP, type: 'ping' }, window.location.origin);
}

export function useExtensionInstalled(): boolean {
  const [present, setPresent] = useState(extensionPresent);
  useEffect(() => {
    listeners.add(setPresent);
    return () => {
      listeners.delete(setPresent);
    };
  }, []);
  return present;
}

/** Push the schedule to the extension, if one is listening. */
export function shareWithExtension(config: ExtensionConfig) {
  lastConfig = config;
  window.postMessage({ source: APP, type: 'config', config }, window.location.origin);
}

// ---- In-page timer --------------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | undefined;
let lastFired = 0;
let onTap: ((exercise: string) => void) | undefined;
let onFired: (() => void) | undefined;

function stopTimer() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}

function show(slot: SpamSlot, message: SlotMessage) {
  if (Notification.permission !== 'granted') return;
  const n = new Notification(message.title, { body: message.body, icon: '/favicon.png', tag: 'spamset' });
  n.onclick = () => {
    window.focus();
    onTap?.(slot.exercise);
    n.close();
  };
}

/** Arm a timer for the next slot. The extension takes over when present. */
export async function scheduleSpamsets(slots: SpamSlot[], message: (slot: SpamSlot) => SlotMessage): Promise<void> {
  stopTimer();
  const next = slots.find((s) => s.at.getTime() > lastFired);
  if (!next || extensionPresent || !supported()) return;
  // Long timeouts overflow past ~24.8 days; re-plan daily instead.
  const delay = Math.min(next.at.getTime() - Date.now(), 24 * 3600 * 1000);
  timer = setTimeout(() => {
    timer = undefined;
    if (Date.now() >= next.at.getTime() - 1000) {
      lastFired = next.at.getTime();
      show(next, message(next));
    }
    onFired?.();
  }, Math.max(0, delay));
}

export async function notifyNow(slot: SpamSlot, message: SlotMessage): Promise<void> {
  if (supported()) show(slot, message);
}

/** Taps on in-page notifications. `onFired` lets the scheduler arm the following slot. */
export function useSpamsetTaps(onOpen: (exercise: string) => void, fired?: () => void) {
  useEffect(() => {
    onTap = onOpen;
    onFired = fired;
    return () => {
      onTap = undefined;
      onFired = undefined;
    };
  }, [onOpen, fired]);
}
