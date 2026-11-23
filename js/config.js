// Cambia estos valores por los de tu proyecto (Supabase > Project Settings > API).
// La anon key es publica y puede ir aqui. NUNCA pongas aqui la service role key.

export const SUPABASE_URL = 'https://pufsalhuqkvbvfrcmnpa.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Y0ybYdBUI_SrfhbdrnhQag_I2MivbPy';

// URL donde queda publicada la pagina (GitHub Pages). Se usa para el correo
// de "olvide mi contrasena" y para confirmar la cuenta.
export const SITIO_URL = 'https://ul1seshd.github.io/Ulises-Birthday-Shopping-Cart/';

// Mientras SUPABASE_URL tenga el valor de ejemplo, la pagina funciona en modo demo:
// guarda todo en este navegador (localStorage) para que puedas verla sin configurar nada.
// En modo demo, la cuenta con usuario "uli" es la de admin.
export const MODO_DEMO = SUPABASE_URL.includes('TU-PROYECTO');
