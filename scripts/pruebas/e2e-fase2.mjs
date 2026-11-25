// Prueba LOCAL de extremo a extremo de la Fase 2: la app web real (compilada) en Chrome contra el Supabase
// SIMULADO del proyecto (supabase/pruebas/servidor-simulado.mjs: Postgres en memoria con las migraciones y RLS
// reales). NO usa Supabase real ni ninguna cuenta real: todo ocurre en 127.0.0.1 con cuentas inventadas.
//
// Cada «dispositivo» es una instancia de Chrome con su propio perfil (su propio almacenamiento local).
// Requisitos (ver LEEME de pruebas): 1) servidor simulado en :54321, 2) web compilada con
//   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=<cualquier clave de prueba>
// y servida en :5189 (carpeta con /forja/, demo.json y vacio.json). Uso:
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/e2e-fase2.mjs <carpeta-de-salida-de-capturas>
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';

import { datosIniciales } from '../../src/datos.ts';
import { calcularXp } from '../../src/xp.ts';

const API = 'http://127.0.0.1:54321';
const WEB = 'http://127.0.0.1:5189/forja/';
const salida = process.argv[2] ?? '.';
mkdirSync(salida, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, fallos = 0;
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  ✓', nombre); } else { fallos++; console.log('  ✗', nombre, detalle === '' ? '' : `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`); }
};

// ---------- Servidor simulado ----------
async function http(ruta, cuerpo, token, metodo) {
  const r = await fetch(API + ruta, { method: metodo ?? (cuerpo !== undefined ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(ruta.startsWith('/__prueba') ? { 'x-prueba': 'si' } : {}) }, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
  const t = await r.text();
  return [r.status, t ? JSON.parse(t) : null];
}
const sql = async (q, p = []) => (await http('/__prueba/sql', { sql: q, params: p }))[1];

// ---------- Dispositivo (Chrome con perfil propio) ----------
let siguientePuerto = 9400;
async function dispositivo(nombre) {
  const puerto = siguientePuerto++;
  const perfil = `${salida}/perfil-${nombre}`;
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let objetivo;
  for (let i = 0; i < 60 && !objetivo; i++) {
    try { objetivo = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); } catch { /* aún arrancando */ }
    if (!objetivo) await espera(250);
  }
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
    ir: async (url = WEB) => { await cmd('Page.navigate', { url }); await espera(2500); },
    recargar: async (ms = 5500) => { await cmd('Page.reload'); await espera(ms); },
    texto: () => js('document.body.innerText'),
    sinBienvenida: () => js(`localStorage.setItem('mi-gym:beta-v1', JSON.stringify({ v: 1, conDatos: true, visto: true }))`),
    poner: (clave, url) => js(`(async()=>{localStorage.setItem(${JSON.stringify(clave)}, await fetch(${JSON.stringify(url)}).then(r=>r.text()));})()`),
    leerLocal: (clave) => js(`localStorage.getItem(${JSON.stringify(clave)})`),
    // Clic real con el ratón en el centro del elemento cuyo texto es exactamente `t` (nº `i`, -1 = el último).
    clic: async (t, i = 0, aria = false) => {
      const sel = aria ? `[...document.querySelectorAll('[aria-label]')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(t)})` : `[...document.querySelectorAll('div,span,a')].filter(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)})`;
      const c = await js(`(()=>{const l=${sel};const e=l.at(${i});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!c) throw new Error(`no encuentro el texto «${t}» en ${nombre}`);
      for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
      await espera(900);
    },
    rellenar: async (etiqueta, valor) => {
      await js(`(()=>{const e=document.querySelector('[aria-label=${JSON.stringify(etiqueta)}]');e.focus();e.select&&e.select()})()`);
      await cmd('Input.insertText', { text: valor });
      await espera(200);
    },
    foto: async (nombreFoto) => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${salida}/${nombreFoto}.png`, Buffer.from(r.result.data, 'base64')); },
    xp: async () => { const m = (await js('document.body.innerText')).match(/([\d.]+) XP · faltan/); return m ? Number(m[1].replace(/\./g, '')) : null; },
    cerrar: () => { try { ws.close(); } catch { /* ya cerrado */ } chrome.kill(); },
  };
  return d;
}

const EMAIL = 'ana@prueba.local';
const CLAVE = 'secreto-de-prueba-1';
const registrar = async (d, email) => {
  await d.clic('Crear cuenta', 0);
  await d.rellenar('Email', email);
  await d.rellenar('Contraseña', CLAVE);
  await d.clic('Tengo 16 años o más y acepto los términos de uso y la política de privacidad', 0, true); // casillas de la beta
  await d.clic('Consiento que se guarden mis datos en la nube', 0, true);
  await d.clic('Crear cuenta', -1);
  await espera(4500);
};
const entrar = async (d, email) => {
  await d.rellenar('Email', email);
  await d.rellenar('Contraseña', CLAVE);
  await d.clic('Entrar', -1);
  await espera(5000);
};
const libroNube = async (id) => (await sql(`select datos #> '{ajustes,xp}' as xp from public.datos_usuario where user_id = $1`, [id]))[0]?.xp ?? null;
const lunesSql = async (i) => (await sql(`select (date_trunc('week', current_date) - interval '${7 * i} days')::date::text d`))[0].d;

const A = await dispositivo('A');
const B = await dispositivo('B');
const C = await dispositivo('C');
try {
  // ============ Dispositivo A: registro con datos del móvil ============
  console.log('A · registro con los datos que ya tenía el móvil');
  await A.ir();
  await A.poner('mi-gym:v1', '/demo.json');
  await A.sinBienvenida();
  await A.recargar();
  const demo = await (await fetch('http://127.0.0.1:5189/demo.json')).json();
  const xpLocal = calcularXp({ ...datosIniciales(), ...demo }).xp; // lo que la lógica calcula con esos mismos datos
  prueba('(referencia) los datos de ejemplo valen XP', xpLocal > 0, xpLocal);
  await registrar(A, EMAIL);
  await espera(3000);
  const anaId = (await sql(`select id from auth.users where email = $1`, [EMAIL]))[0]?.id;
  prueba('la cuenta se creó en el servidor simulado', !!anaId);
  const libro0 = await libroNube(anaId);
  prueba('el libro de semanas se sube a la nube con la cuenta', Object.keys(libro0?.semanas ?? {}).length >= 5, libro0);
  const xp0 = await A.xp();
  prueba('al registrarse el XP de la app es el que calcula la lógica con esos datos (no se pierde ni se duplica nada)', xp0 === xpLocal, { xpLocal, xp0 });
  prueba('sin retos todavía: la nube no tiene retos en el libro', !libro0?.retos);

  // ============ Retos en el servidor (hechos reales en el servidor simulado) ============
  console.log('Retos completados en el servidor → XP');
  const l2 = await lunesSql(2), l4 = await lunesSql(4);
  for (const [lunes, cantidad] of [[l2, 3], [l4, 1]]) {
    await sql(`insert into public.dias_proteina (user_id, dia) values ($1, $2::date) on conflict do nothing`, [anaId, lunes]);
    for (let i = 0; i < cantidad; i++) {
      const r = (await sql(`insert into public.retos (creador, nombre, modo, dias, objetivo, meta, inicio) values ($1, $2, 'individual', 7, 'proteina', 1, $3::date) returning id`, [anaId, `Reto ${lunes}-${i}`, lunes]))[0].id;
      await sql(`insert into public.participantes_reto (reto, usuario, estado) values ($1, $2, 'aceptado')`, [r, anaId]);
    }
  }
  const [, sesionA] = await http('/auth/v1/token?grant_type=password', { email: EMAIL, password: CLAVE });
  const [, logros] = await http('/rest/v1/rpc/mis_logros', {}, sesionA.access_token);
  prueba('el servidor cuenta los 4 retos (en una semana hay 3 y puntúan solo 2)', logros.retos_completados === 4, logros.retos_completados);
  await A.recargar(5000); // al abrir la app con sesión se leen los retos
  const xp1 = await A.xp();
  prueba('los retos suman XP: 15 + 30 (tope de 2 por semana) = 45', xp1 - xp0 === 45, { xp0, xp1 });
  const libro1 = await libroNube(anaId);
  prueba('el libro guarda los retos como máximos por semana', libro1?.retos?.[l2] === 2 && libro1?.retos?.[l4] === 1, libro1?.retos);
  for (let i = 0; i < 3; i++) await A.recargar(3500);
  prueba('abrir la app varias veces no vuelve a sumar los retos', (await A.xp()) === xp1, await A.xp());
  const antes = await A.texto();
  await A.clic('Ver perfil de atleta ›');
  await espera(1200);
  const perfilTxt = await A.texto();
  prueba('el perfil muestra cuánto XP viene de retos y de dónde sale', /Incluye 45 XP de retos completados/.test(perfilTxt) && /mismas reglas de puntos que ARENA/.test(perfilTxt));
  await A.foto('e2e-A-perfil-con-retos');
  prueba('la tarjeta de nivel del Coach y la del perfil dan el mismo XP', new RegExp(`${String(xp1).replace(/\B(?=(\d{3})+(?!\d))/g, '\\.')} XP`).test(perfilTxt) && /XP/.test(antes));
  await A.ir(); // cierra el perfil

  // ============ Cerrar sesión y volver a entrar ============
  console.log('Cerrar sesión y volver a entrar');
  await A.clic('Cerrar sesión');
  await espera(3500);
  const trasSalir = await A.texto();
  prueba('al cerrar sesión se pide entrar de nuevo', /Entrar/.test(trasSalir) && !/Nivel FORJA/.test(trasSalir));
  prueba('el progreso sigue en la nube tras cerrar sesión', !!(await libroNube(anaId))?.semanas && (await libroNube(anaId))?.retos?.[l2] === 2);
  await entrar(A, EMAIL);
  prueba('al volver a entrar el XP es el mismo que antes', (await A.xp()) === xp1, await A.xp());

  // ============ Dispositivo B: segundo móvil limpio ============
  console.log('B · segundo dispositivo');
  await B.ir();
  await B.sinBienvenida();
  await entrar(B, EMAIL);
  const xpB = await B.xp();
  prueba('el segundo móvil ve el mismo XP y nivel', xpB === xp1, { xpB, xp1 });
  await B.recargar(5000);
  await B.recargar(4000);
  prueba('y no lo duplica tras abrir la app varias veces', (await B.xp()) === xp1, await B.xp());
  // Coherencia entre pantallas: Coach, Progreso y Arena (Logros) muestran el mismo XP.
  await B.clic('Progreso', -1);
  prueba('Progreso muestra el mismo XP que Coach', (await B.xp()) === xp1, await B.xp());
  await B.clic('Arena', -1);
  await B.clic('🏅 Logros');
  await espera(1500);
  prueba('Arena (Logros) muestra el mismo XP', (await B.xp()) === xp1, await B.xp());
  await B.foto('e2e-B-arena-logros');
  await B.clic('Coach', -1);
  prueba('los dos dispositivos muestran el mismo nivel', (await B.texto()).match(/(Chispa|Brasa|Llama|Acero) · Nivel \d+/)?.[0] === (await A.texto()).match(/(Chispa|Brasa|Llama|Acero) · Nivel \d+/)?.[0]);

  // ============ Versión antigua que pisa la nube ============
  console.log('Una versión antigua de la app borra el libro de la nube');
  await sql(`update public.datos_usuario set datos = datos #- '{ajustes,xp}' where user_id = $1`, [anaId]);
  prueba('(simulación) la nube se queda sin libro', (await libroNube(anaId)) === null);
  await A.clic('Omitir hoy', 0).catch(() => A.clic('Deshacer', 0)); // un cambio cualquiera → el móvil sube sus datos
  await espera(4500);
  const libro2 = await libroNube(anaId);
  prueba('al sincronizar, el móvil restaura el libro y los retos sin perder nada', libro2?.retos?.[l2] === 2 && Object.keys(libro2?.semanas ?? {}).length >= 5, libro2);
  prueba('el XP del móvil no cambia con eso', (await A.xp()) === xp1, await A.xp());

  // ============ Otro dispositivo con progreso nuevo ============
  console.log('Progreso nuevo de otro dispositivo llega al sincronizar');
  const lejana = await lunesSql(40);
  const conExtra = { ...libro2, semanas: { ...libro2.semanas, [lejana]: [80, 4, 4] } };
  // Otro dispositivo real siempre cambia también `actualizado` (así lo hace subirDatos): la simulación hace lo mismo.
  await sql(`update public.datos_usuario set datos = jsonb_set(datos, '{ajustes,xp}', $2::jsonb), actualizado = greatest(now(), actualizado) + interval '2 seconds' where user_id = $1`, [anaId, JSON.stringify(conExtra)]);
  await A.clic('Deshacer', 0).catch(() => A.clic('Omitir hoy', 0));
  await espera(4500);
  const libro3 = await libroNube(anaId);
  prueba('la nube conserva la semana que añadió el otro dispositivo (no se pisa)', libro3?.semanas?.[lejana]?.[0] === 80, libro3?.semanas?.[lejana]);
  prueba('este móvil incorpora esa semana: +80 XP', (await A.xp()) === xp1 + 80, { xp: await A.xp(), esperado: xp1 + 80 });
  await A.clic('Omitir hoy', 0).catch(() => A.clic('Deshacer', 0));
  await espera(4000);
  prueba('seguir sincronizando no cambia nada más', (await A.xp()) === xp1 + 80, await A.xp());

  // ============ Usuario nuevo ============
  console.log('C · usuario nuevo');
  await C.ir();
  await C.poner('mi-gym:v1', '/vacio.json');
  await C.sinBienvenida();
  await C.recargar();
  await registrar(C, 'nueva@prueba.local');
  const t = await C.texto();
  prueba('un usuario nuevo empieza en Chispa nivel 1', /Chispa · Nivel 1/.test(t), t.slice(0, 200));
  prueba('sin entrenos no hay XP todavía y se le explica cómo empezar', /Registra tu primer entreno/.test(t));
  const idC = (await sql(`select id from auth.users where email = 'nueva@prueba.local'`))[0].id;
  const libroC = await libroNube(idC);
  prueba('la nube no recibe XP ni retos inventados', !libroC || (Object.keys(libroC.semanas ?? {}).length === 0 && !libroC.retos), libroC);

  console.log('Errores de JavaScript');
  prueba('sin errores en el dispositivo A', A.errores.length === 0, A.errores);
  prueba('sin errores en el dispositivo B', B.errores.length === 0, B.errores);
  prueba('sin errores en el dispositivo C', C.errores.length === 0, C.errores);
} catch (e) {
  fallos++;
  console.log('  ✗ la prueba se interrumpió:', e.message);
} finally {
  A.cerrar(); B.cerrar(); C.cerrar();
}
console.log(`\n${ok} pruebas correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
