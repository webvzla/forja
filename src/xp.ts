// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// XP y nivel FORJA.
// XP = suma de los puntos de cada semana, con LA MISMA fórmula que ARENA (`puntosSemana`): no hay
// una segunda fuente de puntos ni un contador aparte.
//  · Entrenos, proteína, rachas y récords: se calculan en el móvil con tus datos (el servidor de ARENA
//    calcula lo mismo con los hechos que el móvil le envía; nunca se suman los puntos del servidor).
//  · Retos (+15, máx. 2 por semana): solo el servidor sabe cuáles completaste. Se lee su CANTIDAD por
//    semana (`mis_logros`, solo lectura) y se guarda como máximo visto: repetir la lectura no suma otra vez.
//
// Las semanas ya terminadas se «cierran» una sola vez y no se recalculan: así, cambiar tus días
// objetivo no baja el XP que ya ganaste. El libro se puede fusionar entre dispositivos (ver sincronizacion.ts).
import { Datos, claveDia } from './datos';
import { Semana, misSemanas, puntosSemana } from './competicion';
import { inicioSemana } from './reglas';

const DIA = 86400000;
const SEMANA = 7 * DIA;
const MAX_SEMANAS = 520; // diez años

// Semana cerrada: [puntos, entrenos, días objetivo]. La clave es el lunes (AAAA-MM-DD).
export type SemanaCerrada = [number, number, number];
// v1 = Fase 1 (sin retos ni pico). v2 = Fase 2.
//  · semanas: puntos de cada semana cerrada SIN retos.
//  · retos: retos puntuables (0–2) por semana, tal como los cuenta el servidor; solo se queda el máximo visto.
//  · picos: puntos más altos que ha llegado a tener cada semana aún abierta (si borras un entreno, el XP no baja,
//    igual que los hechos ya enviados a ARENA). Al cerrarse la semana, el pico se pliega en `semanas`.
export type LibroXp = { v: 1 | 2; semanas: Record<string, SemanaCerrada>; retos?: Record<string, number>; picos?: Record<string, number> };

export const MAX_RETOS_SEMANA = 2; // igual que el servidor (privado.semanas)
// XP de los retos de una semana: se calcula con la fórmula de ARENA, no con un +15 aparte.
export const bonusRetos = (n: number) =>
  puntosSemana({ entrenos: 0, objetivo: 1, protDias: 0, records: 0, racha: 0, retos: Math.min(MAX_RETOS_SEMANA, Math.max(0, Math.floor(n))) });

export const XP_NOTA_ARENA = 'Tu XP usa las mismas reglas de puntos que ARENA. Los puntos de entrenos, proteína, rachas y récords se calculan en tu móvil; los de retos se leen de tu cuenta, y solo cuentan si tienes sesión iniciada. Puede haber pequeñas diferencias con ARENA, que se queda con lo que ya le enviaste.';

// ---------- Nivel ----------
export const umbralNivel = (n: number) => 50 * (n - 1) * (n - 1);

export function nivelDeXp(xp: number) {
  const x = Math.max(0, Math.floor(xp));
  let n = Math.floor(Math.sqrt(x / 50)) + 1;
  while (n > 1 && x < umbralNivel(n)) n--; // protección contra decimales
  while (x >= umbralNivel(n + 1)) n++;
  return n;
}

export type Tramo = 0 | 1 | 2 | 3;
export const TITULOS = ['Chispa', 'Brasa', 'Llama', 'Acero'] as const;
export const tramoDe = (nivel: number): Tramo => (nivel >= 20 ? 3 : nivel >= 10 ? 2 : nivel >= 5 ? 1 : 0);
export const tituloDe = (nivel: number) => TITULOS[tramoDe(nivel)];

export function progresoNivel(xp: number) {
  const x = Math.max(0, Math.floor(xp));
  const nivel = nivelDeXp(x);
  const desde = umbralNivel(nivel);
  const hasta = umbralNivel(nivel + 1);
  return { nivel, titulo: tituloDe(nivel), tramo: tramoDe(nivel), desde, hasta, faltan: hasta - x, fraccion: (x - desde) / (hasta - desde) };
}

// ---------- Semanas ----------
// Lunes de la semana `i` hacia atrás (0 = esta). Se normaliza a mediodía para no fallar en los
// cambios de hora (una semana puede durar 167 o 169 horas).
export const lunesDeSemana = (i: number, ahora = Date.now()) => inicioSemana(inicioSemana(ahora) - i * SEMANA + DIA / 2);

function primerRegistro(d: Datos): number | null {
  let min = Infinity;
  for (const s of d.sesiones) if (s.fecha < min) min = s.fecha;
  for (const k of Object.keys(d.comida ?? {})) {
    if ((d.comida[k] ?? []).length === 0) continue;
    const [a, m, dia] = k.split('-').map(Number);
    const t = new Date(a, m - 1, dia, 12).getTime();
    if (Number.isFinite(t) && t < min) min = t;
  }
  // Las semanas ya cerradas siguen contando aunque borres los entrenos o las comidas de entonces.
  for (const k of Object.keys(d.ajustes?.xp?.semanas ?? {})) {
    const [a, m, dia] = k.split('-').map(Number);
    const t = new Date(a, m - 1, dia, 12).getTime();
    if (Number.isFinite(t) && t < min) min = t;
  }
  return Number.isFinite(min) ? min : null;
}

export type EstadoXp = {
  xp: number;
  retosXp: number; // parte del XP que viene de retos (ya incluida en xp)
  semanaActual: number; // puntos de la semana en curso, con sus retos (ya incluidos en xp)
  libro: LibroXp; // libro con las semanas recién cerradas
  nuevo: boolean; // true si hay semanas por guardar en el libro
  semanas: { lunes: string; puntos: number; actual: boolean }[]; // últimas 8
  cerradas: { lunes: string; entrenos: number; objetivo: number; parcial?: boolean }[]; // todas, en orden (parcial = semana en la que empezaste, incompleta)
  racha: number; // semanas seguidas cumpliendo el objetivo (la actual cuenta si ya cumple)
};

const mismoPicos = (a: Record<string, number>, b: Record<string, number>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

// Cálculo puro: no guarda nada. `nuevo` indica si conviene persistir `libro`.
// Nunca suma dos veces: las semanas cerradas y los retos salen del libro; solo la semana en curso se calcula.
export function calcularXp(d: Datos): EstadoXp | null {
  const ahora = Date.now();
  if (!d.perfil) return null;
  const primero = primerRegistro(d);
  if (primero === null) return null;
  const objetivo = d.perfil.dias;
  const lunesActual = inicioSemana(ahora);
  const N = Math.min(MAX_SEMANAS, Math.max(0, Math.round((lunesActual - inicioSemana(primero)) / SEMANA)));
  const libroGuardado = d.ajustes?.xp;
  const guardado = libroGuardado?.semanas ?? {};
  const retos = libroGuardado?.retos ?? {};
  const picos = libroGuardado?.picos ?? {};
  const claveActual = claveDia(lunesDeSemana(0, ahora));
  const empezoAMedias = primero - inicioSemana(primero) >= DIA; // primer registro a partir del martes

  // Con las semanas cerradas ya guardadas solo hace falta calcular la semana en curso.
  let faltaAlguna = false;
  for (let i = 1; i <= N && !faltaAlguna; i++) faltaAlguna = !guardado[claveDia(lunesDeSemana(i, ahora))];
  const n = faltaAlguna ? N + 1 : 1;
  const todas: Semana[] = misSemanas(d, n); // todas[n - 1 - i] = semana i (0 = esta)
  const semanas: Record<string, SemanaCerrada> = { ...guardado };
  let nuevo = false;
  let racha = 0;
  let actual = 0;
  const cerradas: EstadoXp['cerradas'] = [];
  const ultimas: EstadoXp['semanas'] = [];
  let total = 0;

  for (let i = N; i >= 0; i--) {
    const clave = claveDia(lunesDeSemana(i, ahora));
    const previa = i > 0 ? semanas[clave] : undefined;
    let puntos: number, entrenos: number, obj: number;
    if (previa) {
      [puntos, entrenos, obj] = previa;
      const pico = picos[clave] ?? 0; // pico de otro dispositivo para una semana que aquí ya estaba cerrada
      if (pico > puntos) {
        puntos = pico;
        semanas[clave] = [puntos, entrenos, obj];
        nuevo = true;
      }
      racha = entrenos >= obj ? racha + 1 : 0;
    } else {
      const s = todas[n - 1 - i];
      entrenos = s.entrenos;
      obj = objetivo;
      racha = entrenos >= obj ? racha + 1 : 0;
      const calculado = puntosSemana({ ...s, objetivo: obj, retos: 0, racha });
      // Si la semana tuvo más puntos antes (se borró un entreno), se respeta el máximo alcanzado.
      puntos = Math.max(calculado, picos[clave] ?? 0);
      if (i > 0) {
        semanas[clave] = [puntos, entrenos, obj];
        nuevo = true;
      } else actual = puntos;
    }
    total += puntos;
    if (i > 0) cerradas.push({ lunes: clave, entrenos, objetivo: obj, ...(i === N && empezoAMedias ? { parcial: true } : {}) });
    if (i <= 7) ultimas.push({ lunes: clave, puntos: puntos + bonusRetos(retos[clave] ?? 0), actual: i === 0 });
  }

  let retosXp = 0;
  for (const v of Object.values(retos)) retosXp += bonusRetos(v);

  // Pico de la semana en curso: solo sube. Los de semanas ya cerradas se pliegan en `semanas` y se descartan.
  const picoActual = actual > 0 ? actual : 0;
  const nuevosPicos: Record<string, number> = picoActual ? { [claveActual]: picoActual } : {};
  if (!mismoPicos(picos, nuevosPicos)) nuevo = true;

  const libro: LibroXp = { v: 2, semanas, ...(Object.keys(retos).length ? { retos: { ...retos } } : {}), ...(picoActual ? { picos: nuevosPicos } : {}) };
  return { xp: total + retosXp, retosXp, semanaActual: actual + bonusRetos(retos[claveActual] ?? 0), libro, nuevo, semanas: ultimas, cerradas, racha };
}
