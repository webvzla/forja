-- Forja · base de datos
-- Pega todo esto en Supabase → SQL Editor → New query → Run.

-- Datos de cada usuario (una fila por persona, todo en un JSON)
create table if not exists public.datos_usuario (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  datos jsonb,
  actualizado timestamptz default now()
);
alter table public.datos_usuario enable row level security;

drop policy if exists "ver lo mio" on public.datos_usuario;
drop policy if exists "crear lo mio" on public.datos_usuario;
drop policy if exists "editar lo mio" on public.datos_usuario;
create policy "ver lo mio"    on public.datos_usuario for select using (auth.uid() = user_id);
create policy "crear lo mio"  on public.datos_usuario for insert with check (auth.uid() = user_id);
create policy "editar lo mio" on public.datos_usuario for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Contador de usos de IA por día (nadie puede leerlo ni tocarlo directamente)
create table if not exists public.ai_usage (
  user_id uuid references auth.users on delete cascade,
  day date not null default current_date,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

create or replace function public.bump_ai()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare c int;
begin
  if auth.uid() is null then
    raise exception 'no autenticado';
  end if;
  insert into ai_usage (user_id, day, n) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set n = ai_usage.n + 1
  returning n into c;
  return c;
end $$;

revoke all on function public.bump_ai() from public, anon;
grant execute on function public.bump_ai() to authenticated;

-- Borrar la propia cuenta desde la app (borra en cascada todos sus datos)
create or replace function public.borrar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'no autenticado';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;

-- ============ Retos con amigos ============
-- Todo se lee y escribe a través de funciones seguras: nadie ve más de lo que debe.
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 40),
  codigo text not null unique,
  creado timestamptz default now()
);
create table if not exists public.miembros (
  grupo_id uuid references public.grupos on delete cascade,
  user_id uuid references auth.users on delete cascade,
  apodo text not null check (char_length(apodo) between 1 and 20),
  unido timestamptz default now(),
  primary key (grupo_id, user_id)
);
create table if not exists public.resumen_semana (
  user_id uuid references auth.users on delete cascade,
  semana date not null,
  entrenos int not null default 0,
  objetivo int not null default 3,
  dias_proteina int not null default 0,
  racha int not null default 0,
  actualizado timestamptz default now(),
  primary key (user_id, semana)
);
alter table public.grupos enable row level security;
alter table public.miembros enable row level security;
alter table public.resumen_semana enable row level security;

create or replace function public.crear_grupo(p_nombre text, p_apodo text)
returns json language plpgsql security definer set search_path = public as $$
declare g grupos;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  if (select count(*) from miembros where user_id = auth.uid()) >= 10 then raise exception 'demasiados grupos'; end if;
  loop
    begin
      insert into grupos (nombre, codigo) values (trim(p_nombre), upper(substr(md5(random()::text), 1, 6))) returning * into g;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  insert into miembros (grupo_id, user_id, apodo) values (g.id, auth.uid(), trim(p_apodo));
  return json_build_object('id', g.id, 'nombre', g.nombre, 'codigo', g.codigo);
end $$;

create or replace function public.unirse_grupo(p_codigo text, p_apodo text)
returns json language plpgsql security definer set search_path = public as $$
declare g grupos;
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  select * into g from grupos where codigo = upper(trim(p_codigo));
  if g.id is null then raise exception 'codigo no valido'; end if;
  if (select count(*) from miembros where grupo_id = g.id) >= 30 then raise exception 'grupo lleno'; end if;
  insert into miembros (grupo_id, user_id, apodo) values (g.id, auth.uid(), trim(p_apodo))
  on conflict (grupo_id, user_id) do update set apodo = excluded.apodo;
  return json_build_object('id', g.id, 'nombre', g.nombre, 'codigo', g.codigo);
end $$;

create or replace function public.salir_grupo(p_grupo uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from miembros where grupo_id = p_grupo and user_id = auth.uid();
  delete from grupos where id = p_grupo and not exists (select 1 from miembros where grupo_id = p_grupo);
end $$;

create or replace function public.mis_grupos()
returns table (id uuid, nombre text, codigo text, miembros bigint)
language sql security definer set search_path = public as $$
  select g.id, g.nombre, g.codigo, (select count(*) from miembros m2 where m2.grupo_id = g.id)
  from grupos g join miembros m on m.grupo_id = g.id
  where m.user_id = auth.uid()
  order by m.unido;
$$;

create or replace function public.ranking(p_grupo uuid, p_semana date)
returns table (apodo text, entrenos int, objetivo int, dias_proteina int, racha int, yo boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from miembros where grupo_id = p_grupo and user_id = auth.uid()) then
    raise exception 'no eres miembro';
  end if;
  return query
    select m.apodo, coalesce(r.entrenos, 0), coalesce(r.objetivo, 3), coalesce(r.dias_proteina, 0), coalesce(r.racha, 0), m.user_id = auth.uid()
    from miembros m left join resumen_semana r on r.user_id = m.user_id and r.semana = p_semana
    where m.grupo_id = p_grupo;
end $$;

create or replace function public.subir_resumen(p_semana date, p_entrenos int, p_objetivo int, p_dias_proteina int, p_racha int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no autenticado'; end if;
  insert into resumen_semana (user_id, semana, entrenos, objetivo, dias_proteina, racha, actualizado)
  values (auth.uid(), p_semana, least(greatest(p_entrenos, 0), 14), least(greatest(p_objetivo, 1), 7),
          least(greatest(p_dias_proteina, 0), 7), least(greatest(p_racha, 0), 520), now())
  on conflict (user_id, semana) do update set
    entrenos = excluded.entrenos, objetivo = excluded.objetivo, dias_proteina = excluded.dias_proteina,
    racha = excluded.racha, actualizado = now();
end $$;

revoke all on function public.crear_grupo(text, text), public.unirse_grupo(text, text), public.salir_grupo(uuid),
  public.mis_grupos(), public.ranking(uuid, date), public.subir_resumen(date, int, int, int, int) from public, anon;
grant execute on function public.crear_grupo(text, text), public.unirse_grupo(text, text), public.salir_grupo(uuid),
  public.mis_grupos(), public.ranking(uuid, date), public.subir_resumen(date, int, int, int, int) to authenticated;
