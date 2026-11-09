// Tras `expo export`: genera el service worker con la lista real de archivos
// y añade .nojekyll (GitHub Pages ignoraría la carpeta _expo sin él).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = 'dist';
const lista = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((f) =>
    f.isDirectory() ? lista(join(dir, f.name)) : [join(dir, f.name)],
  );

const archivos = lista(dist)
  .map((f) => relative(dist, f).split(sep).join('/'))
  .filter((f) => f !== 'sw.js' && f !== '.nojekyll' && !f.endsWith('.map'))
  .sort();

const huella = createHash('sha256');
for (const f of archivos) huella.update(f).update(readFileSync(join(dist, f)));
const version = `mi-gym-${huella.digest('hex').slice(0, 12)}`;

const sw = `const CACHE = ${JSON.stringify(version)};
const ARCHIVOS = ${JSON.stringify(['./', ...archivos.map((f) => `./${f}`)])};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('mi-gym-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
`;

writeFileSync(join(dist, 'sw.js'), sw);
writeFileSync(join(dist, '.nojekyll'), '');
console.log(`Service worker ${version}: ${archivos.length} archivos`);
