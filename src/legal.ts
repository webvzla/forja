// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Datos legales de la beta. No se inventan ni se publican valores por defecto. El nombre y el correo del titular NO se
// escriben en el repositorio: llegan al compilar (EXPO_PUBLIC_TITULAR y EXPO_PUBLIC_CORREO_CONTACTO). Mientras falten (o LEGAL_REVISADO sea false), `scripts/lanzamiento.mjs` impide preparar el lanzamiento
// y las pantallas legales muestran «[pendiente de confirmar]».
export const TITULAR = (process.env.EXPO_PUBLIC_TITULAR ?? '').trim(); // nombre público del titular
export const CORREO_CONTACTO = (process.env.EXPO_PUBLIC_CORREO_CONTACTO ?? '').trim(); // contacto de FORJA (también para ejercer derechos)
export const PROVEEDOR_CORREO = 'Google (Gmail)'; // servicio que envía los correos de registro y el aviso de opiniones
export const LEGAL_REVISADO = false; // true solo cuando un profesional haya revisado los textos y el titular los apruebe

export const VERSION_TEXTOS = 2; // sube cuando cambien la privacidad o los términos
export const EDAD_MINIMA = 16; // provisional, pendiente de la revisión legal
export const PLAZO_OPINIONES = '12 meses'; // borrado MANUAL de opiniones y capturas: no hay nada automático

export const PENDIENTE = '[pendiente de confirmar]';
export const o = (x: string) => (x.trim() ? x : PENDIENTE);
export const legalCompleto = () => !!(TITULAR.trim() && CORREO_CONTACTO.trim() && LEGAL_REVISADO);
