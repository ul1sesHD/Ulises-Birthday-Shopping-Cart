# Prompt para Claude Code: "ULI 23", la página de regalos de Ulises (versión 3)

Copia todo lo que está debajo de la línea y pégalo en Claude Code, abierto en la carpeta del proyecto. Antes, copia en esa carpeta:
- `supabase/schema.sql` (el SQL versión 2)
- `data/regalos.json` (el catálogo)

---

## Contexto

Construye una página web estática y responsiva (celular, iPad y escritorio) para el cumpleaños 23 de Ulises "Uli" (6 de diciembre de 2026, domingo). Las personas invitadas entran con usuario y contraseña, recorren categorías de regalos, abren el detalle de cada producto y lo guardan. Ulises no puede ver quién guardó qué.

Hay dos tipos de regalo:
- **Exclusivo:** solo una persona lo puede guardar, y cada persona solo puede tener un regalo exclusivo a la vez. Si alguien ya lo guardó, aparece como "Ya lo apartaron".
- **Compartido:** lo puede guardar cualquier persona, y no cuenta para el límite. Son los de la sección Gratis, los de "Tú consigue el mejor precio" y las pilas. Una persona puede guardar todos los compartidos que quiera y además un exclusivo.

Stack:
- Frontend: HTML, CSS y JavaScript puro (módulos ES), sin frameworks ni bundler.
- Backend: Supabase (Auth, Postgres, Storage y Edge Functions).
- Despliegue: GitHub Pages desde la raíz de la rama `main`.
- El esquema ya existe en `supabase/schema.sql` y el catálogo en `data/regalos.json`. No cambies el esquema sin avisarme. Usa exactamente sus tablas y funciones: `listar_regalos()`, `reservar_regalo(p_regalo_id)`, `soltar_regalo(p_regalo_id)` y `usuario_disponible(p_usuario)`, y para el admin, las funciones `admin_*` de la sección J.

## Reglas estrictas

1. Prohibido usar emojis en cualquier lugar: interfaz, código, comentarios, nombres de archivo, commits y README.
2. Iconos: Font Awesome 6 Free desde cdnjs (`https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css`), siempre la variante `fa-solid`. Juega con los tamaños: pequeños dentro de botones y chips, medianos en tarjetas y enormes como elementos decorativos. Los iconos decorativos llevan `aria-hidden="true"` y los botones que solo tienen icono llevan `aria-label`.
3. Calendario, cuadrícula, espiral, marcos y botones de categoría son 100% CSS. Las únicas imágenes son las fotos de Ulises, los stickers PNG, las imágenes de la carpeta de gracias y las de los productos.
4. Rutas relativas para GitHub Pages (`./css/...`, nunca `/css/...`). Crea un `.nojekyll` vacío en la raíz.
5. Respeta `prefers-reduced-motion`: si está activo, quita las animaciones de movimiento y deja solo cambios de opacidad.
6. Textos en español de México, cálidos, con mayúscula solo al inicio de la frase. Sin signos de exclamación en los mensajes del sistema (errores y confirmaciones). Los nombres de las categorías se respetan tal como vienen en `data/regalos.json`, incluidas sus mayúsculas.

## Paso 0: inventario (muéstramelo antes de seguir)

1. Lista las carpetas de imágenes del proyecto y muéstrame una tabla con nombre, dimensiones, peso y si tiene transparencia. Identifica:
   - La foto cuadrada de Ulises para el encabezado.
   - Los stickers PNG con fondo transparente.
   - La carpeta de agradecimiento (se llama "Gracias" o parecido). Lista todas sus imágenes.
2. Si no puedes identificar con certeza alguna de las tres, pregúntame.
3. Normaliza los nombres a minúsculas, sin espacios ni acentos y con guiones, y organiza así:
   - `assets/img/` para la foto y los stickers
   - `assets/gracias/` para las imágenes de agradecimiento
4. Genera `assets/gracias/gracias.json` con la lista de archivos de esa carpeta. Así la página sabe qué imágenes hay, porque GitHub Pages no puede listar carpetas.

## Paso 1: extraer imagen y precio de cada link

Crea `scripts/extraer-productos.mjs` (Node 18 o superior, sin dependencias externas si se puede) y ejecútalo:

1. Lee `data/regalos.json`. Para cada regalo con `enlace`:
   - Descarga el HTML con un `User-Agent` de navegador de escritorio y `Accept-Language: es-MX`.
   - Busca en este orden:
     1. JSON-LD de tipo `Product` (`name`, `image`, `description`, `offers.price`).
     2. Etiquetas Open Graph: `og:title`, `og:image`, `og:description`, `product:price:amount`.
     3. Selectores específicos de Amazon: imagen en `#landingImage` (`data-old-hires` o `data-a-dynamic-image`) y precio en `.a-price .a-offscreen`.
   - Si la tienda bloquea la petición (403, captcha o HTML vacío), intenta con `https://api.microlink.io/?url=<enlace>` (gratis, sin llave, con límite diario).
2. Descarga la imagen principal a `assets/regalos/<slug>.webp` (o `.jpg`), con un lado mayor de máximo 1200 px. Guardarla local evita que la tienda bloquee la imagen al mostrarla desde otro dominio.
3. Actualiza `data/regalos.json`:
   - `imagen`: la ruta local.
   - `precio`: número en MXN, redondeado.
   - `nombre`: solo si `nombre_pendiente` es `true`. Usa un nombre corto de 2 a 4 palabras, no el título completo de la tienda.
   - `descripcion`: solo si está vacía; una frase corta escrita a partir de la descripción de la tienda.
4. Genera `supabase/actualizar-regalos.sql` con un `update public.regalos set precio = ..., imagen_url = ..., nombre = ..., descripcion = ... where slug = '...';` por regalo. Para `imagen_url` usa la ruta relativa (`./assets/regalos/<slug>.webp`).
5. Al terminar, muéstrame una tabla con slug, nombre, precio, si encontró imagen y en qué categoría quedó. Señala:
   - Los que fallaron, para que yo te pase imagen o precio a mano.
   - Los que tengan un precio arriba del tope de su categoría (el campo `presupuesto` de la sección), para que yo decida si los muevo.
   - Que `1984-orwell` sea libro físico y no ebook.

Los precios cambian; en la interfaz se muestran como "aprox." con la tienda al lado.

## Estructura del proyecto

```
/
  index.html
  .nojekyll
  README.md
  css/
    tokens.css        colores, tipografía, espacios, radios, sombras
    base.css          reset, tipografía, botones, inputs, layout
    intro.css         pantalla de bienvenida
    heading.css       encabezado ULI 23
    calendario.css    calendario en CSS puro
    categorias.css    botones de categoría
    regalos.css       tarjetas, detalle de producto, mis regalos
    gracias.css       pantalla de agradecimiento
    animaciones.css   keyframes y clases de animación
  js/
    config.js         SUPABASE_URL y SUPABASE_ANON_KEY
    supabase.js       cliente (import desde esm.sh)
    router.js         rutas por hash
    intro.js          pantalla de bienvenida
    auth.js           registro, inicio de sesión, recordar usuario
    calendario.js     genera los días de diciembre 2026
    stickers.js       coloca los stickers según assets/stickers.json
    regalos.js        categorías, tarjetas, detalle, guardar y soltar
    gracias.js        pantalla de agradecimiento
    admin.js          panel de admin (agregar por link, editar, resumen)
    ui.js             toasts, modales, confeti, utilidades
  assets/
    img/              foto de Ulises y stickers
    gracias/          imágenes de agradecimiento y gracias.json
    regalos/          imágenes de productos (las genera el script)
    fonts/            Eras Bold, si existe el archivo
    stickers.json
  data/
    regalos.json
  scripts/
    extraer-productos.mjs
  supabase/
    schema.sql
    actualizar-regalos.sql
    functions/
      login-usuario/index.ts
      enviar-usuario/index.ts
      extraer-producto/index.ts
```

## Sistema de diseño

### Colores de Ulises

```css
--ink-black: #000814;   /* fondo principal */
--prussian:  #001d3d;   /* superficies oscuras */
--oxford:    #003566;   /* bordes, hover, patrón de fondo */
--yellow:    #ffc300;   /* acento principal, botones primarios */
--gold:      #ffd60a;   /* resaltes, el número 23, iconos decorativos */
```

### Colores añadidos para contraste

```css
--paper: #f7f4ec;            /* hoja del calendario, tarjetas claras */
--paper-line: #d9d3c3;       /* líneas de la cuadrícula */
--ink-soft: #4a5a72;         /* texto secundario sobre --paper */
--bone: #fdfbf5;             /* texto principal sobre fondos oscuros */
--muted-dark: #9fb0c8;       /* texto secundario sobre fondos oscuros */
--gris-claro: #8a94a6;       /* descripciones pequeñas en el detalle de producto */
--danger: #ff6b6b;           --danger-on-paper: #b3261e;
--success: #2ec4b6;          --success-on-paper: #0b7a6f;
```

Cada categoría trae sus propios colores en la base de datos (`color_fondo`, `color_icono` y `color_texto`). Úsalos con variables CSS en línea (`style="--cat-fondo: ...; --cat-icono: ...; --cat-texto: ..."`). Las dos últimas categorías van "al revés": fondo sólido e icono en un tono más suave del mismo color.

Reglas de contraste:
- Texto sobre amarillo o dorado: siempre `--ink-black`.
- Texto sobre azules: `--bone` o `--gold`.
- Texto normal: contraste mínimo de 4.5:1 (WCAG AA). Verifica también los colores de cada categoría.

### Tipografía

- Títulos y números: Eras Bold. Si hay un archivo en `assets/fonts/`, cárgalo con `@font-face` y `font-display: swap`. Pila de respaldo: `"Eras Bold", "Eras Bold ITC", "ErasITC-Bold", "Lexend", system-ui, sans-serif`. Carga Lexend 700 y 800 desde Google Fonts.
- Cuerpo: Nunito 400, 600 y 800 desde Google Fonts.
- Escala con `clamp()`:
  - `--fs-display-xl: clamp(7rem, 30vw, 20rem)`
  - `--fs-display: clamp(4.5rem, 17vw, 11rem)`
  - `--fs-h1: clamp(2.25rem, 6vw, 3.75rem)`
  - `--fs-h2: clamp(1.75rem, 4vw, 2.5rem)`
  - `--fs-body: clamp(1rem, 1.2vw, 1.125rem)`
  - `--fs-small: 0.875rem`
  - `--fs-tiny: 0.8125rem`

### Otros tokens

- Radios: 6px, 14px, 24px y 999px.
- Sombras duras sin desenfoque, estilo recorte de papel: `4px 4px 0 var(--ink-black)` o `6px 6px 0 var(--oxford)`.
- Fondo general: `--ink-black` con un patrón sutil de puntos en `--oxford` hecho con `radial-gradient`.

## Flujo y rutas (hash router)

1. `#/bienvenida`: pantalla "bromita" (sección A). Es lo primero que se ve en cada visita, y se salta durante la misma sesión del navegador con `sessionStorage`.
2. Sin sesión: `#/entrar`, `#/registro` y `#/recordar`.
3. Con sesión:
   - `#/inicio`: encabezado ULI 23, calendario y botones de categoría.
   - `#/categoria/<slug>`: tarjetas de una categoría.
   - `#/regalo/<slug>`: detalle del producto.
   - `#/mis-regalos`: lo que guardé.
   - `#/admin`: panel de admin (solo cuentas admin).

Navegación fija abajo en celular (Inicio, Regalos, Mis regalos, Salir) y arriba en tablet y escritorio.

## A. Pantalla de bienvenida "bromita"

- A pantalla completa, fondo `--ink-black` con el patrón.
- Texto centrado en Eras Bold con tamaños mezclados:
  - "bromita," pequeño, en `--muted-dark`, rotado -4deg.
  - "tu regalo es" mediano, en `--bone`.
  - "mi presencia" gigante (`clamp(3.5rem, 13vw, 9rem)`), en `--gold`, con sombra dura `6px 6px 0 var(--oxford)`.
- Debajo, un botón gigante a casi todo el ancho en celular y unos 560px en escritorio: fondo `--yellow`, texto `--ink-black` en Eras Bold de unos `clamp(1.25rem, 3.5vw, 2rem)`, borde de 3px `--ink-black`, sombra dura de 6px e icono `fa-gift` grande que rebota levemente cada pocos segundos. Texto: "Aun así te quiero regalar algo".
- Al tocar el botón:
  1. La pantalla sale con un fundido y un desplazamiento hacia arriba (400 ms).
  2. Si no hay sesión, entra el acceso. Si hay sesión, entra el inicio en cascada de arriba hacia abajo: navegación, encabezado ULI 23, calendario, título "Elige tu categoría" y cada botón de categoría. Cada bloque aparece con `opacity` de 0 a 1 y `translateY(-24px)` a 0, con 90 ms de diferencia entre bloques. Usa una clase `.cascada` y `--i` para el retraso, por ejemplo `animation-delay: calc(var(--i) * 90ms)`.

## B. Encabezado "ULI 23"

- La foto cuadrada de Ulises en un marco polaroid (borde `--paper` grueso, más ancho abajo), rotada -3deg, con dos tiras de cinta adhesiva hechas en CSS (`--gold` al 70% de opacidad).
- "23" enorme (`--fs-display-xl`) en `--gold`, Eras Bold, `line-height: 0.8`, `letter-spacing: -0.06em`, con sombras duras en capas: `6px 6px 0 var(--oxford), 12px 12px 0 var(--prussian)`. Se cruza con el marco de la foto: un segundo "23" solo con contorno (`-webkit-text-stroke: 2px var(--gold)`) desplazado da profundidad.
- "ULI" grande (`--fs-display`) en `--bone`, con sombra dura `5px 5px 0 var(--yellow)`. La "I" final va ligeramente desplazada para dar ritmo.
- Cinta `--yellow` rotada 4deg con "6 de diciembre 2026" en Nunito 800.
- Iconos decorativos enormes (`fa-star`, `fa-cake-candles`, `fa-gift`, `fa-champagne-glasses`) en dorado, de distintos tamaños y rotaciones, flotando suavemente.
- Responsivo:
  - Celular: una columna; "ULI" encima de la foto y sobresaliendo del marco, y el "23" debajo rompiendo el margen.
  - Tablet: foto a la izquierda (45%) y texto a la derecha.
  - Escritorio: grid de 12 columnas, con el "23" cruzando detrás del texto. Ancho máximo de 1200px.

## C. Calendario de diciembre 2026 (CSS puro)

- Hoja `--paper` con sombra dura `8px 8px 0 var(--oxford)` y espiral superior hecha con CSS (anillos con pseudoelementos o `repeating-linear-gradient`).
- "Diciembre" en Eras Bold a la izquierda y "2026" a la derecha.
- Grid de 7 columnas, de domingo a sábado. El 1 de diciembre de 2026 es martes, así que van dos celdas vacías antes. El domingo 6 va resaltado en `--gold` con `fa-cake-candles` y una miniatura polaroid de Ulises que desborda la celda.
- Cuenta regresiva pequeña ("faltan 3") en los días anteriores, solo si la fecha no ha pasado.
- Responsivo:
  - Escritorio: celdas con `aspect-ratio: 1`.
  - Tablet: celdas con `aspect-ratio: 4 / 3`.
  - Celular: arriba, un bloque grande de 3 columnas con Sáb 5, Dom 6 y Lun 7; debajo, el mes compacto.
- `calendario.js` solo genera el HTML; el diseño es CSS.

### Stickers PNG

`assets/stickers.json` guarda la posición de cada sticker en porcentajes (`x`, `y` y `ancho`) y grados (`rotacion`), con valores para `movil`, `tablet` y `desktop`, y un `contenedor` (`encabezado`, `calendario` o `categorias`). Los valores se aplican con variables CSS por media query. Los stickers llevan `pointer-events: none`, `alt=""` y `aria-hidden="true"`, y nunca tapan texto ni botones. Crea el archivo inicial con todos los stickers que encuentres.

## D. Botones de categoría (sección "Elige tu categoría")

Cada categoría es un rectángulo grande y llamativo:

- Grid: 1 columna en celular, 2 en tablet y 4 en escritorio (`repeat(auto-fill, minmax(260px, 1fr))`). Alto aproximado de 180 a 220px.
- Rectángulo con `background: var(--cat-fondo)`, borde grueso de 4px en `--ink-black`, radio de 14px y sombra dura `6px 6px 0 var(--ink-black)`.
- Icono de Font Awesome de la categoría (`fa-solid`) enorme, en `var(--cat-icono)`, de 140% a 170% del alto del botón, colocado "desacomodado": desplazado hacia una esquina, rotado entre -18 y 18 grados (distinto en cada categoría) y recortado por el rectángulo (`overflow: hidden`), de modo que ocupe casi todo el fondo.
- Encima del icono, en una esquina:
  - Nombre de la categoría en Eras Bold, color `var(--cat-texto)`, de `clamp(1.25rem, 2.4vw, 1.75rem)`.
  - Subtítulo pequeño (por ejemplo "Hasta $200").
  - Contador "12 regalos".
- Escritorio (hover): el botón sube 4px, la sombra crece a 10px y aparece un brillo de luz: un pseudoelemento con un `linear-gradient` blanco semitransparente en diagonal que cruza el botón de izquierda a derecha en 600 ms. El icono gira 6 grados más.
- Celular (al tocar): animación de 0.5 segundos. El icono hace un rebote creciendo (escala 1, luego 1.25, luego 0.95 y de vuelta a 1) y el botón baja 3px con la sombra reducida, como si se presionara papel. Después navega a la categoría.
- Accesibilidad: cada botón es un `<a>` o `<button>` real, con foco visible en `--gold`.

## E. Tarjetas de la categoría (`#/categoria/<slug>`)

- Encabezado de la categoría con su color de fondo, el icono gigante recortado igual que en el botón, y el nombre y el subtítulo grandes. Botón "Volver" con `fa-arrow-left`.
- Grid de tarjetas: 1 columna en celular, 2 en tablet y 3 o 4 en escritorio.
- Tarjeta: fondo `--paper`, sombra dura y ligera rotación alternada que se endereza en hover. Muestra:
  - Imagen cuadrada con `object-fit: contain` sobre fondo blanco. Si no hay imagen, un bloque con el color de la categoría y su icono.
  - Nombre corto en Eras Bold.
  - Precio en una cinta `--yellow` ("$349 aprox.", "Gratis" o "Tú decides").
  - Talla, si existe.
- Estados:
  - `disponible`: tarjeta normal.
  - `reservado` (solo exclusivos): baja saturación, sello rotado "Ya lo apartaron" con `fa-lock` y sin acción para guardar. Al tocarla se abre el detalle, pero el botón aparece deshabilitado.
  - `mio`: borde de 3px en `--gold` y etiqueta "Lo guardaste".
  - En los compartidos, muestra "3 personas lo guardaron" usando `personas`. Nunca muestres nombres.
- Toda la tarjeta lleva al detalle.

## F. Detalle del producto (`#/regalo/<slug>`)

Pantalla pensada para que con solo el link se entienda el regalo:

- Celular: todo en una columna. Escritorio: imagen a la izquierda (55%) e información a la derecha.
- Imagen grande, protagonista, en marco polaroid con leve rotación, que ocupa todo el ancho en celular.
- Nombre en Eras Bold (`--fs-h1`).
- Precio grande en una cinta `--yellow` ("$349 MXN aprox."), con la tienda al lado en texto pequeño.
- Descripción en texto pequeño gris claro (`--fs-tiny`, color `--gris-claro`, `line-height: 1.6`).
- Talla y nota, si existen, como etiquetas pequeñas ("Talla CH", "Ideal para familia").
- Botón principal grande: "Guardar este regalo" (`fa-bookmark`). Si ya es mío: "Soltar regalo" (`fa-rotate-left`). Si está reservado: deshabilitado con "Ya lo apartaron".
- Enlace secundario "Ver en la tienda" (`fa-arrow-up-right-from-square`), que abre en una pestaña nueva con `rel="noopener"`.
- Mensaje fijo debajo del botón, en una cajita con borde punteado, icono `fa-user-secret` y texto pequeño: "Ulises no sabrá quién guardó qué, porque ama las sorpresas."
- Al guardar:
  1. Confirmación en un modal: "¿Guardar [nombre]?" con los botones "Sí, lo guardo" y "Cancelar".
  2. `supabase.rpc('reservar_regalo', { p_regalo_id })`.
  3. Si sale bien, se muestra la pantalla de gracias (sección G).
  4. Errores:
     - `regalo_tomado`: "Alguien se te adelantó con este regalo. Elige otro."
     - `ya_tienes_regalo`: "Ya tienes un regalo apartado. Suéltalo para elegir otro." con botón a `#/mis-regalos`. Aclara que los regalos gratis y los de "Tú consigue el mejor precio" no cuentan.
     - `ya_lo_guardaste`: "Ya lo tienes guardado."
     - `admin_no_reserva`: "Esta es la cuenta de Uli, no puede guardar regalos."
     - `regalo_no_existe`: "Este regalo ya no está disponible."
- Al soltar: modal "¿Soltar [nombre]? Quedará libre para otras personas.", luego `supabase.rpc('soltar_regalo', { p_regalo_id })` y el toast "Regalo liberado".

## G. Pantalla de gracias

Aparece cada vez que alguien guarda un regalo, de cualquier tipo:

- Capa a pantalla completa (`position: fixed; inset: 0`) sobre fondo `--ink-black` al 92%.
- "Gracias" gigante en Eras Bold (`clamp(4rem, 18vw, 12rem)`), en `--gold`, con sombra dura `--oxford`. Entra con escala de 0.6 a 1 y un rebote.
- Debajo, una imagen al azar de `assets/gracias/` (según `gracias.json`), en marco polaroid rotado, de máximo 70vw en celular y 420px en escritorio. Entra girando desde -12deg.
- Confeti de 40 a 60 piezas hechas en CSS con colores de la paleta (cuadros y tiras), que se eliminan del DOM al terminar.
- Se quita sola después de 2.8 segundos con un fundido, o antes si tocas la pantalla o presionas Escape. Después vuelve al detalle, ya en estado "Lo guardaste".
- Precarga la imagen elegida antes de mostrar la capa, para que no aparezca vacía.

## H. Mis regalos (`#/mis-regalos`)

- Arriba, "Tu regalo apartado": el exclusivo, en grande, con imagen, nombre en Eras Bold y precio, más los botones "Ver en la tienda" y "Soltar regalo y elegir otro".
  - Si no tiene uno, una invitación: "Todavía no apartas un regalo" con botón "Ver categorías".
- Debajo, "También vas a dar": la lista de compartidos guardados (tarjetas pequeñas), cada una con su opción de soltar.
- Recordatorio pequeño con `fa-user-secret`: "Ulises no sabrá quién guardó qué."

## I. Acceso: registro, entrar y recordar usuario

Panel `--prussian` centrado, con el "23" gigante en `--oxford` como marca de agua e iconos dentro de los campos (`fa-user`, `fa-lock`, `fa-envelope`). Botón de mostrar u ocultar contraseña.

- **Registro:**
  - Campos: nombre, usuario, correo, contraseña y confirmación.
  - Usuario con el formato `^[a-z0-9_.]{3,20}$`, convertido a minúsculas mientras se escribe. Revisa si está libre con `usuario_disponible` (retraso de 400 ms).
  - Contraseña de mínimo 8 caracteres.
  - Llama a `supabase.auth.signUp({ email, password, options: { data: { usuario, nombre } } })` y después a la Edge Function `enviar-usuario` con el correo.
- **Entrar:**
  - Usuario y contraseña. Llama a la Edge Function `login-usuario`, que devuelve los tokens, y luego a `supabase.auth.setSession`.
  - Si lo escrito contiene `@`, usa `signInWithPassword` directo.
  - Error genérico: "Usuario o contraseña incorrectos."
  - "Olvidé mi contraseña" usa `resetPasswordForEmail` con `redirectTo` a la URL de GitHub Pages.
- **Recordar usuario:** correo, llamada a `enviar-usuario` y siempre el mismo mensaje: "Si ese correo está registrado, te enviamos tu usuario."
- Errores en línea junto a cada campo, en `--danger`, que desaparecen al editar.

## J. Panel de admin (`#/admin`, solo cuentas con `es_admin = true`)

El perfil de admin se crea solo: quien se registra con un correo de la tabla `admins_permitidos` queda como admin. No hay que hacer nada en el frontend para crearlo; solo lee `perfiles.es_admin` de tu sesión al iniciar.

Reglas para la cuenta admin:
- En la navegación aparece "Admin" (icono `fa-screwdriver-wrench`). Para el resto de las personas no existe; si alguien escribe `#/admin` sin ser admin, se le redirige a `#/inicio`.
- En el catálogo ve los estados (apartado o libre, y cuántas personas guardaron cada compartido), nunca quién. No ve botones para guardar regalos.
- Usa solo estas funciones: `admin_listar_regalos()`, `admin_guardar_regalo(...)`, `admin_cambiar_activo(p_id, p_activo)`, `admin_eliminar_regalo(p_id)` y `admin_resumen()`. Todas responden `solo_admin` si la cuenta no es admin.

El panel tiene tres pestañas (botones grandes tipo chip; en celular quedan fijas arriba):

### J1. Agregar regalo (pestaña por defecto)

Pensada para usarse desde el celular: copias el link en la app de la tienda y lo pegas aquí.

1. Campo grande "Pega el link del producto" con:
   - Un botón "Pegar" (`fa-paste`) que usa `navigator.clipboard.readText()`. Si el navegador no lo permite, enfoca el campo y muestra "Mantén presionado y pega".
   - Un botón principal "Leer link" (`fa-wand-magic-sparkles`).
   - Valida que sea una URL `http` o `https`.
2. Al leer:
   - Muestra un esqueleto de carga con la forma del detalle del producto.
   - Llama a la Edge Function `extraer-producto` con `{ url }` y la sesión actual.
   - Si falla o tarda más de 15 segundos, intenta desde el navegador con `https://api.microlink.io/?url=<url>&palette=false&audio=false&video=false` (permite CORS), y toma `data.title`, `data.description` y `data.image.url`.
   - Si las dos fallan, muestra "No pude leer este link. Llena los datos a mano." y deja el formulario vacío con el link puesto. Nunca bloquea al admin.
3. Vista previa y formulario:
   - Escritorio: vista previa a la izquierda, idéntica al detalle del producto de la sección F (imagen grande, nombre, precio en cinta amarilla y descripción en gris claro pequeño), y formulario a la derecha.
   - Celular: vista previa arriba y formulario abajo.
   - La vista previa se actualiza en vivo mientras se edita.
4. Campos del formulario:
   - Nombre corto: obligatorio, máximo 40 caracteres, con contador. Sugiere uno de 2 a 4 palabras a partir del título de la tienda (quita marca repetida, medidas y textos como "para hombre").
   - Categoría: obligatoria. Se elige con mini botones de categoría con sus colores e icono, no con un `select` aburrido. Se sugiere sola según el precio: hasta 100 "No me queda nadaaaaaaa", hasta 200 "Presupuesto estudihambre", hasta 300 "Presupuesto mini adulto", hasta 500 "Mini adulto", hasta 1000 "Adulto pro max" y más de 1000 "Sugar daddy". Si el precio pasa el tope de la categoría elegida, avisa en `--yellow` (sobre fondo oscuro): "Este precio pasa el tope de la categoría. ¿Lo muevo a [categoría]?", con un botón para moverlo.
   - Tipo: interruptor entre "Solo una persona" (exclusivo) y "Cualquiera puede darlo" (compartido), con una línea que explica la diferencia. En las categorías Gratis y "Tú consigue el mejor precio" se pone en compartido automáticamente.
   - Precio en MXN: opcional. Vacío significa "Tú decides" y 0 significa "Gratis".
   - Descripción: texto corto, opcional.
   - Talla y nota: opcionales. La nota es algo como "Ideal para familia".
   - Tienda: se llena sola a partir del dominio (Amazon, Mercado Libre, Decathlon, H&M, Zara, Bershka, LEGO, Liverpool, Shein y similares).
   - Imagen: muestra la que se encontró, con dos opciones:
     - "Subir otra": acepta un archivo o una foto de la cámara en celular (`accept="image/*"`). Antes de subirla al bucket `regalos` como `regalos/<uuid>.webp`, la reduce en el navegador con `canvas` a un lado mayor de 1200 px.
     - "Usar URL de imagen": un campo para pegar la URL de una imagen.
5. Botón principal "Añadir regalo" (`fa-plus`):
   - Llama a `admin_guardar_regalo` con `p_id = null`.
   - Si sale bien, muestra el toast "Regalo añadido", deja el formulario listo para el siguiente y ofrece "Ver cómo quedó", que lleva al detalle del producto.
   - Errores: `falta_nombre`, `seccion_no_existe`, `tipo_invalido` y `precio_invalido`, cada uno mostrado junto a su campo.
6. Enlace secundario "Agregar sin link": abre el mismo formulario vacío, para regalos como "Carta" o "Abrazo".

Limpieza de links antes de guardar y antes de leerlos:
- Amazon: deja solo `https://www.amazon.com.mx/dp/<ASIN>`. Saca el ASIN de `/dp/`, `/gp/product/` o `/gp/aw/d/`.
- Mercado Libre: quita todo después de `#` y los parámetros de rastreo.
- En todas las tiendas: quita los parámetros `utm_*`, `ref`, `ref_`, `tag`, `dib`, `dib_tag`, `qid`, `sr`, `crid`, `sprefix`, `psc` y `smid`. Conserva los que eligen color o talla (`v1`, `v2`, `colorId`, `variant`, `th`).
- Links cortos de las apps (`amzn.to`, `a.co`, `meli.la` y similares): la Edge Function sigue las redirecciones y devuelve también `url_final` limpia, y esa es la que se guarda.

### J2. Regalos

- Lista agrupada por categoría (con el color de cada una), con buscador por nombre y filtro "Mostrar ocultos".
- Cada fila muestra miniatura, nombre, precio, tipo y estado:
  - Exclusivo: "Apartado" o "Libre".
  - Compartido: "3 personas".
  - Nunca nombres.
- Acciones por fila:
  - Editar: abre el formulario de J1 con los datos y guarda con `admin_guardar_regalo(p_id, ...)`. Si responde `ya_lo_guardaron_varios`, muestra "No puede volverse de una sola persona porque ya lo guardaron varias."
  - Mostrar u ocultar: un interruptor que llama a `admin_cambiar_activo`. Los ocultos se ven con baja opacidad y la etiqueta "Oculto".
  - Borrar: un icono `fa-trash` con un modal de confirmación. Si responde `tiene_reservas`, muestra "Alguien ya lo guardó. Mejor ocúltalo para no arruinarle el regalo." con un botón "Ocultar".
- En celular, cada fila es una tarjeta compacta y las acciones van en un menú de tres puntos (`fa-ellipsis-vertical`).

### J3. Resumen

- Cuatro tarjetas grandes con `admin_resumen()`:
  - Personas registradas.
  - "18 de 34" regalos apartados, con una barra de progreso dorada.
  - Regalos compartidos guardados.
  - Días que faltan para el 6 de diciembre.
- Recordatorio: "Aquí nunca vas a ver quién guardó qué."

## K. Edge Functions (Deno, en `supabase/functions/`)

- **`login-usuario`** (`verify_jwt = false`):
  - Recibe `POST { usuario, password }`.
  - Con la service role key busca el `id` por usuario, obtiene el correo con `auth.admin.getUserById`, hace `signInWithPassword` con un cliente anon y devuelve `{ access_token, refresh_token }`.
  - Si algo falla, devuelve 401 con un mensaje genérico. Maneja CORS para el dominio de GitHub Pages y `localhost`.
- **`enviar-usuario`** (`verify_jwt = false`):
  - Recibe `POST { email }`.
  - Si el correo existe, envía con Resend (`RESEND_API_KEY` y `CORREO_REMITENTE`) un correo con el asunto "Tu usuario para el cumple de Uli": HTML con fondo `#000814`, "ULI 23" en `#ffd60a`, el usuario en grande y un botón a `SITIO_URL`. Sin emojis.
  - Responde siempre `{ ok: true }`.
- **`extraer-producto`** (`verify_jwt = true`, solo admin):
  - Crea un cliente con el header `Authorization` de la petición y llama a `rpc('es_admin')`. Si no es `true`, devuelve 403.
  - Recibe `POST { url }`, sigue las redirecciones (hasta 5) y limpia el link con las reglas de J1.
  - Descarga el HTML con un `User-Agent` de navegador de escritorio y `Accept-Language: es-MX`, con un límite de 10 segundos.
  - Extrae los datos en este orden: JSON-LD `Product`, Open Graph y selectores de Amazon (igual que el script del Paso 1). Si la tienda lo bloquea, intenta con Microlink desde el servidor.
  - Descarga la imagen principal, valida que sea `image/*` y pese menos de 8 MB, y la sube con la service role al bucket `regalos` como `regalos/<uuid>.<ext>`. Si la subida falla, devuelve la URL original de la imagen.
  - Devuelve `{ url_final, nombre, descripcion, precio, moneda, imagen_url, tienda }` con los campos que no encontró en `null`, y `200` aunque falten datos.
  - Maneja CORS para el dominio de GitHub Pages y `localhost`.

## L. Animaciones (resumen)

- Cascada de arriba hacia abajo al entrar (sección A).
- Entrada de secciones con `IntersectionObserver` (24px y una leve rotación).
- Iconos decorativos flotando de 4 a 6 segundos, desfasados.
- Botones que se presionan como papel (la sombra se reduce y el botón baja 2px).
- Brillo en hover y rebote del icono al tocar las categorías (sección D).
- Pantalla de gracias con escala, giro y confeti (sección G).
- Transiciones entre rutas de 200 a 300 ms.
- Solo `transform` y `opacity`.

## M. Calidad y entrega

- HTML semántico, foco visible, navegación con teclado, y modales que atrapan el foco y se cierran con Escape.
- Prueba en 360, 390, 768, 1024, 1280 y 1440 px, sin desbordes horizontales.
- Imágenes de más de 400 KB: avísame y propón una versión WebP.
- `config.js` con valores de ejemplo. Nunca pongas la service role key en el frontend.
- `README.md` con:
  - Cómo correrlo en local (`npx serve .`).
  - Cómo ejecutar el script de extracción y el SQL.
  - Cómo desplegar las Edge Functions.
  - Cómo publicar en GitHub Pages.
- Resumen final: archivos creados, regalos sin imagen o sin precio, y lo que falta que yo configure.

Empieza por el Paso 0 y muéstrame el inventario antes de seguir.
