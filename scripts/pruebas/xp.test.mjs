// Pruebas de la Fase 1 (XP, niveles, atributos, misiones, dificultad). Se ejecutan con:
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/xp.test.mjs
// (usa Node, sin dependencias nuevas; ver scripts/pruebas/hooks.mjs)
// Son pruebas de LÓGICA con datos de ejemplo. No sustituyen a usar la app durante semanas.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { MINIMOS, atributos } from '../../src/atributos.ts';
import { misSemanas, puntosSemana } from '../../src/competicion.ts';
import { claveDia, datosIniciales, dificultadDe } from '../../src/datos.ts';
import { datosDemo } from '../../src/demo.ts';
import { esDiaDeEntreno, marcarMision, misionesHoy } from '../../src/misiones.ts';
import { TITULOS, XP_NOTA_ARENA, calcularXp, lunesDeSemana, nivelDeXp, progresoNivel, tituloDe, tramoDe, umbralNivel } from '../../src/xp.ts';

const DIA = 86400000;
const hace = (dias, hora = 12) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(hora, 0, 0, 0);
  return d.getTime();
};
const perfil = (extra = {}) => ({
  sexo: 'h', edad: 30, altura: 178, peso: 80, objetivo: 'musculo', objetivo2: null, dias: 3, diasSemana: [0, 2, 4],
  descargaHasta: null, nivel: 'principiante', equipo: 'gym', enfasis: 'ninguno', ajusteKcal: 0, ultimaRevision: null, ...extra,
});
const sesion = (dias, ejercicios = [['Press de banca', 3, 60]], extra = {}) => ({
  id: `s${dias}-${Math.random()}`, rutinaNombre: 'Empuje', fecha: hace(dias), minutos: 50,
  ejercicios: ejercicios.map(([nombre, n, peso]) => ({ nombre, series: Array.from({ length: n }, () => ({ peso, reps: 8 })) })), ...extra,
});
const conDatos = (extra) => ({ ...datosIniciales(), perfil: perfil(), ...extra });
const copia = (x) => JSON.parse(JSON.stringify(x));

// ---------- Niveles ----------
test('niveles en los límites', () => {
  const casos = [[0, 1], [1, 1], [49, 1], [50, 2], [199, 2], [200, 3], [449, 3], [450, 4], [799, 4], [800, 5], [4049, 9], [4050, 10], [18049, 19], [18050, 20], [1e6, 142]];
  for (const [xp, n] of casos) assert.equal(nivelDeXp(xp), n, `${xp} XP`);
  assert.equal(nivelDeXp(-5), 1);
});
test('umbrales coherentes con la fórmula', () => {
  assert.deepEqual([1, 2, 3, 5, 10, 20].map(umbralNivel), [0, 50, 200, 800, 4050, 18050]);
  for (let n = 1; n < 300; n++) {
    assert.equal(nivelDeXp(umbralNivel(n)), n);
    assert.equal(nivelDeXp(umbralNivel(n + 1) - 1), n);
  }
});
test('títulos por tramo', () => {
  assert.deepEqual(TITULOS, ['Chispa', 'Brasa', 'Llama', 'Acero']);
  const casos = [[1, 'Chispa'], [4, 'Chispa'], [5, 'Brasa'], [9, 'Brasa'], [10, 'Llama'], [19, 'Llama'], [20, 'Acero'], [80, 'Acero']];
  for (const [n, t] of casos) assert.equal(tituloDe(n), t, `nivel ${n}`);
  assert.deepEqual([4, 5, 9, 10, 19, 20].map(tramoDe), [0, 1, 1, 2, 2, 3]);
});
test('progreso hacia el siguiente nivel', () => {
  const p = progresoNivel(125);
  assert.equal(p.nivel, 2);
  assert.equal(p.faltan, 75);
  assert.equal(p.fraccion, (125 - 50) / 150);
  assert.equal(progresoNivel(0).fraccion, 0);
});

// ---------- XP ----------
test('sin perfil o sin ningún registro no hay XP calculable', () => {
  assert.equal(calcularXp({ ...datosIniciales(), perfil: null, sesiones: [sesion(10)] }), null);
  assert.equal(calcularXp(conDatos()), null);
});
test('el XP es exactamente la suma de puntosSemana (sin fórmula nueva) y sin retos', () => {
  const d = datosDemo();
  const est = calcularXp(d);
  const ss = misSemanas(d, est.cerradas.length + 1);
  const esperado = ss.reduce((a, s) => a + puntosSemana({ ...s, retos: 0 }), 0);
  assert.equal(est.xp, esperado);
  assert.ok(est.xp > 0);
  assert.equal(est.semanas.length, Math.min(8, est.cerradas.length + 1), 'solo semanas con historia, hasta 8');
  assert.equal(est.semanas.at(-1).actual, true);
});
test('semanas sin datos suman 0 y las semanas con datos suman', () => {
  const d = conDatos({ sesiones: [sesion(21)] });
  const est = calcularXp(d);
  assert.ok(est.xp >= 10);
  assert.ok(est.xp < 80);
  assert.equal(est.semanas.filter((s) => s.puntos === 0).length >= 1, true);
});
test('el libro de semanas cerradas es estable: cambiar los días objetivo no baja el XP ya ganado', () => {
  const d = datosDemo();
  const est = calcularXp(d);
  assert.equal(est.nuevo, true);
  const guardado = { ...d, ajustes: { ...d.ajustes, xp: est.libro } };
  const cerrado = est.xp - est.semanaActual;

  const seis = { ...guardado, perfil: { ...d.perfil, dias: 6, diasSemana: [0, 1, 2, 3, 4, 5] } };
  const est2 = calcularXp(seis);
  assert.equal(est2.nuevo, false);
  assert.equal(est2.xp - est2.semanaActual, cerrado, 'las semanas cerradas no cambian');
  // Sin libro, el mismo cambio SÍ bajaría el XP (es lo que se evita).
  const sinLibro = calcularXp({ ...d, perfil: seis.perfil });
  assert.ok(sinLibro.xp - sinLibro.semanaActual < cerrado);
});
test('el libro es idempotente', () => {
  const d = datosDemo();
  const a = calcularXp(d);
  const d1 = { ...d, ajustes: { xp: a.libro } };
  const b = calcularXp(d1);
  assert.equal(b.nuevo, false);
  assert.deepEqual(b.libro, a.libro);
  assert.equal(b.xp, a.xp);
});
test('borrar entrenos antiguos no baja las semanas cerradas', () => {
  const d = datosDemo();
  const est = calcularXp(d);
  const guardado = { ...d, ajustes: { xp: est.libro } };
  const cerrado = est.xp - est.semanaActual;
  const sinViejos = { ...guardado, sesiones: guardado.sesiones.filter((s) => s.fecha >= lunesDeSemana(0)), comida: {} };
  const e2 = calcularXp(sinViejos);
  assert.equal(e2.xp - e2.semanaActual, cerrado);
  // Con todo borrado, sigue habiendo XP (el del libro) y no se pierde.
  const vacio = calcularXp({ ...guardado, sesiones: [], comida: {} });
  assert.ok(vacio.xp >= cerrado);
});
test('en la semana en curso, borrar un entreno resta solo sus puntos', () => {
  const d = conDatos({ sesiones: [sesion(0 === new Date().getDay() ? 7 : 0), sesion(40)] });
  const e1 = calcularXp(d);
  const e2 = calcularXp({ ...d, sesiones: d.sesiones.slice(1) });
  assert.ok(e2.xp <= e1.xp);
});
test('datos antiguos sin campos nuevos cargan y calculan', () => {
  const viejo = copia(datosDemo());
  delete viejo.ajustes;
  delete viejo.misiones;
  delete viejo.perfil.dificultad;
  const d = { ...datosIniciales(), ...viejo };
  assert.ok(calcularXp(d).xp > 0);
  assert.ok(Array.isArray(misionesHoy(d)));
  assert.equal(dificultadDe(d.perfil), d.perfil.nivel);
});
test('el perfil explica de dónde sale el XP respecto a ARENA', () => {
  assert.match(XP_NOTA_ARENA, /mismas reglas de puntos que ARENA/);
  assert.match(XP_NOTA_ARENA, /retos se leen de tu cuenta/);
  const pantalla = readFileSync(new URL('../../src/Atleta.tsx', import.meta.url), 'utf8');
  assert.ok(pantalla.includes('XP_NOTA_ARENA'), 'el perfil muestra la nota');
  assert.ok(pantalla.includes('se lee de tu cuenta'), 'la regla de retos indica de dónde sale');
});

// ---------- Dificultad ----------
test('dificultad: punto de partida según el nivel (nunca Exigente sin elegirla), y son independientes', () => {
  const p = perfil({ nivel: 'avanzado' });
  assert.equal(dificultadDe(p), 'intermedio', 'un nivel físico avanzado NO implica dificultad Exigente');
  assert.equal(dificultadDe(perfil({ nivel: 'principiante' })), 'principiante');
  assert.equal(dificultadDe(perfil({ nivel: 'intermedio' })), 'intermedio');
  assert.equal(dificultadDe({ ...p, dificultad: 'avanzado' }), 'avanzado', 'solo si la eliges tú');
  const q = { ...p, dificultad: 'principiante' };
  assert.equal(dificultadDe(q), 'principiante');
  assert.equal(q.nivel, 'avanzado');
  assert.equal(dificultadDe({ ...q, nivel: 'intermedio' }), 'principiante');
});

// ---------- Atributos ----------
test('los mínimos de datos son los aprobados por Francisco', () => {
  assert.deepEqual({ ...MINIMOS }, { disciplinaSemanas: 2, fuerzaEjercicios: 2, volumenSemanas: 2, nutricionDias: 14, equilibrioSeries: 24, equilibrioGrupos: 3 });
});
const seriesDia = (dias, nombre, n, peso = 50) => sesion(dias, [[nombre, n, peso]]);
test('sin datos no se muestra ninguna cifra', () => {
  const d = conDatos({ sesiones: [sesion(3)] });
  const attrs = atributos(d, calcularXp(d));
  for (const a of attrs) {
    assert.equal(a.visible, false, a.id);
    assert.ok(a.falta, a.id);
    assert.equal(a.texto, '');
  }
});
test('Disciplina: aparece con 2 semanas completas y no antes', () => {
  const pocas = conDatos({ sesiones: [sesion(9)] });
  const e1 = calcularXp(pocas);
  assert.ok(e1.cerradas.length < MINIMOS.disciplinaSemanas + 1);
  const d = datosDemo();
  const a = atributos(d, calcularXp(d)).find((x) => x.id === 'disciplina');
  assert.equal(a.visible, true);
  assert.match(a.texto, /\d+ % de tus días objetivo/);
  assert.ok(a.barra >= 0 && a.barra <= 1);
  const una = atributos(pocas, { ...e1, cerradas: e1.cerradas.slice(0, 1) }).find((x) => x.id === 'disciplina');
  assert.equal(una.visible, false);
});
test('Disciplina: la semana en la que empezaste a mitad de semana no cuenta', () => {
  const d = datosDemo();
  const est = calcularXp(d);
  const ya = est.cerradas.filter((s) => !s.parcial).length;
  const jueves = (() => {
    const t = new Date(lunesDeSemana(2));
    t.setDate(t.getDate() + 3);
    t.setHours(12);
    return t.getTime();
  })();
  const aMedias = conDatos({ sesiones: [{ ...sesion(16), fecha: jueves }, sesion(2)] });
  const e2 = calcularXp(aMedias);
  assert.equal(e2.cerradas[0].parcial, true);
  assert.equal(e2.cerradas.filter((s) => !s.parcial).length, e2.cerradas.length - 1);
  assert.ok(ya >= 2);
  const a = atributos(aMedias, e2).find((x) => x.id === 'disciplina');
  assert.equal(a.visible, false, 'con una sola semana completa no se muestra');
});
test('Disciplina: con un solo entreno en semanas de inactividad no se muestra una cifra engañosa', () => {
  const d = conDatos({ sesiones: [sesion(40)] });
  const e = calcularXp(d);
  assert.ok(e.cerradas.length >= 5, 'hay semanas completas, pero casi todas vacías');
  const a = atributos(d, e).find((x) => x.id === 'disciplina');
  assert.equal(a.visible, false);
  assert.match(a.falta, /algún entreno registrado/);
  assert.equal(a.texto, '');
});
test('Progreso de fuerza: necesita 2 ejercicios comparables y no cuenta descargas ni ejercicios sin peso', () => {
  const base = [seriesDia(60, 'Press de banca', 3, 50), seriesDia(5, 'Press de banca', 3, 55)];
  const uno = conDatos({ sesiones: base });
  assert.equal(atributos(uno, null).find((x) => x.id === 'fuerza').visible, false);
  const dos = conDatos({ sesiones: [...base, seriesDia(60, 'Sentadilla', 3, 80), seriesDia(6, 'Sentadilla', 3, 88)] });
  const f = atributos(dos, null).find((x) => x.id === 'fuerza');
  assert.equal(f.visible, true);
  assert.match(f.texto, /^\+[\d,]+ % en 2 ejercicios$/);
  assert.ok(f.barra > 0 && f.barra < 1);
  // Peso corporal (peso 0): no cuenta.
  const sinPeso = conDatos({ sesiones: [seriesDia(60, 'Flexiones', 3, 0), seriesDia(5, 'Flexiones', 3, 0), seriesDia(60, 'Fondos', 3, 0), seriesDia(5, 'Fondos', 3, 0)] });
  assert.equal(atributos(sinPeso, null).find((x) => x.id === 'fuerza').visible, false);
  // Las descargas no cuentan.
  const desc = conDatos({ sesiones: [...base.map((s) => ({ ...s, descarga: true })), seriesDia(60, 'Sentadilla', 3, 80), seriesDia(6, 'Sentadilla', 3, 88)] });
  assert.equal(atributos(desc, null).find((x) => x.id === 'fuerza').visible, false);
  // Sin mejora: texto neutro y barra vacía, sin mensajes de culpa.
  const peor = conDatos({ sesiones: [seriesDia(60, 'Press de banca', 3, 60), seriesDia(5, 'Press de banca', 3, 55), seriesDia(60, 'Sentadilla', 3, 80), seriesDia(6, 'Sentadilla', 3, 80)] });
  const p = atributos(peor, null).find((x) => x.id === 'fuerza');
  assert.equal(p.visible, true);
  assert.equal(p.barra, 0);
  assert.match(p.detalle, /Sin mejora de peso reciente/);
});
test('Volumen: pide plan de coach y 2 semanas completas con entrenos', () => {
  const plan = { id: 'r', nombre: 'Empuje', deCoach: true, dia: 0, ejercicios: [{ id: 'e', nombre: 'Press de banca', series: 4, reps: 8 }] };
  const sinPlan = conDatos({ sesiones: [seriesDia(8, 'Press de banca', 4), seriesDia(15, 'Press de banca', 4)] });
  assert.equal(atributos(sinPlan, null).find((x) => x.id === 'volumen').visible, false);
  const unaSemana = conDatos({ rutinas: [plan], sesiones: [seriesDia(8, 'Press de banca', 4)] });
  assert.equal(atributos(unaSemana, null).find((x) => x.id === 'volumen').visible, false);
  const dos = conDatos({ rutinas: [plan], sesiones: [seriesDia(8, 'Press de banca', 4), seriesDia(15, 'Press de banca', 2)] });
  const v = atributos(dos, null).find((x) => x.id === 'volumen');
  assert.equal(v.visible, true);
  assert.match(v.texto, /^3 de 4 series\/semana \(75 %\)$/);
});
test('Nutrición: solo con 14 días registrados; los días sin registro no cuentan en contra', () => {
  const meta = 100; // se comprueba más abajo con el perfil real
  const dia = (i, prot) => [claveDia(hace(i)), [{ id: `c${i}`, nombre: 'Comida', proteina: prot, kcal: 500 }]];
  const dias = (n, prot) => Object.fromEntries(Array.from({ length: n }, (_, k) => dia(k + 1, prot)));
  const trece = conDatos({ comida: dias(MINIMOS.nutricionDias - 1, meta + 500) });
  assert.equal(atributos(trece, null).find((x) => x.id === 'nutricion').visible, false);
  const catorce = conDatos({ comida: dias(MINIMOS.nutricionDias, 500) });
  const n = atributos(catorce, null).find((x) => x.id === 'nutricion');
  assert.equal(n.visible, true);
  assert.equal(n.texto, 'Tu proteína 14 de 14 días registrados');
  // Con huecos (días sin registrar) y días flojos: solo cuentan los registrados.
  const mezcla = conDatos({ comida: { ...dias(10, 500), ...Object.fromEntries(Array.from({ length: 6 }, (_, k) => dia(k + 15, 5))) } });
  const m = atributos(mezcla, null).find((x) => x.id === 'nutricion');
  assert.equal(m.texto, 'Tu proteína 10 de 16 días registrados');
});
test('Equilibrio: mínimo de series y de grupos; reparto sin nota', () => {
  const ses = (...x) => x.map(([dias, nombre, n]) => seriesDia(dias, nombre, n));
  const pocas = conDatos({ sesiones: ses([3, 'Press de banca', 8], [5, 'Sentadilla', 8], [7, 'Remo con barra', MINIMOS.equilibrioSeries - 17]) });
  assert.equal(atributos(pocas, null).find((x) => x.id === 'equilibrio').visible, false);
  const dosGrupos = conDatos({ sesiones: ses([3, 'Press de banca', 20], [5, 'Sentadilla', 20]) });
  assert.equal(atributos(dosGrupos, null).find((x) => x.id === 'equilibrio').visible, false);
  const ok = conDatos({ sesiones: ses([3, 'Press de banca', 10], [5, 'Sentadilla', 10], [7, 'Remo con barra', 8]) });
  const e = atributos(ok, null).find((x) => x.id === 'equilibrio');
  assert.equal(e.visible, true);
  assert.equal(e.barra, undefined, 'no hay nota');
  assert.ok(Math.abs(e.reparto.reduce((a, r) => a + r.pct, 0) - 1) < 1e-9);
  assert.match(e.detalle, /No es una nota/);
});
test('Recuperación no se muestra en la Fase 1', () => {
  const ids = atributos(datosDemo(), calcularXp(datosDemo())).map((a) => a.id);
  assert.ok(!ids.includes('recuperacion'));
  assert.deepEqual(new Set(ids), new Set(['disciplina', 'fuerza', 'volumen', 'nutricion', 'equilibrio']));
});

// ---------- Misiones ----------
// Miércoles 12:00 local (día 2): en el demo es día sin entreno (diasSemana 0,1,3,4); el jueves (3) sí.
const proximo = (diaSemana) => {
  const d = new Date(2026, 10, 2 + diaSemana, 12); // 2 nov 2026 es lunes
  return d.getTime();
};
test('misiones: día de entreno y día de descanso', () => {
  const d = datosDemo();
  const jueves = proximo(3);
  assert.equal(esDiaDeEntreno(d, jueves), true);
  const m = misionesHoy({ ...d, sesiones: [], comida: {} }, jueves);
  assert.deepEqual(m.map((x) => x.id), ['entrenar', 'proteina', 'calentar', 'animo']);
  assert.ok(m.every((x) => x.estado === 'pendiente'));
  const miercoles = proximo(2);
  assert.equal(esDiaDeEntreno(d, miercoles), false);
  const r = misionesHoy({ ...d, sesiones: [], comida: {} }, miercoles);
  assert.deepEqual(r.map((x) => x.id), ['descansar', 'proteina']);
  assert.equal(r[0].estado, 'hecha', 'descansar cuenta como hecho');
  assert.equal(r[0].automatica, true);
});
test('misiones: omitir, marcar a mano, deshacer; sin XP ni penalización', () => {
  const d = datosDemo();
  const j = proximo(3);
  const xp0 = calcularXp(d).xp;
  const vista = (x) => misionesHoy({ ...x, sesiones: [], comida: {} }, j); // día sin datos: todo pendiente
  const estado = (x, id) => vista(x).find((m) => m.id === id).estado;
  let x = marcarMision(d, 'proteina', 'omitida', j);
  assert.equal(estado(x, 'proteina'), 'omitida');
  x = marcarMision(x, 'calentar', 'hecha', j);
  assert.equal(estado(x, 'calentar'), 'hecha');
  x = marcarMision(x, 'proteina', 'pendiente', j);
  assert.equal(estado(x, 'proteina'), 'pendiente');
  assert.equal(calcularXp(x).xp, xp0, 'las misiones no cambian el XP');
  assert.equal(misionesHoy({ ...x, sesiones: [], comida: {} }, proximo(4)).find((m) => m.id === 'calentar').estado, 'pendiente', 'cada día empieza limpio');
});
test('misiones: entreno y proteína se marcan solos con los datos', () => {
  const d = datosDemo();
  const j = proximo(3);
  const conEntreno = { ...d, sesiones: [{ ...d.sesiones[0], fecha: j }] };
  const m = misionesHoy(conEntreno, j);
  assert.equal(m[0].estado, 'hecha');
  assert.equal(m[0].automatica, true);
  assert.ok(!m.some((x) => x.id === 'calentar'), 'tras entrenar ya no se pide calentar');
  const conProt = { ...d, sesiones: [], comida: { ...d.comida, [claveDia(j)]: [{ id: 'p', nombre: 'Todo', proteina: 999, kcal: 100 }] } };
  const p = misionesHoy(conProt, j).find((x) => x.id === 'proteina');
  assert.equal(p.estado, 'hecha');
  assert.equal(p.automatica, true);
});
test('misiones: solo se guardan 14 días y no quedan días vacíos', () => {
  const d = datosDemo();
  let x = d;
  for (let i = 0; i < 30; i++) x = marcarMision(x, 'proteina', 'omitida', proximo(0) + i * DIA);
  const claves = Object.keys(x.misiones.omitidas);
  assert.ok(claves.length <= 15, `${claves.length} días guardados`);
  x = marcarMision(x, 'proteina', 'pendiente', proximo(0) + 29 * DIA);
  assert.ok(!(claveDia(proximo(0) + 29 * DIA) in x.misiones.omitidas));
  assert.equal(misionesHoy({ ...datosIniciales(), perfil: null }).length, 0);
});

// ---------- Alcance: nada de servidor ni de otros sistemas ----------
test('los archivos nuevos no usan Supabase, la nube ni el servidor de ARENA', () => {
  for (const f of ['xp.ts', 'atributos.ts', 'misiones.ts', 'Atleta.tsx', 'sincronizacion.ts']) {
    const t = readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!/supabase|from '\.\/nube'|servidorArena|ArenaNube|fetch\(/.test(t), `${f} no debe tocar el servidor (la red está solo en nube.ts y App.tsx)`);
  }
});
test('las 8 migraciones ya aplicadas no han cambiado (huella) y la única nueva es la 9: avisos y capturas de opiniones', async () => {
  const { createHash } = await import('node:crypto');
  const huellas = {
    '20261112000001_base_perfiles.sql': 'd38861cb8a1ee6a4f539b02d4ddd355df6a36a06014b18e9974b63d489c6cebf',
    '20261112000002_base_datos.sql': '6d2d8c9da2cd38ee389dba3303040b1516aa2a0b0c5e34b1dd600cc8b70abb95',
    '20261112000003_base_borrar_cuenta.sql': 'a10c45c10e542a85a4bff17cd03376fe152279f1c3f6c3b59604b1e7ad65fd9d',
    '20261112000004_arena.sql': '70796c1b1b5d03bf8db41884f9fe9e62dce4a2adeee375e344e6391ff84b156e',
    '20261112000005_arena_acciones.sql': 'ed0a3d689121a7ca81b9b1210a8355d4e74a9607748f7f9a296b966ceebfd497',
    '20261112000006_arena_permisos.sql': '99f18a4ec9802e143488dc3f128f35e86ec16354fde6fdb57a309120987dba4a',
    '20261112000007_seguridad.sql': 'a4b7cb24b6e6cc1c57a69c172a48c9ae5b43809b3efe82b42517f75064a40c2d',
    '20261118000008_beta_opiniones.sql': 'e09a7b54e9ac2fb617805b9e895790ea623d726a21652c890d33e8e212f66e85',
  };
  const carpeta = new URL('../../supabase/migrations/', import.meta.url);
  const m = readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort();
  assert.deepEqual(m, [...Object.keys(huellas), '20261120000009_opiniones_avisos_y_capturas.sql'], 'solo se añade la migración 9');
  for (const [f, h] of Object.entries(huellas)) assert.equal(createHash('sha256').update(readFileSync(new URL(f, carpeta))).digest('hex'), h, `${f} no debe cambiar`);
  // La 9 solo toca lo suyo: no borra tablas ni datos ni toca las tablas de las reglas de Arena (solo reemplaza la función de opiniones de la 8).
  const nueva = readFileSync(new URL('20261120000009_opiniones_avisos_y_capturas.sql', carpeta), 'utf8').replace(/--[^\n]*/g, '');
  assert.ok(!/drop\s+table|delete\s+from|truncate/i.test(nueva), 'la migración 9 no borra tablas ni datos');
  assert.ok(!/(alter|drop)\s+(table|function)[^;]*(actividad|marcas|retos|amistades|perfiles|datos_usuario|registrar_entreno|ranking)/i.test(nueva), 'la migración 9 no toca Arena ni los datos de la cuenta');
});
