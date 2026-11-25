// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Enlaces para compartir FORJA e invitar amigos.
//  - Recomendar: la dirección de la app, sin datos personales.
//  - Invitar: la dirección con ?amigo=CÓDIGO. Al abrirla, la app guarda el código y, cuando la
//    persona tiene cuenta, le ofrece enviar la solicitud de amistad (nunca la envía sin preguntar).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CLAVE = 'forja:invitacion';
const CODIGO = /^FORJA-[A-Z0-9]{4,6}$/;
// Dirección pública de la app (la usada si no se puede deducir del navegador).
const DIRECCION_PUBLICA = 'https://webvzla.github.io/forja/';

export const codigoValido = (c: string) => CODIGO.test(c.trim().toUpperCase());

export function direccionApp(): string {
  if (Platform.OS === 'web' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
    return `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
  }
  return DIRECCION_PUBLICA;
}

export const enlaceInvitacion = (codigo: string) => `${direccionApp()}?amigo=${encodeURIComponent(codigo.trim().toUpperCase())}`;

export const textoRecomendar = () =>
  `Te recomiendo FORJA, una app gratis para entrenar en el gimnasio o en casa: rutinas a tu medida, comida, retos con amigos y guías de cada ejercicio. Funciona en el móvil sin descargar nada: ${direccionApp()}`;

export const textoInvitacion = (codigo: string) =>
  `¡Compite conmigo en FORJA Arena! Abre este enlace, crea tu cuenta gratis y seremos amigos en la app: ${enlaceInvitacion(codigo)} (mi código es ${codigo}).`;

// Lee ?amigo= de la dirección al abrir la app, lo guarda y limpia la dirección.
export async function capturarInvitacion(): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof location === 'undefined') return null;
  try {
    const url = new URL(location.href);
    const c = (url.searchParams.get('amigo') ?? '').trim().toUpperCase();
    if (!c) return invitacionPendiente();
    url.searchParams.delete('amigo');
    history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
    if (!CODIGO.test(c)) return invitacionPendiente();
    await AsyncStorage.setItem(CLAVE, c);
    return c;
  } catch {
    return null;
  }
}

export async function invitacionPendiente(): Promise<string | null> {
  try {
    const c = await AsyncStorage.getItem(CLAVE);
    return c && CODIGO.test(c) ? c : null;
  } catch {
    return null;
  }
}

export const olvidarInvitacion = () => AsyncStorage.removeItem(CLAVE).catch(() => {});
