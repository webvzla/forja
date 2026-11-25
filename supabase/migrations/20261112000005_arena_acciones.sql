-- © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
-- FORJA · migración 2b: acciones del propio usuario que quitan relaciones
-- (rechazar/quitar amigo, bloquear, salir de un reto). Solo afectan a filas del propio usuario.

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
    update public.amistades set estado = 'aceptada' where de = p_id and para = yo;
    return 'amigo';
  end if;
  delete from public.amistades where de = p_id and para = yo;
  return 'ninguna';
end $$;

create or replace function public.eliminar_amistad(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare yo uuid := privado.yo();
begin
  delete from public.amistades where (de = yo and para = p_id) or (de = p_id and para = yo);
  return true;
end $$;

create or replace function public.bloquear(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare yo uuid := privado.yo();
begin
  if p_id is null or p_id = yo or not exists (select 1 from public.perfiles where id = p_id) then
    raise exception 'perfil no encontrado' using errcode = 'P0002';
  end if;
  insert into public.bloqueos (quien, bloqueado) values (yo, p_id) on conflict do nothing;
  delete from public.amistades where (de = yo and para = p_id) or (de = p_id and para = yo);
  return true;
end $$;

create or replace function public.desbloquear(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare yo uuid := privado.yo();
begin
  delete from public.bloqueos where quien = yo and bloqueado = p_id;
  return true;
end $$;

create or replace function public.responder_reto(p_reto uuid, p_aceptar boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare yo uuid := privado.yo();
begin
  if not exists (select 1 from public.participantes_reto where reto = p_reto and usuario = yo and estado = 'invitado') then
    raise exception 'invitación no encontrada' using errcode = 'P0002';
  end if;
  if p_aceptar then
    update public.participantes_reto set estado = 'aceptado' where reto = p_reto and usuario = yo;
  else
    delete from public.participantes_reto where reto = p_reto and usuario = yo;
  end if;
  return true;
end $$;

create or replace function public.salir_reto(p_reto uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare yo uuid := privado.yo();
begin
  delete from public.participantes_reto where reto = p_reto and usuario = yo;
  return true;
end $$;

