// Garantía de la RETIRADA del consentimiento de «cómo ha ido / me dolió algo»: un permiso retirado no se reactiva nunca y no
// vuelven a guardarse respuestas sin un consentimiento nuevo y explícito. Sin red (cliente falso en memoria).
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/retirada.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { datosIniciales } from '../../src/datos.ts';
import { conDecisionInicial, conRetirada, conservarDecision, decisionSensaciones, fijarSensaciones, marcarPermiso, prepararAlEntrar, quitarSensaciones, respuestasGuardadas, sensacionesPermitidas, sinConsentimientoAjeno, sinRespuestasNoPermitidas, unirDecisiones } from '../../src/consentimientos.ts';
import { registrarSensacion } from '../../src/adaptacion.ts';
import { fusionarDatos, registrarCambios } from '../../src/fusion.ts';
import { subirDatos } from '../../src/subida.ts';

const vacio = () => ({ ...datosIniciales(), rutinas: [] });
const ses = (id, t, extra = {}) => ({ id, rutinaNombre: 'Torso', fecha: t, minutos: 50, ejercicios: [{ nombre: 'Press', series: [{ peso: 60, reps: 8 }] }], ...extra });
const tocar = (a, f, t) => registrarCambios(a, f(a), t); // un cambio hecho por la persona (con marcas de fusión)
const META_SI = { consentimiento_sensaciones: 1, aceptado: '2026-11-01T10:00:00.000Z' };
const T0 = Date.parse(META_SI.aceptado);
const DIA = 86400000;

// Cliente falso de `datos_usuario`. `e.fallaLectura` / `e.fallaEscritura` simulan errores; `e.escritos` guarda TODO lo escrito.
function nube(datos = null) {
  const e = { fila: datos ? { datos, actualizado: '2026-11-02T09:00:00.000Z' } : null, escritos: [], fallaLectura: false, fallaEscritura: false, conflicto: false };
  const escribir = (x) => { e.escritos.push(x.datos); e.fila = { datos: x.datos, actualizado: x.actualizado }; };
  const sb = { from: () => ({
    select: (cols) => ({ eq: () => ({ maybeSingle: async () => {
      if (e.fallaLectura) return { data: null, error: { message: 'sin red' } };
      if (!e.fila) return { data: null, error: null };
      return { data: cols === 'actualizado' ? { actualizado: e.fila.actualizado } : { ...e.fila }, error: null };
    } }) }),
    insert: async (x) => { if (e.fallaEscritura) return { error: { message: 'fallo' } }; escribir(x); return { error: null }; },
    update: (x) => { const f = []; const q = { eq(c, v) { f.push([c, v]); return q; }, is(c, v) { f.push([c, v]); return q; },
      select: async () => {
        if (e.fallaEscritura) return { data: null, error: { message: 'fallo' } };
        if (e.conflicto || !f.every(([c, v]) => c !== 'actualizado' || e.fila.actualizado === v)) return { data: [], error: null };
        escribir(x); return { data: [{ user_id: 'u' }], error: null };
      } };
      return q; },
    upsert: async (x) => { if (e.fallaEscritura) return { error: { message: 'fallo' } }; escribir(x); return { error: null }; },
  }) };
  return { sb, e };
}

// La cuenta dio el permiso en el registro (T0), guardó una respuesta y la retiró (T0 + 2 días).
const conPermiso = () => tocar(vacio(), (d) => ({ ...conDecisionInicial(d, META_SI), sesiones: [ses('a', T0 + DIA, { sensacion: 'duro' })] }), T0 + DIA);
const retirada = () => tocar(conPermiso(), (d) => quitarSensaciones(fijarSensaciones(d, false, T0 + 2 * DIA)), T0 + 2 * DIA);

test('heredar la decisión del registro en otro dispositivo (aunque sea después) NO anula una retirada', () => {
  // Otro dispositivo, sin haber podido leer la nube, adopta el «sí» del registro días más tarde (así lo hacía la app).
  const B = tocar(vacio(), (d) => conDecisionInicial(d, META_SI), T0 + 10 * DIA);
  for (const m of [fusionarDatos(B, retirada()), fusionarDatos(retirada(), B)]) assert.equal(decisionSensaciones(m).valor, false);
});

test('si no se puede leer la nube NO se escribe encima (podría borrar la retirada)', async () => {
  const { sb, e } = nube(retirada());
  e.fallaLectura = true;
  const r = await subirDatos(sb, 'u', conPermiso());
  assert.ok(r.error, 'devuelve error para reintentar');
  assert.equal(e.escritos.length, 0, 'no ha escrito nada');
  assert.equal(decisionSensaciones(e.fila.datos).valor, false);
});

test('con demasiada competencia tampoco se escribe a ciegas', async () => {
  const { sb, e } = nube(retirada());
  e.conflicto = true;
  const r = await subirDatos(sb, 'u', conPermiso(), 3);
  assert.ok(r.error);
  assert.equal(e.escritos.length, 0);
});

test('un dispositivo atrasado sube su respuesta: no llega a escribirse en la nube ni una vez', async () => {
  const { sb, e } = nube(retirada());
  const B = tocar(conPermiso(), (d) => ({ ...d, sesiones: [ses('n', T0 + 3 * DIA, { sensacion: 'bien', dolor: true }), ...d.sesiones] }), T0 + 3 * DIA);
  assert.ok(respuestasGuardadas(B) > 0);
  const r = await subirDatos(sb, 'u', B);
  assert.equal(r.error, null);
  assert.ok(e.escritos.length > 0);
  for (const escrito of e.escritos) {
    assert.equal(respuestasGuardadas(escrito), 0, 'ninguna escritura lleva respuestas');
    assert.equal(decisionSensaciones(escrito).valor, false);
  }
  assert.ok(e.fila.datos.sesiones.some((s) => s.id === 'n'), 'el entreno se conserva');
});

// Lo que hace la aplicación al guardar una respuesta.
const responder = (d, id, t) => tocar(d, (x) => marcarPermiso(registrarSensacion({ ...x, sesiones: [ses(id, t), ...x.sesiones] }, id, 'duro', true), id), t);
const entrar = (extra) => prepararAlEntrar(extra.final ?? vacio(), { local: vacio(), propios: true, nubeLeida: true, metadatos: META_SI, retirada: 0, ...extra });

test('al entrar sin haber podido leer la nube no se hereda el «sí»: ni se pregunta ni se guarda', () => {
  const d = entrar({ nubeLeida: false });
  assert.equal(decisionSensaciones(d), undefined);
  assert.equal(sensacionesPermitidas(d, true), false);
  assert.equal(decisionSensaciones(entrar({ nubeLeida: true })).valor, true, 'con la nube leída y sin decisión, sí se hereda');
  assert.equal(decisionSensaciones(fusionarDatos(d, retirada())).valor, false, 'al recuperar la nube llega la retirada');
});

test('cerrar sesión sin que la retirada llegara a la nube: al volver a entrar manda la retirada', () => {
  const enNube = conPermiso(); // la nube aún dice «sí»
  const momento = decisionSensaciones(retirada()).retirado; // lo anotado aparte en el dispositivo
  const d = entrar({ final: enNube, retirada: momento });
  assert.equal(decisionSensaciones(d).valor, false);
  assert.equal(respuestasGuardadas(d), 0, 'y se quitan sin preguntar');
  assert.equal(decisionSensaciones(conRetirada(enNube, 0)).valor, true, 'sin retirada anotada no cambia nada');
});

test('la retirada hecha en un dispositivo sin más datos no se pierde al entrar', () => {
  const soloDecision = fijarSensaciones(vacio(), false, T0 + 5 * DIA);
  assert.equal(decisionSensaciones(entrar({ final: conPermiso(), local: soloDecision })).valor, false);
});

test('un consentimiento NUEVO y explícito sí vale, pero no recupera nada de antes ni lo anotado sin saber de la retirada', () => {
  const A = retirada();
  const Bsin = responder(conPermiso(), 'sinred', T0 + 3 * DIA); // B no sabe de la retirada y responde sin conexión
  const Anuevo = tocar(A, (d) => fijarSensaciones(d, true, T0 + 4 * DIA), T0 + 4 * DIA);
  for (const m of [fusionarDatos(Bsin, Anuevo), fusionarDatos(Anuevo, Bsin)]) {
    assert.equal(decisionSensaciones(m).valor, true);
    const limpio = sinRespuestasNoPermitidas(m);
    assert.equal(respuestasGuardadas(limpio), 0, 'ni la antigua ni la anotada con el permiso retirado');
    assert.ok(limpio.sesiones.some((s) => s.id === 'sinred'));
  }
  const despues = sinRespuestasNoPermitidas(responder(Anuevo, 'nueva', T0 + 6 * DIA));
  assert.equal(respuestasGuardadas(despues), 1, 'lo respondido con el permiso nuevo se guarda');
});

test('el reloj atrasado no hace perder una retirada ni un permiso nuevo', () => {
  const d = conPermiso();
  const no = fijarSensaciones(d, false, 5); // reloj muy atrasado
  assert.ok(decisionSensaciones(no).ts > decisionSensaciones(d).ts);
  assert.equal(decisionSensaciones(fusionarDatos(d, no)).valor, false);
  const si = fijarSensaciones(no, true, 7);
  assert.equal(decisionSensaciones(fusionarDatos(no, si)).valor, true);
});

test('unir decisiones no depende del orden ni de repeticiones y el empate lo gana el «no»', () => {
  const x = [undefined, { valor: true, v: 1, ts: 1 }, { valor: false, v: 1, ts: 2, retirado: 2 }, { valor: true, v: 1, ts: 3 }, { valor: true, v: 1, ts: 2 }, { valor: false, v: 1, ts: 3, retirado: 3 }];
  for (const a of x) for (const b of x) for (const c of x) {
    assert.deepEqual(unirDecisiones(a, b), unirDecisiones(b, a));
    assert.deepEqual(unirDecisiones(unirDecisiones(a, b), c), unirDecisiones(a, unirDecisiones(b, c)));
    assert.deepEqual(unirDecisiones(a, a), a);
  }
  assert.equal(unirDecisiones({ valor: true, v: 1, ts: 3 }, { valor: false, v: 1, ts: 3 }).valor, false);
});

test('restaurar una copia antigua no reactiva el permiso ni devuelve respuestas', () => {
  const copia = conPermiso(); // copia hecha cuando había permiso
  const actual = retirada();
  const r = sinRespuestasNoPermitidas(conservarDecision({ ...actual, ...copia }, actual));
  assert.equal(decisionSensaciones(r).valor, false);
  assert.equal(respuestasGuardadas(r), 0);
  assert.equal(decisionSensaciones(conservarDecision(copia, vacio())), undefined, 'sin decisión previa, la copia no la trae');
});

test('importar datos de otra cuenta no trae su permiso ni sus respuestas', () => {
  const ajenos = responder(fijarSensaciones(vacio(), true, T0 + 9 * DIA), 'x', T0 + 9 * DIA);
  const limpio = sinConsentimientoAjeno(ajenos);
  assert.equal(decisionSensaciones(limpio), undefined);
  assert.equal(respuestasGuardadas(limpio), 0);
  assert.equal(decisionSensaciones(fusionarDatos(retirada(), limpio)).valor, false);
});

test('errores de escritura y de lectura con reintentos: nada se escribe con respuestas y acaba convergiendo', async () => {
  const { sb, e } = nube(retirada());
  const B = responder(conPermiso(), 'n', T0 + 3 * DIA);
  e.fallaEscritura = true;
  let r = await subirDatos(sb, 'u', B);
  assert.ok(r.error);
  e.fallaEscritura = false;
  e.fallaLectura = true;
  r = await subirDatos(sb, 'u', B);
  assert.ok(r.error);
  assert.equal(e.escritos.length, 0);
  e.fallaLectura = false;
  r = await subirDatos(sb, 'u', B);
  assert.equal(r.error, null);
  assert.equal(e.escritos.length, 1);
  assert.equal(respuestasGuardadas(e.escritos[0]), 0);
  const app = sinRespuestasNoPermitidas(fusionarDatos(B, r.datos)); // la app incorpora el resultado
  assert.equal(respuestasGuardadas(app), 0);
  await subirDatos(sb, 'u', app);
  assert.equal(respuestasGuardadas(e.fila.datos), 0);
  assert.equal(decisionSensaciones(e.fila.datos).valor, false);
});

test('primera subida de un dispositivo sin permiso: no lleva respuestas', async () => {
  const { sb, e } = nube();
  await subirDatos(sb, 'u', { ...vacio(), sesiones: [ses('a', 1000, { dolor: true })] });
  assert.equal(respuestasGuardadas(e.escritos[0]), 0);
});

test('quien nunca ha retirado conserva sus respuestas como antes (también las anteriores al permiso)', () => {
  const d = tocar({ ...vacio(), sesiones: [ses('vieja', 500, { sensacion: 'bien' })] }, (x) => fijarSensaciones(x, true, 1000), 1000);
  assert.equal(respuestasGuardadas(sinRespuestasNoPermitidas(d)), 1);
});
