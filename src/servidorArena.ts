// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// ARENA con datos reales (Supabase). El móvil solo envía HECHOS (entreno terminado, día con la
// proteína cumplida, preferencias); los puntos, rankings, retos y logros los calcula el servidor.
// Sin conexión, los envíos esperan en una cola guardada en el dispositivo y salen al volver la red.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { medallas } from './calculos';
import { claveDia, pesoMaximo, type Datos } from './datos';
import { sb } from './nube';
import { apodoValido } from './competicion';
import { nutricion } from './reglas';
import { PRIVACIDAD_INICIAL, type PreferenciasArena, type TipoObjetivo } from './competicion';

const DIA = 86400000;

// ---------- Tipos de lo que devuelve el servidor ----------
export type FilaNube = { id: string; apodo: string; puntos: number; entrenos: number; constancia: number; racha: number; yo: boolean };
export type PersonaNube = { id: string; apodo: string; nivel: string | null };
export type MisAmigos = { amigos: PersonaNube[]; recibidas: PersonaNube[]; enviadas: PersonaNube[]; bloqueados: PersonaNube[] };
export type Encontrado = PersonaNube & { relacion: 'ninguna' | 'amigo' | 'enviada' | 'recibida' };
export type FichaAmigo = {
  privado?: boolean;
  id: string; apodo: string; nivel: string | null; desde: string;
  entrenos: number | null; constancia: number | null; racha: number | null; medallas: number | null; records: number | null; retos: number | null;
};
export type RetoNube = {
  id: string; nombre: string; modo: 'individual' | 'grupal'; dias: 7 | 14 | 30; objetivo: TipoObjetivo; meta: number; inicio: string;
  creado_por_mi: boolean; mi_estado: 'invitado' | 'aceptado'; terminado: boolean; dias_restantes: number; cumplido: boolean;
  participantes: { id: string; apodo: string; yo: boolean; estado: 'invitado' | 'aceptado'; progreso: number }[];
};
export type LogrosNube = { puntos: number; entrenos: number; semanas_cumplidas: number; mejor_racha: number; records: number; retos_completados: number };
export type MiPerfil = { id: string; apodo: string; codigo: string; visible: 'amigos' | 'nadie'; compartir: PreferenciasArena['compartir']; nivel: string | null; dias_objetivo: number };

// Errores que el usuario puede entender (nunca se muestra el texto técnico).
export function textoError(e: unknown): string {
  const m = String((e as any)?.message ?? e ?? '');
  if (/no encontrad/i.test(m)) return 'No se ha encontrado. Revisa el código o el apodo.';
  if (/límite de amigos/i.test(m)) return 'Se ha alcanzado el máximo de 100 amigos.';
  if (/demasiad/i.test(m)) return 'Has hecho demasiadas peticiones seguidas. Espera un poco.';
  if (/solo puedes invitar/i.test(m)) return 'Solo puedes invitar a tus amigos.';
  if (/meta/i.test(m)) return 'Esa meta no es posible para la duración elegida.';
  if (/nombre/i.test(m)) return 'El nombre debe tener entre 3 y 40 letras.';
  if (/apodo/i.test(m)) return 'El apodo debe tener entre 2 y 24 caracteres, sin símbolos raros.';
  if (/fetch|network|failed|conexi/i.test(m)) return 'Sin conexión. Inténtalo cuando vuelvas a tener internet.';
  return 'No se pudo completar. Inténtalo de nuevo.';
}

async function rpc<T>(nombre: string, args?: Record<string, unknown>): Promise<T> {
  if (!sb) throw new Error('sin conexión');
  const { data, error } = await sb.rpc(nombre, args);
  if (error) throw error;
  return data as T;
}

// Una respuesta con forma inesperada se trata como error (nunca debe romper la pantalla).
async function lista<T>(nombre: string, args?: Record<string, unknown>): Promise<T[]> {
  const r = await rpc<unknown>(nombre, args);
  if (!Array.isArray(r)) throw new Error('respuesta no válida');
  return r as T[];
}
async function objeto<T>(nombre: string, args: Record<string, unknown> | undefined, campos: string[]): Promise<T> {
  const r = await rpc<any>(nombre, args);
  if (!r || typeof r !== 'object' || Array.isArray(r) || campos.some((k) => !(k in r))) throw new Error('respuesta no válida');
  return r as T;
}

// ---------- Lecturas ----------
export const miPerfil = () => objeto<MiPerfil>('mi_perfil', undefined, ['codigo', 'apodo']);
export const rankingNube = (periodo: 'semana' | 'mes', categoria: 'puntos' | 'entrenos' | 'constancia', desplazar = 0) =>
  lista<FilaNube>('ranking', { p_periodo: periodo, p_categoria: categoria, p_desplazar: desplazar });
export const historialNube = () => lista<{ semana: number; puesto: number; total: number }>('historial_posiciones');
export const misAmigos = () => objeto<MisAmigos>('mis_amigos', undefined, ['amigos', 'recibidas', 'enviadas', 'bloqueados']);
export const buscarPerfiles = (texto: string) => lista<Encontrado>('buscar_perfiles', { p_texto: texto });
export const fichaAmigo = (id: string) => objeto<FichaAmigo>('perfil_amigo', { p_id: id }, ['apodo']);
export const misRetos = () => lista<RetoNube>('mis_retos');
export const misLogros = () => objeto<LogrosNube>('mis_logros', undefined, ['retos_completados']);

// ---------- Acciones directas (necesitan conexión; la app avisa si no la hay) ----------
export const solicitarAmistad = (o: { codigo?: string; id?: string }) =>
  rpc<'enviada' | 'amigo'>('solicitar_amistad', { p_codigo: o.codigo ?? null, p_id: o.id ?? null });
export const responderAmistad = (id: string, aceptar: boolean) => rpc<string>('responder_amistad', { p_id: id, p_aceptar: aceptar });
export const eliminarAmistad = (id: string) => rpc<boolean>('eliminar_amistad', { p_id: id });
export const bloquear = (id: string) => rpc<boolean>('bloquear', { p_id: id });
export const desbloquear = (id: string) => rpc<boolean>('desbloquear', { p_id: id });
export const crearReto = (r: { nombre: string; modo: 'individual' | 'grupal'; dias: number; objetivo: TipoObjetivo; meta: number; invitados: string[] }) =>
  rpc<string>('crear_reto', { p_nombre: r.nombre, p_modo: r.modo, p_dias: r.dias, p_objetivo: r.objetivo, p_meta: r.meta, p_invitados: r.invitados, p_inicio: claveDia() });
export const responderReto = (id: string, aceptar: boolean) => rpc<boolean>('responder_reto', { p_reto: id, p_aceptar: aceptar });
export const salirReto = (id: string) => rpc<boolean>('salir_reto', { p_reto: id });

// ---------- Cola offline ----------
type Op = (
  | { tipo: 'entreno'; clave: string; args: { p_id: string; p_dia: string; p_minutos: number; p_series: number; p_descarga: boolean; p_marcas: { e: string; kg: number }[] } }
  | { tipo: 'proteina'; clave: string; args: { p_dia: string } }
  | { tipo: 'perfil'; clave: 'perfil'; args: Record<string, unknown> }
) & { intentos?: number; despues?: number };
const MAX_INTENTOS = 12;

const FUNCION: Record<Op['tipo'], string> = { entreno: 'registrar_entreno', proteina: 'marcar_dia_proteina', perfil: 'actualizar_perfil' };
let usuario: string | null = null;
let vaciando = false;
const kCola = () => `forja:arena-cola:${usuario}`;
const kHechos = () => `forja:arena-enviado:${usuario}`;

async function leer<T>(k: string, defecto: T): Promise<T> {
  try {
    const t = await AsyncStorage.getItem(k);
    return t ? (JSON.parse(t) as T) : defecto;
  } catch {
    return defecto;
  }
}

export async function pendientes(): Promise<number> {
  return usuario ? (await leer<Op[]>(kCola(), [])).length : 0;
}

async function encolar(ops: Op[]) {
  if (!usuario || !ops.length) return;
  const cola = await leer<Op[]>(kCola(), []);
  for (const op of ops) {
    const i = cola.findIndex((x) => x.clave === op.clave);
    if (i >= 0) cola[i] = op; // la última versión manda (preferencias)
    else cola.push(op);
  }
  await AsyncStorage.setItem(kCola(), JSON.stringify(cola));
}

// Errores que nunca se arreglarán reintentando (datos fuera de plazo, etc.): se descartan.
const definitivo = (e: any) => ['22023', 'P0002', '42501', '23514'].includes(e?.code);

// forzar: al volver la red o al entrar se reintenta ya, sin esperar el tiempo de espera.
export async function vaciarCola(forzar = false): Promise<void> {
  if (!sb || !usuario || vaciando) return;
  vaciando = true;
  try {
    const cola = await leer<Op[]>(kCola(), []);
    const hechos = new Set(await leer<string[]>(kHechos(), []));
    while (cola.length) {
      const op = cola[0];
      if (!forzar && op.despues && op.despues > Date.now()) break; // esperando para reintentar
      const { error } = await sb.rpc(FUNCION[op.tipo], op.args);
      if (error && !definitivo(error)) {
        // Sin red o servidor ocupado: espera creciente (30 s, 1 min, 2 min… máx. 1 h). Tras muchos
        // fallos seguidos se descarta para que una petición rota no bloquee las demás.
        const intentos = (op.intentos ?? 0) + 1;
        if (intentos < MAX_INTENTOS) {
          cola[0] = { ...op, intentos, despues: Date.now() + Math.min(3600000, 30000 * 2 ** (intentos - 1)) };
          await AsyncStorage.setItem(kCola(), JSON.stringify(cola));
          break;
        }
      }
      cola.shift();
      if (op.tipo !== 'perfil') hechos.add(op.clave);
      await AsyncStorage.setItem(kCola(), JSON.stringify(cola));
    }
    await AsyncStorage.setItem(kHechos(), JSON.stringify([...hechos].slice(-400)));
  } finally {
    vaciando = false;
  }
}

// Al borrar la cuenta: no dejar en el dispositivo nada pendiente de esa persona.
export async function olvidarArena(uid: string) {
  await AsyncStorage.multiRemove([`forja:arena-cola:${uid}`, `forja:arena-enviado:${uid}`, `forja:arena-perfil:${uid}`]).catch(() => {});
  if (usuario === uid) usuario = null;
}

// Llamar al entrar con cuenta (y con null al salir).
let escuchando = false;
export function iniciarCola(uid: string | null) {
  usuario = uid;
  if (!uid) return;
  if (Platform.OS === 'web' && !escuchando && typeof window !== 'undefined') {
    escuchando = true;
    window.addEventListener('online', () => void vaciarCola(true));
  }
  void vaciarCola(true);
}

// Mira los datos locales y encola lo que el servidor aún no tiene:
// entrenos de los últimos 7 días, días de proteína de hoy/ayer y preferencias de Arena.
export async function sincronizarArena(d: Datos) {
  if (!usuario) return;
  const hechos = new Set(await leer<string[]>(kHechos(), []));
  const cola = await leer<Op[]>(kCola(), []);
  const enCola = new Set(cola.map((x) => x.clave));
  const ops: Op[] = [];
  const limite = Date.now() - 7 * DIA;

  for (const s of d.sesiones) {
    if (s.fecha < limite) continue;
    const clave = `e:${s.id}`;
    if (hechos.has(clave) || enCola.has(clave) || s.id.length > 64) continue;
    ops.push({
      tipo: 'entreno',
      clave,
      args: {
        p_id: s.id,
        p_dia: claveDia(s.fecha),
        p_minutos: Math.max(0, Math.min(600, Math.round(s.minutos))),
        p_series: Math.min(300, s.ejercicios.reduce((a, x) => a + x.series.length, 0)),
        p_descarga: !!s.descarga,
        p_marcas: s.ejercicios.map((x) => ({ e: x.nombre.trim().toLowerCase().slice(0, 60), kg: pesoMaximo(x.series) })).filter((x) => x.e && x.kg > 0 && x.kg <= 500).slice(0, 40),
      },
    });
  }

  const meta = d.perfil ? nutricion(d.perfil).proteina : 0;
  if (meta > 0) {
    for (const t of [Date.now(), Date.now() - DIA]) {
      const dia = claveDia(t);
      const clave = `p:${dia}`;
      if (hechos.has(clave) || enCola.has(clave)) continue;
      if ((d.comida[dia] ?? []).reduce((a, x) => a + x.proteina, 0) >= meta) ops.push({ tipo: 'proteina', clave, args: { p_dia: dia } });
    }
  }

  const prefs: PreferenciasArena = { ...PRIVACIDAD_INICIAL, ...(d.ajustes?.arena ?? {}) };
  const perfil: Record<string, unknown> = {
    p_visible: prefs.visible,
    p_compartir: prefs.compartir,
    p_medallas: medallas(d).filter((m) => m.hecho).length,
    p_dias_objetivo: d.perfil?.dias ?? null,
    p_nivel: d.perfil?.nivel ?? null,
  };
  const apodo = prefs.apodo.trim();
  if (apodo.toLowerCase() !== 'tú' && apodoValido(apodo)) perfil.p_apodo = apodo;
  const firma = JSON.stringify(perfil);
  if (firma !== (await AsyncStorage.getItem(`forja:arena-perfil:${usuario}`))) {
    ops.push({ tipo: 'perfil', clave: 'perfil', args: perfil });
    await AsyncStorage.setItem(`forja:arena-perfil:${usuario}`, firma);
  }

  if (ops.length) {
    await encolar(ops);
    void vaciarCola();
  }
}

// Se llama en cada cambio de datos: espera 2 s de calma antes de mirar qué falta por enviar.
let espera: ReturnType<typeof setTimeout> | null = null;
export function programarSincronizacion(d: Datos) {
  if (!usuario) return;
  if (espera) clearTimeout(espera);
  espera = setTimeout(() => void sincronizarArena(d).catch(() => {}), 2000);
}
