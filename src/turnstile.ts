// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Cloudflare Turnstile (captcha) — lógica pura y sin red; el widget está en Captcha.tsx.
// La app SOLO pide la comprobación si hay una site key configurada (EXPO_PUBLIC_CAPTCHA_SITEKEY). Sin clave todo funciona como
// siempre (desarrollo, servidor simulado, pruebas). El interruptor del lado del servidor se activa DESPUÉS en Supabase
// (Authentication → Attack Protection) con la secret key, que NUNCA va en la app: si el servidor lo exigiera y la app no enviase
// token, el registro, la entrada y la recuperación fallarían; por eso el orden es primero la app con el widget y luego el servidor.

export const URL_SCRIPT_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Las site keys de Turnstile empiezan por un dígito y «x» (p. ej. 0x4AAAA…, o las de prueba 1x000…AA).
export const esSiteKeyValida = (k: string) => /^[0-9]x[A-Za-z0-9_-]{16,}$/.test(k.trim());

// Claves de prueba de Cloudflare (siempre pasa / siempre falla / fuerza interacción): válidas para desarrollar, nunca para publicar.
export const esClaveDePrueba = (k: string) => /^[123]x0{12,}[A-Za-z0-9]*$/.test(k.trim());

// Pantallas donde Supabase protege con captcha: entrar, crear cuenta y recuperar contraseña (no «nueva contraseña»).
const MODOS_CON_CAPTCHA = ['entrar', 'registro', 'olvido'];
export const requiereCaptcha = (siteKey: string, modo: string) => esSiteKeyValida(siteKey) && MODOS_CON_CAPTCHA.includes(modo);

// Opciones que se pasan a supabase-js (`options.captchaToken`). Sin token no se envía nada.
export const opcionesCaptcha = (token: string | null | undefined): { captchaToken?: string } => (token ? { captchaToken: token } : {});

export type EstadoCaptcha = 'cargando' | 'listo' | 'caducado' | 'error' | 'sin-script';

// Texto de ayuda según el estado del widget (null = nada que decir).
export function textoCaptcha(estado: EstadoCaptcha, hayToken: boolean): string | null {
  if (estado === 'sin-script') return 'No se pudo cargar la comprobación anti-robots. Revisa tu conexión o desactiva el bloqueador de contenido y vuelve a intentarlo.';
  if (estado === 'error') return 'No se pudo completar la comprobación. Inténtalo de nuevo.';
  if (estado === 'caducado') return 'La comprobación caducó: complétala de nuevo.';
  if (estado === 'cargando') return 'Cargando la comprobación anti-robots…';
  return hayToken ? null : 'Completa la comprobación anti-robots para continuar.';
}
