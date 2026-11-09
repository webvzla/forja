// Cuentas, datos en la nube e IA (todo a través de Supabase).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import type { Datos } from './datos';

export const nubeActiva = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const sb: SupabaseClient | null = nubeActiva
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: Platform.OS === 'web',
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
  if (/password/i.test(m) && /6/.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  return 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.';
}

export async function borrarCuenta(): Promise<boolean> {
  if (!sb) return false;
  const { error } = await sb.rpc('borrar_mi_cuenta');
  if (error) return false;
  await sb.auth.signOut();
  return true;
}

// ---------- Datos ----------
export async function cargarNube(uid: string): Promise<Datos | null | 'error'> {
  if (!sb) return 'error';
  const { data, error } = await sb.from('datos_usuario').select('datos').eq('user_id', uid).maybeSingle();
  if (error) return 'error';
  return (data?.datos as Datos) ?? null;
}

let temporizador: ReturnType<typeof setTimeout> | null = null;
let pendiente: { uid: string; d: Datos } | null = null;
let escribiendo = false;
export type EstadoNube = 'guardado' | 'guardando' | 'sin-conexion';
let avisar: (e: EstadoNube) => void = () => {};
export const alCambiarEstado = (f: (e: EstadoNube) => void) => {
  avisar = f;
};

async function volcar() {
  if (!sb || !pendiente || escribiendo) return;
  escribiendo = true;
  const { uid, d } = pendiente;
  pendiente = null;
  avisar('guardando');
  // El entreno en curso no se sube: cambia cada segundo y solo vive en el móvil.
  const { error } = await sb
    .from('datos_usuario')
    .upsert({ user_id: uid, datos: { ...d, activo: null }, actualizado: new Date().toISOString() }, { onConflict: 'user_id' });
  escribiendo = false;
  avisar(error ? 'sin-conexion' : 'guardado');
  if (error && !pendiente) pendiente = { uid, d }; // se reintenta con el próximo cambio
  if (pendiente && !error) volcar();
}

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
