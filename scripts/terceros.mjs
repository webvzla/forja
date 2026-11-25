// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Genera el aviso de licencias de terceros con los paquetes que REALMENTE van dentro de la web.
// Uso:
//   npx expo export -p web --source-maps --output-dir /tmp/forja-mapa
//   node scripts/terceros.mjs /tmp/forja-mapa  [salida, por defecto docs/propiedad/LICENCIAS-TERCEROS.txt]
// Lee el mapa de código fuente para saber qué paquetes se incluyen y copia el texto íntegro de cada
// licencia (las licencias MIT, BSD y 0BSD exigen conservar el aviso en las copias distribuidas).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = process.argv[2];
const salida = process.argv[3] ?? 'docs/propiedad/LICENCIAS-TERCEROS.txt';
if (!carpeta) {
  console.error('Indica la carpeta del export con --source-maps');
  process.exit(1);
}

const mapas = [];
const buscar = (d) => {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, f.name);
    if (f.isDirectory()) buscar(p);
    else if (f.name.endsWith('.js.map')) mapas.push(p);
  }
};
buscar(carpeta);

const rutas = new Map(); // paquete -> carpeta en node_modules
for (const m of mapas) {
  const j = JSON.parse(readFileSync(m, 'utf8'));
  const fuentes = j.sources ?? (j.sections ?? []).flatMap((s) => s.map.sources);
  for (const s of fuentes) {
    const i = s.lastIndexOf('node_modules/');
    if (i < 0) continue;
    const resto = s.slice(i + 13).split('/');
    const nombre = resto[0].startsWith('@') ? `${resto[0]}/${resto[1]}` : resto[0];
    const dir = s.slice(0, i + 13) + nombre;
    if (!rutas.has(nombre)) rutas.set(nombre, dir.replace(/^.*?(node_modules\/)/, '$1'));
  }
}

const textoLicencia = (dir) => {
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find((x) => /^(licen[sc]e|copying)(\.|$)/i.test(x));
  return f ? readFileSync(join(dir, f), 'utf8').trim() : null;
};

const bloques = [];
const resumen = [];
for (const nombre of [...rutas.keys()].sort()) {
  let dir = rutas.get(nombre);
  if (!existsSync(join(dir, 'package.json'))) {
    const anidado = readdirSync('node_modules', { withFileTypes: true })
      .filter((x) => x.isDirectory())
      .map((x) => join('node_modules', x.name, 'node_modules', nombre))
      .find((p) => existsSync(join(p, 'package.json')));
    if (anidado) dir = anidado;
  }
  const pkg = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) : {};
  const lic = typeof pkg.license === 'string' ? pkg.license : 'desconocida';
  // Los paquetes @react-native/* se publican sin archivo propio: su licencia es la del repositorio react-native.
  const texto = textoLicencia(dir) ?? textoLicencia(join('node_modules', nombre)) ??
    (nombre.startsWith('@react-native/') ? textoLicencia(join('node_modules', 'react-native')) : null);
  resumen.push(`${nombre}@${pkg.version ?? '?'} — ${lic}${texto ? '' : ' (sin archivo de licencia: se cita el campo "license" de package.json)'}`);
  bloques.push(`${'='.repeat(78)}\n${nombre} ${pkg.version ?? ''} — ${lic}\n${pkg.homepage ?? (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '')}\n${'-'.repeat(78)}\n${texto ?? `Licencia declarada: ${lic}. Ver el paquete original en npm.`}\n`);
}

const cabecera = `FORJA · LICENCIAS DE TERCEROS INCLUIDAS EN LA WEB
Generado el ${new Date().toISOString().slice(0, 10)} a partir del mapa de código de la compilación web.

FORJA incluye, sin modificar, componentes de código abierto de terceros. Cada uno se rige por su
propia licencia, que se reproduce íntegra a continuación. La licencia de FORJA no se aplica a
estos componentes ni limita los derechos que sus licencias conceden.

Otros materiales de terceros:
- Ilustraciones de FORJA Academy (public/academia): Everkinetic, CC BY-SA 4.0. Ver
  public/academia/CREDITOS.md.
- Tesseract.js (Apache-2.0) y sus datos de idioma: se descargan desde su CDN en el navegador al
  escanear un ticket; no forman parte de los archivos que distribuye FORJA.

Paquetes incluidos (${resumen.length}):
${resumen.map((r) => `- ${r}`).join('\n')}

`;
writeFileSync(salida, cabecera + bloques.join('\n'));
console.log(`✓ ${resumen.length} paquetes → ${salida}`);
