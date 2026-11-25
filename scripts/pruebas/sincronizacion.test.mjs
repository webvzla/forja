// Pruebas de la Fase 2: XP + ARENA (retos), sincronización del libro, cierre de sesión, dos dispositivos,
// versiones antiguas y semanas cerradas. Son pruebas AUTOMATIZADAS de lógica con una «nube» falsa en memoria:
// NO hablan con Supabase ni con ninguna cuenta real. Ejecutar con:
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/sincronizacion.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { claveDia, datosIniciales } from '../../src/datos.ts';
import { datosDemo } from '../../src/demo.ts';
import { aplicarRetosServidor, fusionarLibros, fusionarProgreso, mismoContenido, normalizarLibro, prepararSubida } from '../../src/sincronizacion.ts';
import { bonusRetos, calcularXp, lunesDeSemana, progresoNivel } from '../../src/xp.ts';

const copia = (x) => JSON.parse(JSON.stringify(x));
const semana = (i) => claveDia(lunesDeSemana(i)); // lunes de hace i semanas
const conLibro = (d, libro) => ({ ...d, ajustes: { ...d.ajustes, xp: libro } });
// Aplica lo que haría la app: calcula, y si hay algo nuevo lo guarda en el libro.
const asentar = (d) => {
  const est = calcularXp(d);
  return est?.nuevo ? conLibro(d, est.libro) : d;
};
const respuestaServidor = (porSemana, extra = {}) => ({
  puntos: 99999, entrenos: 99, semanas_cumplidas: 99, mejor_racha: 99, records: 99, retos_completados: 99,
  semanas: Object.entries(porSemana).map(([semana, retos]) => ({ semana, retos, puntos: 12345, entrenos: 9, objetivo: 3, prot: 7, records: 3, racha: 10 })),
  ...extra,
});

// «Nube» falsa: guarda el JSON de la cuenta, como la tabla datos_usuario. Cada llamada hace lo que hace la app.
const nubeFalsa = () => {
  let datos = null;
  return {
    get datos() { return datos; },
    // Igual que nube.ts: antes de subir se fusiona el libro con el que ya hubiera.
    subir(local) {
      const { datos: d, cambio } = prepararSubida(local, datos ? { xp: datos.ajustes?.xp } : null);
      datos = { ...copia(d), activo: null };
      return cambio ? d : local; // lo que el dispositivo incorpora al subir
    },
    // Igual que App.entrar: lo de la nube manda y se fusiona el libro del móvil si es de la misma cuenta.
    entrar(local, mismaCuenta) {
      if (!datos) return local;
      return fusionarProgreso({ ...datosIniciales(), ...copia(datos), activo: null }, mismaCuenta ? local : null);
    },
  };
};

// ---------- Retos → XP ----------
test('los retos completados dan XP con la fórmula de ARENA, máximo 2 por semana', () => {
  assert.deepEqual([0, 1, 2, 3, 9, -1].map(bonusRetos), [0, 15, 30, 30, 30, 0]);
  const d = asentar(datosDemo());
  const base = calcularXp(d);
  const libro = aplicarRetosServidor(d.ajustes.xp, respuestaServidor({ [semana(2)]: 1, [semana(3)]: 3 }));
  const conRetos = calcularXp(conLibro(d, libro));
  assert.equal(conRetos.xp - base.xp, 15 + 30, '1 reto + 3 retos (solo cuentan 2)');
  assert.equal(conRetos.retosXp, 45);
  assert.equal(base.retosXp, 0);
});
test('leer los retos varias veces no suma otra vez (idempotente) y nunca baja', () => {
  const d = asentar(datosDemo());
  const r = respuestaServidor({ [semana(2)]: 2 });
  let libro = d.ajustes.xp;
  const xps = [];
  for (let i = 0; i < 5; i++) {
    libro = aplicarRetosServidor(libro, r);
    xps.push(calcularXp(conLibro(d, libro)).xp);
  }
  assert.equal(new Set(xps).size, 1, 'siempre el mismo XP');
  // El servidor devuelve menos (p. ej. ya no está en su ventana): el XP ya ganado no baja.
  const menos = aplicarRetosServidor(libro, respuestaServidor({ [semana(2)]: 1 }));
  assert.equal(calcularXp(conLibro(d, menos)).xp, xps[0]);
  const vacio = aplicarRetosServidor(libro, respuestaServidor({}));
  assert.equal(calcularXp(conLibro(d, vacio)).xp, xps[0]);
});
test('los puntos que calcula el servidor NO se usan: no se cuentan dos veces', () => {
  const d = asentar(datosDemo());
  const sinRetos = calcularXp(d).xp;
  // Un servidor que devuelve puntos, entrenos, rachas… enormes y ningún reto: el XP no cambia.
  const libro = aplicarRetosServidor(d.ajustes.xp, respuestaServidor({ [semana(1)]: 0, [semana(2)]: 0 }));
  assert.equal(calcularXp(conLibro(d, libro)).xp, sinRetos);
  assert.ok(!JSON.stringify(libro).includes('99999') && !JSON.stringify(libro).includes('12345'));
});
test('respuestas raras del servidor se ignoran sin romper nada', () => {
  const d = asentar(datosDemo());
  const antes = normalizarLibro(d.ajustes.xp);
  const malas = [null, undefined, 'x', 5, [], {}, { semanas: 'no' }, { semanas: [null, 1, 'a', { semana: 5, retos: 1 }, { semana: 'mañana', retos: 1 }, { semana: semana(1), retos: -3 }, { semana: semana(1), retos: NaN }, { semana: semana(1), retos: 'uno' }] }];
  for (const m of malas) assert.deepEqual(aplicarRetosServidor(d.ajustes.xp, m), antes, JSON.stringify(m));
  // Un reto con la fecha completa (timestamp) también se entiende.
  assert.equal(aplicarRetosServidor(d.ajustes.xp, { semanas: [{ semana: `${semana(2)}T00:00:00`, retos: 1 }] }).retos[semana(2)], 1);
});
test('sin cuenta (sin retos) el XP es el de siempre', () => {
  const d = asentar(datosDemo());
  assert.equal(calcularXp(d).retosXp, 0);
  assert.equal(d.ajustes.xp.retos, undefined);
});

// ---------- Fusión del libro ----------
const rng = (semilla) => () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
const libroAzar = (r) => {
  const l = { v: 2, semanas: {}, retos: {} };
  for (let i = 1; i <= 8; i++) {
    if (r() < 0.6) l.semanas[semana(i)] = [Math.floor(r() * 150), Math.floor(r() * 7), 1 + Math.floor(r() * 6)];
    if (r() < 0.3) l.retos[semana(i)] = 1 + Math.floor(r() * 2);
  }
  for (let i = 0; i < 3; i++) if (r() < 0.4) (l.picos ??= {})[semana(i)] = 1 + Math.floor(r() * 100);
  if (!Object.keys(l.retos).length) delete l.retos;
  return l;
};
test('fusionar es conmutativo, asociativo e idempotente (200 casos al azar)', () => {
  const r = rng(7);
  for (let i = 0; i < 200; i++) {
    const [a, b, c] = [libroAzar(r), libroAzar(r), libroAzar(r)];
    assert.ok(mismoContenido(fusionarLibros(a, b), fusionarLibros(b, a)), 'conmutativo');
    assert.ok(mismoContenido(fusionarLibros(fusionarLibros(a, b), c), fusionarLibros(a, fusionarLibros(b, c))), 'asociativo');
    assert.ok(mismoContenido(fusionarLibros(a, a), fusionarLibros(a)), 'idempotente');
    assert.ok(mismoContenido(fusionarLibros(fusionarLibros(a)), fusionarLibros(a)), 'la forma final es estable');
    const ab = fusionarLibros(a, b);
    assert.ok(mismoContenido(fusionarLibros(ab, b), ab) && mismoContenido(fusionarLibros(ab, a), ab), 'repetir no cambia nada');
  }
});
test('fusionar nunca baja el XP de ninguno de los dos', () => {
  const r = rng(11);
  const d = datosDemo();
  for (let i = 0; i < 100; i++) {
    const a = libroAzar(r), b = libroAzar(r);
    const f = fusionarLibros(a, b);
    const suma = (l) => Object.values(l.semanas ?? {}).reduce((t, x) => t + x[0], 0) + Object.values(l.retos ?? {}).reduce((t, x) => t + bonusRetos(x), 0);
    assert.ok(suma(f) >= suma(normalizarLibro(a)) && suma(f) >= suma(normalizarLibro(b)));
  }
  assert.ok(calcularXp(d)); // el demo sigue calculando
});
test('fusionar conserva el pico de cada semana (se pliega al calcular, no al fusionar)', () => {
  const f = fusionarLibros({ v: 2, semanas: { [semana(1)]: [40, 3, 4] } }, { v: 2, semanas: {}, picos: { [semana(1)]: 70 } });
  assert.deepEqual(f.semanas[semana(1)], [40, 3, 4]);
  assert.deepEqual(f.picos, { [semana(1)]: 70 });
  const g = fusionarLibros({ v: 2, semanas: {}, picos: { [semana(1)]: 70 } }, { v: 2, semanas: {}, picos: { [semana(0)]: 20, [semana(1)]: 30 } });
  assert.deepEqual(g.picos, { [semana(1)]: 70, [semana(0)]: 20 }, 'se queda el máximo de cada semana');
  // Al calcular, el pico de una semana ya cerrada sube su valor y se descarta del libro.
  const est = calcularXp(conLibro(datosDemo(), { ...asentar(datosDemo()).ajustes.xp, picos: { [semana(1)]: 150 } }));
  assert.equal(est.libro.semanas[semana(1)][0], 150);
  assert.equal(est.libro.picos?.[semana(1)], undefined);
  assert.equal(est.nuevo, true);
});
test('versiones antiguas y datos raros: se normalizan sin romper', () => {
  const v1 = { v: 1, semanas: { [semana(2)]: [55, 4, 4] } }; // libro de la Fase 1
  assert.deepEqual(normalizarLibro(v1), { v: 2, semanas: { [semana(2)]: [55, 4, 4] } });
  assert.deepEqual(normalizarLibro(undefined), { v: 2, semanas: {} });
  assert.deepEqual(normalizarLibro('basura'), { v: 2, semanas: {} });
  const sucio = { v: 99, campoFuturo: 1, semanas: { 'no-fecha': [1, 1, 1], [semana(1)]: [999999, 1, 1], [semana(2)]: [50, 'x', 1], [semana(3)]: [60, 3, 4], [semana(4)]: [1] }, retos: { [semana(1)]: 7, [semana(2)]: 2, x: 1 }, picos: { mal: 5, [semana(5)]: 0, [semana(6)]: 7 } };
  assert.deepEqual(normalizarLibro(sucio), { v: 2, semanas: { [semana(3)]: [60, 3, 4] }, retos: { [semana(2)]: 2 }, picos: { [semana(6)]: 7 } });
  // Un libro de la Fase 1 se sigue calculando y pasa a la versión 2 al guardarse.
  const d = conLibro(datosDemo(), v1);
  const est = calcularXp(d);
  assert.equal(est.libro.v, 2);
  assert.deepEqual(est.libro.semanas[semana(2)], [55, 4, 4], 'la semana ya cerrada se respeta');
});
test('fusionarProgreso: misma referencia si nada cambia, y conserva el resto de ajustes', () => {
  const d = asentar(datosDemo());
  assert.equal(fusionarProgreso(d, null), d);
  assert.equal(fusionarProgreso(d, { xp: d.ajustes.xp }), d, 'fusionar consigo mismo no cambia nada');
  assert.equal(fusionarProgreso(d, copia(d)), d);
  const otro = { v: 2, semanas: { [semana(30)]: [80, 4, 4] } };
  const con = { ...d, ajustes: { ...d.ajustes, apariencia: { tema: 'oro' } } };
  const f = fusionarProgreso(con, { xp: otro });
  assert.notEqual(f, con);
  assert.deepEqual(f.ajustes.apariencia, { tema: 'oro' });
  assert.deepEqual(f.ajustes.xp.semanas[semana(30)], [80, 4, 4]);
  assert.equal(fusionarProgreso(f, { xp: otro }), f, 'repetir no cambia nada');
});

// ---------- Cierre de sesión, volver a entrar y dos dispositivos ----------
test('cerrar sesión y volver a entrar no hace desaparecer el progreso', () => {
  const nube = nubeFalsa();
  let movil = asentar(datosDemo());
  movil = conLibro(movil, aplicarRetosServidor(movil.ajustes.xp, respuestaServidor({ [semana(2)]: 2 })));
  const antes = calcularXp(movil).xp;
  nube.subir(movil); // «volcarYa» antes de cerrar sesión
  movil = datosIniciales(); // cerrar sesión borra el móvil (privacidad en dispositivos compartidos)
  assert.equal(calcularXp(movil), null);
  const de_nuevo = nube.entrar(movil, true);
  assert.equal(calcularXp(de_nuevo).xp, antes);
  assert.equal(progresoNivel(antes).nivel, progresoNivel(calcularXp(de_nuevo).xp).nivel);
});
test('volver a entrar con una nube de una versión antigua (sin libro) no pierde lo del móvil ni lo recalcula distinto', () => {
  const movil = asentar(datosDemo());
  const antes = calcularXp(movil).xp;
  const nube = nubeFalsa();
  nube.subir({ ...movil, ajustes: { apariencia: { tema: 'oro' } } }); // una versión antigua guardó sin libro
  assert.equal(nube.datos.ajustes.xp, undefined);
  const mismoMovil = nube.entrar(movil, true);
  assert.equal(calcularXp(mismoMovil).xp, antes, 'el libro del móvil se conserva');
  // Móvil limpio (otro dispositivo): se recalcula con los mismos datos y los mismos días: mismo resultado.
  const limpio = nube.entrar(datosIniciales(), false);
  assert.equal(calcularXp(limpio).xp, antes);
});
test('dos dispositivos con libros distintos acaban iguales y sin duplicar XP', () => {
  const base = datosDemo();
  const nube = nubeFalsa();
  // A: ha cerrado todas las semanas y tiene retos. B: es un móvil atrasado con solo 3 semanas y otros días objetivo.
  const A = conLibro(base, aplicarRetosServidor(asentar(base).ajustes.xp, respuestaServidor({ [semana(2)]: 2 })));
  const completo = calcularXp(A).libro.semanas;
  const tres = Object.fromEntries(Object.entries(completo).slice(0, 3).map(([k, v]) => [k, [Math.max(0, v[0] - 20), v[1], v[2]]]));
  const B = conLibro(base, { v: 2, semanas: tres });
  const xpA = calcularXp(A).xp;

  const trasA = nube.subir(A);
  const trasB = nube.subir(B); // B sube después con su libro viejo: el de A no se pisa
  assert.equal(calcularXp(nube.datos).xp, xpA, 'la nube conserva el XP de A');
  assert.ok(calcularXp(trasB).xp >= xpA, 'B incorpora lo de A al subir');
  assert.equal(calcularXp(trasA).xp, xpA);
  // Sincronizar muchas veces seguidas no cambia nada.
  let m = trasB;
  for (let i = 0; i < 10; i++) m = nube.subir(m);
  assert.equal(calcularXp(m).xp, calcularXp(trasB).xp);
  assert.ok(mismoContenido(normalizarLibro(nube.datos.ajustes.xp), normalizarLibro(m.ajustes.xp)));
  // El orden en que suban no importa.
  const otra = nubeFalsa();
  otra.subir(B);
  otra.subir(A);
  assert.ok(mismoContenido(normalizarLibro(otra.datos.ajustes.xp), normalizarLibro(nube.datos.ajustes.xp)));
});
test('subir de forma repetida (misma versión) no genera cambios ni sube XP', () => {
  const nube = nubeFalsa();
  const d = asentar(datosDemo());
  nube.subir(d);
  const xp = calcularXp(d).xp;
  for (let i = 0; i < 20; i++) {
    const r = nube.subir(d);
    assert.equal(r, d, 'sin cambios: la misma referencia (no hay bucle de guardados)');
  }
  assert.equal(calcularXp(nube.datos).xp, xp);
});

// ---------- Historial, borrados y semanas cerradas ----------
test('borrar un entreno de la semana en curso no baja el XP (el pico se conserva)', () => {
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  const d0 = datosDemo();
  const sesionHoy = { ...d0.sesiones[0], id: 'hoy', fecha: hoy.getTime() };
  const d = asentar({ ...d0, sesiones: [sesionHoy, ...d0.sesiones.filter((s) => s.fecha < lunesDeSemana(0))] });
  const xp = calcularXp(d).xp;
  assert.ok(d.ajustes.xp.picos, 'se guardó el pico de la semana');
  const sin = { ...d, sesiones: d.sesiones.filter((s) => s.id !== 'hoy') };
  assert.equal(calcularXp(sin).xp, xp, 'borrar no baja el XP');
  // Sin pico (como en la Fase 1) sí bajaría: el pico es lo que lo evita.
  const sinPico = { ...sin, ajustes: { ...sin.ajustes, xp: { ...sin.ajustes.xp, picos: undefined } } };
  assert.ok(calcularXp(sinPico).xp < xp);
});
test('al cerrarse la semana se respeta el máximo alcanzado aunque se haya borrado el entreno', () => {
  const d0 = datosDemo();
  const pasada = semana(1);
  const sinEsaSemana = d0.sesiones.filter((s) => claveDia(s.fecha) < pasada || s.fecha >= lunesDeSemana(0));
  const libroSinCerrar = { v: 2, semanas: Object.fromEntries(Object.entries(calcularXp(d0).libro.semanas).filter(([k]) => k !== pasada)), picos: { [pasada]: 150 } };
  const d = conLibro({ ...d0, sesiones: sinEsaSemana }, libroSinCerrar);
  const est = calcularXp(d);
  assert.equal(est.libro.semanas[pasada][0], 150, 'la semana se cierra con el pico, no con lo que queda en los datos');
});
test('las semanas cerradas no se recalculan: cambiar días, borrar historial o vaciar comidas no las toca', () => {
  const d = asentar(datosDemo());
  const est = calcularXp(d);
  const cerrado = est.xp - est.semanaActual;
  const cambios = [
    { ...d, perfil: { ...d.perfil, dias: 6, diasSemana: [0, 1, 2, 3, 4, 5] } },
    { ...d, perfil: { ...d.perfil, peso: 120 } }, // cambia la meta de proteína
    { ...d, sesiones: [], comida: {} },
  ];
  for (const x of cambios) {
    const e = calcularXp(x);
    assert.equal(e.xp - e.semanaActual, cerrado);
  }
});

// ---------- Usuarios nuevos y cuentas existentes ----------
test('un usuario nuevo empieza en nivel 1 con 0 XP, y la primera semana suma bien', () => {
  const nuevo = { ...datosIniciales(), perfil: datosDemo().perfil };
  assert.equal(calcularXp(nuevo), null);
  assert.equal(progresoNivel(0).nivel, 1);
  assert.equal(progresoNivel(0).titulo, 'Chispa');
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  const s = { ...datosDemo().sesiones[0], id: 'primero', fecha: hoy.getTime() };
  const est = calcularXp({ ...nuevo, sesiones: [s] });
  assert.equal(est.xp, 10, 'un entreno = 10 pts, nada más');
  assert.equal(est.libro.retos, undefined);
  // Cuenta nueva con la nube vacía: no hay nada que fusionar.
  const nube = nubeFalsa();
  assert.equal(nube.entrar(nuevo, true), nuevo);
  const sube = nube.subir(nuevo);
  assert.equal(sube, nuevo);
});
test('una cuenta existente con datos anteriores (sin ajustes, sin libro, sin misiones) sigue funcionando', () => {
  const viejo = copia(datosDemo());
  delete viejo.ajustes;
  delete viejo.misiones;
  const d = { ...datosIniciales(), ...viejo };
  const est = calcularXp(d);
  assert.ok(est.xp > 0);
  const nube = nubeFalsa();
  const tras = nube.subir(asentar(d));
  assert.ok(tras.ajustes.xp.semanas);
  assert.equal(calcularXp(nube.entrar(datosIniciales(), false)).xp, est.xp);
});
