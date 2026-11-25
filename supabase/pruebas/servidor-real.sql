-- © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
-- Prueba de ARENA contra el servidor REAL (forja-dev) sin dejar rastro: crea 3 usuarios ficticios
-- (@forja.invalid), recorre el flujo completo y termina con un error a propósito, de modo que
-- Postgres DESHACE todo. El resultado aparece en el texto del error («RESULTADO …»).
-- Uso: pegar en Supabase → SQL Editor del proyecto de DESARROLLO y ejecutar. Nunca en producción.
-- Resultado esperado (13/11/2026): perfiles=3; records=1; reenvio nuevo=false; futuro y antiguo
-- rechazados; tabla actividad cerrada; ben ve datos ajenos=0; ficha protegida;
-- ranking[Ana Prueba:15 pts, Ben Prueba:0 pts]; meta trivial rechazada; retos=1 progreso_ana=1;
-- caro ranking filas=1; caro retos=0; anon bloqueado.
do $$
declare
  ana uuid := gen_random_uuid(); ben uuid := gen_random_uuid(); caro uuid := gen_random_uuid();
  r text := ''; x jsonb; t text; n int; cod_ana text; reto uuid;
begin
  insert into auth.users (id, email, aud, role) values (ana, 'prueba-ana@forja.invalid', 'authenticated', 'authenticated'), (ben, 'prueba-ben@forja.invalid', 'authenticated', 'authenticated'), (caro, 'prueba-caro@forja.invalid', 'authenticated', 'authenticated');
  select count(*) into n from public.perfiles where id in (ana, ben, caro);
  select codigo into cod_ana from public.perfiles where id = ana;
  r := r || format('perfiles=%s codigo=%s; ', n, cod_ana);

  perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  x := public.actualizar_perfil(p_apodo => 'Ana Prueba', p_dias_objetivo => 3);
  x := public.registrar_entreno('a1', current_date, 45, 15, false, '[{"e":"press banca","kg":60}]');
  x := public.registrar_entreno('a2', current_date, 45, 15, false, '[{"e":"press banca","kg":66}]');
  r := r || format('2do entreno mismo dia records=%s; ', x->>'records');
  x := public.registrar_entreno('a2', current_date, 45, 15, false, '[]');
  r := r || format('reenvio nuevo=%s; ', x->>'nuevo');
  begin x := public.registrar_entreno('fut', current_date + 5, 45, 15); r := r || 'FALLO futuro aceptado; ';
  exception when others then r := r || 'futuro rechazado; '; end;
  begin x := public.registrar_entreno('vie', current_date - 9, 45, 15); r := r || 'FALLO antiguo aceptado; ';
  exception when others then r := r || 'antiguo rechazado; '; end;
  begin perform 1 from public.actividad; r := r || 'FALLO lectura directa; ';
  exception when others then r := r || 'tabla actividad cerrada; '; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', ben, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  x := public.actualizar_perfil(p_apodo => 'Ben Prueba', p_dias_objetivo => 3);
  t := public.solicitar_amistad(p_codigo => cod_ana);
  r := r || format('solicitud=%s; ', t);
  select count(*) into n from public.datos_usuario;
  r := r || format('ben ve datos ajenos=%s; ', n);
  begin x := public.perfil_amigo(ana); r := r || 'FALLO ficha sin ser amigos; ';
  exception when others then r := r || 'ficha protegida; '; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', ana, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  t := public.responder_amistad(ben, true);
  select string_agg(format('%s:%s pts', apodo, puntos), ', ' order by puntos desc) into t from public.ranking('semana', 'puntos');
  r := r || format('ranking[%s]; ', t);
  begin reto := public.crear_reto('Duelo', 'individual', 7, 'entrenos', 1, array[ben]); r := r || 'FALLO meta trivial aceptada; ';
  exception when others then r := r || 'meta trivial rechazada; '; end;
  reto := public.crear_reto('Semana de prueba', 'individual', 7, 'entrenos', 3, array[ben]);
  x := public.mis_retos();
  r := r || format('retos=%s progreso_ana=%s; ', jsonb_array_length(x), x->0->'participantes'->0->>'progreso');
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', caro, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.ranking('semana', 'puntos');
  r := r || format('caro ranking filas=%s; ', n);
  x := public.mis_retos();
  r := r || format('caro retos=%s; ', jsonb_array_length(x));
  execute 'reset role';

  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin perform public.ranking('semana', 'puntos'); r := r || 'FALLO anon ranking; ';
  exception when others then r := r || 'anon bloqueado; '; end;
  execute 'reset role';

  raise exception 'RESULTADO (todo se deshace): %', r;
end $$;
