// Cliente de Supabase (o el cliente de prueba si la pagina esta en modo demo).
import { SUPABASE_URL, SUPABASE_ANON_KEY, MODO_DEMO } from './config.js';

let cliente;
if (MODO_DEMO) {
  const { crearClienteDemo } = await import('./demo.js');
  cliente = crearClienteDemo();
} else {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
  cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  });
}

export const supabase = cliente;
export const esDemo = MODO_DEMO;

/**
 * Llama una Edge Function. Si hay sesion, manda su token; si no, la anon key.
 * timeout en milisegundos.
 */
export async function llamarFuncion(nombre, cuerpo, { timeout = 20000 } = {}) {
  if (MODO_DEMO) return cliente.__funcion(nombre, cuerpo);
  const { data: { session } } = await cliente.auth.getSession();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${nombre}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(cuerpo),
      signal: ctrl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* sin cuerpo */ }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

/** Saca el codigo de error de una respuesta de rpc (por ejemplo "regalo_tomado"). */
export function codigoError(error) {
  if (!error) return null;
  const texto = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  const m = texto.match(/[a-z]+(?:_[a-z]+)+/);
  return m ? m[0] : 'error';
}
