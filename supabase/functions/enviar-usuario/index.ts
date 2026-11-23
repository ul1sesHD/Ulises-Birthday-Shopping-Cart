// Envia por correo el usuario de una cuenta. Siempre responde { ok: true }
// para no revelar que correos estan registrados.
// Variables: RESEND_API_KEY, CORREO_REMITENTE, SITIO_URL. Desplegar con verify_jwt = false.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { preflight, responder } from '../_shared/cors.ts';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND = Deno.env.get('RESEND_API_KEY') ?? '';
const REMITENTE = Deno.env.get('CORREO_REMITENTE') ?? '';
const SITIO = Deno.env.get('SITIO_URL') ?? '';

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function html(usuario: string, nombre: string) {
  return `<!doctype html>
<html lang="es-MX"><body style="margin:0;background:#000814;font-family:Arial,Helvetica,sans-serif;color:#fdfbf5">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#000814;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#001d3d;border:3px solid #003566;border-radius:24px;padding:32px">
        <tr><td style="font-size:44px;font-weight:900;color:#ffd60a;letter-spacing:-1px">ULI 23</td></tr>
        <tr><td style="padding-top:16px;font-size:16px;line-height:1.5;color:#9fb0c8">Hola${nombre ? ' ' + escapar(nombre) : ''}, este es tu usuario para entrar a la página de regalos del cumple de Uli:</td></tr>
        <tr><td style="padding:20px 0"><div style="display:inline-block;background:#ffc300;color:#000814;font-size:30px;font-weight:900;padding:12px 22px;border:3px solid #000814;border-radius:6px">${escapar(usuario)}</div></td></tr>
        <tr><td><a href="${escapar(SITIO)}" style="display:inline-block;background:#ffd60a;color:#000814;font-weight:800;font-size:16px;text-decoration:none;padding:14px 24px;border-radius:14px;border:3px solid #000814">Ir a los regalos</a></td></tr>
        <tr><td style="padding-top:24px;font-size:13px;color:#9fb0c8">Si no pediste este correo, puedes ignorarlo.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const { email } = await req.json();
    const correo = String(email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || !RESEND || !REMITENTE) return responder(req, { ok: true });

    const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
    // Busca el usuario por correo recorriendo las paginas de auth (la lista de invitados es corta).
    let id: string | null = null;
    for (let pagina = 1; pagina <= 20 && !id; pagina++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
      if (error || !data?.users?.length) break;
      id = data.users.find((u) => u.email?.toLowerCase() === correo)?.id ?? null;
      if (data.users.length < 200) break;
    }
    if (!id) return responder(req, { ok: true });

    const { data: perfil } = await admin.from('perfiles').select('usuario, nombre').eq('id', id).maybeSingle();
    if (!perfil?.usuario) return responder(req, { ok: true });

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: REMITENTE,
        to: [correo],
        subject: 'Tu usuario para el cumple de Uli',
        html: html(perfil.usuario, perfil.nombre ?? ''),
        text: `Tu usuario para el cumple de Uli es: ${perfil.usuario}\n\nEntra aquí: ${SITIO}`,
      }),
    });
  } catch { /* siempre la misma respuesta */ }
  return responder(req, { ok: true });
});
