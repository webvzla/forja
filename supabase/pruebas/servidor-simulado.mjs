// Supabase simulado para pruebas de extremo a extremo (NUNCA para producción):
// auth mínima (signup / password / user / logout) y PostgREST mínimo (rpc + datos_usuario),
// sobre un Postgres real en memoria (PGlite) con las migraciones y RLS de verdad.
// Uso: node supabase/pruebas/servidor-simulado.mjs [puerto]
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { baseDeDatos } from './sql.test.mjs';

const puerto = Number(process.argv[2] ?? 54321);
const db = await baseDeDatos();
const claves = new Map(); // email -> {id, clave}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (p) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64(p)}.x`;
const leerJwt = (t) => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); } catch { return null; } };

async function como(uid, f) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : '']);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return f(tx);
  });
}

const metadatos = new Map(); // id -> user_metadata que se envió al registrarse (options.data), como hace Supabase
const registro = []; // solo para la prueba: qué token de captcha llegó a cada petición de autenticación
function sesion(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: metadatos.get(u.id) ?? {}, created_at: new Date().toISOString() };
  return { access_token: jwt({ sub: u.id, role: 'authenticated', exp, email: u.email }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: randomUUID(), user };
}

const firmas = new Map();
async function firma(fn) {
  if (!firmas.has(fn)) {
    const r = (await db.query(`select p.proretset, p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes) t) as tipos,
      format_type(p.prorettype, null) as ret from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn])).rows[0];
    firmas.set(fn, r ?? null);
  }
  return firmas.get(fn);
}

// ---- Storage simulado (solo lo que usan las capturas): subida multipart a un bucket, con las MISMAS políticas RLS reales (la subida hace un
// INSERT en storage.objects como la persona) y las restricciones del bucket (tamaño y tipos). Todo lo que sea leer devuelve «no encontrado»,
// como un bucket privado sin políticas de lectura. Los bytes se guardan en memoria solo para que la prueba pueda inspeccionarlos.
const objetos = new Map(); // 'bucket/ruta' -> { tipo, bytes }
function extraerParte(bruto, limite) {
  const sep = Buffer.from(`--${limite}`);
  let i = bruto.indexOf(sep);
  while (i >= 0) {
    const ini = i + sep.length;
    const sig = bruto.indexOf(sep, ini);
    if (sig < 0) break;
    const trozo = bruto.subarray(ini, sig);
    const finCab = trozo.indexOf('\r\n\r\n');
    if (finCab >= 0) {
      const cab = trozo.subarray(0, finCab).toString('utf8');
      const tipo = cab.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim();
      if (tipo && !/^text\/plain/.test(tipo)) return { tipo, bytes: trozo.subarray(finCab + 4, trozo.length - 2) };
    }
    i = sig;
  }
  return { tipo: 'application/octet-stream', bytes: Buffer.alloc(0) };
}
async function almacen(req, url, bruto, uid, enviar) {
  const m = url.pathname.match(/^\/storage\/v1\/object\/(?:(public|authenticated|sign|info)\/)?([^/]+)\/(.+)$/);
  if (!m) return enviar(404, { statusCode: '404', error: 'not_found', message: 'ruta no válida' });
  const [, modo, bucket, ruta] = m;
  const nombre = decodeURIComponent(ruta);
  if (req.method === 'POST' && !modo) {
    const b = (await db.query(`select * from storage.buckets where id = $1`, [bucket])).rows[0];
    if (!b) return enviar(404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    if (!uid) return enviar(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    const ct = req.headers['content-type'] ?? '';
    const limite = ct.match(/boundary=(.+)$/)?.[1];
    const parte = limite ? extraerParte(bruto, limite) : { tipo: ct, bytes: bruto };
    if (b.file_size_limit && parte.bytes.length > Number(b.file_size_limit)) return enviar(413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    if (b.allowed_mime_types && !b.allowed_mime_types.includes(parte.tipo)) return enviar(415, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${parte.tipo} is not supported` });
    try {
      await como(uid, (tx) => tx.query(`insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)`, [bucket, nombre, uid]));
    } catch (e) {
      if (e.code === '42501') return enviar(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      if (e.code === '23505') return enviar(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      throw e;
    }
    objetos.set(`${bucket}/${nombre}`, parte);
    return enviar(200, { Id: randomUUID(), Key: `${bucket}/${nombre}` });
  }
  return enviar(400, { statusCode: '404', error: 'not_found', message: 'Bucket not found' });
}

const errorPg = (e) => ({ status: e.code === '42501' ? 401 : e.code === 'P0002' ? 404 : 400, cuerpo: { code: e.code, message: e.message, details: null, hint: null } });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const cab = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  const enviar = (status, cuerpo) => { res.writeHead(status, { ...cab, 'content-type': 'application/json' }); res.end(cuerpo === undefined ? '' : JSON.stringify(cuerpo)); };
  if (req.method === 'OPTIONS') return enviar(204);
  const trozos = [];
  for await (const t of req) trozos.push(Buffer.from(t));
  const bruto = Buffer.concat(trozos);
  const esAlmacen = url.pathname.startsWith('/storage/v1/');
  const cuerpo = !esAlmacen && bruto.length ? JSON.parse(bruto.toString('utf8')) : {};
  const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '');
  const claims = leerJwt(token);
  const uid = claims?.role === 'authenticated' && claims.exp * 1000 > Date.now() ? claims.sub : null;

  try {
    if (esAlmacen) return await almacen(req, url, bruto, uid, enviar);
    // ---- Auth ----
    // Captcha simulado: el servidor real lo valida contra Cloudflare; aquí solo se rechaza el token «token-malo» para probar el error.
    if (['/auth/v1/signup', '/auth/v1/token', '/auth/v1/recover'].includes(url.pathname)) {
      const t = cuerpo.gotrue_meta_security?.captcha_token ?? null;
      registro.push({ ruta: url.pathname, captcha: t });
      if (t === 'token-malo') return enviar(400, { code: 400, error_code: 'captcha_failed', msg: 'captcha verification process failed' });
    }
    if (url.pathname === '/auth/v1/recover') return enviar(200, {});
    if (url.pathname === '/auth/v1/signup') {
      if (claves.has(cuerpo.email)) return enviar(422, { code: 'user_already_exists', msg: 'User already registered' });
      const id = (await db.query(`insert into auth.users (email) values ($1) returning id`, [cuerpo.email])).rows[0].id;
      claves.set(cuerpo.email, { id, clave: cuerpo.password });
      if (cuerpo.data && typeof cuerpo.data === 'object') metadatos.set(id, cuerpo.data);
      return enviar(200, sesion({ id, email: cuerpo.email }));
    }
    if (url.pathname === '/auth/v1/token') {
      const u = claves.get(cuerpo.email);
      if (!u || u.clave !== cuerpo.password) return enviar(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return enviar(200, sesion({ id: u.id, email: cuerpo.email }));
    }
    if (url.pathname === '/auth/v1/user') return uid ? enviar(200, sesion({ id: uid, email: claims.email }).user) : enviar(401, { msg: 'no session' });
    if (url.pathname === '/auth/v1/logout') return enviar(204);

    // ---- Funciones (rpc) ----
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (m) {
      const f = await firma(m[1]);
      if (!f) return enviar(404, { code: 'PGRST202', message: 'función no encontrada' });
      const nombres = f.proargnames ?? [];
      const usados = nombres.map((n, i) => [n, f.tipos[i]]).filter(([n]) => n in cuerpo);
      const params = usados.map(([n, t]) => (t === 'jsonb' && cuerpo[n] !== null ? JSON.stringify(cuerpo[n]) : cuerpo[n]));
      const args = usados.map(([n, t], i) => `${n} => $${i + 1}::${t}`).join(', ');
      const filas = await como(uid, async (tx) => (await tx.query(f.proretset ? `select * from public.${m[1]}(${args})` : `select public.${m[1]}(${args}) as r`, params)).rows);
      return enviar(200, f.proretset ? filas : (filas[0]?.r ?? null));
    }

    // ---- Tabla datos_usuario ----
    if (url.pathname === '/rest/v1/datos_usuario') {
      if (req.method === 'GET') {
        const filtro = url.searchParams.get('user_id')?.replace(/^eq\./, '');
        // PostgREST: select=alias:datos->a->b[,actualizado] devuelve solo esos trozos, con el nombre `alias`.
        const lista = (url.searchParams.get('select') ?? '').split(',').filter(Boolean);
        const trozos = lista.map((t) => t.match(/^(\w+):datos((?:->\w+)+)$/));
        if (lista.length && lista.every((t, i) => trozos[i] || t === 'actualizado' || t === 'user_id')) {
          const params = [];
          const cols = lista.map((t, i) => {
            if (!trozos[i]) return t;
            params.push(`{${trozos[i][2].split('->').filter(Boolean).join(',')}}`);
            return `datos #> $${params.length}::text[] as ${trozos[i][1]}`;
          });
          let donde = '';
          if (filtro) { params.push(filtro); donde = `where user_id = $${params.length}`; }
          const filas = await como(uid, async (tx) => (await tx.query(`select ${cols.join(', ')} from public.datos_usuario ${donde}`, params)).rows);
          if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) return filas.length === 1 ? enviar(200, filas[0]) : enviar(406, { code: 'PGRST116', message: 'no rows' });
          return enviar(200, filas);
        }
        const filas = await como(uid, async (tx) => (await tx.query(`select user_id, datos, actualizado from public.datos_usuario ${filtro ? 'where user_id = $1' : ''}`, filtro ? [filtro] : [])).rows);
        if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) return filas.length === 1 ? enviar(200, filas[0]) : enviar(406, { code: 'PGRST116', message: 'no rows' });
        return enviar(200, filas);
      }
      if (req.method === 'POST') {
        const fila = Array.isArray(cuerpo) ? cuerpo[0] : cuerpo;
        // upsert (on_conflict) reemplaza; un insert normal falla si la fila ya existe (23505), como en PostgREST
        const sustituye = url.searchParams.has('on_conflict');
        await como(uid, (tx) => tx.query(`insert into public.datos_usuario (user_id, datos, actualizado) values ($1, $2::jsonb, $3)
          ${sustituye ? 'on conflict (user_id) do update set datos = excluded.datos, actualizado = excluded.actualizado' : ''}`, [fila.user_id, JSON.stringify(fila.datos), fila.actualizado]));
        return enviar(201);
      }
      if (req.method === 'PATCH') {
        // update ... where user_id = eq.X [and actualizado = eq.T | is.null], devolviendo las filas cambiadas
        const quita = (v) => v?.replace(/^(eq|is)\./, '');
        const params = [JSON.stringify(cuerpo.datos), cuerpo.actualizado, quita(url.searchParams.get('user_id'))];
        const act = url.searchParams.get('actualizado');
        let cond = 'user_id = $3';
        if (act?.startsWith('eq.')) { params.push(quita(act)); cond += ` and actualizado = $${params.length}::timestamptz`; }
        else if (act === 'is.null') cond += ' and actualizado is null';
        const filas = await como(uid, async (tx) => (await tx.query(`update public.datos_usuario set datos = $1::jsonb, actualizado = $2 where ${cond} returning user_id`, params)).rows);
        return enviar(200, filas);
      }
    }
    // ---- Solo para la prueba: consultar el estado de la base (como administrador) ----
    if (url.pathname === '/__prueba/auth-log' && req.headers['x-prueba'] === 'si') return enviar(200, registro);
    if (url.pathname === '/__prueba/objeto' && req.headers['x-prueba'] === 'si') {
      const o = objetos.get(url.searchParams.get('ruta'));
      return o ? enviar(200, { tipo: o.tipo, bytes: o.bytes.length, base64: o.bytes.toString('base64') }) : enviar(404, { message: 'no hay objeto' });
    }
    if (url.pathname === '/__prueba/objetos' && req.headers['x-prueba'] === 'si') return enviar(200, [...objetos.keys()]);
    if (url.pathname === '/__prueba/sql' && req.headers['x-prueba'] === 'si') {
      return enviar(200, (await db.query(cuerpo.sql, cuerpo.params ?? [])).rows);
    }
    return enviar(404, { message: 'no implementado: ' + url.pathname });
  } catch (e) {
    const x = errorPg(e);
    return enviar(x.status, x.cuerpo);
  }
}).listen(puerto, '127.0.0.1', () => console.log(`Supabase simulado en http://127.0.0.1:${puerto}`));
