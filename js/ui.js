// Utilidades de interfaz: toasts, modales, confeti y formato.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function escapar(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const movimientoReducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const fmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

/** "Gratis", "Tú decides" o "$349 aprox." */
export function textoPrecio(precio, { conMoneda = false } = {}) {
  if (precio === null || precio === undefined || precio === '') return 'Tú decides';
  const n = Number(precio);
  if (n === 0) return 'Gratis';
  return `$${fmt.format(n)}${conMoneda ? ' MXN' : ''} aprox.`;
}

export const formatoNumero = (n) => fmt.format(n);

/** Variables CSS de color de una categoria */
export function estiloCategoria(c) {
  if (!c) return '';
  const fondo = c.color_fondo || '#fff3c2';
  const icono = c.color_icono || '#f0b400';
  const texto = c.color_texto || '#000814';
  return `--cat-fondo:${escapar(fondo)};--cat-icono:${escapar(icono)};--cat-texto:${escapar(texto)}`;
}

/** Imagen del regalo o bloque con el icono de la categoria */
export function imagenRegalo(r, { alt = '', cargar = 'lazy' } = {}) {
  if (r.imagen_url) {
    return `<img src="${escapar(r.imagen_url)}" alt="${escapar(alt)}" width="640" height="640" loading="${cargar}" decoding="async" referrerpolicy="no-referrer" data-icono="${escapar(r.seccion_icono || 'fa-solid fa-gift')}">`;
  }
  return bloqueSinImagen(r.seccion_icono);
}

const bloqueSinImagen = (icono) => `<div class="sin-imagen"><i class="${escapar(icono || 'fa-solid fa-gift')}" aria-hidden="true"></i></div>`;

// Si una imagen de regalo no carga, se cambia por el bloque con el icono de la categoria.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.dataset.icono) {
    img.insertAdjacentHTML('afterend', bloqueSinImagen(img.dataset.icono));
    img.remove();
  }
}, true);

// ---------- Toasts ----------

let contToasts;
export function toast(mensaje, { tipo = 'ok', accion = null, duracion = 3600 } = {}) {
  if (!contToasts) {
    contToasts = document.createElement('div');
    contToasts.className = 'toasts';
    contToasts.setAttribute('role', 'status');
    contToasts.setAttribute('aria-live', 'polite');
    document.body.append(contToasts);
  }
  const t = document.createElement('div');
  t.className = `toast${tipo === 'error' ? ' toast--error' : ''}`;
  const icono = tipo === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check';
  t.innerHTML = `<i class="fa-solid ${icono}" aria-hidden="true"></i><span>${escapar(mensaje)}</span>`;
  if (accion) {
    const b = document.createElement(accion.href ? 'a' : 'button');
    b.className = 'toast__accion';
    b.textContent = accion.texto;
    if (accion.href) b.href = accion.href;
    else b.type = 'button';
    b.addEventListener('click', () => { accion.alClic?.(); quitar(); });
    t.append(b);
  }
  contToasts.append(t);
  const quitar = () => {
    t.style.transition = 'opacity 250ms';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 260);
  };
  setTimeout(quitar, accion ? duracion + 2400 : duracion);
}

// ---------- Modales con foco atrapado ----------

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function atraparFoco(contenedor, alEscape) {
  const previo = document.activeElement;
  const manejar = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); alEscape?.(); return; }
    if (e.key !== 'Tab') return;
    const items = $$(ENFOCABLES, contenedor).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) { e.preventDefault(); return; }
    const primero = items[0];
    const ultimo = items[items.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  };
  document.addEventListener('keydown', manejar);
  return () => {
    document.removeEventListener('keydown', manejar);
    if (previo && document.contains(previo)) previo.focus?.();
  };
}

/**
 * Modal de confirmacion. Devuelve una promesa con true (confirmar) o false.
 * extra: [{ texto, icono, clase, valor }] botones adicionales; la promesa devuelve su valor.
 */
export function modal({ icono = 'fa-circle-question', titulo, texto = '', confirmar = 'Aceptar', cancelar = 'Cancelar', peligro = false, extra = [] }) {
  return new Promise((resolver) => {
    const capa = document.createElement('div');
    capa.className = 'modal-capa';
    const idT = `m-${Math.random().toString(36).slice(2, 8)}`;
    capa.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="${idT}">
        <i class="fa-solid ${icono} modal__icono" aria-hidden="true"></i>
        <h2 class="modal__titulo" id="${idT}">${escapar(titulo)}</h2>
        ${texto ? `<p class="modal__texto">${escapar(texto)}</p>` : '<div style="height:12px"></div>'}
        <div class="modal__acciones">
          ${confirmar ? `<button type="button" class="btn ${peligro ? 'btn--peligro' : ''}" data-v="si">${escapar(confirmar)}</button>` : ''}
          ${extra.map((b, i) => `<button type="button" class="btn ${b.clase || ''}" data-extra="${i}">${b.icono ? `<i class="fa-solid ${b.icono}" aria-hidden="true"></i>` : ''}${escapar(b.texto)}</button>`).join('')}
          ${cancelar ? `<button type="button" class="btn btn--secundario" data-v="no">${escapar(cancelar)}</button>` : ''}
        </div>
      </div>`;
    document.body.append(capa);
    document.body.style.overflow = 'hidden';
    const cerrar = (valor) => {
      liberar();
      document.body.style.overflow = '';
      capa.style.transition = 'opacity 160ms';
      capa.style.opacity = '0';
      setTimeout(() => capa.remove(), 170);
      resolver(valor);
    };
    const liberar = atraparFoco(capa, () => cerrar(false));
    capa.addEventListener('click', (e) => {
      if (e.target === capa) return cerrar(false);
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.extra !== undefined) return cerrar(extra[Number(b.dataset.extra)].valor);
      cerrar(b.dataset.v === 'si');
    });
    $('.modal button', capa)?.focus();
  });
}

// ---------- Confeti ----------

const COLORES = ['#ffc300', '#ffd60a', '#fdfbf5', '#2ec4b6', '#ff6b6b', '#003566', '#9fb0c8'];

export function confeti(cantidad = 50) {
  if (movimientoReducido()) return;
  const capa = document.createElement('div');
  capa.className = 'confeti';
  capa.setAttribute('aria-hidden', 'true');
  let quedan = cantidad;
  for (let i = 0; i < cantidad; i++) {
    const p = document.createElement('span');
    p.className = 'confeti__pieza';
    const tira = Math.random() < 0.4;
    p.style.cssText = [
      `--x:${Math.random() * 100}vw`,
      `--c:${COLORES[i % COLORES.length]}`,
      `--w:${tira ? 5 : 8 + Math.random() * 6}px`,
      `--h:${tira ? 18 + Math.random() * 10 : 8 + Math.random() * 6}px`,
      `--d:${1.8 + Math.random() * 1.4}s`,
      `--delay:${Math.random() * 0.5}s`,
      `--dx:${(Math.random() - 0.5) * 40}vw`,
      `--giro:${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg`,
    ].join(';');
    p.addEventListener('animationend', () => {
      p.remove();
      if (--quedan === 0) capa.remove();
    });
    capa.append(p);
  }
  document.body.append(capa);
  setTimeout(() => capa.remove(), 5000);
}

// ---------- Entrada de secciones al hacer scroll ----------

let observador;
export function observarRevelar(raiz = document) {
  const items = $$('.revelar', raiz);
  if (!('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('visible')); return; }
  observador ??= new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) { e.target.classList.add('visible'); observador.unobserve(e.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach((el) => observador.observe(el));
}

/** Dias que faltan para el 6 de diciembre de 2026 (hora local). */
export function diasParaCumple(desde = new Date()) {
  const hoy = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const cumple = new Date(2026, 11, 6);
  return Math.round((cumple - hoy) / 86400000);
}
