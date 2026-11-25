// Pruebas de los datos que acompañan a una opinión (src/opinionesDatos.ts): lenguaje claro, sin JSON, sin datos personales
// y sin sensaciones ni dolor.
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/opiniones.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { datosIniciales } from '../../src/datos.ts';
import { datosDemo } from '../../src/demo.ts';
import { datosTecnicos, lineasResumen, lineasTecnicas, navegadorLegible, resumenDatos, textoCorreo } from '../../src/opinionesDatos.ts';

const UA_CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const UA_SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const UA_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';
const UA_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

test('navegador legible: Chrome, Edge, Firefox, Safari y sistemas', () => {
  assert.equal(navegadorLegible(UA_CHROME_WIN), 'Chrome 142 · Windows');
  assert.equal(navegadorLegible(UA_EDGE), 'Edge 141 · Windows');
  assert.equal(navegadorLegible(UA_FIREFOX), 'Firefox 130 · Linux');
  assert.equal(navegadorLegible(UA_SAFARI_IOS), 'Safari 18 · iOS');
  assert.equal(navegadorLegible(UA_ANDROID), 'Chrome 141 · Android');
  assert.equal(navegadorLegible(null), 'No consta');
  assert.equal(navegadorLegible(''), 'No consta');
});

test('datos técnicos: solo versión, modo, pantalla, navegador, idioma e instalada (sin email ni nombre)', () => {
  const t = datosTecnicos('1.0.0-beta.1', true, { ancho: 1080, alto: 1833, userAgent: UA_CHROME_WIN, idioma: 'es-ES', instalada: false });
  assert.deepEqual(Object.keys(t).sort(), ['idioma', 'instalada', 'modo', 'pantalla', 'sistema', 'version']);
  assert.equal(t.modo, 'con-cuenta');
  assert.equal(t.pantalla, '1080x1833');
  assert.ok(!/@/.test(JSON.stringify(t)));
  const sin = datosTecnicos('1.0.0-beta.1', false, {});
  assert.equal(sin.modo, 'sin-cuenta');
  assert.equal(sin.pantalla, null);
  assert.equal(sin.sistema, null);
  assert.equal(sin.instalada, null);
  assert.equal(datosTecnicos('x', true, { userAgent: 'a'.repeat(500) }).sistema.length, 200);
});

test('las líneas técnicas son texto claro: etiquetas en español, sin llaves ni comillas', () => {
  const t = datosTecnicos('1.0.0-beta.1', false, { ancho: 360, alto: 780, userAgent: UA_SAFARI_IOS, idioma: 'es', instalada: true });
  const l = lineasTecnicas(t);
  assert.deepEqual(l.map(([k]) => k), ['Versión de FORJA', 'Cuenta', 'Tamaño de pantalla', 'Navegador y sistema', 'Idioma', 'App instalada en el dispositivo']);
  assert.deepEqual(Object.fromEntries(l), {
    'Versión de FORJA': '1.0.0-beta.1', Cuenta: 'Sin cuenta', 'Tamaño de pantalla': '360 × 780 píxeles', 'Navegador y sistema': 'Safari 18 · iOS', Idioma: 'es', 'App instalada en el dispositivo': 'Sí',
  });
  for (const [k, v] of l) assert.ok(!/[{}"]/.test(k + v), `${k}: ${v}`);
});

test('el resumen opcional NO incluye sensaciones ni dolor aunque el último entreno los tenga', () => {
  const d = datosDemo();
  d.sesiones[0] = { ...d.sesiones[0], sensacion: 'duro', dolor: true };
  const r = resumenDatos(d);
  assert.deepEqual(Object.keys(r).sort(), ['dificultad', 'diasPorSemana', 'entrenos', 'nivel', 'objetivo', 'ultimoEntreno'].sort());
  assert.deepEqual(Object.keys(r.ultimoEntreno).sort(), ['dia', 'ejercicios', 'rutina', 'series']);
  const texto = JSON.stringify(r) + lineasResumen(r).flat().join(' ');
  assert.ok(!/sensaci|dolor|duro/i.test(texto), texto);
  assert.equal(r.entrenos, d.sesiones.length);
});

test('el resumen sin datos no inventa nada', () => {
  const r = resumenDatos(datosIniciales());
  assert.equal(r.entrenos, 0);
  assert.equal(r.ultimoEntreno, null);
  const l = Object.fromEntries(lineasResumen(r));
  assert.equal(l['Último entreno'], 'Ninguno');
  assert.equal(l.Objetivo, 'No consta');
});

test('el cuerpo del correo es texto legible, sin JSON, y el resumen solo va si se pide', () => {
  const t = datosTecnicos('1.0.0-beta.1', false, { ancho: 400, alto: 900, userAgent: UA_CHROME_WIN, idioma: 'es-ES', instalada: false });
  const sin = textoCorreo('🐞 Un error', '  No carga la gráfica  ', 0, t, null);
  assert.match(sin, /^Tipo: 🐞 Un error\n/);
  assert.match(sin, /No carga la gráfica/);
  assert.match(sin, /Versión de FORJA: 1\.0\.0-beta\.1/);
  assert.match(sin, /Navegador y sistema: Chrome 142 · Windows/);
  assert.ok(!/[{}]|"version"|resumen/i.test(sin), sin);
  const con = textoCorreo('⭐ Valorar FORJA', 'Bien', 4, t, resumenDatos(datosDemo()));
  assert.match(con, /Valoración: 4\/5/);
  assert.match(con, /--- Resumen de mis datos ---/);
  assert.match(con, /Entrenos registrados: \d+/);
  assert.ok(!/[{}]|sensaci|dolor/i.test(con), con);
});
