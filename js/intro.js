// Pantalla de bienvenida "bromita". Se ve una vez por sesion del navegador.
import { atraparFoco, movimientoReducido } from './ui.js';

export function mostrarIntro(alContinuar) {
  return new Promise((resolver) => {
    const intro = document.createElement('section');
    intro.className = 'intro';
    intro.setAttribute('aria-labelledby', 'intro-titulo');
    intro.innerHTML = `
      <i class="fa-solid fa-star intro__deco intro__deco--1" aria-hidden="true"></i>
      <i class="fa-solid fa-cake-candles intro__deco intro__deco--2" aria-hidden="true"></i>
      <i class="fa-solid fa-champagne-glasses intro__deco intro__deco--3" aria-hidden="true"></i>
      <h1 class="intro__texto" id="intro-titulo">
        <span class="intro__broma">bromita,</span>
        <span class="intro__medio">tu regalo es</span>
        <span class="intro__grande">mi presencia</span>
      </h1>
      <button type="button" class="intro__boton">
        <i class="fa-solid fa-gift" aria-hidden="true"></i>
        <span>Aun así te quiero regalar algo</span>
      </button>`;
    document.body.append(intro);
    document.getElementById('app').setAttribute('aria-hidden', 'true');
    const liberar = atraparFoco(intro);
    const boton = intro.querySelector('button');
    boton.focus();

    boton.addEventListener('click', async () => {
      boton.disabled = true;
      liberar();
      document.getElementById('app').removeAttribute('aria-hidden');
      const renderizar = alContinuar();
      intro.classList.add('saliendo');
      await new Promise((r) => setTimeout(r, movimientoReducido() ? 250 : 400));
      intro.remove();
      await renderizar;
      document.querySelector('#vista h1, #vista h2, #vista input')?.focus?.({ preventScroll: true });
      resolver();
    }, { once: true });
  });
}
