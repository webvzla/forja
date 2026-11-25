-- © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
-- FORJA · migración 2c: permisos de ARENA

-- ---------------------------------------------------------------------------
-- Permisos: solo usuarios con sesión, nunca anónimos
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'registrar_entreno(text, date, int, int, boolean, jsonb)', 'marcar_dia_proteina(date)',
    'mis_amigos()', 'buscar_perfiles(text)', 'solicitar_amistad(text, uuid)', 'responder_amistad(uuid, boolean)',
    'eliminar_amistad(uuid)', 'bloquear(uuid)', 'desbloquear(uuid)', 'perfil_amigo(uuid)',
    'ranking(text, text, int)', 'historial_posiciones()',
    'crear_reto(text, text, int, text, int, uuid[], date)', 'responder_reto(uuid, boolean)', 'salir_reto(uuid)',
    'mis_retos()', 'mis_logros()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
