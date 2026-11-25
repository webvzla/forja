// Pruebas de las partes puras de las capturas opcionales (src/adjuntos.ts): validación, ruta, detección de metadatos y mensajes.
// La reducción/recodificación con canvas se prueba en Chrome (scripts/pruebas/e2e-adjuntos.mjs).
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/adjuntos.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ADJUNTO_MAX_BYTES, ENTRADA_MAX_BYTES, TIPOS_ADJUNTO, extensionDe, formatoBytes, mensajeErrorSubida, rutaAdjunto, tieneMetadatos, uuidNuevo, validarEntrada } from '../../src/adjuntos.ts';

const u8 = (...p) => Uint8Array.from(p.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : Array.isArray(x) ? x : [x])));
const be16 = (n) => [(n >> 8) & 255, n & 255];
const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];

// JPEG: SOI + segmentos + SOS + datos + EOI
const seg = (marca, datos) => [0xff, marca, ...be16(datos.length + 2), ...datos];
const SOS = [0xff, 0xda, 0x00, 0x03, 0x01, 0x00, 1, 2, 3, 0xff, 0xd9];
const jpeg = (...segmentos) => u8([0xff, 0xd8], ...segmentos, SOS);
const JFIF = seg(0xe0, [...u8('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const DQT = seg(0xdb, new Array(65).fill(8));
const EXIF = seg(0xe1, [...u8('Exif'), 0, 0, ...u8('GPS 40.4168 -3.7038')]);
const XMP = seg(0xe1, [...u8('http://ns.adobe.com/xap/1.0/'), 0, ...u8('<x:xmpmeta/>')]);
const ICC = seg(0xe2, [...u8('ICC_PROFILE'), 0, 1, 1, 0, 0, 0, 0]);
const IPTC = seg(0xed, [...u8('Photoshop 3.0'), 0]);
const COMENTARIO = seg(0xfe, u8('hecha en mi casa'));

// PNG
const trozo = (tipo, datos = []) => [...be32(datos.length), ...u8(tipo), ...datos, 0, 0, 0, 0];
const png = (...extra) => u8([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], trozo('IHDR', new Array(13).fill(0)), ...extra, trozo('IDAT', [1, 2, 3]), trozo('IEND'));

// WebP
const trozoWebp = (tipo, datos) => [...u8(tipo), ...le32(datos.length), ...datos, ...(datos.length % 2 ? [0] : [])];
const webp = (...trozos) => { const cuerpo = [...u8('WEBP'), ...trozos.flat()]; return u8('RIFF', le32(cuerpo.length), cuerpo); };

test('JPEG: detecta EXIF, XMP, IPTC y comentarios; el perfil de color y JFIF no cuentan', () => {
  assert.equal(tieneMetadatos(jpeg(JFIF, DQT)), false);
  assert.equal(tieneMetadatos(jpeg(JFIF, ICC, DQT)), false);
  assert.equal(tieneMetadatos(jpeg(JFIF, EXIF, DQT)), true);
  assert.equal(tieneMetadatos(jpeg(EXIF)), true);
  assert.equal(tieneMetadatos(jpeg(JFIF, XMP, DQT)), true);
  assert.equal(tieneMetadatos(jpeg(JFIF, IPTC)), true);
  assert.equal(tieneMetadatos(jpeg(JFIF, COMENTARIO)), true);
});
test('PNG: detecta eXIf, tEXt, zTXt, iTXt y tIME', () => {
  assert.equal(tieneMetadatos(png()), false);
  assert.equal(tieneMetadatos(png(trozo('iCCP', [1, 2]))), false);
  for (const t of ['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']) assert.equal(tieneMetadatos(png(trozo(t, [1, 2, 3]))), true, t);
});
test('WebP: detecta EXIF y XMP', () => {
  assert.equal(tieneMetadatos(webp(trozoWebp('VP8 ', [1, 2, 3, 4, 5]))), false);
  assert.equal(tieneMetadatos(webp(trozoWebp('VP8X', new Array(10).fill(0)), trozoWebp('VP8 ', [1, 2, 3]))), false);
  assert.equal(tieneMetadatos(webp(trozoWebp('VP8X', new Array(10).fill(0)), trozoWebp('EXIF', [1, 2, 3]), trozoWebp('VP8 ', [1, 2]))), true);
  assert.equal(tieneMetadatos(webp(trozoWebp('VP8X', new Array(10).fill(0)), trozoWebp('XMP ', [1]), trozoWebp('VP8 ', [1, 2]))), true);
});
test('un archivo que no es imagen o está truncado no revienta', () => {
  assert.equal(tieneMetadatos(new Uint8Array()), false);
  assert.equal(tieneMetadatos(u8('hola')), false);
  assert.equal(tieneMetadatos(u8([0xff, 0xd8, 0xff])), false);
  assert.equal(tieneMetadatos(png().slice(0, 20)), false);
});

test('validar la entrada: solo JPG, PNG y WebP, no vacío y no enorme', () => {
  for (const t of TIPOS_ADJUNTO) assert.equal(validarEntrada(t, 1000), null, t);
  for (const t of ['image/gif', 'image/svg+xml', 'application/pdf', 'image/heic', 'text/html', '']) assert.match(validarEntrada(t, 1000), /JPG, PNG o WebP/, t);
  assert.match(validarEntrada('image/png', 0), /vacío/);
  assert.equal(validarEntrada('image/png', ENTRADA_MAX_BYTES), null);
  assert.match(validarEntrada('image/png', ENTRADA_MAX_BYTES + 1), /pesa demasiado/);
  assert.equal(ADJUNTO_MAX_BYTES, 2 * 1024 * 1024);
});

test('la ruta es <id>/<uuid>.<ext> y coincide con lo que acepta la política del servidor', () => {
  const uid = '3f2b8c1e-5a47-4d6e-9b0a-1c2d3e4f5a6b';
  const id = uuidNuevo();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const re = new RegExp('^' + uid + '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$');
  for (const [tipo, ext] of [['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]) {
    assert.equal(rutaAdjunto(uid, id, tipo), `${uid}/${id}.${ext}`);
    assert.match(rutaAdjunto(uid, id, tipo), re);
    assert.equal(extensionDe(tipo), ext);
  }
  assert.throws(() => rutaAdjunto(uid, id, 'image/gif'));
  assert.equal(extensionDe('image/gif'), null);
  assert.notEqual(uuidNuevo(), uuidNuevo());
});

test('mensajes de error del almacén claros y sin textos técnicos', () => {
  assert.match(mensajeErrorSubida('new row violates row-level security policy'), /máximo de 10 capturas/);
  assert.match(mensajeErrorSubida('The object exceeded the maximum allowed size'), /pesa demasiado/);
  assert.match(mensajeErrorSubida('mime type image/gif is not supported'), /JPG, PNG o WebP/);
  assert.match(mensajeErrorSubida('The resource already exists'), /ya estaba subida/);
  assert.match(mensajeErrorSubida('Failed to fetch'), /Revisa tu conexión/);
  for (const m of ['row-level security', 'exceeded', 'mime', 'Failed to fetch', '']) assert.ok(!/policy|violates|exceeded|mime type|statusCode/i.test(mensajeErrorSubida(m)));
});

test('formato de tamaños', () => {
  assert.equal(formatoBytes(512), '512 B');
  assert.equal(formatoBytes(148 * 1024), '148 KB');
  assert.equal(formatoBytes(2 * 1024 * 1024), '2,0 MB');
});
