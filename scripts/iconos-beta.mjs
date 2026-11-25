// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Genera los iconos de FORJA BETA (el icono original con una etiqueta «BETA» abajo) con Chrome sin pantalla.
// Los originales se conservan en assets/iconos-originales/ (para volver atrás o preparar el icono de la versión final).
//   node scripts/iconos-beta.mjs
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const originales = resolve('assets/iconos-originales');
mkdirSync(originales, { recursive: true });
for (const f of ['icon-512.png', 'icon-192.png', 'apple-touch-icon.png']) if (!existsSync(join(originales, f))) copyFileSync(join('public', f), join(originales, f));

const tmp = mkdtempSync(join(tmpdir(), 'forja-iconos-'));
const base = pathToFileURL(join(originales, 'icon-512.png')).href;
const foto = (html, salida, lado) => {
  const pagina = join(tmp, 'p.html');
  writeFileSync(pagina, html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${lado},${lado}`, `--screenshot=${salida}`, pathToFileURL(pagina).href], { stdio: 'ignore' });
};

const grande = join(tmp, 'beta-512.png');
foto(`<!doctype html><html><body style="margin:0;background:#0E0F13"><div style="width:512px;height:512px;position:relative;overflow:hidden">
<img src="${base}" width="512" height="512" style="display:block">
<div style="position:absolute;left:50%;bottom:20px;transform:translateX(-50%);background:#F4C34F;color:#0E0F13;font:900 54px/1 'Segoe UI',Arial,sans-serif;letter-spacing:9px;padding:9px 30px 9px 39px;border-radius:999px">BETA</div></div></body></html>`, grande, 512);
copyFileSync(grande, 'public/icon-512.png');
const reducida = (lado, salida) => foto(`<!doctype html><html><body style="margin:0;background:#0E0F13"><img src="${pathToFileURL(grande).href}" width="${lado}" height="${lado}" style="display:block"></body></html>`, salida, lado);
reducida(192, resolve('public/icon-192.png'));
reducida(180, resolve('public/apple-touch-icon.png'));
console.log('Iconos de FORJA BETA generados en public/ (originales en assets/iconos-originales/).');
