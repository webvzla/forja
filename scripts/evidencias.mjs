// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Prepara un paquete de evidencias del estado del proyecto, listo para sellar en el tiempo:
//   evidencias/AAAA-MM-DD/forja.bundle        copia íntegra del repositorio con todo su historial (git bundle)
//   evidencias/AAAA-MM-DD/huellas.txt         SHA-256 de cada archivo y huella global (como npm run huellas)
//   evidencias/AAAA-MM-DD/MANIFIESTO.txt      resumen con las huellas del bundle y del código: ES EL ARCHIVO QUE SE SELLA
//   evidencias/AAAA-MM-DD/manifiesto.tsq      petición de sello de tiempo RFC 3161 (si hay openssl)
// Esto solo prueba la INTEGRIDAD (que nada ha cambiado desde que se calculó). Para probar la FECHA
// hay que sellar MANIFIESTO.txt con un tercero (ver docs/propiedad/EVIDENCIA-AUTORIA.md).
// Uso: npm run evidencias [-- etiqueta]   (p. ej. «final» → evidencias/AAAA-MM-DD-final)
import { createHash } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const fecha = new Date().toISOString();
const etiqueta = process.argv[2] ? `-${process.argv[2].replace(/[^\w-]/g, '')}` : '';
const dir = join('evidencias', fecha.slice(0, 10) + etiqueta);
mkdirSync(dir, { recursive: true });

if (execSync('git status --porcelain', { encoding: 'utf8' }).trim()) {
  console.warn('⚠ Hay cambios sin guardar en Git: el paquete refleja el último commit, no esos cambios.');
}

const bundle = join(dir, 'forja.bundle');
execFileSync('git', ['bundle', 'create', bundle, '--all'], { stdio: 'ignore' });
execFileSync('git', ['bundle', 'verify', bundle], { stdio: 'ignore' });

const archivos = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((f) => f && !f.startsWith('docs/propiedad/huellas/'));
const global = createHash('sha256');
const lineas = archivos.map((f) => {
  const h = sha(readFileSync(f));
  global.update(`${h}  ${f}\n`);
  return `${h}  ${f}`;
});
const huellaGlobal = global.digest('hex');
writeFileSync(join(dir, 'huellas.txt'), lineas.join('\n') + '\n');

const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const rama = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
const ramas = execSync('git for-each-ref --format="%(refname:short) %(objectname)" refs/heads', { encoding: 'utf8' }).trim();
const manifiesto = [
  'FORJA · MANIFIESTO DE EVIDENCIAS',
  `Generado (reloj local, UTC): ${fecha}  ← fecha declarada, NO probada; la prueba es el sello externo`,
  `Titular declarado: [NOMBRE COMPLETO DEL TITULAR] (cuenta GitHub webvzla)`,
  `Rama actual: ${rama} · commit: ${commit}`,
  'Ramas y commits:',
  ...ramas.split('\n').map((l) => `  ${l}`),
  `Archivos del código: ${archivos.length}`,
  `HUELLA GLOBAL DEL CÓDIGO (SHA-256 de huellas.txt): ${huellaGlobal}`,
  'Documentos clave (SHA-256):',
  ...['LICENSE', 'NOTICE.md', 'docs/propiedad/APORTACIONES-HUMANAS.md', 'docs/propiedad/TRANSICION-LICENCIA.md',
    'docs/propiedad/LICENSE-propuesta-v2.txt', 'docs/propiedad/AUDITORIA-IMAGENES.md', 'docs/propiedad/EVIDENCIA-AUTORIA.md',
    'docs/propiedad/CHECKLIST-ABOGADO.md', 'docs/propiedad/aprobacion/01-adoptar-licencia-propietaria.patch',
    'docs/propiedad/aprobacion/02-publicar-licencias-terceros.patch', 'docs/propiedad/aprobacion/03-retirar-agents-md.patch']
    .filter((f) => archivos.includes(f)).map((f) => `  ${sha(readFileSync(f))}  ${f}`),
  `SHA-256 de forja.bundle (historial completo): ${sha(readFileSync(bundle))}`,
  '',
  'Para comprobar: git clone forja.bundle forja && cd forja && git log --all',
  '',
].join('\n');
const rutaManifiesto = join(dir, 'MANIFIESTO.txt');
writeFileSync(rutaManifiesto, manifiesto);

writeFileSync(join(dir, 'INSTRUCCIONES-SELLADO.txt'), `CÓMO SELLAR ESTE PAQUETE (gratis, unos 2 minutos)

Qué se sella: MANIFIESTO.txt. Contiene las huellas SHA-256 del historial completo (forja.bundle), de
cada archivo (huellas.txt) y de los documentos clave. Si mañana cambiara un solo byte, la huella no
coincidiría. El sello prueba que este manifiesto existía en la fecha del sello.

1) OpenTimestamps (ancla en Bitcoin)
   a. Abre https://opentimestamps.org en el navegador.
   b. Arrastra MANIFIESTO.txt a la zona «Stamp & Verify». El archivo NO se sube: el navegador calcula
      su huella y solo envía esa huella.
   c. Se descargará MANIFIESTO.txt.ots. Guárdalo en esta misma carpeta.
   d. Pasadas unas horas (cuando Bitcoin confirme el bloque), vuelve a arrastrar el .ots en la misma
      página: lo completa y descarga la prueba definitiva. Sustituye el .ots anterior por ese.
   Verificar más adelante: arrastra MANIFIESTO.txt.ots a opentimestamps.org con MANIFIESTO.txt al lado.
   Debe decir «Bitcoin attests data existed as of …».

2) (Opcional) Segundo sello independiente, RFC 3161, con FreeTSA, si tienes curl en el PC:
   curl -H "Content-Type: application/timestamp-query" --data-binary @manifiesto.tsq https://freetsa.org/tsr > manifiesto.tsr
   Descarga también los certificados de FreeTSA (https://freetsa.org/files/tsa.crt y cacert.pem)
   para poder verificarlo después.

3) Conservación
   - Guarda la carpeta completa (forja.bundle, huellas.txt, MANIFIESTO.txt, .ots, .tsr) en dos sitios:
     el PC y una copia externa (USB o la nube).
   - No modifiques ningún archivo: cualquier cambio invalida las huellas.
   - Comprobar el contenido: git clone forja.bundle forja && cd forja && git log --all

Qué NO prueba: el sello prueba la fecha y la integridad, no quién es el autor. Para la autoría, ver
docs/propiedad/APORTACIONES-HUMANAS.md y EVIDENCIA-AUTORIA.md.
`);

let tsq = false;
try {
  execFileSync('openssl', ['ts', '-query', '-data', rutaManifiesto, '-sha256', '-cert', '-out', join(dir, 'manifiesto.tsq')], { stdio: 'ignore' });
  tsq = true;
} catch {
  // sin openssl: se puede sellar igual subiendo MANIFIESTO.txt a opentimestamps.org
}

console.log(`✓ Paquete en ${dir}`);
console.log(`  Archivo a sellar: MANIFIESTO.txt (SHA-256 ${sha(readFileSync(rutaManifiesto))})`);
if (tsq) console.log('  Petición RFC 3161 preparada: manifiesto.tsq');
console.log('  Siguiente paso: sellarlo con un tercero (docs/propiedad/EVIDENCIA-AUTORIA.md, §3).');
