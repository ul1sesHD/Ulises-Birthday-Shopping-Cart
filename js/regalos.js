// Inicio, categorias, tarjetas, detalle, guardar y soltar, y mis regalos.
import { supabase, codigoError } from './supabase.js';
import { $, $$, escapar, textoPrecio, estiloCategoria, imagenRegalo, modal, toast, observarRevelar, movimientoReducido } from './ui.js';
import { htmlCalendario } from './calendario.js';
import { colocarStickers } from './stickers.js';
import { mostrarGracias } from './gracias.js';
import { app, ir, render } from './router.js';

// ---------- Datos ----------

let cache = null;

export function olvidarRegalos() { cache = null; }

export async function cargarRegalos(forzar = false) {
  if (cache && !forzar) return cache;
  const { data, error } = await supabase.rpc('listar_regalos');
  if (error) throw error;
  cache = (data || []).map((r) => ({ ...r, precio: r.precio == null ? null : Number(r.precio) }));
  return cache;
}

function agruparSecciones(regalos) {
  const mapa = new Map();
  for (const r of regalos) {
    if (!r.seccion_slug) continue;
    if (!mapa.has(r.seccion_slug)) {
      mapa.set(r.seccion_slug, {
        slug: r.seccion_slug, nombre: r.seccion, subtitulo: r.seccion_subtitulo, icono: r.seccion_icono,
        color_fondo: r.color_fondo, color_icono: r.color_icono, color_texto: r.color_texto,
        presupuesto: r.presupuesto, orden: r.seccion_orden, regalos: [],
      });
    }
    mapa.get(r.seccion_slug).regalos.push(r);
  }
  return [...mapa.values()].sort((a, b) => a.orden - b.orden);
}

const nRegalos = (n) => `${n} ${n === 1 ? 'regalo' : 'regalos'}`;
const disponibles = (regalos) => regalos.filter((r) => r.tipo === 'compartido' || r.estado === 'disponible').length;
// Uli no ve cuantos quedan libres en la vista normal (eso vive en Spoiler)
const textoCuenta = (regalos) => {
  if (app.esAdmin) return nRegalos(regalos.length);
  const n = disponibles(regalos);
  if (!n) return 'Ya apartaron todos';
  return `${n} ${n === 1 ? 'regalo disponible' : 'regalos disponibles'}, ¡aparta el tuyo!`;
};
// Los subtitulos tipo "De $101 a $200" se muestran como cinta de precio
const esRango = (t) => /^\s*(de|más de|hasta)\s+\$/i.test(t || '');
const htmlSub = (s, clase) => esRango(s.subtitulo)
  ? `<span class="cinta cat__rango">${escapar(s.subtitulo)}</span>`
  : `<span class="${clase}">${escapar(s.subtitulo)}</span>`;
const nPersonas = (n) => `${n} ${n === 1 ? 'persona lo guardó' : 'personas lo guardaron'}`;

const MENSAJES = {
  regalo_tomado: 'Alguien se te adelantó con este regalo. Elige otro.',
  ya_tienes_regalo: 'Ya tienes un regalo apartado. Suéltalo para elegir otro.',
  ya_lo_guardaste: 'Ya lo tienes guardado.',
  admin_no_reserva: 'Esta es la cuenta de Uli, no puede guardar regalos.',
  regalo_no_existe: 'Este regalo ya no está disponible.',
  no_autenticado: 'Tu sesión terminó. Vuelve a entrar.',
};

// ---------- Inicio ----------

export async function vistaInicio() {
  const regalos = await cargarRegalos();
  const secciones = agruparSecciones(regalos);
  const c = app.desdeIntro;
  // Bloques que entran en cascada despues de la bienvenida (cierra la clase y abre style)
  const cas = (n) => (c ? `cascada" style="--i:${n}` : '');
  let i = 1;

  const v = $('#vista');
  v.innerHTML = `
    <section class="heading ${cas(i++)}" aria-labelledby="titulo-uli">
      <div class="heading__deco" aria-hidden="true">
        <i class="fa-solid fa-star flotar" style="--dur:5s"></i>
        <i class="fa-solid fa-cake-candles flotar" style="--dur:6s;--retraso:-2s"></i>
        <i class="fa-solid fa-gift flotar" style="--dur:4.5s;--retraso:-1s"></i>
        <i class="fa-solid fa-champagne-glasses flotar" style="--dur:5.5s;--retraso:-3s"></i>
        <i class="fa-solid fa-star flotar" style="--dur:4s;--retraso:-1.5s"></i>
      </div>
      <h1 class="heading__titulo" id="titulo-uli" aria-label="Uli 23">
        <span class="heading__uli" aria-hidden="true">UL<span class="heading__i">I</span></span>
        <span class="heading__num" aria-hidden="true"><span class="heading__num-contorno">23</span><span class="heading__num-solido">23</span></span>
      </h1>
      <figure class="polaroid polaroid--cinta heading__foto">
        <img src="./assets/img/foto-uli.webp" alt="Uli de bebé con gorro de cumpleaños" width="842" height="842" fetchpriority="high">
      </figure>
      <p class="heading__cinta">6 de diciembre 2026</p>
    </section>

    <section class="cal ${c ? cas(i++) : 'revelar'}" aria-label="Calendario de diciembre 2026">${htmlCalendario()}</section>

    <section class="categorias" id="categorias" aria-labelledby="titulo-cat">
      <h2 class="categorias__titulo ${cas(i++)}" id="titulo-cat">Elige tu <span>categoría</span></h2>
      <p class="categorias__mensaje ${cas(i++)}">Porque sé que me amas y <em>maybe</em> hay 0 creatividad, aquí hay muchas ideas a diferentes precios</p>
      <div class="categorias__grid">
        ${secciones.map((s) => `
          <a class="cat${c ? ' cascada' : ''}" href="#/categoria/${encodeURIComponent(s.slug)}" style="${estiloCategoria(s)};--i:${i++}">
            <i class="${escapar(s.icono)} cat__icono" aria-hidden="true"></i>
            <span class="cat__nombre">${escapar(s.nombre)}</span>
            ${htmlSub(s, 'cat__sub')}
            <span class="cat__cuenta"><i class="fa-solid fa-gift" aria-hidden="true"></i>${textoCuenta(s.regalos)}</span>
          </a>`).join('')}
      </div>
      ${secciones.length ? '' : '<div class="vacio"><i class="fa-solid fa-box-open" aria-hidden="true"></i><p>Todavía no hay regalos en la lista.</p></div>'}
    </section>
    <p class="pie">Hecho con cariño para el cumple 23 de Uli</p>`;

  colocarStickers($('.heading', v), 'encabezado');
  colocarStickers($('.cal', v), 'calendario');
  colocarStickers($('.categorias', v), 'categorias');
  observarRevelar(v);

  $('.categorias__grid', v).addEventListener('click', (e) => {
    const a = e.target.closest('.cat');
    if (!a) return;
    const tactil = window.matchMedia('(hover: none)').matches;
    if (!tactil || movimientoReducido()) return;
    e.preventDefault();
    a.classList.add('presionado');
    setTimeout(() => { location.hash = a.getAttribute('href'); }, 500);
  });

  if (location.hash.endsWith('#categorias')) $('#categorias')?.scrollIntoView();
}

// ---------- Categoria ----------

export function htmlTarjeta(r, { espiar = false } = {}) {
  const admin = app.esAdmin;
  // Uli ve todo como disponible, salvo en Spoiler
  const estado = admin && !espiar ? 'disponible' : r.estado;
  const etiquetas = [];
  if (r.talla) etiquetas.push(`<span class="etiqueta"><i class="fa-solid fa-shirt" aria-hidden="true"></i>Talla ${escapar(r.talla)}</span>`);
  if (r.tipo === 'compartido' && r.personas > 0 && (!admin || espiar)) etiquetas.push(`<span class="tarjeta__personas"><i class="fa-solid fa-user-group" aria-hidden="true"></i>${nPersonas(r.personas)}</span>`);
  if (espiar && r.tipo === 'exclusivo') etiquetas.push(`<span class="tarjeta__personas"><i class="fa-solid ${r.personas ? 'fa-lock' : 'fa-lock-open'}" aria-hidden="true"></i>${r.personas ? 'Apartado' : 'Libre'}</span>`);
  return `
    <a class="tarjeta${estado === 'reservado' ? ' tarjeta--reservado' : ''}${estado === 'mio' ? ' tarjeta--mio' : ''} revelar" href="#/regalo/${encodeURIComponent(r.slug)}" style="${estiloCategoria(r)}">
      <span class="cinta">${escapar(textoPrecio(r.precio))}</span>
      ${estado === 'mio' ? '<span class="marca-mio"><i class="fa-solid fa-bookmark" aria-hidden="true"></i>Lo guardaste</span>' : ''}
      <div class="tarjeta__img">
        ${imagenRegalo(r)}
        ${estado === 'reservado' ? '<span class="sello"><i class="fa-solid fa-lock" aria-hidden="true"></i>Ya lo apartaron</span>' : ''}
      </div>
      <div class="tarjeta__cuerpo">
        <h3 class="tarjeta__nombre">${escapar(r.nombre)}</h3>
        ${etiquetas.length ? `<div class="tarjeta__meta">${etiquetas.join('')}</div>` : ''}
      </div>
    </a>`;
}

export async function vistaCategoria(slug) {
  const regalos = await cargarRegalos();
  const s = agruparSecciones(regalos).find((x) => x.slug === slug);
  const v = $('#vista');
  if (!s) {
    v.innerHTML = `<div class="vacio"><i class="fa-solid fa-circle-question" aria-hidden="true"></i><h1 class="titulo-seccion">No encontramos esa categoría</h1><a class="btn" href="#/inicio"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i>Ver categorías</a></div>`;
    return;
  }
  v.innerHTML = `
    ${htmlVolver('#/inicio#categorias', 'Categorías', 'data-ruta="regalos"')}
    <div class="cat-cabeza-envoltura">
      <header class="cat-cabeza" style="${estiloCategoria(s)}">
        <i class="${escapar(s.icono)} cat-cabeza__icono" aria-hidden="true"></i>
        <h1 class="cat-cabeza__nombre">${escapar(s.nombre)}</h1>
        ${htmlSub(s, 'cat-cabeza__sub')}
        <p class="cat-cabeza__cuenta"><i class="fa-solid fa-gift" aria-hidden="true"></i>${textoCuenta(s.regalos)}</p>
      </header>
      ${app.esAdmin ? '' : '<p class="explosion"><span>Da click en el regalo que quieras para apartar</span></p>'}
    </div>
    <div class="tarjetas">${s.regalos.map(htmlTarjeta).join('')}</div>
    ${s.regalos.some((r) => r.tipo === 'compartido') && !app.esAdmin ? `<div class="contenedor" style="margin-top:var(--sp-7)"><p class="secreto"><i class="fa-solid fa-user-secret" aria-hidden="true"></i><span>Estos los puede guardar cualquier persona y no cuentan para tu límite de un regalo apartado.</span></p></div>` : ''}`;
  observarRevelar(v);
}

// Boton de volver que se queda fijo arriba al bajar
export function htmlVolver(href, texto, extra = '') {
  return `<div class="volver-fijo"><a class="volver-fijo__boton" href="${href}" ${extra}><i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>${escapar(texto)}</span></a></div>`;
}

// ---------- Detalle ----------

/**
 * HTML del detalle. modo: 'normal' (invitados), 'admin' (solo estado) o 'vista' (vista previa del panel).
 */
export function htmlDetalle(r, { modo = 'normal', volver = true } = {}) {
  const mio = r.estado === 'mio';
  const reservado = r.estado === 'reservado';
  const precio = textoPrecio(r.precio, { conMoneda: true });
  const etiquetas = [];
  if (r.talla) etiquetas.push(`<span class="etiqueta"><i class="fa-solid fa-shirt" aria-hidden="true"></i>Talla ${escapar(r.talla)}</span>`);
  if (r.nota) etiquetas.push(`<span class="etiqueta"><i class="fa-solid fa-note-sticky" aria-hidden="true"></i>${escapar(r.nota)}</span>`);
  if (r.tipo === 'compartido' && r.personas > 0 && modo === 'normal') etiquetas.push(`<span class="etiqueta"><i class="fa-solid fa-user-group" aria-hidden="true"></i>${nPersonas(r.personas)}</span>`);

  let acciones = '';
  if (modo === 'normal') {
    const boton = mio
      ? '<button class="btn btn--grande btn--secundario" type="button" data-soltar><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Soltar regalo</button>'
      : reservado
        ? '<button class="btn btn--grande" type="button" disabled><i class="fa-solid fa-lock" aria-hidden="true"></i>Ya lo apartaron</button>'
        : '<button class="btn btn--grande" type="button" data-guardar><i class="fa-solid fa-bookmark" aria-hidden="true"></i>Guardar este regalo</button>';
    acciones = `${boton}
      ${r.tipo === 'compartido'
        ? '<p class="detalle__tipo"><i class="fa-solid fa-user-group" aria-hidden="true"></i><span>Cualquier persona puede darlo y no cuenta para tu límite.</span></p>'
        : '<p class="detalle__tipo"><i class="fa-solid fa-user" aria-hidden="true"></i><span>Solo una persona lo puede apartar, y tú solo puedes tener un regalo apartado a la vez.</span></p>'}`;
  } else if (modo === 'admin') {
    acciones = '<p class="detalle__estado-admin"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i><span>Así lo ven tus invitados. Para saber si ya lo apartaron, entra a Spoiler.</span></p>';
  } else {
    acciones = '<button class="btn btn--grande" type="button" disabled><i class="fa-solid fa-bookmark" aria-hidden="true"></i>Guardar este regalo</button>';
  }

  return `
    ${volver ? htmlVolver(`#/categoria/${encodeURIComponent(r.seccion_slug || '')}`, r.seccion || 'Categoría') : ''}
    <article class="detalle" style="${estiloCategoria(r)}">
      <figure class="polaroid detalle__foto">
        <div class="tarjeta__img" style="margin:0;border:0;border-radius:0">${imagenRegalo(r, { alt: r.nombre, cargar: 'eager' })}</div>
      </figure>
      <div class="detalle__info">
        ${r.seccion ? `<a class="detalle__cat" href="#/categoria/${encodeURIComponent(r.seccion_slug || '')}"><i class="${escapar(r.seccion_icono || 'fa-solid fa-gift')}" aria-hidden="true"></i>${escapar(r.seccion)}</a>` : ''}
        <h1 class="detalle__nombre">${escapar(r.nombre || 'Nombre del regalo')}</h1>
        <div class="detalle__precio">
          <span class="cinta">${escapar(precio)}</span>
          ${r.tienda ? `<span class="detalle__tienda"><i class="fa-solid fa-store" aria-hidden="true"></i>${escapar(r.tienda)}</span>` : ''}
        </div>
        ${r.descripcion ? `<p class="detalle__desc">${escapar(r.descripcion)}</p>` : ''}
        ${etiquetas.length ? `<div class="detalle__etiquetas">${etiquetas.join('')}</div>` : ''}
        <div class="detalle__acciones">
          ${acciones}
          ${r.enlace_url ? `<a class="enlace" href="${escapar(r.enlace_url)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>Ver en la tienda</a>` : ''}
        </div>
        ${modo !== 'admin' ? '<p class="secreto"><i class="fa-solid fa-user-secret" aria-hidden="true"></i><span>Ulises no sabrá quién guardó qué, porque ama las sorpresas.</span></p>' : ''}
      </div>
    </article>`;
}

export async function vistaDetalle(slug, { forzar = false } = {}) {
  const regalos = await cargarRegalos(forzar);
  const r = regalos.find((x) => x.slug === slug);
  const v = $('#vista');
  if (!r) {
    v.innerHTML = `<div class="vacio"><i class="fa-solid fa-ghost" aria-hidden="true"></i><h1 class="titulo-seccion">Este regalo ya no está disponible</h1><a class="btn" href="#/inicio"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i>Ver categorías</a></div>`;
    return;
  }
  v.innerHTML = htmlDetalle(r, { modo: app.esAdmin ? 'admin' : 'normal' });
  $('[data-guardar]', v)?.addEventListener('click', () => guardar(r));
  $('[data-soltar]', v)?.addEventListener('click', () => soltar(r));
}

async function guardar(r) {
  const si = await modal({ icono: 'fa-bookmark', titulo: `¿Guardar ${r.nombre}?`, confirmar: 'Sí, lo guardo', cancelar: 'Cancelar' });
  if (!si) return;
  const boton = $('[data-guardar]');
  if (boton) boton.disabled = true;
  const { error } = await supabase.rpc('reservar_regalo', { p_regalo_id: r.id });
  if (error) {
    const codigo = codigoError(error);
    if (boton) boton.disabled = false;
    if (codigo === 'ya_tienes_regalo') {
      await modal({
        icono: 'fa-hand',
        titulo: MENSAJES.ya_tienes_regalo,
        texto: 'Los regalos gratis y los de "Tú consigue el mejor precio" no cuentan para este límite.',
        confirmar: null, cancelar: 'Cerrar',
        extra: [{ texto: 'Ver mis regalos', icono: 'fa-bookmark', valor: 'mis' }],
      }).then((v) => { if (v === 'mis') ir('#/mis-regalos'); });
      return;
    }
    toast(MENSAJES[codigo] || 'No se pudo guardar. Intenta otra vez.', { tipo: 'error' });
    if (codigo === 'regalo_tomado' || codigo === 'regalo_no_existe' || codigo === 'ya_lo_guardaste') {
      await cargarRegalos(true);
      render();
    }
    return;
  }
  await cargarRegalos(true);
  await mostrarGracias();
  await vistaDetalle(r.slug);
}

async function soltar(r, { despues, bote = false } = {}) {
  const si = await modal(bote
    ? { icono: 'fa-trash-can', titulo: `¿Quitar ${r.nombre} de tus regalos?`, texto: 'Quedará libre para otras personas.', confirmar: 'Sí, quitarlo', cancelar: 'Cancelar', peligro: true }
    : { icono: 'fa-rotate-left', titulo: `¿Soltar ${r.nombre}?`, texto: 'Quedará libre para otras personas.', confirmar: 'Sí, soltarlo', cancelar: 'Cancelar', peligro: true });
  if (!si) return false;
  const { error } = await supabase.rpc('soltar_regalo', { p_regalo_id: r.id });
  if (error) { toast('No se pudo soltar. Intenta otra vez.', { tipo: 'error' }); return false; }
  toast('Regalo liberado');
  await cargarRegalos(true);
  if (despues) await despues();
  else await vistaDetalle(r.slug);
  return true;
}

// ---------- Mis regalos ----------

export async function vistaMisRegalos() {
  const regalos = await cargarRegalos(true);
  const mios = regalos.filter((r) => r.estado === 'mio');
  const exclusivo = mios.find((r) => r.tipo === 'exclusivo');
  const compartidos = mios.filter((r) => r.tipo === 'compartido');
  const v = $('#vista');

  v.innerHTML = `
    <div class="mis">
      <section aria-labelledby="t-apartado">
        <h1 class="mis__titulo" id="t-apartado">Tu regalo apartado</h1>
        ${exclusivo ? `
          <div class="mis__principal" style="${estiloCategoria(exclusivo)}">
            <figure class="polaroid"><div class="tarjeta__img" style="margin:0;border:0;border-radius:0">${imagenRegalo(exclusivo, { alt: exclusivo.nombre })}</div></figure>
            <div class="mis__info">
              <a class="detalle__cat" href="#/categoria/${encodeURIComponent(exclusivo.seccion_slug)}"><i class="${escapar(exclusivo.seccion_icono)}" aria-hidden="true"></i>${escapar(exclusivo.seccion)}</a>
              <h2 class="mis__nombre"><a href="#/regalo/${encodeURIComponent(exclusivo.slug)}" style="color:inherit;text-decoration:none">${escapar(exclusivo.nombre)}</a></h2>
              <div class="detalle__precio"><span class="cinta">${escapar(textoPrecio(exclusivo.precio, { conMoneda: true }))}</span>${exclusivo.tienda ? `<span class="detalle__tienda"><i class="fa-solid fa-store" aria-hidden="true"></i>${escapar(exclusivo.tienda)}</span>` : ''}</div>
              ${exclusivo.talla ? `<div class="detalle__etiquetas"><span class="etiqueta"><i class="fa-solid fa-shirt" aria-hidden="true"></i>Talla ${escapar(exclusivo.talla)}</span></div>` : ''}
              <div class="mis__botones">
                ${exclusivo.enlace_url ? `<a class="btn" href="${escapar(exclusivo.enlace_url)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>Ver en la tienda</a>` : ''}
                <button class="btn btn--icono btn--bote" type="button" data-soltar="${escapar(exclusivo.id)}" aria-label="Quitar ${escapar(exclusivo.nombre)} de mis regalos" title="Quitar de mis regalos"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
              </div>
            </div>
          </div>` : `
          <div class="mis__principal" style="grid-template-columns:1fr;text-align:center;justify-items:center">
            <i class="fa-solid fa-gift" aria-hidden="true" style="font-size:5rem;color:var(--gold)"></i>
            <p style="font-family:var(--font-display);font-size:var(--fs-h3)">Todavía no apartas un regalo</p>
            <a class="btn btn--grande" href="#/inicio#categorias" data-ruta="regalos"><i class="fa-solid fa-table-cells-large" aria-hidden="true"></i>Ver categorías</a>
          </div>`}
      </section>

      <section aria-labelledby="t-tambien">
        <h2 class="titulo-seccion" id="t-tambien" style="margin-bottom:var(--sp-4)"><i class="fa-solid fa-user-group" aria-hidden="true"></i>También vas a dar</h2>
        ${compartidos.length ? `
          <ul class="lista-compartidos">
            ${compartidos.map((r) => `
              <li class="mini" style="${estiloCategoria(r)}">
                <div class="mini__img">${imagenRegalo(r, { alt: '' })}</div>
                <div>
                  <a class="mini__nombre" href="#/regalo/${encodeURIComponent(r.slug)}">${escapar(r.nombre)}</a>
                  <p class="mini__precio">${escapar(textoPrecio(r.precio))}</p>
                </div>
                <button class="btn btn--icono btn--bote" type="button" data-soltar="${escapar(r.id)}" aria-label="Quitar ${escapar(r.nombre)} de mis regalos" title="Quitar de mis regalos"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
              </li>`).join('')}
          </ul>` : '<p style="color:var(--muted-dark)">Aquí aparecen los regalos gratis o compartidos que guardes, como una carta o un abrazo.</p>'}
      </section>

      <p class="secreto"><i class="fa-solid fa-user-secret" aria-hidden="true"></i><span>Aunque sea ciberñoño, te pinky prometo que no programé nada para ver quién me regalará qué, para mantener la sorpresa.</span></p>
    </div>`;

  v.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-soltar]');
    if (!b) return;
    const r = mios.find((x) => x.id === b.dataset.soltar);
    if (r) await soltar(r, { despues: vistaMisRegalos, bote: true });
  }, { once: false, signal: nuevaSenal() });
}

let controlador;
function nuevaSenal() {
  controlador?.abort();
  controlador = new AbortController();
  return controlador.signal;
}

// ---------- Spoiler (solo Uli) ----------

export async function vistaSpoiler() {
  const v = $('#vista');
  v.innerHTML = '';
  const si = await modal({
    icono: 'fa-face-surprise',
    titulo: '¿Seguro quieres arruinar el secreto?',
    texto: 'Vas a ver qué regalos ya apartaron. Nunca quién.',
    confirmar: 'Sí, quiero ver', cancelar: 'Mejor no',
  });
  if (!si) { ir('#/inicio', true); return; }
  const regalos = await cargarRegalos(true);
  const secciones = agruparSecciones(regalos);
  v.innerHTML = `
    <div class="admin spoiler">
      <h1 class="admin__titulo"><i class="fa-solid fa-eye" aria-hidden="true"></i>Spoiler</h1>
      <div data-resumen></div>
      ${secciones.map((s) => `
        <section class="spoiler__seccion" aria-label="${escapar(s.nombre)}">
          <h2 class="titulo-seccion"><i class="${escapar(s.icono)}" aria-hidden="true"></i>${escapar(s.nombre)}</h2>
          <div class="tarjetas">${s.regalos.map((r) => htmlTarjeta(r, { espiar: true })).join('')}</div>
        </section>`).join('')}
    </div>`;
  const { pintarResumen } = await import('./admin.js');
  await pintarResumen($('[data-resumen]', v));
  observarRevelar(v);
}
