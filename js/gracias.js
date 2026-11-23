// Pantalla de agradecimiento que aparece al guardar un regalo.
import { atraparFoco, confeti, movimientoReducido, diasParaCumple } from './ui.js';

let lista;
async function imagenes() {
  if (!lista) lista = fetch('./assets/gracias/gracias.json').then((r) => r.json()).catch(() => []);
  return lista;
}

function precargar(src) {
  return new Promise((r) => {
    const img = new Image();
    img.onload = () => r(true);
    img.onerror = () => r(false);
    img.src = src;
    setTimeout(() => r(false), 2500);
  });
}

let ultima = null;

function textoDias() {
  const d = diasParaCumple();
  if (d < 0) return '';
  if (d === 0) return '<p class="gracias__dias">Es hoy, eh</p>';
  return `<p class="gracias__dias">Te ${d === 1 ? 'queda' : 'quedan'} <span>${d}</span> ${d === 1 ? 'día' : 'días'} para conseguirlo, eh</p>`;
}

/** Muestra la capa de gracias. La promesa termina cuando se cierra. */
export async function mostrarGracias() {
  const archivos = await imagenes();
  let src = null;
  if (archivos.length) {
    const opciones = archivos.length > 1 ? archivos.filter((a) => a !== ultima) : archivos;
    ultima = opciones[Math.floor(Math.random() * opciones.length)];
    src = `./assets/gracias/${ultima}`;
    if (!(await precargar(src))) src = null;
  }

  return new Promise((resolver) => {
    const capa = document.createElement('div');
    capa.className = 'gracias';
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-label', 'Gracias');
    capa.tabIndex = -1;
    capa.innerHTML = `
      <p class="gracias__titulo" aria-hidden="true">Gracias</p>
      ${src ? `<figure class="polaroid gracias__foto"><img src="${src}" alt=""></figure>` : ''}
      ${textoDias()}
      <p class="gracias__ayuda"><i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>Toca cualquier parte de la pantalla para continuar</p>`;
    document.body.append(capa);
    capa.focus();
    confeti(50);

    let cerrada = false;
    const cerrar = () => {
      if (cerrada) return;
      cerrada = true;
      liberar();
      capa.classList.add('saliendo');
      setTimeout(() => { capa.remove(); resolver(); }, movimientoReducido() ? 200 : 320);
    };
    const liberar = atraparFoco(capa, cerrar);
    // No se cierra sola: espera a que la persona toque. El primer medio segundo
    // se ignora para que un doble toque no la cierre antes de verla.
    const desde = Date.now();
    capa.addEventListener('click', () => { if (Date.now() - desde > 500) cerrar(); });
  });
}
