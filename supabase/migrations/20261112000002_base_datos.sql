-- © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
-- FORJA · migración 1b: datos sincronizados, IA y preferencias

-- ---------------------------------------------------------------------------
-- Datos de la app sincronizados entre dispositivos (un JSON por persona)
-- ---------------------------------------------------------------------------
create table if not exists public.datos_usuario (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  datos jsonb constraint datos_tamano check (datos is null or octet_length(datos::text) < 3000000),
  actualizado timestamptz default now()
);
alter table public.datos_usuario enable row level security;
revoke all on public.datos_usuario from anon, authenticated;
grant select, insert, update on public.datos_usuario to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'datos_usuario' and policyname = 'ver lo mio') then
    create policy "ver lo mio" on public.datos_usuario for select to authenticated using ((select auth.uid()) = user_id);
    create policy "crear lo mio" on public.datos_usuario for insert to authenticated with check ((select auth.uid()) = user_id);
    create policy "editar lo mio" on public.datos_usuario for update to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Contador de usos de IA (lo usará la función de IA más adelante)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid references auth.users on delete cascade,
  day date not null default current_date,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.bump_ai()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare c int;
begin
  if auth.uid() is null then raise exception 'no autenticado' using errcode = '28000'; end if;
  insert into public.ai_usage (user_id, day, n) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set n = public.ai_usage.n + 1
  returning n into c;
  return c;
end $$;
revoke all on function public.bump_ai() from public, anon;
grant execute on function public.bump_ai() to authenticated;

-- ---------------------------------------------------------------------------
-- Mi perfil y mis preferencias
-- ---------------------------------------------------------------------------
create or replace function public.mi_perfil()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', id, 'apodo', apodo, 'codigo', codigo, 'visible', visible,
    'compartir', compartir, 'nivel', nivel, 'dias_objetivo', dias_objetivo)
  from public.perfiles where id = auth.uid();
$$;
revoke all on function public.mi_perfil() from public, anon;
grant execute on function public.mi_perfil() to authenticated;

-- Cada campo es opcional (null = no cambiar). Todo se valida aquí.
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
  yo uuid := auth.uid();
  apodo_limpio text;
  claves constant text[] := array['entrenos', 'racha', 'medallas', 'records', 'retos'];
  k text;
  limpio jsonb := '{}'::jsonb;
begin
  if yo is null then raise exception 'no autenticado' using errcode = '28000'; end if;

  if p_apodo is not null then
    apodo_limpio := regexp_replace(btrim(p_apodo), '\s+', ' ', 'g');
    if char_length(apodo_limpio) not between 2 and 24 or apodo_limpio ~ '[<>@]' then
      raise exception 'apodo no válido' using errcode = '22023';
    end if;
    update public.perfiles set apodo = apodo_limpio where id = yo;
  end if;

  if p_visible is not null then
    if p_visible not in ('amigos', 'nadie') then raise exception 'visibilidad no válida' using errcode = '22023'; end if;
    update public.perfiles set visible = p_visible where id = yo;
  end if;

  if p_compartir is not null then
    if jsonb_typeof(p_compartir) <> 'object' then raise exception 'preferencias no válidas' using errcode = '22023'; end if;
    foreach k in array claves loop
      limpio := limpio || jsonb_build_object(k, coalesce((p_compartir ->> k)::boolean, false));
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
revoke all on function public.actualizar_perfil(text, text, jsonb, text, int, int) from public, anon;
grant execute on function public.actualizar_perfil(text, text, jsonb, text, int, int) to authenticated;

