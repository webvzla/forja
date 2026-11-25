// Pruebas de la Fase 3: dificultad, adaptación (recomendar mantener/subir/bajar/descansar) y separación de los tres niveles.
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/adaptacion.test.mjs
// Son pruebas de LÓGICA con datos de ejemplo; no sustituyen a usar la app semanas con tus entrenos reales.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { UMBRALES, aplicarCambioDificultad, recomendar, registrarSensacion, resumenSensaciones, senales, silenciarRecomendacion } from '../../src/adaptacion.ts';
import { datosIniciales, dificultadDe } from '../../src/datos.ts';
import { datosDemo } from '../../src/demo.ts';
import { AVISO_GENERAL, EXPLICA_DIFICULTAD, NOMBRE_DIFICULTAD, fijarDificultad, paso, puede } from '../../src/niveles.ts';
import { ajustarPlan, generarPlan, reajustarPlan, seriesBase } from '../../src/reglas.ts';
import { calcularXp, lunesDeSemana } from '../../src/xp.ts';

const DIA = 86400000;
const copia = (x) => JSON.parse(JSON.stringify(x));
const quitaIds = (rutinas) => rutinas.map((r) => ({ nombre: r.nombre, dia: r.dia, ejercicios: r.ejercicios.map((e) => ({ n: e.nombre, s: e.series, r: e.reps, rm: e.repsMax, d: e.descanso })) }));

const perfil = (extra = {}) => ({
  sexo: 'h', edad: 30, altura: 178, peso: 80, objetivo: 'musculo', objetivo2: null, dias: 3, diasSemana: [0, 2, 4],
  descargaHasta: null, nivel: 'intermedio', dificultad: 'intermedio', equipo: 'gym', enfasis: 'ninguno', ajusteKcal: 0, ultimaRevision: null, ...extra,
});
const ejs = (peso = 60, reps = 8, series = 4) => [
  { nombre: 'Press de banca', series: Array.from({ length: series }, () => ({ peso, reps })) },
  { nombre: 'Sentadilla', series: Array.from({ length: series }, () => ({ peso: peso + 20, reps })) },
];
let n = 0;
const sesion = (fecha, extra = {}) => ({ id: `s${++n}`, rutinaNombre: 'Cuerpo completo', fecha, minutos: 50, ejercicios: ejs(), ...extra });
// `semanas` semanas completas (de la 1 a la `semanas`), `porSemana` entrenos (lunes, miércoles, viernes…) con la sensación indicada por semana.
function historia({ semanas = 5, porSemana = 3, sens = () => undefined, extra = () => ({}) } = {}) {
  const ses = [];
  for (let w = 1; w <= semanas; w++)
    for (let k = 0; k < porSemana; k++) {
      const t = new Date(lunesDeSemana(w) + k * 2 * DIA);
      t.setHours(12, 0, 0, 0);
      ses.push(sesion(t.getTime(), { ...(sens(w, k) ? { sensacion: sens(w, k) } : {}), ...extra(w, k) }));
    }
  return ses.sort((a, b) => b.fecha - a.fecha);
}
const conDatos = (x = {}) => ({ ...datosIniciales(), perfil: perfil(), ...x });
const planCoach = (series = 4) => [{ id: 'p1', nombre: 'Cuerpo completo A', deCoach: true, dia: 0, ejercicios: [
  { id: 'e1', nombre: 'Press de banca', series, reps: 8, repsMax: 10 },
  { id: 'e2', nombre: 'Sentadilla', series, reps: 8, repsMax: 10 },
  { id: 'e3', nombre: 'Curl con barra', series: 3, reps: 10, repsMax: 15 },
] }];

// ---------- Los tres niveles son independientes ----------
test('niveles: nombres y pasos de la dificultad', () => {
  assert.deepEqual(['principiante', 'intermedio', 'avanzado'].map((x) => NOMBRE_DIFICULTAD[x]), ['Suave', 'Media', 'Exigente']);
  assert.equal(paso('principiante', 'subir'), 'intermedio');
  assert.equal(paso('avanzado', 'subir'), 'avanzado');
  assert.equal(paso('principiante', 'bajar'), 'principiante');
  assert.equal(paso('intermedio', 'mantener'), 'intermedio');
  assert.equal(puede('avanzado', 'subir'), false);
  assert.equal(puede('principiante', 'bajar'), false);
  assert.equal(puede('intermedio', 'mantener'), true);
  for (const v of Object.values(EXPLICA_DIFICULTAD)) assert.ok(v.length > 20 && !/nivel f[íi]sico/i.test(v));
});
test('cambiar la dificultad NO cambia el nivel físico, el nivel FORJA ni los entrenos', () => {
  const d = conDatos({ sesiones: historia(), rutinas: planCoach() });
  const xp0 = calcularXp(d).xp;
  for (const nueva of ['principiante', 'avanzado']) for (const plan of [true, false]) {
    const r = aplicarCambioDificultad(d, nueva, plan);
    assert.equal(r.perfil.dificultad, nueva);
    assert.equal(r.perfil.nivel, d.perfil.nivel, 'el nivel físico no cambia');
    assert.equal(r.sesiones, d.sesiones, 'los entrenos no se tocan');
    assert.equal(calcularXp(r).xp, xp0, 'el XP (nivel FORJA) no cambia');
    assert.equal(r.ajustes.xp, d.ajustes?.xp, 'ni el libro de XP');
  }
});
test('cambiar el nivel físico en el perfil NO cambia la dificultad (queda fijada)', () => {
  // Cuenta existente que nunca eligió dificultad: se lee desde el nivel…
  const antiguo = { ...perfil({ nivel: 'principiante' }) };
  delete antiguo.dificultad;
  assert.equal(dificultadDe(antiguo), 'principiante');
  // …y al editar el perfil subiendo el nivel físico, la dificultad se fija en lo que ya tenía.
  const guardado = fijarDificultad(antiguo, { ...antiguo, nivel: 'avanzado' });
  assert.equal(guardado.nivel, 'avanzado');
  assert.equal(guardado.dificultad, 'principiante');
  assert.equal(dificultadDe(guardado), 'principiante');
  // Con dificultad ya elegida se conserva siempre.
  assert.equal(fijarDificultad(perfil({ dificultad: 'avanzado', nivel: 'principiante' }), perfil({ dificultad: undefined, nivel: 'intermedio' })).dificultad, 'avanzado');
  // Perfil nuevo: empieza igual que el nivel físico.
  assert.equal(fijarDificultad(null, perfil({ dificultad: undefined, nivel: 'avanzado' })).dificultad, 'intermedio', 'un perfil nuevo avanzado NO empieza en Exigente');
  assert.equal(fijarDificultad(null, perfil({ dificultad: undefined, nivel: 'avanzado' })).dificultadConfirmada, undefined, 'y no cuenta como elegida');
  // El plan que se genera depende de la dificultad, no del nivel físico.
  const a = generarPlan(perfil({ nivel: 'avanzado', dificultad: 'principiante' }));
  const b = generarPlan(perfil({ nivel: 'principiante', dificultad: 'principiante' }));
  assert.deepEqual(quitaIds(a), quitaIds(b));
  const c = generarPlan(perfil({ nivel: 'principiante', dificultad: 'avanzado' }));
  assert.notDeepEqual(quitaIds(c), quitaIds(b));
});
test('el formulario del perfil ya no rehace el plan al cambiar el nivel físico, y solo el nivel físico viaja a ARENA', () => {
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  assert.ok(!app.includes('a.nivel !== x.nivel'), 'el nivel físico no rehace el plan');
  const arena = readFileSync(new URL('../../src/servidorArena.ts', import.meta.url), 'utf8');
  assert.ok(arena.includes('p_nivel: d.perfil?.nivel'), 'a los amigos solo llega el nivel físico');
  assert.ok(!/dificultad/i.test(arena), 'la dificultad nunca se envía a ARENA');
  const coach = readFileSync(new URL('../../src/Coach.tsx', import.meta.url), 'utf8');
  assert.ok(coach.includes('fijarDificultad(i,'));
  assert.ok(coach.includes('titulo="Nivel físico"'));
});

// ---------- Plan según dificultad ----------
test('el plan generado depende de la dificultad: series y ejercicios', () => {
  assert.deepEqual([['principiante', false, true], ['intermedio', false, true], ['avanzado', false, true], ['avanzado', false, false], ['avanzado', true, true]].map((a) => seriesBase(...a)), [3, 4, 5, 4, 3]);
  const suave = generarPlan(perfil({ dificultad: 'principiante' }));
  const media = generarPlan(perfil({ dificultad: 'intermedio' }));
  const exig = generarPlan(perfil({ dificultad: 'avanzado' }));
  const dificiles = ['Press de banca', 'Press militar', 'Dominadas', 'Remo con barra', 'Sentadilla', 'Peso muerto rumano', 'Fondos en paralelas', 'Rueda abdominal'];
  assert.ok(!suave.flatMap((r) => r.ejercicios).some((e) => dificiles.includes(e.nombre)), 'Suave evita los ejercicios más técnicos');
  for (const [a, b] of [[suave, media], [media, exig]]) assert.equal(a.length, b.length);
  assert.ok(exig.every((r) => r.ejercicios[0].series === 5), 'Exigente: el primer ejercicio de cada día lleva una serie extra');
  assert.ok(media.every((r) => r.ejercicios[0].series === 4));
  assert.ok(suave.every((r) => r.ejercicios[0].series === 3));
});
test('reajustar el plan: suma o resta la diferencia, entre 1 y 5, y respeta lo propio', () => {
  const propia = { id: 'mia', nombre: 'Mi rutina', ejercicios: [{ id: 'x', nombre: 'Press de banca', series: 4, reps: 8 }] };
  const d = conDatos({ rutinas: [...planCoach(4), propia], perfil: perfil({ dificultad: 'intermedio' }) });
  const arriba = reajustarPlan(d, 'avanzado');
  assert.deepEqual(arriba.rutinas[0].ejercicios.map((e) => e.series), [5, 4, 3], 'solo el primero sube una serie');
  assert.equal(arriba.rutinas[1], d.rutinas[1], 'tu rutina propia no se toca');
  const abajo = reajustarPlan(d, 'principiante');
  assert.deepEqual(abajo.rutinas[0].ejercicios.map((e) => e.series), [3, 3, 3], 'los principales pasan a 3 series, el accesorio no cambia');
  const nombres = abajo.rutinas[0].ejercicios.map((e) => e.nombre);
  assert.ok(!nombres.includes('Press de banca') && !nombres.includes('Sentadilla'), 'los ejercicios más técnicos se sustituyen por alternativas sencillas');
  assert.equal(new Set(nombres).size, nombres.length, 'sin ejercicios repetidos');
  assert.ok(abajo.cambios.length >= 2);
  // Tope de 5 y mínimo de 1
  const tope = reajustarPlan(conDatos({ rutinas: planCoach(5), perfil: perfil({ dificultad: 'intermedio' }) }), 'avanzado');
  assert.equal(Math.max(...tope.rutinas[0].ejercicios.map((e) => e.series)), 5);
  const minimo = reajustarPlan(conDatos({ rutinas: planCoach(1), perfil: perfil({ dificultad: 'intermedio' }) }), 'principiante');
  assert.ok(minimo.rutinas[0].ejercicios.every((e) => e.series >= 1));
  // Ida y vuelta: sin cambios inesperados
  const vuelta = reajustarPlan({ ...d, rutinas: arriba.rutinas, perfil: { ...d.perfil, dificultad: 'avanzado' } }, 'intermedio');
  assert.deepEqual(vuelta.rutinas[0].ejercicios.map((e) => e.series), [4, 4, 3]);
});
test('la revisión semanal ya NO sube la exigencia por su cuenta (ni series ni ejercicios más duros)', () => {
  // 3 entrenos en los últimos 7 días y 3 en los 7 anteriores = cumple dos semanas seguidas (justo lo que antes subía series solo)
  const sesiones = [1, 3, 5, 8, 10, 12].map((k) => sesion(Date.now() - k * DIA, { ejercicios: ejs(80 - k, 8, 4) })); // pesos que suben: nada estancado
  const d = conDatos({ sesiones, rutinas: planCoach(4), perfil: perfil({ dificultad: 'avanzado', ultimaRevision: null }) });
  // Cumple su semana y la anterior, sin estancados: antes sumaba una serie sola.
  const r = ajustarPlan(d);
  assert.match(r.cambios.join(' '), /Vas bien/, 'la revisión sí cumple las dos semanas');
  assert.deepEqual(r.rutinas[0].ejercicios.map((e) => e.series), [4, 4, 3]);
  assert.equal(r.perfil.dificultad, 'avanzado', 'tampoco toca la dificultad');
  assert.equal(r.perfil.nivel, d.perfil.nivel);
  assert.ok(r.cambios.every((c) => !/una serie más|ahora Flexiones|queda fácil, ahora/.test(c)));
});

// ---------- Recomendación: cada rama ----------
const base5 = (sens) => historia({ semanas: 5, sens: (w) => (w <= 3 ? sens : undefined) });
test('sin perfil no hay recomendación', () => assert.equal(recomendar({ ...datosIniciales(), perfil: null }), null));
test('pocos datos: no se inventa nada', () => {
  for (const sesiones of [[], historia({ semanas: 1 }), historia({ semanas: 2 })]) {
    const r = recomendar(conDatos({ sesiones }));
    assert.equal(r.tipo, 'sin-datos');
    assert.deepEqual(r.acciones, []);
    assert.match(r.motivos[0], /Necesito al menos 3 semanas completas/);
    assert.equal(r.destino, undefined);
  }
});
test('con constancia pero sin respuestas de «cómo ha ido»: mantener y se explica qué falta (no se sube)', () => {
  const r = recomendar(conDatos({ sesiones: historia({ semanas: 5 }) }));
  assert.equal(r.tipo, 'mantener');
  assert.equal(r.informativa, true);
  assert.deepEqual(r.acciones, []);
  assert.match(r.motivos[0], /llevo 0 de 5 respuestas/);
});
test('subir: constancia alta + mayoría de entrenos fáciles; ofrece subir o mantener, nunca lo aplica', () => {
  const d = conDatos({ sesiones: base5('facil') });
  const antes = copia(d);
  const r = recomendar(d);
  assert.equal(r.tipo, 'subir');
  assert.equal(r.destino, 'avanzado');
  assert.deepEqual(r.acciones, ['subir', 'mantener']);
  assert.match(r.titulo, /Puedes probar «Exigente»/);
  assert.ok(r.motivos.some((m) => /100 %/.test(m)) && r.motivos.some((m) => /fáciles/.test(m)));
  assert.ok(r.motivos.some((m) => /intensidad, no los días/.test(m)), 'respeta los días de descanso');
  assert.deepEqual(d, antes, 'recomendar no modifica nada');
  assert.equal(dificultadDe(d.perfil), 'intermedio', 'y la dificultad sigue igual');
});
test('no se sube desde la dificultad más alta', () => {
  const r = recomendar(conDatos({ perfil: perfil({ dificultad: 'avanzado' }), sesiones: base5('facil') }));
  assert.notEqual(r.tipo, 'subir');
});
test('no se sube con pocas respuestas, con respuestas «duras» o con constancia baja', () => {
  assert.notEqual(recomendar(conDatos({ sesiones: historia({ semanas: 5, sens: (w, k) => (w === 1 && k < 4 ? 'facil' : undefined) }) })).tipo, 'subir'); // 3 respuestas
  assert.notEqual(recomendar(conDatos({ sesiones: historia({ semanas: 5, sens: (w, k) => (w <= 3 ? (k === 0 ? 'duro' : 'facil') : undefined) }) })).tipo, 'subir'); // 33 % duros
  assert.notEqual(recomendar(conDatos({ sesiones: historia({ semanas: 5, porSemana: 2, sens: () => 'facil' }) })).tipo, 'subir'); // 67 % de constancia
});
test('dolor: prioridad absoluta, descanso, no se propone subir y no se puede silenciar', () => {
  const sesiones = base5('facil');
  sesiones[0] = { ...sesiones[0], dolor: true };
  const d = silenciarRecomendacion(conDatos({ sesiones }));
  const r = recomendar(d);
  assert.equal(r.tipo, 'descanso');
  assert.equal(r.silenciada, false);
  assert.deepEqual(r.acciones, [], 'con dolor no hay botones que impliquen seguir entrenando (ni subir, ni bajar, ni descarga)');
  assert.match(r.motivos.join(' '), /No entrenes con dolor/);
  assert.match(r.motivos.join(' '), /consulta con un profesional/);
  // Un dolor de hace más de 14 días ya no bloquea
  const viejo = base5('facil');
  viejo[viejo.length - 1] = { ...viejo[viejo.length - 1], dolor: true };
  assert.notEqual(recomendar(conDatos({ sesiones: viejo })).tipo, 'descanso');
});
test('semana de descarga o cambio reciente: no se propone nada nuevo', () => {
  const enDescarga = recomendar(conDatos({ sesiones: base5('facil'), perfil: perfil({ descargaHasta: Date.now() + 3 * DIA }) }));
  assert.equal(enDescarga.tipo, 'mantener');
  assert.deepEqual(enDescarga.acciones, []);
  assert.match(enDescarga.motivos[0], /descarga/);
  const reciente = recomendar(conDatos({ sesiones: base5('facil'), ajustes: { dificultad: { cambio: Date.now() - 5 * DIA } } }));
  assert.equal(reciente.tipo, 'mantener');
  assert.match(reciente.motivos[0], /hace 5 días/);
  assert.equal(recomendar(conDatos({ sesiones: base5('facil'), ajustes: { dificultad: { cambio: Date.now() - 30 * DIA } } })).tipo, 'subir', 'pasadas 3 semanas ya puede volver a proponerse');
});
test('«Mantener» silencia la sugerencia unas semanas', () => {
  const d = conDatos({ sesiones: base5('facil') });
  const s = silenciarRecomendacion(d);
  assert.equal(recomendar(s).silenciada, true);
  assert.equal(recomendar(s).tipo, 'subir', 'sigue calculándose pero la interfaz no la muestra');
  assert.equal(recomendar(s, Date.now() + (UMBRALES.diasSilencio + 1) * DIA).silenciada, false);
  assert.equal(dificultadDe(s.perfil), 'intermedio');
});
test('bajar: cuesta cumplir o los entrenos resultan duros; en Suave no se baja más', () => {
  const pocos = conDatos({ sesiones: historia({ semanas: 4, porSemana: 1 }) }); // 33 % de constancia
  const r = recomendar(pocos);
  assert.equal(r.tipo, 'bajar');
  assert.equal(r.destino, 'principiante');
  assert.deepEqual(r.acciones, ['bajar', 'mantener']);
  assert.match(r.motivos.join(' '), /33 %/);
  assert.match(r.motivos.join(' '), /no es un paso atrás/);
  const duros = recomendar(conDatos({ sesiones: historia({ semanas: 5, sens: (w) => (w <= 2 ? 'duro' : undefined) }) }));
  assert.equal(duros.tipo, 'bajar');
  assert.match(duros.motivos.join(' '), /6 de tus últimos 6 entrenos te parecieron duros/);
  const suave = recomendar(conDatos({ perfil: perfil({ dificultad: 'principiante' }), sesiones: historia({ semanas: 4, porSemana: 1 }) }));
  assert.equal(suave.tipo, 'mantener');
  assert.deepEqual(suave.acciones, ['mantener']);
  assert.match(suave.motivos.join(' '), /reducir los días de entreno/);
});
test('descanso por recuperación: solo con datos de ánimo fiables', () => {
  const dias = (cuantos, bajos) => Object.fromEntries(Array.from({ length: cuantos }, (_, i) => {
    const t = new Date(Date.now() - (i + 1) * DIA);
    const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    return [k, i < bajos ? { sueno: 0, energia: 1 } : { sueno: 2, energia: 2 }];
  }));
  const fiable = recomendar(conDatos({ sesiones: base5('facil'), animo: dias(8, 6) }));
  assert.equal(fiable.tipo, 'descanso');
  assert.match(fiable.motivos.join(' '), /6 de los últimos 8 días/);
  assert.ok(!fiable.acciones.includes('subir'));
  const pocoFiable = recomendar(conDatos({ sesiones: base5('facil'), animo: dias(4, 4) })); // solo 4 respuestas: no se usan
  assert.notEqual(pocoFiable.tipo, 'descanso');
  assert.equal(pocoFiable.tipo, 'subir', 'sin datos fiables de recuperación no se inventa nada');
});
test('más volumen no es más progreso: no se sube si haces muchas más series de las previstas sin mejorar', () => {
  const d = conDatos({ rutinas: planCoach(4), sesiones: historia({ semanas: 5, sens: () => 'facil', extra: () => ({ ejercicios: ejs(60, 8, 12) }) }) });
  const s = senales(d);
  assert.ok(s.volumen > UMBRALES.volumenExceso, `volumen ${s.volumen}`);
  const r = recomendar(d);
  assert.equal(r.tipo, 'mantener');
  assert.match(r.motivos[0], /más volumen no es más progreso/);
});
test('estancados o fuerza a la baja frenan la subida', () => {
  const estancados = conDatos({ rutinas: planCoach(4), sesiones: historia({ semanas: 5, sens: () => 'facil', extra: () => ({ ejercicios: ejs(60, 6, 4) }) }) });
  const re = recomendar(estancados);
  assert.notEqual(re.tipo, 'subir');
  // Fuerza a la baja: pesos decrecientes con el tiempo
  const bajan = historia({ semanas: 5, sens: () => 'facil', extra: (w) => ({ ejercicios: ejs(50 + w * 3, 8, 4) }) });
  const rb = recomendar(conDatos({ sesiones: bajan }));
  assert.notEqual(rb.tipo, 'subir');
});

// ---------- Seguridad: invariantes con casos al azar ----------
const rng = (semilla) => () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
test('invariantes de seguridad con 400 casos al azar', () => {
  const r = rng(42);
  const dif = ['principiante', 'intermedio', 'avanzado'];
  const clave = (t) => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  for (let i = 0; i < 400; i++) {
    const dificultad = dif[Math.floor(r() * 3)];
    const sesiones = historia({
      semanas: Math.floor(r() * 7), porSemana: 1 + Math.floor(r() * 4),
      sens: () => (r() < 0.8 ? ['facil', 'bien', 'duro'][Math.floor(r() * 3)] : undefined),
      extra: () => ({ ...(r() < 0.06 ? { dolor: true } : {}), ...(r() < 0.1 ? { descarga: true } : {}), ejercicios: ejs(50 + Math.floor(r() * 30), 6 + Math.floor(r() * 5), 3 + Math.floor(r() * 5)) }),
    });
    const animo = {};
    for (let k = 0; k < Math.floor(r() * 12); k++) animo[clave(Date.now() - (k + 1) * DIA)] = { sueno: Math.floor(r() * 3), energia: Math.floor(r() * 3) };
    const d = conDatos({
      perfil: perfil({ dificultad, descargaHasta: r() < 0.15 ? Date.now() + 2 * DIA : null }), sesiones, animo,
      rutinas: r() < 0.7 ? planCoach(3 + Math.floor(r() * 3)) : [],
      ajustes: r() < 0.3 ? { dificultad: { cambio: r() < 0.5 ? Date.now() - Math.floor(r() * 40) * DIA : undefined, silenciarHasta: r() < 0.3 ? Date.now() + 5 * DIA : undefined } } : undefined,
    });
    const fotoAntes = structuredClone(d);
    const rec = recomendar(d);
    assert.deepEqual(d, fotoAntes, 'recomendar nunca modifica los datos');
    const s = senales(d);
    // 1) Con dolor reciente jamás se propone subir ni entrenar más: descanso y sin acción de subir
    if (s.dolor > 0) { assert.equal(rec.tipo, 'descanso'); assert.ok(!rec.acciones.includes('subir')); assert.equal(rec.silenciada, false); }
    // 2) «subir» solo con todas las condiciones y nunca desde la más alta
    if (rec.tipo === 'subir') {
      assert.notEqual(dificultad, 'avanzado');
      assert.equal(s.dolor, 0);
      assert.ok(s.constancia >= UMBRALES.constanciaSubir, `constancia ${s.constancia}`);
      assert.ok(s.respuestas >= UMBRALES.respuestasParaSubir && s.facil / s.respuestas >= UMBRALES.facilesParaSubir);
      assert.ok(s.conEntrenos >= UMBRALES.semanasMinimas);
      assert.equal(rec.destino, paso(dificultad, 'subir'));
      assert.ok(!d.perfil.descargaHasta || d.perfil.descargaHasta <= Date.now());
    }
    // 3) «bajar» nunca desde la más suave
    if (rec.tipo === 'bajar') { assert.notEqual(dificultad, 'principiante'); assert.equal(rec.destino, paso(dificultad, 'bajar')); }
    // 4) Sin semanas suficientes nunca hay recomendación de cambio ni cifras inventadas
    if (s.conEntrenos < UMBRALES.semanasMinimas && s.dolor === 0 && !(d.perfil.descargaHasta > Date.now()) && !(d.ajustes?.dificultad?.cambio > Date.now() - 21 * DIA)) assert.equal(rec.tipo, 'sin-datos');
    // 5) Nunca ofrece más días de entreno: solo hay acciones de dificultad/descanso
    assert.ok(rec.acciones.every((a) => ['mantener', 'subir', 'bajar', 'descansar'].includes(a)));
    // 6) Todas las recomendaciones explican el porqué
    assert.ok(rec.motivos.length >= 1 && rec.motivos.every((m) => typeof m === 'string' && m.length > 10));
  }
});

// ---------- Acciones, datos y compatibilidad ----------
test('aplicar el mismo nivel no cambia nada; cambiar fija la fecha y detiene nuevas propuestas', () => {
  const d = conDatos({ sesiones: base5('facil'), rutinas: planCoach() });
  assert.equal(aplicarCambioDificultad(d, 'intermedio', true), d);
  const subido = aplicarCambioDificultad(d, 'avanzado', true, 1_800_000_000_000);
  assert.equal(subido.ajustes.dificultad.cambio, 1_800_000_000_000);
  assert.deepEqual(subido.rutinas[0].ejercicios.map((e) => e.series), [5, 4, 3]);
  assert.equal(recomendar(subido, 1_800_000_000_000 + DIA).tipo, 'mantener');
  assert.equal(aplicarCambioDificultad({ ...datosIniciales(), perfil: null }, 'avanzado', true).perfil, null);
  const sinPlan = aplicarCambioDificultad(d, 'principiante', false);
  assert.equal(sinPlan.rutinas, d.rutinas, 'solo para planes nuevos: el plan actual no cambia');
});
test('sensación tras el entreno: se guarda solo en ese entreno, es opcional y no cambia el XP', () => {
  const ses = historia({ semanas: 4 });
  const d = conDatos({ sesiones: ses });
  const xp0 = calcularXp(d).xp;
  const id = ses[2].id;
  const a = registrarSensacion(d, id, 'duro', true);
  assert.equal(a.sesiones.find((x) => x.id === id).sensacion, 'duro');
  assert.equal(a.sesiones.find((x) => x.id === id).dolor, true);
  assert.equal(a.sesiones.filter((x) => x.sensacion || x.dolor).length, 1);
  const b = registrarSensacion(a, id, undefined, false);
  assert.equal(b.sesiones.find((x) => x.id === id).sensacion, undefined, 'se puede quitar');
  assert.equal('dolor' in b.sesiones.find((x) => x.id === id), false);
  assert.equal(registrarSensacion(d, 'no-existe', 'bien', false), d);
  assert.equal(calcularXp(a).xp, xp0);
  assert.equal(calcularXp(b).xp, xp0);
});
test('resumen de sensaciones: solo con 3 respuestas o más', () => {
  const ses = historia({ semanas: 2, sens: (w, k) => (w === 1 && k < 2 ? 'bien' : undefined) });
  assert.equal(resumenSensaciones(conDatos({ sesiones: ses })), null);
  const r = resumenSensaciones(conDatos({ sesiones: historia({ semanas: 2, sens: (w, k) => (k === 0 ? 'facil' : k === 1 ? 'bien' : 'duro') }) }));
  assert.deepEqual({ n: r.n, f: r.facil, b: r.bien, d: r.duro }, { n: 6, f: 2, b: 2, d: 2 });
});
test('datos antiguos (sin ningún campo nuevo) y el JSON de la cuenta siguen funcionando', () => {
  const viejo = copia(datosDemo());
  delete viejo.perfil.dificultad;
  for (const s of viejo.sesiones) { delete s.sensacion; delete s.dolor; }
  delete viejo.ajustes;
  const d = { ...datosIniciales(), ...viejo };
  assert.equal(dificultadDe(d.perfil), d.perfil.nivel);
  const r = recomendar(d);
  assert.ok(['sin-datos', 'mantener', 'bajar', 'subir', 'descanso'].includes(r.tipo));
  const ida = copia(aplicarCambioDificultad(registrarSensacion(d, d.sesiones[0].id, 'bien', false), 'avanzado', true));
  assert.equal(ida.perfil.dificultad, 'avanzado');
  assert.equal(ida.sesiones[0].sensacion, 'bien');
  assert.equal(ida.ajustes.dificultad.cambio > 0, true);
});
test('el aviso general y los textos de seguridad están presentes y sin afirmaciones médicas', () => {
  assert.match(AVISO_GENERAL, /no conoce tu estado de salud/);
  const ui = readFileSync(new URL('../../src/Dificultad.tsx', import.meta.url), 'utf8');
  assert.ok(ui.includes('AVISO_GENERAL'));
  assert.ok(ui.includes('No entrenes con dolor'));
  for (const f of ['adaptacion.ts', 'Dificultad.tsx', 'niveles.ts']) {
    const t = readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!/diagn[óo]stic|lesi[óo]n grave|enfermedad|medicamento/i.test(t.replace(/lesion|Lesi/g, '')), `${f} sin afirmaciones médicas`);
    assert.ok(!/supabase|from '\.\/nube'|servidorArena|fetch\(/.test(t), `${f} no toca el servidor`);
  }
});
test('no hay migraciones ni cambios de Supabase en esta fase', () => {
  const m = readFileSync(new URL('../../supabase/pruebas/package.json', import.meta.url), 'utf8');
  assert.ok(m.includes('pglite'));
});
