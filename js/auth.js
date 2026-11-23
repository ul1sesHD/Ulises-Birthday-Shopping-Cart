// Registro, inicio de sesion, recordar usuario y nueva contrasena.
import { supabase, llamarFuncion, esDemo } from './supabase.js';
import { SITIO_URL } from './config.js';
import { $, escapar, toast } from './ui.js';
import { alIniciarSesion, app } from './router.js';

const RE_USUARIO = /^[a-z0-9_.]{3,20}$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function cargarPerfil(sesion) {
  if (!sesion) return null;
  const { data } = await supabase.from('perfiles').select('id, usuario, nombre, es_admin').eq('id', sesion.user.id).maybeSingle();
  return data || { id: sesion.user.id, usuario: sesion.user.user_metadata?.usuario || '', nombre: sesion.user.user_metadata?.nombre || '', es_admin: false };
}

// ---------- Piezas del formulario ----------

function campo({ id, etiqueta, tipo = 'text', icono, auto = 'off', ayuda = '', extra = '' }) {
  const esClave = tipo === 'password';
  return `
    <div class="campo">
      <label class="campo__etiqueta" for="${id}">${escapar(etiqueta)}</label>
      <div class="campo__caja">
        <i class="fa-solid ${icono}" aria-hidden="true"></i>
        <input class="input" id="${id}" name="${id}" type="${tipo}" autocomplete="${auto}" aria-describedby="${id}-error${ayuda ? ` ${id}-ayuda` : ''}" ${extra}>
        ${esClave ? `<button class="campo__ojo" type="button" data-ojo="${id}" aria-label="Mostrar contraseña" aria-pressed="false"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>` : ''}
      </div>
      ${ayuda ? `<span class="campo__ayuda" id="${id}-ayuda">${ayuda}</span>` : ''}
      <span class="campo__error" id="${id}-error" role="alert"></span>
    </div>`;
}

function panel({ titulo, texto, nota = '', cuerpo, pie = '' }) {
  return `
    <section class="acceso">
      <div class="acceso__panel">
        <span class="acceso__marca" aria-hidden="true">23</span>
        <header class="acceso__cabeza">
          <h1 class="acceso__titulo">${titulo}</h1>
          ${texto ? `<p class="acceso__texto">${texto}</p>` : ''}
          ${nota ? `<p class="acceso__nota"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>${nota}</span></p>` : ''}
        </header>
        ${cuerpo}
        ${pie ? `<div class="acceso__pie">${pie}</div>` : ''}
      </div>
    </section>`;
}

function errorEn(form, id, mensaje) {
  const input = form.querySelector(`#${id}`);
  const caja = form.querySelector(`#${id}-error`);
  if (!input || !caja) return;
  caja.innerHTML = mensaje ? `<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>${escapar(mensaje)}` : '';
  input.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
}

function prepararForm(form) {
  form.addEventListener('input', (e) => { if (e.target.id) errorEn(form, e.target.id, ''); });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ojo]');
    if (!b) return;
    const input = form.querySelector(`#${b.dataset.ojo}`);
    const ver = input.type === 'password';
    input.type = ver ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(ver));
    b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
    b.innerHTML = `<i class="fa-solid ${ver ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
  });
}

function ocupado(boton, si, texto) {
  boton.disabled = si;
  if (si) { boton.dataset.html = boton.innerHTML; boton.innerHTML = `<i class="fa-solid fa-spinner fa-spin-lento" aria-hidden="true"></i>${escapar(texto)}`; }
  else if (boton.dataset.html) boton.innerHTML = boton.dataset.html;
}

function entrada(vista) {
  const v = $('#vista');
  v.innerHTML = vista;
  if (app.desdeIntro) $('.acceso__panel', v)?.classList.add('cascada');
  return $('form', v);
}

const demoAviso = () => esDemo ? '<span>Modo demo: crea una cuenta de prueba. Con el usuario <strong>uli</strong> entras como admin.</span>' : '';

// ---------- Entrar ----------

export function vistaEntrar() {
  const form = entrada(panel({
    titulo: 'Hola, <span>entra</span>',
    texto: 'Con tu usuario y contraseña ves los regalos y apartas el tuyo.',
    nota: 'Si es tu primera vez, crea tu cuenta. Puede ser cualquier correo y cualquier contraseña.',
    cuerpo: `
      <form class="acceso__form" novalidate>
        ${campo({ id: 'usuario', etiqueta: 'Usuario', icono: 'fa-user', auto: 'username', extra: 'autocapitalize="none" spellcheck="false" required' })}
        ${campo({ id: 'clave', etiqueta: 'Contraseña', tipo: 'password', icono: 'fa-lock', auto: 'current-password', extra: 'required' })}
        <button class="btn btn--grande btn--bloque" type="submit"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i>Entrar</button>
        <button class="enlace" type="button" data-olvide style="align-self:center">Olvidé mi contraseña</button>
      </form>`,
    pie: `<span>¿Primera vez aquí? <a href="#/registro">Crea tu cuenta</a></span><span><a href="#/recordar">No me acuerdo de mi usuario</a></span>${demoAviso()}`,
  }));
  prepararForm(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = form.usuario.value.trim();
    const clave = form.clave.value;
    let ok = true;
    if (!usuario) { errorEn(form, 'usuario', 'Escribe tu usuario.'); ok = false; }
    if (!clave) { errorEn(form, 'clave', 'Escribe tu contraseña.'); ok = false; }
    if (!ok) return;
    const boton = form.querySelector('[type="submit"]');
    ocupado(boton, true, 'Entrando');
    try {
      let sesion = null;
      if (usuario.includes('@')) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: usuario.toLowerCase(), password: clave });
        if (!error) sesion = data.session;
      } else {
        const r = await llamarFuncion('login-usuario', { usuario: usuario.toLowerCase(), password: clave });
        if (r.ok && r.data?.access_token) {
          const { data, error } = await supabase.auth.setSession({ access_token: r.data.access_token, refresh_token: r.data.refresh_token });
          if (!error) sesion = data.session;
        }
      }
      if (!sesion) {
        errorEn(form, 'clave', 'Usuario o contraseña incorrectos.');
        ocupado(boton, false);
        return;
      }
      await alIniciarSesion(sesion);
    } catch (err) {
      console.error(err);
      errorEn(form, 'clave', 'No pudimos conectar. Intenta otra vez.');
      ocupado(boton, false);
    }
  });

  form.querySelector('[data-olvide]').addEventListener('click', () => vistaOlvide());
}

// ---------- Olvide mi contrasena ----------

function vistaOlvide() {
  const form = entrada(panel({
    titulo: 'Nueva <span>contraseña</span>',
    texto: 'Escribe el correo con el que te registraste y te mandamos un enlace para cambiarla.',
    cuerpo: `
      <form class="acceso__form" novalidate>
        ${campo({ id: 'correo', etiqueta: 'Correo', tipo: 'email', icono: 'fa-envelope', auto: 'email', extra: 'required' })}
        <div data-aviso></div>
        <button class="btn btn--grande btn--bloque" type="submit"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i>Enviar enlace</button>
      </form>`,
    pie: '<a href="#/entrar">Volver a entrar</a>',
  }));
  prepararForm(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = form.correo.value.trim().toLowerCase();
    if (!RE_CORREO.test(correo)) return errorEn(form, 'correo', 'Revisa el correo.');
    const boton = form.querySelector('[type="submit"]');
    ocupado(boton, true, 'Enviando');
    await supabase.auth.resetPasswordForEmail(correo, { redirectTo: SITIO_URL });
    ocupado(boton, false);
    form.querySelector('[data-aviso]').innerHTML = `<p class="acceso__aviso"><i class="fa-solid fa-envelope-circle-check" aria-hidden="true"></i><span>Si ese correo está registrado, te llegará un enlace para cambiar tu contraseña.</span></p>`;
  });
}

export function vistaNuevaContrasena() {
  const form = entrada(panel({
    titulo: 'Elige tu nueva <span>contraseña</span>',
    texto: 'Mínimo 8 caracteres.',
    cuerpo: `
      <form class="acceso__form" novalidate>
        ${campo({ id: 'clave', etiqueta: 'Nueva contraseña', tipo: 'password', icono: 'fa-lock', auto: 'new-password', extra: 'required minlength="8"' })}
        ${campo({ id: 'clave2', etiqueta: 'Confírmala', tipo: 'password', icono: 'fa-lock', auto: 'new-password', extra: 'required' })}
        <button class="btn btn--grande btn--bloque" type="submit"><i class="fa-solid fa-check" aria-hidden="true"></i>Guardar contraseña</button>
      </form>`,
  }));
  prepararForm(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.clave.value.length < 8) return errorEn(form, 'clave', 'Usa mínimo 8 caracteres.');
    if (form.clave.value !== form.clave2.value) return errorEn(form, 'clave2', 'Las contraseñas no coinciden.');
    const boton = form.querySelector('[type="submit"]');
    ocupado(boton, true, 'Guardando');
    const { error } = await supabase.auth.updateUser({ password: form.clave.value });
    if (error) { ocupado(boton, false); return errorEn(form, 'clave', 'No se pudo guardar. Pide otro enlace.'); }
    toast('Contraseña actualizada');
    const { data } = await supabase.auth.getSession();
    if (data.session) await alIniciarSesion(data.session);
    else location.hash = '#/entrar';
  });
}

// ---------- Registro ----------

export function vistaRegistro() {
  const form = entrada(panel({
    titulo: 'Crea tu <span>cuenta</span>',
    texto: 'Solo la usas para apartar tu regalo. Uli no ve quién guardó qué.',
    nota: 'Puede ser cualquier correo y cualquier contraseña.',
    cuerpo: `
      <form class="acceso__form" novalidate>
        ${campo({ id: 'nombre', etiqueta: 'Tu nombre', icono: 'fa-face-smile', auto: 'name', extra: 'required maxlength="60"' })}
        ${campo({ id: 'usuario', etiqueta: 'Usuario', icono: 'fa-user', auto: 'username', ayuda: 'De 3 a 20 letras minúsculas, números, punto o guion bajo.', extra: 'autocapitalize="none" spellcheck="false" required maxlength="20"' })}
        <span class="campo__estado" data-estado-usuario aria-live="polite"></span>
        ${campo({ id: 'correo', etiqueta: 'Correo', tipo: 'email', icono: 'fa-envelope', auto: 'email', ayuda: 'Si es un correo real, te sirve para recuperar tu usuario o contraseña.', extra: 'required' })}
        ${campo({ id: 'clave', etiqueta: 'Contraseña', tipo: 'password', icono: 'fa-lock', auto: 'new-password', ayuda: 'Mínimo 8 caracteres.', extra: 'required minlength="8"' })}
        ${campo({ id: 'clave2', etiqueta: 'Confirma tu contraseña', tipo: 'password', icono: 'fa-lock', auto: 'new-password', extra: 'required' })}
        <div data-aviso></div>
        <button class="btn btn--grande btn--bloque" type="submit"><i class="fa-solid fa-user-plus" aria-hidden="true"></i>Crear cuenta</button>
      </form>`,
    pie: `<span>¿Ya tienes cuenta? <a href="#/entrar">Entra aquí</a></span>${demoAviso()}`,
  }));
  prepararForm(form);

  const estado = form.querySelector('[data-estado-usuario]');
  let temporizador;
  let disponible = null;
  form.usuario.addEventListener('input', () => {
    const limpio = form.usuario.value.toLowerCase().replace(/\s/g, '');
    if (limpio !== form.usuario.value) form.usuario.value = limpio;
    disponible = null;
    estado.textContent = '';
    estado.className = 'campo__estado';
    clearTimeout(temporizador);
    if (!limpio) return;
    if (!RE_USUARIO.test(limpio)) {
      estado.textContent = limpio.length < 3 ? '' : 'Solo minúsculas, números, punto o guion bajo.';
      estado.classList.add('campo__estado--mal');
      return;
    }
    temporizador = setTimeout(async () => {
      const { data, error } = await supabase.rpc('usuario_disponible', { p_usuario: limpio });
      if (error || form.usuario.value !== limpio) return;
      disponible = !!data;
      estado.innerHTML = data ? '<i class="fa-solid fa-check" aria-hidden="true"></i> Está libre' : '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Ese usuario ya existe';
      estado.classList.add(data ? 'campo__estado--ok' : 'campo__estado--mal');
    }, 400);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = form.nombre.value.trim();
    const usuario = form.usuario.value.trim().toLowerCase();
    const correo = form.correo.value.trim().toLowerCase();
    const clave = form.clave.value;
    let ok = true;
    if (!nombre) { errorEn(form, 'nombre', 'Escribe tu nombre.'); ok = false; }
    if (!RE_USUARIO.test(usuario)) { errorEn(form, 'usuario', 'De 3 a 20 caracteres: minúsculas, números, punto o guion bajo.'); ok = false; }
    else if (disponible === false) { errorEn(form, 'usuario', 'Ese usuario ya existe. Prueba otro.'); ok = false; }
    if (!RE_CORREO.test(correo)) { errorEn(form, 'correo', 'Revisa el correo.'); ok = false; }
    if (clave.length < 8) { errorEn(form, 'clave', 'Usa mínimo 8 caracteres.'); ok = false; }
    if (clave !== form.clave2.value) { errorEn(form, 'clave2', 'Las contraseñas no coinciden.'); ok = false; }
    if (!ok) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }

    const boton = form.querySelector('[type="submit"]');
    ocupado(boton, true, 'Creando cuenta');
    const { data: libre } = await supabase.rpc('usuario_disponible', { p_usuario: usuario });
    if (libre === false) { ocupado(boton, false); return errorEn(form, 'usuario', 'Ese usuario ya existe. Prueba otro.'); }

    const { data, error } = await supabase.auth.signUp({
      email: correo, password: clave,
      options: { data: { usuario, nombre }, emailRedirectTo: SITIO_URL },
    });
    if (error) {
      ocupado(boton, false);
      const m = (error.message || '').toLowerCase();
      if (m.includes('registered') || m.includes('already')) return errorEn(form, 'correo', 'Ese correo ya tiene cuenta. Entra o recupera tu usuario.');
      if (m.includes('password')) return errorEn(form, 'clave', 'Esa contraseña no se puede usar. Prueba otra más larga.');
      if (m.includes('usuario') || m.includes('database')) return errorEn(form, 'usuario', 'Ese usuario ya existe. Prueba otro.');
      return errorEn(form, 'correo', 'No se pudo crear la cuenta. Intenta otra vez.');
    }
    llamarFuncion('enviar-usuario', { email: correo }).catch(() => {});
    if (data.session) {
      toast(`Qué gusto tenerte aquí, ${nombre.split(" ")[0]}`);
      await alIniciarSesion(data.session);
    } else {
      ocupado(boton, false);
      form.querySelector('[data-aviso]').innerHTML = `<p class="acceso__aviso"><i class="fa-solid fa-envelope-circle-check" aria-hidden="true"></i><span>Listo. Te mandamos un correo a ${escapar(correo)} para confirmar tu cuenta. Después entra con tu usuario <strong>${escapar(usuario)}</strong>.</span></p>`;
      boton.hidden = true;
    }
  });
}

// ---------- Recordar usuario ----------

export function vistaRecordar() {
  const form = entrada(panel({
    titulo: '¿Cuál era mi <span>usuario</span>?',
    texto: 'Escribe tu correo y te lo mandamos.',
    cuerpo: `
      <form class="acceso__form" novalidate>
        ${campo({ id: 'correo', etiqueta: 'Correo', tipo: 'email', icono: 'fa-envelope', auto: 'email', extra: 'required' })}
        <div data-aviso></div>
        <button class="btn btn--grande btn--bloque" type="submit"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i>Mandarme mi usuario</button>
      </form>`,
    pie: '<a href="#/entrar">Volver a entrar</a>',
  }));
  prepararForm(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = form.correo.value.trim().toLowerCase();
    if (!RE_CORREO.test(correo)) return errorEn(form, 'correo', 'Revisa el correo.');
    const boton = form.querySelector('[type="submit"]');
    ocupado(boton, true, 'Enviando');
    try { await llamarFuncion('enviar-usuario', { email: correo }); } catch { /* siempre el mismo mensaje */ }
    ocupado(boton, false);
    form.querySelector('[data-aviso]').innerHTML = `<p class="acceso__aviso"><i class="fa-solid fa-envelope-circle-check" aria-hidden="true"></i><span>Si ese correo está registrado, te enviamos tu usuario.</span></p>`;
  });
}
