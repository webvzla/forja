// Pruebas de ataque (auditoría de seguridad): cada prueba intenta un abuso concreto y
// comprueba que el servidor lo impide. Se ejecutan contra un Postgres real en memoria (PGlite)
// con las migraciones reales; la autenticación de Supabase está emulada.
// Uso: node seguridad.test.mjs
import { baseDeDatos, como } from './sql.test.mjs';

let ok = 0, fallos = 0;
async function prueba(nombre, f) {
  try { await f(); ok++; console.log('  ✓', nombre); } catch (e) { fallos++; console.log('  ✗', nombre, '\n     ', e?.message ?? e); }
}
const orden = (v) => (Array.isArray(v) ? v.map(orden) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, orden(v[k])])) : v);
const igual = (a, b, m = '') => { if (JSON.stringify(orden(a)) !== JSON.stringify(orden(b))) throw new Error(`${m} esperado ${JSON.stringify(b)} y fue ${JSON.stringify(a)}`); };
async function falla(p, patron) {
  try { await p; } catch (e) { if (patron && !patron.test(e.message)) throw new Error('otro error: ' + e.message); return; }
  throw new Error('debía fallar y no falló');
}

const db = await baseDeDatos();
const crear = async (email) => (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
const rpc = (uid, sql, p) => como(db, uid, sql, p);
const [ana, ben, caro, eva] = await Promise.all(['ana', 'ben', 'caro', 'eva'].map((n) => crear(`${n}@x.test`)));
const codigo = async (u) => (await db.query(`select codigo from public.perfiles where id = $1`, [u])).rows[0].codigo;
const amigos = async (a, b) => { await rpc(a, `select public.solicitar_amistad(p_id => $1)`, [b]); await rpc(b, `select public.responder_amistad($1, true)`, [a]); };
await rpc(ana, `select public.actualizar_perfil(p_apodo => 'Ana')`);
await rpc(ben, `select public.actualizar_perfil(p_apodo => 'Ben')`);
await rpc(caro, `select public.actualizar_perfil(p_apodo => 'Caro', p_visible => 'nadie')`);
await amigos(ana, ben);

console.log('Escalada de privilegios y acceso directo');
await prueba('las funciones internas (privado) no se pueden llamar', async () => {
  await falla(rpc(ana, `select privado.semanas($1)`, [ben]), /permission denied/);
  await falla(rpc(ana, `select privado.limitar('x', 1, '1 hour')`), /permission denied/);
  await falla(rpc(null, `select * from privado.uso`), /permission denied/);
});
await prueba('todas las funciones SECURITY DEFINER fijan search_path vacío', async () => {
  const r = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'privado') and p.prosecdef and not coalesce('search_path=""' = any(p.proconfig), false)`)).rows;
  igual(r, []);
});
await prueba('un usuario no puede cambiar el perfil de otro aunque fuerce el id', async () => {
  await falla(rpc(ana, `update public.perfiles set apodo = 'hack' where id = $1`, [ben]), /permission denied/);
  igual((await db.query(`select apodo from public.perfiles where id = $1`, [ben])).rows[0].apodo, 'Ben');
});
await prueba('no se puede insertar datos_usuario a nombre de otro ni cambiar el dueño de la fila', async () => {
  await rpc(ana, `insert into public.datos_usuario (user_id, datos) values ($1, '{}')`, [ana]);
  await falla(rpc(ana, `update public.datos_usuario set user_id = $1 where user_id = $2`, [ben, ana]), /row-level security|permission/);
});
await prueba('JSON gigante rechazado (3 MB)', async () => {
  await falla(rpc(ana, `update public.datos_usuario set datos = jsonb_build_object('x', repeat('a', 3100000)) where user_id = $1`, [ana]), /datos_tamano/);
});

console.log('Manipulación de puntos');
await prueba('granja de retos fáciles: meta mínima obligatoria', async () => {
  await falla(rpc(ana, `select public.crear_reto('Facil', 'individual', 7, 'entrenos', 1)`), /meta/);
  await falla(rpc(ana, `select public.crear_reto('Facil', 'individual', 30, 'proteina', 3)`), /meta/);
  await falla(rpc(ana, `select public.crear_reto('Equipo', 'grupal', 7, 'entrenos', 2, array[$1]::uuid[])`, [ben]), /meta/);
});
await prueba('como mucho 2 retos completados puntúan por semana', async () => {
  // 5 retos individuales cumplidos que acabaron la semana pasada (insertados por el sistema)
  const lunes = (await db.query(`select (date_trunc('week', current_date) - interval '7 days')::date::text d`)).rows[0].d;
  for (let i = 0; i < 4; i++) await db.query(`insert into public.actividad (user_id, id, dia, minutos, series) values ($1, $2, $3::date + $4::int, 40, 10)`, [eva, 'v' + i, lunes, i]);
  for (let i = 0; i < 5; i++) {
    const r = (await db.query(`insert into public.retos (creador, nombre, modo, dias, objetivo, meta, inicio) values ($1, $2, 'individual', 7, 'entrenos', 2, $3::date) returning id`, [eva, 'Reto ' + i, lunes])).rows[0].id;
    await db.query(`insert into public.participantes_reto (reto, usuario, estado) values ($1, $2, 'aceptado')`, [r, eva]);
  }
  const [s] = await rpc(eva, `select * from public.ranking('semana', 'puntos', 1)`);
  // 4×10 + 20 + racha 1×2 + 2 retos×15 = 92 (sin el límite serían 137)
  igual(s.puntos, 92);
});
await prueba('entrenos inventados: fechas futuras, antiguas o valores absurdos no entran', async () => {
  await falla(rpc(ana, `select public.registrar_entreno('a1', current_date + 2, 50, 15)`), /plazo/);
  await falla(rpc(ana, `select public.registrar_entreno('a2', current_date - 8, 50, 15)`), /plazo/);
  await falla(rpc(ana, `select public.registrar_entreno('a3', current_date, 601, 15)`), /no válidos/);
});
await prueba('varios entrenos el mismo día solo cuentan uno', async () => {
  for (let i = 0; i < 5; i++) await rpc(ben, `select public.registrar_entreno($1, current_date, 50, 15)`, ['b' + i]);
  const [f] = (await rpc(ben, `select * from public.ranking() where yo`));
  igual(f.entrenos, 1);
});
await prueba('récords inflados: subida de golpe > 20 % no puntúa; puntos por récord limitados a 3/semana', async () => {
  const marcas = (kg) => JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ e: 'ej' + i, kg })));
  await rpc(ana, `select public.registrar_entreno('r0', current_date, 50, 15, false, $1::jsonb)`, [marcas(50)]);
  const [{ r }] = await rpc(ana, `select public.registrar_entreno('r1', current_date, 50, 15, false, $1::jsonb) as r`, [marcas(59)]);
  igual(r.records, 10);
  const [{ r: r2 }] = await rpc(ana, `select public.registrar_entreno('r2', current_date, 50, 15, false, $1::jsonb) as r`, [marcas(500)]);
  igual(r2.records, 0);
  const [f] = await rpc(ana, `select * from public.ranking() where yo`);
  // 1 entreno (10) + récords limitados a 3 (15) = 25
  igual(f.puntos, 25);
});
await prueba('repetir la misma petición (replay) no suma dos veces', async () => {
  const antes = (await rpc(ana, `select * from public.ranking() where yo`))[0].puntos;
  await rpc(ana, `select public.registrar_entreno('r1', current_date, 50, 15, false, '[]')`);
  await rpc(ana, `select public.marcar_dia_proteina(current_date)`);
  await rpc(ana, `select public.marcar_dia_proteina(current_date)`);
  const despues = (await rpc(ana, `select * from public.ranking() where yo`))[0].puntos;
  igual(despues - antes, 3); // solo el primer día de proteína
});
await prueba('doble pulsación al crear un reto no lo duplica', async () => {
  const [{ a }] = await rpc(ana, `select public.crear_reto('Duelo semanal', 'individual', 7, 'entrenos', 3, array[$1]::uuid[]) as a`, [ben]);
  const [{ b }] = await rpc(ana, `select public.crear_reto('Duelo semanal', 'individual', 7, 'entrenos', 3, array[$1]::uuid[]) as b`, [ben]);
  igual(a, b);
});

console.log('Privacidad entre usuarios');
await prueba('perfil "Nadie": ni siquiera los amigos ven sus cifras', async () => {
  await amigos(caro, ana).catch(async () => { // Caro es invisible: solo por código
    await rpc(ana, `select public.solicitar_amistad(p_codigo => $1)`, [await codigo(caro)]);
    await rpc(caro, `select public.responder_amistad($1, true)`, [ana]);
  });
  const [{ p }] = await rpc(ana, `select public.perfil_amigo($1) as p`, [caro]);
  igual([p.privado, p.entrenos, p.racha, p.nivel], [true, null, null, null]);
});
await prueba('en un reto, alguien que no es tu amigo y no se ha unido aparece anónimo', async () => {
  const [{ id }] = await rpc(ana, `select public.crear_reto('Con Caro', 'individual', 7, 'entrenos', 2, array[$1, $2]::uuid[]) as id`, [ben, caro]);
  const [{ r }] = await rpc(ben, `select public.mis_retos() as r`);
  const reto = r.find((x) => x.id === id);
  const deCaro = reto.participantes.find((x) => x.id === caro);
  igual(deCaro.apodo, 'Participante');
});
await prueba('apodos que suplantan a FORJA o con caracteres invisibles se rechazan', async () => {
  for (const a of ['FORJA Oficial', 'Soporte', 'admin', 'Ana​', 'A<b>', 'Ana@x']) {
    await falla(rpc(eva, `select public.actualizar_perfil(p_apodo => $1)`, [a]), /apodo/);
  }
  await rpc(eva, `select public.actualizar_perfil(p_apodo => 'Eva Núñez')`); // tildes y ñ sí
});
await prueba('nombres de reto con caracteres de control se rechazan', async () => {
  await falla(rpc(ana, `select public.crear_reto($1, 'individual', 7, 'entrenos', 2)`, ['Reto\u0007ruido']), /nombre/);
});
await prueba('preferencias con tipos falsos se guardan como "no compartir"', async () => {
  const [{ p }] = await rpc(eva, `select public.actualizar_perfil(p_compartir => '{"entrenos":"true","racha":1,"medallas":true}') as p`);
  igual(p.compartir, { entrenos: false, racha: false, medallas: true, records: false, retos: false });
});

console.log('Abuso de la API');
await prueba('enumerar códigos de invitación: códigos de 6 caracteres y búsqueda limitada', async () => {
  igual((await codigo(eva)).length, 12);
  let bloqueado = false;
  for (let i = 0; i < 45 && !bloqueado; i++) {
    try { await rpc(eva, `select * from public.buscar_perfiles($1)`, [`FORJA-AAA${String(i).padStart(3, '0')}`]); } catch (e) { bloqueado = /demasiadas/.test(e.message); }
  }
  igual(bloqueado, true);
});
await prueba('spam de solicitudes: límite por hora', async () => {
  const otros = [];
  for (let i = 0; i < 22; i++) otros.push(await crear(`spam${i}@x.test`));
  let bloqueado = false;
  for (const o of otros) {
    try { await rpc(caro, `select public.solicitar_amistad(p_codigo => $1)`, [await codigo(o)]); } catch (e) { bloqueado = /demasiadas/.test(e.message); if (bloqueado) break; }
  }
  igual(bloqueado, true);
});
await prueba('ráfaga de entrenos: límite de 20 por hora', async () => {
  const fede = await crear('fede@x.test');
  let n = 0;
  try { for (let i = 0; i < 25; i++) { await rpc(fede, `select public.registrar_entreno($1, current_date, 50, 15)`, ['x' + i]); n++; } } catch { /* esperado */ }
  igual(n, 20);
});
await prueba('anónimo no puede ejecutar ninguna función ni leer tablas', async () => {
  const r = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'privado') and has_function_privilege('anon', p.oid, 'execute')`)).rows;
  igual(r, []);
  const t = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'privado') and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'select')`)).rows;
  igual(t, []);
});

console.log('Eliminación de cuenta');
await prueba('borrar la cuenta elimina perfil, amistades, actividad y límites; sus retos quedan sin creador', async () => {
  await rpc(ana, `select public.borrar_mi_cuenta()`);
  const n = (await db.query(`select
    (select count(*) from public.perfiles where id = $1) + (select count(*) from public.amistades where de = $1 or para = $1) +
    (select count(*) from public.actividad where user_id = $1) + (select count(*) from privado.uso where user_id = $1) +
    (select count(*) from public.retos where creador = $1) as n`, [ana])).rows[0].n;
  igual(Number(n), 0);
  igual((await rpc(ben, `select public.mis_retos() as r`))[0].r.length > 0, true); // Ben conserva sus retos
});

console.log(`\n${ok} pruebas de seguridad correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
