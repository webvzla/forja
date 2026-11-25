// Prueba LOCAL de extremo a extremo de la RETIRADA del consentimiento de «cómo ha ido / me dolió algo»: un permiso retirado no se
// reactiva nunca y no vuelven a guardarse respuestas sin un consentimiento nuevo y explícito. App web compilada en varios Chrome
// contra el Supabase SIMULADO; NO usa Supabase real. Vigila TODO lo que cada dispositivo intenta escribir en la cuenta.
// Mismos requisitos que e2e-consentimiento.mjs:
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/e2e-retirada.mjs <carpeta-temporal> [R1,R2,R3]
// Los seis escenarios tardan más de 10 minutos: se pueden ejecutar por tandas (R1,R2,R3 y R4,R5,R6).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const API = 'http://127.0.0.1:54321';
const WEB = 'http://127.0.0.1:5189/forja/';
const salida = process.argv[2] ?? '.';
mkdirSync(salida, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fallos = 0;
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  ✓', nombre); } else { fallos++; console.log('  ✗', nombre, detalle === '' ? '' : `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle).slice(0, 700)}`); }
};

async function sql(q, p = []) {
  const r = await fetch(API + '/__prueba/sql', { method: 'POST', headers: { 'content-type': 'application/json', 'x-prueba': 'si' }, body: JSON.stringify({ sql: q, params: p }) });
  return r.json();
}

let siguiente = 9550;
async function dispositivo(nombre) {
  const puerto = siguiente++;
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${salida}/perfil-${nombre}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let objetivo;
  for (let i = 0; i < 60 && !objetivo; i++) { try { objetivo = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); } catch { /* arrancando */ } if (!objetivo) await espera(250); }
  const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const pend = new Map(); const errores = []; const escrituras = []; const falla = { leer: false, escribir: false };
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    // Todo lo que este dispositivo INTENTA escribir en los datos de la cuenta (aunque luego falle).
    if (d.method === 'Network.requestWillBeSent') {
      const q = d.params.request;
      if (/rest\/v1\/datos_usuario/.test(q.url) && q.method !== 'GET' && q.method !== 'OPTIONS') escrituras.push({ t: Date.now(), metodo: q.method, url: q.url, cuerpo: q.postData ?? '' });
    }
    // Fallos provocados: lecturas y/o escrituras de los datos de la cuenta.
    if (d.method === 'Fetch.requestPaused') {
      const q = d.params.request;
      const fallar = q.method === 'GET' ? falla.leer : q.method !== 'OPTIONS' && falla.escribir;
      ws.send(JSON.stringify(fallar ? { id: ++n, method: 'Fetch.failRequest', params: { requestId: d.params.requestId, errorReason: 'Failed' } } : { id: ++n, method: 'Fetch.continueRequest', params: { requestId: d.params.requestId } }));
    }
    if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  };
  const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable', { maxPostDataSize: 20000000 });
  await cmd('Fetch.enable', { patterns: [{ urlPattern: '*rest/v1/datos_usuario*' }] });
  await cmd('Emulation.setDeviceMetricsOverride', { width: 400, height: 900, deviceScaleFactor: 1, mobile: true });
  const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const d = {
    nombre, errores, js, escrituras, falla,
    ir: async () => { await cmd('Page.navigate', { url: WEB }); await espera(2800); },
    recargar: async (ms = 3500) => { await cmd('Page.reload'); await espera(ms); },
    texto: () => js('document.body.innerText'),
    local: async () => JSON.parse((await js(`localStorage.getItem('mi-gym:v1')`)) ?? 'null'),
    poner: (clave, valor) => js(`localStorage.setItem(${JSON.stringify(clave)}, ${JSON.stringify(typeof valor === 'string' ? valor : JSON.stringify(valor))})`),
    ponerDe: (clave, url) => js(`(async()=>{localStorage.setItem(${JSON.stringify(clave)}, await fetch(${JSON.stringify(url)}).then(r=>r.text()));})()`),
    sinBienvenida: () => d.poner('mi-gym:beta-v1', { v: 1, conDatos: true, visto: true }),
    visible: (t) => js(`[...document.querySelectorAll('div,span')].some(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)}&&e.getBoundingClientRect().height>0)`),
    clic: async (t, i = 0, aria = false) => {
      const sel = aria ? `[...document.querySelectorAll('[aria-label]')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(t)})` : `[...document.querySelectorAll('div,span,a')].filter(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)})`;
      const c = await js(`(()=>{const l=${sel};const e=l.at(${i});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!c) throw new Error(`no encuentro «${t}» en ${nombre}`);
      for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
      await espera(900);
    },
    pestana: async (t) => {
      const r = await js(`(()=>{const e=[...document.querySelectorAll('[role=tab]')].filter(x=>x.textContent.trim().endsWith(${JSON.stringify(t)})).at(-1);if(!e)return 'no';e.click();return 'si'})()`);
      if (r === 'no') throw new Error(`no encuentro la pestaña «${t}» en ${nombre}`);
      await espera(1100);
    },
    rellenar: async (selector, valor) => {
      const hay = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.scrollIntoView({block:'center'});e.focus();e.select&&e.select();return true})()`);
      if (!hay) throw new Error(`no encuentro el campo ${selector} en ${nombre}`);
      await cmd('Input.insertText', { text: valor });
      await espera(200);
    },
    sinRed: (si) => cmd('Network.emulateNetworkConditions', { offline: si, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
    avisarVueltaALaApp: () => js(`document.dispatchEvent(new Event('visibilitychange'))`),
    avisarRed: () => js(`window.dispatchEvent(new Event('online'))`),
    cerrar: () => { try { ws.close(); } catch { /* ya cerrado */ } chrome.kill(); },
  };
  return d;
}

const CLAVE = 'secreto-de-prueba-1';
const CASILLA_SENS = 'Guardar también cómo me sientan los entrenos y si me dolió algo (opcional)';
const esperarHasta = async (f, max = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { if (await f()) return true; await espera(700); } return false; };
const nube = async (email) => (await sql(`select d.datos, d.actualizado from public.datos_usuario d join auth.users u on u.id = d.user_id where u.email = $1`, [email]))[0];
const valor = (datos) => datos?.ajustes?.consentimientos?.sensaciones?.valor;

async function registrar(d, email, { sensaciones = false } = {}) {
  await d.clic('Crear cuenta', 0);
  await d.rellenar('[aria-label="Email"]', email);
  await d.rellenar('[aria-label="Contraseña"]', CLAVE);
  await d.clic('Tengo 16 años o más y acepto los términos de uso y la política de privacidad', 0, true);
  await d.clic('Consiento que se guarden mis datos en la nube', 0, true);
  if (sensaciones) await d.clic(CASILLA_SENS, 0, true);
  await d.clic('Crear cuenta', -1);
  await espera(5500);
}
async function entrar(d, email) {
  await d.rellenar('[aria-label="Email"]', email);
  await d.rellenar('[aria-label="Contraseña"]', CLAVE);
  await d.clic('Entrar', -1);
  await espera(6000);
}
// Un entreno de verdad en la interfaz (Coach → Empezar → una serie → Terminar y guardar). Devuelve el texto del resumen.
async function entreno(d) {
  await d.pestana('Coach');
  await d.clic('Empezar', 0);
  if (await d.visible('Empezar')) await d.clic('Empezar', -1); // «¿Cómo estás hoy?»
  await espera(1200);
  await d.rellenar('[aria-label$=", serie 1, kilos"]', '60');
  await d.rellenar('[aria-label$=", serie 1, repeticiones"]', '8');
  await d.clic('Serie 1 hecha', 0, true);
  await d.clic('Terminar', 0);
  await d.clic('Terminar y guardar');
  await espera(1500);
  return d.texto();
}
// Al conseguir una medalla (la primera, tras el primer entreno) aparece un aviso que tapa el engranaje: se cierra.
const cerrarMedallas = async (d) => {
  for (let i = 0; i < 3; i++) {
    const t = await d.js(`[...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith('Nueva medalla'))?.getAttribute('aria-label') ?? null`);
    if (!t) return;
    await d.clic(t, 0, true);
  }
};
const cerrarResumen = async (d) => { await d.clic('Listo'); await cerrarMedallas(d); };
const abrirAjustes = async (d) => {
  await d.pestana('Coach');
  await d.clic('Ajustes y apariencia', 0, true);
  if (!(await d.visible('Ajustes'))) console.log('      (depuración: tras pulsar el engranaje se ve:', JSON.stringify((await d.texto()).slice(0, 260)), ')');
};
const cerrarAjustes = (d) => d.clic('Cerrar ajustes', 0, true);
const ETIQUETA = 'Guardar cómo me sientan los entrenos y si me dolió algo';

// ---------- Comprobaciones comunes ----------
const abiertos = [];
const SOLO = process.argv[3]?.split(',');
const toca = (n) => !SOLO || SOLO.includes(n);
const cerrarEscenario = () => abiertos.forEach((d) => d.cerrar()); // lo escrito queda registrado
const nuevo = async (n) => { const d = await dispositivo(n); abiertos.push(d); await d.ir(); await d.ponerDe('mi-gym:v1', '/vacio.json'); await d.sinBienvenida(); await d.recargar(); return d; };
const documento = (e) => { try { const x = JSON.parse(e.cuerpo); return (Array.isArray(x) ? x[0] : x).datos; } catch { return null; } };
const conRespuesta = (datos) => (datos?.sesiones ?? []).some((s) => s.sensacion || s.dolor);
// Escrituras hechas desde `desde` que llevan respuestas o dicen «sí» (ninguna debería, mientras el permiso esté retirado).
const malas = (devs, desde) => devs.flatMap((d) => d.escrituras.filter((e) => e.t >= desde).map((e) => ({ de: d.nombre, datos: documento(e), cuerpo: e.cuerpo })))
  .filter((x) => !x.datos || conRespuesta(x.datos) || valor(x.datos) !== false);
const enviadas = (devs, desde) => devs.reduce((a, d) => a + d.escrituras.filter((e) => e.t >= desde).length, 0);
const aCiegas = () => abiertos.flatMap((d) => d.escrituras).filter((e) => /on_conflict/.test(e.url)).length;
const retirar = async (d) => { await abrirAjustes(d); await d.clic(ETIQUETA, 0, true); await espera(600); await d.clic('Desactivar y borrar', -1); await espera(1500); await cerrarAjustes(d); };
const activar = async (d) => { await abrirAjustes(d); await d.clic(ETIQUETA, 0, true); await espera(1200); await cerrarAjustes(d); };
const volver = async (d) => { await d.avisarRed(); await d.avisarVueltaALaApp(); };
// Termina un entreno; si la app pregunta, contesta «Duro» + «me dolió». Devuelve si preguntó.
const entrenar = async (d) => {
  const t = await entreno(d);
  const pregunta = /¿Cómo ha ido\?/.test(t);
  if (pregunta) { await d.clic('Duro', -1); await d.clic('Me dolió algo', 0, true); }
  await cerrarResumen(d);
  await espera(2500);
  return pregunta;
};
const cerrarSesion = async (d) => { await d.pestana('Coach'); await d.clic('Cerrar sesión', 0); await espera(3500); };
const volverAEntrar = async (d, email) => { await d.recargar(4500); if (/Entra en tu cuenta/.test(await d.texto())) await entrar(d, email); await espera(2500); };
const enNube = async (email) => (await nube(email))?.datos;
const nubeRetirada = (email, max = 25000) => esperarHasta(async () => { const c = await enNube(email); return valor(c) === false && !conRespuesta(c); }, max);
// Cuenta con permiso dado en el registro y una respuesta guardada en la nube.
const cuentaConRespuesta = async (d, email) => {
  await registrar(d, email, { sensaciones: true });
  await entrenar(d);
  return esperarHasta(async () => conRespuesta(await enNube(email)));
};

try {
  if (toca('R1')) {
  console.log('R1 · Retirada normal y sincronización');
    const U = 'r1@prueba.local';
    const A = await nuevo('A1'), B = await nuevo('B1');
    prueba('punto de partida: la respuesta está en la nube', await cuentaConRespuesta(A, U));
    await entrar(B, U);
    const t0 = Date.now();
    await retirar(A);
    prueba('la nube queda en «no» y sin respuestas', await nubeRetirada(U));
    await volver(B); await espera(4000);
    const lb = await B.local();
    prueba('el otro dispositivo recibe el «no» y borra sus respuestas', valor(lb) === false && !conRespuesta(lb));
    prueba('ya no pregunta al entrenar', !(await entrenar(B)));
    await volver(A); await espera(3000);
    prueba('ninguna escritura posterior lleva respuestas ni «sí»', enviadas([A, B], t0) > 0 && malas([A, B], t0).length === 0, malas([A, B], t0).length);
    cerrarEscenario();
  }

  if (toca('R2')) {
  console.log('R2 · Lectura de la nube fallida al entrar en otro dispositivo');
    const U = 'r2@prueba.local';
    const A = await nuevo('A2'), C = await nuevo('C2');
    await cuentaConRespuesta(A, U);
    await retirar(A); await nubeRetirada(U);
    const t0 = Date.now();
    C.falla.leer = true;
    await entrar(C, U); await espera(8000);
    prueba('sin poder leer la nube NO se recupera el «sí» del registro', valor(await C.local()) !== true, valor(await C.local()));
    prueba('y no pregunta al entrenar', !(await entrenar(C)));
    await volver(C); await espera(6000);
    prueba('mientras no puede leer, no escribe nada en la nube', enviadas([C], t0) === 0, enviadas([C], t0));
    prueba('la nube sigue en «no» y sin respuestas', valor(await enNube(U)) === false && !conRespuesta(await enNube(U)));
    C.falla.leer = false;
    await volver(C); await espera(4000);
    prueba('al recuperar la lectura el dispositivo se entera del «no»', await esperarHasta(async () => valor(await C.local()) === false, 20000));
    await entrenar(C);
    prueba('el entreno hecho sin lectura acaba en la nube, sin respuestas', await esperarHasta(async () => { const c = await enNube(U); return c.sesiones.length === 3 && valor(c) === false && !conRespuesta(c); }));
    prueba('ninguna escritura lleva respuestas ni «sí»', malas([C], t0).length === 0, malas([C], t0).length);
    cerrarEscenario();
  }

  if (toca('R3')) {
  console.log('R3 · Cierre de sesión y nuevo inicio');
    const U = 'r3@prueba.local';
    const A = await nuevo('A3');
    await cuentaConRespuesta(A, U);
    await retirar(A); await nubeRetirada(U);
    let t0 = Date.now();
    await cerrarSesion(A); await volverAEntrar(A, U);
    prueba('retirada ya sincronizada: tras salir y entrar sigue en «no»', valor(await A.local()) === false && !conRespuesta(await A.local()));
    prueba('y no pregunta', !(await entrenar(A)));
    prueba('sin escrituras con respuestas ni «sí»', malas([A], t0).length === 0, malas([A], t0).length);

    const V = 'r3b@prueba.local';
    const B = await nuevo('B3');
    await cuentaConRespuesta(B, V);
    B.falla.escribir = true; // la retirada no llega a la nube
    await retirar(B); await espera(2500);
    prueba('la retirada no ha podido subir (la nube aún dice «sí»)', valor(await enNube(V)) === true);
    await cerrarSesion(B);
    B.falla.escribir = false;
    t0 = Date.now();
    await volverAEntrar(B, V);
    prueba('al volver a entrar manda la retirada, aunque la nube dijera «sí»', await esperarHasta(async () => valor(await B.local()) === false && !conRespuesta(await B.local()), 15000), valor(await B.local()));
    prueba('y llega por fin a la nube', await nubeRetirada(V));
    prueba('no pregunta al entrenar', !(await entrenar(B)));
    prueba('sin escrituras con respuestas ni «sí»', malas([B], t0).length === 0, malas([B], t0).length);
    cerrarEscenario();
  }

  if (toca('R4')) {
  console.log('R4 · Dos dispositivos con estados distintos: retirada, consentimiento NUEVO y un dispositivo atrasado');
    const U = 'r4@prueba.local';
    const A = await nuevo('A4'), B = await nuevo('B4');
    await cuentaConRespuesta(A, U);
    await entrar(B, U);
    await B.sinRed(true);
    await retirar(A); await nubeRetirada(U);
    await activar(A); // consentimiento nuevo y explícito
    prueba('el consentimiento nuevo y explícito llega a la nube', await esperarHasta(async () => valor(await enNube(U)) === true));
    prueba('B, atrasado y sin conexión, pregunta con el permiso antiguo', await entrenar(B));
    const t0 = Date.now();
    await B.sinRed(false); await volver(B); await espera(8000); await volver(A); await espera(4000);
    prueba('lo respondido con el permiso retirado NO se sube nunca', B.escrituras.filter((e) => e.t >= t0).length > 0 && ![A, B].some((d) => d.escrituras.some((e) => e.t >= t0 && conRespuesta(documento(e)))));
    prueba('ni se conserva en el dispositivo', await esperarHasta(async () => !conRespuesta(await B.local()), 15000));
    prueba('la nube mantiene el permiso nuevo, con los entrenos y sin respuestas antiguas', valor(await enNube(U)) === true && !conRespuesta(await enNube(U)) && (await enNube(U)).sesiones.length === 2);
    prueba('con el permiso nuevo ya sincronizado, B pregunta', await entrenar(B));
    prueba('y esa respuesta nueva SÍ se guarda', await esperarHasta(async () => (await enNube(U)).sesiones.filter((s) => s.sensacion).length === 1));
    cerrarEscenario();
  }

  if (toca('R5')) {
  console.log('R5 · Dispositivo desconectado que anota después de la retirada y vuelve a conectarse');
    const U = 'r5@prueba.local';
    const A = await nuevo('A5'), B = await nuevo('B5');
    await cuentaConRespuesta(A, U);
    await entrar(B, U);
    await B.sinRed(true);
    const t0 = Date.now();
    await retirar(A); await nubeRetirada(U);
    prueba('B (sin saberlo) pregunta y guarda en su dispositivo', (await entrenar(B)) && conRespuesta(await B.local()));
    prueba('sin conexión nada llega a la nube', !conRespuesta(await enNube(U)));
    await B.sinRed(false); await volver(B); await espera(12000);
    prueba('al reconectar, ni una sola escritura lleva respuestas ni «sí»', B.escrituras.filter((e) => e.t >= t0 + 1).length > 0 && B.escrituras.filter((e) => e.t >= t0 && conRespuesta(documento(e))).length === 0 && !conRespuesta(await enNube(U)));
    prueba('B queda en «no» y sin respuestas, con sus entrenos', await esperarHasta(async () => { const x = await B.local(); return valor(x) === false && !conRespuesta(x) && x.sesiones.length === 2; }));
    await B.recargar(5000);
    prueba('tras recargar sigue igual', valor(await B.local()) === false && !conRespuesta(await B.local()));
    cerrarEscenario();
  }

  if (toca('R6')) {
  console.log('R6 · Errores y reintentos de sincronización');
    const U = 'r6@prueba.local';
    const A = await nuevo('A6'), B = await nuevo('B6');
    await cuentaConRespuesta(A, U);
    await entrar(B, U);
    A.falla.escribir = true;
    await retirar(A); await espera(3000);
    prueba('con las escrituras fallando, el dispositivo ya está en «no»', valor(await A.local()) === false && !conRespuesta(await A.local()));
    A.falla.escribir = false; A.falla.leer = true;
    await volver(A); await espera(8000);
    prueba('con las lecturas fallando no se escribe a ciegas', valor(await enNube(U)) === true);
    A.falla.leer = false;
    const t0 = Date.now();
    await volver(A);
    prueba('al recuperarse, el reintento lleva la retirada a la nube', await nubeRetirada(U, 30000));
    B.falla.leer = true; // B, atrasado y sin poder leer, entrena y responde
    prueba('B atrasado pregunta (aún no sabe nada)', await entrenar(B));
    await volver(B); await espera(6000);
    prueba('y mientras no puede leer no escribe: la retirada no se pisa', valor(await enNube(U)) === false && !conRespuesta(await enNube(U)));
    B.falla.leer = false; B.falla.escribir = true;
    await volver(B); await espera(5000);
    B.falla.escribir = false;
    await volver(B); await entrenar(B); await espera(4000);
    prueba('tras los errores todo converge en «no», sin respuestas', await esperarHasta(async () => { const x = await B.local(); const c = await enNube(U); return valor(x) === false && !conRespuesta(x) && valor(c) === false && !conRespuesta(c) && c.sesiones.length === 3; }, 30000));
    prueba('ninguna escritura intentada tras la retirada lleva respuestas', ![A, B].some((d) => d.escrituras.some((e) => e.t >= t0 && conRespuesta(documento(e)))));
    cerrarEscenario();
  }

  prueba('en toda la prueba nunca se escribió a ciegas (sin control de versión)', aCiegas() === 0, aCiegas());
  const errores = abiertos.flatMap((d) => d.errores);
  prueba('sin errores de JavaScript en ningún dispositivo', errores.length === 0, errores.slice(0, 3));
} catch (e) {
  fallos++;
  console.log('  ✗ la prueba se interrumpió:', e.message);
} finally {
  for (const d of abiertos) d.cerrar();
}
console.log(`\n${ok} comprobaciones correctas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
