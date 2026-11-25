// Integración LOCAL: el XP del móvil contra las funciones SQL REALES de ARENA (las 7 migraciones),
// ejecutadas en un Postgres en memoria (PGlite) con la autenticación de Supabase emulada.
// NO es Supabase: no toca ningún servicio ni cuenta; solo comprueba que la fórmula del móvil y la del servidor
// coinciden semana a semana y que el XP no cuenta dos veces los puntos de ARENA.
// Necesita `npm ci --ignore-scripts` en supabase/pruebas (PGlite). Ejecutar con:
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/integracion-sql.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { baseDeDatos, como } from '../../supabase/pruebas/sql.test.mjs';
import { claveDia, datosIniciales } from '../../src/datos.ts';
import { nutricion } from '../../src/reglas.ts';
import { aplicarRetosServidor } from '../../src/sincronizacion.ts';
import { calcularXp } from '../../src/xp.ts';

const db = await baseDeDatos();
const hoyServidor = (await db.query('select current_date::text d')).rows[0].d;
const mismaFecha = hoyServidor === claveDia();
const lunes = async (i) => (await db.query(`select (date_trunc('week', current_date) - interval '${7 * i} days')::date::text d`)).rows[0].d;
const sumarDias = async (f, n) => (await db.query(`select ($1::date + $2::int)::text d`, [f, n])).rows[0].d;

const ana = (await db.query(`insert into auth.users (email) values ('ana@prueba.test') returning id`)).rows[0].id;
await como(db, ana, `select public.actualizar_perfil(p_dias_objetivo => 4)`);

// Perfil del móvil con los mismos 4 días objetivo.
const perfil = { sexo: 'h', edad: 30, altura: 178, peso: 80, objetivo: 'musculo', objetivo2: null, dias: 4, diasSemana: [0, 1, 2, 3], descargaHasta: null, nivel: 'intermedio', equipo: 'gym', enfasis: 'ninguno', ajusteKcal: 0, ultimaRevision: null };
const meta = nutricion(perfil).proteina;
const movil = { ...datosIniciales(), perfil, sesiones: [], comida: {} };

// Los MISMOS hechos en el servidor (tablas) y en el móvil (datos), semana a semana (hace 5…1 semanas).
const plan = { 5: { entrenos: 4, prot: 7 }, 4: { entrenos: 2, prot: 3 }, 3: { entrenos: 5, prot: 0 }, 2: { entrenos: 4, prot: 7 }, 1: { entrenos: 1, prot: 0 } };
let n = 0;
for (const [w, { entrenos, prot }] of Object.entries(plan)) {
  const l = await lunes(Number(w));
  for (let k = 0; k < entrenos; k++) {
    const dia = await sumarDias(l, k);
    await db.query(`insert into public.actividad (user_id, id, dia, minutos, series) values ($1, $2, $3::date, 40, 10)`, [ana, `a${n}`, dia]);
    const [a, m, d] = dia.split('-').map(Number);
    movil.sesiones.push({ id: `a${n++}`, rutinaNombre: 'Empuje', fecha: new Date(a, m - 1, d, 12).getTime(), minutos: 40, ejercicios: [{ nombre: 'Press de banca', series: Array.from({ length: 10 }, () => ({ peso: 60, reps: 8 })) }] });
  }
  for (let k = 0; k < prot; k++) {
    const dia = await sumarDias(l, k);
    await db.query(`insert into public.dias_proteina (user_id, dia) values ($1, $2::date)`, [ana, dia]);
    movil.comida[dia] = [{ id: `c${dia}`, nombre: 'Comida', proteina: meta + 10, kcal: 600 }];
  }
}
// Retos completados: 1 en la semana de hace 5 y 3 en la de hace 2 (el servidor solo puntúa 2 por semana).
for (const [w, cantidad] of [[5, 1], [2, 3]]) {
  const l = await lunes(w);
  for (let i = 0; i < cantidad; i++) {
    const r = (await db.query(`insert into public.retos (creador, nombre, modo, dias, objetivo, meta, inicio) values ($1, $2, 'individual', 7, 'entrenos', 2, $3::date) returning id`, [ana, `Reto ${w}-${i}`, l])).rows[0].id;
    await db.query(`insert into public.participantes_reto (reto, usuario, estado) values ($1, $2, 'aceptado')`, [r, ana]);
  }
}
movil.sesiones.sort((a, b) => b.fecha - a.fecha);

const opciones = { skip: mismaFecha ? false : 'la fecha del servidor (UTC) y la local difieren en este instante' };
const logros = async () => (await como(db, ana, `select public.mis_logros() as l`))[0].l;

test('el servidor aplica el tope de 2 retos por semana (referencia)', opciones, async () => {
  const l = await logros();
  const semanas = Object.fromEntries(l.semanas.map((s) => [s.semana, s]));
  assert.equal(semanas[await lunes(2)].retos, 3, 'el servidor cuenta 3 retos hechos…');
  assert.equal(l.retos_completados, 4);
});

test('semana a semana: puntos del móvil (sin retos) + retos del servidor = puntos de ARENA', opciones, async () => {
  const l = await logros();
  const est = calcularXp(movil);
  const libro = aplicarRetosServidor(est.libro, l);
  const comparados = [];
  for (const s of l.semanas) {
    const k = s.semana;
    const cerrada = est.libro.semanas[k];
    if (!cerrada) continue; // la semana en curso no tiene hechos en esta prueba
    const retos = libro.retos?.[k] ?? 0;
    assert.equal(cerrada[0] + 15 * retos, s.puntos, `semana ${k}: móvil ${cerrada[0]} + retos ${retos} vs ARENA ${s.puntos}`);
    comparados.push(k);
  }
  assert.equal(comparados.length, 5, 'se compararon las 5 semanas con actividad');
});

test('el XP total coincide con los puntos de ARENA y los puntos no se cuentan dos veces', opciones, async () => {
  const l = await logros();
  const est = calcularXp(movil);
  const libro = aplicarRetosServidor(est.libro, l);
  const xp = calcularXp({ ...movil, ajustes: { xp: libro } }).xp;
  assert.equal(xp, l.puntos, 'XP del móvil = suma de puntos de ARENA (52 semanas)');
  // Leer una y otra vez, o fusionar con la misma respuesta, no cambia el XP.
  let l2 = libro;
  for (let i = 0; i < 4; i++) l2 = aplicarRetosServidor(l2, l);
  assert.equal(calcularXp({ ...movil, ajustes: { xp: l2 } }).xp, xp);
  // Los retos aportan exactamente 15 + 30 (1 reto + tope de 2) y nada más.
  assert.equal(calcularXp({ ...movil, ajustes: { xp: libro } }).retosXp, 45);
});

test('sin sesión (sin retos) el XP es el del móvil y solo se queda 45 pts por debajo de ARENA', opciones, async () => {
  const l = await logros();
  assert.equal(l.puntos - calcularXp(movil).xp, 45);
});

test('cerrar sesión: al volver a entrar se leen otra vez los retos y el XP queda igual', opciones, async () => {
  const l = await logros();
  const antes = calcularXp({ ...movil, ajustes: { xp: aplicarRetosServidor(calcularXp(movil).libro, l) } }).xp;
  // Móvil vacío + nube con el libro (o sin él, como si lo hubiera pisado una versión antigua)
  const sinLibro = { ...movil, ajustes: undefined };
  const despues = calcularXp({ ...sinLibro, ajustes: { xp: aplicarRetosServidor(undefined, l) } }).xp; // se recalcula y se relee
  assert.equal(despues, antes);
});

test('los puntos de ARENA de ayer no cambian si se borra un entreno del móvil (el servidor ya lo tiene)', opciones, async () => {
  const antes = (await logros()).puntos;
  const recortado = { ...movil, sesiones: movil.sesiones.slice(1) };
  const libro = aplicarRetosServidor(calcularXp(movil).libro, await logros()); // libro asentado antes de borrar
  const xpTrasBorrar = calcularXp({ ...recortado, ajustes: { xp: libro } }).xp;
  assert.equal(xpTrasBorrar, antes, 'las semanas cerradas del libro no bajan al borrar historial');
  assert.equal((await logros()).puntos, antes);
});
