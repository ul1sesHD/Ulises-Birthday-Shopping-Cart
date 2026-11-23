// Lee data/regalos.json, visita cada enlace y saca imagen, precio, nombre y descripcion.
// Uso: node scripts/extraer-productos.mjs            (todos los regalos con enlace)
//      node scripts/extraer-productos.mjs slug1 slug2 (solo esos)
//      node scripts/extraer-productos.mjs --forzar    (vuelve a leer aunque ya tengan imagen y precio)
//      node scripts/extraer-productos.mjs --sql       (solo vuelve a generar el SQL desde el JSON)
// Requiere Node 18 o superior. Para reducir imagenes usa sharp si esta instalado,
// si no, Python con Pillow si existe; si no hay ninguno, guarda la imagen tal cual.

import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_JSON = path.join(RAIZ, 'data', 'regalos.json');
const DIR_IMG = path.join(RAIZ, 'assets', 'regalos');
const RUTA_SQL = path.join(RAIZ, 'supabase', 'actualizar-regalos.sql');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.6',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
};

const args = process.argv.slice(2);
const forzar = args.includes('--forzar');
const soloSql = args.includes('--sql');
const soloSlugs = args.filter((a) => !a.startsWith('--'));

// ---------- utilidades ----------

const decodificar = (s) => s == null ? s : String(s)
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/\s+/g, ' ').trim();

async function pedir(url, opciones = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { redirect: 'follow', ...opciones, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function aNumero(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,]/g, '');
  if (!s) return null;
  // "1,299.00" -> 1299.00 ; "1.299,00" -> 1299.00 ; "1,299" -> 1299
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /,\d{2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function meta(html, prop) {
  const re1 = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${prop}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? decodificar(m[1]) : null;
}

function buscarProducto(nodo) {
  if (!nodo || typeof nodo !== 'object') return null;
  if (Array.isArray(nodo)) {
    for (const n of nodo) { const r = buscarProducto(n); if (r) return r; }
    return null;
  }
  const tipo = nodo['@type'];
  if (tipo === 'Product' || (Array.isArray(tipo) && tipo.includes('Product')) || tipo === 'ProductGroup' || tipo === 'Book') return nodo;
  for (const k of ['@graph', 'mainEntity', 'itemListElement', 'hasVariant']) {
    if (nodo[k]) { const r = buscarProducto(nodo[k]); if (r) return r; }
  }
  return null;
}

function desdeJsonLd(html) {
  const bloques = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of bloques) {
    let datos;
    try { datos = JSON.parse(b[1].trim()); } catch { continue; }
    let p = buscarProducto(datos);
    if (!p) continue;
    if (p['@type'] === 'ProductGroup' && Array.isArray(p.hasVariant) && p.hasVariant[0]) p = { ...p.hasVariant[0], name: p.name || p.hasVariant[0].name };
    let imagen = p.image;
    if (Array.isArray(imagen)) imagen = imagen[0];
    if (imagen && typeof imagen === 'object') imagen = imagen.url || imagen.contentUrl;
    let ofertas = p.offers;
    if (Array.isArray(ofertas)) ofertas = ofertas[0];
    let precio = null;
    if (ofertas) precio = aNumero(ofertas.price ?? ofertas.lowPrice ?? ofertas.highPrice ?? ofertas.priceSpecification?.price);
    return { nombre: decodificar(p.name), imagen: imagen || null, descripcion: decodificar(p.description), precio };
  }
  return null;
}

function desdeOpenGraph(html) {
  return {
    nombre: meta(html, 'og:title') || decodificar((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]),
    imagen: meta(html, 'og:image') || meta(html, 'og:image:secure_url') || meta(html, 'twitter:image'),
    descripcion: meta(html, 'og:description') || meta(html, 'description'),
    precio: aNumero(meta(html, 'product:price:amount') || meta(html, 'og:price:amount') || meta(html, 'price')),
  };
}

function desdeAmazon(html) {
  const r = { nombre: null, imagen: null, descripcion: null, precio: null };
  const t = html.match(/<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i);
  if (t) r.nombre = decodificar(t[1]);
  const img = html.match(/<img[^>]+id=["']landingImage["'][^>]*>/i) || html.match(/<img[^>]+id=["']imgBlkFront["'][^>]*>/i) || html.match(/<img[^>]+id=["']ebooksImgBlkFront["'][^>]*>/i);
  if (img) {
    const hires = img[0].match(/data-old-hires=["']([^"']+)["']/i);
    const din = img[0].match(/data-a-dynamic-image=["']([^"']+)["']/i);
    if (hires && hires[1]) r.imagen = hires[1];
    else if (din) {
      try {
        const obj = JSON.parse(decodificar(din[1]));
        const mejor = Object.entries(obj).sort((a, b) => (b[1][0] * b[1][1]) - (a[1][0] * a[1][1]))[0];
        if (mejor) r.imagen = mejor[0];
      } catch { /* sin imagen */ }
    }
  }
  // La primera coincidencia a veces viene vacia; se toma la primera que tenga numero.
  const zona = (html.match(/id=["']corePrice(?:Display_desktop)?_feature_div["'][\s\S]{0,6000}/i) || [''])[0];
  const patrones = [
    /<span class=["']a-offscreen["']>([^<]+)</gi,
    /id=["'](?:price|price_inside_buybox|newBuyBoxPrice|kindle-price)["'][^>]*>([^<]+)</gi,
    /class=["']a-size-base a-color-price[^"']*["'][^>]*>([^<]+)</gi,
  ];
  buscar: for (const texto of [zona, html]) {
    for (const p of patrones) {
      for (const m of texto.matchAll(p)) {
        const n = aNumero(m[1]);
        if (n) { r.precio = n; break buscar; }
      }
    }
  }
  const formato = html.match(/id=["']productSubtitle["'][^>]*>([\s\S]*?)<\/span>/i) || html.match(/<span[^>]+class=["'][^"']*slot-title[^"']*["'][\s\S]{0,200}?<span[^>]*>([^<]+)</i);
  if (formato) r.formato = decodificar(formato[1]);
  return r;
}

function bloqueado(res, html) {
  if (!res.ok) return true;
  if (!html || html.length < 2000) return true;
  return /captcha|validateCaptcha|robot check|are you a human|access denied|pardon our interruption/i.test(html.slice(0, 20000));
}

async function desdeMicrolink(url) {
  try {
    const r = await pedir(`https://api.microlink.io/?url=${encodeURIComponent(url)}&palette=false&audio=false&video=false`, {}, 25000);
    const j = await r.json();
    if (j.status !== 'success') return null;
    const d = j.data || {};
    return { nombre: decodificar(d.title), descripcion: decodificar(d.description), imagen: d.image?.url || null, precio: null };
  } catch { return null; }
}

function combinar(...fuentes) {
  const r = { nombre: null, imagen: null, descripcion: null, precio: null, formato: null };
  for (const f of fuentes) {
    if (!f) continue;
    for (const k of Object.keys(r)) if (r[k] == null && f[k]) r[k] = f[k];
  }
  return r;
}

async function extraer(url) {
  let html = '';
  let res;
  try {
    res = await pedir(url, { headers: HEADERS });
    html = await res.text();
  } catch (e) {
    res = { ok: false, status: 0 };
  }
  const esAmazon = /amazon\./i.test(url);
  if (bloqueado(res, html)) {
    const ml = await desdeMicrolink(url);
    return { ...combinar(ml), via: `microlink (tienda respondio ${res.status || 'sin respuesta'})` };
  }
  const ld = desdeJsonLd(html);
  const og = desdeOpenGraph(html);
  const az = esAmazon ? desdeAmazon(html) : null;
  // En Amazon el titulo y la imagen del propio producto son mas confiables que og.
  const datos = esAmazon ? combinar(ld, az, og) : combinar(ld, og, az);
  if (!datos.imagen) {
    const ml = await desdeMicrolink(url);
    if (ml) datos.imagen = ml.imagen;
  }
  return { ...datos, via: ld ? 'json-ld' : esAmazon ? 'amazon' : 'open graph' };
}

// ---------- imagenes ----------

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* opcional */ }
const tienePython = !sharp && spawnSync('python', ['-c', 'import PIL'], { stdio: 'ignore' }).status === 0;

async function guardarImagen(urlImg, slug, base) {
  const abs = new URL(urlImg, base).href;
  const r = await pedir(abs, { headers: { 'User-Agent': UA, 'Referer': base, 'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8' } }, 20000);
  if (!r.ok) throw new Error(`imagen ${r.status}`);
  const tipo = r.headers.get('content-type') || '';
  if (!tipo.startsWith('image/')) throw new Error(`no es imagen (${tipo})`);
  const buf = Buffer.from(await r.arrayBuffer());
  await mkdir(DIR_IMG, { recursive: true });
  const destino = path.join(DIR_IMG, `${slug}.webp`);
  if (sharp) {
    await sharp(buf).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toFile(destino);
    return destino;
  }
  const ext = (tipo.split('/')[1] || 'jpg').replace('jpeg', 'jpg').split(';')[0];
  const crudo = path.join(DIR_IMG, `${slug}.orig.${ext}`);
  await writeFile(crudo, buf);
  if (tienePython) {
    const py = 'import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]);im=im.convert("RGBA" if im.mode in ("RGBA","LA","P") else "RGB");im.thumbnail((1200,1200));im.save(sys.argv[2],quality=84,method=6)';
    const s = spawnSync('python', ['-c', py, crudo, destino]);
    if (s.status === 0) { await unlink(crudo); return destino; }
  }
  const final = path.join(DIR_IMG, `${slug}.${ext}`);
  await writeFile(final, buf);
  await unlink(crudo);
  return final;
}

// ---------- nombre corto ----------

function nombreCorto(titulo, tienda) {
  if (!titulo) return null;
  let t = titulo.split(/\s[|\-–]\s/)[0];
  if (tienda) t = t.replace(new RegExp(tienda.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&'), 'ig'), '');
  t = t.replace(/\b(para (hombre|mujer|caballero|dama)|hombre|mujer|unisex)\b/gi, '')
       .replace(/\b\d+([.,]\d+)?\s?(cm|mm|ml|g|kg|l|oz|pzas?|piezas)\b/gi, '')
       .replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
  const palabras = t.split(' ').filter(Boolean).slice(0, 4);
  const s = palabras.join(' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : null;
}

function descripcionCorta(txt) {
  if (!txt) return null;
  const limpio = txt.replace(/\s+/g, ' ').trim();
  const frase = (limpio.match(/^.{20,180}?[.!?](\s|$)/) || [limpio.slice(0, 160)])[0].trim();
  return frase.replace(/!/g, '.');
}

// ---------- principal ----------

const sqlTexto = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

const catalogo = JSON.parse(await readFile(RUTA_JSON, 'utf8'));
const secciones = Object.fromEntries(catalogo.secciones.map((s) => [s.slug, s]));
const resumen = [];

for (const g of catalogo.regalos) {
  if (!g.enlace || soloSql) continue;
  if (soloSlugs.length && !soloSlugs.includes(g.slug)) continue;
  if (!forzar && !soloSlugs.length && g.imagen && g.precio != null && existsSync(path.join(RAIZ, g.imagen))) {
    resumen.push({ slug: g.slug, nombre: g.nombre, precio: g.precio, imagen: true, seccion: g.seccion, via: 'ya estaba' });
    continue;
  }
  process.stdout.write(`- ${g.slug} ... `);
  const d = await extraer(g.enlace);
  let imagenOk = false;
  if (d.imagen) {
    try {
      const f = await guardarImagen(d.imagen, g.slug, g.enlace);
      g.imagen = './' + path.relative(RAIZ, f).split(path.sep).join('/');
      imagenOk = true;
    } catch (e) { d.errorImagen = e.message; }
  }
  if (d.precio) g.precio = Math.round(d.precio);
  if (g.nombre_pendiente && d.nombre) {
    const n = nombreCorto(d.nombre, g.tienda);
    if (n) { g.nombre = n; g.nombre_tienda = d.nombre; }
  }
  if (!g.descripcion && d.descripcion) g.descripcion = descripcionCorta(d.descripcion);
  if (d.formato) g.formato_tienda = d.formato;
  console.log(`${imagenOk ? 'imagen' : 'SIN IMAGEN'} | ${g.precio ?? 'SIN PRECIO'} | ${d.via}${d.errorImagen ? ' | ' + d.errorImagen : ''}`);
  resumen.push({ slug: g.slug, nombre: g.nombre, precio: g.precio, imagen: imagenOk, seccion: g.seccion, via: d.via, formato: d.formato, titulo: d.nombre });
  await new Promise((r) => setTimeout(r, 800));
}

await writeFile(RUTA_JSON, JSON.stringify(catalogo, null, 2) + '\n', 'utf8');

const lineas = [
  '-- Generado por scripts/extraer-productos.mjs. Ejecutar en Supabase > SQL Editor.',
  '-- Actualiza categorias (subtitulo y rango) y cada regalo (categoria, orden, precio, imagen, textos) segun data/regalos.json.',
  '-- No cambia el esquema ni borra reservas.',
  '',
];
for (const s of catalogo.secciones) {
  lineas.push(`update public.secciones set nombre = ${sqlTexto(s.nombre)}, subtitulo = ${sqlTexto(s.subtitulo)}, presupuesto = ${s.presupuesto == null ? 'null' : Number(s.presupuesto)}, orden = ${Number(s.orden)} where slug = ${sqlTexto(s.slug)};`);
}
lineas.push('');
const ordenes = {};
for (const g of catalogo.regalos) {
  ordenes[g.seccion] = (ordenes[g.seccion] || 0) + 1;
  const sets = [
    `seccion_id = (select id from public.secciones where slug = ${sqlTexto(g.seccion)})`,
    `orden = ${ordenes[g.seccion]}`,
    `tipo = ${sqlTexto(g.tipo)}`,
    `precio = ${g.precio == null ? 'null' : Number(g.precio)}`,
    `imagen_url = ${sqlTexto(g.imagen)}`,
    `nombre = ${sqlTexto(g.nombre)}`,
    `descripcion = ${sqlTexto(g.descripcion || '')}`,
    `enlace_url = ${sqlTexto(g.enlace)}`,
    `nota = ${sqlTexto(g.nota)}`,
  ];
  lineas.push(`update public.regalos set ${sets.join(', ')} where slug = ${sqlTexto(g.slug)};`);
}
await writeFile(RUTA_SQL, lineas.join('\n') + '\n', 'utf8');

console.log('\nslug | nombre | precio | imagen | categoria | aviso');
for (const r of resumen) {
  const tope = secciones[r.seccion]?.presupuesto;
  const avisos = [];
  if (!r.imagen) avisos.push('falta imagen');
  if (r.precio == null) avisos.push('falta precio');
  if (tope && r.precio > tope) avisos.push(`pasa el tope de $${tope}`);
  if (r.slug === '1984-orwell') avisos.push(`formato: ${r.formato || 'sin dato'}`);
  console.log(`${r.slug} | ${r.nombre} | ${r.precio ?? '-'} | ${r.imagen ? 'si' : 'no'} | ${r.seccion} | ${avisos.join(', ')}`);
}
console.log(`\nListo. JSON actualizado y SQL en ${path.relative(RAIZ, RUTA_SQL)}.`);
