-- © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
-- Comprobaciones de SOLO LECTURA para el proyecto de PRODUCCIÓN, después de aplicar las migraciones 1-9.
-- No cambia nada. Cada fila debe tener estado OK. Se prueba también contra un Postgres real en memoria con las migraciones
-- reales (supabase/pruebas/verificacion.test.mjs) para que lo que aquí se espera sea exactamente lo que dan las migraciones.
-- Uso: Supabase → SQL Editor del proyecto de producción → pegar → Run (o lo ejecuta el asistente con execute_sql, solo lectura).
select n, comprobacion, resultado, esperado, case when resultado = esperado then 'OK' else 'REVISAR' end as estado
from (
  select 1 as n, 'Tablas en public (11 de la base + opiniones)' as comprobacion,
         (select count(*) from pg_tables where schemaname = 'public')::text as resultado, '12' as esperado
  union all select 2, 'Tablas de public sin RLS (debe ser 0)',
         (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity)::text, '0'
  union all select 3, 'Funciones SECURITY DEFINER sin search_path vacío (public y privado; debe ser 0)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'privado') and p.prosecdef and not coalesce('search_path=""' = any(p.proconfig), false))::text, '0'
  union all select 4, 'Funciones de public que puede ejecutar anon (debe ser 0)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute'))::text, '0'
  union all select 5, 'La API (anon y authenticated) puede usar el esquema privado (debe ser false)',
         (has_schema_privilege('anon', 'privado', 'usage') or has_schema_privilege('authenticated', 'privado', 'usage'))::text, 'false'
  union all select 6, 'Funciones de privado que puede ejecutar anon o authenticated (debe ser 0)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'privado' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')))::text, '0'
  union all select 7, 'anon puede leer o escribir alguna tabla de public (debe ser 0)',
         (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
           and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
             or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete')))::text, '0'
  union all select 8, 'authenticated puede tocar beta_opiniones directamente (debe ser false)',
         (has_table_privilege('authenticated', 'public.beta_opiniones', 'select') or has_table_privilege('authenticated', 'public.beta_opiniones', 'insert')
           or has_table_privilege('authenticated', 'public.beta_opiniones', 'update') or has_table_privilege('authenticated', 'public.beta_opiniones', 'delete'))::text, 'false'
  union all select 9, 'authenticated puede ejecutar enviar_opinion (debe ser true)',
         has_function_privilege('authenticated', 'public.enviar_opinion(text,text,smallint,text,jsonb,jsonb,text)', 'execute')::text, 'true'
  union all select 10, 'anon puede ejecutar enviar_opinion (debe ser false)',
         has_function_privilege('anon', 'public.enviar_opinion(text,text,smallint,text,jsonb,jsonb,text)', 'execute')::text, 'false'
  union all select 11, 'Existe el límite de 3 MB por usuario en datos_usuario',
         exists (select 1 from pg_constraint where conname = 'datos_tamano' and conrelid = 'public.datos_usuario'::regclass)::text, 'true'
  union all select 12, 'Existe el disparador que crea el perfil al registrarse (auth.users)',
         exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal)::text, 'true'
  union all select 13, 'pg_graphql instalado (en forja-dev está desinstalado; debe ser 0 para no tener una segunda vía de acceso)',
         (select count(*) from pg_extension where extname = 'pg_graphql')::text, '0'
  union all select 14, 'Funciones propias en public (23 = 21 de las migraciones 1-7 + enviar_opinion + mis_adjuntos_usados)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f')::text, '23'
  union all select 15, 'Bucket de capturas: existe, es PRIVADO, 2 MB y solo JPG/PNG/WebP (debe ser 1)',
         (select count(*) from storage.buckets where id = 'opiniones-adjuntos' and not public and file_size_limit = 2097152
            and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp'] and array_length(allowed_mime_types, 1) = 3)::text, '1'
  union all select 16, 'Políticas de storage.objects del bucket de capturas: solo 1, de INSERT y para authenticated (debe ser 1/1)',
         (select count(*) || '/' || count(*) filter (where cmd = 'INSERT' and roles = '{authenticated}')
            from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and (coalesce(qual, '') like '%opiniones-adjuntos%' or coalesce(with_check, '') like '%opiniones-adjuntos%')), '1/1'
  union all select 17, 'Políticas de storage.objects que permiten LEER, cambiar o borrar (SELECT/UPDATE/DELETE/ALL) (debe ser 0)',
         (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL'))::text, '0'
  union all select 18, 'Existe el disparador que avisa de las opiniones nuevas',
         exists (select 1 from pg_trigger where tgrelid = 'public.beta_opiniones'::regclass and tgname = 'aviso_opinion_nueva' and not tgisinternal)::text, 'true'
) c
order by n;

-- Solo en el proyecto real (no existe en la base de pruebas): historial de migraciones. Debe haber 9 filas, en este orden:
-- base_perfiles, base_datos, base_borrar_cuenta, arena, arena_acciones, arena_permisos, seguridad, beta_opiniones, opiniones_avisos_y_capturas.
--   select version, name from supabase_migrations.schema_migrations order by version;
-- Informativo: límites de tiempo por consulta (Supabase los pone por defecto: anon 3 s, authenticated 8 s).
--   select rolname, rolconfig from pg_roles where rolname in ('anon', 'authenticated');
