-- © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
-- FORJA BETA · migración 9: aviso al titular cuando llega una opinión nueva + capturas de pantalla opcionales.
-- NO aplicada todavía en ningún proyecto de Supabase (se aplicará solo en el proyecto de producción, con autorización expresa).
--
-- 1) CAPTURAS (privadas): bucket `opiniones-adjuntos` NO público, 2 MB, solo JPG/PNG/WebP. Permisos MÍNIMOS:
--    · authenticated solo puede SUBIR (INSERT) a su propia carpeta `<su-id>/<uuid>.<jpg|png|webp>`, y como máximo 10 capturas por persona.
--    · NADIE (ni anon ni authenticated) puede leer, listar, sustituir ni borrar por la API: no hay políticas de SELECT, UPDATE ni DELETE.
--      Las ve solo el titular desde el panel de Supabase (o con un enlace firmado temporal que él genere a mano).
--    · La opinión enlaza la captura (`beta_opiniones.adjunto`); la función comprueba que la ruta es de la propia persona y que existe.
-- 2) AVISO: al insertarse una opinión, un disparador llama (con pg_net, de forma asíncrona) a la Edge Function `avisar-opinion`,
--    que manda un correo SIN texto de la opinión, SIN datos de la persona y SIN entrenos. Si falta algo (extensión, secretos o función),
--    el disparador no hace nada y la opinión se guarda igual: el aviso NUNCA bloquea el envío.
--    Los secretos (URL de la función y secreto compartido) viven en Vault, nunca en este archivo.

-- ---------------------------------------------------------------------------
-- Extensión para llamadas HTTP asíncronas (si no se puede crear aquí, se activa desde el panel; el disparador no falla sin ella)
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net no se pudo activar desde la migración (%). Actívala en Database → Extensions.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Capturas: bucket privado y políticas mínimas
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('opiniones-adjuntos', 'opiniones-adjuntos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Cuántas capturas ha subido ya la persona con sesión (la política la necesita: la propia política no puede leer storage.objects).
create or replace function public.mis_adjuntos_usados()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from storage.objects o
  where o.bucket_id = 'opiniones-adjuntos' and (storage.foldername(o.name))[1] = (select auth.uid())::text;
$$;
revoke all on function public.mis_adjuntos_usados() from public, anon;
grant execute on function public.mis_adjuntos_usados() to authenticated;

drop policy if exists "opiniones-adjuntos: subir solo a mi carpeta" on storage.objects;
create policy "opiniones-adjuntos: subir solo a mi carpeta" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'opiniones-adjuntos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$')
    and public.mis_adjuntos_usados() < 10
  );

-- ---------------------------------------------------------------------------
-- Opiniones: enlace a la captura y función con el parámetro nuevo (se sustituye la de 6 parámetros)
-- ---------------------------------------------------------------------------
alter table public.beta_opiniones add column if not exists adjunto text;
alter table public.beta_opiniones drop constraint if exists beta_opiniones_adjunto_largo;
alter table public.beta_opiniones add constraint beta_opiniones_adjunto_largo check (adjunto is null or char_length(adjunto) <= 120);
create unique index if not exists beta_opiniones_adjunto_unico on public.beta_opiniones (adjunto) where adjunto is not null;

drop function if exists public.enviar_opinion(text, text, smallint, text, jsonb, jsonb);
create or replace function public.enviar_opinion(
  p_tipo text,
  p_texto text,
  p_estrellas smallint,
  p_version text,
  p_tecnico jsonb,
  p_datos jsonb default null,
  p_adjunto text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  yo uuid := auth.uid();
  nueva uuid;
begin
  if yo is null then raise exception 'no autenticado' using errcode = '28000'; end if;
  if p_tipo is null or p_tipo not in ('error', 'entreno', 'sugerencia', 'valoracion') then
    raise exception 'tipo de opinión no válido' using errcode = '22023';
  end if;
  if p_estrellas is not null and p_estrellas not between 1 and 5 then
    raise exception 'valoración no válida' using errcode = '22023';
  end if;
  if char_length(coalesce(p_texto, '')) > 2000 then
    raise exception 'mensaje demasiado largo' using errcode = '22023';
  end if;
  if coalesce(p_version, '') !~ '^[0-9A-Za-z.+-]{1,40}$' then
    raise exception 'versión no válida' using errcode = '22023';
  end if;
  -- La captura, si la hay, tiene que ser de esta persona (carpeta propia, nombre exacto) y tiene que existir de verdad.
  if p_adjunto is not null then
    if p_adjunto !~ ('^' || yo::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$') then
      raise exception 'captura no válida' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'opiniones-adjuntos' and o.name = p_adjunto) then
      raise exception 'captura no encontrada' using errcode = '22023';
    end if;
  end if;
  -- límite por persona: 10 al día (protege de spam y de llenar la base)
  perform privado.limitar('opinion', 10, interval '1 day');
  insert into public.beta_opiniones (user_id, tipo, estrellas, texto, version, tecnico, datos, adjunto)
  values (yo, p_tipo, p_estrellas, btrim(coalesce(p_texto, '')), p_version, coalesce(p_tecnico, '{}'::jsonb), p_datos, p_adjunto)
  returning id into nueva;
  return nueva;
end $$;

revoke all on function public.enviar_opinion(text, text, smallint, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.enviar_opinion(text, text, smallint, text, jsonb, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Aviso de opinión nueva (sin texto, sin datos de la persona, sin entrenos)
-- ---------------------------------------------------------------------------
create or replace function privado.avisar_opinion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secreto text;
begin
  begin
    select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'aviso_opiniones_url';
    select s.decrypted_secret into v_secreto from vault.decrypted_secrets s where s.name = 'aviso_opiniones_secreto';
    if v_url is not null and v_secreto is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-forja-aviso', v_secreto),
        body := jsonb_build_object(
          'id', new.id,
          'tipo', new.tipo,
          'version', new.version,
          'con_adjunto', new.adjunto is not null,
          'creado', new.creado,
          'tabla', 'public.beta_opiniones'::regclass::oid::int
        ),
        timeout_milliseconds := 5000
      );
    end if;
  exception when others then
    null; -- el aviso nunca debe impedir que se guarde la opinión
  end;
  return new;
end $$;
revoke all on function privado.avisar_opinion() from public, anon, authenticated;

drop trigger if exists aviso_opinion_nueva on public.beta_opiniones;
create trigger aviso_opinion_nueva after insert on public.beta_opiniones
  for each row execute function privado.avisar_opinion();
