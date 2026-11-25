// Prueba de la SUSTITUCIÓN de la web: la versión antigua publicada (archivada tal cual) y la compilación de producción de 2.0
// se sirven una después de otra en el MISMO origen y la misma ruta (/forja/), con el MISMO perfil de Chrome. Así se comprueba
// el mecanismo real de actualización (service worker incluido) y que los datos del navegador sobreviven.
// NO usa Supabase ni ninguna cuenta ni ninguna red externa.
//   node scripts/pruebas/sustitucion-web.mjs servir  <carpeta-web> <puerto> [segundos-de-caché] [carpeta-json]   (se queda sirviendo)
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/sustitucion-web.mjs antigua  <carpeta> <puerto> <datos-antes.json>
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/sustitucion-web.mjs nueva    <carpeta> <puerto> <datos-antes.json>
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const modo = process.argv[2];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.css': 'text/css', '.md': 'text/plain', '.map': 'application/json' };

if (modo === 'servir') {
  const raiz = process.argv[3];
  const puerto = Number(process.argv[4]);
  const segundos = process.argv[5] ?? '600'; // GitHub Pages sirve sus archivos con max-age=600
  const extra = process.argv[6]; // carpeta con .json de escenarios (opcional)
  createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    // Carpeta extra opcional (datos de escenarios .json) servida en la raíz, como hacían las pruebas e2e anteriores.
    if (extra && !url.pathname.startsWith('/forja') && /^\/[\w.-]+\.json$/.test(url.pathname) && existsSync(join(extra, url.pathname))) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(readFileSync(join(extra, url.pathname)));
    }
    if (!url.pathname.startsWith('/forja')) { res.writeHead(302, { Location: '/forja/' }); return res.end(); }
    let ruta = decodeURIComponent(url.pathname.slice('/forja'.length)) || '/';
    if (ruta.endsWith('/')) ruta += 'index.html';
    const f = normalize(join(raiz, ruta));
    if (!f.startsWith(normalize(raiz)) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream', 'Cache-Control': segundos === '0' ? 'no-cache' : `max-age=${segundos}` });
    res.end(readFileSync(f));
  }).listen(puerto, () => console.log(`sirviendo ${raiz} en http://localhost:${puerto}/forja/`));
} else {
  const salida = process.argv[3];
  const PUERTO = process.argv[4];
  const antes = JSON.parse(readFileSync(process.argv[5], 'utf8'));
  const WEB = `http://localhost:${PUERTO}/forja/`;
  mkdirSync(salida, { recursive: true });
  const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  let ok = 0, fallos = 0;
  const prueba = (nombre, cond, detalle = '') => {
    if (cond) { ok++; console.log('  ✓', nombre); } else { fallos++; console.log('  ✗', nombre, detalle === '' ? '' : `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle).slice(0, 500)}`); }
  };
  const p = modo === 'antigua' ? 9810 : 9820;
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${p}`, `--user-data-dir=${salida}/perfil-usuario`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let objetivo;
  for (let i = 0; i < 60 && !objetivo; i++) { try { objetivo = (await (await fetch(`http://127.0.0.1:${p}/json`)).json()).find((t) => t.type === 'page'); } catch { /* arrancando */ } if (!objetivo) await espera(250); }
  const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const pend = new Map(); const errores = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text); };
  const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 400, height: 900, deviceScaleFactor: 1, mobile: true });
  const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const texto = () => js('document.body.innerText');
  const esperar = async (patron, max = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { if (patron.test(await texto())) return true; await espera(500); } return false; };
  const caches = () => js(`caches.keys().then(k=>k.filter(x=>x.startsWith('forja-')))`);
  const cerrar = async () => { await new Promise((r) => { chrome.once('exit', r); cmd('Browser.close'); setTimeout(r, 6000); }); try { ws.close(); } catch { /* ya */ } chrome.kill(); };

  try {
    if (modo === 'antigua') {
      console.log('WEB ANTIGUA publicada (archivada) en /forja/');
      await cmd('Page.navigate', { url: WEB });
      prueba('la web antigua arranca', await esperar(/Crea tu plan/, 90000));
      await js(`navigator.serviceWorker.ready.then(()=>true)`);
      await espera(1500);
      prueba('registra su service worker y su caché es la antigua (forja-a06e0bf16ed9)', JSON.stringify(await caches()) === '["forja-a06e0bf16ed9"]', await caches());
      await js(`localStorage.setItem('mi-gym:v1', ${JSON.stringify(JSON.stringify(antes))})`);
      await cmd('Page.navigate', { url: WEB });
      prueba('con tus datos, la antigua te enseña tu plan', await esperar(/Esta semana/, 60000));
      prueba('(el título de la antigua es «Forja», sin BETA)', (await js('document.title')) === 'Forja', await js('document.title'));
    } else {
      console.log('SUSTITUCIÓN: la misma dirección ahora sirve FORJA 2.0 (el navegador conserva el service worker antiguo)');
      const estricto = process.argv[6] === 'estricto'; // sin caché HTTP vigente: debe ser 2.0 desde la primera carga
      const esNueva = (t) => /(Chispa|Brasa|Llama|Acero) · Nivel \d+/.test(t);
      await cmd('Page.navigate', { url: WEB });
      prueba('al abrir la dirección de siempre carga la app con tu plan (no pide crear uno)', await esperar(/Tu coach/, 120000) && !/Crea tu plan/.test(await texto()));
      await espera(5000);
      const primera = esNueva(await texto());
      let recargas = 0;
      while (!esNueva(await texto()) && recargas < 3) { recargas++; await cmd('Page.navigate', { url: WEB }); await esperar(/Tu coach/, 60000); await espera(5000); }
      console.log(`  ℹ primera carga ya es 2.0: ${primera ? 'sí' : 'NO'} · recargas hasta ver 2.0: ${primera ? 0 : recargas} · ¿llegó a verse 2.0?: ${esNueva(await texto()) ? 'sí' : 'no'}`);
      prueba(estricto ? 'sin caché HTTP vigente, es FORJA 2.0 desde la primera carga' : 'con la caché HTTP de 10 min vigente (caso GitHub Pages) se acaba viendo 2.0 en unas recargas', estricto ? primera : esNueva(await texto()), (await texto()).replace(/\n/g, ' | ').slice(0, 300));
      let c = await caches();
      for (let i = 0; i < 40 && !(c.length === 1 && c[0] !== 'forja-a06e0bf16ed9'); i++) { await espera(1000); c = await caches(); } // el service worker nuevo tarda unos segundos en instalarse
      prueba('el service worker se actualiza solo y la caché antigua se borra', c.length === 1 && c[0] !== 'forja-a06e0bf16ed9', c);
      const cacheado = await js(`caches.open(${JSON.stringify(c[0])}).then(x=>x.match('./')).then(r=>r?r.text():'')`);
      prueba('el index.html guardado por el nuevo service worker NO es el antiguo (si lo fuera, sin conexión se rompería)', !cacheado.includes('index-36926e549c0683cea1d6d553233c5669.js') && cacheado.includes('_expo/static/js/web/index-'), cacheado.match(/_expo[^"]*\.js/)?.[0]);
      const d = JSON.parse((await js(`localStorage.getItem('mi-gym:v1')`)) ?? 'null');
      prueba('tus datos están exactamente igual tras el cambio de versión (entrenos, plan, perfil, comida)', isDeepStrictEqual(d.sesiones, antes.sesiones) && isDeepStrictEqual(d.rutinas, antes.rutinas) && isDeepStrictEqual(d.perfil, antes.perfil) && isDeepStrictEqual(d.comida, antes.comida), { sesiones: d?.sesiones?.length });
      const previa = JSON.parse((await js(`localStorage.getItem('mi-gym:v1:copia-pre-beta')`)) ?? 'null');
      prueba('la beta guardó una copia exacta de lo que había antes de tocar nada', isDeepStrictEqual(previa, antes));
      prueba('y da la bienvenida a la beta (una vez)', /Bienvenido a FORJA BETA/.test(await texto()) || JSON.parse((await js(`localStorage.getItem('mi-gym:beta-v1')`)) ?? '{}').conDatos === true);
      prueba('sin errores de JavaScript en todo el proceso', errores.length === 0, errores.slice(0, 2));
    }
  } catch (e) {
    fallos++;
    console.log('  ✗ interrumpida:', e.message);
  } finally {
    await cerrar();
  }
  console.log(`\n${ok} comprobaciones correctas, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
}
