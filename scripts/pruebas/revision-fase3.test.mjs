// Revisión final de la Fase 3 (tres puntos), solo en local:
//  1) Nivel físico avanzado: nunca se asume «Exigente»; se pregunta antes de rehacer el plan; no se cambian rutinas ni nivel.
//  2) Dolor: recomendación prudente, sin diagnóstico y sin animar a entrenar ni a subir.
//  3) Revisión semanal: los cambios de ejercicios estancados no tocan rutinas personalizadas, pesos, descansos ni preferencias.
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/revision-fase3.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { aplicarCambioDificultad, dolorReciente, mantenerDificultad, recomendar } from '../../src/adaptacion.ts';
import { datosIniciales, dificultadDe, dificultadPorDefecto } from '../../src/datos.ts';
import { misionesHoy } from '../../src/misiones.ts';
import { fijarDificultad, requiereElegirDificultad } from '../../src/niveles.ts';
import { ajustarPlan, generarPlan, planCambia, reajustarPlan, rutinasTrasRehacer } from '../../src/reglas.ts';
import { lunesDeSemana } from '../../src/xp.ts';

const DIA = 86400000;
const fuente = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const quita = (o, ...claves) => Object.fromEntries(Object.entries(o).filter(([k]) => !claves.includes(k)));
const perfil = (extra = {}) => ({
  sexo: 'h', edad: 30, altura: 178, peso: 80, objetivo: 'musculo', objetivo2: null, dias: 3, diasSemana: [0, 2, 4],
  descargaHasta: null, nivel: 'avanzado', equipo: 'gym', enfasis: 'ninguno', ajusteKcal: 0, ultimaRevision: null, ...extra,
});
const ejs = (peso = 60, reps = 8, series = 4) => [
  { nombre: 'Press de banca', series: Array.from({ length: series }, () => ({ peso, reps })) },
  { nombre: 'Sentadilla', series: Array.from({ length: series }, () => ({ peso: peso + 20, reps })) },
  { nombre: 'Mi ejercicio raro', series: Array.from({ length: series }, () => ({ peso: 10, reps: 12 })) },
];
let n = 0;
const sesion = (fecha, extra = {}) => ({ id: `s${++n}`, rutinaNombre: 'Cuerpo completo', fecha, minutos: 50, ejercicios: ejs(), ...extra });
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

// ================= 1 · Nivel físico avanzado =================
test('1 · nivel físico avanzado: la dificultad por defecto es Media, nunca Exigente si no la eliges', () => {
  assert.equal(dificultadPorDefecto('avanzado'), 'intermedio');
  assert.deepEqual(['principiante', 'intermedio', 'avanzado'].map(dificultadPorDefecto), ['principiante', 'intermedio', 'intermedio']);
  for (const nivel of ['principiante', 'intermedio', 'avanzado']) {
    assert.notEqual(dificultadDe(perfil({ nivel })), 'avanzado', `nivel ${nivel} sin elegir`);
    assert.notEqual(fijarDificultad(null, perfil({ nivel })).dificultad, 'avanzado', `perfil nuevo ${nivel}`);
    assert.notEqual(fijarDificultad(perfil({ nivel }), perfil({ nivel })).dificultad, 'avanzado', `perfil existente ${nivel}`);
  }
  assert.equal(dificultadDe(perfil({ dificultad: 'avanzado' })), 'avanzado', 'solo Exigente si la elige la persona');
});
test('1 · quien ya tenía plan antes de existir la dificultad lo conserva idéntico (avanzado = el plan de intermedio)', () => {
  const quitaIds = (rs) => rs.map((r) => ({ n: r.nombre, d: r.dia, e: r.ejercicios.map((e) => [e.nombre, e.series, e.reps, e.repsMax, e.descanso]) }));
  assert.deepEqual(quitaIds(generarPlan(perfil({ nivel: 'avanzado' }))), quitaIds(generarPlan(perfil({ nivel: 'intermedio' }))));
  assert.ok(generarPlan(perfil({ nivel: 'avanzado' })).every((r) => r.ejercicios[0].series === 4), 'sin serie extra de Exigente');
  assert.ok(generarPlan(perfil({ nivel: 'avanzado', dificultad: 'avanzado' })).every((r) => r.ejercicios[0].series === 5), 'con Exigente elegido sí');
});
test('1 · antes de rehacer el plan se pide elegir la dificultad si nunca se ha elegido', () => {
  const sinElegir = perfil({ dificultad: 'intermedio' }); // fijada por el sistema, no elegida
  const elegida = perfil({ dificultad: 'intermedio', dificultadConfirmada: true });
  const otrosDias = (p) => ({ ...p, diasSemana: [0, 1, 2, 3], dias: 4 });
  assert.equal(requiereElegirDificultad(null, perfil()), true, 'perfil nuevo: se pregunta');
  assert.equal(requiereElegirDificultad(sinElegir, otrosDias(sinElegir)), true, 'cambia el plan y nunca la elegiste');
  assert.equal(requiereElegirDificultad(elegida, otrosDias(elegida)), false, 'ya la elegiste');
  assert.equal(requiereElegirDificultad(sinElegir, { ...sinElegir, peso: 90 }), false, 'un cambio que no rehace el plan no pregunta');
  assert.equal(requiereElegirDificultad(sinElegir, { ...sinElegir, nivel: 'principiante' }), false, 'cambiar el nivel físico no rehace el plan');
  assert.equal(planCambia(sinElegir, { ...sinElegir, nivel: 'principiante' }), false);
  assert.equal(planCambia(sinElegir, { ...sinElegir, equipo: 'casa' }), true);
  // Guardar el perfil fija la dificultad pero NO la marca como elegida
  assert.equal(fijarDificultad(sinElegir, otrosDias(sinElegir)).dificultadConfirmada, undefined);
  assert.equal(fijarDificultad(elegida, otrosDias(elegida)).dificultadConfirmada, true);
  // El formulario y la app usan estas reglas
  const coach = fuente('src/Coach.tsx');
  assert.ok(coach.includes('requiereElegirDificultad(i, nuevo)') && coach.includes('ElegirDificultadInicial'));
  assert.ok(coach.indexOf('requiereElegirDificultad(i, nuevo)') < coach.indexOf('p.onGuardar(nuevo)'), 'se pregunta ANTES de guardar');
  assert.ok(fuente('App.tsx').includes('planCambia(a, x)') && !fuente('App.tsx').includes('a.nivel !== x.nivel'));
});
test('1 · elegir o mantener cuenta como elegir; nada más cambia (ni nivel físico ni rutinas)', () => {
  const rut = [{ id: 'c', nombre: 'Mi rutina', ejercicios: [{ id: 'x', nombre: 'Press de banca', series: 4, reps: 8 }] }];
  const d = conDatos({ perfil: perfil({ dificultad: 'intermedio' }), rutinas: rut, sesiones: historia() });
  const m = mantenerDificultad(d);
  assert.equal(m.perfil.dificultadConfirmada, true);
  assert.equal(m.perfil.dificultad, 'intermedio');
  assert.equal(m.perfil.nivel, 'avanzado', 'el nivel físico no cambia');
  assert.equal(m.rutinas, d.rutinas, 'las rutinas no cambian');
  assert.equal(m.sesiones, d.sesiones);
  const a = aplicarCambioDificultad(d, 'avanzado', false);
  assert.equal(a.perfil.dificultadConfirmada, true);
  assert.equal(a.perfil.nivel, 'avanzado');
  assert.equal(a.rutinas, d.rutinas, 'solo planes nuevos: no se tocan las rutinas');
});
test('1 · una recomendación de subir para un nivel avanzado es solo una sugerencia: no cambia nada hasta que se acepta', () => {
  const sesiones = historia({ semanas: 5, sens: (w) => (w <= 3 ? 'facil' : undefined), extra: (w) => ({ ejercicios: ejs(40 + w * -2 + 20, 8, 4) }) });
  const d = conDatos({ sesiones, perfil: perfil() }); // nivel avanzado, dificultad sin elegir
  const foto = structuredClone(d);
  const r = recomendar(d);
  assert.deepEqual(d, foto, 'recomendar no cambia nada');
  assert.equal(dificultadDe(d.perfil), 'intermedio');
  assert.ok(r.tipo !== 'subir' || r.destino === 'avanzado');
});
test('1 · al rehacer el plan se conservan las rutinas propias y las del coach editadas por la persona', () => {
  const coach = (id, extra = {}) => ({ id, nombre: `Plan ${id}`, deCoach: true, dia: 0, ejercicios: [{ id: `${id}1`, nombre: 'Press de banca', series: 4, reps: 8, descanso: 77 }], ...extra });
  const propia = { id: 'propia', nombre: 'Mi rutina', ejercicios: [{ id: 'p1', nombre: 'Curl', series: 3, reps: 12 }] };
  const ejemplo = { id: 'ej', nombre: 'Empuje', ejemplo: true, ejercicios: [] };
  const editada = coach('B', { personalizada: true, dia: 2 });
  const plan = generarPlan(perfil());
  const r = rutinasTrasRehacer([coach('A'), editada, propia, ejemplo], plan);
  assert.deepEqual(r.slice(0, plan.length), plan, 'el plan nuevo va primero');
  assert.equal(r.includes(propia), true, 'la rutina propia sigue idéntica');
  assert.ok(!r.some((x) => x.id === 'A') && !r.some((x) => x.id === 'ej'), 'solo se sustituye el plan del coach sin tocar y el ejemplo');
  const guardada = r.find((x) => x.id === 'B');
  assert.ok(guardada && guardada.deCoach === false && guardada.dia === undefined, 'la editada pasa a ser tuya, sin día');
  assert.deepEqual(guardada.ejercicios, editada.ejercicios, 'con sus ejercicios, series y descansos exactos');
});

// ================= 2 · Dolor =================
const conDolor = (extra = {}) => {
  const sesiones = historia({ semanas: 5, sens: () => 'facil' });
  sesiones[0] = { ...sesiones[0], dolor: true };
  return conDatos({ sesiones, ...extra });
};
test('2 · con dolor reciente: descanso prudente, sin botones que impliquen entrenar, sin subir y sin diagnóstico', () => {
  const r = recomendar(conDolor());
  assert.equal(r.tipo, 'descanso');
  assert.deepEqual(r.acciones, [], 'ni subir, ni bajar, ni «semana de descarga» (siguen siendo entrenos)');
  assert.equal(r.silenciada, false, 'no se puede silenciar');
  assert.equal(r.destino, undefined);
  const texto = [r.titulo, ...r.motivos].join(' ');
  assert.match(texto, /No entrenes con dolor/);
  assert.match(texto, /consulta con un profesional/);
  assert.match(texto, /fuerte, aparece de golpe o te preocupa/);
  assert.match(texto, /no te propongo subir/);
  assert.ok(!/lesi[oó]n|tendin|desgarr|esguince|fractur|hernia|diagn[oó]stic|patolog|enfermedad|medicament|tratamiento|probablemente|seguramente/i.test(texto), 'sin diagnóstico ni suposiciones');
  assert.ok(!/puedes entrenar|sigue entrenando|aguanta|entrena igual|a por ello|supera/i.test(texto), 'sin animar a entrenar');
});
test('2 · ningún texto nuevo diagnostica, y el consejo del dolor está en todos los sitios donde se pregunta o se anima a entrenar', () => {
  for (const f of ['src/adaptacion.ts', 'src/Dificultad.tsx', 'src/niveles.ts', 'src/misiones.ts']) {
    assert.ok(!/lesi[oó]n|tendin|desgarr|esguince|fractur|hernia|diagn[oó]stic|patolog|enfermedad|medicament|tratamiento/i.test(fuente(f)), `${f} sin lenguaje médico`);
  }
  const app = fuente('App.tsx');
  assert.ok(app.includes("dolorReciente(datos)\n              ? 'Marcaste molestias hace poco. Si hoy te duele algo, no entrenes con dolor: descansa."), '«¿Cómo estás hoy?» ya no anima con dolor');
  assert.ok(app.includes('prudente={dolorReciente(datos)}'));
  const ent = fuente('src/Entreno.tsx');
  assert.equal((ent.match(/!p\.prudente/g) ?? []).length, 4, 'ni se rellenan ni se muestran subidas de peso o repeticiones');
  assert.ok(fuente('src/Coach.tsx').includes('no te propongo subir pesos ni repeticiones'));
  assert.ok(fuente('src/Dificultad.tsx').includes('No entrenes con dolor'));
});
test('2 · dolorReciente: solo cuenta 2 semanas y solo si marcaste dolor', () => {
  const t = (dias, dolor) => ({ ...sesion(Date.now() - dias * DIA), ...(dolor ? { dolor: true } : {}) });
  assert.equal(dolorReciente(conDatos({ sesiones: [t(13, true)] })), true);
  assert.equal(dolorReciente(conDatos({ sesiones: [t(15, true)] })), false);
  assert.equal(dolorReciente(conDatos({ sesiones: [t(2, false)] })), false);
});
test('2 · la misión «Entrenar hoy» no insiste con dolor reciente', () => {
  const todos = [0, 1, 2, 3, 4, 5, 6];
  const sesiones = [{ ...sesion(Date.now() - 3 * DIA), dolor: true }];
  const m = misionesHoy(conDatos({ perfil: perfil({ diasSemana: todos, dias: 7 }), sesiones, comida: {} })).find((x) => x.id === 'entrenar');
  assert.match(m.detalle, /no entrenes y descansa/);
  assert.ok(!/Hoy toca/.test(m.detalle));
  const normal = misionesHoy(conDatos({ perfil: perfil({ diasSemana: todos, dias: 7 }), sesiones: [], comida: {} })).find((x) => x.id === 'entrenar');
  assert.match(normal.detalle, /omitir está bien/);
});

// ================= 3 · Revisión semanal =================
// Tres ejercicios estancados (mismo peso 3 veces y repeticiones por debajo del tope) en varias rutinas.
const estancados = historia({ semanas: 4, porSemana: 3, extra: () => ({ ejercicios: ejs(60, 6, 4) }) });
const ejercicios = (descanso) => [
  { id: 'a1', nombre: 'Press de banca', series: 4, reps: 8, repsMax: 10, descanso },
  { id: 'a2', nombre: 'Sentadilla', series: 4, reps: 8, repsMax: 10, descanso: descanso + 30 },
  { id: 'a3', nombre: 'Mi ejercicio raro', series: 3, reps: 10, repsMax: 15, descanso: 45 },
];
const rutinasRevision = () => [
  { id: 'A', nombre: 'Cuerpo completo A', deCoach: true, dia: 0, ejercicios: ejercicios(90) },
  { id: 'B', nombre: 'Cuerpo completo B (mía)', deCoach: true, personalizada: true, dia: 2, ejercicios: ejercicios(77) },
  { id: 'C', nombre: 'Rutina propia', ejercicios: [{ id: 'c1', nombre: 'Press de banca', series: 5, reps: 5, descanso: 120 }] },
];
test('3 · revisión semanal: cambia solo ejercicios estancados del plan del coach sin editar, conservando series, repeticiones y descansos', () => {
  const d = conDatos({ perfil: perfil({ dificultad: 'intermedio', dificultadConfirmada: true, enfasis: ['pecho'], ajusteKcal: 100 }), sesiones: estancados, rutinas: rutinasRevision() });
  const foto = structuredClone(d);
  const r = ajustarPlan(d);
  assert.deepEqual(d, foto, 'no modifica los datos de entrada');
  const [A, B, C] = r.rutinas;
  // A: se cambian los estancados del catálogo; el resto igual
  assert.notEqual(A.ejercicios[0].nombre, 'Press de banca');
  assert.notEqual(A.ejercicios[1].nombre, 'Sentadilla');
  assert.equal(A.ejercicios[2].nombre, 'Mi ejercicio raro', 'un ejercicio que no es del catálogo no se toca');
  assert.deepEqual(A.ejercicios.map((e) => [e.series, e.reps, e.repsMax, e.descanso]), rutinasRevision()[0].ejercicios.map((e) => [e.series, e.reps, e.repsMax, e.descanso]), 'series, repeticiones y descansos exactos');
  assert.equal(new Set(A.ejercicios.map((e) => e.nombre)).size, A.ejercicios.length, 'sin ejercicios repetidos');
  assert.ok(r.cambios.some((x) => /estaba estancado/.test(x)));
  // B (editada por la persona) y C (propia): idénticas, la misma referencia
  assert.equal(B, d.rutinas[1], 'la rutina del coach que editaste NO se toca');
  assert.equal(C, d.rutinas[2], 'tu rutina propia NO se toca');
  assert.equal(r.rutinas.length, 3);
  // Preferencias del perfil: solo cambian las calorías y la fecha de revisión
  assert.deepEqual(quita(r.perfil, 'ajusteKcal', 'ultimaRevision'), quita(d.perfil, 'ajusteKcal', 'ultimaRevision'));
  for (const k of ['nivel', 'dificultad', 'dificultadConfirmada', 'equipo', 'enfasis', 'dias', 'diasSemana', 'objetivo', 'objetivo2', 'descargaHasta', 'sexo', 'edad', 'altura', 'peso']) assert.deepEqual(r.perfil[k], d.perfil[k], k);
});
test('3 · las sustituciones respetan el material y la dificultad elegida', () => {
  for (const [equipo, dificultad] of [['casa', 'intermedio'], ['mancuernas', 'principiante'], ['gym', 'principiante']]) {
    const d = conDatos({ perfil: perfil({ equipo, dificultad, dificultadConfirmada: true }), sesiones: estancados, rutinas: rutinasRevision() });
    const r = ajustarPlan(d);
    const nombres = r.rutinas[0].ejercicios.map((e) => e.nombre).slice(0, 2);
    const dificiles = ['Press de banca', 'Press militar', 'Dominadas', 'Remo con barra', 'Sentadilla', 'Peso muerto rumano', 'Fondos en paralelas', 'Rueda abdominal', 'Flexiones con pies elevados'];
    if (dificultad === 'principiante') assert.ok(nombres.every((x) => !dificiles.includes(x)), `${equipo}/${dificultad}: sin ejercicios técnicos ${nombres}`);
    if (equipo === 'casa') assert.ok(nombres.every((x) => !/barra|polea|máquina|Prensa|Press de banca/i.test(x)), `casa: ${nombres}`);
  }
});
test('3 · la revisión no sube la exigencia ni cambia pesos: los entrenos guardados no se tocan', () => {
  const d = conDatos({ perfil: perfil({ dificultad: 'avanzado', dificultadConfirmada: true }), sesiones: estancados, rutinas: rutinasRevision() });
  const antes = JSON.stringify(d.sesiones);
  const r = ajustarPlan(d);
  assert.equal(JSON.stringify(d.sesiones), antes);
  assert.ok(!('sesiones' in r), 'la revisión ni siquiera devuelve entrenos');
  assert.ok(r.rutinas[0].ejercicios.every((e, i) => e.series === rutinasRevision()[0].ejercicios[i].series), 'ninguna serie sube');
});
test('3 · cambiar la dificultad tampoco toca las rutinas editadas ni las propias', () => {
  const d = conDatos({ perfil: perfil({ dificultad: 'intermedio', dificultadConfirmada: true }), rutinas: rutinasRevision() });
  for (const nueva of ['principiante', 'avanzado']) {
    const r = reajustarPlan(d, nueva);
    assert.equal(r.rutinas[1], d.rutinas[1], 'editada: intacta');
    assert.equal(r.rutinas[2], d.rutinas[2], 'propia: intacta');
    assert.ok(!r.cambios.some((x) => x.startsWith('Cuerpo completo B')), 'ningún cambio mencionado en la editada');
  }
});
test('3 · al editar una rutina del coach se marca como personalizada y se avisa en pantalla', () => {
  assert.ok(fuente('App.tsx').includes('...(r.deCoach ? { personalizada: true } : {})'));
  assert.ok(fuente('src/Rutinas.tsx').includes('editada por ti (no se toca)'));
});
test('esta revisión no toca Supabase ni la sincronización', () => {
  for (const f of ['src/adaptacion.ts', 'src/niveles.ts', 'src/Dificultad.tsx', 'src/misiones.ts']) assert.ok(!/supabase|from '\.\/nube'|servidorArena|fetch\(/.test(fuente(f)), f);
  assert.ok(!/dificultad|personalizada/i.test(fuente('src/servidorArena.ts')), 'ni la dificultad ni las rutinas viajan a ARENA');
});
