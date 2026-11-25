// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Comprueba que no haya dos archivos cuyo nombre solo se diferencie en mayúsculas o extensión
// (en Windows chocan: "Arena.tsx" y "arena.ts" se confunden al importar "./Arena").
import { readdirSync } from 'node:fs';
const vistos = new Map();
let mal = 0;
for (const f of readdirSync('src')) {
  const base = f.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
  if (vistos.has(base)) {
    console.error(`✗ Choque de nombres en Windows: src/${vistos.get(base)} y src/${f}`);
    mal++;
  }
  vistos.set(base, f);
}
if (mal) process.exit(1);
console.log('✓ Sin choques de nombres');
