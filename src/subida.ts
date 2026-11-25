// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Subida de los datos de la cuenta a la nube con fusión COMPLETA (entrenos, comidas, rutinas… ver fusion.ts) y control de
// concurrencia optimista. Recibe el cliente de Supabase como parámetro para poder probarse contra el servidor real y el simulado.
//
// Problema que resuelve: si dos dispositivos guardan a la vez, «leer la nube y luego escribir» deja un hueco en el que el
// segundo puede pisar al primero. Aquí la escritura solo se acepta si la fila no cambió desde que se leyó (`actualizado`
// igual); si cambió, se vuelve a leer, se fusiona y se reintenta. No necesita migraciones.
//
// Para no leer el documento entero en cada guardado: si este dispositivo ya sabe cuál fue la última versión de la nube que
// incorporó (`vista`) y sigue siendo la misma, no hay nada nuevo que fusionar y se escribe directamente.
import type { SupabaseClient } from '@supabase/supabase-js';

import { sinRespuestasNoPermitidas } from './consentimientos';
import type { Datos } from './datos';
import { esquemaMasNuevo, fusionarDatos } from './fusion';

export type ResultadoSubida = {
  datos: Datos;
  cambio: boolean;
  error: unknown | null;
  intentos: number;
  actualizado: string | null; // versión de la nube que queda tras subir (para el próximo guardado)
};

// La nube tiene datos de una versión de la app más nueva que ésta: no se mezcla ni se escribe encima.
export const ERROR_ESQUEMA = 'FORJA_ESQUEMA_NUEVO';
export const errorEsquema = () => Object.assign(new Error('Los datos de tu cuenta son de una versión más nueva de FORJA. Actualiza la app para seguir sincronizando.'), { code: ERROR_ESQUEMA });
export const esErrorEsquema = (e: unknown) => !!e && typeof e === 'object' && (e as { code?: string }).code === ERROR_ESQUEMA;

const FILA_NUEVA = '23505'; // otro dispositivo creó la fila a la vez

type Fila = { datos?: unknown; actualizado?: string | null };

export async function subirDatos(sb: SupabaseClient, uid: string, local: Datos, maxIntentos = 6, vista?: string | null): Promise<ResultadoSubida> {
  let datos = local;
  let fallo: unknown = null;
  const ahora = () => new Date().toISOString();
  for (let intento = 1; intento <= maxIntentos; intento++) {
    // 1) Qué hay ahora en la nube. Si ya conocemos su última versión, primero solo se mira la marca (barato).
    let fila: Fila | null = null;
    let leido = false;
    if (vista !== undefined) {
      const { data, error } = await sb.from('datos_usuario').select('actualizado').eq('user_id', uid).maybeSingle();
      if (error) { fallo = error; break; } // sin lectura no se escribe (ver el final)
      fila = data as Fila | null;
      leido = !!fila && (fila.actualizado ?? null) === vista; // nada nuevo en la nube: no hace falta traer el documento
    }
    if (!leido && !(vista !== undefined && !fila)) {
      const { data, error } = await sb.from('datos_usuario').select('datos,actualizado').eq('user_id', uid).maybeSingle();
      if (error) { fallo = error; break; }
      fila = data as Fila | null;
      if (fila && esquemaMasNuevo(fila.datos)) return { datos, cambio: false, error: errorEsquema(), intentos: intento, actualizado: fila.actualizado ?? null };
      // 2) Se fusiona todo lo de la nube con lo local
      datos = fila ? fusionarDatos(local, fila.datos as Partial<Datos>) : local;
    } else datos = local;
    // Sin consentimiento (o tras retirarlo) las respuestas no salen de aquí, tampoco las anotadas sin conexión.
    datos = sinRespuestasNoPermitidas(datos);
    const cuerpo = { datos: { ...datos, activo: null } };
    if (!fila) {
      // Primera vez: se inserta; si otro dispositivo llegó antes (clave duplicada), se reintenta leyendo lo suyo.
      const marca = ahora();
      const { error } = await sb.from('datos_usuario').insert({ user_id: uid, ...cuerpo, actualizado: marca });
      if (!error) return { datos, cambio: datos !== local, error: null, intentos: intento, actualizado: marca };
      if ((error as { code?: string }).code !== FILA_NUEVA) return { datos, cambio: datos !== local, error, intentos: intento, actualizado: null };
      vista = undefined; // hay que leer lo que escribió el otro
      continue;
    }
    // 3) Se escribe solo si nadie ha cambiado la fila mientras tanto
    const previa = fila.actualizado ?? null;
    const nuevo = new Date(Math.max(Date.now(), previa ? Date.parse(previa) + 1 : 0)).toISOString();
    const q = sb.from('datos_usuario').update({ ...cuerpo, actualizado: nuevo }).eq('user_id', uid);
    const { data: filas, error } = await (previa === null ? q.is('actualizado', null) : q.eq('actualizado', previa)).select('user_id');
    if (error) return { datos, cambio: datos !== local, error, intentos: intento, actualizado: null };
    if (filas && filas.length) return { datos, cambio: datos !== local, error: null, intentos: intento, actualizado: nuevo };
    // Cambió: otro dispositivo guardó justo antes. Un instante de espera distinto en cada uno y se vuelve a intentar leyendo todo.
    vista = undefined;
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 60));
  }
  // Sin haber podido leer (o con demasiada competencia) NO se escribe: podría pisar una retirada del consentimiento u otros
  // cambios. Los datos siguen en el dispositivo y se vuelve a intentar con el siguiente cambio o al recuperar la conexión.
  return { datos, cambio: datos !== local, error: fallo ?? new Error('Demasiados cambios a la vez: se reintentará.'), intentos: maxIntentos, actualizado: null };
}

// Trae lo nuevo de la nube (si lo hay) sin subir nada: para incorporar lo que hicieron otros dispositivos.
export async function traerNovedades(sb: SupabaseClient, uid: string, vista: string | null | undefined): Promise<{ datos: Datos | null; actualizado: string | null; error: unknown | null }> {
  const { data: marca, error: e1 } = await sb.from('datos_usuario').select('actualizado').eq('user_id', uid).maybeSingle();
  if (e1) return { datos: null, actualizado: null, error: e1 };
  if (!marca) return { datos: null, actualizado: null, error: null };
  const act = (marca as Fila).actualizado ?? null;
  if (vista !== undefined && act === vista) return { datos: null, actualizado: act, error: null };
  const { data, error } = await sb.from('datos_usuario').select('datos,actualizado').eq('user_id', uid).maybeSingle();
  if (error) return { datos: null, actualizado: null, error };
  const fila = data as Fila | null;
  if (!fila) return { datos: null, actualizado: null, error: null };
  if (esquemaMasNuevo(fila.datos)) return { datos: null, actualizado: fila.actualizado ?? null, error: errorEsquema() };
  return { datos: fila.datos as Datos, actualizado: fila.actualizado ?? null, error: null };
}
