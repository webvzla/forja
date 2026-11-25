// Prueba LOCAL de extremo a extremo de la BETA con DOS dispositivos y una cuenta: la app web real (compilada) en dos
// Chrome con perfiles distintos contra el Supabase SIMULADO (supabase/pruebas/servidor-simulado.mjs: Postgres en memoria con las
// migraciones y RLS reales). NO usa Supabase real ni ninguna cuenta real: todo ocurre en 127.0.0.1 con cuentas inventadas.
// Comprueba: registro con casillas, fusión al iniciar sesión en un segundo dispositivo, sincronización al volver a la app,
// borrados que no resucitan tras estar sin conexión, opiniones, aviso de versión nueva y bloqueo por datos de una versión más nueva.
// Requisitos: 1) servidor simulado en :54321  2) web compilada con EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 y
// EXPO_PUBLIC_SUPABASE_ANON_KEY=<cualquiera> servida en :5189 (`sustitucion-web.mjs servir <dist> 5189 0 <carpeta con demo.json y vacio.json>`).
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/e2e-dispositivos.mjs <carpeta-temporal> <carpeta-dist-con-version.json>
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const API = 'http://127.0.0.1:54321';
const WEB = 'http://127.0.0.1:5189/forja/';
const salida = process.argv[2] ?? '.';
const distVersion = process.argv[3];
mkdirSync(salida, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fallos = 0;
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  ✓', nombre); } else { fallos++; console.log('  ✗', nombre, detalle === '' ? '' : `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle).slice(0, 700)}`); }
};

async function http(ruta, cuerpo, metodo) {
  const r = await fetch(API + ruta, { method: metodo ?? (cuerpo !== undefined ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', 'x-prueba': 'si' }, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
  const t = await r.text();
  return [r.status, t ? JSON.parse(t) : null];
}
const sql = async (q, p = []) => (await http('/__prueba/sql', { sql: q, params: p }))[1];

let siguiente = 9500;
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
    rellenar: async (etiqueta, valor) => {
      await js(`(()=>{const e=document.querySelector('[aria-label=${JSON.stringify(etiqueta)}]');e.scrollIntoView({block:'center'});e.focus();e.select&&e.select()})()`);
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

const EMAIL = 'ana@prueba.local';
const CLAVE = 'secreto-de-prueba-1';
const ids = (l) => (l ?? []).map((x) => x.id).sort();
const nube = async () => (await sql(`select datos, actualizado from public.datos_usuario`))[0];
const esperarHasta = async (f, max = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { if (await f()) return true; await espera(700); } return false; };

const A = await dispositivo('A');
const B = await dispositivo('B');
const versionJson = distVersion ? `${distVersion}/version.json` : null;
const versionOriginal = versionJson ? readFileSync(versionJson, 'utf8') : null;
try {
  // ============ A: registro con casillas ============
  console.log('A · registro (casillas obligatorias) con los datos que ya tenía');
  await A.ir();
  await A.ponerDe('mi-gym:v1', '/demo.json');
  await A.sinBienvenida();
  await A.recargar();
  const demo = JSON.parse(await A.js(`localStorage.getItem('mi-gym:v1')`));
  const sesionesDemo = ids(demo.sesiones);
  prueba('(referencia) los datos de ejemplo tienen entrenos', sesionesDemo.length > 5, sesionesDemo.length);
  await A.clic('Crear cuenta', 0);
  const tr = await A.texto();
  prueba('el registro muestra las casillas de edad/términos y de consentimiento, y la marca BETA', /Tengo 16 años o más/.test(tr) && /Consiento que FORJA guarde mis datos/.test(tr) && /BETA/.test(tr) && (await A.js(`document.querySelector('[aria-label="Contraseña"]').placeholder`)).includes('mínimo 8'));
  await A.rellenar('Email', EMAIL);
  await A.rellenar('Contraseña', CLAVE);
  await A.clic('Crear cuenta', -1);
  await espera(2500);
  prueba('sin marcar las casillas NO se crea la cuenta', (await sql(`select count(*)::int n from auth.users`))[0].n === 0);
  await A.clic('Tengo 16 años o más y acepto los términos de uso y la política de privacidad', 0, true);
  await A.clic('Crear cuenta', -1);
  await espera(2500);
  prueba('con solo una casilla marcada tampoco', (await sql(`select count(*)::int n from auth.users`))[0].n === 0);
  await A.clic('Consiento que se guarden mis datos en la nube', 0, true);
  await A.clic('Crear cuenta', -1);
  await espera(5000);
  const anaId = (await sql(`select id from auth.users where email = $1`, [EMAIL]))[0]?.id;
  prueba('con las dos casillas, la cuenta se crea', !!anaId);
  prueba('lo que tenía el dispositivo se sube a la cuenta nueva (nube vacía)', await esperarHasta(async () => ids((await nube())?.datos?.sesiones).length === sesionesDemo.length));
  prueba('A muestra «Datos guardados en la nube»', /Datos guardados en la nube/.test(await A.texto()));

  // ============ B: segundo dispositivo con SUS propios datos ============
  console.log('B · segundo dispositivo con datos propios inicia sesión en la misma cuenta');
  await B.ir();
  await B.ponerDe('mi-gym:v1', '/vacio.json');
  const propio = await B.local();
  // Día LOCAL (como lo calcula la app con claveDia): con UTC la prueba fallaba entre las 00:00 y la 01:00 hora de España.
  const ahoraLocal = new Date();
  const hoy = `${ahoraLocal.getFullYear()}-${String(ahoraLocal.getMonth() + 1).padStart(2, '0')}-${String(ahoraLocal.getDate()).padStart(2, '0')}`;
  propio.sesiones = [{ id: 'b-propio', rutinaNombre: 'Prueba B', fecha: Date.now() - 3600_000, minutos: 40, ejercicios: [{ nombre: 'Press', series: [{ peso: 50, reps: 10 }] }] }];
  propio.comida = { [hoy]: [{ id: 'b-comida', nombre: 'Desayuno de B', proteina: 25, kcal: 350 }] };
  await B.poner('mi-gym:v1', propio);
  await B.sinBienvenida();
  await B.recargar();
  await B.rellenar('Email', EMAIL);
  await B.rellenar('Contraseña', CLAVE);
  await B.clic('Entrar', -1);
  await espera(6000);
  const bLocal = await B.local();
  prueba('B se queda con TODO: los entrenos de la cuenta (de A) y el suyo (antes la nube lo pisaba)', isDeepStrictEqual(ids(bLocal.sesiones), [...sesionesDemo, 'b-propio'].sort()), { b: ids(bLocal.sesiones).length, esperado: sesionesDemo.length + 1 });
  prueba('y su comida de hoy', (bLocal.comida?.[hoy] ?? []).some((c) => c.id === 'b-comida'));
  prueba('la nube también conserva los dos conjuntos', await esperarHasta(async () => { const c = await nube(); return ids(c?.datos?.sesiones).includes('b-propio') && sesionesDemo.every((i) => ids(c.datos.sesiones).includes(i)); }));
  prueba('el plan y el perfil de la cuenta no se han perdido ni duplicado', ids(bLocal.rutinas).length === ids(demo.rutinas).length && !!bLocal.perfil, { rutinas: ids(bLocal.rutinas).length, demo: ids(demo.rutinas).length });

  // ============ A recibe lo de B sin hacer nada ============
  console.log('A · al volver a la app recibe lo que hizo B');
  await A.avisarVueltaALaApp();
  prueba('A incorpora el entreno y la comida de B sin guardar nada', await esperarHasta(async () => { const l = await A.local(); return ids(l.sesiones).includes('b-propio') && (l.comida?.[hoy] ?? []).some((c) => c.id === 'b-comida'); }, 15000));

  // ============ Borrado + sin conexión ============
  console.log('Borrar en A mientras B está sin conexión; B añade algo; al volver, nada resucita');
  await B.sinRed(true);
  await A.pestana('Progreso');
  await A.clic('Borrar entreno Prueba B', 0, true);
  await A.clic('Borrar', -1);
  prueba('A borra el entreno de B y la nube anota el borrado (lápida)', await esperarHasta(async () => { const c = await nube(); return !ids(c?.datos?.sesiones).includes('b-propio') && !!c?.datos?.ajustes?.sync?.borrados?.['sesiones/b-propio']; }));
  await B.pestana('Comida');
  await B.rellenar('Nombre del alimento', 'Cena de B');
  await B.rellenar('Gramos de proteína', '40');
  await B.rellenar('Calorías', '600');
  await B.clic('Añadir', 0);
  await espera(1500);
  prueba('B (sin conexión) sigue teniendo el entreno borrado y su cena nueva solo en local', ids((await B.local()).sesiones).includes('b-propio') && JSON.stringify((await B.local()).comida?.[hoy]).includes('Cena de B'));
  await A.pestana('Comida');
  await A.rellenar('Nombre del alimento', 'Cena de A');
  await A.rellenar('Gramos de proteína', '35');
  await A.rellenar('Calorías', '550');
  await A.clic('Añadir', 0);
  await espera(2500);
  await B.sinRed(false);
  await B.avisarRed();
  await B.avisarVueltaALaApp();
  prueba('al volver la conexión, B recibe la cena de A y el borrado (el entreno borrado NO reaparece)', await esperarHasta(async () => { const l = await B.local(); return !ids(l.sesiones).includes('b-propio') && JSON.stringify(l.comida?.[hoy]).includes('Cena de A'); }, 20000));
  await B.recargar(); // fuerza una subida de lo de B
  prueba('la nube termina con las dos cenas y sin el entreno borrado (B no lo resucita al subir)', await esperarHasta(async () => { const c = await nube(); const t = JSON.stringify(c?.datos?.comida?.[hoy] ?? []); return t.includes('Cena de A') && t.includes('Cena de B') && !ids(c.datos.sesiones).includes('b-propio'); }, 20000));
  await A.avisarVueltaALaApp();
  prueba('y A termina con la cena de B', await esperarHasta(async () => JSON.stringify((await A.local()).comida?.[hoy] ?? []).includes('Cena de B'), 15000));
  const fa = await A.local(); const fb = await B.local(); const fn = (await nube()).datos;
  const comidasIds = (d) => (d.comida?.[hoy] ?? []).map((c) => c.id).sort();
  prueba('A, B y la nube acaban con los MISMOS entrenos y las MISMAS comidas', isDeepStrictEqual(ids(fa.sesiones), ids(fb.sesiones)) && isDeepStrictEqual(ids(fa.sesiones), ids(fn.sesiones)) && isDeepStrictEqual(comidasIds(fa), comidasIds(fb)) && isDeepStrictEqual(comidasIds(fa), comidasIds(fn)), { a: comidasIds(fa), b: comidasIds(fb), n: comidasIds(fn) });

  // ============ Opiniones ============
  console.log('Opiniones con cuenta');
  await B.pestana('Coach');
  await B.clic('Ajustes y apariencia', 0, true);
  await B.clic('💬 Ayuda y opiniones');
  await B.clic('🐞 Un error');
  await B.rellenar('Tu mensaje', 'Prueba automática: el temporizador no suena');
  const aviso = await B.texto();
  prueba('con cuenta aparece el botón Enviar activo', /Enviar/.test(aviso) && !/necesita cuenta/.test(aviso));
  await B.clic('Enviar', -1);
  await espera(2500);
  prueba('se confirma el envío', /Lo hemos recibido/.test(await B.texto()));
  const op = await sql(`select tipo, version, tecnico, datos, estado, user_id from public.beta_opiniones`);
  prueba('queda guardada con versión, datos técnicos y sin resumen de datos ni email', op.length === 1 && op[0].tipo === 'error' && op[0].version === '1.0.0-beta.1' && op[0].tecnico?.modo === 'con-cuenta' && op[0].datos === null && op[0].estado === 'nueva' && !JSON.stringify(op).includes('@'), op);
  // Segunda opinión: las estrellas de «Valorar» no viajan si se cambia de tipo, y el resumen opcional no lleva sensaciones ni dolor.
  await B.clic('Cerrar', 0);
  await B.clic('💬 Ayuda y opiniones');
  await B.clic('⭐ Valorar FORJA');
  await B.clic('4 estrellas', 0, true);
  await B.clic('💡 Una sugerencia');
  await B.rellenar('Tu mensaje', 'Prueba automática: me gustaría ver más gráficas');
  await B.clic('Incluir un resumen de mis datos', 0, true);
  const previa = await B.texto();
  prueba('con el resumen marcado se ve en lenguaje claro y sin JSON', /Entrenos registrados: \d+/.test(previa) && !/[{}]|"version"/.test(previa.slice(previa.toLowerCase().indexOf('qué se envía'))), previa.slice(previa.toLowerCase().indexOf('qué se envía'), previa.toLowerCase().indexOf('qué se envía') + 200));
  await B.clic('Enviar', -1);
  await espera(2500);
  const op2 = await sql(`select tipo, estrellas, datos, tecnico from public.beta_opiniones order by creado`);
  prueba('la sugerencia se guarda SIN estrellas (eran de «Valorar») y con el resumen opcional', op2.length === 2 && op2[1].tipo === 'sugerencia' && op2[1].estrellas === null && op2[1].datos?.entrenos >= 0 && typeof op2[1].datos?.diasPorSemana !== 'undefined', op2[1]);
  prueba('el resumen enviado no contiene sensaciones ni dolor', !JSON.stringify(op2[1].datos ?? {}).match(/sensacion|dolor/i), op2[1].datos);
  prueba('lo técnico enviado son solo versión, modo, pantalla, sistema, idioma e instalada', isDeepStrictEqual(Object.keys(op2[1].tecnico).sort(), ['idioma', 'instalada', 'modo', 'pantalla', 'sistema', 'version']), op2[1].tecnico);

  // ============ Versión nueva ============
  if (versionJson) {
    console.log('Aviso de versión nueva');
    writeFileSync(versionJson, JSON.stringify({ version: '1.0.0-beta.2', minima: '1.0.0-beta.1' }));
    await A.avisarVueltaALaApp();
    await espera(1500);
    prueba('con una versión más nueva publicada aparece «Hay una versión nueva» con el botón Actualizar', /Hay una versión nueva de FORJA BETA/.test(await A.texto()) && (await A.visible('Actualizar')));
    writeFileSync(versionJson, JSON.stringify({ version: '1.0.0-beta.3', minima: '1.0.0-beta.2' }));
    await A.avisarVueltaALaApp();
    await espera(1500);
    prueba('si la versión mínima es mayor, avisa de que ésta ya no es compatible', /ya no es compatible/.test(await A.texto()));
    writeFileSync(versionJson, versionOriginal);
  }

  // ============ Datos de una versión más nueva en la nube ============
  console.log('Datos de una versión más nueva en la nube: no se pisa nada');
  const antesFutura = await nube();
  await sql(`update public.datos_usuario set datos = jsonb_set(datos, '{ajustes,sync,v}', '99'::jsonb, true), actualizado = actualizado + interval '1 second'`);
  await A.pestana('Coach');
  await A.avisarVueltaALaApp();
  prueba('A avisa de que la cuenta tiene datos de una versión más nueva y deja de sincronizar', await esperarHasta(async () => /versión más nueva de FORJA/.test(await A.texto()), 15000));
  const marca = (await nube()).actualizado;
  await A.pestana('Comida');
  await A.rellenar('Nombre del alimento', 'Merienda de A');
  await A.rellenar('Gramos de proteína', '20');
  await A.rellenar('Calorías', '300');
  await A.clic('Añadir', 0);
  await espera(4000);
  const despuesFutura = await nube();
  prueba('un cambio de A NO se sube mientras la nube sea de una versión más nueva (la nube queda intacta)', despuesFutura.actualizado === marca && !JSON.stringify(despuesFutura.datos).includes('Merienda de A'), { marca, ahora: despuesFutura.actualizado });
  prueba('pero A sigue funcionando en local con lo suyo', JSON.stringify((await A.local()).comida?.[hoy] ?? []).includes('Merienda de A'));
  await sql(`update public.datos_usuario set datos = jsonb_set(datos, '{ajustes,sync,v}', '1'::jsonb, true)`);
  void antesFutura;

  prueba('sin errores de JavaScript en ningún dispositivo', A.errores.length + B.errores.length === 0, [...A.errores, ...B.errores].slice(0, 3));
} catch (e) {
  fallos++;
  console.log('  ✗ la prueba se interrumpió:', e.message);
} finally {
  if (versionJson && versionOriginal) writeFileSync(versionJson, versionOriginal);
  A.cerrar(); B.cerrar();
}
console.log(`\n${ok} comprobaciones correctas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
