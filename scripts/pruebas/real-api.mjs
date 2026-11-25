// Pruebas REALES de API de la Fase 2 contra Supabase `forja-dev`, SOLO con las tres cuentas de prueba.
// No usa claves de administración: únicamente la clave pública (publishable) y la sesión de cada cuenta.
// Las credenciales llegan por variables de entorno y NUNCA se imprimen ni se guardan:
//   FORJA_URL, FORJA_KEY (pública), FORJA_E1, FORJA_E2, FORJA_E3 (correos), FORJA_CLAVE
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/real-api.mjs
// Escribe solo en las filas de esas cuentas. No borra nada.
import { createClient } from '@supabase/supabase-js';

import { claveDia, datosIniciales } from '../../src/datos.ts';
import { datosDemo } from '../../src/demo.ts';
import { nutricion } from '../../src/reglas.ts';
import { aplicarRetosServidor, fusionarLibros, mismoContenido, normalizarLibro, prepararSubida } from '../../src/sincronizacion.ts';
import { subirDatos } from '../../src/subida.ts';
import { calcularXp, lunesDeSemana } from '../../src/xp.ts';

const URL = process.env.FORJA_URL;
const KEY = process.env.FORJA_KEY;
const FORJA_E1 = process.env.FORJA_E1;
const FORJA_E2 = process.env.FORJA_E2;
const FORJA_E3 = process.env.FORJA_E3;
const FORJA_CLAVE = process.env.FORJA_CLAVE;
if (!URL || !KEY || !FORJA_E1 || !FORJA_E2 || !FORJA_E3 || !FORJA_CLAVE) throw new Error('faltan variables de entorno');
if (!/^https:\/\/jfjvcndrssbbbfazqvbs\.supabase\.co$/.test(URL)) throw new Error('solo se permite forja-dev');
if (/service_role|sb_secret/.test(KEY)) throw new Error('clave de administración no permitida');

const DIA = 86400000;
let ok = 0, fallos = 0;
const medidas = {};
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  ✓', nombre); } else { fallos++; console.log('  ✗', nombre, detalle === '' ? '' : `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`); }
};
const ms = async (f) => { const t = performance.now(); const r = await f(); return [r, Math.round(performance.now() - t)]; };
const pct = (v, p) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor((v.length * p) / 100))];
const copia = (x) => JSON.parse(JSON.stringify(x));

const cliente = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
async function entrar(email, etiqueta) {
  const c = cliente();
  const [{ data, error }, t] = await ms(() => c.auth.signInWithPassword({ email, password: FORJA_CLAVE }));
  if (error) throw new Error(`no se pudo entrar en ${etiqueta}: ${error.message}`);
  (medidas.inicioSesion ??= {})[etiqueta] = t;
  return { c, id: data.user.id, etiqueta };
}

// --- exactamente las llamadas de nube.ts ---
const subirDirecto = (u, datos) => u.c.from('datos_usuario').upsert({ user_id: u.id, datos: { ...datos, activo: null }, actualizado: new Date().toISOString() }, { onConflict: 'user_id' });
const leerXp = async (u) => { const { data, error } = await u.c.from('datos_usuario').select('xp:datos->ajustes->xp').eq('user_id', u.id).maybeSingle(); if (error) throw error; return data; };
const leerTodo = async (u) => { const { data, error } = await u.c.from('datos_usuario').select('datos').eq('user_id', u.id).maybeSingle(); if (error) throw error; return data?.datos ?? null; };
// El CÓDIGO DE PRODUCCIÓN (src/subida.ts), con el cliente real de la cuenta.
async function subirApp(u, local) {
  const r = await subirDatos(u.c, u.id, local);
  if (r.error) throw r.error;
  return r.datos;
}
// La versión anterior de la Fase 2 (lee, fusiona y sube sin comprobar), solo para comparar en la carrera.
async function subirAnterior(u, local) {
  const r = await leerXp(u);
  const f = prepararSubida(local, r ? { xp: r.xp } : null);
  const { error } = await subirDirecto(u, f.datos);
  if (error) throw error;
  return f.datos;
}
const asentar = (d) => { const e = calcularXp(d); return e?.nuevo ? { ...d, ajustes: { ...d.ajustes, xp: e.libro } } : d; };
const rpc = async (u, f, a) => { const { data, error } = await u.c.rpc(f, a); if (error) throw Object.assign(new Error(`${f}: ${error.message}`), { code: error.code }); return data; };

console.log('1 · Inicio de sesión y recuperación de datos');
const u1 = await entrar(FORJA_E1, 'cuenta1');
const u2 = await entrar(FORJA_E2, 'cuenta2');
const u3 = await entrar(FORJA_E3, 'cuenta3');
prueba('las tres cuentas inician sesión', !!u1.id && !!u2.id && !!u3.id, medidas.inicioSesion);
{
  const malo = cliente();
  const { error } = await malo.auth.signInWithPassword({ email: FORJA_E2, password: 'contraseña-incorrecta-de-prueba' });
  prueba('una contraseña incorrecta se rechaza', !!error && /invalid/i.test(error.message), error?.message);
}
{
  const anon = cliente();
  const { data, error } = await anon.from('datos_usuario').select('user_id');
  prueba('sin sesión no se puede leer datos_usuario (el servidor lo niega o no devuelve nada)', !!error || (Array.isArray(data) && data.length === 0), data);
  const { data: ajena } = await u3.c.from('datos_usuario').select('user_id').eq('user_id', u2.id);
  prueba('una cuenta no puede leer la fila de otra (RLS)', Array.isArray(ajena) && ajena.length === 0, ajena);
}
const estado0 = { c1: await leerTodo(u1), c2: await leerTodo(u2), c3: await leerTodo(u3) };
console.log(`   estado inicial de datos_usuario: cuenta1 ${estado0.c1 ? 'con datos' : 'vacía'}, cuenta2 ${estado0.c2 ? 'con datos' : 'vacía'}, cuenta3 ${estado0.c3 ? 'con datos' : 'vacía'}`);
if (estado0.c2) console.log('   (aviso) la cuenta 2 ya tenía datos: se sobrescriben solo con datos de prueba de esta ejecución');

console.log('2 · Libro de XP y consulta datos->ajustes->xp (cuenta 2)');
const base = asentar(datosDemo());
const libroBase = base.ajustes.xp;
{
  const [{ error }, t] = await ms(() => subirDirecto(u2, base));
  prueba('escribir el JSON de la cuenta (upsert de nube.ts)', !error, error?.message);
  medidas.escritura = t;
  const [r, t2] = await ms(() => leerXp(u2));
  medidas.consultaXp = t2;
  prueba('la consulta `datos->ajustes->xp` funciona y devuelve exactamente el libro escrito', !!r && mismoContenido(r.xp, libroBase), r);
  prueba('el libro leído se normaliza igual que el escrito', mismoContenido(normalizarLibro(r?.xp), normalizarLibro(libroBase)));
  const todo = await leerTodo(u2);
  prueba('recuperación completa: perfil, entrenos y comidas vuelven iguales', todo.perfil.dias === base.perfil.dias && todo.sesiones.length === base.sesiones.length && Object.keys(todo.comida).length === Object.keys(base.comida).length);
  prueba('el XP calculado con lo recuperado coincide con el original', calcularXp(todo).xp === calcularXp(base).xp, [calcularXp(todo).xp, calcularXp(base).xp]);
  medidas.tamano = { jsonKB: Math.round(JSON.stringify(base).length / 1024), libroBytes: JSON.stringify(libroBase).length };
  // Sin ajustes (como una versión antigua) la consulta devuelve null, no falla
  await subirDirecto(u2, { ...base, ajustes: undefined });
  const sinAjustes = await leerXp(u2);
  prueba('sin libro en la nube la consulta devuelve null (no da error)', sinAjustes && sinAjustes.xp === null, sinAjustes);
  await subirDirecto(u2, base);
  const sinFila = await leerXp(u3);
  prueba('sin fila (usuario nuevo) la consulta devuelve null', sinFila === null, sinFila);
}

console.log('3 · mis_logros: forma, coherencia con ARENA, límites y tiempos');
const perfil2 = await rpc(u2, 'mi_perfil');
prueba('mi_perfil responde con la forma esperada', !!perfil2?.codigo && typeof perfil2.dias_objetivo === 'number');
await rpc(u2, 'actualizar_perfil', { p_dias_objetivo: 4 });
{
  const [l0, t] = await ms(() => rpc(u2, 'mis_logros'));
  medidas.misLogros1 = t;
  prueba('mis_logros devuelve las 8 últimas semanas con `semana` (lunes) y `retos`', Array.isArray(l0.semanas) && l0.semanas.length === 8 && l0.semanas.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.semana) && Number.isInteger(s.retos)), l0.semanas?.slice(0, 2));
  prueba('antes de crear ningún reto no hay retos completados', l0.retos_completados === 0, l0);
  prueba('leer sin retos no cambia el libro', mismoContenido(aplicarRetosServidor(libroBase, l0), normalizarLibro(libroBase)));
  const lunesServidor = l0.semanas.at(-1).semana;
  const lunesLocal = claveDia(lunesDeSemana(0));
  prueba('el «lunes de esta semana» del servidor coincide con el del móvil', lunesServidor === lunesLocal, { servidor: lunesServidor, movil: lunesLocal });
}
// Hechos reales: ayer y hoy (40 min, 10 series) + proteína de hoy, enviados con las funciones de la app
const hoyUTC = new Date().toISOString().slice(0, 10);
const mismaFecha = hoyUTC === claveDia();
const ayer = claveDia(Date.now() - DIA), hoy = claveDia();
await rpc(u2, 'registrar_entreno', { p_id: 'f2-ayer', p_dia: ayer, p_minutos: 40, p_series: 10, p_descarga: false, p_marcas: [] });
await rpc(u2, 'registrar_entreno', { p_id: 'f2-hoy', p_dia: hoy, p_minutos: 40, p_series: 10, p_descarga: false, p_marcas: [] });
await rpc(u2, 'marcar_dia_proteina', { p_dia: hoy });
await rpc(u2, 'registrar_entreno', { p_id: 'f2-hoy', p_dia: hoy, p_minutos: 40, p_series: 10, p_descarga: false, p_marcas: [] }); // repetido: no suma
{
  const perfil = { ...base.perfil, dias: 4 };
  const meta = nutricion(perfil).proteina;
  const noon = (dia) => { const [a, m, d] = dia.split('-').map(Number); return new Date(a, m - 1, d, 12).getTime(); };
  const ses = (id, dia) => ({ id, rutinaNombre: 'Empuje', fecha: noon(dia), minutos: 40, ejercicios: [{ nombre: 'Press de banca', series: Array.from({ length: 10 }, () => ({ peso: 60, reps: 8 })) }] });
  const movil = { ...datosIniciales(), perfil, sesiones: [ses('f2-hoy', hoy), ses('f2-ayer', ayer)], comida: { [hoy]: [{ id: 'c', nombre: 'Comida', proteina: meta + 10, kcal: 600 }] } };
  const l1 = await rpc(u2, 'mis_logros');
  const xp = calcularXp(movil).xp;
  prueba('los puntos reales de ARENA (servidor) coinciden con el XP del móvil con los mismos hechos', !mismaFecha || l1.puntos === xp, { servidor: l1.puntos, movil: xp });
  if (!mismaFecha) console.log('   (omitida la comparación: la fecha UTC del servidor y la local difieren ahora)');
  prueba('repetir el envío de un entreno no suma otra vez', l1.entrenos <= 2, l1.entrenos);
  medidas.puntosArena = { servidor: l1.puntos, movil: xp };
}
// Reto real en curso (no puede estar completado: dura 7 días)
const nombreReto = 'Reto prueba fase 2';
let retoId = ((await rpc(u2, 'mis_retos')).find((r) => r.nombre === nombreReto) ?? {}).id;
if (!retoId) retoId = await rpc(u2, 'crear_reto', { p_nombre: nombreReto, p_modo: 'individual', p_dias: 7, p_objetivo: 'entrenos', p_meta: 2, p_invitados: [], p_inicio: ayer });
{
  const retos = await rpc(u2, 'mis_retos');
  const r = retos.find((x) => x.nombre === nombreReto);
  prueba('el reto real se crea con inicio ayer y el servidor cuenta mi progreso', !!r && r.participantes.find((p) => p.yo)?.progreso >= 2, r && { progreso: r.participantes.find((p) => p.yo)?.progreso, terminado: r.terminado });
  prueba('el reto sigue en curso (no terminado): `cumplido` solo indica que ya alcancé la meta', r && !r.terminado && r.dias_restantes > 0, r && { terminado: r.terminado, cumplido: r.cumplido, dias_restantes: r.dias_restantes });
  const l = await rpc(u2, 'mis_logros');
  prueba('un reto en curso no cuenta: retos_completados = 0 y ninguna semana tiene retos', l.retos_completados === 0 && l.semanas.every((s) => s.retos === 0));
  prueba('por tanto el XP no cambia por un reto en curso', mismoContenido(aplicarRetosServidor(libroBase, l), normalizarLibro(libroBase)));
  const fin = new Date(Date.parse(r.inicio + 'T12:00:00Z') + 7 * DIA).toISOString().slice(0, 10);
  medidas.retoCompletaElDia = fin;
  console.log(`   el reto se completará el ${fin} (UTC): entonces mis_logros devolverá retos=1 en su semana`);
}
// Límites y tiempos de mis_logros
{
  const t = []; let errores = 0;
  for (let i = 0; i < 40; i++) { const [, d] = await ms(() => rpc(u2, 'mis_logros').catch(() => { errores++; })); t.push(d); }
  medidas.misLogrosSecuencial = { n: 40, p50: pct(t, 50), p95: pct(t, 95), max: Math.max(...t), errores };
  prueba('40 lecturas seguidas de mis_logros sin errores ni límites', errores === 0, medidas.misLogrosSecuencial);
  const [res, total] = await ms(() => Promise.allSettled(Array.from({ length: 20 }, () => rpc(u2, 'mis_logros'))));
  const malos = res.filter((r) => r.status === 'rejected').length;
  medidas.misLogrosParalelo = { n: 20, total, errores: malos };
  prueba('20 lecturas simultáneas sin errores ni límites', malos === 0, medidas.misLogrosParalelo);
}

console.log('4 · Sincronización repetida y versiones antiguas (cuenta 2)');
{
  const antes = calcularXp(base).xp;
  let local = base;
  for (let i = 0; i < 10; i++) local = await subirApp(u2, local);
  const r = await leerXp(u2);
  prueba('subir 10 veces seguidas no cambia el libro de la nube', mismoContenido(normalizarLibro(r.xp), normalizarLibro(libroBase)), r);
  prueba('ni el XP', calcularXp(await leerTodo(u2)).xp === antes);
  // Una versión antigua guarda sin libro ni campos nuevos
  const viejo = copia(base); delete viejo.ajustes; delete viejo.misiones;
  await subirDirecto(u2, viejo);
  prueba('(simulación de versión antigua) la nube se queda sin libro', (await leerXp(u2)).xp === null);
  const tras = await subirApp(u2, base); // el móvil actualizado sube lo suyo
  const r2 = await leerXp(u2);
  prueba('al sincronizar, la app nueva restaura el libro: no se pierde de forma permanente', mismoContenido(normalizarLibro(r2.xp), normalizarLibro(libroBase)));
  prueba('y el XP vuelve a ser el mismo', calcularXp(await leerTodo(u2)).xp === antes && calcularXp(tras).xp === antes);
  // Y si la versión antigua solo borra el libro pero el móvil nuevo ya no lo tiene (móvil nuevo/limpio)
  await subirDirecto(u2, viejo);
  const limpio = { ...datosIniciales(), ...(await leerTodo(u2)) };
  prueba('un móvil limpio que entra con una nube sin libro recalcula el mismo XP (con los mismos datos y días)', calcularXp(limpio).xp === antes, [calcularXp(limpio).xp, antes]);
  await subirDirecto(u2, base);
}

console.log('5 · Dos sesiones independientes (cuenta 2)');
const s1 = await entrar(FORJA_E2, 'cuenta2-sesion1');
const s2 = await entrar(FORJA_E2, 'cuenta2-sesion2');
s1.id = u2.id; s2.id = u2.id;
{
  const semanaX = (i) => claveDia(lunesDeSemana(i));
  const A = { ...base, ajustes: { ...base.ajustes, xp: fusionarLibros(libroBase, { v: 2, semanas: { [semanaX(60)]: [90, 4, 4] } }) } };
  const B = { ...base, ajustes: { ...base.ajustes, xp: fusionarLibros(libroBase, { v: 2, semanas: { [semanaX(61)]: [70, 3, 4] } }) } };
  await subirApp(s1, A);
  const trasB = await subirApp(s2, B);
  const nube = (await leerXp(u2)).xp;
  prueba('la sesión 2 sube sin pisar lo de la sesión 1: la nube tiene las dos semanas nuevas', nube.semanas?.[semanaX(60)]?.[0] === 90 && nube.semanas?.[semanaX(61)]?.[0] === 70, Object.keys(nube.semanas).length);
  prueba('la sesión 2 incorpora la semana de la sesión 1 (+90 XP)', calcularXp(trasB).xp === calcularXp(base).xp + 90 + 70, [calcularXp(trasB).xp, calcularXp(base).xp]);
  const trasA = await subirApp(s1, A);
  prueba('la sesión 1 ve después lo de la sesión 2', calcularXp(trasA).xp === calcularXp(trasB).xp);
  for (let i = 0; i < 5; i++) { await subirApp(s1, trasA); await subirApp(s2, trasB); }
  prueba('sincronizar muchas veces entre las dos no duplica XP', calcularXp(await leerTodo(u2)).xp === calcularXp(trasB).xp);
  medidas.xpDosSesiones = calcularXp(trasB).xp;
}

console.log('6 · Carrera: dos sesiones guardando a la vez (cuenta 2)');
const lunesLejano = (i) => claveDia(lunesDeSemana(200 + i));
async function subirNaif(u, local) { const { error } = await subirDirecto(u, local); if (error) throw error; return local; }
async function estorm(nombre, subir, rondas = 12) {
  await subirDirecto(u2, base);
  let a = base, b = base;
  for (let i = 0; i < rondas; i++) {
    a = { ...a, ajustes: { ...a.ajustes, xp: fusionarLibros(a.ajustes.xp, { v: 2, semanas: { [lunesLejano(i)]: [1, 1, 1] } }) } };
    b = { ...b, ajustes: { ...b.ajustes, xp: fusionarLibros(b.ajustes.xp, { v: 2, semanas: { [lunesLejano(100 + i)]: [1, 1, 1] } }) } };
    const [ra, rb] = await Promise.allSettled([subir(s1, a), subir(s2, b)]);
    if (ra.status === 'fulfilled' && ra.value?.datos) a = ra.value.datos; else if (ra.status === 'fulfilled' && ra.value) a = ra.value;
    if (rb.status === 'fulfilled' && rb.value?.datos) b = rb.value.datos; else if (rb.status === 'fulfilled' && rb.value) b = rb.value;
  }
  const enNube = new Set(Object.keys(normalizarLibro((await leerXp(u2)).xp).semanas));
  const esperadas = [...Array(rondas).keys()].flatMap((i) => [lunesLejano(i), lunesLejano(100 + i)]);
  const perdidas = esperadas.filter((k) => !enNube.has(k)).length;
  // Convergencia: cada sesión hace UNA sincronización normal después
  await subirApp(s1, a);
  await subirApp(s2, b);
  const enNube2 = new Set(Object.keys(normalizarLibro((await leerXp(u2)).xp).semanas));
  const perdidasDespues = esperadas.filter((k) => !enNube2.has(k)).length;
  return { estrategia: nombre, rondas, escrituras: rondas * 2, semanasEsperadas: esperadas.length, perdidasTrasLaTormenta: perdidas, perdidasTrasUnaSincronizacionNormal: perdidasDespues };
}
{
  const naif = await estorm('subida directa (sin fusionar)', subirNaif);
  const anterior = await estorm('versión anterior (lee, fusiona, sube sin comprobar)', (u, l) => subirAnterior(u, l));
  const cas = await estorm('código actual de la app (src/subida.ts: solo escribe si nadie cambió la fila)', (u, l) => subirApp(u, l));
  const app = anterior;
  medidas.carrera = [naif, anterior, cas];
  console.log('   ' + JSON.stringify(medidas.carrera, null, 1).replace(/\n/g, '\n   '));
  prueba('en TODOS los casos, tras una sincronización normal de cada sesión el progreso converge sin pérdidas', [naif, app, cas].every((r) => r.perdidasTrasUnaSincronizacionNormal === 0), medidas.carrera);
  prueba('el código actual de la app no pierde nada ni siquiera durante la tormenta', cas.perdidasTrasLaTormenta === 0, cas);
  console.log(`   (informativo) pérdidas momentáneas durante la tormenta: sin fusionar ${naif.perdidasTrasLaTormenta}, versión anterior ${app.perdidasTrasLaTormenta}, código actual ${cas.perdidasTrasLaTormenta}`);
}

console.log('7 · Usuario nuevo y cuenta existente');
{
  const nuevo = await leerTodo(u3);
  prueba('una cuenta nueva (cuenta 3) empieza sin datos en la nube', nuevo === null);
  const l = await rpc(u3, 'mis_logros');
  prueba('mis_logros de una cuenta nueva: 0 puntos, 0 retos y 8 semanas vacías', l.puntos === 0 && l.retos_completados === 0 && l.semanas.length === 8);
  prueba('su libro calculado en un móvil sin entrenos no inventa XP', calcularXp({ ...datosIniciales(), perfil: base.perfil }) === null);
  const existente = await leerTodo(u2);
  prueba('una cuenta con datos anteriores (cuenta 2) se recupera y calcula XP', calcularXp(existente).xp > 0);
}

// Deja la cuenta 2 con datos de prueba limpios (sin las semanas inventadas de la carrera)
await subirDirecto(u2, base);
console.log(`\nmedidas: ${JSON.stringify({ ...medidas, carrera: undefined })}`);
console.log(`${ok} pruebas correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
