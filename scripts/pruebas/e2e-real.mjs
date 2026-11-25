// Prueba de extremo a extremo REAL de la Fase 2: la app web compilada contra Supabase `forja-dev`, SOLO con las tres
// cuentas de prueba, en Chrome con un perfil distinto por «dispositivo». No usa claves de administración.
// Credenciales por variables de entorno (nunca se imprimen ni se guardan; no se hacen capturas de la pantalla de entrada):
//   FORJA_URL, FORJA_KEY (pública), FORJA_E1, FORJA_E3, FORJA_CLAVE
// Requisitos: web compilada con EXPO_PUBLIC_SUPABASE_URL/ANON_KEY de forja-dev y servida en :5190 (con demo.json y vacio.json).
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/e2e-real.mjs <carpeta-de-salida>
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

import { claveDia } from '../../src/datos.ts';
import { datosDemo } from '../../src/demo.ts';
import { fusionarLibros, mismoContenido, normalizarLibro } from '../../src/sincronizacion.ts';
import { subirDatos } from '../../src/subida.ts';
import { calcularXp, lunesDeSemana } from '../../src/xp.ts';

const URL = process.env.FORJA_URL;
const KEY = process.env.FORJA_KEY;
const FORJA_E1 = process.env.FORJA_E1;
const FORJA_E3 = process.env.FORJA_E3;
const FORJA_CLAVE = process.env.FORJA_CLAVE;
if (!/^https:\/\/jfjvcndrssbbbfazqvbs\.supabase\.co$/.test(URL ?? '') || !KEY || !FORJA_E1 || !FORJA_E3 || !FORJA_CLAVE) throw new Error('entorno no válido');
if (/service_role|sb_secret/.test(KEY)) throw new Error('clave de administración no permitida');
const WEB = 'http://127.0.0.1:5190/forja/';
const salida = process.argv[2] ?? '.';
mkdirSync(salida, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIA = 86400000;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, fallos = 0;
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  ✓', nombre); } else { fallos++; console.log('  ✗', nombre, detalle === '' ? '' : `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`); }
};

// ---------- Cliente de API de cada cuenta (para preparar y comprobar, con su propia sesión) ----------
async function cuenta(email) {
  const c = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: FORJA_CLAVE });
  if (error) throw new Error('no se pudo iniciar sesión por API');
  return { c, id: data.user.id };
}
const leerXp = async (u) => (await u.c.from('datos_usuario').select('xp:datos->ajustes->xp').eq('user_id', u.id).maybeSingle()).data;
const leerTodo = async (u) => (await u.c.from('datos_usuario').select('datos').eq('user_id', u.id).maybeSingle()).data?.datos ?? null;
const rpc = async (u, f, a) => { const { data, error } = await u.c.rpc(f, a); if (error) throw new Error(`${f}: ${error.message}`); return data; };

// ---------- Dispositivo ----------
let puerto = 9500;
async function dispositivo(nombre) {
  const p = puerto++;
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${p}`, `--user-data-dir=${salida}/perfil-${nombre}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let objetivo;
  for (let i = 0; i < 60 && !objetivo; i++) { try { objetivo = (await (await fetch(`http://127.0.0.1:${p}/json`)).json()).find((t) => t.type === 'page'); } catch { /* arrancando */ } if (!objetivo) await espera(250); }
  const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const pend = new Map(); const errores = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  };
  const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 400, height: 900, deviceScaleFactor: 1, mobile: true });
  const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const d = {
    nombre, errores,
    ir: async (url = WEB) => { await cmd('Page.navigate', { url }); await espera(3000); },
    recargar: async (ms = 4500) => { await cmd('Page.reload'); await espera(ms); },
    texto: () => js('document.body.innerText'),
    poner: (clave, url) => js(`(async()=>{localStorage.setItem(${JSON.stringify(clave)}, await fetch(${JSON.stringify(url)}).then(r=>r.text()));})()`),
    clic: async (t, i = 0) => {
      const c = await js(`(()=>{const l=[...document.querySelectorAll('div,span,a')].filter(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)});const e=l.at(${i});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!c) throw new Error(`no encuentro el texto «${t}» en ${nombre}`);
      for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
      await espera(900);
    },
    rellenar: async (etiqueta, valor) => { await js(`(()=>{const e=document.querySelector('[aria-label=${JSON.stringify(etiqueta)}]');e.focus();e.select&&e.select()})()`); await cmd('Input.insertText', { text: valor }); await espera(200); },
    foto: async (f) => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${salida}/${f}.png`, Buffer.from(r.result.data, 'base64')); },
    xp: async () => { const m = (await js('document.body.innerText')).match(/([\d.]+) XP · faltan/); return m ? Number(m[1].replace(/\./g, '')) : null; },
    nivel: async () => (await js('document.body.innerText')).match(/(Chispa|Brasa|Llama|Acero) · Nivel \d+/)?.[0] ?? null,
    cerrar: () => { try { ws.close(); } catch { /* ya cerrado */ } chrome.kill(); },
  };
  return d;
}
const entrar = async (d, email) => {
  await d.rellenar('Email', email);
  await d.rellenar('Contraseña', FORJA_CLAVE);
  await d.clic('Entrar', -1);
  await espera(6000);
};

const u1 = await cuenta(FORJA_E1);
const u3 = await cuenta(FORJA_E3);
const A = await dispositivo('A');
const B = await dispositivo('B');
const C = await dispositivo('C');
try {
  // ============ Cuenta 1: cuenta existente con datos de una versión anterior (libro de la Fase 1) ============
  console.log('Cuenta 1 · cuenta existente con datos anteriores');
  const demo = datosDemo();
  const e0 = calcularXp(demo);
  const libroV1 = { v: 1, semanas: e0.libro.semanas }; // como lo guardaba la Fase 1: sin retos ni picos
  const datosViejos = { ...demo, ajustes: { xp: libroV1 } };
  delete datosViejos.misiones;
  const subida = await subirDatos(u1.c, u1.id, datosViejos);
  prueba('se deja en la nube la cuenta «con datos de la versión anterior» (libro v1)', !subida.error);
  const esperado = calcularXp(datosViejos).xp;
  console.log(`   XP esperado por la lógica con esos datos: ${esperado}`);

  // ============ Dispositivo A: iniciar sesión y recuperar ============
  console.log('A · inicio de sesión y recuperación de datos');
  await A.ir();
  await entrar(A, FORJA_E1);
  prueba('tras iniciar sesión la app muestra el XP recuperado de la nube (sin duplicar ni perder)', (await A.xp()) === esperado, { visto: await A.xp(), esperado });
  const nivelA = await A.nivel();
  prueba('y el nivel', !!nivelA, nivelA);
  await espera(4000);
  const xpNube = (await leerXp(u1))?.xp;
  prueba('el libro v1 antiguo se conserva y se guarda ya como v2 sin perder semanas', xpNube?.v === 2 && Object.keys(xpNube.semanas).length >= Object.keys(libroV1.semanas).length && Object.entries(libroV1.semanas).every(([k, v]) => xpNube.semanas[k]?.[0] >= v[0]), xpNube && { v: xpNube.v, semanas: Object.keys(xpNube.semanas).length });
  prueba('lo mismo con la consulta real `datos->ajustes->xp` de la app', normalizarLibro(xpNube).semanas && Object.keys(normalizarLibro(xpNube).semanas).length > 0);

  // ARENA real: los hechos de los últimos 7 días llegan al servidor
  const logros = await rpc(u1, 'mis_logros');
  const actual = logros.semanas.at(-1);
  const est = calcularXp(datosViejos);
  console.log(`   ARENA (servidor) semana en curso: ${actual.puntos} pts; el móvil calcula ${est.semanaActual} pts esta semana`);
  prueba('el servidor recibió los entrenos de los últimos 7 días que envía la app', logros.entrenos >= 1, logros.entrenos);
  prueba('los puntos de ARENA de esta semana no superan a los del móvil (el servidor solo recibe hechos de hoy/ayer)', actual.puntos <= est.semanaActual, { arena: actual.puntos, movil: est.semanaActual });

  // ============ Coherencia entre pantallas ============
  console.log('Coherencia: Coach, Progreso, Arena y perfil');
  const xpCoach = await A.xp();
  await A.clic('Progreso', -1);
  prueba('Progreso muestra el mismo XP que Coach', (await A.xp()) === xpCoach, await A.xp());
  await A.clic('Arena', -1);
  await A.clic('🏅 Logros');
  await espera(1500);
  prueba('Arena (Logros) muestra el mismo XP', (await A.xp()) === xpCoach, await A.xp());
  await A.clic('Coach', -1);
  await A.clic('Ver perfil de atleta ›');
  await espera(1200);
  prueba('el perfil de atleta muestra el mismo XP', new RegExp(`${String(xpCoach).replace(/\B(?=(\d{3})+(?!\d))/g, '\\.')} XP`).test(await A.texto()));
  await A.foto('real-A-perfil');
  await A.ir();

  // ============ Reto real en curso ============
  console.log('Reto real en curso (no puede estar completado)');
  const nombreReto = 'Reto UI fase 2';
  const ayer = claveDia(Date.now() - DIA);
  if (!(await rpc(u1, 'mis_retos')).find((r) => r.nombre === nombreReto))
    await rpc(u1, 'crear_reto', { p_nombre: nombreReto, p_modo: 'individual', p_dias: 7, p_objetivo: 'entrenos', p_meta: 2, p_invitados: [], p_inicio: ayer });
  const retoCreado = (await rpc(u1, 'mis_retos')).find((r) => r.nombre === nombreReto);
  prueba('el reto existe en el servidor y sigue en curso', !!retoCreado && !retoCreado.terminado, retoCreado && { terminado: retoCreado.terminado, dias_restantes: retoCreado.dias_restantes });
  console.log(`   se completará el ${new Date(Date.parse(retoCreado.inicio + 'T12:00:00Z') + 7 * DIA).toISOString().slice(0, 10)} (UTC)`);
  await A.recargar(6000);
  prueba('un reto en curso no suma XP', (await A.xp()) === esperado, await A.xp());
  const l1 = await rpc(u1, 'mis_logros');
  prueba('mis_logros: retos_completados = 0 y ninguna semana con retos', l1.retos_completados === 0 && l1.semanas.every((s) => s.retos === 0));
  await A.clic('Arena', -1);
  await A.clic('🎯 Retos');
  await espera(2000);
  prueba('Arena → Retos muestra el reto real con su progreso', (await A.texto()).includes(nombreReto));
  await A.clic('Coach', -1);

  // ============ Cerrar sesión y volver a entrar ============
  console.log('Cerrar sesión y volver a entrar');
  const antesSalir = await A.xp();
  await A.clic('Cerrar sesión');
  await espera(4000);
  const tras = await A.texto();
  prueba('al cerrar sesión se pide entrar y no queda el nivel en pantalla', /Entrar/.test(tras) && !/Nivel FORJA/.test(tras));
  prueba('el progreso sigue en la nube', mismoContenido(normalizarLibro((await leerXp(u1))?.xp).semanas, normalizarLibro(xpNube).semanas));
  await entrar(A, FORJA_E1);
  prueba('al volver a entrar el XP es exactamente el mismo', (await A.xp()) === antesSalir, { visto: await A.xp(), antesSalir });

  // ============ Dispositivo B: segunda sesión independiente ============
  console.log('B · segunda sesión independiente');
  await B.ir();
  await entrar(B, FORJA_E1);
  prueba('la segunda sesión ve el mismo XP y nivel', (await B.xp()) === antesSalir && (await B.nivel()) === nivelA, { b: await B.xp(), a: antesSalir });
  await B.recargar(5000);
  await B.recargar(5000);
  prueba('y no se duplica tras abrir la app varias veces', (await B.xp()) === antesSalir, await B.xp());

  // ============ Los dos guardan a la vez ============
  console.log('A y B guardando a la vez');
  const subidasAntes = (await u1.c.from('datos_usuario').select('actualizado').eq('user_id', u1.id).maybeSingle()).data.actualizado;
  await Promise.all([A.clic('Omitir hoy', 0), B.clic('Omitir hoy', 0)]);
  await espera(6000);
  prueba('los dos guardaron sin errores de JavaScript', A.errores.length === 0 && B.errores.length === 0, [...A.errores, ...B.errores]);
  const subidasDespues = (await u1.c.from('datos_usuario').select('actualizado').eq('user_id', u1.id).maybeSingle()).data.actualizado;
  prueba('la nube se actualizó', subidasDespues !== subidasAntes);
  prueba('y el XP de los dos sigue igual', (await A.xp()) === antesSalir && (await B.xp()) === antesSalir, { a: await A.xp(), b: await B.xp() });

  // ============ Progreso de «otro dispositivo» ============
  console.log('Progreso nuevo de otro dispositivo llega a las dos sesiones');
  const nube0 = await leerTodo(u1);
  const lejana = claveDia(lunesDeSemana(60));
  const conExtra = { ...nube0, ajustes: { ...nube0.ajustes, xp: fusionarLibros(nube0.ajustes?.xp, { v: 2, semanas: { [lejana]: [80, 4, 4] } }) } };
  // La escritura de «otro dispositivo» (solo en la cuenta 1) con una semana más
  const r = await subirDatos(u1.c, u1.id, conExtra);
  prueba('(otro dispositivo) guarda una semana nueva en la nube', !r.error && (await leerXp(u1))?.xp?.semanas?.[lejana]?.[0] === 80);
  await A.clic('Deshacer', 0);
  await espera(6000);
  prueba('la sesión A incorpora esa semana al sincronizar: +80 XP', (await A.xp()) === antesSalir + 80, { a: await A.xp(), esperado: antesSalir + 80 });
  await B.clic('Deshacer', 0);
  await espera(6000);
  prueba('la sesión B también: +80 XP (los mismos, sin duplicar)', (await B.xp()) === antesSalir + 80, { b: await B.xp() });
  prueba('en la nube sigue estando la semana y el libro es coherente', (await leerXp(u1))?.xp?.semanas?.[lejana]?.[0] === 80);
  for (let i = 0; i < 2; i++) { await A.clic('Omitir hoy', 0); await espera(3500); await A.clic('Deshacer', 0); await espera(3500); }
  prueba('sincronizar varias veces seguidas no cambia el XP', (await A.xp()) === antesSalir + 80, await A.xp());
  const xpBase = antesSalir + 80;

  // ============ Versión antigua que pisa la nube ============
  console.log('Una versión antigua pisa la nube y se recupera');
  const viejo = JSON.parse(JSON.stringify(await leerTodo(u1)));
  delete viejo.ajustes; delete viejo.misiones;
  await u1.c.from('datos_usuario').upsert({ user_id: u1.id, datos: viejo, actualizado: new Date().toISOString() }, { onConflict: 'user_id' }); // lo que haría una versión antigua
  prueba('(simulación) la nube se queda sin libro de XP', (await leerXp(u1))?.xp === null);
  await A.clic('Omitir hoy', 0);
  await espera(6000);
  const restaurado = (await leerXp(u1))?.xp;
  prueba('la app nueva restaura el libro completo en la nube: nada se pierde de forma permanente', Object.keys(normalizarLibro(restaurado).semanas).length >= 7 && restaurado.semanas[lejana]?.[0] === 80, restaurado && Object.keys(restaurado.semanas).length);
  prueba('y el XP de A no cambió', (await A.xp()) === xpBase, await A.xp());
  await B.recargar(6000);
  prueba('B (sesión con libro propio) tampoco pierde nada', (await B.xp()) === xpBase, await B.xp());

  // ============ Cuenta 3: usuario nuevo ============
  console.log('Cuenta 3 · usuario nuevo');
  await C.ir();
  await C.poner('mi-gym:v1', '/vacio.json');
  await C.recargar();
  prueba('(preparación) la cuenta 3 no tenía datos en la nube', (await leerTodo(u3)) === null);
  await entrar(C, FORJA_E3);
  const tC = await C.texto();
  prueba('un usuario nuevo empieza en Chispa nivel 1', /Chispa · Nivel 1/.test(tC), tC.slice(0, 120));
  prueba('sin entrenos todavía no hay XP y se le explica cómo empezar', /Registra tu primer entreno/.test(tC));
  await espera(3000);
  const libroC = (await leerXp(u3))?.xp;
  prueba('su primera subida a la nube (inserción real) crea la fila sin libro ni retos inventados', (await leerTodo(u3)) !== null && (!libroC || (Object.keys(libroC.semanas ?? {}).length === 0 && !libroC.retos)), libroC);
  const lC = await rpc(u3, 'mis_logros');
  prueba('mis_logros de la cuenta nueva: 0 puntos y 0 retos', lC.puntos === 0 && lC.retos_completados === 0);
  await C.recargar(5000);
  prueba('al recargar sigue igual (sin duplicar nada)', /Chispa · Nivel 1/.test(await C.texto()));

  console.log('Errores de JavaScript');
  prueba('sin errores de JavaScript en ningún dispositivo', A.errores.length + B.errores.length + C.errores.length === 0, [...A.errores, ...B.errores, ...C.errores]);
  console.log(`\nXP final de la cuenta 1 tras las pruebas: ${xpBase} (incluye +80 de la semana de prueba inyectada)`);
} catch (e) {
  fallos++;
  console.log('  ✗ la prueba se interrumpió:', e.message);
} finally {
  A.cerrar(); B.cerrar(); C.cerrar();
}
console.log(`\n${ok} pruebas correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
