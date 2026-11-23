// Inicia sesion con usuario y contrasena (en lugar de correo).
// Desplegar con verify_jwt = false (ver README).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { preflight, responder } from '../_shared/cors.ts';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const ERROR = { error: 'Usuario o contraseña incorrectos.' };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return responder(req, ERROR, 405);

  try {
    const { usuario, password } = await req.json();
    const u = String(usuario ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(u) || typeof password !== 'string' || !password) return responder(req, ERROR, 401);

    const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
    const { data: perfil } = await admin.from('perfiles').select('id').eq('usuario', u).maybeSingle();
    if (!perfil) return responder(req, ERROR, 401);

    const { data: datosUsuario, error: errUsuario } = await admin.auth.admin.getUserById(perfil.id);
    const email = datosUsuario?.user?.email;
    if (errUsuario || !email) return responder(req, ERROR, 401);

    const anon = createClient(URL_SB, ANON, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) return responder(req, ERROR, 401);

    return responder(req, { access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch {
    return responder(req, ERROR, 401);
  }
});
