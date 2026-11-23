// Pantalla de agradecimiento que aparece al guardar un regalo.
import { atraparFoco, confeti, movimientoReducido } from './ui.js';

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
      <p class="gracias__ayuda">Toca la pantalla para continuar</p>`;
    document.body.append(capa);
    capa.focus();
    confeti(50);

    let cerrada = false;
    const cerrar = () => {
      if (cerrada) return;
      cerrada = true;
      liberar();
      clearTimeout(t);
      capa.classList.add('saliendo');
      setTimeout(() => { capa.remove(); resolver(); }, movimientoReducido() ? 200 : 320);
    };
    const liberar = atraparFoco(capa, cerrar);
    const t = setTimeout(cerrar, 2800);
    capa.addEventListener('click', cerrar);
  });
}
