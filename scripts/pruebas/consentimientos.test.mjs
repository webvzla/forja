// Pruebas del consentimiento INDEPENDIENTE de «cómo ha ido / me dolió algo» (src/consentimientos.ts) y de que NO toca las reglas.
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/consentimientos.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { datosDemo } from '../../src/demo.ts';
import { datosIniciales } from '../../src/datos.ts';
import { decisionDeMetadatos, decisionSensaciones, conDecisionInicial, fijarSensaciones, hayRespuestasSinConsentimiento, quitarSensaciones, respuestasGuardadas, sensacionesPermitidas } from '../../src/consentimientos.ts';
import { fusionarDatos, registrarCambios } from '../../src/fusion.ts';
import { recomendar, registrarSensacion, dolorReciente } from '../../src/adaptacion.ts';

const vacio = () => ({ ...datosIniciales(), rutinas: [] });
const ses = (id, t, extra = {}) => ({ id, rutinaNombre: 'Torso', fecha: t, minutos: 50, ejercicios: [{ nombre: 'Press', series: [{ peso: 60, reps: 8 }] }], ...extra });
const conRespuestas = () => ({ ...vacio(), sesiones: [ses('a', 3000, { sensacion: 'bien' }), ses('b', 2000, { dolor: true, sensacion: 'duro' }), ses('c', 1000)] });
const campos = (d) => d.sesiones.map((s) => ['sensacion' in s, 'dolor' in s]).flat();
const tocar = (a, f, t) => registrarCambios(a, f(a), t); // un cambio hecho por la persona (con marcas de fusión)

test('quién pregunta y guarda: sin cuenta siempre; con cuenta solo con consentimiento explícito', () => {
  const d = vacio();
  assert.equal(sensacionesPermitidas(d, false), true, 'sin cuenta: como siempre (queda en el dispositivo)');
  assert.equal(sensacionesPermitidas(d, true), false, 'con cuenta y sin decisión: no');
  assert.equal(sensacionesPermitidas(fijarSensaciones(d, false, 1), true), false, 'con cuenta y «no»: no');
  assert.equal(sensacionesPermitidas(fijarSensaciones(d, true, 1), true), true, 'con cuenta y «sí»: sí');
  assert.equal(sensacionesPermitidas(fijarSensaciones(d, false, 1), false), true, 'sin cuenta no importa la decisión guardada');
});

test('fijar el consentimiento: guarda valor, versión y momento; no cambia nada más; sin cambio devuelve lo mismo', () => {
  const d = { ...vacio(), ajustes: { inicio: { ocultas: ['peso'] } } };
  const a = fijarSensaciones(d, true, 1234);
  assert.deepEqual(decisionSensaciones(a), { valor: true, v: 1, ts: 1234 });
  assert.deepEqual(a.ajustes.inicio, { ocultas: ['peso'] });
  assert.equal(fijarSensaciones(a, true, 9999), a, 'misma decisión: misma referencia');
  assert.equal(decisionSensaciones(fijarSensaciones(a, false, 5000)).valor, false);
});

test('quitar las respuestas: borra «cómo ha ido» y «me dolió algo» de TODOS los entrenos y deja lo demás intacto', () => {
  const d = conRespuestas();
  assert.equal(respuestasGuardadas(d), 2);
  const q = quitarSensaciones(d);
  assert.equal(respuestasGuardadas(q), 0);
  assert.deepEqual(campos(q), [false, false, false, false, false, false]);
  assert.deepEqual(q.sesiones.map((s) => [s.id, s.fecha, s.minutos, s.rutinaNombre]), d.sesiones.map((s) => [s.id, s.fecha, s.minutos, s.rutinaNombre]));
  assert.deepEqual(q.sesiones[0].ejercicios, d.sesiones[0].ejercicios, 'series y pesos intactos');
  assert.equal(quitarSensaciones(q), q, 'idempotente y sin cambios innecesarios');
  assert.equal(quitarSensaciones(vacio()).sesiones.length, 0);
});

test('metadatos de la cuenta: se interpretan con cuidado y lo raro se ignora', () => {
  assert.deepEqual(decisionDeMetadatos({ consentimiento_sensaciones: 1, aceptado: '2026-11-18T10:00:00.000Z' }), { valor: true, v: 1, ts: Date.parse('2026-11-18T10:00:00.000Z') });
  assert.equal(decisionDeMetadatos({ consentimiento_sensaciones: 0 }).valor, false);
  assert.equal(decisionDeMetadatos({ consentimiento_sensaciones: true }).valor, true);
  assert.equal(decisionDeMetadatos({ consentimiento_sensaciones: false }).valor, false);
  for (const raro of [null, undefined, 5, 'x', [], {}, { consentimiento_sensaciones: 'si' }, { consentimiento_sensaciones: {} }, { consentimiento_sensaciones: NaN }]) assert.equal(decisionDeMetadatos(raro), null, JSON.stringify(raro));
  assert.equal(decisionDeMetadatos({ consentimiento_sensaciones: 1 }).ts, 1, 'sin fecha cuenta como la decisión más antigua');
});

test('decisión inicial: se adopta la del registro solo si los datos aún no tienen una', () => {
  const d = vacio();
  const a = conDecisionInicial(d, { consentimiento_sensaciones: 1, aceptado: '2026-11-18T10:00:00.000Z' });
  assert.equal(decisionSensaciones(a).valor, true);
  const b = conDecisionInicial(fijarSensaciones(d, false, 5), { consentimiento_sensaciones: 1 });
  assert.equal(decisionSensaciones(b).valor, false, 'la decisión guardada (más reciente) manda sobre la del registro');
  assert.equal(conDecisionInicial(d, {}), d);
  assert.equal(conDecisionInicial(d, null), d);
});

test('«con cuenta y respuestas sin consentimiento» (lo que hay que resolver o borrar)', () => {
  const r = conRespuestas();
  assert.equal(hayRespuestasSinConsentimiento(r, true), true, 'sin decisión');
  assert.equal(hayRespuestasSinConsentimiento(fijarSensaciones(r, false), true), true, 'con «no»');
  assert.equal(hayRespuestasSinConsentimiento(fijarSensaciones(r, true), true), false, 'con «sí»');
  assert.equal(hayRespuestasSinConsentimiento(r, false), false, 'sin cuenta: no aplica');
  assert.equal(hayRespuestasSinConsentimiento(vacio(), true), false, 'sin respuestas no hay nada que resolver');
});

test('REVOCAR se propaga: el borrado en un dispositivo limpia al otro (también al que estaba atrasado)', () => {
  const base = fijarSensaciones(conRespuestas(), true, 10);
  const A = tocar(base, (d) => quitarSensaciones(fijarSensaciones(d, false, 500)), 500);
  const Bviejo = base; // B no se entera
  assert.equal(respuestasGuardadas(A), 0);
  for (const m of [fusionarDatos(Bviejo, A), fusionarDatos(A, Bviejo)]) {
    assert.equal(respuestasGuardadas(m), 0, 'las respuestas NO resucitan en ningún orden de fusión');
    assert.equal(decisionSensaciones(m).valor, false, 'y el «no» también se propaga');
  }
});

test('B registra una respuesta SIN conexión antes de enterarse; al sincronizar acaba también sin ella (la regla de limpieza la borra) y no vuelve', () => {
  const base = fijarSensaciones({ ...vacio(), sesiones: [ses('a', 1000, { sensacion: 'bien' })] }, true, 10);
  const A = tocar(base, (d) => quitarSensaciones(fijarSensaciones(d, false, 500)), 500);
  // B, antes de saberlo, termina un entreno y contesta «me dolió algo»
  const B = tocar(base, (d) => registrarSensacion({ ...d, sesiones: [ses('n', 800), ...d.sesiones] }, 'n', 'duro', true), 800);
  assert.equal(respuestasGuardadas(B), 2);
  let B2 = fusionarDatos(B, A); // al volver la conexión
  assert.equal(decisionSensaciones(B2).valor, false, 'B se entera del «no»');
  assert.equal(hayRespuestasSinConsentimiento(B2, true), true, 'y detecta que conserva respuestas sin consentimiento');
  B2 = tocar(B2, quitarSensaciones, 900); // lo que hace la aplicación sola
  let A2 = fusionarDatos(A, B2);
  assert.equal(respuestasGuardadas(A2), 0);
  assert.equal(respuestasGuardadas(fusionarDatos(B2, A2)), 0);
  assert.ok(A2.sesiones.some((s) => s.id === 'n'), 'el entreno de B se conserva (solo se quitan las respuestas)');
  A2 = fusionarDatos(A2, base); // y una copia vieja con respuestas tampoco las trae de vuelta
  assert.equal(respuestasGuardadas(A2), 0);
});

test('volver a activar el consentimiento NO recupera lo borrado: solo se guarda lo nuevo', () => {
  const base = fijarSensaciones(conRespuestas(), true, 10);
  let d = tocar(base, (x) => quitarSensaciones(fijarSensaciones(x, false, 100)), 100);
  d = tocar(d, (x) => fijarSensaciones(x, true, 200), 200);
  assert.equal(respuestasGuardadas(d), 0);
  assert.equal(sensacionesPermitidas(d, true), true);
  d = tocar(d, (x) => registrarSensacion(x, 'c', 'facil', false), 300);
  assert.equal(respuestasGuardadas(d), 1, 'lo nuevo sí se guarda');
});

test('sin consentimiento el motor de sugerencias ve cero respuestas y cae en su rama de «sin datos»; el motor no cambia', () => {
  const demo = datosDemo();
  assert.ok(respuestasGuardadas(demo) >= 0);
  const sin = quitarSensaciones(demo);
  assert.equal(respuestasGuardadas(sin), 0);
  const r = recomendar(sin);
  assert.ok(r && typeof r.tipo === 'string', 'devuelve una recomendación válida sin respuestas');
  assert.equal(dolorReciente(sin), false, 'sin respuestas no hay avisos prudentes basados en dolor');
  assert.equal(dolorReciente({ ...vacio(), sesiones: [ses('x', Date.now() - 1000, { dolor: true })] }), true, 'con dolor marcado (sin cuenta) sigue funcionando igual');
});

test('REGLAS INTACTAS: las fórmulas, niveles, XP, adaptación, misiones y Arena son byte a byte las aceptadas (huella)', () => {
  const huellas = {
    'adaptacion.ts': '301d71795efa034174c630a3b83182f64fdd91c8d0d1271440b3458271d24bd3',
    'reglas.ts': '231553d7acb6ef0944ce592f764b725941e728fc7dcbc17a4409b2c61d9c0489',
    'niveles.ts': 'f097b6dfdb0ae26758b8d5fabbdcf588015195cd2453d04865bebe94603ca8a0',
    'xp.ts': '6c76b9c5262d8b7cef9471d4630af1396ff5027a0df2777741aff15e357c70ad',
    'misiones.ts': '377cbef436beaec9eabd0d3d8eeb08261da4ece6381ad4760e85d714b04e6841',
    'atributos.ts': '96a4bb200ca6a589bc9e38a92f13f075cbab70a05b3921b9991bd67e07e1f9e2',
    'competicion.ts': '5b70e7766593b80a897dcf21aca10e41a7a95632f9ca2c16fbcb888e2ab64ed8',
    'servidorArena.ts': 'b03e6a202317f2cdffa77b7f5ea00ad1b9c1e3b0cace706dff481e0dde6477a7',
  };
  for (const [f, h] of Object.entries(huellas)) assert.equal(createHash('sha256').update(readFileSync(new URL(`../../src/${f}`, import.meta.url))).digest('hex'), h, `${f} no debe cambiar`);
});

test('el consentimiento viaja como un ajuste más: el último cambio gana y no se pierde al fusionar', () => {
  const a = tocar(vacio(), (d) => fijarSensaciones(d, true, 100), 100);
  const b = tocar(vacio(), (d) => fijarSensaciones(d, false, 200), 200);
  assert.equal(decisionSensaciones(fusionarDatos(a, b)).valor, false);
  assert.equal(decisionSensaciones(fusionarDatos(b, a)).valor, false);
  assert.equal(decisionSensaciones(fusionarDatos(vacio(), a)).valor, true, 'una cuenta nueva sin decisión adopta la existente');
});
