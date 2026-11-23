// Punto de entrada: sesion, navegacion y rutas por hash.
import { supabase, esDemo } from './supabase.js';
import { $, $$, escapar, toast } from './ui.js';
import { mostrarIntro } from './intro.js';
import { vistaBienvenida, vistaEntrar, vistaRegistro, cargarPerfil } from './auth.js';
import { vistaInicio, vistaCategoria, vistaDetalle, vistaMisRegalos, vistaSpoiler, olvidarRegalos } from './regalos.js';

export const app = {
  sesion: null,
  perfil: null,
  desdeIntro: false,
  get esAdmin() { return !!this.perfil?.es_admin; },
};

const PUBLICAS = new Set(['bienvenida', 'entrar', 'registro']);

const rutas = {
  inicio: () => vistaInicio(),
  categoria: (slug) => vistaCategoria(slug),
  regalo: (slug) => vistaDetalle(slug),
  'mis-regalos': () => vistaMisRegalos(),
  spoiler: () => {
    if (!app.esAdmin) { ir('#/inicio', true); return; }
    return vistaSpoiler();
  },
  admin: async () => {
    if (!app.esAdmin) { ir('#/inicio', true); return; }
    const { vistaAdmin } = await import('./admin.js');
    return vistaAdmin();
  },
  bienvenida: () => vistaBienvenida(),
  entrar: () => vistaEntrar(),
  registro: () => vistaRegistro(),
};

export function ir(hash, reemplazar = false) {
  if (location.hash === hash) { render(); return; }
  if (reemplazar) { history.replaceState(null, '', hash); render(); }
  else location.hash = hash;
}

function leerRuta() {
  const h = location.hash.replace(/^#\/?/, '');
  // Tokens que deja Supabase en la URL al confirmar o recuperar contrasena
  if (!h || h.includes('access_token=') || h.includes('error=')) return { nombre: '', param: '' };
  const [nombre, ...resto] = h.split('/');
  return { nombre: decodeURIComponent(nombre), param: decodeURIComponent(resto.join('/')) };
}

let renderEnCurso = 0;

export async function render() {
  const turno = ++renderEnCurso;
  let { nombre, param } = leerRuta();

  if (!app.sesion && !PUBLICAS.has(nombre)) { history.replaceState(null, '', '#/bienvenida'); nombre = 'bienvenida'; }
  if (app.sesion && (nombre === '' || !rutas[nombre] || PUBLICAS.has(nombre))) {
    history.replaceState(null, '', '#/inicio');
    nombre = 'inicio';
  }

  pintarNav(nombre);
  if (app.brilloNav) {
    app.brilloNav = false;
    const nav = $('#nav');
    nav.classList.remove('nav--brillo');
    void nav.offsetWidth;
    nav.classList.add('nav--brillo');
    setTimeout(() => nav.classList.remove('nav--brillo'), 4500);
  }
  const vista = $('#vista');
  vista.classList.remove('ruta-entra');
  document.body.classList.toggle('vista-sin-nav', !app.sesion);
  if (!app.desdeIntro) vista.innerHTML = '<div class="cargando" role="status"><i class="fa-solid fa-gift fa-bounce" aria-hidden="true"></i><span class="sr-only">Cargando</span></div>';

  try {
    await rutas[nombre](param);
  } catch (e) {
    console.error(e);
    if (turno !== renderEnCurso) return;
    vista.innerHTML = `<div class="vacio"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i><h2 class="titulo-seccion">No se pudo cargar</h2><p>Revisa tu conexión e intenta de nuevo.</p><button class="btn" type="button" onclick="location.reload()"><i class="fa-solid fa-rotate" aria-hidden="true"></i>Reintentar</button></div>`;
  }
  if (turno !== renderEnCurso) return;
  activarBarraUli(nombre);
  if (!app.desdeIntro) {
    void vista.offsetWidth;
    vista.classList.add('ruta-entra');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  app.desdeIntro = false;
  const h1 = vista.querySelector('h1, h2');
  document.title = h1 && nombre !== 'inicio' ? `${h1.textContent.trim()} | ULI 23` : 'ULI 23 | Los regalos de Uli';
}

function pintarNav(nombre) {
  const nav = $('#nav');
  if (!app.sesion) { nav.hidden = true; nav.innerHTML = ''; return; }
  nav.hidden = false;
  nav.classList.toggle("cascada", app.desdeIntro);
  nav.style.setProperty("--i", 0);
  const items = [
    { ruta: 'inicio', texto: 'Inicio', icono: 'fa-house' },
    { ruta: 'regalos', href: '#/inicio#categorias', texto: 'Regalos', icono: 'fa-gift' },
    { ruta: 'mis-regalos', texto: app.esAdmin ? 'Catálogo' : 'Mis regalos', icono: app.esAdmin ? 'fa-list' : 'fa-bookmark', oculto: app.esAdmin },
    { ruta: 'spoiler', texto: 'Spoiler', icono: 'fa-eye', oculto: !app.esAdmin },
    { ruta: 'admin', texto: 'Admin', icono: 'fa-screwdriver-wrench', oculto: !app.esAdmin },
  ];
  const activo = ['categoria', 'regalo'].includes(nombre) ? 'regalos' : nombre;
  nav.innerHTML = `
    <div class="nav__interior">
      <a class="nav__marca" href="#/inicio" aria-label="ULI 23, inicio">
        <span class="nav__marca-texto">ULI <span>23</span></span>
        <span class="nav__marca-uli" aria-hidden="true"><img src="./assets/img/foto-uli-mini.webp" alt="" width="40" height="40">Uli’s birthday</span>
      </a>
      <ul class="nav__lista">
        ${items.filter((i) => !i.oculto).map((i) => `
          <li><a class="nav__link" href="${i.href || '#/' + i.ruta}" data-ruta="${i.ruta}" ${activo === i.ruta ? 'aria-current="page"' : ''}>
            <i class="fa-solid ${i.icono}" aria-hidden="true"></i><span>${escapar(i.texto)}</span></a></li>`).join('')}
        <li><button class="nav__link" type="button" data-salir><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i><span>Salir</span></button></li>
      </ul>
    </div>`;
}

// Barra fija con la foto de Uli: en el inicio aparece al terminar de pasar el calendario,
// en las demas vistas con sesion esta siempre.
let observadorBarra = null;
function activarBarraUli(nombre) {
  observadorBarra?.disconnect();
  observadorBarra = null;
  let barra = $('#barra-uli');
  if (!barra) {
    barra = document.createElement('header');
    barra.id = 'barra-uli';
    barra.className = 'barra-uli';
    barra.innerHTML = '<a class="barra-uli__enlace" href="#/inicio" tabindex="-1"><img src="./assets/img/foto-uli-mini.webp" alt="" width="40" height="40"><span>Uli’s birthday</span></a>';
    barra.setAttribute('aria-hidden', 'true');
    document.body.prepend(barra);
  }
  const poner = (si) => document.body.classList.toggle('con-barra', si);
  if (!app.sesion || PUBLICAS.has(nombre)) { poner(false); document.body.classList.remove('barra-fija'); return; }
  const cal = $('#vista .cal');
  const fija = nombre !== 'inicio' || !cal;
  document.body.classList.toggle('barra-fija', fija);
  if (fija) { poner(true); return; }
  poner(false);
  observadorBarra = new IntersectionObserver(([e]) => {
    poner(!e.isIntersecting && e.boundingClientRect.top < 0);
  });
  observadorBarra.observe(cal);
}

// "Regalos" lleva al inicio y baja hasta las categorias
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-ruta="regalos"]');
  if (a) {
    e.preventDefault();
    const bajar = () => document.getElementById('categorias')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (leerRuta().nombre === 'inicio') bajar();
    else { ir('#/inicio'); setTimeout(bajar, 450); }
    return;
  }
  if (e.target.closest('[data-salir]')) salir();
});

async function salir() {
  await supabase.auth.signOut();
  app.sesion = null;
  app.perfil = null;
  olvidarRegalos();
  toast('Cerraste sesión');
  ir('#/bienvenida', true);
}

export async function alIniciarSesion(sesion, destino = '#/inicio') {
  app.sesion = sesion;
  app.perfil = await cargarPerfil(sesion);
  olvidarRegalos();
  ir(destino, true);
}

// ---------- Arranque ----------

async function arrancar() {
  const { data } = await supabase.auth.getSession();
  app.sesion = data.session;
  if (app.sesion) app.perfil = await cargarPerfil(app.sesion);

  supabase.auth.onAuthStateChange(async (evento, sesion) => {
    if (evento === 'TOKEN_REFRESHED' || evento === 'USER_UPDATED') {
      app.sesion = sesion;
    } else if (evento === 'SIGNED_OUT') {
      app.sesion = null;
      app.perfil = null;
    }
  });

  window.addEventListener('hashchange', render);

  if (esDemo) console.info('ULI 23 en modo demo: los datos se guardan solo en este navegador. La cuenta con usuario "uli" es admin.');

  if (!sessionStorage.getItem('uli23-intro')) {
    await mostrarIntro(async () => {
      sessionStorage.setItem('uli23-intro', '1');
      app.desdeIntro = true;
      await render();
    });
  } else {
    await render();
  }
}

arrancar();
