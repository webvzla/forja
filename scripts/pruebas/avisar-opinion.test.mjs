// Pruebas de la lógica pura de la Edge Function `avisar-opinion` (supabase/functions/avisar-opinion/correo.ts): el secreto compartido,
// la validación del aviso y el correo (que no lleva texto, ni datos de la persona, ni entrenos).
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/avisar-opinion.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { construirCorreo, enlacePanel, secretoValido, validarAviso } from '../../supabase/functions/avisar-opinion/correo.ts';

const SECRETO = 'secreto-de-prueba-largo-0123456789abcdef';
const ID = '3f2b8c1e-5a47-4d6e-9b0a-1c2d3e4f5a6b';
const REF = 'abcdefghijklmnopqrst';
const aviso = (extra = {}) => ({ id: ID, tipo: 'error', version: '1.0.0-beta.1', con_adjunto: false, creado: '2026-11-20T09:15:00.000Z', tabla: 16384, ...extra });

test('secreto compartido: solo el exacto, largo y no vacío', () => {
  assert.equal(secretoValido(SECRETO, SECRETO), true);
  assert.equal(secretoValido(SECRETO + 'x', SECRETO), false);
  assert.equal(secretoValido(SECRETO.slice(0, -1), SECRETO), false);
  assert.equal(secretoValido('', SECRETO), false);
  assert.equal(secretoValido(null, SECRETO), false);
  assert.equal(secretoValido(undefined, SECRETO), false);
  assert.equal(secretoValido('corto', 'corto'), false, 'un secreto esperado de menos de 32 caracteres no vale');
  assert.equal(secretoValido('', ''), false);
  assert.equal(secretoValido(SECRETO, undefined), false);
  assert.equal(secretoValido(SECRETO, null), false);
});

test('validación del aviso: acepta lo esperado y descarta lo demás', () => {
  const v = validarAviso({ ...aviso(), texto: 'Pepe pepe@example.com', user_id: 'x', email: 'a@b.c', tecnico: { a: 1 }, datos: { b: 2 } });
  assert.deepEqual(Object.keys(v).sort(), ['con_adjunto', 'creado', 'id', 'tabla', 'tipo', 'version']);
  assert.ok(!JSON.stringify(v).includes('Pepe') && !JSON.stringify(v).includes('@'));
  assert.equal(v.creado, '2026-11-20T09:15:00.000Z');
});

test('validación del aviso: rechaza formas no válidas', () => {
  for (const malo of [null, undefined, 'x', 5, [], {}, aviso({ id: 'no-uuid' }), aviso({ id: ID.toUpperCase() }), aviso({ tipo: 'otro' }), aviso({ tipo: 5 }),
    aviso({ version: '1.0 <script>' }), aviso({ version: '' }), aviso({ version: 'x'.repeat(41) }), aviso({ con_adjunto: 'si' }), aviso({ creado: 'ayer' }), aviso({ creado: 5 })]) {
    assert.equal(validarAviso(malo), null, JSON.stringify(malo));
  }
  assert.equal(validarAviso(aviso({ tabla: 'x' })).tabla, null, 'sin tabla válida se avisa igual, con enlace general');
  assert.equal(validarAviso(aviso({ tabla: -1 })).tabla, null);
});

test('enlace al panel: solo con una referencia de proyecto válida; la opinión se filtra por su id', () => {
  const a = validarAviso(aviso());
  assert.equal(enlacePanel(REF, a), `https://supabase.com/dashboard/project/${REF}/editor/16384?filter=id%3Aeq%3A${ID}`);
  assert.equal(enlacePanel(REF, validarAviso(aviso({ tabla: null }))), `https://supabase.com/dashboard/project/${REF}/editor`);
  for (const ref of [null, undefined, '', 'corta', 'ABCDEFGHIJKLMNOPQRST', `${REF}/../x`, 'a'.repeat(21), 'evil.com/?']) assert.equal(enlacePanel(ref, a), null, String(ref));
});

test('el correo indica que hay una opinión nueva y da acceso al panel, SIN texto, datos de la persona ni entrenos', () => {
  const peligroso = validarAviso({ ...aviso({ tipo: 'entreno' }), texto: 'Mi nombre es Pepe Pérez, vivo en la calle Mayor 5, pepe@example.com', email: 'pepe@example.com', user_id: 'u-123', datos: { entrenos: 7 }, tecnico: { sistema: 'Mozilla/5.0' } });
  const c = construirCorreo(peligroso, REF);
  assert.match(c.asunto, /^FORJA BETA · Nueva opinión \(problema con un entreno\)$/);
  assert.match(c.texto, /Hay una opinión nueva en FORJA BETA/);
  assert.match(c.texto, /Tipo: Problema con un entreno/);
  assert.match(c.texto, /Versión de la app: 1\.0\.0-beta\.1/);
  assert.match(c.texto, /Trae captura de pantalla: no/);
  assert.match(c.texto, new RegExp(`https://supabase.com/dashboard/project/${REF}/editor/16384\\?filter=id%3Aeq%3A${ID}`));
  assert.match(c.texto, /Este aviso no incluye el texto de la opinión, ni datos de la persona, ni sus entrenos/);
  for (const prohibido of ['Pepe', 'Mayor', 'example', '@', 'u-123', 'Mozilla', 'entrenos: 7']) {
    assert.ok(!c.texto.includes(prohibido) && !c.html.includes(prohibido) && !c.asunto.includes(prohibido), `el correo contiene «${prohibido}»`);
  }
  assert.ok(c.html.includes(`href="https://supabase.com/dashboard/project/${REF}/editor/16384?filter=id%3Aeq%3A${ID}"`));
  assert.ok(!/<img|src=/i.test(c.html), 'el correo no carga imágenes ni recursos externos');
});

test('con captura: lo dice, pero NO adjunta la imagen ni enlaza a ella (se ve desde Storage cuando el titular lo decide)', () => {
  const c = construirCorreo(validarAviso(aviso({ con_adjunto: true })), REF);
  assert.match(c.texto, /Trae captura de pantalla: sí/);
  assert.match(c.texto, /La captura NO se abre sola/);
  assert.ok(!/opiniones-adjuntos\/|\.jpg|\.png|\.webp|signed|token=/i.test(c.texto + c.html));
});

test('sin referencia de proyecto el correo sigue siendo útil (indica dónde mirar)', () => {
  const c = construirCorreo(validarAviso(aviso()), null);
  assert.match(c.texto, /Table Editor → beta_opiniones/);
  assert.ok(!/https?:\/\//.test(c.texto));
});

test('el HTML escapa lo que no debe ejecutarse', () => {
  const c = construirCorreo(validarAviso(aviso({ version: '1.0.0-beta.1' })), REF);
  assert.ok(!/<script/i.test(c.html));
});

test('la función no contiene ninguna contraseña ni secreto escrito en el código y solo lee los secretos del entorno', () => {
  const idx = readFileSync(new URL('../../supabase/functions/avisar-opinion/index.ts', import.meta.url), 'utf8');
  const cor = readFileSync(new URL('../../supabase/functions/avisar-opinion/correo.ts', import.meta.url), 'utf8');
  for (const f of [idx, cor]) {
    assert.ok(!/@gmail\.com|@hotmail|@outlook|sb_secret_|sb_publishable_|eyJ[A-Za-z0-9_-]{15,}|password\s*[:=]\s*['"][^'"]{6,}/i.test(f), 'no debe haber correos, claves ni contraseñas escritas');
  }
  for (const n of ['AVISO_SECRETO', 'AVISO_SMTP_USUARIO', 'AVISO_SMTP_CLAVE', 'AVISO_DESTINO']) assert.ok(idx.includes(`Deno.env.get('${n}')`), `lee ${n} del entorno`);
  assert.ok(idx.includes('port: 465') && idx.includes('secure: true'), 'Gmail por el 465 con TLS (25 y 587 están bloqueados en Edge Functions)');
  assert.ok(!/console\.(log|error)\([^)]*(clave|secreto|usuario|aviso\b)/.test(idx.replace("console.error('no se pudo enviar el aviso:'", '')), 'no registra secretos');
});
