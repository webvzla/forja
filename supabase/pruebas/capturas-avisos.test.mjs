// Pruebas de la migración 9 (capturas privadas y aviso de opinión nueva) en un Postgres real en memoria (PGlite) con las migraciones
// reales. Storage, pg_net y Vault son simulaciones mínimas (ver baseDeDatos en sql.test.mjs); las políticas RLS, las funciones y el
// disparador que se prueban son los de la migración.
// Uso: node supabase/pruebas/capturas-avisos.test.mjs
import { baseDeDatos, como } from './sql.test.mjs';

let ok = 0, fallos = 0;
async function prueba(nombre, f) {
  try { await f(); ok++; console.log('  ✓', nombre); } catch (e) { fallos++; console.log('  ✗', nombre, '\n     ', e?.message ?? e); }
}
const assert = (c, m = 'afirmación falsa') => { if (!c) throw new Error(m); };
const igual = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} esperado ${JSON.stringify(b)} y fue ${JSON.stringify(a)}`); };
async function falla(p, patron) {
  try { await p; } catch (e) { if (patron && !patron.test(e.message)) throw new Error('otro error: ' + e.message); return; }
  throw new Error('debía fallar y no falló');
}

const db = await baseDeDatos();
const crear = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const [ana, ben, caro, dani] = await Promise.all(['ana', 'ben', 'caro', 'dani'].map((n) => crear(`${n}@x.test`)));
const rpc = (uid, sql, p) => como(db, uid, sql, p);
const uuid = () => crypto.randomUUID();
const subir = (uid, nombre, bucket = 'opiniones-adjuntos') => rpc(uid, `insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)`, [bucket, nombre, uid]);
const objetos = async () => (await db.query(`select bucket_id, name from storage.objects order by name`)).rows;
const enviar = (uid, adjunto = null, texto = 'Se cierra al guardar el entreno') => rpc(uid, `select public.enviar_opinion('error', $1, null, '1.0.0-beta.1', '{"modo":"con-cuenta"}'::jsonb, null, $2) as id`, [texto, adjunto]);
const llamadas = async () => (await db.query(`select url, headers, body from net._llamadas order by id`)).rows;

console.log('Bucket de capturas');
await prueba('existe, es privado, con tope de 2 MB y solo JPG/PNG/WebP', async () => {
  const b = (await db.query(`select * from storage.buckets where id = 'opiniones-adjuntos'`)).rows[0];
  igual([b.public, Number(b.file_size_limit), b.allowed_mime_types], [false, 2097152, ['image/jpeg', 'image/png', 'image/webp']]);
});

console.log('Subir capturas (solo INSERT, solo a la carpeta propia)');
await prueba('una persona con sesión sube una captura a su carpeta con nombre uuid.ext (jpg, png y webp)', async () => {
  for (const ext of ['jpg', 'png', 'webp']) await subir(ana, `${ana}/${uuid()}.${ext}`);
  igual((await objetos()).length, 3);
});
await prueba('no puede subir a la carpeta de otra persona', async () => {
  await falla(subir(ana, `${ben}/${uuid()}.jpg`), /row-level security/);
});
await prueba('no puede subir con un nombre que no sea uuid + jpg/png/webp (gif, pdf, svg, sin extensión, subcarpeta, mayúsculas, ..)', async () => {
  for (const n of [`${ana}/${uuid()}.gif`, `${ana}/${uuid()}.pdf`, `${ana}/${uuid()}.svg`, `${ana}/${uuid()}`, `${ana}/sub/${uuid()}.jpg`,
    `${ana}/${uuid().toUpperCase()}.JPG`, `${ana}/../${ben}/${uuid()}.jpg`, `${ana}/captura.png`, `${ana}/${uuid()}.jpg.exe`, `${uuid()}.jpg`]) {
    await falla(subir(ana, n), /row-level security/);
  }
});
await prueba('no puede subir a otro bucket ni sin sesión', async () => {
  await db.query(`insert into storage.buckets (id, name, public) values ('otro', 'otro', false)`);
  await falla(subir(ana, `${ana}/${uuid()}.jpg`, 'otro'), /row-level security/);
  await falla(rpc(null, `insert into storage.objects (bucket_id, name) values ('opiniones-adjuntos', $1)`, [`${ana}/${uuid()}.jpg`]), /permission denied|row-level security/);
});
await prueba('límite de 10 capturas por persona', async () => {
  for (let i = 0; i < 10; i++) await subir(ben, `${ben}/${uuid()}.jpg`);
  await falla(subir(ben, `${ben}/${uuid()}.jpg`), /row-level security/);
  igual((await rpc(ben, `select public.mis_adjuntos_usados() as n`))[0].n, 10);
  igual((await rpc(ana, `select public.mis_adjuntos_usados() as n`))[0].n, 3, 'cada persona cuenta lo suyo');
  await subir(caro, `${caro}/${uuid()}.png`); // lo de otra persona no gasta mi cupo
});

console.log('Nadie lee, cambia ni borra por la API');
await prueba('authenticated no ve ninguna captura (ni las suyas) ni puede listar', async () => {
  igual((await rpc(ana, `select count(*)::int as n from storage.objects`))[0].n, 0);
  igual((await rpc(ana, `select name from storage.objects where bucket_id = 'opiniones-adjuntos'`)).length, 0);
  igual((await rpc(null, `select count(*)::int as n from storage.objects`))[0].n, 0, 'anon');
});
await prueba('no se pueden sustituir (upsert) ni borrar ni mover: no afecta a ninguna fila', async () => {
  const antes = (await objetos()).length;
  igual((await rpc(ana, `update storage.objects set name = name || 'x' returning id`)).length, 0);
  igual((await rpc(ana, `delete from storage.objects returning id`)).length, 0);
  igual((await rpc(null, `delete from storage.objects returning id`).catch(() => [])).length, 0);
  igual((await objetos()).length, antes);
});
await prueba('no hay ninguna política de lectura, cambio o borrado en storage.objects', async () => {
  const p = (await db.query(`select cmd, roles::text from pg_policies where schemaname = 'storage' and tablename = 'objects'`)).rows;
  igual(p, [{ cmd: 'INSERT', roles: '{authenticated}' }]);
});
await prueba('mis_adjuntos_usados no la puede ejecutar anon', async () => {
  await falla(rpc(null, `select public.mis_adjuntos_usados()`), /permission denied/);
});

console.log('Opinión con captura');
let adj;
await prueba('se enlaza una captura propia y existente; queda en la fila', async () => {
  adj = `${ana}/${uuid()}.jpg`;
  await subir(ana, adj).catch(() => {});
  const id = (await enviar(ana, adj))[0].id;
  igual((await db.query(`select adjunto from public.beta_opiniones where id = $1`, [id])).rows[0].adjunto, adj);
});
await prueba('no se puede enlazar la captura de otra persona, una inexistente ni una ruta con otro formato', async () => {
  const ajena = `${caro}/${uuid()}.png`;
  await db.query(`insert into storage.objects (bucket_id, name, owner_id) values ('opiniones-adjuntos', $1, $2)`, [ajena, caro]);
  await falla(enviar(dani, ajena), /captura no válida/);
  await falla(enviar(ana, `${ana}/${uuid()}.jpg`), /captura no encontrada/);
  await falla(enviar(ana, `${ana}/../${caro}/x.jpg`), /captura no válida/);
  await falla(enviar(ana, 'cualquier-cosa'), /captura no válida/);
});
await prueba('una misma captura no se puede usar en dos opiniones', async () => {
  await falla(enviar(ana, adj), /duplicate key|unique/);
});
await prueba('la opinión sin captura sigue funcionando, también con la llamada antigua de 6 parámetros', async () => {
  await enviar(ana, null);
  const r = await rpc(ana, `select public.enviar_opinion('sugerencia', 'Más gráficas por favor', null, '1.0.0-beta.1', '{}'::jsonb, null) as id`);
  igual(typeof r[0].id, 'string');
});
await prueba('la función de 6 parámetros ya no existe (no hay ambigüedad) y solo la ejecuta authenticated', async () => {
  igual((await db.query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'enviar_opinion'`)).rows[0].n, 1);
  igual((await db.query(`select has_function_privilege('anon', 'public.enviar_opinion(text,text,smallint,text,jsonb,jsonb,text)', 'execute') a, has_function_privilege('authenticated', 'public.enviar_opinion(text,text,smallint,text,jsonb,jsonb,text)', 'execute') b`)).rows[0], { a: false, b: true });
});

console.log('Aviso de opinión nueva');
await prueba('sin secretos configurados (Vault vacío) no se llama a nadie y la opinión se guarda igual', async () => {
  const antes = (await llamadas()).length;
  await enviar(ben);
  igual((await llamadas()).length, antes);
});
await db.query(`insert into vault._secretos (name, decrypted_secret) values ('aviso_opiniones_url', 'https://proyecto.supabase.co/functions/v1/avisar-opinion'), ('aviso_opiniones_secreto', 'secreto-de-prueba-largo-0123456789abcdef')`);
await prueba('con secretos, cada opinión nueva hace UNA llamada con el secreto en la cabecera', async () => {
  const antes = (await llamadas()).length;
  await enviar(caro);
  const l = (await llamadas()).slice(antes);
  igual(l.length, 1);
  igual(l[0].url, 'https://proyecto.supabase.co/functions/v1/avisar-opinion');
  igual(l[0].headers['x-forja-aviso'], 'secreto-de-prueba-largo-0123456789abcdef');
});
await prueba('la notificación NO lleva el texto, ni el autor, ni el email, ni los datos técnicos ni el resumen', async () => {
  const antes = (await llamadas()).length;
  const texto = 'Mi nombre es Pepe Pérez, vivo en la calle Mayor 5 y mi correo es pepe@example.com';
  await rpc(caro, `select public.enviar_opinion('entreno', $1, null, '1.0.0-beta.1', '{"sistema":"Mozilla/5.0"}'::jsonb, '{"entrenos":4}'::jsonb, null)`, [texto]);
  const l = (await llamadas()).slice(antes);
  igual(l.length, 1);
  igual(Object.keys(l[0].body).sort(), ['con_adjunto', 'creado', 'id', 'tabla', 'tipo', 'version']);
  const serializado = JSON.stringify(l[0].body);
  for (const prohibido of ['Pepe', 'calle', 'example', 'pepe@', caro, ana, 'Mozilla', 'entrenos', '@x.test']) assert(!serializado.includes(prohibido), `la notificación contiene «${prohibido}»`);
  igual(l[0].body.tipo, 'entreno');
  igual(l[0].body.version, '1.0.0-beta.1');
  igual(l[0].body.con_adjunto, false);
});
await prueba('indica si la opinión trae captura, sin la ruta ni el enlace', async () => {
  const nueva = `${dani}/${uuid()}.webp`;
  await subir(dani, nueva);
  const antes = (await llamadas()).length;
  await enviar(dani, nueva);
  const l = (await llamadas()).slice(antes);
  igual(l[0].body.con_adjunto, true);
  assert(!JSON.stringify(l[0].body).includes(nueva) && !JSON.stringify(l[0].body).includes('opiniones-adjuntos'));
});
await prueba('el identificador de la tabla es un número (para el enlace al panel) y el id es el de la opinión guardada', async () => {
  const l = (await llamadas()).at(-1);
  igual(typeof l.body.tabla, 'number');
  const oid = (await db.query(`select 'public.beta_opiniones'::regclass::oid::int as o`)).rows[0].o;
  igual(l.body.tabla, oid);
  const fila = (await db.query(`select id from public.beta_opiniones where id = $1`, [l.body.id])).rows;
  igual(fila.length, 1);
});
await prueba('si la llamada HTTP falla, la opinión SE GUARDA igualmente', async () => {
  await db.query(`create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as $$ begin raise exception 'sin red'; end $$`);
  const antes = (await db.query(`select count(*)::int as n from public.beta_opiniones`)).rows[0].n;
  await enviar(ben);
  igual((await db.query(`select count(*)::int as n from public.beta_opiniones`)).rows[0].n, antes + 1);
});
await prueba('si falta la extensión (no existe net.http_post) la opinión SE GUARDA igualmente', async () => {
  await db.query(`drop function net.http_post(text, jsonb, jsonb, jsonb, int)`);
  const antes = (await db.query(`select count(*)::int as n from public.beta_opiniones`)).rows[0].n;
  await enviar(caro);
  igual((await db.query(`select count(*)::int as n from public.beta_opiniones`)).rows[0].n, antes + 1);
});
await prueba('la función del aviso no la puede ejecutar nadie desde la API ni se puede llamar suelta', async () => {
  igual((await db.query(`select has_function_privilege('anon', 'privado.avisar_opinion()', 'execute') a, has_function_privilege('authenticated', 'privado.avisar_opinion()', 'execute') b`)).rows[0], { a: false, b: false });
  await falla(rpc(ana, `select privado.avisar_opinion()`), /permission denied/);
});
await prueba('el límite de 10 opiniones al día sigue funcionando (la 11ª no se guarda ni avisa)', async () => {
  const d = await baseDeDatos();
  const u = (await d.query(`insert into auth.users (email) values ('limite@x.test') returning id`)).rows[0].id;
  await d.query(`insert into vault._secretos values ('aviso_opiniones_url', 'https://x.test/f'), ('aviso_opiniones_secreto', 's')`);
  for (let i = 0; i < 10; i++) await como(d, u, `select public.enviar_opinion('error', 'texto numero ${i}', null, '1.0.0', '{}'::jsonb, null)`);
  await falla(como(d, u, `select public.enviar_opinion('error', 'texto de más', null, '1.0.0', '{}'::jsonb, null)`), /demasiadas|espera/);
  igual((await d.query(`select count(*)::int as n from net._llamadas`)).rows[0].n, 10);
});

console.log(`\n${ok} correctas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
