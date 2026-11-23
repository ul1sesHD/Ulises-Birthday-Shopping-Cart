// Panel de admin: agregar por link, editar, ocultar, borrar y resumen.
// Solo usa las funciones admin_* del esquema. Nunca muestra quien guardo que.
import { supabase, llamarFuncion, codigoError, esDemo } from './supabase.js';
import { $, $$, escapar, textoPrecio, estiloCategoria, imagenRegalo, modal, toast, diasParaCumple, formatoNumero } from './ui.js';
import { htmlDetalle, olvidarRegalos } from './regalos.js';

let pestana = 'agregar';
let secciones = [];
let form = nuevoForm();

function nuevoForm(datos = {}) {
  return {
    id: null, nombre: '', seccion_slug: '', tipo: 'exclusivo', precio: '', descripcion: '', talla: '', nota: '',
    tienda: '', imagen_url: '', enlace_url: '', activo: true, tituloTienda: '', ...datos,
  };
}

const SIEMPRE_COMPARTIDO = new Set(['gratis', 'mejor-precio']);

// ---------- Links ----------

const PARAMS_RASTREO = new Set(['ref', 'ref_', 'tag', 'dib', 'dib_tag', 'qid', 'sr', 'crid', 'sprefix', 'psc', 'smid', 'keywords', 'pd_rd_w', 'pd_rd_r', 'pd_rd_wg', 'pf_rd_p', 'pf_rd_r', 'content-id', 'linkcode', 'linkid', 'th_ref']);
const PARAMS_VARIANTE = new Set(['v1', 'v2', 'colorid', 'variant', 'th', 'size', 'talla', 'color']);

export function limpiarLink(texto) {
  let url;
  try { url = new URL(String(texto).trim()); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase();

  if (/(^|\.)amazon\./.test(host)) {
    const m = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin|o\/asin)\/([A-Z0-9]{10})/i);
    if (m) return `https://www.amazon.com.mx/dp/${m[1].toUpperCase()}`;
  }
  if (host.includes('mercadolibre') || host.includes('mercadolivre')) {
    url.hash = '';
    url.search = '';
    return url.toString();
  }
  url.hash = '';
  for (const k of [...url.searchParams.keys()]) {
    const kl = k.toLowerCase();
    if (PARAMS_VARIANTE.has(kl)) continue;
    if (kl.startsWith('utm_') || PARAMS_RASTREO.has(kl) || kl.startsWith('pd_rd') || kl.startsWith('pf_rd') || kl === 'fbclid' || kl === 'gclid' || kl === 'srsltid') url.searchParams.delete(k);
  }
  return url.toString();
}

const TIENDAS = [
  ['amazon', 'Amazon'], ['amzn.', 'Amazon'], ['a.co', 'Amazon'], ['mercadolibre', 'Mercado Libre'], ['meli.la', 'Mercado Libre'],
  ['decathlon', 'Decathlon'], ['hm.com', 'H&M'], ['zara', 'Zara'], ['bershka', 'Bershka'], ['pullandbear', 'Pull&Bear'],
  ['lego', 'LEGO'], ['liverpool', 'Liverpool'], ['shein', 'Shein'], ['palacio', 'El Palacio de Hierro'], ['sears', 'Sears'],
  ['walmart', 'Walmart'], ['costco', 'Costco'], ['sanborns', 'Sanborns'], ['gandhi', 'Librería Gandhi'], ['elsotano', 'El Sótano'],
  ['nike', 'Nike'], ['adidas', 'Adidas'], ['uniqlo', 'Uniqlo'], ['stradivarius', 'Stradivarius'], ['massimodutti', 'Massimo Dutti'],
  ['sephora', 'Sephora'], ['etsy', 'Etsy'], ['lumen', 'Lumen'], ['coppel', 'Coppel'], ['suburbia', 'Suburbia'], ['olend', 'Ölend'],
];

export function tiendaDeLink(texto) {
  try {
    const host = new URL(texto).hostname.replace(/^www\d?\./, '').toLowerCase();
    const t = TIENDAS.find(([clave]) => host.includes(clave));
    if (t) return t[1];
    const base = host.split('.').slice(-2)[0] || host;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch { return ''; }
}

function sugerirNombre(titulo, tienda) {
  if (!titulo) return '';
  let t = String(titulo).split(/\s[|–-]\s|:\s/)[0];
  if (tienda) t = t.replace(new RegExp(tienda.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&'), 'ig'), ' ');
  t = t
    .replace(/\b(para|de)\s+(hombre|mujer|caballero|dama|niñ[oa]s?|adulto|unisex)\b/gi, ' ')
    .replace(/\b(hombre|mujer|unisex|adulto)\b/gi, ' ')
    .replace(/\b\d+([.,]\d+)?\s?(cm|mm|ml|l|g|kg|oz|gb|tb|pzas?|piezas|pares|pack)\b/gi, ' ')
    .replace(/[()[\],|]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const palabras = t.split(' ').filter(Boolean);
  const vistas = new Set();
  const unicas = palabras.filter((p) => { const k = p.toLowerCase(); if (vistas.has(k)) return false; vistas.add(k); return true; });
  const s = unicas.slice(0, 4).join(' ').toLowerCase();
  return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 40);
}

function sugerirSeccion(precio) {
  if (precio === '' || precio == null) return null;
  const n = Number(precio);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 'gratis';
  if (n <= 100) return 'cien';
  if (n <= 200) return 'doscientos';
  if (n <= 300) return 'trescientos';
  if (n <= 500) return 'quinientos';
  if (n <= 1000) return 'mil';
  return 'sugar-daddy';
}

const seccionPorSlug = (slug) => secciones.find((s) => s.slug === slug);

// ---------- Vista principal ----------

export async function vistaAdmin() {
  if (!secciones.length) {
    const { data, error } = await supabase.from('secciones').select('*').order('orden');
    if (error) throw error;
    secciones = data || [];
  }
  const v = $('#vista');
  v.innerHTML = `
    <div class="admin">
      <h1 class="admin__titulo"><i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i>Panel de Uli</h1>
      <div class="pestanas" role="tablist" aria-label="Secciones del panel">
        ${[['agregar', 'fa-plus', 'Agregar regalo'], ['regalos', 'fa-list', 'Regalos']].map(([id, icono, texto]) => `
          <button class="pestana" type="button" role="tab" id="tab-${id}" aria-controls="panel-admin" aria-selected="${pestana === id}" data-tab="${id}">
            <i class="fa-solid ${icono}" aria-hidden="true"></i>${texto}
          </button>`).join('')}
      </div>
      <div id="panel-admin" role="tabpanel" aria-labelledby="tab-${pestana}"></div>
    </div>`;
  $('.pestanas', v).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === pestana) return;
    cambiarPestana(b.dataset.tab);
  });
  $('.pestanas', v).addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tabs = $$('[data-tab]', v);
    const i = tabs.indexOf(document.activeElement);
    const sig = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    sig.focus();
    cambiarPestana(sig.dataset.tab);
  });
  await pintarPestana();
}

async function cambiarPestana(id) {
  pestana = id;
  $$('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
  $('#panel-admin').setAttribute('aria-labelledby', `tab-${id}`);
  await pintarPestana();
}

async function pintarPestana() {
  // Se reemplaza el panel para soltar los listeners de la pestana anterior
  const viejo = $('#panel-admin');
  const p = viejo.cloneNode(false);
  viejo.replaceWith(p);
  p.innerHTML = '<div class="cargando"><i class="fa-solid fa-spinner fa-spin-lento" aria-hidden="true"></i></div>';
  if (pestana === 'agregar') pintarAgregar(p);
  // El resumen de apartados vive en Spoiler para no arruinar el secreto
  else await pintarLista(p);
}

// ---------- J1 Agregar ----------

function pintarAgregar(p) {
  const editando = !!form.id;
  p.innerHTML = `
    ${editando ? '' : `
    <section class="agregar__link" aria-labelledby="t-link">
      <label class="campo__etiqueta" id="t-link" for="link" style="font-size:1rem">Pega el link del producto</label>
      <div class="agregar__fila">
        <div class="campo__caja">
          <i class="fa-solid fa-link" aria-hidden="true"></i>
          <input class="input" id="link" type="url" inputmode="url" placeholder="https://..." autocomplete="off" value="${escapar(form.enlace_url)}" aria-describedby="link-error">
        </div>
      </div>
      <span class="campo__error" id="link-error" role="alert"></span>
      <div class="agregar__botones">
        <button class="btn btn--secundario" type="button" data-pegar><i class="fa-solid fa-paste" aria-hidden="true"></i>Pegar</button>
        <button class="btn" type="button" data-leer><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>Leer link</button>
      </div>
      <button class="enlace" type="button" data-sin-link style="align-self:flex-start"><i class="fa-solid fa-pen" aria-hidden="true"></i>Agregar sin link</button>
    </section>`}
    <div class="agregar__zona" ${!editando && !form.mostrar ? 'hidden' : ''}>
      <div class="agregar__vista">
        <p class="agregar__vista-etiqueta"><i class="fa-solid fa-eye" aria-hidden="true"></i>Así se verá</p>
        <div data-vista></div>
      </div>
      <form class="form-regalo" novalidate>
        <h2 class="titulo-seccion">${editando ? `<i class="fa-solid fa-pen" aria-hidden="true"></i>Editar regalo` : '<i class="fa-solid fa-plus" aria-hidden="true"></i>Datos del regalo'}</h2>

        <div class="campo">
          <label class="campo__etiqueta" for="f-nombre">Nombre corto</label>
          <input class="input" id="f-nombre" maxlength="40" required value="${escapar(form.nombre)}" aria-describedby="f-nombre-ayuda f-nombre-error">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <span class="campo__ayuda" id="f-nombre-ayuda">${form.tituloTienda ? `En la tienda: ${escapar(form.tituloTienda.slice(0, 90))}` : 'De 2 a 4 palabras.'}</span>
            <span class="contador" data-contador>${form.nombre.length}/40</span>
          </div>
          <span class="campo__error" id="f-nombre-error" role="alert"></span>
        </div>

        <fieldset class="campo" style="border:0;padding:0;margin:0">
          <legend class="campo__etiqueta" style="margin-bottom:8px">Categoría</legend>
          <div class="cat-mini-lista">
            ${secciones.map((s) => `
              <button type="button" class="cat-mini" style="${estiloCategoria(s)}" data-seccion="${escapar(s.slug)}" aria-pressed="${form.seccion_slug === s.slug}">
                <i class="${escapar(s.icono)}" aria-hidden="true"></i>${escapar(s.nombre)}<small>${escapar(s.subtitulo.length > 22 ? (s.presupuesto === 0 ? 'Gratis' : 'Sin tope') : s.subtitulo)}</small>
              </button>`).join('')}
          </div>
          <span class="campo__error" id="f-seccion-error" role="alert"></span>
          <div data-tope></div>
        </fieldset>

        <div class="campo">
          <span class="campo__etiqueta" id="t-tipo">Tipo</span>
          <div class="interruptor" role="group" aria-labelledby="t-tipo">
            <button type="button" data-tipo="exclusivo" aria-pressed="${form.tipo === 'exclusivo'}">Solo una persona</button>
            <button type="button" data-tipo="compartido" aria-pressed="${form.tipo === 'compartido'}">Cualquiera puede darlo</button>
          </div>
          <span class="campo__ayuda" data-tipo-ayuda></span>
          <span class="campo__error" id="f-tipo-error" role="alert"></span>
        </div>

        <div class="campo">
          <label class="campo__etiqueta" for="f-precio">Precio en MXN</label>
          <div class="campo__caja"><i class="fa-solid fa-dollar-sign" aria-hidden="true"></i><input class="input" id="f-precio" type="number" min="0" step="1" inputmode="numeric" value="${escapar(form.precio)}" aria-describedby="f-precio-ayuda f-precio-error"></div>
          <span class="campo__ayuda" id="f-precio-ayuda">Vacío es "Tú decides" y 0 es "Gratis".</span>
          <span class="campo__error" id="f-precio-error" role="alert"></span>
        </div>

        <div class="campo">
          <label class="campo__etiqueta" for="f-descripcion">Descripción</label>
          <textarea class="input" id="f-descripcion" maxlength="300" rows="3">${escapar(form.descripcion)}</textarea>
        </div>

        <div class="form-regalo__doble">
          <div class="campo"><label class="campo__etiqueta" for="f-talla">Talla</label><input class="input" id="f-talla" maxlength="20" value="${escapar(form.talla)}"></div>
          <div class="campo"><label class="campo__etiqueta" for="f-tienda">Tienda</label><input class="input" id="f-tienda" maxlength="40" value="${escapar(form.tienda)}"></div>
        </div>
        <div class="campo"><label class="campo__etiqueta" for="f-nota">Nota</label><input class="input" id="f-nota" maxlength="60" placeholder="Ideal para familia" value="${escapar(form.nota)}"></div>
        <div class="campo"><label class="campo__etiqueta" for="f-enlace">Link de la tienda</label><input class="input" id="f-enlace" type="url" value="${escapar(form.enlace_url)}" aria-describedby="f-enlace-error"><span class="campo__error" id="f-enlace-error" role="alert"></span></div>

        <div class="campo">
          <span class="campo__etiqueta">Imagen</span>
          <div class="imagen-actual">
            <div class="imagen-actual__mini" data-mini>${form.imagen_url ? `<img src="${escapar(form.imagen_url)}" alt="">` : ''}</div>
            <div class="imagen-opciones">
              <label class="btn btn--secundario" style="cursor:pointer"><i class="fa-solid fa-camera" aria-hidden="true"></i>Subir otra<input type="file" accept="image/*" data-archivo class="sr-only"></label>
              <button class="btn btn--secundario" type="button" data-url-img><i class="fa-solid fa-image" aria-hidden="true"></i>Usar URL de imagen</button>
            </div>
          </div>
          <div class="campo__caja" data-caja-url hidden><i class="fa-solid fa-link" aria-hidden="true"></i><input class="input" id="f-imagen" type="url" placeholder="https://.../imagen.jpg" value="${escapar(form.imagen_url)}"></div>
          <span class="campo__ayuda" data-estado-img aria-live="polite"></span>
        </div>

        <label class="check"><input type="checkbox" id="f-activo" ${form.activo ? 'checked' : ''}>Visible para las personas invitadas</label>

        <div class="form-regalo__acciones">
          <button class="btn btn--grande" type="submit"><i class="fa-solid ${editando ? 'fa-floppy-disk' : 'fa-plus'}" aria-hidden="true"></i>${editando ? 'Guardar cambios' : 'Añadir regalo'}</button>
          ${editando ? '<button class="btn btn--secundario" type="button" data-cancelar><i class="fa-solid fa-xmark" aria-hidden="true"></i>Cancelar edición</button>' : '<button class="enlace" type="button" data-limpiar style="align-self:center">Empezar de nuevo</button>'}
        </div>
      </form>
    </div>`;

  conectarAgregar(p);
  actualizarVista();
}

function conectarAgregar(p) {
  const f = $('form', p);
  const link = $('#link', p);

  $('[data-pegar]', p)?.addEventListener('click', async () => {
    try {
      const texto = await navigator.clipboard.readText();
      if (!texto) throw new Error('vacio');
      link.value = texto.trim();
      errorCampo('link', '');
      leerLink(p);
    } catch {
      link.focus();
      errorCampo('link', 'Mantén presionado y pega.');
    }
  });
  $('[data-leer]', p)?.addEventListener('click', () => leerLink(p));
  link?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); leerLink(p); } });
  link?.addEventListener('input', () => errorCampo('link', ''));
  $('[data-sin-link]', p)?.addEventListener('click', () => {
    form = nuevoForm({ mostrar: true });
    pintarAgregar(p);
    $('#f-nombre').focus();
  });
  $('[data-limpiar]', p)?.addEventListener('click', () => { form = nuevoForm(); pintarAgregar(p); $('#link')?.focus(); });
  $('[data-cancelar]', p)?.addEventListener('click', () => { form = nuevoForm(); pestana = 'regalos'; vistaAdmin(); });

  // Campos de texto
  const mapa = { 'f-nombre': 'nombre', 'f-precio': 'precio', 'f-descripcion': 'descripcion', 'f-talla': 'talla', 'f-tienda': 'tienda', 'f-nota': 'nota', 'f-enlace': 'enlace_url', 'f-imagen': 'imagen_url' };
  f.addEventListener('input', (e) => {
    const k = mapa[e.target.id];
    if (!k) return;
    form[k] = e.target.value;
    errorCampo(e.target.id, '');
    if (k === 'nombre') $('[data-contador]').textContent = `${form.nombre.length}/40`;
    if (k === 'precio') {
      const sug = sugerirSeccion(form.precio);
      if (!form.seccion_slug && sug) elegirSeccion(sug, { auto: true });
      revisarTope();
    }
    if (k === 'imagen_url') pintarMini();
    if (k === 'enlace_url' && !form.tienda) { form.tienda = tiendaDeLink(form.enlace_url); $('#f-tienda').value = form.tienda; }
    actualizarVista();
  });
  $('#f-activo', p).addEventListener('change', (e) => { form.activo = e.target.checked; });

  // Categoria y tipo
  $('.cat-mini-lista', p).addEventListener('click', (e) => {
    const b = e.target.closest('[data-seccion]');
    if (b) elegirSeccion(b.dataset.seccion);
  });
  $('.interruptor', p).addEventListener('click', (e) => {
    const b = e.target.closest('[data-tipo]');
    if (!b || b.disabled) return;
    form.tipo = b.dataset.tipo;
    pintarTipo();
    actualizarVista();
  });
  pintarTipo();
  revisarTope();

  // Imagen
  $('[data-url-img]', p).addEventListener('click', () => {
    const caja = $('[data-caja-url]', p);
    caja.hidden = !caja.hidden;
    if (!caja.hidden) $('#f-imagen').focus();
  });
  $('[data-archivo]', p).addEventListener('change', (e) => subirImagen(e.target.files?.[0]));

  f.addEventListener('submit', (e) => { e.preventDefault(); guardarForm(p); });
}

function errorCampo(id, mensaje) {
  const caja = document.getElementById(`${id}-error`);
  if (caja) caja.innerHTML = mensaje ? `<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>${escapar(mensaje)}` : '';
  document.getElementById(id)?.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
}

function elegirSeccion(slug, { auto = false } = {}) {
  form.seccion_slug = slug;
  $$('[data-seccion]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seccion === slug)));
  if (SIEMPRE_COMPARTIDO.has(slug)) form.tipo = 'compartido';
  else if (!auto && !form.id && form.tipo === 'compartido' && !/pila/i.test(form.nombre)) form.tipo = 'exclusivo';
  if (slug === 'gratis' && form.precio === '') { form.precio = '0'; $('#f-precio').value = '0'; }
  errorCampo('f-seccion', '');
  pintarTipo();
  revisarTope();
  actualizarVista();
}

function pintarTipo() {
  const fijo = SIEMPRE_COMPARTIDO.has(form.seccion_slug);
  $$('[data-tipo]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.tipo === form.tipo));
    b.disabled = fijo && b.dataset.tipo === 'exclusivo';
  });
  const ayuda = $('[data-tipo-ayuda]');
  if (ayuda) {
    ayuda.textContent = fijo
      ? 'En esta categoría siempre es compartido: cualquiera lo puede dar.'
      : form.tipo === 'exclusivo'
        ? 'Solo una persona lo puede apartar, y cuenta como su regalo.'
        : 'Lo pueden guardar varias personas y no cuenta para su límite.';
  }
}

function revisarTope() {
  const caja = $('[data-tope]');
  if (!caja) return;
  const s = seccionPorSlug(form.seccion_slug);
  const precio = form.precio === '' ? null : Number(form.precio);
  if (!s || precio == null || !s.presupuesto || precio <= s.presupuesto) { caja.innerHTML = ''; return; }
  const destino = seccionPorSlug(sugerirSeccion(precio));
  if (!destino || destino.slug === s.slug) { caja.innerHTML = ''; return; }
  caja.innerHTML = `<p class="aviso-tope"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Este precio pasa el tope de la categoría. ¿Lo muevo a ${escapar(destino.nombre)}?</span><button class="btn" type="button" data-mover="${escapar(destino.slug)}">Moverlo</button></p>`;
  $('[data-mover]', caja).addEventListener('click', (e) => elegirSeccion(e.currentTarget.dataset.mover));
}

function pintarMini() {
  const mini = $('[data-mini]');
  if (mini) mini.innerHTML = form.imagen_url ? `<img src="${escapar(form.imagen_url)}" alt="" referrerpolicy="no-referrer">` : '';
}

function actualizarVista() {
  const caja = $('[data-vista]');
  if (!caja) return;
  const s = seccionPorSlug(form.seccion_slug) || {};
  const precio = form.precio === '' ? null : Number(form.precio);
  caja.innerHTML = htmlDetalle({
    nombre: form.nombre || 'Nombre del regalo', precio, tienda: form.tienda, descripcion: form.descripcion,
    talla: form.talla, nota: form.nota, imagen_url: form.imagen_url, enlace_url: limpiarLink(form.enlace_url) || '',
    tipo: form.tipo, personas: 0, estado: 'disponible',
    seccion: s.nombre, seccion_slug: s.slug, seccion_icono: s.icono, color_fondo: s.color_fondo, color_icono: s.color_icono, color_texto: s.color_texto,
  }, { modo: 'vista', volver: false });
  $$('a', caja).forEach((a) => { if (!a.target) a.addEventListener('click', (e) => e.preventDefault()); });
}

function esqueleto() {
  return `
    <div class="detalle" style="grid-template-columns:1fr;margin:0;width:100%" aria-hidden="true">
      <div class="polaroid detalle__foto" style="max-width:420px"><div class="esqueleto" style="aspect-ratio:1"></div></div>
      <div class="detalle__info">
        <div class="esqueleto" style="height:48px;width:80%"></div>
        <div class="esqueleto" style="height:36px;width:40%"></div>
        <div class="esqueleto" style="height:14px;width:90%"></div>
        <div class="esqueleto" style="height:14px;width:70%"></div>
        <div class="esqueleto" style="height:60px;width:100%;border-radius:14px"></div>
      </div>
    </div>`;
}

async function conTiempo(promesa, ms) {
  let t;
  const limite = new Promise((_, mal) => { t = setTimeout(() => mal(new Error('tiempo')), ms); });
  try { return await Promise.race([promesa, limite]); } finally { clearTimeout(t); }
}

async function leerLink(p) {
  const crudo = $('#link').value.trim();
  if (!/^https?:\/\//i.test(crudo)) { errorCampo('link', 'Pega un link que empiece con http o https.'); return; }
  const limpio = limpiarLink(crudo);
  if (!limpio) { errorCampo('link', 'Ese link no parece válido.'); return; }

  const boton = $('[data-leer]', p);
  boton.disabled = true;
  boton.innerHTML = '<i class="fa-solid fa-spinner fa-spin-lento" aria-hidden="true"></i>Leyendo';
  const zona = $('.agregar__zona', p);
  zona.hidden = false;
  const vista = $('[data-vista]', p);
  vista.innerHTML = esqueleto();
  vista.setAttribute('aria-busy', 'true');

  let datos = null;
  try {
    const r = await conTiempo(llamarFuncion('extraer-producto', { url: crudo }, { timeout: 15000 }), 15000);
    if (r.ok && r.data && (r.data.nombre || r.data.imagen_url)) datos = r.data;
  } catch { /* se intenta con microlink */ }

  if (!datos) {
    try {
      const res = await conTiempo(fetch(`https://api.microlink.io/?url=${encodeURIComponent(limpio)}&palette=false&audio=false&video=false`), 15000);
      const j = await res.json();
      if (j.status === 'success') datos = { nombre: j.data.title, descripcion: j.data.description, imagen_url: j.data.image?.url || null, precio: null, url_final: limpio };
    } catch { /* sin datos */ }
  }

  const enlace = limpiarLink(datos?.url_final || limpio) || limpio;
  const tienda = datos?.tienda || tiendaDeLink(enlace);
  form = nuevoForm({ mostrar: true, enlace_url: enlace, tienda });
  if (datos) {
    form.tituloTienda = datos.nombre || '';
    form.nombre = sugerirNombre(datos.nombre, tienda);
    form.descripcion = (datos.descripcion || '').replace(/\s+/g, ' ').slice(0, 220);
    form.imagen_url = datos.imagen_url || '';
    if (datos.precio != null && (!datos.moneda || datos.moneda === 'MXN')) form.precio = String(Math.round(Number(datos.precio)));
    const sug = sugerirSeccion(form.precio);
    if (sug) form.seccion_slug = sug;
  }
  pintarAgregar(p);
  if (!datos) toast('No pude leer este link. Llena los datos a mano.', { tipo: 'error', duracion: 5000 });
  else toast('Listo, revisa los datos');
  $('#f-nombre')?.focus({ preventScroll: true });
  $('.agregar__zona')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Reduce la imagen en el navegador y la sube al bucket "regalos"
async function subirImagen(archivo) {
  if (!archivo) return;
  const estado = $('[data-estado-img]');
  if (!archivo.type.startsWith('image/')) { estado.textContent = 'Ese archivo no es una imagen.'; return; }
  estado.textContent = 'Subiendo imagen...';
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((r) => lienzo.toBlob(r, 'image/webp', 0.85));
    if (!blob) throw new Error('sin_blob');
    const ruta = `regalos/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage.from('regalos').upload(ruta, blob, { contentType: 'image/webp', upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('regalos').getPublicUrl(ruta);
    form.imagen_url = data.publicUrl;
    const input = $('#f-imagen');
    if (input) input.value = esDemo ? '' : form.imagen_url;
    pintarMini();
    actualizarVista();
    estado.textContent = 'Imagen lista.';
  } catch (e) {
    console.error(e);
    estado.textContent = 'No se pudo subir la imagen. Prueba con otra o usa una URL.';
  }
}

async function guardarForm(p) {
  let ok = true;
  if (!form.nombre.trim()) { errorCampo('f-nombre', 'Escribe un nombre corto.'); ok = false; }
  if (!form.seccion_slug) { errorCampo('f-seccion', 'Elige una categoría.'); ok = false; }
  const precio = form.precio === '' ? null : Number(form.precio);
  if (precio != null && (!Number.isFinite(precio) || precio < 0)) { errorCampo('f-precio', 'El precio debe ser 0 o más.'); ok = false; }
  const enlace = form.enlace_url ? limpiarLink(form.enlace_url) : null;
  if (form.enlace_url && !enlace) { errorCampo('f-enlace', 'Ese link no parece válido.'); ok = false; }
  if (!ok) { document.querySelector('[aria-invalid="true"], #f-seccion-error:not(:empty)')?.scrollIntoView({ block: 'center' }); return; }

  const boton = $('.form-regalo [type="submit"]', p);
  boton.disabled = true;
  const { data, error } = await supabase.rpc('admin_guardar_regalo', {
    p_id: form.id, p_seccion_slug: form.seccion_slug, p_tipo: form.tipo, p_nombre: form.nombre.trim(),
    p_descripcion: form.descripcion.trim(), p_precio: precio, p_imagen_url: form.imagen_url || null,
    p_enlace_url: enlace, p_tienda: form.tienda.trim() || null, p_talla: form.talla.trim() || null,
    p_nota: form.nota.trim() || null, p_activo: form.activo,
  });
  boton.disabled = false;
  if (error) {
    const c = codigoError(error);
    const mensajes = {
      falta_nombre: ['f-nombre', 'Escribe un nombre corto.'],
      seccion_no_existe: ['f-seccion', 'Esa categoría ya no existe. Elige otra.'],
      tipo_invalido: ['f-tipo', 'Elige si es para una persona o para cualquiera.'],
      precio_invalido: ['f-precio', 'El precio debe ser 0 o más.'],
      ya_lo_guardaron_varios: ['f-tipo', 'No puede volverse de una sola persona porque ya lo guardaron varias.'],
    };
    const m = mensajes[c];
    if (m) { errorCampo(...m); document.getElementById(`${m[0]}-error`)?.scrollIntoView({ block: 'center' }); }
    else toast(c === 'solo_admin' ? 'Esta cuenta no es de admin.' : 'No se pudo guardar. Intenta otra vez.', { tipo: 'error' });
    return;
  }
  olvidarRegalos();
  const eraEdicion = !!form.id;
  const nombre = form.nombre;
  form = nuevoForm();
  if (eraEdicion) {
    toast('Cambios guardados');
    pestana = 'regalos';
    vistaAdmin();
    return;
  }
  // Busca el slug para "Ver como quedo"
  let slug = null;
  const lista = await supabase.rpc('admin_listar_regalos');
  slug = (lista.data || []).find((g) => g.id === data)?.slug;
  pintarAgregar(p);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast(`Regalo añadido: ${nombre}`, slug ? { accion: { texto: 'Ver cómo quedó', href: `#/regalo/${encodeURIComponent(slug)}` } } : {});
}

// ---------- J2 Lista ----------

let filtroTexto = '';
let mostrarOcultos = true;

async function pintarLista(p) {
  const { data, error } = await supabase.rpc('admin_listar_regalos');
  if (error) { p.innerHTML = '<div class="vacio"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i><p>No se pudo cargar la lista.</p></div>'; return; }
  const todos = (data || []).map((g) => ({ ...g, precio: g.precio == null ? null : Number(g.precio) }));

  p.innerHTML = `
    <div class="lista-admin__filtros">
      <div class="campo__caja">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input class="input" id="buscar" type="search" placeholder="Buscar por nombre" aria-label="Buscar por nombre" value="${escapar(filtroTexto)}">
      </div>
      <label class="check"><input type="checkbox" id="ver-ocultos" ${mostrarOcultos ? 'checked' : ''}>Mostrar ocultos</label>
    </div>
    <div data-grupos></div>
    <p class="secreto"><i class="fa-solid fa-user-secret" aria-hidden="true"></i><span>Aquí nunca vas a ver quién guardó qué.</span></p>`;

  const pintar = () => {
    const t = filtroTexto.trim().toLowerCase();
    const visibles = todos.filter((g) => (mostrarOcultos || g.activo) && (!t || g.nombre.toLowerCase().includes(t)));
    const grupos = secciones.map((s) => ({ s, items: visibles.filter((g) => g.seccion_slug === s.slug) })).filter((g) => g.items.length);
    const sinSeccion = visibles.filter((g) => !g.seccion_slug);
    if (sinSeccion.length) grupos.push({ s: { nombre: 'Sin categoría', slug: '', icono: 'fa-solid fa-circle-question' }, items: sinSeccion });
    $('[data-grupos]', p).innerHTML = grupos.length ? grupos.map(({ s, items }) => `
      <section class="grupo-admin" style="${estiloCategoria(s)}">
        <h2 class="grupo-admin__titulo"><i class="${escapar(s.icono)}" aria-hidden="true"></i>${escapar(s.nombre)} <small>(${items.length})</small></h2>
        <ul class="filas">${items.map(filaAdmin).join('')}</ul>
      </section>`).join('') : '<div class="vacio"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><p>No hay regalos con ese nombre.</p></div>';
  };
  pintar();

  $('#buscar', p).addEventListener('input', (e) => { filtroTexto = e.target.value; pintar(); });
  $('#ver-ocultos', p).addEventListener('change', (e) => { mostrarOcultos = e.target.checked; pintar(); });

  p.addEventListener('change', async (e) => {
    const sw = e.target.closest('[data-activo]');
    if (!sw) return;
    const g = todos.find((x) => x.id === sw.dataset.activo);
    sw.disabled = true;
    const { error: err } = await supabase.rpc('admin_cambiar_activo', { p_id: g.id, p_activo: sw.checked });
    sw.disabled = false;
    if (err) { sw.checked = !sw.checked; toast('No se pudo cambiar.', { tipo: 'error' }); return; }
    g.activo = sw.checked;
    olvidarRegalos();
    toast(g.activo ? 'Ahora se ve en la lista' : 'Regalo oculto');
    pintar();
  });

  p.addEventListener('click', async (e) => {
    const menu = e.target.closest('[data-menu]');
    if (!menu && !e.target.closest('.fila__acciones')) {
      $$('.fila__acciones.abierto', p).forEach((x) => x.classList.remove('abierto'));
      $$('[data-menu]', p).forEach((x) => x.setAttribute('aria-expanded', 'false'));
    }
    if (menu) {
      const acc = document.getElementById(`acc-${menu.dataset.menu}`);
      const abrir = !acc.classList.contains('abierto');
      $$('.fila__acciones.abierto', p).forEach((x) => x.classList.remove('abierto'));
      $$('[data-menu]', p).forEach((x) => x.setAttribute('aria-expanded', 'false'));
      acc.classList.toggle('abierto', abrir);
      menu.setAttribute('aria-expanded', String(abrir));
      return;
    }
    const ed = e.target.closest('[data-editar]');
    if (ed) {
      const g = todos.find((x) => x.id === ed.dataset.editar);
      form = nuevoForm({
        id: g.id, nombre: g.nombre, seccion_slug: g.seccion_slug || '', tipo: g.tipo, precio: g.precio == null ? '' : String(g.precio),
        descripcion: g.descripcion || '', talla: g.talla || '', nota: g.nota || '', tienda: g.tienda || '', imagen_url: g.imagen_url || '',
        enlace_url: g.enlace_url || '', activo: g.activo, mostrar: true,
      });
      await cambiarPestana('agregar');
      window.scrollTo({ top: 0 });
      return;
    }
    const bo = e.target.closest('[data-borrar]');
    if (bo) {
      const g = todos.find((x) => x.id === bo.dataset.borrar);
      const si = await modal({ icono: 'fa-trash', titulo: `¿Borrar ${g.nombre}?`, texto: 'Se borra de la lista para siempre.', confirmar: 'Sí, borrarlo', cancelar: 'Cancelar', peligro: true });
      if (!si) return;
      const { error: err } = await supabase.rpc('admin_eliminar_regalo', { p_id: g.id });
      if (err) {
        if (codigoError(err) === 'tiene_reservas') {
          const v = await modal({ icono: 'fa-eye-slash', titulo: 'Alguien ya lo guardó', texto: 'Mejor ocúltalo para no arruinarle el regalo.', confirmar: 'Ocultar', cancelar: 'Cancelar' });
          if (v) {
            const { error: e2 } = await supabase.rpc('admin_cambiar_activo', { p_id: g.id, p_activo: false });
            if (!e2) { g.activo = false; olvidarRegalos(); toast('Regalo oculto'); pintar(); }
          }
          return;
        }
        toast('No se pudo borrar.', { tipo: 'error' });
        return;
      }
      todos.splice(todos.indexOf(g), 1);
      olvidarRegalos();
      toast('Regalo borrado');
      pintar();
    }
  });
}

function filaAdmin(g) {
  const s = seccionPorSlug(g.seccion_slug) || {};
  return `
    <li class="fila${g.activo ? '' : ' fila--oculto'}">
      <div class="fila__img" style="${estiloCategoria(s)}">${imagenRegalo({ ...g, seccion_icono: s.icono })}</div>
      <div style="min-width:0">
        <p class="fila__nombre">${escapar(g.nombre)}</p>
        <p class="fila__datos">
          <span>${escapar(textoPrecio(g.precio))}</span><span aria-hidden="true">·</span>
          <span>${g.tipo === 'exclusivo' ? 'Una persona' : 'Compartido'}</span>
          ${g.activo ? '' : '<span class="etiqueta" style="background:var(--ink-black)">Oculto</span>'}
        </p>
      </div>
      <button class="btn btn--icono fila__menu-boton" type="button" data-menu="${escapar(g.id)}" aria-expanded="false" aria-controls="acc-${escapar(g.id)}" aria-label="Opciones de ${escapar(g.nombre)}" style="--btn-fondo:var(--ink-black);--btn-texto:var(--bone);border-color:var(--oxford);box-shadow:none"><i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i></button>
      <div class="fila__acciones" id="acc-${escapar(g.id)}">
        <label class="switch-fila" title="Mostrar u ocultar">
          <span class="switch"><input type="checkbox" data-activo="${escapar(g.id)}" ${g.activo ? 'checked' : ''} aria-label="Visible: ${escapar(g.nombre)}"><span></span></span>
          <span class="etq">Visible</span>
        </label>
        <button class="btn btn--icono" type="button" data-editar="${escapar(g.id)}" aria-label="Editar ${escapar(g.nombre)}"><i class="fa-solid fa-pen" aria-hidden="true"></i><span class="etq">Editar</span></button>
        <button class="btn btn--icono" type="button" data-borrar="${escapar(g.id)}" aria-label="Borrar ${escapar(g.nombre)}"><i class="fa-solid fa-trash" aria-hidden="true"></i><span class="etq">Borrar</span></button>
      </div>
    </li>`;
}

// ---------- Resumen (se muestra en Spoiler) ----------

export async function pintarResumen(p) {
  const { data, error } = await supabase.rpc('admin_resumen');
  if (error) { p.innerHTML = '<div class="vacio"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i><p>No se pudo cargar el resumen.</p></div>'; return; }
  const r = Array.isArray(data) ? data[0] : data;
  const total = r?.exclusivos_total || 0;
  const apartados = r?.exclusivos_apartados || 0;
  const pct = total ? Math.round((apartados / total) * 100) : 0;
  const dias = diasParaCumple();
  p.innerHTML = `
    <div class="resumen">
      <article class="dato"><i class="fa-solid fa-users" aria-hidden="true"></i><span class="dato__num">${formatoNumero(r?.personas_registradas || 0)}</span><span class="dato__etq">Personas registradas</span></article>
      <article class="dato"><i class="fa-solid fa-lock" aria-hidden="true"></i><span class="dato__num">${apartados} <small>de ${total}</small></span>
        <div><div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${apartados}" aria-label="Regalos apartados"><span style="--p:${pct}%"></span></div></div>
        <span class="dato__etq">Regalos apartados</span></article>
      <article class="dato"><i class="fa-solid fa-user-group" aria-hidden="true"></i><span class="dato__num">${formatoNumero(r?.compartidos_guardados || 0)}</span><span class="dato__etq">Regalos compartidos guardados</span></article>
      <article class="dato"><i class="fa-solid fa-cake-candles" aria-hidden="true"></i><span class="dato__num">${dias > 0 ? dias : dias === 0 ? 'Hoy' : 0}</span><span class="dato__etq">${dias > 0 ? (dias === 1 ? 'Día para el 6 de diciembre' : 'Días para el 6 de diciembre') : dias === 0 ? 'Es tu cumple' : 'Ya pasó el 6 de diciembre'}</span></article>
    </div>
    <p class="secreto" style="margin-top:var(--sp-6)"><i class="fa-solid fa-user-secret" aria-hidden="true"></i><span>Aquí nunca vas a ver quién guardó qué.</span></p>`;
}
