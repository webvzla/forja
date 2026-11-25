-- © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
-- FORJA · migración 1c: el usuario puede borrar SU propia cuenta (cascada de sus datos)

-- ---------------------------------------------------------------------------
-- Borrar la propia cuenta (borra en cascada todos sus datos)
-- ---------------------------------------------------------------------------
create or replace function public.borrar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'no autenticado' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;
