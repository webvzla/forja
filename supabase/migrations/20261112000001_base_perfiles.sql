-- © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
-- FORJA · migración 1: base (perfiles, datos sincronizados, IA, borrar cuenta)
-- Seguridad:
--   * RLS activado en TODAS las tablas.
--   * Las tablas sensibles no tienen políticas: solo se tocan mediante funciones
--     que comprueban auth.uid() y validan los datos en el servidor.
--   * Ninguna función se puede ejecutar sin sesión (anon no tiene EXECUTE).

-- Las funciones nuevas en public ya no quedan abiertas a todo el mundo por defecto.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Perfiles públicos-entre-amigos (sin email ni datos de salud)
-- ---------------------------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users on delete cascade,
  apodo text not null check (char_length(apodo) between 2 and 24),
  codigo text not null unique check (codigo ~ '^FORJA-[A-Z0-9]{4,6}$'),
  visible text not null default 'amigos' check (visible in ('amigos', 'nadie')),
  compartir jsonb not null default '{"entrenos":true,"racha":true,"medallas":true,"records":false,"retos":true}'::jsonb,
  nivel text check (nivel in ('principiante', 'intermedio', 'avanzado')),
  medallas int not null default 0 check (medallas between 0 and 500),
  dias_objetivo int not null default 3 check (dias_objetivo between 1 and 7),
  creado timestamptz not null default now()
);
alter table public.perfiles enable row level security;
revoke all on public.perfiles from anon, authenticated;
grant select on public.perfiles to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'perfiles' and policyname = 'ver mi perfil') then
    create policy "ver mi perfil" on public.perfiles for select to authenticated using ((select auth.uid()) = id);
  end if;
end $$;
create index if not exists perfiles_apodo_idx on public.perfiles (lower(apodo));

create or replace function privado.codigo_nuevo()
returns text
language plpgsql
set search_path = ''
as $$
declare
  letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sin 0/O ni 1/I/L
  c text;
begin
  loop
    c := 'FORJA-';
    for i in 1..4 loop
      c := c || substr(letras, 1 + floor(random() * length(letras))::int, 1);
    end loop;
    exit when not exists (select 1 from public.perfiles where codigo = c);
  end loop;
  return c;
end $$;

-- Al registrarse, se crea un perfil con un apodo neutro (nunca el email).
create or replace function privado.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, apodo, codigo)
  values (new.id, 'Atleta-' || upper(substr(replace(new.id::text, '-', ''), 1, 4)), privado.codigo_nuevo())
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function privado.crear_perfil() from public, anon, authenticated;

create or replace trigger al_registrarse after insert on auth.users
  for each row execute function privado.crear_perfil();

-- Usuarios que ya existían antes de esta migración
insert into public.perfiles (id, apodo, codigo)
select u.id, 'Atleta-' || upper(substr(replace(u.id::text, '-', ''), 1, 4)), privado.codigo_nuevo()
from auth.users u
where not exists (select 1 from public.perfiles p where p.id = u.id);

