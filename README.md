# ULI 23

Página de regalos para el cumpleaños 23 de Uli (domingo 6 de diciembre de 2026). Las personas invitadas entran con usuario y contraseña, recorren las categorías, abren el detalle de cada regalo y lo guardan. Uli no puede ver quién guardó qué.

- Frontend: HTML, CSS y JavaScript puro (módulos ES), sin bundler.
- Backend: Supabase (Auth, Postgres, Storage y Edge Functions).
- Publicación: GitHub Pages desde la raíz de la rama `main`.

## Estructura

```
index.html            entrada
css/                  tokens, base y un archivo por sección
js/                   router.js es el punto de entrada
  config.js           URL y anon key de Supabase
  demo.js             cliente de prueba (solo mientras config.js tenga valores de ejemplo)
assets/img/           foto de Uli y stickers
assets/gracias/       imágenes de la pantalla de gracias y gracias.json
assets/regalos/       imágenes de los productos (las genera el script)
assets/stickers.json  posición de cada sticker
data/regalos.json     catálogo
scripts/              extraer-productos.mjs
supabase/             schema.sql, actualizar-regalos.sql y Edge Functions
_originales/          archivos originales antes de renombrarlos (no los usa la página; puedes borrar la carpeta)
```

## Correrlo en local

```bash
npx serve .
```

Abre la dirección que te muestra (por ejemplo `http://localhost:3000`). También sirve `python -m http.server 8000`.

Mientras `js/config.js` tenga los valores de ejemplo, la página funciona en **modo demo**: todo se guarda en el navegador. Crea una cuenta cualquiera para ver la parte de invitados, o una con el usuario `uli` para ver el panel de admin.

## Supabase

1. En Supabase > SQL Editor ejecuta `supabase/schema.sql` (cambia antes el correo de la sección 0 por el tuyo).
2. Ejecuta `supabase/actualizar-regalos.sql` para poner precios, imágenes, nombres, categorías y rangos.
3. En `js/config.js` pon `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SITIO_URL` (Project Settings > API). Nunca pongas la service role key en el frontend.
4. En Authentication > URL Configuration agrega la URL de GitHub Pages en *Site URL* y en *Redirect URLs*.
5. En Authentication > Sign In / Providers > Email apaga *Confirm email*, para que funcione con cualquier correo.

Para borrar todas las reservas (por ejemplo, después de probar) ejecuta `supabase/limpiar-reservas.sql`. No se puede deshacer.

Si cambias categorías o precios en `data/regalos.json`, vuelve a generar el SQL con `node scripts/extraer-productos.mjs --sql`.

### Script de extracción

Lee cada link de `data/regalos.json`, descarga la imagen a `assets/regalos/` y vuelve a generar `supabase/actualizar-regalos.sql`.

```bash
node scripts/extraer-productos.mjs
```

```bash
node scripts/extraer-productos.mjs pantalon-zara lego-ramo-rosa
```

```bash
node scripts/extraer-productos.mjs --forzar
```

Necesita Node 18 o superior. Para reducir las imágenes usa `sharp` si está instalado o Python con Pillow; si no hay ninguno, guarda la imagen como viene. Varias tiendas (Decathlon, H&M, Zara, Mercado Libre) bloquean peticiones automáticas; en ese caso intenta con Microlink, que tiene un límite diario. Si un regalo se queda sin imagen o precio, llénalo a mano en `data/regalos.json` o desde el panel de admin.

### Edge Functions

Instala la CLI de Supabase y enlaza el proyecto:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref TU-PROJECT-REF
```

Variable secreta para CORS:

```bash
npx supabase secrets set SITIO_URL=https://TU-USUARIO.github.io/TU-REPO/
```

Despliegue (`login-usuario` sin verificación de JWT porque se usa antes de iniciar sesión):

```bash
npx supabase functions deploy login-usuario --no-verify-jwt
```

```bash
npx supabase functions deploy extraer-producto
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya existen dentro de las Edge Functions; no hay que configurarlas.

## Publicar en GitHub Pages

1. Sube la carpeta a un repositorio de GitHub (rama `main`).
2. En el repositorio: Settings > Pages > Build and deployment > Deploy from a branch > `main` y carpeta `/ (root)`.
3. Espera uno o dos minutos y abre `https://TU-USUARIO.github.io/TU-REPO/`.

El archivo `.nojekyll` vacío evita que GitHub procese la página con Jekyll. Todas las rutas son relativas (`./css/...`), así que funciona dentro de la subcarpeta del repositorio.

## Cambiar cosas

- **Imágenes de gracias:** agrega o quita imágenes en `assets/gracias/` y actualiza la lista en `assets/gracias/gracias.json`.
- **Stickers:** edita `assets/stickers.json`. `x` y `y` son el centro del sticker en porcentaje del contenedor, `ancho` es el porcentaje del ancho del contenedor y `rotacion` está en grados. Pon `null` para ocultarlo en un tamaño.
- **Regalos:** desde el panel de admin (`#/admin`) puedes agregar por link, editar, ocultar y borrar.
"# Ulises-Birthday-Shopping-Cart" 
