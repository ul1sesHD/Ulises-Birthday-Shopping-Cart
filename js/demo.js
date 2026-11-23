// Cliente de prueba: imita lo que usa la pagina de Supabase, guardando todo en localStorage.
// Solo se usa mientras js/config.js tenga los valores de ejemplo.

const CLAVE = 'uli23-demo-v2';

function cargarEstado() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || null; } catch { return null; }
}

function guardar(estado) { localStorage.setItem(CLAVE, JSON.stringify(estado)); }

async function estadoInicial() {
  const r = await fetch('./data/regalos.json');
  const cat = await r.json();
  const secciones = cat.secciones.map((s, i) => ({ id: i + 1, ...s }));
  const porSlug = Object.fromEntries(secciones.map((s) => [s.slug, s]));
  const orden = {};
  const regalos = cat.regalos.map((g) => {
    orden[g.seccion] = (orden[g.seccion] || 0) + 1;
    return {
      id: crypto.randomUUID(), slug: g.slug, seccion_id: porSlug[g.seccion]?.id ?? null, tipo: g.tipo,
      nombre: g.nombre, descripcion: g.descripcion || '', precio: g.precio, imagen_url: g.imagen || null,
      enlace_url: g.enlace, tienda: g.tienda, talla: g.talla, nota: g.nota, activo: true, orden: orden[g.seccion],
      creado_en: new Date().toISOString(),
    };
  });
  // Empieza sin reservas, igual que el Supabase real
  const reservas = [];
  return { secciones, regalos, reservas, usuarios: [], sesion: null };
}

const fallo = (message) => ({ data: null, error: { message } });

export function crearClienteDemo() {
  let estado = cargarEstado();
  const listo = estado ? Promise.resolve() : estadoInicial().then((e) => { estado = e; guardar(estado); });
  const oyentes = new Set();
  const avisar = (evento) => oyentes.forEach((f) => f(evento, estado.sesion));
  const uid = () => estado.sesion?.user?.id ?? null;
  const yo = () => estado.usuarios.find((u) => u.id === uid());
  const esAdmin = () => !!yo()?.es_admin;
  const seccion = (id) => estado.secciones.find((s) => s.id === id);
  const iniciar = (u) => {
    estado.sesion = { access_token: 'demo', user: { id: u.id, email: u.email, user_metadata: { usuario: u.usuario, nombre: u.nombre } } };
    guardar(estado);
    avisar('SIGNED_IN');
    return { data: { session: estado.sesion, user: estado.sesion.user }, error: null };
  };

  const rpcs = {
    usuario_disponible: ({ p_usuario }) => !estado.usuarios.some((u) => u.usuario === String(p_usuario).trim().toLowerCase()),
    es_admin: () => esAdmin(),
    listar_regalos: () => {
      if (!uid()) return [];
      return estado.regalos.filter((g) => g.activo).map((g) => {
        const s = seccion(g.seccion_id) || {};
        const rs = estado.reservas.filter((r) => r.regalo_id === g.id);
        const mio = rs.some((r) => r.usuario_id === uid());
        return {
          ...g, seccion_slug: s.slug, seccion: s.nombre, seccion_subtitulo: s.subtitulo, seccion_icono: s.icono,
          color_fondo: s.color_fondo, color_icono: s.color_icono, color_texto: s.color_texto, presupuesto: s.presupuesto,
          seccion_orden: s.orden, personas: rs.length,
          estado: mio ? 'mio' : g.tipo === 'exclusivo' && rs.length ? 'reservado' : 'disponible',
        };
      }).sort((a, b) => (a.seccion_orden - b.seccion_orden) || (a.orden - b.orden));
    },
    reservar_regalo: ({ p_regalo_id }) => {
      if (!uid()) throw new Error('no_autenticado');
      if (esAdmin()) throw new Error('admin_no_reserva');
      const g = estado.regalos.find((x) => x.id === p_regalo_id && x.activo);
      if (!g) throw new Error('regalo_no_existe');
      if (estado.reservas.some((r) => r.regalo_id === g.id && r.usuario_id === uid())) throw new Error('ya_lo_guardaste');
      if (g.tipo === 'exclusivo') {
        if (estado.reservas.some((r) => r.usuario_id === uid() && r.exclusivo)) throw new Error('ya_tienes_regalo');
        if (estado.reservas.some((r) => r.regalo_id === g.id && r.exclusivo)) throw new Error('regalo_tomado');
      }
      estado.reservas.push({ regalo_id: g.id, usuario_id: uid(), exclusivo: g.tipo === 'exclusivo' });
      return 'ok';
    },
    soltar_regalo: ({ p_regalo_id }) => {
      const antes = estado.reservas.length;
      estado.reservas = estado.reservas.filter((r) => !(r.regalo_id === p_regalo_id && r.usuario_id === uid()));
      return antes !== estado.reservas.length;
    },
    admin_listar_regalos: () => {
      if (!esAdmin()) throw new Error('solo_admin');
      return estado.regalos.map((g) => {
        const s = seccion(g.seccion_id) || {};
        return { ...g, seccion_slug: s.slug, seccion: s.nombre, personas: estado.reservas.filter((r) => r.regalo_id === g.id).length };
      }).sort((a, b) => ((seccion(a.seccion_id)?.orden ?? 99) - (seccion(b.seccion_id)?.orden ?? 99)) || (a.orden - b.orden));
    },
    admin_guardar_regalo: (p) => {
      if (!esAdmin()) throw new Error('solo_admin');
      if (!String(p.p_nombre || '').trim()) throw new Error('falta_nombre');
      if (!['exclusivo', 'compartido'].includes(p.p_tipo)) throw new Error('tipo_invalido');
      if (p.p_precio != null && p.p_precio < 0) throw new Error('precio_invalido');
      const s = estado.secciones.find((x) => x.slug === p.p_seccion_slug);
      if (!s) throw new Error('seccion_no_existe');
      const datos = {
        seccion_id: s.id, tipo: p.p_tipo, nombre: p.p_nombre.trim(), descripcion: p.p_descripcion || '', precio: p.p_precio ?? null,
        imagen_url: p.p_imagen_url || null, enlace_url: p.p_enlace_url || null, tienda: p.p_tienda || null,
        talla: p.p_talla || null, nota: p.p_nota || null, activo: p.p_activo ?? true,
      };
      if (!p.p_id) {
        let slug = datos.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'regalo';
        if (estado.regalos.some((g) => g.slug === slug)) slug += '-' + Math.random().toString(16).slice(2, 6);
        const g = { id: crypto.randomUUID(), slug, ...datos, orden: estado.regalos.filter((x) => x.seccion_id === s.id).length + 1, creado_en: new Date().toISOString() };
        estado.regalos.push(g);
        return g.id;
      }
      const g = estado.regalos.find((x) => x.id === p.p_id);
      if (!g) throw new Error('regalo_no_existe');
      if (p.p_tipo === 'exclusivo' && estado.reservas.filter((r) => r.regalo_id === g.id).length > 1) throw new Error('ya_lo_guardaron_varios');
      Object.assign(g, datos);
      estado.reservas.forEach((r) => { if (r.regalo_id === g.id) r.exclusivo = p.p_tipo === 'exclusivo'; });
      return g.id;
    },
    admin_cambiar_activo: ({ p_id, p_activo }) => {
      if (!esAdmin()) throw new Error('solo_admin');
      const g = estado.regalos.find((x) => x.id === p_id);
      if (g) g.activo = p_activo;
      return !!g;
    },
    admin_eliminar_regalo: ({ p_id }) => {
      if (!esAdmin()) throw new Error('solo_admin');
      if (estado.reservas.some((r) => r.regalo_id === p_id)) throw new Error('tiene_reservas');
      estado.regalos = estado.regalos.filter((g) => g.id !== p_id);
      return true;
    },
    admin_resumen: () => {
      if (!esAdmin()) throw new Error('solo_admin');
      return [{
        personas_registradas: estado.usuarios.filter((u) => !u.es_admin).length,
        exclusivos_total: estado.regalos.filter((g) => g.activo && g.tipo === 'exclusivo').length,
        exclusivos_apartados: estado.reservas.filter((r) => r.exclusivo).length,
        compartidos_guardados: estado.reservas.filter((r) => !r.exclusivo).length,
      }];
    },
  };

  const consulta = (tabla) => {
    const filtros = [];
    const q = {
      select() { return q; },
      eq(col, val) { filtros.push([col, val]); return q; },
      order() { return q; },
      async single() { const r = await q; return { data: r.data?.[0] ?? null, error: r.data?.[0] ? null : { message: 'sin_datos' } }; },
      async maybeSingle() { const r = await q; return { data: r.data?.[0] ?? null, error: null }; },
      then(ok, mal) {
        return listo.then(() => {
          let filas = tabla === 'perfiles' ? estado.usuarios.filter((u) => u.id === uid()) : tabla === 'secciones' ? [...estado.secciones].sort((a, b) => a.orden - b.orden) : [];
          for (const [c, v] of filtros) filas = filas.filter((f) => f[c] === v);
          return { data: filas, error: null };
        }).then(ok, mal);
      },
    };
    return q;
  };

  return {
    auth: {
      async getSession() { await listo; return { data: { session: estado.sesion }, error: null }; },
      onAuthStateChange(f) { oyentes.add(f); return { data: { subscription: { unsubscribe: () => oyentes.delete(f) } } }; },
      async signUp({ email, password, options }) {
        await listo;
        const usuario = String(options?.data?.usuario || '').toLowerCase();
        if (estado.usuarios.some((u) => u.email === email.toLowerCase())) return fallo('User already registered');
        if (estado.usuarios.some((u) => u.usuario === usuario)) return fallo('usuario_ocupado');
        const u = { id: crypto.randomUUID(), email: email.toLowerCase(), password, usuario, nombre: options?.data?.nombre || '', es_admin: usuario === 'uli' };
        estado.usuarios.push(u);
        return iniciar(u);
      },
      async signInWithPassword({ email, password }) {
        await listo;
        const u = estado.usuarios.find((x) => x.email === String(email).toLowerCase() && x.password === password);
        return u ? iniciar(u) : fallo('Invalid login credentials');
      },
      async setSession({ access_token }) {
        await listo;
        const u = estado.usuarios.find((x) => x.id === access_token);
        return u ? iniciar(u) : fallo('sesion_invalida');
      },
      async signOut() { await listo; estado.sesion = null; guardar(estado); avisar('SIGNED_OUT'); return { error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser({ password }) { const u = yo(); if (u) { u.password = password; guardar(estado); } return { data: {}, error: null }; },
    },
    async rpc(nombre, params = {}) {
      await listo;
      try {
        const data = rpcs[nombre](params);
        guardar(estado);
        return { data, error: null };
      } catch (e) { return fallo(e.message); }
    },
    from: consulta,
    storage: {
      from() {
        return {
          async upload(ruta, archivo) {
            const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(archivo); });
            sessionStorage.setItem('demo-img-' + ruta, url);
            return { data: { path: ruta }, error: null };
          },
          getPublicUrl(ruta) { return { data: { publicUrl: sessionStorage.getItem('demo-img-' + ruta) || '' } }; },
        };
      },
    },
    async __funcion(nombre, cuerpo) {
      await listo;
      if (nombre === 'login-usuario') {
        const u = estado.usuarios.find((x) => x.usuario === String(cuerpo.usuario).trim().toLowerCase() && x.password === cuerpo.password);
        return u ? { ok: true, status: 200, data: { access_token: u.id, refresh_token: u.id } } : { ok: false, status: 401, data: { error: 'Usuario o contraseña incorrectos.' } };
      }
      if (nombre === 'enviar-usuario') return { ok: true, status: 200, data: { ok: true } };
      if (nombre === 'extraer-producto') return { ok: false, status: 500, data: null };
      return { ok: false, status: 404, data: null };
    },
  };
}
