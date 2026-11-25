// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Sincronización del progreso (libro de XP) entre dispositivos, sesiones y versiones.
// Todo son funciones puras y SIN red: la parte de red está en nube.ts y App.tsx.
//
// Idea: el libro solo contiene hechos que no pueden bajar (semanas cerradas, retos ya vistos, pico de la
// semana). Por eso se fusiona con «el máximo gana»: da igual el orden, cuántas veces se repita o desde qué
// dispositivo llegue (conmutativa, asociativa e idempotente), así que sincronizar dos o diez veces nunca duplica XP.
import type { Datos } from './datos';
import { LibroXp, MAX_RETOS_SEMANA, SemanaCerrada } from './xp';

const CLAVE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PUNTOS_SEMANA = 400; // un máximo razonable: lo que pase de aquí es un dato corrupto
const MAX_ENTRENOS = 50;

const entero = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
const objeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

// Acepta lo que venga (nada, la versión 1 de la Fase 1, datos corruptos o campos de una versión futura)
// y devuelve siempre un libro válido. Lo que no entiende, lo ignora sin romperse.
export function normalizarLibro(x: unknown): LibroXp {
  const libro: LibroXp = { v: 2, semanas: {} };
  if (!objeto(x)) return libro;
  if (objeto(x.semanas)) {
    for (const [k, v] of Object.entries(x.semanas)) {
      if (!CLAVE_DIA.test(k) || !Array.isArray(v) || v.length < 3) continue;
      const [p, e, o] = v;
      if (entero(p, 0, MAX_PUNTOS_SEMANA) && entero(e, 0, MAX_ENTRENOS) && entero(o, 1, 14)) libro.semanas[k] = [p, e, o];
    }
  }
  if (objeto(x.retos)) {
    const retos: Record<string, number> = {};
    for (const [k, v] of Object.entries(x.retos)) if (CLAVE_DIA.test(k) && entero(v, 1, MAX_RETOS_SEMANA)) retos[k] = v;
    if (Object.keys(retos).length) libro.retos = retos;
  }
  if (objeto(x.picos)) {
    const picos: Record<string, number> = {};
    for (const [k, v] of Object.entries(x.picos)) if (CLAVE_DIA.test(k) && entero(v, 1, MAX_PUNTOS_SEMANA)) picos[k] = v;
    if (Object.keys(picos).length) libro.picos = picos;
  }
  return libro;
}

const mejorSemana = (a: SemanaCerrada | undefined, b: SemanaCerrada | undefined): SemanaCerrada | undefined => {
  if (!a || !b) return a ?? b;
  // El máximo de puntos manda; con empate, el que tiene más entrenos y luego más días objetivo (determinista).
  return a[0] !== b[0] ? (a[0] > b[0] ? a : b) : a[1] !== b[1] ? (a[1] > b[1] ? a : b) : a[2] >= b[2] ? a : b;
};

// Fusiona dos libros: unión de semanas (gana el máximo), máximo de retos y de pico por semana.
export function fusionarLibros(a?: unknown, b?: unknown): LibroXp {
  const x = normalizarLibro(a);
  const y = normalizarLibro(b);
  const semanas: Record<string, SemanaCerrada> = {};
  for (const k of new Set([...Object.keys(x.semanas), ...Object.keys(y.semanas)])) semanas[k] = mejorSemana(x.semanas[k], y.semanas[k])!;
  const retos: Record<string, number> = {};
  for (const k of new Set([...Object.keys(x.retos ?? {}), ...Object.keys(y.retos ?? {})])) retos[k] = Math.max(x.retos?.[k] ?? 0, y.retos?.[k] ?? 0);

  // Picos: se queda el máximo de cada semana. NO se pliegan aquí (plegarlos mezclaría datos de dos libros y
  // rompería la propiedad asociativa); calcularXp los pliega al calcular y los descarta al cerrar la semana.
  const picos: Record<string, number> = {};
  for (const k of new Set([...Object.keys(x.picos ?? {}), ...Object.keys(y.picos ?? {})])) picos[k] = Math.max(x.picos?.[k] ?? 0, y.picos?.[k] ?? 0);
  return { v: 2, semanas, ...(Object.keys(retos).length ? { retos } : {}), ...(Object.keys(picos).length ? { picos } : {}) };
}

const orden = (v: unknown): unknown => (Array.isArray(v) ? v.map(orden) : objeto(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, orden(v[k])])) : v);
export const canonico = (v: unknown) => JSON.stringify(orden(v));
export const mismoContenido = (a: unknown, b: unknown) => canonico(a) === canonico(b);

// Lo que viaja entre dispositivos como «progreso»: solo el libro de XP. Las misiones son del día y privadas:
// siguen el camino normal de los datos (gana el último que guarda) y no se fusionan, porque «deshacer» una
// omisión en un dispositivo no debe reaparecer por mezclarla con una copia vieja.
export type ProgresoNube = { xp?: unknown };

// Devuelve `base` con el libro de `otro` fusionado. Si no cambia nada, devuelve LA MISMA referencia
// (así React no vuelve a dibujar ni se vuelve a guardar: no hay bucles ni subidas inútiles).
export function fusionarProgreso(base: Datos, otro?: ProgresoNube | Partial<Datos> | null): Datos {
  if (!otro) return base;
  const otroXp = 'xp' in otro ? (otro as ProgresoNube).xp : (otro as Partial<Datos>).ajustes?.xp;
  const libro = fusionarLibros(base.ajustes?.xp, otroXp);
  if (mismoContenido(libro, normalizarLibro(base.ajustes?.xp))) return base;
  return { ...base, ajustes: { ...base.ajustes, xp: libro } };
}

// Antes de subir a la nube: se fusiona con lo que ya hay allí, para que un dispositivo con datos viejos no
// borre el progreso de otro. `cambio` indica si lo local debe actualizarse con lo que había en la nube.
export function prepararSubida(local: Datos, remoto: ProgresoNube | null): { datos: Datos; cambio: boolean } {
  const datos = fusionarProgreso(local, remoto);
  return { datos, cambio: datos !== local };
}

// Semanas con retos que devuelve `mis_logros` del servidor: [{ semana: 'AAAA-MM-DD', retos: n, … }].
// Solo se lee la CANTIDAD de retos de cada semana: los puntos que calcula el servidor NO se usan nunca
// (ya se calculan en el móvil con la misma fórmula; sumarlos sería contar dos veces).
export function aplicarRetosServidor(libro: unknown, respuesta: unknown): LibroXp {
  const base = normalizarLibro(libro);
  const semanas = objeto(respuesta) && Array.isArray(respuesta.semanas) ? respuesta.semanas : [];
  const retos = { ...(base.retos ?? {}) };
  for (const s of semanas) {
    if (!objeto(s) || typeof s.semana !== 'string') continue;
    const clave = s.semana.slice(0, 10);
    if (!CLAVE_DIA.test(clave) || typeof s.retos !== 'number' || !Number.isFinite(s.retos) || s.retos <= 0) continue;
    const n = Math.min(MAX_RETOS_SEMANA, Math.floor(s.retos));
    if (n > (retos[clave] ?? 0)) retos[clave] = n; // el máximo visto: repetir la lectura no suma
  }
  return { ...base, ...(Object.keys(retos).length ? { retos } : {}) };
}
