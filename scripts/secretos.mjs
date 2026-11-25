// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Busca claves o secretos en los archivos que Git va a guardar. Se ejecuta con `npm run comprobar`.
// No sustituye a una revisión, pero evita el error más común: subir una clave por descuido.
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const PATRONES = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'clave secreta de Supabase'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}/, 'clave service_role de Supabase'],
  [/AIza[0-9A-Za-z_-]{35}/, 'clave de Google / Gemini'],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, 'clave de Anthropic'],
  [/sk-[A-Za-z0-9]{32,}/, 'clave tipo OpenAI'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'token de GitHub'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clave privada'],
  [/postgres(ql)?:\/\/[^\s:]+:[^\s@]{6,}@/, 'cadena de conexión con contraseña'],
];
const PROHIBIDOS = [/^\.env(\..*)?$/, /\.pem$/, /\.p12$/, /\.key$/, /service-account.*\.json$/i];

const archivos = execSync('git ls-files -co --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean);
const problemas = [];
for (const f of archivos) {
  const nombre = f.split('/').pop();
  if (PROHIBIDOS.some((p) => p.test(nombre)) && nombre !== '.env.example') problemas.push(`${f}: este tipo de archivo no debe guardarse en Git`);
  let texto;
  try {
    if (statSync(f).size > 2_000_000) continue;
    texto = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const [p, que] of PATRONES) if (p.test(texto)) problemas.push(`${f}: parece contener una ${que}`);
}
if (problemas.length) {
  console.error('✗ Posibles secretos:\n  ' + problemas.join('\n  '));
  process.exit(1);
}
console.log(`✓ Sin secretos en ${archivos.length} archivos`);
