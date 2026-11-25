// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Datos que acompañan a una opinión («Ayuda y opiniones»): cómo se construyen y cómo se describen a la persona en lenguaje
// claro (nunca como JSON ni código). Aquí no hay nada de React: se prueba con Node.
//   · Datos técnicos: se adjuntan SIEMPRE (versión, modo, pantalla, navegador…). Sin email, sin nombre, sin datos de entreno.
//   · Resumen de datos: SOLO si la persona lo marca. No incluye sensaciones ni dolor.
import { Datos, claveDia, dificultadDe } from './datos';

export type Entorno = { ancho?: number; alto?: number; userAgent?: string; idioma?: string; instalada?: boolean };
export type DatosTecnicos = {
  version: string;
  modo: 'con-cuenta' | 'sin-cuenta';
  pantalla: string | null;
  sistema: string | null;
  idioma: string | null;
  instalada: boolean | null;
};
export type ResumenDatos = {
  entrenos: number;
  ultimoEntreno: { dia: string; rutina: string; ejercicios: number; series: number } | null;
  objetivo: string | null;
  nivel: string | null;
  dificultad: string | null;
  diasPorSemana: number | null;
};

// Lee el entorno real del navegador (si lo hay).
export function entornoActual(): Entorno {
  const w = typeof window !== 'undefined' ? window : undefined;
  const n = typeof navigator !== 'undefined' ? navigator : undefined;
  return { ancho: w?.innerWidth, alto: w?.innerHeight, userAgent: n?.userAgent, idioma: n?.language, instalada: w?.matchMedia ? w.matchMedia('(display-mode: standalone)').matches : undefined };
}

export function datosTecnicos(version: string, conCuenta: boolean, entorno: Entorno = entornoActual()): DatosTecnicos {
  return {
    version,
    modo: conCuenta ? 'con-cuenta' : 'sin-cuenta',
    pantalla: entorno.ancho != null && entorno.alto != null ? `${entorno.ancho}x${entorno.alto}` : null,
    sistema: entorno.userAgent ? entorno.userAgent.slice(0, 200) : null,
    idioma: entorno.idioma ?? null,
    instalada: entorno.instalada ?? null,
  };
}

// Resumen mínimo y opcional. Sin sensaciones ni dolor: son datos que solo existen con consentimiento aparte.
export function resumenDatos(d: Datos): ResumenDatos {
  const s = d.sesiones[0];
  return {
    entrenos: d.sesiones.length,
    ultimoEntreno: s ? { dia: claveDia(s.fecha), rutina: s.rutinaNombre, ejercicios: s.ejercicios.length, series: s.ejercicios.reduce((t, x) => t + x.series.length, 0) } : null,
    objetivo: d.perfil?.objetivo ?? null,
    nivel: d.perfil?.nivel ?? null,
    dificultad: d.perfil ? dificultadDe(d.perfil) : null,
    diasPorSemana: d.perfil?.dias ?? null,
  };
}

// «Chrome 142 · Windows» a partir del texto técnico del navegador (solo para mostrarlo con claridad).
export function navegadorLegible(ua: string | null | undefined): string {
  if (!ua) return 'No consta';
  const v = (re: RegExp) => ua.match(re)?.[1]?.split('.')[0];
  let nav = 'Navegador desconocido';
  if (/Edg\//.test(ua)) nav = `Edge ${v(/Edg\/([\d.]+)/) ?? ''}`;
  else if (/Firefox\//.test(ua)) nav = `Firefox ${v(/Firefox\/([\d.]+)/) ?? ''}`;
  else if (/(Chrome|CriOS)\//.test(ua)) nav = `Chrome ${v(/(?:Chrome|CriOS)\/([\d.]+)/) ?? ''}`;
  else if (/Safari\//.test(ua)) nav = `Safari ${v(/Version\/([\d.]+)/) ?? ''}`;
  const so = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'sistema desconocido';
  return `${nav.trim()} · ${so}`;
}

const si = (b: boolean | null) => (b === null ? 'No consta' : b ? 'Sí' : 'No');
const MODOS: Record<string, string> = { 'con-cuenta': 'Con cuenta', 'sin-cuenta': 'Sin cuenta' };
const OBJETIVOS: Record<string, string> = { musculo: 'Ganar músculo', grasa: 'Perder grasa', fuerza: 'Fuerza', salud: 'Salud', resistencia: 'Resistencia' };

// Líneas «etiqueta: valor» en lenguaje claro para enseñar (y para el cuerpo del correo).
export function lineasTecnicas(t: DatosTecnicos): [string, string][] {
  return [
    ['Versión de FORJA', t.version],
    ['Cuenta', MODOS[t.modo] ?? t.modo],
    ['Tamaño de pantalla', t.pantalla ? `${t.pantalla.replace('x', ' × ')} píxeles` : 'No consta'],
    ['Navegador y sistema', navegadorLegible(t.sistema)],
    ['Idioma', t.idioma ?? 'No consta'],
    ['App instalada en el dispositivo', si(t.instalada)],
  ];
}

export function lineasResumen(r: ResumenDatos): [string, string][] {
  const u = r.ultimoEntreno;
  return [
    ['Entrenos registrados', String(r.entrenos)],
    ['Último entreno', u ? `${u.rutina} · ${u.dia} · ${u.ejercicios} ejercicios · ${u.series} series` : 'Ninguno'],
    ['Objetivo', r.objetivo ? (OBJETIVOS[r.objetivo] ?? r.objetivo) : 'No consta'],
    ['Nivel', r.nivel ?? 'No consta'],
    ['Dificultad', r.dificultad ?? 'No consta'],
    ['Días por semana', r.diasPorSemana != null ? String(r.diasPorSemana) : 'No consta'],
  ];
}

// Cuerpo del mensaje por correo o para copiar: texto legible, sin JSON.
export function textoCorreo(nombreTipo: string, texto: string, estrellas: number, tecnico: DatosTecnicos, resumen: ResumenDatos | null): string {
  const l = [`Tipo: ${nombreTipo}`];
  if (estrellas) l.push(`Valoración: ${estrellas}/5`);
  l.push('', texto.trim(), '', '--- Datos técnicos (puedes borrarlos) ---');
  for (const [k, v] of lineasTecnicas(tecnico)) l.push(`${k}: ${v}`);
  if (resumen) {
    l.push('', '--- Resumen de mis datos ---');
    for (const [k, v] of lineasResumen(resumen)) l.push(`${k}: ${v}`);
  }
  return l.join('\n');
}
