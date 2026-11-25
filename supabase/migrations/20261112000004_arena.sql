-- © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
-- FORJA · migración 2: ARENA (amigos, actividad validada, puntos, rankings, retos, logros)
-- Los puntos NUNCA los manda el móvil: el servidor guarda hechos (entreno hecho, día de
-- proteína, marcas) con límites, y calcula puntos y rankings en el momento de consultarlos.

-- ---------------------------------------------------------------------------
-- Tablas (todas con RLS y sin políticas: acceso solo mediante las funciones de abajo)
-- ---------------------------------------------------------------------------
create table if not exists public.amistades (
  de uuid not null references auth.users on delete cascade,
  para uuid not null references auth.users on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada')),
  creado timestamptz not null default now(),
  primary key (de, para),
  check (de <> para)
);
create unique index if not exists amistades_pareja on public.amistades (least(de, para), greatest(de, para));
create index if not exists amistades_para on public.amistades (para);

create table if not exists public.bloqueos (
  quien uuid not null references auth.users on delete cascade,
  bloqueado uuid not null references auth.users on delete cascade,
  creado timestamptz not null default now(),
  primary key (quien, bloqueado),
  check (quien <> bloqueado)
);
create index if not exists bloqueos_bloqueado on public.bloqueos (bloqueado);

-- Un entreno terminado. El id lo genera el móvil, así reenviar desde la cola offline no duplica.
create table if not exists public.actividad (
  user_id uuid not null references auth.users on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  dia date not null,
  minutos int not null check (minutos between 0 and 600),
  series int not null check (series between 0 and 300),
  descarga boolean not null default false,
  records int not null default 0 check (records between 0 and 40),
  cuenta boolean generated always as (minutos >= 10 and series >= 3) stored,
  creado timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists actividad_dia on public.actividad (user_id, dia);

-- Mejor peso por ejercicio (privado): sirve para validar récords en el servidor.
create table if not exists public.marcas (
  user_id uuid not null references auth.users on delete cascade,
  ejercicio text not null check (char_length(ejercicio) between 1 and 60),
  kg numeric(6, 2) not null check (kg > 0 and kg <= 500),
  actualizado timestamptz not null default now(),
  primary key (user_id, ejercicio)
);

create table if not exists public.dias_proteina (
  user_id uuid not null references auth.users on delete cascade,
  dia date not null,
  creado timestamptz not null default now(),
  primary key (user_id, dia)
);

-- Objetivo de días de cada semana, congelado al registrar la primera actividad de la semana
-- (bajar el objetivo a mitad de semana no regala la bonificación de "semana cumplida").
create table if not exists public.objetivo_semanal (
  user_id uuid not null references auth.users on delete cascade,
  semana date not null,
  objetivo int not null check (objetivo between 1 and 7),
  primary key (user_id, semana)
);

create table if not exists public.retos (
  id uuid primary key default gen_random_uuid(),
  creador uuid references auth.users on delete set null,
  nombre text not null check (char_length(nombre) between 3 and 40),
  modo text not null check (modo in ('individual', 'grupal')),
  dias int not null check (dias in (7, 14, 30)),
  objetivo text not null check (objetivo in ('entrenos', 'proteina', 'records')),
  meta int not null check (meta between 1 and 1000),
  inicio date not null,
  creado timestamptz not null default now()
);
create index if not exists retos_creador on public.retos (creador);

create table if not exists public.participantes_reto (
  reto uuid not null references public.retos on delete cascade,
  usuario uuid not null references auth.users on delete cascade,
  estado text not null default 'invitado' check (estado in ('invitado', 'aceptado')),
  primary key (reto, usuario)
);
create index if not exists participantes_usuario on public.participantes_reto (usuario);

do $$
declare t text;
begin
  foreach t in array array['amistades', 'bloqueos', 'actividad', 'marcas', 'dias_proteina', 'objetivo_semanal', 'retos', 'participantes_reto'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Funciones internas (esquema privado, no accesible desde la API)
-- ---------------------------------------------------------------------------
create or replace function privado.yo()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'no autenticado' using errcode = '28000'; end if;
  return auth.uid();
end $$;

create or replace function privado.bloqueado(a uuid, b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.bloqueos where (quien = a and bloqueado = b) or (quien = b and bloqueado = a));
$$;

create or replace function privado.amigos(p_uid uuid)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select case when a.de = p_uid then a.para else a.de end
  from public.amistades a
  where a.estado = 'aceptada' and (a.de = p_uid or a.para = p_uid)
    and not privado.bloqueado(a.de, a.para);
$$;

create or replace function privado.son_amigos(a uuid, b uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from privado.amigos(a) x where x = b);
$$;

create or replace function privado.progreso(p_reto uuid, p_uid uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select (case r.objetivo
    when 'entrenos' then (select count(distinct a.dia) from public.actividad a
      where a.user_id = p_uid and a.cuenta and a.dia >= r.inicio and a.dia < r.inicio + r.dias and a.dia <= current_date + 1)
    when 'proteina' then (select count(*) from public.dias_proteina d
      where d.user_id = p_uid and d.dia >= r.inicio and d.dia < r.inicio + r.dias)
    else (select coalesce(sum(a.records), 0) from public.actividad a
      where a.user_id = p_uid and not a.descarga and a.dia >= r.inicio and a.dia < r.inicio + r.dias)
  end)::int
  from public.retos r where r.id = p_reto;
$$;

create or replace function privado.reto_cumplido(p_reto uuid, p_uid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case r.modo
    when 'individual' then privado.progreso(r.id, p_uid) >= r.meta
    else (select coalesce(sum(privado.progreso(r.id, p.usuario)), 0) from public.participantes_reto p
          where p.reto = r.id and p.estado = 'aceptado') >= r.meta
  end
  from public.retos r where r.id = p_reto;
$$;

-- Semanas de una persona, de la más antigua a la actual (la actual va menos `desplazar`).
-- Mismas reglas que se muestran en la app (src/competicion.ts · REGLAS_PUNTOS).
create or replace function privado.semanas(p_uid uuid, p_n int default 8, p_desplazar int default 0)
returns table (semana date, entrenos int, objetivo int, prot int, records int, retos int, racha int, puntos int)
language plpgsql
stable
set search_path = ''
as $$
declare
  lunes date := date_trunc('week', current_date)::date - 7 * p_desplazar;
  total int := p_n + 12; -- 12 semanas extra para calcular bien la racha
  w date;
  r int := 0;
  e int; o int; pr int; rc int; rt int;
begin
  for i in reverse (total - 1)..0 loop
    w := lunes - 7 * i;
    select count(distinct a.dia) into e from public.actividad a
      where a.user_id = p_uid and a.cuenta and a.dia >= w and a.dia < w + 7;
    o := coalesce(
      (select os.objetivo from public.objetivo_semanal os where os.user_id = p_uid and os.semana <= w order by os.semana desc limit 1),
      (select p.dias_objetivo from public.perfiles p where p.id = p_uid),
      3);
    select count(*) into pr from public.dias_proteina d where d.user_id = p_uid and d.dia >= w and d.dia < w + 7;
    select coalesce(sum(a.records), 0) into rc from public.actividad a
      where a.user_id = p_uid and not a.descarga and a.dia >= w and a.dia < w + 7;
    select count(*) into rt from public.participantes_reto pt join public.retos x on x.id = pt.reto
      where pt.usuario = p_uid and pt.estado = 'aceptado'
        and x.inicio + x.dias <= current_date
        and x.inicio + x.dias - 1 >= w and x.inicio + x.dias - 1 < w + 7
        and privado.reto_cumplido(x.id, p_uid);
    r := case when e >= o then r + 1 else 0 end;
    if i < p_n then
      semana := w; entrenos := e; objetivo := o; prot := pr; records := rc; retos := rt; racha := r;
      puntos := least(e, o + 2) * 10 + (case when e >= o then 20 else 0 end) + least(pr, 7) * 3
              + least(r, 10) * 2 + least(rc, 3) * 5 + rt * 15;
      return next;
    end if;
  end loop;
end $$;

create or replace function privado.cifras(p_uid uuid, p_n int, p_desplazar int default 0)
returns table (puntos int, entrenos int, constancia int, racha int)
language sql
stable
set search_path = ''
as $$
  with s as (select * from privado.semanas(p_uid, p_n, p_desplazar))
  select coalesce(sum(s.puntos), 0)::int,
         coalesce(sum(s.entrenos), 0)::int,
         coalesce(round(100.0 * sum(least(s.entrenos, s.objetivo)) / nullif(sum(s.objetivo), 0)), 0)::int,
         coalesce((select s2.racha from s s2 order by s2.semana desc limit 1), 0)::int
  from s;
$$;

create or replace function privado.congelar_objetivo(p_uid uuid, p_dia date)
returns void
language sql
set search_path = ''
as $$
  insert into public.objetivo_semanal (user_id, semana, objetivo)
  select p_uid, date_trunc('week', p_dia)::date, p.dias_objetivo from public.perfiles p where p.id = p_uid
  on conflict (user_id, semana) do nothing;
$$;

revoke all on all functions in schema privado from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Registrar actividad (con validaciones en servidor)
-- ---------------------------------------------------------------------------
-- p_marcas: [{"e": "press banca", "kg": 80}, ...] mejor peso de cada ejercicio de la sesión.
create or replace function public.registrar_entreno(
  p_id text, p_dia date, p_minutos int, p_series int, p_descarga boolean default false, p_marcas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := privado.yo();
  m jsonb;
  nombre text;
  peso numeric;
  previo numeric;
  nuevos int := 0;
  fila public.actividad;
begin
  if p_id is null or char_length(p_id) not between 1 and 64 then raise exception 'id no válido' using errcode = '22023'; end if;

  select * into fila from public.actividad where user_id = yo and id = p_id;
  if found then
    return jsonb_build_object('ok', true, 'nuevo', false, 'records', fila.records, 'cuenta', fila.cuenta);
  end if;

  -- Solo se aceptan entrenos de los últimos 7 días y nunca futuros (+1 día por zonas horarias).
  if p_dia is null or p_dia > current_date + 1 or p_dia < current_date - 7 then
    raise exception 'fecha fuera de plazo' using errcode = '22023';
  end if;
  if p_minutos is null or p_minutos not between 0 and 600 or p_series is null or p_series not between 0 and 300 then
    raise exception 'datos de entreno no válidos' using errcode = '22023';
  end if;
  if (select count(*) from public.actividad where user_id = yo and creado > now() - interval '1 hour') >= 20 then
    raise exception 'demasiados registros, espera un poco' using errcode = '54000';
  end if;
  if p_marcas is null or jsonb_typeof(p_marcas) <> 'array' or jsonb_array_length(p_marcas) > 40 then
    raise exception 'marcas no válidas' using errcode = '22023';
  end if;

  -- Récords: superar tu propia marca, como mucho un 20 % de golpe (subidas mayores no puntúan).
  for m in select * from jsonb_array_elements(p_marcas) loop
    nombre := lower(btrim(m ->> 'e'));
    begin
      peso := (m ->> 'kg')::numeric;
    exception when others then
      continue;
    end;
    if nombre is null or char_length(nombre) not between 1 and 60 or peso is null or peso <= 0 or peso > 500 then
      continue;
    end if;
    select kg into previo from public.marcas where user_id = yo and ejercicio = nombre;
    if previo is null then
      insert into public.marcas (user_id, ejercicio, kg) values (yo, nombre, peso);
    elsif peso > previo then
      if not coalesce(p_descarga, false) and peso <= previo * 1.2 then
        nuevos := nuevos + 1;
      end if;
      update public.marcas set kg = peso, actualizado = now() where user_id = yo and ejercicio = nombre;
    end if;
  end loop;

  insert into public.actividad (user_id, id, dia, minutos, series, descarga, records)
  values (yo, p_id, p_dia, p_minutos, p_series, coalesce(p_descarga, false), least(nuevos, 40))
  returning * into fila;
  perform privado.congelar_objetivo(yo, p_dia);

  return jsonb_build_object('ok', true, 'nuevo', true, 'records', fila.records, 'cuenta', fila.cuenta);
end $$;

-- Día en que se llegó a la proteína: solo hoy o ayer (no se puede rellenar el pasado).
create or replace function public.marcar_dia_proteina(p_dia date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare yo uuid := privado.yo();
begin
  if p_dia is null or p_dia > current_date + 1 or p_dia < current_date - 1 then
    raise exception 'fecha fuera de plazo' using errcode = '22023';
  end if;
  insert into public.dias_proteina (user_id, dia) values (yo, p_dia) on conflict do nothing;
  perform privado.congelar_objetivo(yo, p_dia);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Amigos, solicitudes y bloqueos
-- ---------------------------------------------------------------------------
create or replace function public.mis_amigos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with yo as (select privado.yo() as id)
  select jsonb_build_object(
    'amigos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'apodo', p.apodo, 'nivel', p.nivel) order by lower(p.apodo))
      from public.perfiles p where p.id in (select privado.amigos((select id from yo)))), '[]'::jsonb),
    'recibidas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'apodo', p.apodo, 'nivel', p.nivel))
      from public.amistades a join public.perfiles p on p.id = a.de
      where a.para = (select id from yo) and a.estado = 'pendiente' and not privado.bloqueado(a.de, a.para)), '[]'::jsonb),
    'enviadas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'apodo', p.apodo, 'nivel', p.nivel))
      from public.amistades a join public.perfiles p on p.id = a.para
      where a.de = (select id from yo) and a.estado = 'pendiente' and not privado.bloqueado(a.de, a.para)), '[]'::jsonb),
    'bloqueados', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'apodo', p.apodo))
      from public.bloqueos b join public.perfiles p on p.id = b.bloqueado
      where b.quien = (select id from yo)), '[]'::jsonb)
  );
$$;

-- Búsqueda por apodo (mín. 3 letras) o por código exacto. Nunca devuelve emails.
create or replace function public.buscar_perfiles(p_texto text)
returns table (id uuid, apodo text, nivel text, relacion text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  yo uuid := privado.yo();
  t text := btrim(coalesce(p_texto, ''));
begin
  if char_length(t) < 3 or char_length(t) > 30 then return; end if;
  return query
  select p.id, p.apodo, p.nivel,
    coalesce((select case when a.estado = 'aceptada' then 'amigo' when a.de = yo then 'enviada' else 'recibida' end
              from public.amistades a where (a.de = yo and a.para = p.id) or (a.de = p.id and a.para = yo)), 'ninguna')
  from public.perfiles p
  where p.id <> yo
    and not privado.bloqueado(yo, p.id)
    and (upper(t) = p.codigo
         or (p.visible <> 'nadie' and lower(p.apodo) like '%' || replace(replace(replace(lower(t), '\', '\\'), '%', '\%'), '_', '\_') || '%'))
  order by (upper(t) = p.codigo) desc, lower(p.apodo)
  limit 10;
end $$;

-- Pedir amistad por código (FORJA-XXXX) o por id (de un resultado de búsqueda).
create or replace function public.solicitar_amistad(p_codigo text default null, p_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := privado.yo();
  otro uuid;
  fila public.amistades;
begin
  if p_codigo is not null then
    select id into otro from public.perfiles where codigo = upper(btrim(p_codigo));
  elsif p_id is not null then
    select id into otro from public.perfiles where id = p_id and visible <> 'nadie';
  end if;
  if otro is null or otro = yo or privado.bloqueado(yo, otro) then
    raise exception 'perfil no encontrado' using errcode = 'P0002';
  end if;

  select * into fila from public.amistades where (de = yo and para = otro) or (de = otro and para = yo);
  if found then
    if fila.estado = 'aceptada' then return 'amigo'; end if;
    if fila.de = otro then -- ya me lo había pedido: aceptar
      update public.amistades set estado = 'aceptada' where de = otro and para = yo;
      return 'amigo';
    end if;
    return 'enviada';
  end if;

  if (select count(*) from public.amistades where de = yo and estado = 'pendiente') >= 30 then
    raise exception 'demasiadas solicitudes pendientes' using errcode = '54000';
  end if;
  insert into public.amistades (de, para) values (yo, otro);
  return 'enviada';
end $$;

-- Ficha de un amigo: solo si sois amigos, y solo lo que él ha decidido compartir.
create or replace function public.perfil_amigo(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  yo uuid := privado.yo();
  p public.perfiles;
  c record;
  rc int;
  rt int;
begin
  if not privado.son_amigos(yo, p_id) then raise exception 'perfil no encontrado' using errcode = 'P0002'; end if;
  select * into p from public.perfiles where id = p_id;
  select * into c from privado.cifras(p_id, 4);
  select coalesce(sum(s.records), 0), coalesce(sum(s.retos), 0) into rc, rt from privado.semanas(p_id, 4) s;
  return jsonb_build_object(
    'id', p.id, 'apodo', p.apodo, 'nivel', p.nivel, 'desde', p.creado,
    'compartir', p.compartir,
    'entrenos', case when (p.compartir ->> 'entrenos')::boolean then c.entrenos end,
    'constancia', case when (p.compartir ->> 'entrenos')::boolean then c.constancia end,
    'racha', case when (p.compartir ->> 'racha')::boolean then c.racha end,
    'medallas', case when (p.compartir ->> 'medallas')::boolean then p.medallas end,
    'records', case when (p.compartir ->> 'records')::boolean then rc end,
    'retos', case when (p.compartir ->> 'retos')::boolean then rt end
  );
end $$;

-- ---------------------------------------------------------------------------
-- Rankings (calculados en el servidor, solo entre amigos)
-- ---------------------------------------------------------------------------
create or replace function public.ranking(p_periodo text default 'semana', p_categoria text default 'puntos', p_desplazar int default 0)
returns table (id uuid, apodo text, puntos int, entrenos int, constancia int, racha int, yo boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mi uuid := privado.yo();
  n int := case p_periodo when 'mes' then 4 else 1 end;
begin
  if p_periodo not in ('semana', 'mes') or p_categoria not in ('puntos', 'entrenos', 'constancia') then
    raise exception 'parámetros no válidos' using errcode = '22023';
  end if;
  if p_desplazar not between 0 and 12 then raise exception 'parámetros no válidos' using errcode = '22023'; end if;
  return query
  with gente as (
    select mi as uid
    union
    select f from privado.amigos(mi) f join public.perfiles pf on pf.id = f where pf.visible <> 'nadie'
  )
  select g.uid, p.apodo, c.puntos, c.entrenos, c.constancia, c.racha, g.uid = mi
  from gente g
  join public.perfiles p on p.id = g.uid
  cross join lateral privado.cifras(g.uid, n, p_desplazar) c
  order by case p_categoria when 'puntos' then c.puntos when 'entrenos' then c.entrenos else c.constancia * 100 + c.racha end desc,
           c.puntos desc, (g.uid = mi) desc;
end $$;

create or replace function public.historial_posiciones()
returns table (semana int, puesto int, total int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mi uuid := privado.yo();
begin
  for i in 0..7 loop
    select x.ord::int, x.cuantos::int into puesto, total from (
      select r.es_yo, r.ord, count(*) over () as cuantos
      from public.ranking('semana', 'puntos', 7 - i) with ordinality as r(id, apodo, puntos, entrenos, constancia, racha, es_yo, ord)
    ) x where x.es_yo;
    semana := i + 1;
    return next;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Retos entre amigos
-- ---------------------------------------------------------------------------
create or replace function public.crear_reto(
  p_nombre text, p_modo text, p_dias int, p_objetivo text, p_meta int, p_invitados uuid[] default '{}', p_inicio date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := privado.yo();
  nuevo uuid;
  v_inicio date := coalesce(p_inicio, current_date);
  invitado uuid;
  nombre_limpio text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  if char_length(nombre_limpio) not between 3 and 40 or nombre_limpio ~ '[<>]' then raise exception 'nombre no válido' using errcode = '22023'; end if;
  if p_modo not in ('individual', 'grupal') or p_dias not in (7, 14, 30) or p_objetivo not in ('entrenos', 'proteina', 'records') then
    raise exception 'reto no válido' using errcode = '22023';
  end if;
  if p_meta is null or p_meta < 1 or p_meta > 1000
     or (p_modo = 'individual' and p_objetivo in ('entrenos', 'proteina') and p_meta > p_dias) then
    raise exception 'meta no válida' using errcode = '22023';
  end if;
  if v_inicio < current_date - 1 or v_inicio > current_date + 1 then raise exception 'fecha no válida' using errcode = '22023'; end if;
  if coalesce(array_length(p_invitados, 1), 0) > 10 then raise exception 'máximo 10 invitados' using errcode = '22023'; end if;
  if (select count(*) from public.retos r where r.creador = yo and r.inicio + r.dias > current_date) >= 10 then
    raise exception 'tienes demasiados retos activos' using errcode = '54000';
  end if;
  foreach invitado in array coalesce(p_invitados, '{}') loop
    if not privado.son_amigos(yo, invitado) then raise exception 'solo puedes invitar a amigos' using errcode = '42501'; end if;
  end loop;

  insert into public.retos (creador, nombre, modo, dias, objetivo, meta, inicio)
  values (yo, nombre_limpio, p_modo, p_dias, p_objetivo, p_meta, v_inicio)
  returning id into nuevo;
  insert into public.participantes_reto (reto, usuario, estado) values (nuevo, yo, 'aceptado');
  insert into public.participantes_reto (reto, usuario)
  select nuevo, x from unnest(coalesce(p_invitados, '{}')) as x where x <> yo
  on conflict do nothing;
  return nuevo;
end $$;

-- Mis retos con el progreso de cada participante (calculado aquí, no en el móvil).
create or replace function public.mis_retos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with yo as (select privado.yo() as id)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'nombre', r.nombre, 'modo', r.modo, 'dias', r.dias, 'objetivo', r.objetivo, 'meta', r.meta,
    'inicio', r.inicio, 'creado_por_mi', r.creador = (select id from yo),
    'mi_estado', mp.estado,
    'terminado', r.inicio + r.dias <= current_date,
    'dias_restantes', greatest(0, (r.inicio + r.dias) - current_date),
    'cumplido', privado.reto_cumplido(r.id, (select id from yo)),
    'participantes', (select jsonb_agg(jsonb_build_object(
        'id', p.usuario, 'apodo', pf.apodo, 'yo', p.usuario = (select id from yo), 'estado', p.estado,
        'progreso', case when p.estado = 'aceptado' then privado.progreso(r.id, p.usuario) else 0 end)
        order by p.usuario = (select id from yo) desc, pf.apodo)
      from public.participantes_reto p join public.perfiles pf on pf.id = p.usuario
      where p.reto = r.id and not privado.bloqueado((select id from yo), p.usuario))
  ) order by (r.inicio + r.dias <= current_date), r.inicio desc), '[]'::jsonb)
  from public.retos r
  join public.participantes_reto mp on mp.reto = r.id and mp.usuario = (select id from yo)
  where r.inicio + r.dias > current_date - 60;
$$;

-- ---------------------------------------------------------------------------
-- Logros (calculados en el servidor)
-- ---------------------------------------------------------------------------
create or replace function public.mis_logros()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from privado.semanas(privado.yo(), 52))
  select jsonb_build_object(
    'puntos', coalesce(sum(s.puntos), 0),
    'entrenos', coalesce(sum(s.entrenos), 0),
    'semanas_cumplidas', count(*) filter (where s.entrenos >= s.objetivo),
    'mejor_racha', coalesce(max(s.racha), 0),
    'records', coalesce(sum(s.records), 0),
    'retos_completados', coalesce(sum(s.retos), 0),
    'semanas', (select jsonb_agg(jsonb_build_object('semana', x.semana, 'puntos', x.puntos, 'entrenos', x.entrenos,
                 'objetivo', x.objetivo, 'prot', x.prot, 'records', x.records, 'retos', x.retos, 'racha', x.racha) order by x.semana)
                from (select * from s order by s.semana desc limit 8) x)
  )
  from s;
$$;

