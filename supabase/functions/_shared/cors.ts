// CORS: permite el dominio de GitHub Pages (SITIO_URL) y localhost para pruebas.

const sitio = Deno.env.get('SITIO_URL') ?? '';
let origenSitio = '';
try { origenSitio = new URL(sitio).origin; } catch { /* sin SITIO_URL */ }

export function encabezadosCors(req: Request): Record<string, string> {
  const origen = req.headers.get('Origin') ?? '';
  const permitido =
    (origenSitio && origen === origenSitio) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen);
  return {
    'Access-Control-Allow-Origin': permitido ? origen : origenSitio || 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function responder(req: Request, cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...encabezadosCors(req), 'Content-Type': 'application/json' },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: encabezadosCors(req) });
  return null;
}
