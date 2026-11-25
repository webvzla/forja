-- © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
-- FORJA · migración 3: refuerzo de seguridad tras la auditoría (2026-11-12)
-- Corrige: granja de puntos con retos fáciles, enumeración de códigos, spam de solicitudes,
-- suplantación con apodos, fuga de apodos en retos, perfil "Nadie" visible para amigos,
-- retos duplicados por doble pulsación y crecimiento ilimitado de amistades.
-- Solo añade una tabla privada y reemplaza funciones; no borra datos.

-- ---------------------------------------------------------------------------
-- Límite de frecuencia por usuario y acción (tabla privada, fuera de la API)
-- ---------------------------------------------------------------------------
create table if not exists privado.uso (
  user_id uuid not null references auth.users on delete cascade,
  accion text not null,
  momento timestamptz not null default now()
);
create index if not exists uso_busqueda on privado.uso (user_id, accion, momento desc);
revoke all on privado.uso from public, anon, authenticated;

create or replace function privado.limitar(p_accion text, p_maximo int, p_ventana interval)
returns void
language plpgsql
set search_path = ''
as $$
declare yo uuid := privado.yo();
begin
  if (select count(*) from privado.uso u where u.user_id = yo and u.accion = p_accion and u.momento > now() - p_ventana) >= p_maximo then
    raise exception 'demasiadas peticiones, espera un poco' using errcode = '54000';
  end if;
  insert into privado.uso (user_id, accion) values (yo, p_accion);
  -- limpieza ligera de lo antiguo del propio usuario (nunca de otros)
  if random() < 0.05 then
    delete from privado.uso u where u.user_id = yo and u.momento < now() - interval '2 days';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Códigos de invitación: 6 caracteres con azar criptográfico (887 millones de combinaciones)
-- ---------------------------------------------------------------------------
create or replace function privado.codigo_nuevo()
returns text
language plpgsql
set search_path = ''
as $$
declare
  letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  azar bytea;
  c text;
begin
  loop
    azar := uuid_send(gen_random_uuid()); -- UUID v4: 122 bits de azar seguro
    c := 'FORJA-';
    for i in 0..5 loop
      c := c || substr(letras, 1 + (get_byte(azar, i) % 31), 1);
    end loop;
    exit when not exists (select 1 from public.perfiles where codigo = c);
  end loop;
  return c;
end $$;

-- ---------------------------------------------------------------------------
-- Apodos: sin símbolos raros, caracteres invisibles ni nombres que suplanten a FORJA
-- ---------------------------------------------------------------------------
create or replace function privado.apodo_limpio(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare a text := regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g');
begin
  if char_length(a) not between 2 and 24
     or a !~ '^[[:alnum:]][[:alnum:] ._-]*$'
     or lower(a) ~ '(forja|admin|soporte|oficial|moderador|staff|support)' then
    raise exception 'apodo no válido' using errcode = '22023';
  end if;
  return a;
end $$;

create or replace function public.actualizar_perfil(
  p_apodo text default null,
  p_visible text default null,
  p_compartir jsonb default null,
  p_nivel text default null,
  p_medallas int default null,
  p_dias_objetivo int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := privado.yo();
  claves constant text[] := array['entrenos', 'racha', 'medallas', 'records', 'retos'];
  k text;
  limpio jsonb := '{}'::jsonb;
begin
  perform privado.limitar('perfil', 60, interval '1 hour');
  if p_apodo is not null then
    update public.perfiles set apodo = privado.apodo_limpio(p_apodo) where id = yo;
  end if;
  if p_visible is not null then
    if p_visible not in ('amigos', 'nadie') then raise exception 'visibilidad no válida' using errcode = '22023'; end if;
    update public.perfiles set visible = p_visible where id = yo;
  end if;
  if p_compartir is not null then
    if jsonb_typeof(p_compartir) <> 'object' then raise exception 'preferencias no válidas' using errcode = '22023'; end if;
    foreach k in array claves loop
      limpio := limpio || jsonb_build_object(k, coalesce(jsonb_typeof(p_compartir -> k) = 'boolean' and (p_compartir ->> k)::boolean, false));
    end loop;
    update public.perfiles set compartir = limpio where id = yo;
  end if;
  if p_nivel is not null then
    if p_nivel not in ('principiante', 'intermedio', 'avanzado') then raise exception 'nivel no válido' using errcode = '22023'; end if;
    update public.perfiles set nivel = p_nivel where id = yo;
  end if;
  if p_medallas is not null then
    update public.perfiles set medallas = least(greatest(p_medallas, 0), 500) where id = yo;
  end if;
  if p_dias_objetivo is not null then
    if p_dias_objetivo not between 1 and 7 then raise exception 'días no válidos' using errcode = '22023'; end if;
    update public.perfiles set dias_objetivo = p_dias_objetivo where id = yo;
  end if;
  return public.mi_perfil();
end $$;

-- ---------------------------------------------------------------------------
-- Puntos: como máximo 2 retos completados puntúan por semana (evita la granja de retos fáciles)
-- ---------------------------------------------------------------------------
create or replace function privado.semanas(p_uid uuid, p_n int default 8, p_desplazar int default 0)
returns table (semana date, entrenos int, objetivo int, prot int, records int, retos int, racha int, puntos int)
language plpgsql
stable
set search_path = ''
as $$
declare
  lunes date := date_trunc('week', current_date)::date - 7 * p_desplazar;
  total int := p_n + 12;
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
    rt := 0;
    if i < p_n then -- los retos solo hacen falta en las semanas que se devuelven
      select count(*) into rt from public.participantes_reto pt join public.retos x on x.id = pt.reto
        where pt.usuario = p_uid and pt.estado = 'aceptado'
          and x.inicio + x.dias <= current_date
          and x.inicio + x.dias - 1 >= w and x.inicio + x.dias - 1 < w + 7
          and privado.reto_cumplido(x.id, p_uid);
    end if;
    r := case when e >= o then r + 1 else 0 end;
    if i < p_n then
      semana := w; entrenos := e; objetivo := o; prot := pr; records := rc; retos := rt; racha := r;
      puntos := least(e, o + 2) * 10 + (case when e >= o then 20 else 0 end) + least(pr, 7) * 3
              + least(r, 10) * 2 + least(rc, 3) * 5 + least(rt, 2) * 15;
      return next;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Búsqueda: límite de frecuencia; con código solo coincidencia exacta del código completo
-- ---------------------------------------------------------------------------
create or replace function public.buscar_perfiles(p_texto text)
returns table (id uuid, apodo text, nivel text, relacion text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  yo uuid := privado.yo();
  t text := btrim(coalesce(p_texto, ''));
  es_codigo boolean;
begin
  if char_length(t) < 3 or char_length(t) > 30 then return; end if;
  perform privado.limitar('buscar', 40, interval '1 hour');
  es_codigo := upper(t) ~ '^FORJA-[A-Z0-9]{4,6}$';
  return query
  select p.id, p.apodo, p.nivel,
    coalesce((select case when a.estado = 'aceptada' then 'amigo' when a.de = yo then 'enviada' else 'recibida' end
              from public.amistades a where (a.de = yo and a.para = p.id) or (a.de = p.id and a.para = yo)), 'ninguna')
  from public.perfiles p
  where p.id <> yo
    and not privado.bloqueado(yo, p.id)
    and (case when es_codigo then p.codigo = upper(t)
              else p.visible <> 'nadie' and lower(p.apodo) like '%' || replace(replace(replace(lower(t), '\', '\\'), '%', '\%'), '_', '\_') || '%' end)
  order by lower(p.apodo)
  limit 10;
end $$;

-- ---------------------------------------------------------------------------
-- Solicitudes: límite por hora y máximo de amigos (protege rankings y evita abuso)
-- ---------------------------------------------------------------------------
create or replace function privado.cabe_amigo(p_uid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (select count(*) from privado.amigos(p_uid)) < 100;
$$;

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
  perform privado.limitar('solicitud', 20, interval '1 hour');
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
    if fila.de = otro then
      if not privado.cabe_amigo(yo) or not privado.cabe_amigo(otro) then
        raise exception 'límite de amigos alcanzado' using errcode = '54000';
      end if;
      update public.amistades set estado = 'aceptada' where de = otro and para = yo;
      return 'amigo';
    end if;
    return 'enviada';
  end if;

  if (select count(*) from public.amistades where de = yo and estado = 'pendiente') >= 30 then
    raise exception 'demasiadas solicitudes pendientes' using errcode = '54000';
  end if;
  if not privado.cabe_amigo(yo) then raise exception 'límite de amigos alcanzado' using errcode = '54000'; end if;
  insert into public.amistades (de, para) values (yo, otro);
  return 'enviada';
end $$;

create or replace function public.responder_amistad(p_id uuid, p_aceptar boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare yo uuid := privado.yo();
begin
  if not exists (select 1 from public.amistades where de = p_id and para = yo and estado = 'pendiente') then
    raise exception 'solicitud no encontrada' using errcode = 'P0002';
  end if;
  if p_aceptar then
    if not privado.cabe_amigo(yo) or not privado.cabe_amigo(p_id) then
      raise exception 'límite de amigos alcanzado' using errcode = '54000';
    end if;
    update public.amistades set estado = 'aceptada' where de = p_id and para = yo;
    return 'amigo';
  end if;
  delete from public.amistades where de = p_id and para = yo;
  return 'ninguna';
end $$;

-- ---------------------------------------------------------------------------
-- Ficha de amigo: con visibilidad "Nadie" no se muestra ningún dato
-- ---------------------------------------------------------------------------
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
  en int; co int; ra int;
  rc int;
  rt int;
  ver boolean;
begin
  if not privado.son_amigos(yo, p_id) then raise exception 'perfil no encontrado' using errcode = 'P0002'; end if;
  select * into p from public.perfiles where id = p_id;
  ver := p.visible <> 'nadie';
  if ver then
    select x.entrenos, x.constancia, x.racha into en, co, ra from privado.cifras(p_id, 4) x;
    select coalesce(sum(s.records), 0), coalesce(sum(s.retos), 0) into rc, rt from privado.semanas(p_id, 4) s;
  end if;
  return jsonb_build_object(
    'id', p.id, 'apodo', p.apodo, 'nivel', case when ver then p.nivel end, 'desde', p.creado, 'privado', not ver,
    'entrenos', case when ver and (p.compartir ->> 'entrenos')::boolean then en end,
    'constancia', case when ver and (p.compartir ->> 'entrenos')::boolean then co end,
    'racha', case when ver and (p.compartir ->> 'racha')::boolean then ra end,
    'medallas', case when ver and (p.compartir ->> 'medallas')::boolean then p.medallas end,
    'records', case when ver and (p.compartir ->> 'records')::boolean then rc end,
    'retos', case when ver and (p.compartir ->> 'retos')::boolean then rt end
  );
end $$;

-- ---------------------------------------------------------------------------
-- Retos: metas mínimas, nombres sin caracteres de control, sin duplicados por doble pulsación
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
  personas int;
  minimo int;
  nombre_limpio text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  invitados uuid[] := array(select distinct x from unnest(coalesce(p_invitados, '{}')) x where x is not null and x <> privado.yo());
begin
  if char_length(nombre_limpio) not between 3 and 40 or nombre_limpio ~ '[<>[:cntrl:]]' then
    raise exception 'nombre no válido' using errcode = '22023';
  end if;
  if p_modo not in ('individual', 'grupal') or p_dias not in (7, 14, 30) or p_objetivo not in ('entrenos', 'proteina', 'records') then
    raise exception 'reto no válido' using errcode = '22023';
  end if;
  if v_inicio < current_date - 1 or v_inicio > current_date + 1 then raise exception 'fecha no válida' using errcode = '22023'; end if;
  if coalesce(array_length(invitados, 1), 0) > 10 then raise exception 'máximo 10 invitados' using errcode = '22023'; end if;
  if p_modo = 'grupal' and coalesce(array_length(invitados, 1), 0) = 0 then raise exception 'reto no válido' using errcode = '22023'; end if;

  -- Meta mínima: 2 entrenos por semana, la mitad de los días con proteína, 1 récord por semana.
  personas := case when p_modo = 'grupal' then 1 + coalesce(array_length(invitados, 1), 0) else 1 end;
  minimo := personas * case p_objetivo when 'entrenos' then ceil(p_dias * 2 / 7.0)::int when 'proteina' then ceil(p_dias / 2.0)::int else ceil(p_dias / 7.0)::int end;
  if p_meta is null or p_meta < minimo or p_meta > 1000
     or (p_modo = 'individual' and p_objetivo in ('entrenos', 'proteina') and p_meta > p_dias) then
    raise exception 'meta no válida' using errcode = '22023';
  end if;

  -- Doble pulsación o reenvío: devuelve el reto ya creado en lugar de duplicarlo.
  select r.id into nuevo from public.retos r
    where r.creador = yo and r.nombre = nombre_limpio and r.inicio = v_inicio and r.creado > now() - interval '10 minutes';
  if nuevo is not null then return nuevo; end if;

  perform privado.limitar('reto', 10, interval '1 day');
  if (select count(*) from public.retos r where r.creador = yo and r.inicio + r.dias > current_date) >= 10 then
    raise exception 'tienes demasiados retos activos' using errcode = '54000';
  end if;
  foreach invitado in array invitados loop
    if not privado.son_amigos(yo, invitado) then raise exception 'solo puedes invitar a amigos' using errcode = '42501'; end if;
  end loop;

  insert into public.retos (creador, nombre, modo, dias, objetivo, meta, inicio)
  values (yo, nombre_limpio, p_modo, p_dias, p_objetivo, p_meta, v_inicio)
  returning id into nuevo;
  insert into public.participantes_reto (reto, usuario, estado) values (nuevo, yo, 'aceptado');
  insert into public.participantes_reto (reto, usuario) select nuevo, x from unnest(invitados) x on conflict do nothing;
  return nuevo;
end $$;

-- Mis retos: de quien no es tu amigo solo ves el apodo si ya se unió y no es invisible.
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
        'id', p.usuario,
        'apodo', case when p.usuario = (select id from yo) or privado.son_amigos((select id from yo), p.usuario)
                        or (p.estado = 'aceptado' and pf.visible <> 'nadie') then pf.apodo else 'Participante' end,
        'yo', p.usuario = (select id from yo), 'estado', p.estado,
        'progreso', case when p.estado = 'aceptado' then privado.progreso(r.id, p.usuario) else 0 end)
        order by p.usuario = (select id from yo) desc, pf.apodo)
      from public.participantes_reto p join public.perfiles pf on pf.id = p.usuario
      where p.reto = r.id and not privado.bloqueado((select id from yo), p.usuario))
  ) order by (r.inicio + r.dias <= current_date), r.inicio desc), '[]'::jsonb)
  from public.retos r
  join public.participantes_reto mp on mp.reto = r.id and mp.usuario = (select id from yo)
  where r.inicio + r.dias > current_date - 60;
$$;

revoke all on all functions in schema privado from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['actualizar_perfil(text, text, jsonb, text, int, int)', 'buscar_perfiles(text)', 'solicitar_amistad(text, uuid)',
    'responder_amistad(uuid, boolean)', 'perfil_amigo(uuid)', 'crear_reto(text, text, int, text, int, uuid[], date)', 'mis_retos()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
