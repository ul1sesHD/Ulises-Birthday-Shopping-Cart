// Lee un link de tienda y devuelve nombre, descripcion, precio, imagen y tienda.
// Solo para la cuenta admin (verify_jwt = true y rpc es_admin).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { preflight, responder } from '../_shared/cors.ts';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9,en;q=0.6', 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' };

type Datos = { nombre: string | null; imagen: string | null; descripcion: string | null; precio: number | null; moneda: string | null };

// ---------- Limpieza de links (mismas reglas que el panel) ----------

const RASTREO = new Set(['ref', 'ref_', 'tag', 'dib', 'dib_tag', 'qid', 'sr', 'crid', 'sprefix', 'psc', 'smid', 'keywords', 'fbclid', 'gclid', 'srsltid']);
const VARIANTE = new Set(['v1', 'v2', 'colorid', 'variant', 'th', 'size', 'color']);

function limpiar(texto: string): string {
  const url = new URL(texto);
  const host = url.hostname.toLowerCase();
  if (/(^|\.)amazon\./.test(host)) {
    const m = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
    if (m) return `https://www.amazon.com.mx/dp/${m[1].toUpperCase()}`;
  }
  url.hash = '';
  if (host.includes('mercadolibre')) { url.search = ''; return url.toString(); }
  for (const k of [...url.searchParams.keys()]) {
    const kl = k.toLowerCase();
    if (VARIANTE.has(kl)) continue;
    if (kl.startsWith('utm_') || kl.startsWith('pd_rd') || kl.startsWith('pf_rd') || RASTREO.has(kl)) url.searchParams.delete(k);
  }
  return url.toString();
}

const TIENDAS: [string, string][] = [
  ['amazon', 'Amazon'], ['mercadolibre', 'Mercado Libre'], ['decathlon', 'Decathlon'], ['hm.com', 'H&M'], ['zara', 'Zara'],
  ['bershka', 'Bershka'], ['lego', 'LEGO'], ['liverpool', 'Liverpool'], ['shein', 'Shein'], ['palacio', 'El Palacio de Hierro'],
  ['walmart', 'Walmart'], ['gandhi', 'Librería Gandhi'], ['pullandbear', 'Pull&Bear'], ['uniqlo', 'Uniqlo'], ['nike', 'Nike'], ['adidas', 'Adidas'],
];
function tienda(u: string): string {
  const host = new URL(u).hostname.replace(/^www\d?\./, '');
  const t = TIENDAS.find(([k]) => host.includes(k));
  if (t) return t[1];
  const base = host.split('.').slice(-2)[0] ?? host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ---------- Extraccion ----------

const dec = (s?: string | null) => s == null ? null : s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  let s = String(v).replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function meta(html: string, prop: string): string | null {
  const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${prop}["']`, 'i');
  const m = html.match(a) ?? html.match(b);
  return m ? dec(m[1]) : null;
}

// deno-lint-ignore no-explicit-any
function buscarProducto(n: any): any {
  if (!n || typeof n !== 'object') return null;
  if (Array.isArray(n)) { for (const x of n) { const r = buscarProducto(x); if (r) return r; } return null; }
  const t = n['@type'];
  if (t === 'Product' || t === 'ProductGroup' || t === 'Book' || (Array.isArray(t) && t.includes('Product'))) return n;
  for (const k of ['@graph', 'mainEntity', 'hasVariant']) if (n[k]) { const r = buscarProducto(n[k]); if (r) return r; }
  return null;
}

function jsonLd(html: string, url: string): Datos | null {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let d;
    try { d = JSON.parse(m[1].trim()); } catch { continue; }
    let p = buscarProducto(d);
    if (!p) continue;
    // En grupos de variantes, preferir la que coincide con el link
    const variantes = (d['@graph'] ?? []).filter((x: { '@type'?: string }) => x['@type'] === 'Product');
    const base = url.split('?')[0];
    const igual = variantes.find((x: { offers?: { url?: string } }) => x.offers?.url?.split('?')[0] === base);
    if (igual) p = { ...igual, name: igual.name ?? p.name, description: igual.description ?? p.description };
    else if (p['@type'] === 'ProductGroup' && Array.isArray(p.hasVariant) && p.hasVariant[0]) p = { ...p.hasVariant[0], name: p.name, description: p.description };
    let img = Array.isArray(p.image) ? p.image[0] : p.image;
    if (img && typeof img === 'object') img = img.url ?? img.contentUrl;
    const o = Array.isArray(p.offers) ? p.offers[0] : p.offers;
    return {
      nombre: dec(p.name), imagen: img ?? null, descripcion: dec(p.description),
      precio: o ? num(o.price ?? o.lowPrice ?? o.priceSpecification?.price) : null,
      moneda: o?.priceCurrency ?? o?.priceSpecification?.priceCurrency ?? null,
    };
  }
  return null;
}

function openGraph(html: string): Datos {
  return {
    nombre: meta(html, 'og:title') ?? dec(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
    imagen: meta(html, 'og:image') ?? meta(html, 'twitter:image'),
    descripcion: meta(html, 'og:description') ?? meta(html, 'description'),
    precio: num(meta(html, 'product:price:amount') ?? meta(html, 'og:price:amount')),
    moneda: meta(html, 'product:price:currency') ?? meta(html, 'og:price:currency'),
  };
}

function amazon(html: string): Datos {
  const r: Datos = { nombre: null, imagen: null, descripcion: null, precio: null, moneda: 'MXN' };
  r.nombre = dec(html.match(/<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
  const img = html.match(/<img[^>]+id=["'](?:landingImage|imgBlkFront|ebooksImgBlkFront)["'][^>]*>/i)?.[0];
  if (img) {
    const hi = img.match(/data-old-hires=["']([^"']+)["']/i)?.[1];
    const din = img.match(/data-a-dynamic-image=["']([^"']+)["']/i)?.[1];
    if (hi) r.imagen = hi;
    else if (din) {
      try {
        const o = JSON.parse(dec(din)!) as Record<string, [number, number]>;
        r.imagen = Object.entries(o).sort((a, b) => b[1][0] * b[1][1] - a[1][0] * a[1][1])[0]?.[0] ?? null;
      } catch { /* sin imagen */ }
    }
  }
  const zona = html.match(/id=["']corePrice(?:Display_desktop)?_feature_div["'][\s\S]{0,6000}/i)?.[0] ?? '';
  for (const texto of [zona, html]) {
    for (const m of texto.matchAll(/<span class=["']a-offscreen["']>([^<]+)</gi)) {
      const n = num(m[1]);
      if (n) { r.precio = n; return r; }
    }
  }
  return r;
}

function combinar(...fuentes: (Datos | null)[]): Datos {
  const r: Datos = { nombre: null, imagen: null, descripcion: null, precio: null, moneda: null };
  for (const f of fuentes) {
    if (!f) continue;
    for (const k of Object.keys(r) as (keyof Datos)[]) {
      // deno-lint-ignore no-explicit-any
      if (r[k] == null && f[k] != null && f[k] !== '') (r as any)[k] = f[k];
    }
  }
  return r;
}

async function conTiempo(url: string, init: RequestInit, ms: number) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
}

async function seguirRedirecciones(url: string): Promise<{ final: string; res: Response | null }> {
  let actual = url;
  for (let i = 0; i < 5; i++) {
    const res = await conTiempo(actual, { headers: HEADERS, redirect: 'manual' }, 10000).catch(() => null);
    if (!res) return { final: actual, res: null };
    const destino = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && destino) {
      await res.body?.cancel();
      actual = new URL(destino, actual).toString();
      continue;
    }
    return { final: actual, res };
  }
  return { final: actual, res: null };
}

async function microlink(url: string): Promise<Datos | null> {
  try {
    const r = await conTiempo(`https://api.microlink.io/?url=${encodeURIComponent(url)}&palette=false&audio=false&video=false`, {}, 12000);
    const j = await r.json();
    if (j.status !== 'success') return null;
    return { nombre: j.data?.title ?? null, descripcion: j.data?.description ?? null, imagen: j.data?.image?.url ?? null, precio: null, moneda: null };
  } catch { return null; }
}

async function subirImagen(urlImg: string, referer: string): Promise<string> {
  try {
    const res = await conTiempo(urlImg, { headers: { 'User-Agent': UA, Referer: referer, Accept: 'image/avif,image/webp,image/*' } }, 10000);
    const tipo = res.headers.get('content-type') ?? '';
    if (!res.ok || !tipo.startsWith('image/')) return urlImg;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 8 * 1024 * 1024) return urlImg;
    const ext = (tipo.split('/')[1] ?? 'jpg').split(';')[0].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    const ruta = `regalos/${crypto.randomUUID()}.${ext}`;
    const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
    const { error } = await admin.storage.from('regalos').upload(ruta, buf, { contentType: tipo, upsert: false });
    if (error) return urlImg;
    return admin.storage.from('regalos').getPublicUrl(ruta).data.publicUrl;
  } catch {
    return urlImg;
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return responder(req, { error: 'metodo' }, 405);

  // Solo admin
  const auth = req.headers.get('Authorization') ?? '';
  const cliente = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: esAdmin } = await cliente.rpc('es_admin');
  if (esAdmin !== true) return responder(req, { error: 'solo_admin' }, 403);

  let url: string;
  try {
    const cuerpo = await req.json();
    url = new URL(String(cuerpo.url ?? '').trim()).toString();
    if (!/^https?:/.test(url)) throw new Error('url');
  } catch {
    return responder(req, { error: 'url_invalida' }, 400);
  }

  const vacio = { url_final: null, nombre: null, descripcion: null, precio: null, moneda: null, imagen_url: null, tienda: null };
  try {
    const { final, res } = await seguirRedirecciones(url);
    const limpio = limpiar(final);
    let html = '';
    if (res) { try { html = await res.text(); } catch { html = ''; } }
    const bloqueado = !res || !res.ok || html.length < 2000 || /captcha|robot check|access denied|pardon our interruption/i.test(html.slice(0, 20000));

    let datos: Datos;
    if (bloqueado) {
      datos = (await microlink(limpio)) ?? { nombre: null, imagen: null, descripcion: null, precio: null, moneda: null };
    } else {
      const esAmazon = /amazon\./i.test(limpio);
      datos = esAmazon ? combinar(jsonLd(html, limpio), amazon(html), openGraph(html)) : combinar(jsonLd(html, limpio), openGraph(html));
      if (!datos.imagen) datos.imagen = (await microlink(limpio))?.imagen ?? null;
    }

    let imagen_url: string | null = null;
    if (datos.imagen) imagen_url = await subirImagen(new URL(datos.imagen, limpio).toString(), limpio);

    return responder(req, {
      url_final: limpio,
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      precio: datos.precio != null ? Math.round(datos.precio) : null,
      moneda: datos.moneda ?? (datos.precio != null ? 'MXN' : null),
      imagen_url,
      tienda: tienda(limpio),
    });
  } catch {
    return responder(req, { ...vacio, url_final: url });
  }
});
