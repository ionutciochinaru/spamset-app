/**
 * Spamset extension service worker: fires spam set notifications with the web app closed.
 * The web app sends its schedule and candidate exercises through the content script; this
 * worker plans with the same core code as the app and keeps one chrome.alarms alarm armed
 * for the next slot.
 */
import { planFrom, slotMessage, type ExtensionConfig } from '../../src/core/spamset';

const ALARM = 'spamset';
/** An alarm this late (Chrome was closed or asleep) is skipped rather than fired. */
const MAX_LATE_MS = 5 * 60 * 1000;

type Stored = { config?: ExtensionConfig; next?: { at: number; exercise: string } };

async function stored(): Promise<Stored> {
  return (await chrome.storage.local.get(['config', 'next'])) as Stored;
}

async function arm() {
  const { config } = await stored();
  await chrome.alarms.clear(ALARM);
  const slot = config ? planFrom(config.schedule, Object.keys(config.exercises), new Date(), 1)[0] : undefined;
  if (!slot) {
    await chrome.storage.local.remove('next');
    return;
  }
  await chrome.storage.local.set({ next: { at: slot.at.getTime(), exercise: slot.exercise } });
  await chrome.alarms.create(ALARM, { when: slot.at.getTime() });
}

async function fire() {
  const { config, next } = await stored();
  if (config && next && Date.now() - next.at < MAX_LATE_MS) {
    const exercise = config.exercises[next.exercise];
    if (exercise) {
      const { title, body } = slotMessage(exercise.name, exercise.target);
      chrome.notifications.create(`spamset:${next.exercise}:${next.at}`, {
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title,
        message: body,
        priority: 2,
      });
    }
  }
  await arm();
}

/** Open the mini session, reusing an open Spamset tab when there is one. */
async function open(exercise: string) {
  const { config } = await stored();
  if (!config) return;
  const url = `${config.appUrl}/spamset?exercise=${encodeURIComponent(exercise)}`;
  // Match patterns can't carry a port, so match the host and check the origin.
  const host = new URL(config.appUrl);
  const tabs = await chrome.tabs.query({ url: `${host.protocol}//${host.hostname}/*` });
  const tab = tabs.find((t) => t.url && new URL(t.url).origin === host.origin);
  if (tab?.id !== undefined) {
    await chrome.tabs.update(tab.id, { url, active: true });
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

chrome.runtime.onMessage.addListener((message: { type?: string; config?: ExtensionConfig }, sender) => {
  if (message.type !== 'config' || !message.config || sender.id !== chrome.runtime.id) return;
  chrome.storage.local.set({ config: message.config }).then(arm);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) fire();
});

chrome.notifications.onClicked.addListener((id) => {
  const [kind, exercise] = id.split(':');
  if (kind === 'spamset' && exercise) open(exercise);
  chrome.notifications.clear(id);
});

chrome.runtime.onStartup.addListener(arm);
chrome.runtime.onInstalled.addListener(arm);
