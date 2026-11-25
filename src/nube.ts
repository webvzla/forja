// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Cuentas, datos en la nube e IA (todo a través de Supabase).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import { IA_ACTIVA, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { Datos } from './datos';
import { olvidarArena } from './servidorArena';
import { esquemaMasNuevo, fusionarDatos } from './fusion';
import { esErrorEsquema, subirDatos, traerNovedades } from './subida';

export const nubeActiva = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
// La IA necesita la nube (la clave de Gemini vive en el servidor) y que esté activada en config.ts.
export const iaActiva = nubeActiva && IA_ACTIVA;

export const sb: SupabaseClient | null = nubeActiva
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: Platform.OS === 'web',
        // PKCE: los enlaces de recuperación traen un código de un solo uso, no la sesión en la URL.
        flowType: 'pkce',
      },
    })
  : null;

const SIN_CUENTA = 'mi-gym:sin-cuenta';
export const usarSinCuenta = (si: boolean) => (si ? AsyncStorage.setItem(SIN_CUENTA, '1') : AsyncStorage.removeItem(SIN_CUENTA));
export const eligioSinCuenta = async () => (await AsyncStorage.getItem(SIN_CUENTA)) === '1';

export async function usuarioActual(): Promise<User | null> {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

export function mensajeError(e: unknown) {
  const m = String((e as any)?.message ?? '');
  if (/invalid login/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/already registered|already exists/i.test(m)) return 'Ya hay una cuenta con ese email. Entra con tu contraseña.';
  if (/not confirmed/i.test(m)) return 'Confirma tu email primero (mira también en spam).';
  if (/rate|too many|security purposes/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
  if (/password/i.test(m) && /\d/.test(m)) return 'La contraseña es demasiado corta o débil. Usa al menos 8 caracteres.';
  if (/captcha/i.test(m)) return 'No se pudo comprobar que eres una persona. Inténtalo de nuevo.';
  return 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.';
}

export async function borrarCuenta(): Promise<boolean> {
  if (!sb) return false;
  const uid = (await usuarioActual())?.id;
  const { error } = await sb.rpc('borrar_mi_cuenta');
  if (error) return false;
  if (uid) await olvidarArena(uid);
  await sb.auth.signOut({ scope: 'local' });
  return true;
}

// ---------- Datos ----------
// Qué versión de la nube tiene incorporada este dispositivo (`actualizado`). Si sigue igual, subir no necesita traer nada.
// `undefined` = no se sabe todavía (la primera subida trae y fusiona el documento entero).
let vista: string | null | undefined;
// Lo último que se leyó de la nube y aún no se ha subido ya fusionado: cada subida lo incorpora, pase lo que pase en la pantalla.
let porIncorporar: Datos | null = null;
let bloqueadoPorVersion = false; // la nube tiene datos de una versión más nueva de la app: no se sube nada hasta actualizar

export function olvidarSincronizacion() {
  vista = undefined;
  porIncorporar = null;
  bloqueadoPorVersion = false;
}

export async function cargarNube(uid: string): Promise<Datos | null | 'error'> {
  if (!sb) return 'error';
  olvidarSincronizacion();
  const { data, error } = await sb.from('datos_usuario').select('datos,actualizado').eq('user_id', uid).maybeSingle();
  if (error) return 'error';
  if (!data) return null;
  vista = (data.actualizado as string | null) ?? null;
  if (esquemaMasNuevo(data.datos)) bloqueadoPorVersion = true; // datos de una versión más nueva: no se sube nada
  else porIncorporar = data.datos as Datos;
  return data.datos as Datos;
}

let temporizador: ReturnType<typeof setTimeout> | null = null;
let pendiente: { uid: string; d: Datos } | null = null;
let escribiendo = false;
export type EstadoNube = 'guardado' | 'guardando' | 'sin-conexion' | 'version-antigua';
let avisar: (e: EstadoNube) => void = () => {};
export const alCambiarEstado = (f: (e: EstadoNube) => void) => {
  avisar = f;
};

// Cuando al subir se descubre progreso de otro dispositivo, se avisa a la app para que lo incorpore.
let alFusionar: (d: Datos) => void = () => {};
export const alFusionarProgreso = (f: (d: Datos) => void) => {
  alFusionar = f;
};

async function volcar() {
  if (!sb || !pendiente || escribiendo) return;
  escribiendo = true;
  const { uid } = pendiente;
  // Lo último que se leyó de la nube se incorpora siempre antes de subir (la fusión no depende del orden).
  const d = porIncorporar ? fusionarDatos(pendiente.d, porIncorporar) : pendiente.d;
  pendiente = null;
  if (bloqueadoPorVersion) {
    avisar('version-antigua');
    return void (escribiendo = false);
  }
  avisar('guardando');
  // Antes de subir se fusiona el progreso con el de la nube y solo se escribe si nadie ha guardado entre medias
  // (ver subida.ts): un dispositivo con datos viejos, o dos guardando a la vez, no pisan el progreso de otro.
  let error: unknown = null;
  try {
    const r = await subirDatos(sb, uid, d, 6, vista);
    if (r.cambio) alFusionar(r.datos);
    error = r.error;
    if (esErrorEsquema(r.error)) bloqueadoPorVersion = true;
    else if (!r.error) {
      vista = r.actualizado;
      porIncorporar = null;
    }
  } catch (e) {
    error = e; // fallo de red: se reintenta con el próximo cambio
  }
  escribiendo = false;
  avisar(bloqueadoPorVersion ? 'version-antigua' : error ? 'sin-conexion' : 'guardado');
  if (error && !bloqueadoPorVersion && !pendiente) pendiente = { uid, d }; // se reintenta con el próximo cambio
  if (pendiente && !error) volcar();
}

// Trae lo que hicieron otros dispositivos (sin subir nada) y lo incorpora a la pantalla. Se llama al volver a la app,
// al recuperar la conexión y cada pocos minutos: así lo que registras en el móvil aparece en el ordenador sin tener que
// guardar nada allí. Devuelve true si había algo nuevo.
export async function sincronizarAhora(uid: string): Promise<boolean> {
  if (!sb || escribiendo || bloqueadoPorVersion) return false;
  const r = await traerNovedades(sb, uid, vista);
  if (esErrorEsquema(r.error)) {
    bloqueadoPorVersion = true;
    avisar('version-antigua');
    return false;
  }
  if (r.error || !r.datos) return false;
  vista = r.actualizado;
  porIncorporar = r.datos;
  alFusionar(r.datos);
  return true;
}

// Sube ya lo pendiente (p. ej. justo antes de cerrar sesión) y espera a que termine.
export async function volcarYa() {
  if (temporizador) {
    clearTimeout(temporizador);
    temporizador = null;
  }
  for (let i = 0; i < 50 && escribiendo; i++) await new Promise((r) => setTimeout(r, 100));
  await volcar();
}

// Si un guardado falló sin conexión, se reintenta en cuanto vuelve la red (no hace falta otro cambio).
if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('online', () => void volcar());

export function guardarNube(uid: string, d: Datos) {
  pendiente = { uid, d };
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(volcar, 1500);
}

// ---------- IA ----------
export type ErrorIA = 'sin-ia' | 'limite' | 'sesion' | 'fallo';

export function textoErrorIA(e: ErrorIA) {
  return {
    'sin-ia': 'La IA necesita una cuenta y conexión a internet.',
    limite: 'Has llegado al límite de usos de IA de hoy. Mañana se renueva.',
    sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
    fallo: 'La IA no ha podido responder. Inténtalo de nuevo.',
  }[e];
}

export async function pedirIA(prompt: string, opciones: { imagen?: { base64: string; tipo: string }; json?: boolean } = {}): Promise<string> {
  if (!sb || !(await usuarioActual())) throw 'sin-ia' as ErrorIA;
  const body: Record<string, unknown> = { prompt, json: !!opciones.json };
  if (opciones.imagen) {
    body.image = opciones.imagen.base64;
    body.mime = opciones.imagen.tipo;
  }
  const { data, error } = await sb.functions.invoke('ai', { body });
  if (error) {
    const estado = (error as any)?.context?.status;
    throw (estado === 429 ? 'limite' : estado === 401 ? 'sesion' : estado === 503 ? 'sin-ia' : 'fallo') as ErrorIA;
  }
  const texto = (data as any)?.text;
  if (!texto) throw 'fallo' as ErrorIA;
  return texto as string;
}

export function sacarJSON<T = any>(texto: string): T {
  const bloque = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const t = bloque ? bloque[1] : texto;
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}

export async function pedirJSON<T = any>(prompt: string, opciones: { imagen?: { base64: string; tipo: string } } = {}): Promise<T> {
  const p = `${prompt}\n\nResponde SOLO con un objeto JSON válido, sin texto adicional.`;
  try {
    return sacarJSON<T>(await pedirIA(p, { ...opciones, json: true }));
  } catch (e) {
    if (typeof e === 'string') throw e;
    return sacarJSON<T>(await pedirIA(p, { ...opciones, json: true })); // un reintento si el JSON vino roto
  }
}
