// Comprueba que supabase/verificacion-produccion.sql da OK sobre las migraciones reales (Postgres en memoria) y que SABE
// detectar problemas (si se rompe algo a propósito, marca REVISAR). Uso: node supabase/pruebas/verificacion.test.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { baseDeDatos } from './sql.test.mjs';

let ok = 0, fallos = 0;
async function prueba(nombre, f) {
  try { await f(); ok++; console.log('  ✓', nombre); } catch (e) { fallos++; console.log('  ✗', nombre, '\n     ', e?.message ?? e); }
}
const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'verificacion-produccion.sql'), 'utf8')
  .split('\n').filter((l) => !l.startsWith('--') && !l.startsWith('-- ')).join('\n');
const filas = async (db) => (await db.query(sql)).rows;

const db = await baseDeDatos();
await prueba('sobre las migraciones reales todas las comprobaciones dan OK', async () => {
  const f = await filas(db);
  const mal = f.filter((x) => x.estado !== 'OK');
  if (f.length !== 18) throw new Error(`se esperaban 18 comprobaciones y hay ${f.length}`);
  if (mal.length) throw new Error(mal.map((x) => `${x.n} ${x.comprobacion}: ${x.resultado} (esperado ${x.esperado})`).join('\n      '));
});
for (const [nombre, ruptura, n] of [
  ['una tabla sin RLS', `alter table public.beta_opiniones disable row level security`, 2],
  ['una función con search_path distinto', `alter function public.enviar_opinion(text,text,smallint,text,jsonb,jsonb,text) reset search_path`, 3],
  ['anon con permiso sobre una función', `grant execute on function public.enviar_opinion(text,text,smallint,text,jsonb,jsonb,text) to anon`, 4],
  ['authenticated con acceso al esquema privado', `grant usage on schema privado to authenticated`, 5],
  ['anon con acceso a una tabla', `grant select on public.perfiles to anon`, 7],
  ['authenticated con acceso directo a las opiniones', `grant select on public.beta_opiniones to authenticated`, 8],
  ['un bucket de capturas PÚBLICO', `update storage.buckets set public = true where id = 'opiniones-adjuntos'`, 15],
  ['un bucket de capturas sin límite de tamaño', `update storage.buckets set file_size_limit = null where id = 'opiniones-adjuntos'`, 15],
  ['un bucket de capturas que admite cualquier tipo de archivo', `update storage.buckets set allowed_mime_types = null where id = 'opiniones-adjuntos'`, 15],
  ['la política de subida borrada', `drop policy "opiniones-adjuntos: subir solo a mi carpeta" on storage.objects`, 16],
  ['una política que deja LEER las capturas', `create policy leer_todo on storage.objects for select to authenticated using (bucket_id = 'opiniones-adjuntos')`, 17],
  ['una política que deja BORRAR las capturas', `create policy borrar_todo on storage.objects for delete to authenticated using (true)`, 17],
  ['el disparador de aviso borrado', `drop trigger aviso_opinion_nueva on public.beta_opiniones`, 18],
]) {
  await prueba(`detecta ${nombre}`, async () => {
    const d = await baseDeDatos();
    await d.exec(ruptura);
    const f = await filas(d);
    if (f.find((x) => x.n === n)?.estado !== 'REVISAR') throw new Error(`la comprobación ${n} no marcó REVISAR`);
  });
}
console.log(`\n${ok} correctas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
