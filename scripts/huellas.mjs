// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Huella digital del proyecto como prueba de autoría y de su estado en una fecha: calcula el
// SHA-256 de cada archivo guardado en Git y una huella global. Guarda el resultado en
// docs/propiedad/huellas/. Para que tenga valor de fecha cierta, ese archivo debe sellarse
// después (sello de tiempo cualificado, notario o registro). Uso: npm run huellas
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const archivos = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((f) => f && !f.startsWith('docs/propiedad/huellas/'));
const global = createHash('sha256');
const lineas = archivos.map((f) => {
  const h = createHash('sha256').update(readFileSync(f)).digest('hex');
  global.update(`${h}  ${f}\n`);
  return `${h}  ${f}`;
});
const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const rama = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
const fecha = new Date().toISOString();
const texto = [
  'FORJA · huella digital del código fuente',
  `Fecha (UTC): ${fecha}`,
  `Rama: ${rama} · commit: ${commit}`,
  `Archivos: ${archivos.length}`,
  `HUELLA GLOBAL SHA-256: ${global.digest('hex')}`,
  '',
  ...lineas,
  '',
].join('\n');
mkdirSync('docs/propiedad/huellas', { recursive: true });
const destino = `docs/propiedad/huellas/${fecha.slice(0, 10)}.txt`;
writeFileSync(destino, texto);
console.log(`✓ ${destino}: ${archivos.length} archivos`);
