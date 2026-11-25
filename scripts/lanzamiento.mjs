// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Puerta de lanzamiento de FORJA BETA: lo que debe cumplirse ANTES de publicar. Falla (código 1) si falta algo.
//   node scripts/lanzamiento.mjs            comprueba el código y los textos legales
//   El nombre y el correo del titular no están en el repositorio: se leen de EXPO_PUBLIC_TITULAR y
//   EXPO_PUBLIC_CORREO_CONTACTO (las mismas variables con las que se compila). Los textos no publican domicilio.
//   node scripts/lanzamiento.mjs --dist     además revisa la web compilada en dist/ (claves, proyecto de Supabase y captcha)
//                                           (--sin-captcha omite la comprobación de Turnstile; solo para una publicación sin captcha decidida)
// Es adrede estricta: mientras el titular no confirme sus datos y los textos no estén revisados, no pasa.
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const leer = (f) => readFileSync(f, 'utf8');
const fallos = [];
const avisos = [];
const ok = (m) => console.log('  ✓', m);
const falla = (m) => { fallos.push(m); console.log('  ✗', m); };
const si = (condicion, bien, mal) => (condicion ? ok(bien) : falla(mal));

// --- Textos legales (src/legal.ts y variables de compilación) ---
const legal = leer('src/legal.ts');
const titular = (process.env.EXPO_PUBLIC_TITULAR ?? '').trim();
const contacto = (process.env.EXPO_PUBLIC_CORREO_CONTACTO ?? '').trim();
for (const n of ['TITULAR', 'CORREO_CONTACTO'])
  si(new RegExp(`export const ${n} = \\(process\\.env\\.EXPO_PUBLIC_${n} \\?\\? ''\\)\\.trim\\(\\);`).test(legal), `${n} se toma de la compilación (no está escrito en el código)`, `src/legal.ts debe leer ${n} de EXPO_PUBLIC_${n}, sin valor escrito.`);
si(titular, 'EXPO_PUBLIC_TITULAR definido', 'Falta EXPO_PUBLIC_TITULAR (nombre público del titular). Lo confirma el titular; no se inventa.');
si(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto), 'EXPO_PUBLIC_CORREO_CONTACTO definido', 'Falta EXPO_PUBLIC_CORREO_CONTACTO (correo de contacto de FORJA) o no parece un correo.');
si(/export const LEGAL_REVISADO = true/.test(legal), 'Textos legales marcados como revisados', 'Los textos legales aún no están marcados como revisados (LEGAL_REVISADO en src/legal.ts).');
si(/export const EDAD_MINIMA = (\d+)/.test(legal), `Edad mínima: ${legal.match(/EDAD_MINIMA = (\d+)/)?.[1]} años`, 'Falta EDAD_MINIMA');
if (/PROVISIONAL/.test(legal)) avisos.push('Hay valores PROVISIONALES en src/legal.ts (proveedor de correo, plazos): confirmarlos antes de abrir.');

// --- Versión coherente ---
const app = JSON.parse(leer('app.json')).expo;
const version = leer('src/version.ts').match(/export const VERSION = '([^']+)'/)?.[1];
si(version === app.version, `Versión ${version} (app.json y src/version.ts coinciden)`, `La versión de app.json (${app.version}) y la de src/version.ts (${version}) no coinciden.`);
si(leer('src/version.ts').match(/NOVEDADES: Novedad\[\] = \[\s*\{\s*version: '([^']+)'/)?.[1] === version, '«Qué hay de nuevo» tiene entrada para esta versión', 'Falta la entrada de esta versión en NOVEDADES (src/version.ts).');

// --- Funciones que NO deben estar en la beta ---
const config = leer('src/config.ts');
si(/export const IA_ACTIVA = false/.test(config), 'IA (Gemini) desactivada', 'IA_ACTIVA debe ser false en la beta.');
si(/export const DEMO = false/.test(config), 'Modo demostración desactivado', 'DEMO debe ser false en la beta.');

// --- Migraciones ---
const migraciones = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
si(migraciones.some((f) => /beta_opiniones/.test(f)) && migraciones.some((f) => /opiniones_avisos_y_capturas/.test(f)), `Migraciones: ${migraciones.length} (incluye las opiniones de la beta y sus avisos y capturas)`, 'Faltan las migraciones de opiniones de la beta (8 y 9).');

// --- Datos personales en archivos públicos: ninguna dirección de correo personal ni de contacto en el código ni en docs/ ---
const correoPersonal = /[\w.+-]+@(?:gmail|hotmail|outlook|icloud|yahoo|proton|protonmail)\.(?:com|es|me)/i;
const sospechosos = [];
const recorrer = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git', 'dist', 'propiedad'].includes(e.name) && !e.name.startsWith('dist-') && !e.name.startsWith('.expo')) recorrer(ruta); }
    else if (/\.(ts|tsx|mjs|js|json|md|sql|html|yml|plantilla|txt)$/.test(e.name) && !/LICENCIAS-TERCEROS|package-lock/.test(e.name) && correoPersonal.test(leer(ruta))) sospechosos.push(ruta);
  }
};
for (const d of ['src', 'docs', 'scripts', 'supabase', 'herramientas', 'public']) if (existsSync(d)) recorrer(d);
si(sospechosos.length === 0, 'Ningún correo personal en el código ni en la documentación pública', `Hay direcciones de correo personales en archivos que se publicarían: ${sospechosos.join(', ')}`);

// --- Atribuciones de Academy ---
si(existsSync('public/academia/CREDITOS.md'), 'Créditos de las ilustraciones de Academy presentes', 'Falta public/academia/CREDITOS.md');

// --- Web compilada ---
if (process.argv.includes('--dist')) {
  const carpeta = 'dist/_expo/static/js/web';
  if (!existsSync(carpeta)) falla('No hay web compilada en dist/ (ejecuta npm run build:web).');
  else {
    const js = readdirSync(carpeta).filter((f) => f.endsWith('.js')).map((f) => leer(join(carpeta, f))).join('\n');
    // El minificador escribe las tildes como \xNN o \uNNNN: se deshace antes de buscar el nombre.
    const texto = js.replace(/\\x([0-9a-fA-F]{2})|\\u([0-9a-fA-F]{4})/g, (_, a, b) => String.fromCharCode(parseInt(a ?? b, 16)));
    si(!!titular && !!contacto && texto.includes(titular) && texto.includes(contacto), 'La web compilada lleva el nombre y el correo del titular', 'La web compilada no lleva el nombre y el correo del titular: saldría «[pendiente de confirmar]». Compila con EXPO_PUBLIC_TITULAR y EXPO_PUBLIC_CORREO_CONTACTO.');
    si(!/jfjvcndrssbbbfazqvbs/.test(js), 'La web compilada no apunta a forja-dev', 'La web compilada apunta a forja-dev (jfjvcndrssbbbfazqvbs). Nunca debe usarse para usuarios reales.');
    si(!/sb_secret_[A-Za-z0-9_-]{10,}/.test(js), 'Sin claves secretas en la web compilada', 'La web compilada contiene una clave secreta.');
    // Solo la clave publicable nueva (sb_publishable_…): ninguna clave legacy (JWT con rol anon o service_role) debe ir en la web.
    si(/sb_publishable_[A-Za-z0-9_-]{20,}/.test(js), 'La web compilada usa una clave publicable (sb_publishable_…)', 'La web compilada no lleva ninguna clave sb_publishable_… (EXPO_PUBLIC_SUPABASE_ANON_KEY debe ser la clave publicable del proyecto).');
    const rolesLegacy = [...js.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g)].map((m) => { try { return JSON.parse(Buffer.from(m[1], 'base64url').toString()).role; } catch { return undefined; } }).filter((r) => r === 'anon' || r === 'service_role');
    si(rolesLegacy.length === 0, 'La web compilada no lleva claves legacy (anon / service_role)', `La web compilada contiene ${rolesLegacy.length} clave(s) legacy (JWT con rol ${[...new Set(rolesLegacy)].join(', ')}). Usa la clave sb_publishable_….`);
    si(/https:\/\/[a-z0-9]{20}\.supabase\.co/.test(js), 'La web compilada lleva la URL de un proyecto de Supabase', 'La web compilada no lleva URL de Supabase (saldría sin cuentas): faltan EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY al compilar.');
  }
  // Captcha (decisión: Cloudflare Turnstile). La site key es pública y va en la web; la secret key solo en Supabase.
  const claveCaptcha = (process.env.EXPO_PUBLIC_CAPTCHA_SITEKEY ?? '').trim();
  if (process.argv.includes('--sin-captcha')) avisos.push('Se publica SIN captcha (--sin-captcha): el registro queda expuesto a bots y a agotar el tope diario de correos.');
  else {
    si(/^[0-9]x[A-Za-z0-9_-]{16,}$/.test(claveCaptcha), 'Site key de Turnstile con formato válido', 'Falta EXPO_PUBLIC_CAPTCHA_SITEKEY (o no tiene forma de site key de Turnstile): la web se compilaría sin captcha.');
    si(!/^[123]x0{12,}/.test(claveCaptcha), 'La site key no es una clave de prueba de Cloudflare', 'La site key es una clave de PRUEBA de Turnstile: no se puede publicar con ella.');
    const carpetaJs = 'dist/_expo/static/js/web';
    const js = existsSync(carpetaJs) ? readdirSync(carpetaJs).filter((f) => f.endsWith('.js')).map((f) => leer(join(carpetaJs, f))).join('\n') : '';
    si(!!claveCaptcha && js.includes(claveCaptcha), 'La web compilada lleva la site key de Turnstile', 'La web compilada no contiene la site key (se compiló sin la variable).');
  }
  si(existsSync('dist/version.json'), 'dist/version.json generado', 'Falta dist/version.json (ejecuta node scripts/pwa.mjs).');
}

for (const a of avisos) console.log('  ⚠', a);
console.log(fallos.length ? `\nNO LISTO PARA PUBLICAR: ${fallos.length} cosa(s) pendiente(s).` : '\nListo para publicar.');
process.exit(fallos.length ? 1 : 0);
