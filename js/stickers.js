// Coloca los stickers PNG/WebP/SVG segun assets/stickers.json.
// Cada sticker trae posicion para movil, tablet y desktop (en % del contenedor) y rotacion en grados.
// Si una vista es null, el sticker se oculta en ese tamano.

let cache;
async function cargar() {
  if (!cache) cache = fetch('./assets/stickers.json').then((r) => r.json()).catch(() => ({ stickers: [] }));
  return cache;
}

const VISTAS = [['movil', 'm'], ['tablet', 't'], ['desktop', 'd']];

export async function colocarStickers(contenedor, nombre) {
  if (!contenedor) return;
  const { stickers = [] } = await cargar();
  const propios = stickers.filter((s) => s.contenedor === nombre);
  if (!propios.length) return;
  const capa = document.createElement('div');
  capa.className = 'stickers';
  capa.setAttribute('aria-hidden', 'true');
  for (const s of propios) {
    const img = document.createElement('img');
    img.className = 'sticker';
    img.src = `./assets/img/${s.archivo}`;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.setAttribute('aria-hidden', 'true');
    let ultima = null;
    for (const [vista, k] of VISTAS) {
      const v = s[vista] ?? null;
      if (!v) { img.dataset[`oculto${k.toUpperCase()}`] = ''; img.setAttribute(`data-oculto-${k}`, ''); }
      const usar = v || ultima || { x: 0, y: 0, ancho: 0, rotacion: 0 };
      if (v) ultima = v;
      img.style.setProperty(`--x-${k}`, `${usar.x}%`);
      img.style.setProperty(`--y-${k}`, `${usar.y}%`);
      img.style.setProperty(`--w-${k}`, `${usar.ancho}%`);
      img.style.setProperty(`--r-${k}`, `${usar.rotacion}deg`);
    }
    capa.append(img);
  }
  contenedor.append(capa);
}
