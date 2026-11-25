// Prueba LOCAL de extremo a extremo del consentimiento INDEPENDIENTE de «cómo ha ido / me dolió algo»: la app web real (compilada) en
// varios Chrome con perfiles distintos contra el Supabase SIMULADO (Postgres en memoria con las migraciones y RLS reales). NO usa
// Supabase real ni cuentas reales. Comprueba, con entrenos hechos de verdad en la interfaz:
//   · sin consentimiento NO se pregunta y NO se guarda nada (ni en el dispositivo ni en la nube);
//   · con consentimiento se pregunta, se guarda y se sincroniza a otro dispositivo;
//   · revocarlo BORRA las respuestas y el borrado se propaga a la nube y a los demás dispositivos (también sin conexión);
//   · respuestas antiguas del dispositivo al crear la cuenta: se pregunta y, según lo elegido, se activan o se quitan sin subir nada.
// Requisitos: 1) servidor simulado en :54321  2) web compilada con EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (y clave de prueba)
// servida en :5189 junto a vacio.json (`sustitucion-web.mjs servir <dist> 5189 0 <carpeta con vacio.json>`).
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/e2e-consentimiento.mjs <carpeta-temporal>
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
  let n = 0; const pend = new Map(); const errores = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  };
  const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 400, height: 900, deviceScaleFactor: 1, mobile: true });
  const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const d = {
    nombre, errores, js,
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
const respuestas = (datos) => (datos?.sesiones ?? []).filter((s) => s.sensacion || s.dolor).length;
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
const interruptor = (d) => d.js(`document.querySelector('[aria-label=${JSON.stringify(ETIQUETA)}]')?.getAttribute('aria-checked') ?? document.querySelector('[aria-label=${JSON.stringify(ETIQUETA)}]')?.checked`);

const A = await dispositivo('A');
const B = await dispositivo('B');
const C = await dispositivo('C');
const D = await dispositivo('D');
const E = await dispositivo('E');
try {
  // ============ 1. Sin consentimiento: no se pregunta ni se guarda ============
  console.log('1 · Cuenta nueva SIN marcar la casilla opcional: no se pregunta y no se guarda nada');
  const U1 = 'ana@prueba.local';
  await A.ir();
  await A.ponerDe('mi-gym:v1', '/vacio.json');
  await A.sinBienvenida();
  await A.recargar();
  const tr = await A.texto();
  await A.clic('Crear cuenta', 0);
  prueba('el registro ofrece la casilla opcional, aparte de las dos obligatorias, y sin marcar de partida', /Opcional: quiero guardar también cómo me sientan los entrenos/.test(await A.texto()) && (await A.js(`document.querySelector('[aria-label=${JSON.stringify(CASILLA_SENS)}]').getAttribute('aria-checked')`)) !== 'true', tr.slice(0, 80));
  await A.recargar();
  await registrar(A, U1);
  let resumen = await entreno(A);
  prueba('termina el entreno: sale el resumen pero NO la pregunta «¿Cómo ha ido?» ni «Me dolió algo»', /¡Entreno guardado!/.test(resumen) && !/¿Cómo ha ido\?/.test(resumen) && !/Me dolió algo/.test(resumen), resumen.slice(0, 200));
  await cerrarResumen(A);
  let l = await A.local();
  prueba('en el dispositivo hay un entreno sin ninguna respuesta y la decisión guardada es «no»', l.sesiones.length === 1 && respuestas(l) === 0 && valor(l) === false, { ses: l.sesiones.length, valor: valor(l) });
  prueba('en la nube: el entreno está, sin respuestas, y consta el «no»', await esperarHasta(async () => { const c = await nube(U1); return c?.datos?.sesiones?.length === 1 && respuestas(c.datos) === 0 && valor(c.datos) === false; }));
  await abrirAjustes(A);
  const ta = await A.texto();
  prueba('Ajustes → Privacidad muestra el interruptor apagado y dice que no se guarda nada', /Privacidad/.test(ta) && /Ahora no se pregunta ni se guarda nada de esto en tu cuenta/.test(ta) && (await interruptor(A)) !== true && (await interruptor(A)) !== 'true');
  await cerrarAjustes(A);

  // ============ 2. Activar: se pregunta, se guarda y se sincroniza ============
  console.log('2 · Activarlo en Ajustes: se pregunta, se guarda, llega a la nube y a otro dispositivo');
  await abrirAjustes(A);
  await A.clic(ETIQUETA, 0, true);
  await espera(800);
  await cerrarAjustes(A);
  l = await A.local();
  prueba('la decisión pasa a «sí»', valor(l) === true);
  resumen = await entreno(A);
  prueba('ahora SÍ se pregunta tras el entreno', /¿Cómo ha ido\?/.test(resumen) && /Me dolió algo/.test(resumen));
  await A.clic('Duro', -1);
  await A.clic('Me dolió algo', 0, true);
  await cerrarResumen(A);
  l = await A.local();
  prueba('el entreno nuevo guarda «duro» y «me dolió algo»', l.sesiones.length === 2 && l.sesiones[0].sensacion === 'duro' && l.sesiones[0].dolor === true, l.sesiones[0]);
  prueba('la nube también las tiene y consta el «sí»', await esperarHasta(async () => { const c = await nube(U1); return respuestas(c?.datos) === 1 && valor(c.datos) === true; }));

  console.log('3 · Segundo dispositivo con la misma cuenta: recibe las respuestas y el «sí»');
  await B.ir();
  await B.ponerDe('mi-gym:v1', '/vacio.json');
  await B.sinBienvenida();
  await B.recargar();
  await entrar(B, U1);
  let lb = await B.local();
  prueba('B recibe los 2 entrenos, la respuesta y la decisión «sí»', lb.sesiones.length === 2 && respuestas(lb) === 1 && valor(lb) === true, { ses: lb.sesiones.length, resp: respuestas(lb), valor: valor(lb) });
  await B.pestana('Coach');
  prueba('y con molestias recientes la app es prudente (aviso en Coach), como antes', /No entrenes con dolor/.test(await B.texto()));

  // ============ 4. Revocar: se borra y se propaga ============
  console.log('4 · Revocar en A: confirmación, borrado local, en la nube y en B');
  await abrirAjustes(A);
  await A.clic(ETIQUETA, 0, true);
  await espera(600);
  let tc = await A.texto();
  prueba('antes de borrar pide confirmación y explica qué se borra', /¿Dejar de guardar y borrar tus respuestas\?/.test(tc) && /en la nube y en tus otros dispositivos/.test(tc));
  await A.clic('Cancelar', -1);
  l = await A.local();
  prueba('si cancelas, no cambia nada', valor(l) === true && respuestas(l) === 1);
  await A.clic(ETIQUETA, 0, true);
  await espera(600);
  await A.clic('Desactivar y borrar', -1);
  await espera(1500);
  l = await A.local();
  prueba('al confirmar: en A desaparecen las respuestas, se conservan los entrenos y la decisión es «no»', respuestas(l) === 0 && l.sesiones.length === 2 && valor(l) === false, { resp: respuestas(l), ses: l.sesiones.length, valor: valor(l) });
  await cerrarAjustes(A);
  prueba('en la nube: sin respuestas, con los 2 entrenos y el «no»', await esperarHasta(async () => { const c = await nube(U1); return respuestas(c?.datos) === 0 && c.datos.sesiones.length === 2 && valor(c.datos) === false; }));
  await B.avisarVueltaALaApp();
  prueba('B recibe el borrado y el «no» sin hacer nada (y se quita el aviso prudente que dependía de esa respuesta)', await esperarHasta(async () => { const x = await B.local(); return respuestas(x) === 0 && valor(x) === false && x.sesiones.length === 2; }, 20000));
  await B.pestana('Coach');
  await espera(800);
  prueba('en B el aviso de molestias ya no aparece (no hay respuestas), pero siguen los avisos generales de salud', !/Marcaste molestias hace poco/.test(await B.texto()) && /no sustituye el consejo de un profesional sanitario|no conoce tu estado de salud|orientación general/i.test(await B.texto()));

  // ============ 5. Casos de error: sin conexión ============
  console.log('5 · B sin conexión contesta una respuesta ANTES de enterarse; al volver, no queda nada');
  await abrirAjustes(A);
  await A.clic(ETIQUETA, 0, true); // activar de nuevo
  await espera(800);
  await cerrarAjustes(A);
  await B.avisarVueltaALaApp();
  await esperarHasta(async () => valor(await B.local()) === true, 20000);
  await B.sinRed(true);
  await abrirAjustes(A);
  await A.clic(ETIQUETA, 0, true);
  await espera(600);
  await A.clic('Desactivar y borrar', -1);
  await espera(1200);
  await cerrarAjustes(A);
  prueba('A revoca (la nube queda en «no»)', await esperarHasta(async () => valor((await nube(U1))?.datos) === false, 15000));
  resumen = await entreno(B); // B todavía cree que tiene consentimiento
  prueba('B (sin saberlo, sin conexión) sí pregunta', /¿Cómo ha ido\?/.test(resumen));
  await B.clic('Duro', -1);
  await B.clic('Me dolió algo', 0, true);
  await cerrarResumen(B);
  prueba('B guarda la respuesta solo en su dispositivo', respuestas(await B.local()) === 1);
  await B.sinRed(false);
  await B.avisarRed();
  await B.avisarVueltaALaApp();
  prueba('al volver la conexión B se entera del «no» y BORRA su respuesta', await esperarHasta(async () => { const x = await B.local(); return valor(x) === false && respuestas(x) === 0; }, 25000));
  await A.avisarVueltaALaApp();
  const cn = await esperarHasta(async () => { const c = await nube(U1); return respuestas(c?.datos) === 0 && valor(c.datos) === false; }, 20000);
  // A descarga el entreno de B en segundo plano: se espera a que lo tenga antes de comparar.
  await esperarHasta(async () => (await A.local()).sesiones.length === (await B.local()).sesiones.length, 15000);
  prueba('la nube termina sin ninguna respuesta; A y B tienen los mismos entrenos y ninguna respuesta', cn && (await A.local()).sesiones.length === (await B.local()).sesiones.length && respuestas(await A.local()) === 0 && respuestas(await B.local()) === 0, { a: (await A.local()).sesiones.length, b: (await B.local()).sesiones.length });

  console.log('5b · Revocar sin conexión: se borra al instante en el dispositivo y el borrado llega al volver');
  await abrirAjustes(A);
  await A.clic(ETIQUETA, 0, true);
  await espera(800);
  await cerrarAjustes(A);
  resumen = await entreno(A);
  await A.clic('Bien', -1);
  await cerrarResumen(A);
  await B.avisarVueltaALaApp();
  await esperarHasta(async () => respuestas(await B.local()) === 1, 20000);
  await A.sinRed(true);
  await abrirAjustes(A);
  await A.clic(ETIQUETA, 0, true);
  await espera(600);
  await A.clic('Desactivar y borrar', -1);
  await espera(1200);
  await cerrarAjustes(A);
  prueba('sin conexión, A borra al momento sus respuestas', respuestas(await A.local()) === 0 && valor(await A.local()) === false);
  prueba('mientras tanto la nube y B aún las tienen (nadie se ha enterado)', respuestas((await nube(U1)).datos) === 1 && respuestas(await B.local()) === 1);
  await A.sinRed(false);
  await A.avisarRed();
  prueba('al volver la conexión de A, la nube queda sin respuestas', await esperarHasta(async () => respuestas((await nube(U1))?.datos) === 0, 25000));
  await B.avisarVueltaALaApp();
  prueba('y B también las pierde', await esperarHasta(async () => respuestas(await B.local()) === 0 && valor(await B.local()) === false, 25000));

  // ============ 6/7. Respuestas antiguas del dispositivo al crear la cuenta ============
  const antiguas = { sesiones: [{ id: 'v1', rutinaNombre: 'Torso', fecha: Date.now() - 5 * 86400000, minutos: 50, ejercicios: [{ nombre: 'Press', series: [{ peso: 60, reps: 8 }] }], sensacion: 'duro', dolor: true }, { id: 'v2', rutinaNombre: 'Pierna', fecha: Date.now() - 3 * 86400000, minutos: 45, ejercicios: [{ nombre: 'Sentadilla', series: [{ peso: 80, reps: 8 }] }], sensacion: 'bien' }] };
  const preparar = async (dev, extra) => { await dev.ir(); await dev.ponerDe('mi-gym:v1', '/vacio.json'); const x = await dev.local(); await dev.poner('mi-gym:v1', { ...x, ...extra }); await dev.sinBienvenida(); await dev.recargar(); };

  console.log('6 · Dispositivo con respuestas antiguas + cuenta SIN casilla: se pregunta y «Quitarlas» no sube nada');
  const U3 = 'carlos@prueba.local';
  await preparar(C, antiguas);
  await registrar(C, U3);
  let tp = await C.texto();
  prueba('aparece la pregunta con el número de entrenos y las dos opciones', /Tus respuestas sobre cómo te sientan los entrenos/.test(tp) && /\(2 entrenos\)/.test(tp) && /Activar y guardarlas en mi cuenta/.test(tp) && /Quitarlas de este dispositivo/.test(tp), tp.slice(0, 200));
  prueba('mientras se decide NO se ha subido nada a la nube', ((await nube(U3))?.datos ?? null) === null || respuestas((await nube(U3)).datos) === 0);
  await C.clic('Quitarlas de este dispositivo', 0);
  await espera(2500);
  l = await C.local();
  prueba('tras quitarlas: los 2 entrenos siguen, sin respuestas, y la decisión es «no»', l.sesiones.length === 2 && respuestas(l) === 0 && valor(l) === false, { ses: l.sesiones.length, resp: respuestas(l) });
  const c3 = await esperarHasta(async () => (await nube(U3))?.datos?.sesiones?.length === 2, 20000);
  prueba('en la nube están los 2 entrenos y NUNCA hubo respuestas', c3 && !/"sensacion"|"dolor"/.test(JSON.stringify((await nube(U3)).datos)));

  console.log('7 · Lo mismo pero eligiendo «Activar»: las respuestas se suben con su consentimiento');
  const U4 = 'diana@prueba.local';
  await preparar(D, antiguas);
  await registrar(D, U4);
  prueba('aparece la pregunta', /Tus respuestas sobre cómo te sientan los entrenos/.test(await D.texto()));
  await D.clic('Activar y guardarlas en mi cuenta', 0);
  await espera(2500);
  l = await D.local();
  prueba('con «Activar»: se conservan las 2 respuestas y la decisión es «sí»', respuestas(l) === 2 && valor(l) === true);
  prueba('y llegan a la nube', await esperarHasta(async () => { const c = await nube(U4); return respuestas(c?.datos) === 2 && valor(c.datos) === true; }, 20000));

  console.log('8 · Cuenta nueva MARCANDO la casilla opcional en el registro: se pregunta desde el primer entreno');
  const U5 = 'elena@prueba.local';
  await preparar(E, {});
  await registrar(E, U5, { sensaciones: true });
  l = await E.local();
  prueba('la decisión inicial es «sí» (la del registro) y no hay pregunta pendiente', valor(l) === true && !/Tus respuestas sobre cómo te sientan los entrenos/.test(await E.texto()));
  resumen = await entreno(E);
  prueba('el primer entreno ya pregunta «¿Cómo ha ido?» y «Me dolió algo»', /¿Cómo ha ido\?/.test(resumen) && /Me dolió algo/.test(resumen));
  await E.clic('Fácil', -1);
  await cerrarResumen(E);
  prueba('se guarda la respuesta y llega a la nube junto con el «sí»', respuestas(await E.local()) === 1 && (await esperarHasta(async () => { const c = await nube(U5); return respuestas(c?.datos) === 1 && valor(c.datos) === true; }, 20000)));

  // ============ Sin errores de JavaScript ============
  prueba('sin errores de JavaScript en ningún dispositivo', A.errores.length + B.errores.length + C.errores.length + D.errores.length + E.errores.length === 0, [...A.errores, ...B.errores, ...C.errores, ...D.errores, ...E.errores].slice(0, 3));
} catch (e) {
  fallos++;
  console.log('  ✗ la prueba se interrumpió:', e.message);
} finally {
  A.cerrar(); B.cerrar(); C.cerrar(); D.cerrar(); E.cerrar();
}
console.log(`\n${ok} comprobaciones correctas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
