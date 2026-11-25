// Pruebas de la migración 8 (opiniones de la beta) en un Postgres real en memoria (PGlite) con las migraciones reales.
// Uso: node supabase/pruebas/beta.test.mjs
import { baseDeDatos, como } from './sql.test.mjs';

let ok = 0, fallos = 0;
async function prueba(nombre, f) {
  try { await f(); ok++; console.log('  ✓', nombre); } catch (e) { fallos++; console.log('  ✗', nombre, '\n     ', e?.message ?? e); }
}
const igual = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} esperado ${JSON.stringify(b)} y fue ${JSON.stringify(a)}`); };
async function falla(p, patron) {
  try { await p; } catch (e) { if (patron && !patron.test(e.message)) throw new Error('otro error: ' + e.message); return; }
  throw new Error('debía fallar y no falló');
}

const db = await baseDeDatos();
const crear = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const [ana, ben] = await Promise.all(['ana', 'ben'].map((n) => crear(`${n}@x.test`)));
const rpc = (uid, sql, p) => como(db, uid, sql, p);
const enviar = (uid, o = {}) => rpc(uid, `select public.enviar_opinion($1, $2, $3::smallint, $4, $5::jsonb, $6::jsonb) as id`, [o.tipo ?? 'error', o.texto ?? 'Se cierra al guardar el entreno', o.estrellas ?? null, o.version ?? '1.0.0-beta.1', JSON.stringify(o.tecnico ?? { modo: 'con-cuenta' }), o.datos === undefined ? null : JSON.stringify(o.datos)]);
const filas = async () => (await db.query(`select * from public.beta_opiniones order by creado`)).rows;

console.log('Enviar opiniones');
await prueba('una persona con sesión envía una opinión y queda guardada a su nombre', async () => {
  const r = await enviar(ana);
  const f = await filas();
  igual(f.length, 1);
  igual(f[0].user_id, ana);
  igual(f[0].estado, 'nueva');
  igual(f[0].gravedad, null, 'la gravedad la pone el titular');
  igual(f[0].id, r[0].id);
});
await prueba('una valoración puede ir solo con estrellas', async () => { await enviar(ana, { tipo: 'valoracion', texto: '', estrellas: 5 }); });
await prueba('el resumen de datos es opcional y se guarda si la persona lo marcó', async () => {
  await enviar(ben, { tipo: 'entreno', datos: { entrenos: 12, objetivo: 'musculo' } });
  const f = (await db.query(`select datos from public.beta_opiniones where user_id = $1`, [ben])).rows;
  igual(f[0].datos, { entrenos: 12, objetivo: 'musculo' });
});

console.log('Seguridad');
await prueba('sin sesión (anónimo) no se puede enviar', async () => {
  await falla(rpc(null, `select public.enviar_opinion('error', 'texto de prueba', null, '1.0.0', '{}'::jsonb, null)`), /permission denied|no autenticado/);
});
await prueba('nadie puede leer, insertar, cambiar ni borrar la tabla directamente (ni siquiera las suyas)', async () => {
  await falla(rpc(ana, `select * from public.beta_opiniones`), /permission denied/);
  await falla(rpc(ana, `insert into public.beta_opiniones (user_id, tipo, texto, version) values ($1, 'error', 'hola mundo', '1.0')`, [ana]), /permission denied/);
  await falla(rpc(ana, `update public.beta_opiniones set estado = 'avisada'`), /permission denied/);
  await falla(rpc(ana, `delete from public.beta_opiniones`), /permission denied/);
  await falla(rpc(null, `select * from public.beta_opiniones`), /permission denied/);
});
await prueba('ni authenticated ni anon tienen privilegios sobre la tabla', async () => {
  const r = (await db.query(`select has_table_privilege('authenticated','public.beta_opiniones','select') a, has_table_privilege('anon','public.beta_opiniones','select') b,
    has_table_privilege('authenticated','public.beta_opiniones','insert') c`)).rows[0];
  igual([r.a, r.b, r.c], [false, false, false]);
});
await prueba('la función es SECURITY DEFINER con search_path vacío y no la puede llamar anon', async () => {
  const r = (await db.query(`select p.prosecdef, coalesce('search_path=""' = any(p.proconfig), false) as fijo from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'enviar_opinion'`)).rows[0];
  igual([r.prosecdef, r.fijo], [true, true]);
  igual((await db.query(`select has_function_privilege('anon', 'public.enviar_opinion(text,text,smallint,text,jsonb,jsonb,text)', 'execute') as x`)).rows[0].x, false);
});
await prueba('no se puede enviar a nombre de otra persona: el autor es siempre quien tiene la sesión', async () => {
  await enviar(ben);
  const r = (await db.query(`select count(*)::int as n from public.beta_opiniones where user_id = $1`, [ana])).rows[0].n;
  const total = (await db.query(`select count(*)::int as n from public.beta_opiniones`)).rows[0].n;
  igual([r, total], [2, 4]);
});

console.log('Validación');
await prueba('tipo no válido', async () => { await falla(enviar(ana, { tipo: 'insulto' }), /tipo de opinión no válido/); });
await prueba('mensaje demasiado largo (más de 2000 caracteres)', async () => { await falla(enviar(ana, { texto: 'a'.repeat(2001) }), /demasiado largo/); });
await prueba('2000 caracteres justos sí', async () => { await enviar(ben, { texto: 'b'.repeat(2000) }); });
await prueba('mensaje vacío o casi vacío sin ser una valoración con estrellas', async () => {
  await falla(enviar(ana, { texto: '  ' }), /opinion_con_contenido/);
  await falla(enviar(ana, { tipo: 'sugerencia', texto: 'ok', estrellas: 4 }), /opinion_con_contenido/);
});
await prueba('estrellas fuera de rango', async () => { await falla(enviar(ana, { tipo: 'valoracion', estrellas: 6 }), /valoración no válida/); await falla(enviar(ana, { tipo: 'valoracion', estrellas: 0 }), /valoración no válida/); });
await prueba('versión no válida', async () => { await falla(enviar(ana, { version: '1.0 <script>' }), /versión no válida/); await falla(enviar(ana, { version: '' }), /versión no válida/); });
await prueba('datos técnicos o resumen demasiado grandes, o que no son un objeto', async () => {
  await falla(enviar(ana, { tecnico: { x: 'a'.repeat(3000) } }), /beta_opiniones_tecnico_check|violates check/);
  await falla(enviar(ana, { datos: { x: 'a'.repeat(3000) } }), /beta_opiniones_datos_check|violates check/);
  await falla(enviar(ana, { tecnico: [1, 2] }), /violates check/);
});
await prueba('el texto se guarda sin espacios sobrantes y tal cual (sin interpretar nada)', async () => {
  await enviar(ben, { texto: '  <b>hola</b> \'; drop table x; --  ' });
  const f = (await db.query(`select texto from public.beta_opiniones where user_id = $1 order by creado desc limit 1`, [ben])).rows[0];
  igual(f.texto, `<b>hola</b> '; drop table x; --`);
  igual((await db.query(`select to_regclass('public.beta_opiniones') is not null as x`)).rows[0].x, true);
});

console.log('Límite y borrado de cuenta');
await prueba('máximo 10 opiniones por persona y día; otra persona no se ve afectada', async () => {
  const caro = await crear('caro@x.test');
  for (let i = 0; i < 10; i++) await enviar(caro, { texto: `opinión número ${i}` });
  await falla(enviar(caro, { texto: 'la once' }), /demasiadas peticiones/);
  await enviar(ben, { texto: 'ben sigue pudiendo' });
});
await prueba('al borrar la cuenta se borran sus opiniones y las de nadie más', async () => {
  const antesBen = (await db.query(`select count(*)::int n from public.beta_opiniones where user_id = $1`, [ben])).rows[0].n;
  await rpc(ana, `select public.borrar_mi_cuenta()`);
  igual((await db.query(`select count(*)::int n from public.beta_opiniones where user_id = $1`, [ana])).rows[0].n, 0);
  igual((await db.query(`select count(*)::int n from public.beta_opiniones where user_id = $1`, [ben])).rows[0].n, antesBen);
});
await prueba('la migración es aditiva: las tablas y funciones anteriores siguen intactas', async () => {
  const tablas = (await db.query(`select count(*)::int n from information_schema.tables where table_schema = 'public'`)).rows[0].n;
  igual(tablas, 12, 'las 11 de antes + la nueva');
});

console.log(`\n${ok} correctas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
