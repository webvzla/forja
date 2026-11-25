// Pruebas de src/subida.ts con un cliente falso en memoria (sin red): subida con fusión y control de concurrencia.
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/subida.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { claveDia, datosIniciales } from '../../src/datos.ts';
import { datosDemo } from '../../src/demo.ts';
import { fusionarLibros, normalizarLibro } from '../../src/sincronizacion.ts';
import { ERROR_ESQUEMA, subirDatos, traerNovedades } from '../../src/subida.ts';
import { registrarCambios } from '../../src/fusion.ts';
import { calcularXp, lunesDeSemana } from '../../src/xp.ts';

const semana = (n) => claveDia(lunesDeSemana(n));
const asentar = (d) => { const e = calcularXp(d); return e?.nuevo ? { ...d, ajustes: { ...d.ajustes, xp: e.libro } } : d; };
const conSemana = (d, n) => ({ ...d, ajustes: { ...d.ajustes, xp: fusionarLibros(d.ajustes?.xp, { v: 2, semanas: { [semana(n)]: [5, 1, 1] } }) } });

// Cliente falso: una sola fila `datos_usuario`. `entreLecturaYEscritura` permite que «otro dispositivo» guarde justo en medio.
function clienteFalso({ fila = null, falloLectura = false, entreLecturaYEscritura = null } = {}) {
  const e = { fila, relojs: 0, llamadas: [], lecturas: 0 };
  const tick = () => new Date(Date.parse('2026-11-18T10:00:00.000Z') + ++e.relojs * 1000).toISOString();
  const cliente = {
    from() {
      return {
        select(cols) {
          return { eq: () => ({ maybeSingle: async () => {
            e.lecturas++; e.llamadas.push(cols === 'actualizado' ? 'marca' : 'leer');
            if (falloLectura) return { data: null, error: { message: 'sin red' } };
            if (cols === 'actualizado') return { data: e.fila ? { actualizado: e.fila.actualizado } : null, error: null };
            const r = e.fila ? { datos: e.fila.datos, xp: e.fila.datos?.ajustes?.xp ?? null, actualizado: e.fila.actualizado } : null;
            if (entreLecturaYEscritura && e.lecturas === 1) await entreLecturaYEscritura(e, tick);
            return { data: r, error: null };
          } }) };
        },
        insert: async (x) => {
          e.llamadas.push('insertar');
          if (e.fila) return { error: { code: '23505', message: 'duplicada' } };
          e.fila = { datos: x.datos, actualizado: x.actualizado };
          return { error: null };
        },
        update(x) {
          const filtros = [];
          const q = { eq(c, v) { filtros.push([c, v]); return q; }, is(c, v) { filtros.push([c, v]); return q; },
            select: async () => {
              e.llamadas.push('actualizar');
              const ok = e.fila && filtros.every(([c, v]) => (c === 'actualizado' ? (v === null ? e.fila.actualizado == null : e.fila.actualizado === v) : true));
              if (!ok) return { data: [], error: null };
              e.fila = { datos: x.datos, actualizado: x.actualizado };
              return { data: [{ user_id: 'u' }], error: null };
            } };
          return q;
        },
        upsert: async (x) => { e.llamadas.push('upsert'); e.fila = { datos: x.datos, actualizado: x.actualizado }; return { error: null }; },
      };
    },
  };
  return { cliente, e };
}

test('primera subida: se inserta la fila', async () => {
  const { cliente, e } = clienteFalso();
  const d = asentar(datosDemo());
  const r = await subirDatos(cliente, 'u', d);
  assert.equal(r.error, null);
  assert.deepEqual(e.llamadas, ['leer', 'insertar']);
  assert.equal(r.cambio, false);
  assert.deepEqual(normalizarLibro(e.fila.datos.ajustes.xp), normalizarLibro(d.ajustes.xp));
});
test('subida normal: lee, fusiona y actualiza solo si la fila no cambió', async () => {
  const d = asentar(datosDemo());
  const { cliente, e } = clienteFalso({ fila: { datos: conSemana(d, 70), actualizado: '2026-11-18T09:00:00.000Z' } });
  const r = await subirDatos(cliente, 'u', d);
  assert.deepEqual(e.llamadas, ['leer', 'actualizar']);
  assert.equal(r.cambio, true, 'incorporó la semana de la nube');
  assert.equal(r.datos.ajustes.xp.semanas[semana(70)][0], 5);
  assert.equal(e.fila.datos.ajustes.xp.semanas[semana(70)][0], 5, 'y la nube la conserva');
});
test('si otro dispositivo guarda justo en medio, se relee, se fusiona y se reintenta (sin perder nada)', async () => {
  const d = asentar(datosDemo());
  const { cliente, e } = clienteFalso({
    fila: { datos: d, actualizado: '2026-11-18T09:00:00.000Z' },
    entreLecturaYEscritura: async (est, tick) => { est.fila = { datos: conSemana(d, 90), actualizado: tick() }; }, // el otro guarda aquí
  });
  const r = await subirDatos(cliente, 'u', conSemana(d, 91));
  assert.equal(r.error, null);
  assert.equal(r.intentos, 2);
  assert.deepEqual(e.llamadas, ['leer', 'actualizar', 'leer', 'actualizar']);
  const nube = normalizarLibro(e.fila.datos.ajustes.xp).semanas;
  assert.ok(nube[semana(90)] && nube[semana(91)], 'están las semanas de los dos dispositivos');
});
test('si dos dispositivos crean la fila a la vez, el segundo relee y fusiona', async () => {
  const d = asentar(datosDemo());
  const { cliente, e } = clienteFalso({ entreLecturaYEscritura: async (est, tick) => { est.fila = { datos: conSemana(d, 80), actualizado: tick() }; } });
  const r = await subirDatos(cliente, 'u', conSemana(d, 81));
  assert.equal(r.error, null);
  assert.deepEqual(e.llamadas, ['leer', 'insertar', 'leer', 'actualizar']);
  const nube = normalizarLibro(e.fila.datos.ajustes.xp).semanas;
  assert.ok(nube[semana(80)] && nube[semana(81)]);
});
test('si no se puede leer la nube NO se escribe encima: devuelve error para reintentar y no se bloquea', async () => {
  const { cliente, e } = clienteFalso({ falloLectura: true });
  const d = asentar(datosDemo());
  const r = await subirDatos(cliente, 'u', d);
  assert.ok(r.error);
  assert.equal(r.actualizado, null);
  assert.deepEqual(e.llamadas, ['leer']);
  assert.equal(e.fila, null);
});
test('demasiada competencia: tras los reintentos devuelve error sin escribir a ciegas y no se queda colgado', async () => {
  const d = asentar(datosDemo());
  let n = 0;
  const { cliente, e } = clienteFalso({ fila: { datos: d, actualizado: '2026-11-18T09:00:00.000Z' } });
  const original = cliente.from;
  cliente.from = () => { const f = original(); const upd = f.update; f.update = (x) => { const q = upd(x); q.select = async () => { n++; return { data: [], error: null }; }; return q; }; return f; };
  const r = await subirDatos(cliente, 'u', d, 3);
  assert.equal(n, 3);
  assert.ok(r.error);
  assert.ok(!e.llamadas.includes('upsert'));
});
test('la fila nunca queda sin actividad inventada: subir lo mismo muchas veces no cambia el libro', async () => {
  const d = asentar(datosDemo());
  const { cliente, e } = clienteFalso();
  let local = d;
  for (let i = 0; i < 10; i++) local = (await subirDatos(cliente, 'u', local)).datos;
  assert.deepEqual(normalizarLibro(e.fila.datos.ajustes.xp), normalizarLibro(d.ajustes.xp));
  assert.equal(calcularXp(e.fila.datos).xp, calcularXp(d).xp);
  assert.ok(datosIniciales());
});
test('nube.ts usa subirDatos y avisa de lo fusionado', async () => {
  const { readFileSync } = await import('node:fs');
  const t = readFileSync(new URL('../../src/nube.ts', import.meta.url), 'utf8');
  assert.match(t, /subirDatos\(sb, uid, d, 6, vista\)/);
  assert.match(t, /alFusionar\(r\.datos\)/);
});

// ---------- Fusión completa (Beta): entrenos, comidas, rutinas… ----------
const vacio = () => ({ ...datosIniciales(), rutinas: [] });
const ses = (id, t) => ({ id, rutinaNombre: 'Torso', fecha: t, minutos: 50, ejercicios: [{ nombre: 'Press', series: [{ peso: 60, reps: 8 }] }] });
const conSesiones = (...l) => ({ ...vacio(), sesiones: l });
const idsDe = (d) => d.sesiones.map((x) => x.id).sort();

test('dos dispositivos con entrenos distintos: la subida los une y la nube conserva los dos (antes el último pisaba al otro)', async () => {
  const nube = conSesiones(ses('b1', 2000));
  const { cliente, e } = clienteFalso({ fila: { datos: nube, actualizado: '2026-11-18T09:00:00.000Z' } });
  const r = await subirDatos(cliente, 'u', conSesiones(ses('a1', 1000)));
  assert.equal(r.error, null);
  assert.equal(r.cambio, true, 'trae el entreno del otro dispositivo');
  assert.deepEqual(idsDe(r.datos), ['a1', 'b1']);
  assert.deepEqual(idsDe(e.fila.datos), ['a1', 'b1'], 'y la nube tiene los dos');
});

test('un dispositivo atrasado (con un entreno que otro ya borró) no lo resucita al subir', async () => {
  const antes = conSesiones(ses('s1', 100), ses('s2', 200));
  const dispositivoA = registrarCambios(antes, { ...antes, sesiones: antes.sesiones.filter((x) => x.id !== 's1') }, 5000);
  const { cliente, e } = clienteFalso({ fila: { datos: dispositivoA, actualizado: '2026-11-18T09:00:00.000Z' } });
  const r = await subirDatos(cliente, 'u', antes); // el dispositivo viejo sube su copia anterior al borrado
  assert.equal(r.error, null);
  assert.deepEqual(idsDe(e.fila.datos), ['s2']);
  assert.deepEqual(idsDe(r.datos), ['s2'], 'y el dispositivo viejo se pone al día');
});

test('si ya conoce la versión de la nube y no ha cambiado, solo mira la marca y escribe (no baja el documento)', async () => {
  const d = conSesiones(ses('a1', 1));
  const { cliente, e } = clienteFalso({ fila: { datos: d, actualizado: '2026-11-18T09:00:00.000Z' } });
  const r = await subirDatos(cliente, 'u', conSesiones(ses('a1', 1), ses('a2', 2)), 6, '2026-11-18T09:00:00.000Z');
  assert.equal(r.error, null);
  assert.deepEqual(e.llamadas, ['marca', 'actualizar']);
  assert.equal(r.cambio, false);
  assert.deepEqual(idsDe(e.fila.datos), ['a1', 'a2']);
  assert.ok(r.actualizado && r.actualizado > '2026-11-18T09:00:00.000Z', 'devuelve la nueva versión para el próximo guardado');
});

test('si conoce la versión pero la nube cambió, baja el documento, lo fusiona y no pierde lo del otro', async () => {
  const { cliente, e } = clienteFalso({ fila: { datos: conSesiones(ses('b1', 9)), actualizado: '2026-11-18T09:30:00.000Z' } });
  const r = await subirDatos(cliente, 'u', conSesiones(ses('a1', 1)), 6, '2026-11-18T09:00:00.000Z');
  assert.deepEqual(e.llamadas, ['marca', 'leer', 'actualizar']);
  assert.deepEqual(idsDe(e.fila.datos), ['a1', 'b1']);
  assert.equal(r.cambio, true);
});

test('si la nube no tiene fila y ya conocía una versión, inserta (cuenta nueva o recuperada)', async () => {
  const { cliente, e } = clienteFalso();
  const r = await subirDatos(cliente, 'u', conSesiones(ses('a1', 1)), 6, null);
  assert.equal(r.error, null);
  assert.deepEqual(e.llamadas, ['marca', 'insertar']);
  assert.deepEqual(idsDe(e.fila.datos), ['a1']);
});

test('datos de una versión más nueva en la nube: no se escribe nada y se avisa', async () => {
  const futuro = { ...vacio(), ajustes: { sync: { v: 99, mod: {}, borrados: {} } } };
  const { cliente, e } = clienteFalso({ fila: { datos: futuro, actualizado: '2026-11-18T09:00:00.000Z' } });
  const r = await subirDatos(cliente, 'u', conSesiones(ses('a1', 1)));
  assert.equal(r.error?.code, ERROR_ESQUEMA);
  assert.deepEqual(e.llamadas, ['leer'], 'solo lee: no escribe');
  assert.deepEqual(e.fila.datos, futuro);
});

test('traerNovedades: sin cambios no baja nada; con cambios devuelve el documento; con formato futuro avisa', async () => {
  const { cliente, e } = clienteFalso({ fila: { datos: conSesiones(ses('b1', 9)), actualizado: '2026-11-18T09:30:00.000Z' } });
  const igual = await traerNovedades(cliente, 'u', '2026-11-18T09:30:00.000Z');
  assert.equal(igual.datos, null);
  assert.deepEqual(e.llamadas, ['marca']);
  const nuevo = await traerNovedades(cliente, 'u', '2026-11-18T09:00:00.000Z');
  assert.deepEqual(idsDe(nuevo.datos), ['b1']);
  assert.equal(nuevo.actualizado, '2026-11-18T09:30:00.000Z');
  e.fila = { datos: { ajustes: { sync: { v: 99 } } }, actualizado: '2026-11-18T10:00:00.000Z' };
  const futuro = await traerNovedades(cliente, 'u', undefined);
  assert.equal(futuro.error?.code, ERROR_ESQUEMA);
  const sinFila = clienteFalso();
  assert.deepEqual(await traerNovedades(sinFila.cliente, 'u', undefined), { datos: null, actualizado: null, error: null });
});
