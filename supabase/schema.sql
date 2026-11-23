-- =====================================================================
-- ULI 23 - Esquema de Supabase (version 3: con panel de admin)
-- Ejecutar completo en: Supabase > SQL Editor > New query > Run
--
-- Si ya habias ejecutado la version 1, primero ejecuta esto aparte
-- (borra regalos y reservas de prueba, no borra usuarios):
--   drop table if exists public.reservas, public.regalos, public.secciones cascade;
--   drop function if exists public.listar_regalos();
--   drop function if exists public.soltar_regalo();
--
-- Reglas de regalos:
--   exclusivo  -> solo una persona lo puede guardar, y cada persona
--                 solo puede tener UN regalo exclusivo a la vez.
--   compartido -> lo puede guardar cualquier persona (Gratis, Tu consigue
--                 el mejor precio, pilas) y no cuenta para el limite.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. PERFIL DE ADMIN  >>> CAMBIA ESTE CORREO POR EL TUYO <<<
--    Quien se registre con un correo de esta lista entra como admin
--    automaticamente. Puedes poner mas de uno (una linea por correo).
-- ---------------------------------------------------------------------

create table if not exists public.admins_permitidos (
  email text primary key check (email = lower(email))
);

insert into public.admins_permitidos (email) values
  ('tu_correo@ejemplo.com')            -- <<< CAMBIA ESTO (en minusculas)
on conflict (email) do nothing;


-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  usuario    text not null unique check (usuario ~ '^[a-z0-9_.]{3,20}$'),
  nombre     text not null default '',
  es_admin   boolean not null default false,
  creado_en  timestamptz not null default now()
);

create table if not exists public.secciones (
  id           smallint generated always as identity primary key,
  slug         text not null unique,
  nombre       text not null,
  subtitulo    text not null default '',
  icono        text not null default 'fa-solid fa-gift',  -- clase de Font Awesome
  color_fondo  text not null default '#fff3c2',
  color_icono  text not null default '#f0b400',
  color_texto  text not null default '#000814',
  presupuesto  integer,                                    -- tope de la categoria, null = sin tope
  orden        smallint not null default 0
);

create table if not exists public.regalos (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  seccion_id   smallint references public.secciones(id) on delete set null,
  tipo         text not null default 'exclusivo' check (tipo in ('exclusivo', 'compartido')),
  nombre       text not null,
  descripcion  text not null default '',
  precio       numeric(10,2) check (precio is null or precio >= 0),  -- null = "tu decides"
  imagen_url   text,
  enlace_url   text,
  tienda       text,
  talla        text,
  nota         text,
  activo       boolean not null default true,
  orden        integer not null default 0,
  creado_en    timestamptz not null default now()
);

create table if not exists public.reservas (
  id          uuid primary key default gen_random_uuid(),
  regalo_id   uuid not null references public.regalos(id) on delete cascade,
  usuario_id  uuid not null references public.perfiles(id) on delete cascade,
  exclusivo   boolean not null,
  creado_en   timestamptz not null default now(),
  unique (regalo_id, usuario_id)
);

-- Un regalo exclusivo solo lo tiene una persona
create unique index if not exists reservas_regalo_exclusivo_idx
  on public.reservas (regalo_id) where exclusivo;

-- Cada persona solo tiene un regalo exclusivo a la vez
create unique index if not exists reservas_usuario_exclusivo_idx
  on public.reservas (usuario_id) where exclusivo;

create index if not exists regalos_seccion_idx on public.regalos(seccion_id);


-- ---------------------------------------------------------------------
-- 2. TRIGGER: crear el perfil al registrarse
-- ---------------------------------------------------------------------

create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, usuario, nombre, es_admin)
  values (
    new.id,
    lower(trim(new.raw_user_meta_data ->> 'usuario')),
    coalesce(trim(new.raw_user_meta_data ->> 'nombre'), ''),
    exists (select 1 from public.admins_permitidos a where a.email = lower(new.email))
  );
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();


-- ---------------------------------------------------------------------
-- 3. AUXILIAR: saber si quien llama es Ulises (admin)
-- ---------------------------------------------------------------------

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.es_admin from public.perfiles p where p.id = auth.uid()),
    false
  );
$$;


-- ---------------------------------------------------------------------
-- 4. SEGURIDAD (RLS)
-- ---------------------------------------------------------------------

alter table public.perfiles  enable row level security;
alter table public.secciones enable row level security;
alter table public.regalos   enable row level security;
alter table public.reservas  enable row level security;
alter table public.admins_permitidos enable row level security;  -- sin politicas: nadie lo lee desde la pagina

drop policy if exists "perfiles_ver_propio"    on public.perfiles;
drop policy if exists "perfiles_editar_propio" on public.perfiles;
create policy "perfiles_ver_propio" on public.perfiles
  for select to authenticated using (id = auth.uid());
create policy "perfiles_editar_propio" on public.perfiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.perfiles from anon, authenticated;
grant  update (nombre) on public.perfiles to authenticated;

drop policy if exists "secciones_leer"          on public.secciones;
drop policy if exists "secciones_admin_escribe" on public.secciones;
create policy "secciones_leer" on public.secciones
  for select to authenticated using (true);
create policy "secciones_admin_escribe" on public.secciones
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "regalos_leer"          on public.regalos;
drop policy if exists "regalos_admin_escribe" on public.regalos;
create policy "regalos_leer" on public.regalos
  for select to authenticated using (activo or public.es_admin());
create policy "regalos_admin_escribe" on public.regalos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Cada quien ve solo sus reservas. Nadie (ni Ulises) ve las ajenas.
drop policy if exists "reservas_ver_propia" on public.reservas;
create policy "reservas_ver_propia" on public.reservas
  for select to authenticated using (usuario_id = auth.uid());


-- ---------------------------------------------------------------------
-- 5. FUNCIONES QUE USA LA PAGINA (RPC)
-- ---------------------------------------------------------------------

-- 5.1 Usuario libre (registro, sin sesion)
create or replace function public.usuario_disponible(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.perfiles p where p.usuario = lower(trim(p_usuario))
  );
$$;

-- 5.2 Catalogo. estado: disponible | reservado | mio
--     personas: cuantas personas guardaron un regalo compartido (sin nombres)
drop function if exists public.listar_regalos();
create or replace function public.listar_regalos()
returns table (
  id               uuid,
  slug             text,
  seccion_id       smallint,
  seccion_slug     text,
  seccion          text,
  seccion_subtitulo text,
  seccion_icono    text,
  color_fondo      text,
  color_icono      text,
  color_texto      text,
  presupuesto      integer,
  seccion_orden    smallint,
  tipo             text,
  nombre           text,
  descripcion      text,
  precio           numeric,
  imagen_url       text,
  enlace_url       text,
  tienda           text,
  talla            text,
  nota             text,
  orden            integer,
  personas         integer,
  estado           text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id, g.slug, g.seccion_id, s.slug, s.nombre, s.subtitulo, s.icono,
    s.color_fondo, s.color_icono, s.color_texto, s.presupuesto, s.orden,
    g.tipo, g.nombre, g.descripcion, g.precio, g.imagen_url, g.enlace_url,
    g.tienda, g.talla, g.nota, g.orden,
    (select count(*)::int from public.reservas r where r.regalo_id = g.id),
    case
      when exists (select 1 from public.reservas r
                   where r.regalo_id = g.id and r.usuario_id = auth.uid()) then 'mio'
      when g.tipo = 'exclusivo'
       and exists (select 1 from public.reservas r where r.regalo_id = g.id) then 'reservado'
      else 'disponible'
    end
  from public.regalos g
  left join public.secciones s on s.id = g.seccion_id
  where auth.uid() is not null
    and g.activo
  order by s.orden nulls last, g.orden, g.precio nulls last;
$$;

-- 5.3 Guardar un regalo
create or replace function public.reservar_regalo(p_regalo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_tipo       text;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'no_autenticado';
  end if;

  if public.es_admin() then
    raise exception 'admin_no_reserva';
  end if;

  select g.tipo into v_tipo from public.regalos g where g.id = p_regalo_id and g.activo;
  if v_tipo is null then
    raise exception 'regalo_no_existe';
  end if;

  if v_tipo = 'exclusivo'
     and exists (select 1 from public.reservas where usuario_id = v_uid and exclusivo) then
    raise exception 'ya_tienes_regalo';
  end if;

  begin
    insert into public.reservas (regalo_id, usuario_id, exclusivo)
    values (p_regalo_id, v_uid, v_tipo = 'exclusivo');
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'reservas_usuario_exclusivo_idx' then
      raise exception 'ya_tienes_regalo';
    elsif v_constraint = 'reservas_regalo_exclusivo_idx' then
      raise exception 'regalo_tomado';
    else
      raise exception 'ya_lo_guardaste';
    end if;
  end;

  return 'ok';
end;
$$;

-- 5.4 Soltar un regalo (queda libre para otras personas)
drop function if exists public.soltar_regalo();
create or replace function public.soltar_regalo(p_regalo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'no_autenticado';
  end if;

  delete from public.reservas
  where usuario_id = auth.uid() and regalo_id = p_regalo_id;
  return found;
end;
$$;


-- ---------------------------------------------------------------------
-- 5.5 FUNCIONES DE ADMIN (solo cuentas con es_admin = true)
--     Nunca devuelven quien guardo cada regalo.
-- ---------------------------------------------------------------------

-- Todos los regalos, incluidos los ocultos, con su estado
create or replace function public.admin_listar_regalos()
returns table (
  id            uuid,
  slug          text,
  seccion_slug  text,
  seccion       text,
  tipo          text,
  nombre        text,
  descripcion   text,
  precio        numeric,
  imagen_url    text,
  enlace_url    text,
  tienda        text,
  talla         text,
  nota          text,
  activo        boolean,
  orden         integer,
  personas      integer,
  creado_en     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'solo_admin';
  end if;

  return query
  select g.id, g.slug, s.slug, s.nombre, g.tipo, g.nombre, g.descripcion, g.precio,
         g.imagen_url, g.enlace_url, g.tienda, g.talla, g.nota, g.activo, g.orden,
         (select count(*)::int from public.reservas r where r.regalo_id = g.id),
         g.creado_en
  from public.regalos g
  left join public.secciones s on s.id = g.seccion_id
  order by s.orden nulls last, g.orden, g.creado_en;
end;
$$;

-- Agregar (p_id = null) o editar un regalo. Devuelve el id.
create or replace function public.admin_guardar_regalo(
  p_id           uuid,
  p_seccion_slug text,
  p_tipo         text,
  p_nombre       text,
  p_descripcion  text    default '',
  p_precio       numeric default null,
  p_imagen_url   text    default null,
  p_enlace_url   text    default null,
  p_tienda       text    default null,
  p_talla        text    default null,
  p_nota         text    default null,
  p_activo       boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seccion smallint;
  v_slug    text;
  v_id      uuid;
begin
  if not public.es_admin() then
    raise exception 'solo_admin';
  end if;

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'falta_nombre';
  end if;

  if p_tipo not in ('exclusivo', 'compartido') then
    raise exception 'tipo_invalido';
  end if;

  if p_precio is not null and p_precio < 0 then
    raise exception 'precio_invalido';
  end if;

  select s.id into v_seccion from public.secciones s where s.slug = p_seccion_slug;
  if v_seccion is null then
    raise exception 'seccion_no_existe';
  end if;

  if p_id is null then
    -- slug a partir del nombre: minusculas, sin acentos, con guiones
    v_slug := trim(both '-' from regexp_replace(
                translate(lower(trim(p_nombre)), 'áéíóúüñ', 'aeiouun'),
                '[^a-z0-9]+', '-', 'g'));
    if v_slug = '' then v_slug := 'regalo'; end if;
    v_slug := left(v_slug, 48);
    if exists (select 1 from public.regalos where slug = v_slug) then
      v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
    end if;

    insert into public.regalos (slug, seccion_id, tipo, nombre, descripcion, precio,
                                imagen_url, enlace_url, tienda, talla, nota, activo, orden)
    values (v_slug, v_seccion, p_tipo, trim(p_nombre), coalesce(p_descripcion, ''), p_precio,
            nullif(trim(p_imagen_url), ''), nullif(trim(p_enlace_url), ''),
            nullif(trim(p_tienda), ''), nullif(trim(p_talla), ''), nullif(trim(p_nota), ''),
            coalesce(p_activo, true),
            coalesce((select max(g.orden) + 1 from public.regalos g where g.seccion_id = v_seccion), 1))
    returning id into v_id;
  else
    -- No se puede volver exclusivo un regalo que ya guardaron 2 o mas personas
    if p_tipo = 'exclusivo'
       and (select count(*) from public.reservas r where r.regalo_id = p_id) > 1 then
      raise exception 'ya_lo_guardaron_varios';
    end if;

    update public.regalos g set
      seccion_id  = v_seccion,
      tipo        = p_tipo,
      nombre      = trim(p_nombre),
      descripcion = coalesce(p_descripcion, ''),
      precio      = p_precio,
      imagen_url  = nullif(trim(p_imagen_url), ''),
      enlace_url  = nullif(trim(p_enlace_url), ''),
      tienda      = nullif(trim(p_tienda), ''),
      talla       = nullif(trim(p_talla), ''),
      nota        = nullif(trim(p_nota), ''),
      activo      = coalesce(p_activo, true)
    where g.id = p_id
    returning g.id into v_id;

    if v_id is null then
      raise exception 'regalo_no_existe';
    end if;

    -- Si cambio el tipo, actualizar las reservas existentes
    update public.reservas r set exclusivo = (p_tipo = 'exclusivo') where r.regalo_id = p_id;
  end if;

  return v_id;
end;
$$;

-- Ocultar o mostrar un regalo sin borrarlo
create or replace function public.admin_cambiar_activo(p_id uuid, p_activo boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'solo_admin';
  end if;
  update public.regalos set activo = p_activo where id = p_id;
  return found;
end;
$$;

-- Borrar un regalo (solo si nadie lo ha guardado; si no, mejor ocultarlo)
create or replace function public.admin_eliminar_regalo(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'solo_admin';
  end if;
  if exists (select 1 from public.reservas where regalo_id = p_id) then
    raise exception 'tiene_reservas';
  end if;
  delete from public.regalos where id = p_id;
  return found;
end;
$$;

-- Numeros generales para el panel (sin nombres)
create or replace function public.admin_resumen()
returns table (
  personas_registradas   integer,
  exclusivos_total       integer,
  exclusivos_apartados   integer,
  compartidos_guardados  integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'solo_admin';
  end if;
  return query
  select
    (select count(*)::int from public.perfiles where not es_admin),
    (select count(*)::int from public.regalos where activo and tipo = 'exclusivo'),
    (select count(*)::int from public.reservas where exclusivo),
    (select count(*)::int from public.reservas where not exclusivo);
end;
$$;


-- ---------------------------------------------------------------------
-- 6. PERMISOS DE LAS FUNCIONES
-- ---------------------------------------------------------------------

revoke execute on function public.crear_perfil()            from public, anon, authenticated;
revoke execute on function public.es_admin()                from public, anon;
grant  execute on function public.es_admin()                to authenticated;
revoke execute on function public.usuario_disponible(text)  from public;
grant  execute on function public.usuario_disponible(text)  to anon, authenticated;
revoke execute on function public.listar_regalos()          from public, anon;
grant  execute on function public.listar_regalos()          to authenticated;
revoke execute on function public.reservar_regalo(uuid)     from public, anon;
grant  execute on function public.reservar_regalo(uuid)     to authenticated;
revoke execute on function public.soltar_regalo(uuid)       from public, anon;
grant  execute on function public.soltar_regalo(uuid)       to authenticated;
revoke execute on function public.admin_listar_regalos()        from public, anon;
grant  execute on function public.admin_listar_regalos()        to authenticated;
revoke execute on function public.admin_guardar_regalo(uuid, text, text, text, text, numeric, text, text, text, text, text, boolean) from public, anon;
grant  execute on function public.admin_guardar_regalo(uuid, text, text, text, text, numeric, text, text, text, text, text, boolean) to authenticated;
revoke execute on function public.admin_cambiar_activo(uuid, boolean) from public, anon;
grant  execute on function public.admin_cambiar_activo(uuid, boolean) to authenticated;
revoke execute on function public.admin_eliminar_regalo(uuid)   from public, anon;
grant  execute on function public.admin_eliminar_regalo(uuid)   to authenticated;
revoke execute on function public.admin_resumen()               from public, anon;
grant  execute on function public.admin_resumen()               to authenticated;


-- ---------------------------------------------------------------------
-- 7. STORAGE: bucket publico para fotos de regalos (solo Ulises sube;
--    la Edge Function extraer-producto sube con service role)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('regalos', 'regalos', true)
on conflict (id) do nothing;

drop policy if exists "regalos_img_admin_sube"  on storage.objects;
drop policy if exists "regalos_img_admin_edita" on storage.objects;
drop policy if exists "regalos_img_admin_borra" on storage.objects;
create policy "regalos_img_admin_sube" on storage.objects
  for insert to authenticated with check (bucket_id = 'regalos' and public.es_admin());
create policy "regalos_img_admin_edita" on storage.objects
  for update to authenticated using (bucket_id = 'regalos' and public.es_admin());
create policy "regalos_img_admin_borra" on storage.objects
  for delete to authenticated using (bucket_id = 'regalos' and public.es_admin());


-- ---------------------------------------------------------------------
-- 8. CATALOGO DE ULISES (8 secciones, 37 regalos)
--    Precio e imagen quedan vacios: los llena el archivo
--    actualizar-regalos.sql que genera scripts/extraer-productos.mjs
-- ---------------------------------------------------------------------

insert into public.secciones (slug, nombre, subtitulo, icono, color_fondo, color_icono, color_texto, presupuesto, orden) values
  ('gratis', 'Gratis', 'Cualquiera lo puede guardar, y aun así puedes apartar otro regalo', 'fa-solid fa-hand-holding-heart', '#ffe3ec', '#e0457b', '#6b1230', 0, 1),
  ('mejor-precio', 'Tú consigue el mejor precio', 'Cosas que quiero, cómpralas donde quieras', 'fa-solid fa-magnifying-glass-dollar', '#dff5f1', '#129c87', '#0b4f45', null, 2),
  ('cien', 'No me queda nadaaaaaaa', 'Hasta $100', 'fa-solid fa-coins', '#fff3c2', '#f0b400', '#5a4200', 100, 3),
  ('doscientos', 'Presupuesto estudihambre', 'Hasta $200', 'fa-solid fa-bowl-rice', '#e2edff', '#2f6fd6', '#0f2f66', 200, 4),
  ('trescientos', 'Presupuesto mini adulto', 'Hasta $300', 'fa-solid fa-mug-hot', '#efe6ff', '#7b4fd0', '#35206b', 300, 5),
  ('quinientos', 'Mini adulto', 'Hasta $500', 'fa-solid fa-briefcase', '#ffe6da', '#e5602f', '#6b2410', 500, 6),
  ('mil', 'Adulto pro max', 'Hasta $1,000', 'fa-solid fa-crown', '#003566', '#1f5c99', '#ffd60a', 1000, 7),
  ('sugar-daddy', 'Sugar daddy, POR FAVOR ALGUIEN', 'Más de $1,000', 'fa-solid fa-gem', '#ffc300', '#ffe17a', '#000814', null, 8)
on conflict (slug) do update set nombre = excluded.nombre, subtitulo = excluded.subtitulo, icono = excluded.icono,
  color_fondo = excluded.color_fondo, color_icono = excluded.color_icono, color_texto = excluded.color_texto,
  presupuesto = excluded.presupuesto, orden = excluded.orden;

insert into public.regalos (slug, seccion_id, tipo, nombre, descripcion, precio, enlace_url, tienda, talla, nota, orden)
select v.slug, s.id, v.tipo, v.nombre, coalesce(v.descripcion, ''), v.precio::numeric, v.enlace, v.tienda, v.talla, v.nota, v.orden
from (values
  ('carta', 'gratis', 'compartido', 'Carta', 'Escríbeme una carta a mano. Larga, corta o con dibujitos.', 0, null, null, null, null, 1),
  ('foto-impresa', 'gratis', 'compartido', 'Foto impresa de nosotros', 'Una foto nuestra impresa, con la fecha y el título del recuerdo.', 0, null, null, null, null, 2),
  ('abrazo', 'gratis', 'compartido', 'Abrazo de 1 minuto', 'Cuando me veas. Un minuto completo, sin soltar.', 0, null, null, null, null, 3),
  ('calcetas', 'mejor-precio', 'compartido', 'Calcetas', 'Las que encuentres bonitas.', null, null, null, null, null, 1),
  ('lilies-rosas', 'mejor-precio', 'compartido', 'Flores', 'Lilies rosas, de preferencia.', null, null, null, null, null, 2),
  ('topper-cristal', 'mejor-precio', 'compartido', 'Topper de cristal', 'Un topper de vidrio para la comida.', null, null, null, null, 'Ideal para familia', 3),
  ('lentes-de-sol', 'mejor-precio', 'compartido', 'Lentes de sol', 'Los que sea, no tengo.', null, null, null, null, null, 4),
  ('tarjeta-amazon', 'mejor-precio', 'compartido', 'Tarjeta de regalo Amazon', 'Lo que caiga.', null, null, 'Amazon', null, null, 5),
  ('sueter-ofi', 'mejor-precio', 'compartido', 'Suéter para la ofi', 'Para sobrevivir al aire acondicionado. Regalos godínez.', null, null, null, 'CH', null, 6),
  ('tu-libro-favorito', 'mejor-precio', 'compartido', 'Tu libro favorito', 'El que tú más quieras, para leerlo pensando en ti.', null, null, null, null, null, 7),
  ('mango-chilim-balam', 'cien', 'exclusivo', 'Mango Chilim Balam', 'Rebanadas de mango deshidratado cubiertas de chilito Chilim Balam.', null, 'https://www.amazon.com.mx/dp/B0GVKMBFH9', 'Amazon', null, null, 1),
  ('pilas-camarita', 'cien', 'compartido', 'Pilas para mi camarita', 'Pilas AA alcalinas Duracell. Nunca sobran.', null, 'https://www.amazon.com.mx/dp/B000N8RUIO', 'Amazon', null, 'Varias personas pueden regalarlas', 2),
  ('calcetines-hike-100', 'doscientos', 'exclusivo', 'Calcetines Hike 100', 'Paquete de 2 pares de calcetines bajos de senderismo Quechua, negros.', null, 'https://www.decathlon.com.mx/p/calcetines-hike-100-low-negro-pqt-de-2-pares/334386/c382m8649546', 'Decathlon', null, null, 1),
  ('playera-surf-uv', 'doscientos', 'exclusivo', 'Playera surf anti UV', 'Playera anti UV de manga corta, negra.', null, 'https://www.decathlon.com.mx/p/playera-de-surf-anti-uv-de-manga-corta-negra-para-hombre/342022/c382m8787286', 'Decathlon', 'CH', null, 2),
  ('poncho-forclaz', 'doscientos', 'exclusivo', 'Poncho para la lluvia', 'Poncho impermeable Forclaz MT50, gris; cubre una mochila de hasta 10 L.', null, 'https://www.decathlon.com.mx/p/poncho-para-la-lluvia-de-senderismo-forclaz-mt-50-10-l-gris/339021/c231m8737843', 'Decathlon', 'CH', null, 3),
  ('playera-mh100', 'doscientos', 'exclusivo', 'Playera senderismo MH100', 'Playera sintética de secado rápido para caminar.', null, 'https://www.decathlon.com.mx/p/playera-de-senderismo-de-manga-corta-sintetica-para-hombre-mh100/106632/c71m8316244', 'Decathlon', 'CH', null, 4),
  ('ensayos-montaigne', 'doscientos', 'exclusivo', 'Ensayos, Montaigne', 'Antología de los Ensayos de Michel de Montaigne.', null, 'https://www.amazon.com.mx/dp/6073940890', 'Amazon', null, null, 5),
  ('1984-orwell', 'doscientos', 'exclusivo', '1984, Orwell', 'La novela distópica de George Orwell.', null, 'https://www.amazon.com.mx/dp/B00BFGQYRQ?th=1', 'Amazon', null, 'Confirmar que sea libro físico', 6),
  ('intermitencias-muerte', 'doscientos', 'exclusivo', 'Las intermitencias de la muerte', 'Novela de José Saramago: un día la muerte deja de matar.', null, 'https://www.amazon.com.mx/dp/607313908X', 'Amazon', null, null, 7),
  ('clip-lentes-polarizado', 'doscientos', 'exclusivo', 'Clip polarizado para lentes', 'Clip polarizado categoría 3 que se pone sobre los lentes de vista.', null, 'https://www.decathlon.com.mx/p/clip-adaptable-a-las-lentes-de-vista-mh-otg-120-large-polarizado-categoria-3/11778/c344c344m8583028', 'Decathlon', null, null, 8),
  ('pasteles-oleo-mungyo', 'trescientos', 'exclusivo', 'Pasteles al óleo Mungyo', 'Set de pasteles al óleo en colores surtidos.', null, 'https://www.amazon.com.mx/dp/B08L4GTJ2J?th=1', 'Amazon', null, null, 1),
  ('ensayo-ceguera', 'trescientos', 'exclusivo', 'Ensayo sobre la ceguera', 'Novela de José Saramago sobre una epidemia de ceguera blanca.', null, 'https://www.amazon.com.mx/dp/607313911X', 'Amazon', null, null, 2),
  ('isdin-fusion-water', 'trescientos', 'exclusivo', 'Protector solar ISDIN', 'Protector solar facial Fusion Water FPS 50.', null, 'https://www.amazon.com.mx/dp/B01LX98VOO', 'Amazon', null, null, 3),
  ('hm-1242812006', 'trescientos', 'exclusivo', 'Prenda H&M', null, null, 'https://www2.hm.com/es_mx/productpage.1242812006.html', 'H&M', 'CH', null, 4),
  ('hm-1242812038', 'trescientos', 'exclusivo', 'Prenda H&M', null, null, 'https://www2.hm.com/es_mx/productpage.1242812038.html', 'H&M', 'CH', null, 5),
  ('hombre-duplicado', 'trescientos', 'exclusivo', 'El hombre duplicado', 'Novela de José Saramago: un hombre descubre a alguien idéntico a él.', null, 'https://www.amazon.com.mx/dp/6073139950', 'Amazon', null, null, 6),
  ('playera-kiprun-uv', 'trescientos', 'exclusivo', 'Playera running Kiprun UV', 'Playera de running de manga larga con protección UV, azul gris.', null, 'https://www.decathlon.com.mx/p/playera-manga-larga-running-anti-uv-hombre-kiprun-dry-500-uv-azul-gris/346758/c246m8817441', 'Decathlon', 'CH', null, 7),
  ('hm-1257590012', 'quinientos', 'exclusivo', 'Prenda H&M', null, null, 'https://www2.hm.com/es_mx/productpage.1257590012.html', 'H&M', 'CH', null, 1),
  ('playera-uv-900', 'quinientos', 'exclusivo', 'Playera anti UV 900', 'Playera anti UV de manga larga, negra.', null, 'https://www.decathlon.com.mx/p/playera-anti-uv-de-manga-larga-negra-para-hombre-900/325552/c1c71m8611974', 'Decathlon', 'CH o M', null, 2),
  ('lentes-roadr-900', 'quinientos', 'exclusivo', 'Lentes Roadr 900', 'Lentes deportivos de ciclismo Roadr 900 Perf, blancos, categoría 3.', null, 'https://www.decathlon.com.mx/p/lentes-ciclismo-roadr-900-perf-adulto-blanco-categoria-3/350607/c227m8843677', 'Decathlon', null, null, 3),
  ('pantalon-zara', 'mil', 'exclusivo', 'Pantalón acampanado Zara', 'Pantalón acampanado de vestir, fit traje.', null, 'https://www.zara.com/mx/es/pantalon-acampanado-fit-traje-p04682644.html?v1=577368845&v2=2432084', 'Zara', '30', null, 1),
  ('chamarra-bershka', 'mil', 'exclusivo', 'Chamarra efecto piel', 'Chamarra boxy efecto piel de Bershka.', null, 'https://www.bershka.com/mx/cazadora-boxy-efecto-piel-c0p242077250.html?colorId=606&stylismId=3', 'Bershka', 'CH', null, 2),
  ('lego-ramo-rosa', 'mil', 'exclusivo', 'Ramo LEGO de flores rosas', 'Ramo de flores rosas de LEGO Botanicals para armar.', null, 'https://www.lego.com/es-mx/product/pretty-pink-flower-bouquet-10342', 'LEGO', null, null, 3),
  ('tren-medianoche', 'mil', 'exclusivo', 'El tren de la medianoche', 'Novela de Matt Haig, pasta dura.', null, 'https://www.mercadolibre.com.mx/el-tren-de-la-medianoche-haig-matt-adn-tapa-dura/p/MLM74575881', 'Mercado Libre', null, null, 4),
  ('pasteles-staedtler-48', 'mil', 'exclusivo', 'Pasteles Staedtler 48', 'Pasteles en barra Staedtler, caja de 48 colores.', null, 'https://lumen.com.mx/pastel-en-barra-staedtler-con-48-sku-353172', 'Lumen', null, null, 5),
  ('olend-folded-bag', 'sugar-daddy', 'exclusivo', 'Folded Bag de Ölend', 'Bolsa de piel vegana repelente al agua; se usa como tote, crossbody o mochila.', null, 'https://www.olend.net/products/folded-bag?variant=55528407990607', 'Ölend', null, null, 1),
  ('disco-adata-hd710p', 'sugar-daddy', 'exclusivo', 'Disco duro ADATA HD710P', 'Disco duro externo resistente a golpes y agua.', null, 'https://www.amazon.com.mx/dp/B074J9131V?th=1', 'Amazon', null, null, 2)
) as v(slug, seccion_slug, tipo, nombre, descripcion, precio, enlace, tienda, talla, nota, orden)
join public.secciones s on s.slug = v.seccion_slug
on conflict (slug) do nothing;


-- ---------------------------------------------------------------------
-- 9. ADMIN PARA CUENTAS QUE YA EXISTIAN
--    Si ya te habias registrado antes de poner tu correo arriba, esto te
--    vuelve admin. Se puede ejecutar las veces que quieras.
-- ---------------------------------------------------------------------
update public.perfiles p
set es_admin = true
from auth.users u
where u.id = p.id
  and lower(u.email) in (select email from public.admins_permitidos);


-- ---------------------------------------------------------------------
-- 10. SOLO PARA QUIEN ORGANIZA (spoiler: dice quien guardo que)
-- ---------------------------------------------------------------------
-- select p.nombre, p.usuario, g.nombre as regalo, g.tipo, r.creado_en
-- from public.reservas r
-- join public.perfiles p on p.id = r.usuario_id
-- join public.regalos  g on g.id = r.regalo_id
-- order by g.nombre, r.creado_en;
