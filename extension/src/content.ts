/**
 * Runs on the Spamset web app. Announces the extension to the page and forwards the
 * schedule the page posts (see src/lib/spamset-notify.web.ts) to the service worker.
 */
const APP = 'spamset-app';
const EXTENSION = 'spamset-extension';

const announce = () => window.postMessage({ source: EXTENSION, type: 'ready' }, window.location.origin);

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== APP) return;
  if (event.data.type === 'ping') announce();
  if (event.data.type === 'config') chrome.runtime.sendMessage({ type: 'config', config: event.data.config });
});

announce();
