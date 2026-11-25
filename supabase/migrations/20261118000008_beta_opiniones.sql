-- © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
-- FORJA BETA · migración 8: opiniones y reportes de errores de la beta.
-- Es SOLO ADITIVA e idempotente (se puede volver a aplicar): añade una tabla y una función; no cambia ni borra nada de las migraciones 1-7.
-- NO aplicada todavía en ningún proyecto de Supabase (se aplicará solo en el proyecto de producción, con autorización).
--
-- Cómo se usa (revisión semanal, desde el panel de Supabase con la sesión del propietario, que no pasa por RLS):
--   select estado, gravedad, tipo, count(*) as personas
--     from public.beta_opiniones where estado in ('nueva','confirmada','en-curso') group by 1,2,3 order by gravedad nulls first, personas desc;
--   gravedad: 1 = pérdida de datos o seguridad/dolor (arreglo inmediato) · 2 = impide entrenar · 3 = molestia · 4 = sugerencia.
--   estado:   nueva → confirmada → en-curso → publicada → avisada (o descartada).

create table if not exists public.beta_opiniones (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade, -- al borrar la cuenta se borran sus opiniones
  tipo      text not null check (tipo in ('error', 'entreno', 'sugerencia', 'valoracion')),
  estrellas smallint check (estrellas between 1 and 5),
  texto     text not null default '' check (char_length(texto) <= 2000),
  version   text not null check (version ~ '^[0-9A-Za-z.+-]{1,40}$'),
  tecnico   jsonb not null default '{}'::jsonb check (jsonb_typeof(tecnico) = 'object' and pg_column_size(tecnico) <= 2048),
  datos     jsonb check (datos is null or (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 2048)), -- solo si la persona lo marcó
  estado    text not null default 'nueva' check (estado in ('nueva', 'confirmada', 'en-curso', 'publicada', 'avisada', 'descartada')),
  gravedad  smallint check (gravedad between 1 and 4),
  creado    timestamptz not null default now(),
  constraint opinion_con_contenido check (char_length(btrim(texto)) >= 5 or (tipo = 'valoracion' and estrellas is not null))
);

-- Nadie la lee ni la escribe directamente desde la app: RLS activado y SIN políticas (todo denegado); solo la función de abajo.
alter table public.beta_opiniones enable row level security;
revoke all on public.beta_opiniones from public, anon, authenticated;
create index if not exists beta_opiniones_estado_idx on public.beta_opiniones (estado, creado desc);

create or replace function public.enviar_opinion(
  p_tipo text,
  p_texto text,
  p_estrellas smallint,
  p_version text,
  p_tecnico jsonb,
  p_datos jsonb default null
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
  -- límite por persona: 10 al día (protege de spam y de llenar la base)
  perform privado.limitar('opinion', 10, interval '1 day');
  insert into public.beta_opiniones (user_id, tipo, estrellas, texto, version, tecnico, datos)
  values (yo, p_tipo, p_estrellas, btrim(coalesce(p_texto, '')), p_version, coalesce(p_tecnico, '{}'::jsonb), p_datos)
  returning id into nueva;
  return nueva;
end $$;

revoke all on function public.enviar_opinion(text, text, smallint, text, jsonb, jsonb) from public, anon;
grant execute on function public.enviar_opinion(text, text, smallint, text, jsonb, jsonb) to authenticated;
