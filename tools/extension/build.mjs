/**
 * Build the Spamset Chrome extension into extension/dist (load it unpacked from there).
 *
 *   npm run extension
 *   SPAMSET_WEB_ORIGINS=https://app.example.com npm run extension
 *
 * SPAMSET_WEB_ORIGINS lists the web app origins (comma-separated) the extension connects
 * to, besides the local dev server.
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ext = join(root, 'extension');
const out = join(ext, 'dist');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

const origins = ['http://localhost:8081', ...(process.env.SPAMSET_WEB_ORIGINS ?? '').split(',').filter(Boolean)];
// Match patterns ignore ports: http://localhost/* covers the dev server.
const matches = [...new Set(origins.map((o) => `${new URL(o).protocol}//${new URL(o).hostname}/*`))];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(ext, 'static'), out, { recursive: true });

await build({
  entryPoints: ['background', 'content', 'popup'].map((n) => join(ext, 'src', `${n}.ts`)),
  outdir: out,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  logLevel: 'warning',
});

const manifest = {
  manifest_version: 3,
  name: 'Spamset',
  description: 'Spam set notifications from the Spamset web app, even with its tab closed.',
  version,
  icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  action: { default_popup: 'popup.html', default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' } },
  background: { service_worker: 'background.js', type: 'module' },
  permissions: ['alarms', 'notifications', 'storage'],
  host_permissions: matches,
  content_scripts: [{ matches, js: ['content.js'], run_at: 'document_start' }],
};
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Built extension/dist for ${origins.join(', ')}`);
