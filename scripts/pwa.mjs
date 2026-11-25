// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Tras `expo export`: genera el service worker con la lista real de archivos, `version.json` (para el aviso de «hay una
// versión nueva») y añade .nojekyll (GitHub Pages ignoraría la carpeta _expo sin él).
//
// Importante (probado con scripts/pruebas/sustitucion-web.mjs): GitHub Pages sirve sus archivos con `max-age=600`, así que
// el navegador puede tener en su caché HTTP una portada ANTIGUA hasta 10 minutos. Por eso el service worker descarga sus
// archivos con `cache: 'reload'` (si no, guardaría la portada vieja para el modo sin conexión) y pide la portada con
// `cache: 'no-cache'` (siempre comprueba si hay una nueva).
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
  .filter((f) => f !== 'sw.js' && f !== 'version.json' && f !== '.nojekyll' && !f.endsWith('.map'))
  .sort();

const huella = createHash('sha256');
for (const f of archivos) huella.update(f).update(readFileSync(join(dist, f)));
const version = `forja-${huella.digest('hex').slice(0, 12)}`;

const sw = `const CACHE = ${JSON.stringify(version)};
const ARCHIVOS = ${JSON.stringify(['./', ...archivos.map((f) => `./${f}`)])};

self.addEventListener('install', (e) => {
  // cache: 'reload' salta la caché HTTP del navegador: así no se guarda una copia antigua de la portada.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(ARCHIVOS.map((u) => fetch(new Request(u, { cache: 'reload' })).then((r) => { if (!r.ok) throw new Error(u); return c.put(u, r); })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('forja-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // siempre de la red: es el aviso de versión nueva
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
`;

writeFileSync(join(dist, 'sw.js'), sw);
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
writeFileSync(join(dist, 'version.json'), JSON.stringify({ version: app.version, minima: app.extra?.versionMinima ?? app.version, generado: new Date().toISOString() }) + '\n');
writeFileSync(join(dist, '.nojekyll'), '');
console.log(`Service worker ${version}: ${archivos.length} archivos`);
