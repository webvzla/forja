// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Comprueba la biblioteca de FORJA Academy: cada ejercicio de las rutinas tiene ficha, las
// alternativas apuntan a fichas existentes y cada ilustración tiene sus dos imágenes y créditos.
import { existsSync, readFileSync } from 'node:fs';

const reglas = readFileSync('src/reglas.ts', 'utf8');
const bib = readFileSync('src/biblioteca.ts', 'utf8');
const rutinas = [...new Set([...reglas.matchAll(/n: '([^']+)'/g)].map((m) => m[1]))];
const fichas = new Set([...bib.matchAll(/^ {2}(?:'([^']+)'|([A-Za-zÁÉÍÓÚáéíóúñÑ]+)): \{$/gm)].map((m) => m[1] ?? m[2]).filter((n) => n !== 'everkinetic' && n !== 'forja'));
const errores = [];
for (const n of rutinas) if (!fichas.has(n)) errores.push(`sin ficha: ${n}`);
for (const linea of bib.matchAll(/alternativas: \[(.*)\],$/gm)) {
  for (const m of linea[1].matchAll(/\['([^']+)', '/g)) if (!fichas.has(m[1])) errores.push(`alternativa sin ficha: ${m[1]}`);
}
const visuales = [...new Set([...bib.matchAll(/ek\('([a-z0-9-]+)'/g)].map((m) => m[1]))];
for (const v of visuales) for (const i of [1, 2]) if (!existsSync(`public/academia/${v}-${i}.webp`)) errores.push(`falta imagen ${v}-${i}.webp`);
const creditos = existsSync('public/academia/CREDITOS.md') ? readFileSync('public/academia/CREDITOS.md', 'utf8') : '';
for (const v of visuales) if (!creditos.includes(`${v}-1.webp`)) errores.push(`sin crédito: ${v}`);
// Ilustraciones propias: fj('<id>') con 9 fotogramas, o los que indique `fotogramas`.
const propias = [...bib.matchAll(/fj\('([a-z0-9-]+)'(?:, \{([^}]*)\})?\)/g)].map((m) => [m[1], Number((m[2] ?? '').match(/fotogramas: (\d+)/)?.[1] ?? 9)]);
for (const [v, n] of propias) {
  for (let i = 1; i <= n; i++) if (!existsSync(`public/academia/${v}-${i}.webp`)) errores.push(`falta imagen ${v}-${i}.webp`);
  if (!creditos.includes(`${v}-1.webp`)) errores.push(`sin crédito: ${v}`);
}
const conVisual = [...bib.matchAll(/^ {2}(?:'[^']+'|\w+): \{[\s\S]*?\n {2}\},$/gm)].filter((m) => /visual: (ek|fj)\(/.test(m[0])).length;
if (errores.length) {
  console.error('✗ FORJA Academy:\n  ' + errores.join('\n  '));
  process.exit(1);
}
console.log(`✓ Academy: ${fichas.size} fichas, ${rutinas.length} ejercicios de rutinas cubiertos, ${conVisual} con ilustración (${visuales.length} de Everkinetic y ${propias.length} propias animadas)`);
