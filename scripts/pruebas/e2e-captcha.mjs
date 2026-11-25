// Prueba LOCAL de extremo a extremo de Cloudflare Turnstile en la interfaz (el captcha NO está activado en Supabase: el servidor
// simulado solo rechaza el token «token-malo» para poder probar el error). La app web real (compilada con una site key de PRUEBA de
// Cloudflare) en Chrome contra el Supabase SIMULADO. Se prueba con un Turnstile simulado (casos de error deterministas) y con el
// script REAL de Cloudflare y su clave de prueba (si hay red). NO usa Supabase real ni cuentas reales.
// Requisitos: 1) servidor simulado en :54321  2) web compilada con EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321,
// EXPO_PUBLIC_SUPABASE_ANON_KEY=<cualquiera> y EXPO_PUBLIC_CAPTCHA_SITEKEY=1x00000000000000000000AA, servida en :5192
// (`sustitucion-web.mjs servir <dist-captcha> 5192`).
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/e2e-captcha.mjs <carpeta-temporal>
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const API = 'http://127.0.0.1:54321';
const WEB = 'http://127.0.0.1:5192/forja/';
const salida = process.argv[2] ?? '.';
mkdirSync(salida, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fallos = 0, saltadas = 0;
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  ✓', nombre); } else { fallos++; console.log('  ✗', nombre, detalle === '' ? '' : `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle).slice(0, 700)}`); }
};
async function sql(q, p = []) {
  const r = await fetch(API + '/__prueba/sql', { method: 'POST', headers: { 'content-type': 'application/json', 'x-prueba': 'si' }, body: JSON.stringify({ sql: q, params: p }) });
  return r.json();
}

// Se instala ANTES de que cargue la página: espía las peticiones de autenticación y, si se pide, sustituye Turnstile por uno simulado.
const GUION = `(() => {
  const modo = localStorage.getItem('__turnstile');
  window.__auth = [];
  const f = window.fetch;
  window.fetch = async (u, o) => {
    try { if (String(u).includes('/auth/v1/')) { const b = o && o.body ? JSON.parse(o.body) : {}; window.__auth.push({ ruta: new URL(String(u)).pathname, captcha: (b.gotrue_meta_security && b.gotrue_meta_security.captcha_token) || null }); } } catch (e) {}
    return f(u, o);
  };
  if (modo === 'mock' || modo === 'mock-malo') {
    let n = 0, opciones = null;
    window.__resets = 0; window.__removidos = 0; window.__renders = 0;
    window.turnstile = {
      render(el, o) { opciones = o; window.__renders++; el.innerHTML = '<button type="button" id="mock-resolver" aria-label="Resolver captcha">Resolver captcha</button>'; el.querySelector('button').onclick = () => o.callback(modo === 'mock-malo' ? 'token-malo' : 'token-bueno-' + (++n)); return 'w' + window.__renders; },
      reset() { window.__resets++; },
      remove() { window.__removidos++; },
      __expirar() { opciones['expired-callback'](); },
      __error() { opciones['error-callback'](); },
    };
  }
})();`;

let siguiente = 9650;
async function dispositivo(nombre, modoTurnstile) {
  const puerto = siguiente++;
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${salida}/perfil-${nombre}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let objetivo;
  for (let i = 0; i < 60 && !objetivo; i++) { try { objetivo = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); } catch { /* arrancando */ } if (!objetivo) await espera(250); }
  const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const pend = new Map(); const errores = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  };
  const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 400, height: 900, deviceScaleFactor: 1, mobile: true });
  await cmd('Page.addScriptToEvaluateOnNewDocument', { source: GUION });
  const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const d = {
    nombre, errores, js, cmd,
    ir: async (ms = 3000) => { await cmd('Page.navigate', { url: WEB }); await espera(ms); },
    texto: () => js('document.body.innerText'),
    preparar: async () => { // primera carga en el origen para fijar el modo de Turnstile y la bienvenida ya vista
      await cmd('Page.navigate', { url: WEB }); await espera(2500);
      await js(`localStorage.setItem('__turnstile', ${JSON.stringify(modoTurnstile ?? '')}); localStorage.setItem('mi-gym:beta-v1', JSON.stringify({ v: 1, conDatos: false, visto: true }));`);
      await cmd('Page.navigate', { url: WEB }); await espera(3000);
    },
    visible: (t) => js(`[...document.querySelectorAll('div,span')].some(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)}&&e.getBoundingClientRect().height>0)`),
    deshabilitado: (etiqueta) => js(`(() => { const l = [...document.querySelectorAll('[aria-label]')].filter(e => e.getAttribute('aria-label') === ${JSON.stringify(etiqueta)}); const e = l.at(-1); return e ? e.getAttribute('aria-disabled') === 'true' : null; })()`),
    clic: async (t, i = 0, aria = false) => {
      const sel = aria ? `[...document.querySelectorAll('[aria-label]')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(t)})` : `[...document.querySelectorAll('div,span,a')].filter(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)})`;
      const c = await js(`(()=>{const l=${sel};const e=l.at(${i});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!c) throw new Error(`no encuentro «${t}» en ${nombre}`);
      for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
      await espera(900);
    },
    rellenar: async (etiqueta, valor) => {
      await js(`(()=>{const e=document.querySelector('[aria-label=${JSON.stringify(etiqueta)}]');e.scrollIntoView({block:'center'});e.focus();e.select&&e.select()})()`);
      await cmd('Input.insertText', { text: valor });
      await espera(200);
    },
    registro: () => js('window.__auth'),
    cerrar: () => { try { ws.close(); } catch { /* ya cerrado */ } chrome.kill(); },
  };
  return d;
}

const CLAVE = 'secreto-de-prueba-1';
const esperarHasta = async (f, max = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { if (await f()) return true; await espera(500); } return false; };
const marcarRegistro = async (d, email) => {
  await d.rellenar('Email', email);
  await d.rellenar('Contraseña', CLAVE);
  await d.clic('Tengo 16 años o más y acepto los términos de uso y la política de privacidad', 0, true);
  await d.clic('Consiento que se guarden mis datos en la nube', 0, true);
};

const A = await dispositivo('A', 'mock');
const B = await dispositivo('B', 'mock');
const C = await dispositivo('C', 'mock-malo');
const R = await dispositivo('R', ''); // Turnstile REAL de Cloudflare (con la clave de prueba)
try {
  // ============ A: crear cuenta con el widget ============
  console.log('A · crear cuenta: no se puede sin la comprobación y el token viaja a Supabase');
  await A.preparar();
  prueba('con site key configurada, la pantalla de entrada muestra el widget y pide completarlo', await esperarHasta(async () => (await A.js(`!!document.getElementById('mock-resolver')`))) && /Completa la comprobación anti-robots para continuar/.test(await A.texto()));
  prueba('«Entrar» está desactivado hasta tener el token', (await A.deshabilitado('Entrar')) === true);
  await A.clic('Crear cuenta', 0);
  await marcarRegistro(A, 'ana@prueba.local');
  prueba('con las dos casillas marcadas, «Crear cuenta» sigue desactivado sin token', (await A.deshabilitado('Crear cuenta')) === true);
  await A.clic('Crear cuenta', -1);
  await espera(1200);
  prueba('pulsarlo sin token no envía NADA al servidor', (await A.registro()).length === 0, await A.registro());
  await A.clic('Resolver captcha', 0, true);
  prueba('al resolver el widget el botón se activa y desaparece el aviso', (await A.deshabilitado('Crear cuenta')) === false && !/Completa la comprobación anti-robots/.test(await A.texto()));
  await A.clic('Crear cuenta', -1);
  await espera(5500);
  const regA = await A.registro();
  const alta = regA.find((x) => x.ruta === '/auth/v1/signup');
  prueba('la petición de alta lleva el token del captcha (gotrue_meta_security.captcha_token)', !!alta && /^token-bueno-/.test(alta.captcha ?? ''), regA);
  prueba('la cuenta se crea (el servidor simulado no valida el captcha: aquí solo se prueba el lado de la app)', (await sql(`select count(*)::int n from auth.users where email = 'ana@prueba.local'`))[0].n === 1);
  prueba('el token se destruye al salir de la pantalla de cuenta (el widget se elimina)', (await A.js('window.__removidos')) >= 1);

  // ============ B: entrar ============
  console.log('B · entrar: token en el inicio de sesión; error de contraseña = token nuevo');
  await B.preparar();
  await esperarHasta(async () => await B.js(`!!document.getElementById('mock-resolver')`));
  await B.rellenar('Email', 'ana@prueba.local');
  await B.rellenar('Contraseña', 'contraseña-equivocada');
  await B.clic('Resolver captcha', 0, true);
  await B.clic('Entrar', -1);
  await espera(2000);
  prueba('con contraseña equivocada: mensaje claro, y se pide un token NUEVO (el anterior era de un solo uso)', /Email o contraseña incorrectos/.test(await B.texto()) && (await B.deshabilitado('Entrar')) === true && (await B.js('window.__resets')) >= 1, { resets: await B.js('window.__resets') });
  await B.rellenar('Contraseña', CLAVE);
  await B.clic('Resolver captcha', 0, true);
  await B.clic('Entrar', -1);
  await espera(5000);
  const entradas = (await B.registro()).filter((x) => x.ruta === '/auth/v1/token');
  prueba('cada intento de entrada lleva su propio token, distinto del anterior', entradas.length === 2 && entradas.every((x) => /^token-bueno-/.test(x.captcha ?? '')) && entradas[0].captcha !== entradas[1].captcha, entradas);
  prueba('con la contraseña buena se entra y se llega a la app', !/Entra en tu cuenta/.test(await B.texto()) && /Tu coach|Crea tu plan/.test(await B.texto()));

  // ============ C: el servidor rechaza el token ============
  console.log('C · el servidor rechaza el captcha: error claro y nueva comprobación');
  await C.preparar();
  await esperarHasta(async () => await C.js(`!!document.getElementById('mock-resolver')`));
  await C.rellenar('Email', 'ana@prueba.local');
  await C.rellenar('Contraseña', CLAVE);
  await C.clic('Resolver captcha', 0, true);
  await C.clic('Entrar', -1);
  await espera(2000);
  prueba('muestra «No se pudo comprobar que eres una persona» (no un error genérico) y NO entra', /No se pudo comprobar que eres una persona/.test(await C.texto()) && /Entra en tu cuenta/.test(await C.texto()));
  prueba('y vuelve a exigir una comprobación nueva', (await C.deshabilitado('Entrar')) === true);

  // ============ Recuperar contraseña, caducidad y error del widget ============
  console.log('Recuperar contraseña, token caducado y error del widget');
  await C.clic('¿Olvidaste la contraseña?', 0);
  await espera(800);
  prueba('en «Recuperar contraseña» también hay widget y el botón espera el token', /Recuperar contraseña/.test(await C.texto()) && (await C.deshabilitado('Enviarme un enlace')) === true);
  await C.js(`window.turnstile.__error()`);
  await espera(500);
  prueba('si el widget da error: lo dice y no deja continuar', /No se pudo completar la comprobación/.test(await C.texto()) && (await C.deshabilitado('Enviarme un enlace')) === true);
  await C.js(`window.turnstile.__expirar()`);
  await espera(500);
  prueba('si el token caduca antes de enviar: avisa de que hay que repetirla', /La comprobación caducó/.test(await C.texto()) && (await C.deshabilitado('Enviarme un enlace')) === true);
  // La solicitud de recuperación se completa en un dispositivo limpio con el widget simulado «bueno»
  const R2 = await dispositivo('R2', 'mock');
  await R2.preparar();
  await esperarHasta(async () => await R2.js(`!!document.getElementById('mock-resolver')`));
  await R2.clic('¿Olvidaste la contraseña?', 0);
  await R2.rellenar('Email', 'ana@prueba.local');
  await R2.clic('Resolver captcha', 0, true);
  await R2.clic('Enviarme un enlace', -1);
  await espera(2500);
  const rec = (await R2.registro()).find((x) => x.ruta === '/auth/v1/recover');
  prueba('la solicitud de recuperación lleva el token y se confirma con el mensaje de siempre (sin revelar si el correo existe)', !!rec && /^token-bueno-/.test(rec.captcha ?? '') && /Si hay una cuenta con ese email/.test(await R2.texto()), { rec });
  R2.cerrar();

  // ============ Script de Cloudflare bloqueado / sin red ============
  console.log('R · el script de Cloudflare no se puede cargar (bloqueador o sin red) y luego sí: Turnstile REAL con la clave de prueba');
  await R.cmd('Network.setBlockedURLs', { urls: ['*challenges.cloudflare.com*'] });
  await R.preparar();
  await esperarHasta(async () => /No se pudo cargar la comprobación anti-robots/.test(await R.texto()), 15000);
  prueba('sin poder cargar el script: mensaje claro, botón «Reintentar» y no se puede continuar', /No se pudo cargar la comprobación anti-robots/.test(await R.texto()) && (await R.visible('Reintentar')) && (await R.deshabilitado('Entrar')) === true);
  await R.cmd('Network.setBlockedURLs', { urls: [] });
  await R.clic('Reintentar', 0);
  const cargo = await esperarHasta(async () => (await R.js(`typeof window.turnstile`)) === 'object', 25000); // el script real de Cloudflare está cargado (su iframe va en un shadow DOM cerrado: no se busca)
  if (!cargo) {
    saltadas++;
    console.log('  ⚠ (omitida) No se pudo cargar el Turnstile real de Cloudflare desde este equipo (¿sin red?). Las pruebas con Turnstile simulado ya cubren la integración.');
  } else {
    prueba('tras «Reintentar» carga el Turnstile REAL de Cloudflare y dibuja su widget', true);
    const token = await esperarHasta(async () => (await R.deshabilitado('Entrar')) === false, 40000);
    prueba('con la clave de prueba de Cloudflare el desafío se resuelve y el botón se activa', token, (await R.texto()).slice(0, 200));
    if (token) {
      await R.clic('Crear cuenta', 0);
      await marcarRegistro(R, 'beto@prueba.local');
      const libre = await R.js(`(() => { const b = [...document.querySelectorAll('[aria-label="Crear cuenta"]')].at(-1); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && (b === t || b.contains(t)); })()`);
      prueba('el botón «Crear cuenta» no queda tapado por el widget real de Cloudflare', libre === true);
      await R.clic('Crear cuenta', -1);
      await espera(6000);
      const a = (await R.registro()).find((x) => x.ruta === '/auth/v1/signup');
      prueba('el alta lleva el token REAL de Cloudflare (no el simulado) y la cuenta se crea', !!a && !!a.captcha && !/^token-/.test(a.captcha) && (await sql(`select count(*)::int n from auth.users where email = 'beto@prueba.local'`))[0].n === 1, a);
    }
  }
  prueba('sin errores de JavaScript en ningún dispositivo', A.errores.length + B.errores.length + C.errores.length + R.errores.length === 0, [...A.errores, ...B.errores, ...C.errores, ...R.errores].slice(0, 3));
} catch (e) {
  fallos++;
  console.log('  ✗ la prueba se interrumpió:', e.message);
} finally {
  A.cerrar(); B.cerrar(); C.cerrar(); R.cerrar();
}
console.log(`\n${ok} comprobaciones correctas, ${fallos} fallos${saltadas ? `, ${saltadas} omitida(s) por falta de red` : ''}`);
process.exit(fallos ? 1 : 0);
