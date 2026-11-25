// Pruebas de la lógica de Cloudflare Turnstile (src/turnstile.ts y la lectura de la clave en src/config.ts). Sin red.
//   node --import ./scripts/pruebas/registrar.mjs --test scripts/pruebas/turnstile.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { esClaveDePrueba, esSiteKeyValida, opcionesCaptcha, requiereCaptcha, textoCaptcha, URL_SCRIPT_TURNSTILE } from '../../src/turnstile.ts';

const REAL = '0x4AAAAAAAExampleSiteKey_1234'; // forma de una site key real (inventada)

test('formato de la site key: solo se acepta algo con forma de site key de Turnstile', () => {
  for (const ok of [REAL, '1x00000000000000000000AA', '2x00000000000000000000AB', '3x00000000000000000000FF', ` ${REAL} `]) assert.equal(esSiteKeyValida(ok), true, ok);
  for (const mal of ['', 'abc', '0x4', 'x4AAAAAAAAAAAAAAAAAAAAAA', 'https://example.com', '0x4AAAA AAAAAAAAAAAAAAAAAAAA', '0x4AAAA<script>alert(1)</script>']) assert.equal(esSiteKeyValida(mal), false, JSON.stringify(mal));
});

test('claves de prueba de Cloudflare: se detectan para no publicar con ellas', () => {
  for (const k of ['1x00000000000000000000AA', '2x00000000000000000000AB', '3x00000000000000000000FF']) assert.equal(esClaveDePrueba(k), true, k);
  assert.equal(esClaveDePrueba(REAL), false);
  assert.equal(esClaveDePrueba('0x4AAAAAAAAAAAAAAAAAAAAAAAAA'), false);
});

test('cuándo se pide la comprobación: solo con clave válida y solo al entrar, crear cuenta o recuperar contraseña', () => {
  for (const m of ['entrar', 'registro', 'olvido']) assert.equal(requiereCaptcha(REAL, m), true, m);
  assert.equal(requiereCaptcha(REAL, 'nueva'), false, 'poner la nueva contraseña no lleva captcha en Supabase');
  for (const m of ['entrar', 'registro', 'olvido', 'nueva']) {
    assert.equal(requiereCaptcha('', m), false, `sin clave no se pide (${m})`);
    assert.equal(requiereCaptcha('clave-mal', m), false, `con clave inválida no se pide (${m})`);
  }
});

test('opciones para Supabase: el token va como captchaToken; sin token no se envía nada (el servidor decidirá)', () => {
  assert.deepEqual(opcionesCaptcha('tok'), { captchaToken: 'tok' });
  for (const v of [null, undefined, '']) assert.deepEqual(opcionesCaptcha(v), {});
});

test('textos de ayuda: claros en cada estado y sin ruido cuando todo va bien', () => {
  assert.match(textoCaptcha('sin-script', false), /No se pudo cargar la comprobación/);
  assert.match(textoCaptcha('error', false), /No se pudo completar/);
  assert.match(textoCaptcha('caducado', false), /caducó/);
  assert.match(textoCaptcha('cargando', false), /Cargando/);
  assert.match(textoCaptcha('listo', false), /Completa la comprobación/);
  assert.equal(textoCaptcha('listo', true), null);
});

test('el script solo se carga del dominio de Cloudflare y de forma explícita', () => {
  assert.equal(new URL(URL_SCRIPT_TURNSTILE).hostname, 'challenges.cloudflare.com');
  assert.match(URL_SCRIPT_TURNSTILE, /render=explicit/);
});

const leerClave = (valor) => execFileSync(process.execPath, ['--import', './scripts/pruebas/registrar.mjs', '--input-type=module', '-e', "import { CAPTCHA_SITEKEY } from './src/config.ts'; console.log(JSON.stringify(CAPTCHA_SITEKEY));"], { env: { ...process.env, ...(valor === undefined ? {} : { EXPO_PUBLIC_CAPTCHA_SITEKEY: valor }) }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop();

test('la configuración lee la clave del entorno: vacía por defecto, válida se acepta y lo raro se descarta', () => {
  assert.equal(leerClave(undefined), '""', 'sin variable: sin captcha');
  assert.equal(leerClave(''), '""');
  assert.equal(leerClave(REAL), JSON.stringify(REAL));
  assert.equal(leerClave(`  ${REAL}  `), JSON.stringify(REAL), 'recorta espacios');
  assert.equal(leerClave('esto-no-es-una-clave'), '""');
  assert.equal(leerClave('0x4AAAA<script>'), '""');
});

test('la secret key del captcha no aparece en la app: ninguna variable pública ni código la maneja (solo la site key)', () => {
  for (const f of ['config.ts', 'turnstile.ts', 'Captcha.tsx', 'Cuenta.tsx']) {
    const t = readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/EXPO_PUBLIC_[A-Z_]*SECRET/.test(t), `${f}: ninguna variable pública de secreto`);
    assert.ok(!/(CAPTCHA|TURNSTILE)_?SECRET|secret[_ ]?key/i.test(t), `${f}: no debe manejar la secret key del captcha`);
  }
});
