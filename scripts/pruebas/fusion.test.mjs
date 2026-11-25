// Pruebas de src/fusion.ts: fusión segura de todos los datos entre dispositivos (sin red).
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/fusion.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { claveDia, datosIniciales } from '../../src/datos.ts';
import { FORMATO_SYNC, esVacio, esquemaMasNuevo, fusionarDatos, registrarCambios } from '../../src/fusion.ts';
import { canonico } from '../../src/sincronizacion.ts';

// ---------- utilidades ----------
const vacio = () => ({ ...datosIniciales(), rutinas: [] });
const ord = (a) => [...a].sort((x, y) => (canonico(x) < canonico(y) ? -1 : canonico(x) > canonico(y) ? 1 : 0));
// Estado «sin orden visual»: lo que debe ser igual en todos los dispositivos
const norm = (d) => canonico({
  ...d, activo: null,
  rutinas: ord(d.rutinas), recetasHechas: ord(d.recetasHechas), sobras: ord(d.sobras), misAlimentos: ord(d.misAlimentos), medallasVistas: ord(d.medallasVistas ?? []),
  despensa: ord(d.despensa), comida: Object.fromEntries(Object.entries(d.comida).map(([k, v]) => [k, ord(v)])),
});
// Un «dispositivo»: aplica cambios con registrarCambios y un reloj propio controlado por la prueba
const dispositivo = (inicial = vacio()) => ({
  d: inicial,
  haz(f, t) { const n = f(this.d); this.d = registrarCambios(this.d, n, t); return this; },
  trae(otro) { this.d = fusionarDatos(this.d, otro.d); return this; },
});
const ses = (id, t) => ({ id, rutinaNombre: 'Torso', fecha: t, minutos: 50, ejercicios: [{ nombre: 'Press', series: [{ peso: 60, reps: 8 }] }] });
const comida = (id, nombre = 'Pollo') => ({ id, nombre, proteina: 30, kcal: 400 });
const rutina = (id, nombre = 'Empuje') => ({ id, nombre, ejercicios: [{ id: `e${id}`, nombre: 'Press', series: 3, reps: 8 }] });
const ids = (l) => l.map((x) => x.id).sort();

// ---------- casos concretos ----------
test('dos dispositivos añaden entrenos distintos: al fusionar están los dos (y por fecha)', () => {
  const a = dispositivo().haz((d) => ({ ...d, sesiones: [ses('a1', 1000), ...d.sesiones] }), 1001);
  const b = dispositivo().haz((d) => ({ ...d, sesiones: [ses('b1', 2000), ...d.sesiones] }), 2001);
  const ab = fusionarDatos(a.d, b.d);
  const ba = fusionarDatos(b.d, a.d);
  assert.deepEqual(ids(ab.sesiones), ['a1', 'b1']);
  assert.equal(norm(ab), norm(ba));
  assert.equal(ab.sesiones[0].id, 'b1', 'el más reciente primero');
});

test('dos dispositivos añaden comidas al mismo día: no se pisan', () => {
  const dia = '2026-11-18';
  const a = dispositivo().haz((d) => ({ ...d, comida: { ...d.comida, [dia]: [comida('c1', 'Desayuno')] } }), 10);
  const b = dispositivo().haz((d) => ({ ...d, comida: { ...d.comida, [dia]: [comida('c2', 'Cena')] } }), 11);
  const m = fusionarDatos(a.d, b.d);
  assert.deepEqual(ids(m.comida[dia]), ['c1', 'c2']);
  assert.equal(norm(m), norm(fusionarDatos(b.d, a.d)));
});

test('borrar un entreno en un dispositivo lo borra en el otro y NO reaparece al fusionar con una copia vieja', () => {
  const base = vacio();
  base.sesiones = [ses('s1', 100), ses('s2', 200)];
  const a = dispositivo(base);
  const viejo = dispositivo(base); // copia que no se entera del borrado
  a.haz((d) => ({ ...d, sesiones: d.sesiones.filter((x) => x.id !== 's1') }), 5000);
  assert.deepEqual(ids(a.d.sesiones), ['s2']);
  assert.equal(a.d.ajustes.sync.borrados['sesiones/s1'], 5000);
  const m = fusionarDatos(a.d, viejo.d);
  assert.deepEqual(ids(m.sesiones), ['s2'], 'la copia vieja no lo resucita');
  const m2 = fusionarDatos(viejo.d, a.d);
  assert.deepEqual(ids(m2.sesiones), ['s2'], 'ni en el otro sentido');
});

test('editar la misma rutina en dos dispositivos: gana el último cambio (en cualquier orden de fusión)', () => {
  const base = { ...vacio(), rutinas: [rutina('r1', 'Empuje')] };
  const a = dispositivo(base).haz((d) => ({ ...d, rutinas: [{ ...d.rutinas[0], nombre: 'Empuje A' }] }), 100);
  const b = dispositivo(base).haz((d) => ({ ...d, rutinas: [{ ...d.rutinas[0], nombre: 'Empuje B' }] }), 200);
  assert.equal(fusionarDatos(a.d, b.d).rutinas[0].nombre, 'Empuje B');
  assert.equal(fusionarDatos(b.d, a.d).rutinas[0].nombre, 'Empuje B');
});

test('borrar en uno y editar DESPUÉS en el otro: la edición posterior gana; si la edición es anterior, gana el borrado', () => {
  const base = { ...vacio(), rutinas: [rutina('r1')] };
  const borra = dispositivo(base).haz((d) => ({ ...d, rutinas: [] }), 500);
  const editaDespues = dispositivo(base).haz((d) => ({ ...d, rutinas: [{ ...d.rutinas[0], nombre: 'Nueva' }] }), 900);
  const editaAntes = dispositivo(base).haz((d) => ({ ...d, rutinas: [{ ...d.rutinas[0], nombre: 'Antes' }] }), 300);
  assert.deepEqual(fusionarDatos(borra.d, editaDespues.d).rutinas.map((r) => r.nombre), ['Nueva']);
  assert.deepEqual(fusionarDatos(editaDespues.d, borra.d).rutinas.map((r) => r.nombre), ['Nueva']);
  assert.deepEqual(fusionarDatos(borra.d, editaAntes.d).rutinas, []);
  assert.deepEqual(fusionarDatos(editaAntes.d, borra.d).rutinas, []);
});

test('campos sueltos (perfil, preferencias, voz): gana el último cambio de cada campo, por separado', () => {
  const a = dispositivo().haz((d) => ({ ...d, voz: true }), 100).haz((d) => ({ ...d, descanso: 120 }), 400);
  const b = dispositivo().haz((d) => ({ ...d, voz: true }), 50).haz((d) => ({ ...d, voz: false }), 200).haz((d) => ({ ...d, descanso: 60 }), 300);
  const m = fusionarDatos(a.d, b.d);
  assert.equal(m.voz, false, 'voz: B es más reciente');
  assert.equal(m.descanso, 120, 'descanso: A es más reciente');
  assert.equal(norm(m), norm(fusionarDatos(b.d, a.d)));
});

test('agua, ánimo y peso: por día, gana el último', () => {
  const dia = '2026-11-18';
  const a = dispositivo().haz((d) => ({ ...d, agua: { [dia]: 500 } }), 100).haz((d) => ({ ...d, pesos: [{ fecha: 100, max: 80 }] }), 100);
  const b = dispositivo().haz((d) => ({ ...d, agua: { [dia]: 750 } }), 200).haz((d) => ({ ...d, pesos: [{ fecha: 100 + 3600_000, max: 79.5 }] }), 200);
  const m = fusionarDatos(a.d, b.d);
  assert.equal(m.agua[dia], 750);
  assert.equal(m.pesos.length, 1, 'un valor por día');
  assert.equal(m.pesos[0].max, 79.5, 'el más reciente');
});

test('datos antiguos (sin marcas) de dos dispositivos: unión sin perder nada', () => {
  const a = { ...vacio(), sesiones: [ses('a1', 10)], comida: { '2026-11-01': [comida('c1')] }, pesos: [{ fecha: Date.parse('2026-10-30T10:00:00Z'), max: 82 }] };
  const b = { ...vacio(), sesiones: [ses('b1', 20)], comida: { '2026-11-02': [comida('c2')] }, medidas: { Cintura: [{ fecha: 5, max: 88 }] } };
  const m = fusionarDatos(a, b);
  assert.deepEqual(ids(m.sesiones), ['a1', 'b1']);
  assert.deepEqual(Object.keys(m.comida).sort(), ['2026-11-01', '2026-11-02']);
  assert.equal(m.pesos.length, 1);
  assert.equal(m.medidas.Cintura.length, 1);
  assert.equal(norm(m), norm(fusionarDatos(b, a)));
});

test('el entreno en curso (activo) nunca se mezcla: queda el de la base', () => {
  const activo = { rutinaNombre: 'X', inicio: 1, finDescanso: null, ejercicios: [] };
  const a = { ...vacio(), activo };
  const b = { ...vacio(), activo: { ...activo, rutinaNombre: 'Y' } };
  assert.equal(fusionarDatos(a, b).activo.rutinaNombre, 'X');
});

test('los elementos de ejemplo de un dispositivo vacío no se cuelan: esVacio lo detecta', () => {
  assert.equal(esVacio(datosIniciales()), true);
  assert.equal(esVacio({ ...datosIniciales(), sesiones: [ses('a', 1)] }), false);
  assert.equal(esVacio({ ...datosIniciales(), pesos: [{ fecha: 1, max: 80 }] }), false);
  assert.equal(esVacio(null), true);
});

test('registrarCambios: solo anota lo que cambia; el entreno en curso y lo que no cambia no dejan rastro', () => {
  const d0 = { ...vacio(), sesiones: [ses('s1', 5)] };
  assert.equal(registrarCambios(d0, d0, 10), d0);
  const soloActivo = { ...d0, activo: { rutinaNombre: 'X', inicio: 1, finDescanso: null, ejercicios: [] } };
  assert.equal(registrarCambios(d0, soloActivo, 10), soloActivo, 'misma referencia: no hay marcas nuevas');
  const mas = registrarCambios(d0, { ...d0, sesiones: [ses('s2', 6), ...d0.sesiones] }, 11);
  assert.deepEqual(mas.ajustes?.sync?.mod ?? {}, {}, 'añadir no necesita marca');
  const edit = registrarCambios(d0, { ...d0, sesiones: [{ ...d0.sesiones[0], sensacion: 'bien' }] }, 12);
  assert.equal(edit.ajustes.sync.mod['sesiones/s1'], 12);
  const borra = registrarCambios(edit, { ...edit, sesiones: [] }, 13);
  assert.equal(borra.ajustes.sync.borrados['sesiones/s1'], 13);
  assert.equal(borra.ajustes.sync.mod['sesiones/s1'], undefined);
});

test('un id borrado que vuelve (deshacer) gana a la lápida', () => {
  const s = ses('s1', 5);
  const a0 = { ...vacio(), sesiones: [s] };
  const a1 = registrarCambios(a0, { ...a0, sesiones: [] }, 100);
  const a2 = registrarCambios(a1, { ...a1, sesiones: [s] }, 200);
  assert.deepEqual(ids(fusionarDatos(a2, a1).sesiones), ['s1']);
  assert.deepEqual(ids(fusionarDatos(a1, a2).sesiones), ['s1']);
});

test('restaurar una copia (sustituye ajustes y listas) conserva las marcas y borra con lápida lo que ya no está', () => {
  const actual = registrarCambios({ ...vacio(), sesiones: [ses('s1', 1)] }, { ...vacio(), sesiones: [ses('s1', 1)], descanso: 120 }, 50);
  const copia = { ...vacio(), sesiones: [ses('s0', 0)], descanso: 120 };
  const restaurado = registrarCambios(actual, { ...actual, ...copia, ajustes: copia.ajustes }, 90);
  assert.deepEqual(ids(restaurado.sesiones), ['s0']);
  assert.equal(restaurado.ajustes.sync.borrados['sesiones/s1'], 90, 'lo que había y ya no está, queda como borrado');
  assert.equal(restaurado.ajustes.sync.mod.descanso, 50, 'no se pierden las marcas previas');
});

test('formato nuevo en la nube: una app más antigua lo detecta y no escribe encima', () => {
  assert.equal(esquemaMasNuevo({ ajustes: { sync: { v: FORMATO_SYNC + 1 } } }), true);
  assert.equal(esquemaMasNuevo({ ajustes: { sync: { v: FORMATO_SYNC } } }), false);
  assert.equal(esquemaMasNuevo({}), false);
  assert.equal(esquemaMasNuevo(null), false);
});

test('datos dañados o parciales de la nube no rompen la fusión', () => {
  const base = { ...vacio(), sesiones: [ses('a', 1)] };
  for (const raro of [null, undefined, 7, 'x', [], {}, { sesiones: 'no', comida: 5, rutinas: [null, 3, { id: 1 }], ajustes: { sync: { mod: 'mal', borrados: [1] } } }, { ajustes: 4 }]) {
    const m = fusionarDatos(base, raro);
    assert.ok(m.sesiones.some((x) => x.id === 'a'), `sigue habiendo entreno con ${JSON.stringify(raro)}`);
  }
});

test('lo ya fusionado no vuelve a cambiar (misma referencia) y fusionar dos veces da lo mismo', () => {
  const a = dispositivo().haz((d) => ({ ...d, sesiones: [ses('a1', 5)] }), 6);
  const b = dispositivo().haz((d) => ({ ...d, sesiones: [ses('b1', 7)] }), 8);
  const m = fusionarDatos(a.d, b.d);
  assert.equal(fusionarDatos(m, b.d), m, 'idempotente y sin bucles');
  assert.equal(fusionarDatos(m, m), m);
  assert.equal(fusionarDatos(a.d, null), a.d);
});

test('el XP se sigue fusionando con «el máximo gana» dentro de la fusión completa', () => {
  const lunes = '2026-10-05';
  const a = { ...vacio(), ajustes: { xp: { v: 2, semanas: { [lunes]: [30, 3, 3] } } } };
  const b = { ...vacio(), ajustes: { xp: { v: 2, semanas: { [lunes]: [20, 2, 3], '2026-10-12': [10, 1, 3] } } } };
  const m = fusionarDatos(a, b);
  assert.deepEqual(m.ajustes.xp.semanas[lunes], [30, 3, 3]);
  assert.ok(m.ajustes.xp.semanas['2026-10-12']);
});

// ---------- propiedades con muchos casos al azar ----------
function prng(semilla) { let t = semilla >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

function simular(semilla, pasos = 120) {
  const azar = prng(semilla);
  const pick = (l) => l[Math.floor(azar() * l.length)];
  let reloj = 1_000_000;
  const tic = () => (reloj += 1 + Math.floor(azar() * 5));
  const N = 3;
  const disp = Array.from({ length: N }, () => dispositivo());
  const historial = []; // copias antiguas para simular dispositivos con datos viejos
  const eventos = { sesiones: {}, rutinas: {}, comida: {} }; // para el oráculo: { id: { add, edits:[t], dels:[t] } }
  let n = 0;
  const ev = (col, id) => (eventos[col][id] ??= { edits: [], dels: [] });
  for (let i = 0; i < pasos; i++) {
    const a = pick(disp);
    const t = tic();
    const r = azar();
    if (r < 0.2) { const id = `s${++n}`; ev('sesiones', id); a.haz((d) => ({ ...d, sesiones: [ses(id, t), ...d.sesiones] }), t); }
    else if (r < 0.28 && a.d.sesiones.length) { const s = pick(a.d.sesiones); ev('sesiones', s.id).dels.push(t); a.haz((d) => ({ ...d, sesiones: d.sesiones.filter((x) => x.id !== s.id) }), t); }
    else if (r < 0.36 && a.d.sesiones.length) { const s = pick(a.d.sesiones); const nueva = pick(['facil', 'bien', 'duro']); if (s.sensacion !== nueva) { ev('sesiones', s.id).edits.push(t); a.haz((d) => ({ ...d, sesiones: d.sesiones.map((x) => (x.id === s.id ? { ...x, sensacion: nueva } : x)) }), t); } }
    else if (r < 0.44) { const id = `r${++n}`; ev('rutinas', id); a.haz((d) => ({ ...d, rutinas: [...d.rutinas, rutina(id, `R${n}`)] }), t); }
    else if (r < 0.5 && a.d.rutinas.length) { const x = pick(a.d.rutinas); ev('rutinas', x.id).dels.push(t); a.haz((d) => ({ ...d, rutinas: d.rutinas.filter((y) => y.id !== x.id) }), t); }
    else if (r < 0.56 && a.d.rutinas.length) { const x = pick(a.d.rutinas); ev('rutinas', x.id).edits.push(t); a.haz((d) => ({ ...d, rutinas: d.rutinas.map((y) => (y.id === x.id ? { ...y, nombre: `E${t}` } : y)) }), t); }
    else if (r < 0.64) { const id = `c${++n}`; const dia = pick(['2026-11-16', '2026-11-17', '2026-11-18']); ev('comida', `${dia}/${id}`); a.haz((d) => ({ ...d, comida: { ...d.comida, [dia]: [comida(id), ...(d.comida[dia] ?? [])] } }), t); }
    else if (r < 0.7) { const dias = Object.keys(a.d.comida).filter((k) => a.d.comida[k].length); if (dias.length) { const dia = pick(dias); const c = pick(a.d.comida[dia]); ev('comida', `${dia}/${c.id}`).dels.push(t); a.haz((d) => ({ ...d, comida: { ...d.comida, [dia]: d.comida[dia].filter((y) => y.id !== c.id) } }), t); } }
    else if (r < 0.75) a.haz((d) => ({ ...d, agua: { ...d.agua, [pick(['2026-11-17', '2026-11-18'])]: Math.floor(azar() * 3000) } }), t);
    else if (r < 0.8) a.haz((d) => ({ ...d, voz: !d.voz }), t);
    else if (r < 0.84) a.haz((d) => ({ ...d, pesos: [{ fecha: t, max: 70 + Math.floor(azar() * 20) }] }), t);
    else if (r < 0.9) historial.push(JSON.parse(JSON.stringify(pick(disp).d)));
    else if (r < 0.95 && historial.length) { const viejo = pick(historial); a.d = fusionarDatos(a.d, viejo); }
    else { const b = pick(disp); if (b !== a) a.trae(b); }
  }
  return { disp, eventos };
}

const rondas = (disp) => {
  for (let k = 0; k < 6; k++) { let cambio = false; for (const x of disp) for (const y of disp) if (x !== y) { const antes = x.d; x.trae(y); if (x.d !== antes) cambio = true; } if (!cambio) break; }
};

test('propiedad: tras sincronizar todos con todos, los dispositivos terminan IGUALES (200 simulaciones al azar)', () => {
  for (let s = 1; s <= 200; s++) {
    const { disp } = simular(s);
    rondas(disp);
    const n = disp.map((x) => norm(x.d));
    assert.equal(n[1], n[0], `semilla ${s}: dispositivo 1 distinto del 0`);
    assert.equal(n[2], n[0], `semilla ${s}: dispositivo 2 distinto del 0`);
  }
});

test('propiedad: nada se pierde ni resucita (oráculo: vivo si no se borró o se editó después del último borrado)', () => {
  for (let s = 1; s <= 200; s++) {
    const { disp, eventos } = simular(1000 + s);
    rondas(disp);
    const fin = disp[0].d;
    const vivos = {
      sesiones: new Set(fin.sesiones.map((x) => x.id)),
      rutinas: new Set(fin.rutinas.map((x) => x.id)),
      comida: new Set(Object.entries(fin.comida).flatMap(([dia, l]) => l.map((c) => `${dia}/${c.id}`))),
    };
    for (const col of Object.keys(eventos)) {
      for (const [id, e] of Object.entries(eventos[col])) {
        const ultimoBorrado = Math.max(0, ...e.dels);
        // Los entrenos tienen además la fecha de creación como marca (siempre anterior a cualquier borrado)
        const esperadoVivo = ultimoBorrado === 0 || e.edits.some((t) => t > ultimoBorrado);
        assert.equal(vivos[col].has(id), esperadoVivo, `semilla ${1000 + s}: ${col}/${id} debía estar ${esperadoVivo ? 'vivo' : 'borrado'} (borrados ${e.dels}, ediciones ${e.edits})`);
      }
    }
  }
});

test('propiedad: conmutativa, asociativa e idempotente', () => {
  for (let s = 1; s <= 150; s++) {
    const { disp } = simular(5000 + s, 60);
    const [A, B, C] = disp.map((x) => x.d);
    assert.equal(norm(fusionarDatos(A, B)), norm(fusionarDatos(B, A)), `conmutativa, semilla ${s}`);
    assert.equal(norm(fusionarDatos(fusionarDatos(A, B), C)), norm(fusionarDatos(A, fusionarDatos(B, C))), `asociativa, semilla ${s}`);
    assert.equal(norm(fusionarDatos(fusionarDatos(A, B), B)), norm(fusionarDatos(A, B)), `idempotente, semilla ${s}`);
    assert.equal(fusionarDatos(A, A), A, `fusionar consigo mismo no cambia nada, semilla ${s}`);
  }
});

test('rendimiento: fusionar dos historiales de 3.000 entrenos y 365 días de comida tarda poco', () => {
  const grande = (p) => ({ ...vacio(), sesiones: Array.from({ length: 3000 }, (_, i) => ses(`${p}${i}`, i * 1000)), comida: Object.fromEntries(Array.from({ length: 365 }, (_, i) => [claveDia(Date.UTC(2026, 0, 1) + i * 86400000), [comida(`${p}c${i}`), comida(`${p}d${i}`)]])) });
  const t0 = performance.now();
  const m = fusionarDatos(grande('a'), grande('b'));
  const ms = performance.now() - t0;
  assert.equal(m.sesiones.length, 6000);
  assert.ok(ms < 1500, `tardó ${Math.round(ms)} ms`);
  console.log(`      (6.000 entrenos + 730 comidas: ${Math.round(ms)} ms)`);
});

test('empate exacto entre borrar y editar: gana el borrado, en cualquier orden', () => {
  const base = { ...vacio(), rutinas: [rutina('r1')] };
  const borra = dispositivo(base).haz((d) => ({ ...d, rutinas: [] }), 700);
  const edita = dispositivo(base).haz((d) => ({ ...d, rutinas: [{ ...d.rutinas[0], nombre: 'X' }] }), 700);
  assert.deepEqual(fusionarDatos(borra.d, edita.d).rutinas, []);
  assert.deepEqual(fusionarDatos(edita.d, borra.d).rutinas, []);
});

test('lo borrado no deja marcas de edición colgando (el documento no crece sin motivo)', () => {
  const base = { ...vacio(), rutinas: [rutina('r1')] };
  const edita = dispositivo(base).haz((d) => ({ ...d, rutinas: [{ ...d.rutinas[0], nombre: 'X' }] }), 300);
  const borra = dispositivo(base).haz((d) => ({ ...d, rutinas: [] }), 500);
  const m = fusionarDatos(edita.d, borra.d);
  assert.deepEqual(m.rutinas, []);
  assert.equal(m.ajustes.sync.mod['rutinas/r1'], undefined);
  assert.equal(m.ajustes.sync.borrados['rutinas/r1'], 500);
});
