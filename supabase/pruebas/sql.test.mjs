// Pruebas de las migraciones en un Postgres real (PGlite, en memoria) con la autenticación
// de Supabase emulada: esquema auth, auth.uid() leído del JWT y roles anon/authenticated.
// Uso: node supabase/pruebas/sql.test.mjs   (necesita @electric-sql/pglite instalado aparte)
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const aqui = dirname(fileURLToPath(import.meta.url));
const carpeta = join(aqui, '..', 'migrations');

export async function baseDeDatos() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    -- Igual que Supabase: privilegios por defecto amplios (las migraciones deben cerrarlos)
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  // Piezas de Supabase que la migración 9 usa y que PGlite no trae: Storage (buckets y objetos con RLS), pg_net (llamadas HTTP,
  // aquí solo se anotan) y Vault (secretos). Son SIMULACIONES mínimas con la misma forma que las reales; las políticas y las funciones
  // que se prueban son las de verdad (las migraciones).
  await db.exec(`
    create schema storage;
    create table storage.buckets (id text primary key, name text unique, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner_id text,
      metadata jsonb, created_at timestamptz default now(), unique (bucket_id, name));
    alter table storage.buckets enable row level security;
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    grant select on storage.buckets to anon, authenticated;
    create schema net;
    create table net._llamadas (id bigserial primary key, url text, headers jsonb, body jsonb, momento timestamptz default now());
    create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
      headers jsonb default '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds int default 5000) returns bigint language plpgsql as $$
      begin insert into net._llamadas (url, headers, body) values (url, headers, body); return 1; end $$;
    create schema vault;
    create table vault._secretos (name text primary key, decrypted_secret text);
    create view vault.decrypted_secrets as select name, decrypted_secret from vault._secretos;
  `);
  for (const f of readdirSync(carpeta).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(carpeta, f), 'utf8'));
  }
  return db;
}

// Ejecuta como un usuario con sesión (o anónimo si uid es null), dentro de una transacción.
export async function como(db, uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : '']);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return (await tx.query(sql, params)).rows;
  });
}

let ok = 0;
let fallos = 0;
async function prueba(nombre, f) {
  try {
    await f();
    ok++;
    console.log('  ✓', nombre);
  } catch (e) {
    fallos++;
    console.log('  ✗', nombre, '\n     ', e?.message ?? e);
  }
}
const orden = (v) => (Array.isArray(v) ? v.map(orden) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, orden(v[k])])) : v);
function igual(a, b, msg = '') {
  if (JSON.stringify(orden(a)) !== JSON.stringify(orden(b))) throw new Error(`${msg} esperado ${JSON.stringify(b)} y fue ${JSON.stringify(a)}`);
}
async function falla(p, patron) {
  try {
    await p;
  } catch (e) {
    if (patron && !patron.test(e.message)) throw new Error('falló con otro error: ' + e.message);
    return;
  }
  throw new Error('debía fallar y no falló');
}

async function principal() {
  const db = await baseDeDatos();
  const crear = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
  const ana = await crear('ana@example.com');
  const ben = await crear('ben@example.com');
  const caro = await crear('caro@example.com');
  const dani = await crear('dani@example.com');
  const hoy = (await db.query(`select current_date::text as d`)).rows[0].d;
  const rpc = (uid, sql, p) => como(db, uid, sql, p);

  console.log('Perfiles y privacidad');
  await prueba('al registrarse se crea un perfil con apodo neutro y código', async () => {
    const [p] = await rpc(ana, `select public.mi_perfil() as p`);
    if (!/^Atleta-/.test(p.p.apodo)) throw new Error('apodo ' + p.p.apodo);
    if (!/^FORJA-[A-Z0-9]{6}$/.test(p.p.codigo)) throw new Error('código ' + p.p.codigo);
    if (JSON.stringify(p.p).includes('example.com')) throw new Error('el perfil expone el email');
  });
  await prueba('un usuario solo ve su propia fila de perfiles', async () => {
    const filas = await rpc(ana, `select id from public.perfiles`);
    igual(filas.map((f) => f.id), [ana]);
  });
  await prueba('anónimo no ve perfiles ni puede llamar funciones', async () => {
    await falla(rpc(null, `select * from public.perfiles`), /permission denied/);
    await falla(rpc(null, `select public.mi_perfil()`), /permission denied/);
    await falla(rpc(null, `select public.ranking()`), /permission denied/);
    await falla(rpc(null, `select public.borrar_mi_cuenta()`), /permission denied/);
  });
  await prueba('no se puede escribir directamente en perfiles (ni el propio)', async () => {
    await falla(rpc(ana, `update public.perfiles set medallas = 400 where id = $1`, [ana]), /permission denied/);
    await falla(rpc(ana, `insert into public.perfiles (id, apodo, codigo) values (gen_random_uuid(), 'xx', 'FORJA-AAAA')`), /permission denied/);
  });
  await prueba('actualizar_perfil valida y guarda', async () => {
    const [r] = await rpc(ana, `select public.actualizar_perfil(p_apodo => '  Ana   G ', p_compartir => '{"entrenos":true,"records":true,"hack":1}', p_dias_objetivo => 3) as p`);
    igual(r.p.apodo, 'Ana G');
    igual(r.p.compartir, { entrenos: true, racha: false, medallas: false, records: true, retos: false });
    await falla(rpc(ana, `select public.actualizar_perfil(p_apodo => '<script>')`), /apodo/);
    await falla(rpc(ana, `select public.actualizar_perfil(p_visible => 'todos')`), /visibilidad/);
    await falla(rpc(ana, `select public.actualizar_perfil(p_dias_objetivo => 9)`), /días/);
    await rpc(ben, `select public.actualizar_perfil(p_apodo => 'Ben', p_dias_objetivo => 3)`);
    await rpc(caro, `select public.actualizar_perfil(p_apodo => 'Carolina', p_visible => 'nadie')`);
    await rpc(dani, `select public.actualizar_perfil(p_apodo => 'Dani')`);
  });

  console.log('Datos sincronizados');
  await prueba('cada uno lee y escribe solo su JSON', async () => {
    await rpc(ana, `insert into public.datos_usuario (user_id, datos) values ($1, '{"x":1}')`, [ana]);
    await falla(rpc(ana, `insert into public.datos_usuario (user_id, datos) values ($1, '{"x":2}')`, [ben]), /row-level security/);
    igual(await rpc(ben, `select * from public.datos_usuario`), []);
    const n = await rpc(ben, `update public.datos_usuario set datos = '{}' where user_id = $1 returning 1`, [ana]);
    igual(n.length, 0, 'ben modificó datos de ana');
    await falla(rpc(ana, `delete from public.datos_usuario where user_id = $1`, [ana]), /permission denied/);
  });
  await prueba('tablas de ARENA cerradas a lectura/escritura directa', async () => {
    for (const t of ['amistades', 'bloqueos', 'actividad', 'marcas', 'dias_proteina', 'objetivo_semanal', 'retos', 'participantes_reto', 'ai_usage']) {
      await falla(rpc(ana, `select * from public.${t}`), /permission denied/);
      await falla(rpc(null, `select * from public.${t}`), /permission denied/);
    }
    await falla(rpc(ana, `insert into public.actividad (user_id, id, dia, minutos, series) values ($1, 'x', current_date, 60, 20)`, [ana]), /permission denied/);
  });

  console.log('Amigos');
  await prueba('búsqueda: mínimo 3 letras, sin perfiles invisibles, nunca emails', async () => {
    igual(await rpc(ana, `select * from public.buscar_perfiles('Be')`), []);
    const r = await rpc(ana, `select apodo, relacion from public.buscar_perfiles('ben')`);
    igual(r, [{ apodo: 'Ben', relacion: 'ninguna' }]);
    igual(await rpc(ana, `select * from public.buscar_perfiles('Carol')`), [], 'Carolina es invisible');
    igual(await rpc(ana, `select * from public.buscar_perfiles('example.com')`), [], 'busca por email');
    igual(await rpc(ana, `select * from public.buscar_perfiles('%%%')`), [], 'comodines');
  });
  await prueba('un perfil invisible sí se encuentra con su código exacto', async () => {
    const [{ codigo }] = (await db.query(`select codigo from public.perfiles where id = $1`, [caro])).rows;
    const r = await rpc(ana, `select apodo from public.buscar_perfiles($1)`, [codigo.toLowerCase()]);
    igual(r, [{ apodo: 'Carolina' }]);
  });
  await prueba('solicitud, aceptación y solicitud cruzada', async () => {
    igual((await rpc(ana, `select public.solicitar_amistad(p_id => $1) as r`, [ben]))[0].r, 'enviada');
    igual((await rpc(ana, `select public.solicitar_amistad(p_id => $1) as r`, [ben]))[0].r, 'enviada', 'duplicada');
    await falla(rpc(ana, `select public.solicitar_amistad(p_id => $1)`, [ana]), /no encontrado/);
    await falla(rpc(ana, `select public.solicitar_amistad(p_id => $1)`, [caro]), /no encontrado/); // invisible
    const [{ m }] = await rpc(ben, `select public.mis_amigos() as m`);
    igual(m.recibidas.map((x) => x.id), [ana]);
    await falla(rpc(ana, `select public.responder_amistad($1, true)`, [ben]), /no encontrada/); // no puedo aceptar mi propia solicitud
    igual((await rpc(ben, `select public.responder_amistad($1, true) as r`, [ana]))[0].r, 'amigo');
    const [{ codigo }] = (await db.query(`select codigo from public.perfiles where id = $1`, [ana])).rows;
    igual((await rpc(caro, `select public.solicitar_amistad(p_codigo => $1) as r`, [codigo]))[0].r, 'enviada');
  });
  await prueba('aceptar por solicitud cruzada (Caro pidió por código, Ana acepta)', async () => {
    igual((await rpc(ana, `select public.responder_amistad($1, true) as r`, [caro]))[0].r, 'amigo');
    const [{ m }] = await rpc(ana, `select public.mis_amigos() as m`);
    igual(m.amigos.map((x) => x.apodo).sort(), ['Ben', 'Carolina']);
  });
  await prueba('ficha de amigo respeta lo que comparte; a desconocidos no', async () => {
    const [{ p }] = await rpc(ben, `select public.perfil_amigo($1) as p`, [ana]);
    igual(p.apodo, 'Ana G');
    igual(p.racha, null, 'ana no comparte racha');
    igual(typeof p.entrenos, 'number');
    if ('email' in p) throw new Error('email expuesto');
    await falla(rpc(dani, `select public.perfil_amigo($1)`, [ana]), /no encontrado/);
  });

  console.log('Actividad y validaciones en servidor');
  await prueba('entreno válido cuenta; el reenvío no duplica', async () => {
    const [{ r }] = await rpc(ana, `select public.registrar_entreno('s1', current_date, 50, 15, false, '[{"e":"Press banca","kg":60}]') as r`);
    igual([r.nuevo, r.cuenta, r.records], [true, true, 0]);
    const [{ r: r2 }] = await rpc(ana, `select public.registrar_entreno('s1', current_date, 50, 15, false, '[]') as r`);
    igual(r2.nuevo, false);
  });
  await prueba('fechas futuras o de hace más de 7 días se rechazan', async () => {
    await falla(rpc(ana, `select public.registrar_entreno('f', current_date + 3, 50, 15)`), /plazo/);
    await falla(rpc(ana, `select public.registrar_entreno('v', current_date - 9, 50, 15)`), /plazo/);
  });
  await prueba('valores absurdos se rechazan; entrenos de 2 minutos no cuentan', async () => {
    await falla(rpc(ana, `select public.registrar_entreno('a', current_date, 5000, 15)`), /no válidos/);
    await falla(rpc(ana, `select public.registrar_entreno('b', current_date, 50, -1)`), /no válidos/);
    const [{ r }] = await rpc(ana, `select public.registrar_entreno('c', current_date, 2, 1) as r`);
    igual(r.cuenta, false);
  });
  await prueba('récords: +20 % máximo puntúa, saltos imposibles no', async () => {
    const [{ r: a }] = await rpc(ana, `select public.registrar_entreno('s2', current_date, 50, 15, false, '[{"e":"press banca","kg":65}]') as r`);
    igual(a.records, 1);
    const [{ r: b }] = await rpc(ana, `select public.registrar_entreno('s3', current_date, 50, 15, false, '[{"e":"press banca","kg":300}]') as r`);
    igual(b.records, 0, 'salto del 360 %');
    const [{ r: c }] = await rpc(ana, `select public.registrar_entreno('s4', current_date, 50, 15, false, '[{"e":"sentadilla","kg":"abc"},{"e":"","kg":10}]') as r`);
    igual(c.records, 0);
  });
  await prueba('límite de frecuencia (20 por hora)', async () => {
    for (let i = 0; i < 20; i++) await rpc(dani, `select public.registrar_entreno($1, current_date, 50, 15)`, ['r' + i]).catch(() => {});
    await falla(rpc(dani, `select public.registrar_entreno('rx', current_date, 50, 15)`), /demasiados/);
  });
  await prueba('proteína solo hoy o ayer', async () => {
    await rpc(ana, `select public.marcar_dia_proteina(current_date)`);
    await rpc(ana, `select public.marcar_dia_proteina(current_date)`); // repetido no suma
    await falla(rpc(ana, `select public.marcar_dia_proteina(current_date - 5)`), /plazo/);
  });

  console.log('Puntos y rankings (calculados en servidor)');
  await prueba('el cálculo de puntos coincide con las reglas', async () => {
    // Semana pasada de Ben, insertada por el sistema: 3 entrenos (objetivo 3) + 2 días de proteína
    const lunes = (await db.query(`select (date_trunc('week', current_date) - interval '7 days')::date::text as d`)).rows[0].d;
    for (let i = 0; i < 3; i++) await db.query(`insert into public.actividad (user_id, id, dia, minutos, series) values ($1, $2, $3::date + $4::int, 45, 12)`, [ben, 'p' + i, lunes, i]);
    for (let i = 0; i < 2; i++) await db.query(`insert into public.dias_proteina (user_id, dia) values ($1, $2::date + $3::int)`, [ben, lunes, i]);
    const [s] = await rpc(ben, `select * from public.ranking('semana', 'puntos', 1) where yo`);
    // 3×10 + 20 (semana cumplida) + 2×3 (proteína) + 1×2 (racha 1) = 58
    igual(s.puntos, 58);
    igual(s.constancia, 100);
  });
  await prueba('el ranking solo muestra amigos visibles y a mí', async () => {
    const filas = await rpc(ana, `select apodo, yo from public.ranking('semana', 'puntos')`);
    igual(filas.map((f) => f.apodo).sort(), ['Ana G', 'Ben']); // Carolina es amiga pero invisible
    const deDani = await rpc(dani, `select apodo from public.ranking()`);
    igual(deDani.map((f) => f.apodo), ['Dani']);
  });
  await prueba('no hay forma de enviar puntos desde el móvil', async () => {
    const r = (await db.query(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and (p.proname ilike '%punto%' or p.proname = 'subir_resumen')`)).rows[0].n;
    igual(r, 0);
  });
  await prueba('historial de posiciones devuelve 8 semanas', async () => {
    const h = await rpc(ana, `select * from public.historial_posiciones()`);
    igual(h.length, 8);
    igual(h[7].total, 2);
  });
  await prueba('parámetros de ranking inválidos', async () => {
    await falla(rpc(ana, `select * from public.ranking('año')`), /no válidos/);
    await falla(rpc(ana, `select * from public.ranking('semana', 'kilos')`), /no válidos/);
  });

  console.log('Retos');
  let reto;
  await prueba('crear reto: solo con amigos y metas razonables', async () => {
    await falla(rpc(ana, `select public.crear_reto('Duelo', 'individual', 7, 'entrenos', 4, array[$1]::uuid[])`, [dani]), /amigos/);
    await falla(rpc(ana, `select public.crear_reto('Duelo', 'individual', 7, 'entrenos', 50, array[$1]::uuid[])`, [ben]), /meta/);
    await falla(rpc(ana, `select public.crear_reto('<b>', 'individual', 7, 'entrenos', 3)`), /nombre/);
    [{ id: reto }] = await rpc(ana, `select public.crear_reto('Semana a tope', 'individual', 7, 'entrenos', 2, array[$1]::uuid[]) as id`, [ben]);
  });
  await prueba('el invitado lo ve, acepta y el progreso se calcula en servidor', async () => {
    let [{ r }] = await rpc(ben, `select public.mis_retos() as r`);
    igual(r[0].mi_estado, 'invitado');
    await rpc(ben, `select public.responder_reto($1, true)`, [reto]);
    [{ r }] = await rpc(ana, `select public.mis_retos() as r`);
    const yo = r[0].participantes.find((p) => p.yo);
    igual(yo.progreso, 1); // s1, s2, s3 de hoy cuentan como 1 día
    igual(r[0].participantes.length, 2);
  });
  await prueba('un extraño no puede ver ni aceptar el reto', async () => {
    const [{ r }] = await rpc(dani, `select public.mis_retos() as r`);
    igual(r, []);
    await falla(rpc(dani, `select public.responder_reto($1, true)`, [reto]), /no encontrada/);
  });

  console.log('Bloqueos');
  await prueba('bloquear rompe la amistad y oculta en búsquedas y rankings', async () => {
    await rpc(ben, `select public.bloquear($1)`, [ana]);
    igual(await rpc(ana, `select * from public.buscar_perfiles('ben')`), []);
    igual((await rpc(ana, `select apodo from public.ranking()`)).map((f) => f.apodo), ['Ana G']);
    await falla(rpc(ana, `select public.solicitar_amistad(p_id => $1)`, [ben]), /no encontrado/);
    await falla(rpc(ana, `select public.perfil_amigo($1)`, [ben]), /no encontrado/);
    const [{ m }] = await rpc(ben, `select public.mis_amigos() as m`);
    igual(m.bloqueados.map((x) => x.id), [ana]);
    await rpc(ben, `select public.desbloquear($1)`, [ana]);
    igual((await rpc(ana, `select apodo from public.buscar_perfiles('ben')`)).length, 1);
  });

  console.log('Logros y borrado de cuenta');
  await prueba('mis_logros devuelve cifras del servidor', async () => {
    const [{ l }] = await rpc(ana, `select public.mis_logros() as l`);
    igual(l.records, 1);
    igual(l.semanas.length, 8);
  });
  await prueba('borrar mi cuenta elimina todos mis datos y solo los míos', async () => {
    await rpc(dani, `select public.borrar_mi_cuenta()`);
    const quedan = (await db.query(`select
      (select count(*) from auth.users where id = $1) + (select count(*) from public.perfiles where id = $1) +
      (select count(*) from public.actividad where user_id = $1) as n`, [dani])).rows[0].n;
    igual(Number(quedan), 0);
    igual(Number((await db.query(`select count(*) n from auth.users`)).rows[0].n), 3);
  });
  await prueba('las migraciones se pueden volver a aplicar sin errores', async () => {
    for (const f of readdirSync(carpeta).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(carpeta, f), 'utf8'));
  });
  await prueba('todas las tablas de public tienen RLS', async () => {
    const r = (await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)).rows;
    igual(r, []);
  });
  await prueba('ninguna función de public es ejecutable por anon', async () => {
    const r = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`)).rows;
    igual(r, []);
  });

  console.log(`\n${ok} pruebas correctas, ${fallos} fallidas (fecha del servidor: ${hoy})`);
  process.exit(fallos ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) principal();
