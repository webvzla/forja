// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Conexión con Supabase. Los valores salen de variables de entorno (archivo .env.local, que
// nunca se sube a GitHub). Plantilla: .env.example.
//   EXPO_PUBLIC_SUPABASE_URL       → Project Settings → API → Project URL
//   EXPO_PUBLIC_SUPABASE_ANON_KEY  → Project Settings → API Keys → clave "anon" / "publishable"
// La clave anon es pública por diseño (va dentro de la web): los datos los protegen las reglas
// RLS y las funciones del servidor. NUNCA pongas aquí la clave service_role / secret.
// Si faltan, la app funciona como siempre: solo en el dispositivo, sin cuentas ni Arena real.
const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const clave = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

// Defensa extra: una clave de servicio jamás debe llegar al navegador.
const esClaveDeServicio = (k: string) => {
  if (k.startsWith('sb_secret_')) return true;
  try {
    const cuerpo = k.split('.')[1];
    return !!cuerpo && JSON.parse(atob(cuerpo.replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role';
  } catch {
    return false;
  }
};

// Válidas: el proyecto en la nube o un Supabase local (CLI) en este ordenador.
export const SUPABASE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url) ? url : '';
export const SUPABASE_ANON_KEY = clave && !esClaveDeServicio(clave) ? clave : '';
if (clave && !SUPABASE_ANON_KEY) console.error('FORJA: la clave configurada es de servicio. No se usará en la app.');

// Captcha (Cloudflare Turnstile): site key PÚBLICA. Vacía = sin captcha (desarrollo y pruebas). Solo se acepta el formato de una
// site key; la secret key NUNCA va en la app (solo en Supabase → Authentication → Attack Protection).
const claveCaptcha = (process.env.EXPO_PUBLIC_CAPTCHA_SITEKEY ?? '').trim();
export const CAPTCHA_SITEKEY = /^[0-9]x[A-Za-z0-9_-]{16,}$/.test(claveCaptcha) ? claveCaptcha : '';
if (claveCaptcha && !CAPTCHA_SITEKEY) console.error('FORJA: la clave del captcha no tiene el formato de una site key de Turnstile. No se usará.');

// Inteligencia artificial (Gemini): aplazada a una fase posterior. Mientras sea false, la app no
// muestra ni llama a ninguna función de IA (ticket por IA, foto del plato, recetas con IA, chat del
// coach) y todo funciona con las reglas y el lector de tickets del propio móvil.
export const IA_ACTIVA = false;

// Solo para la demostración de FORJA 2.0: datos ficticios en ARENA y en tu propio perfil.
// En la versión publicada debe ser false.
export const DEMO = false;
