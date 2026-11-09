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
