import { timeText, type ExtensionConfig } from '../../src/core/spamset';

type Stored = { config?: ExtensionConfig; next?: { at: number; exercise: string } };

const status = document.getElementById('status')!;
const openButton = document.getElementById('open') as HTMLButtonElement;

chrome.storage.local.get(['config', 'next']).then((value) => {
  const { config, next } = value as Stored;
  if (!config) {
    status.textContent = 'Open Spamset in this browser once to connect your schedule.';
    openButton.hidden = true;
    return;
  }
  if (!config.schedule.enabled) status.textContent = 'Spam sets are off. Turn them on in Spamset.';
  else if (!next) status.textContent = 'No spam sets coming up. Check your days, hours and exercises.';
  else {
    const at = new Date(next.at);
    const when = `${at.toLocaleDateString('en-US', { weekday: 'short' })} ${timeText(at)}`;
    const exercise = config.exercises[next.exercise];
    status.textContent = `Next: ${when} · ${exercise?.name ?? next.exercise}, ${exercise?.target ?? ''}`;
  }
  openButton.onclick = () => chrome.tabs.create({ url: `${config.appUrl}/spamset-settings` });
});
