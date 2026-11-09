import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DiaMenu, Ingrediente, Preferencias } from './alimentos';

export type Ejercicio = { id: string; nombre: string; series: number; reps: number; repsMax?: number; descanso?: number };
export type Rutina = {
  id: string;
  nombre: string;
  ejercicios: Ejercicio[];
  deCoach?: boolean;
  ejemplo?: boolean;
  dia?: number; // 0 = lunes
};

export type Objetivo = 'grasa' | 'musculo' | 'fuerza' | 'mantener';
export type Nivel = 'principiante' | 'intermedio' | 'avanzado';
export type Equipo = 'gym' | 'mancuernas' | 'casa';
export type Enfasis = 'ninguno' | 'pecho' | 'espalda' | 'pierna' | 'gluteo' | 'brazos' | 'abdomen';
export type Perfil = {
  sexo: 'h' | 'm';
  edad: number;
  altura: number;
  peso: number;
  objetivo: Objetivo;
  dias: number;
  diasSemana: number[]; // 0 = lunes
  descargaHasta?: number | null;
  nivel: Nivel;
  equipo: Equipo;
  enfasis: Enfasis | Enfasis[]; // antes era una sola zona; ahora hasta 3
  ajusteKcal: number;
  ultimaRevision: number | null;
};
export type Comida = { id: string; nombre: string; proteina: number; kcal: number };

export type SerieActiva = { peso: string; reps: string; hecha: boolean };
export type EjercicioActivo = { nombre: string; objetivo: number; repsMax?: number; descanso?: number; series: SerieActiva[] };
export type Activo = {
  rutinaNombre: string;
  inicio: number;
  finDescanso: number | null;
  descarga?: boolean;
  ligero?: boolean; // día flojo (dormiste mal / poca energía): se entrena como descarga
  ejercicios: EjercicioActivo[];
};

export type SerieGuardada = { peso: number; reps: number };
export type Sesion = {
  id: string;
  rutinaNombre: string;
  fecha: number;
  minutos: number;
  descarga?: boolean;
  ejercicios: { nombre: string; series: SerieGuardada[] }[];
};

export type Datos = {
  rutinas: Rutina[];
  sesiones: Sesion[]; // la más reciente primero
  activo: Activo | null;
  descanso: number; // segundos
  perfil: Perfil | null;
  pesos: { fecha: number; max: number }[]; // peso corporal, del más antiguo al más nuevo
  comida: Record<string, Comida[]>; // por día, AAAA-MM-DD
  despensa: Stock[];
  recetasHechas: RecetaHecha[]; // la más reciente primero
  sobras: Sobra[];
  misAlimentos: Ingrediente[];
  preferencias: Preferencias;
  menu: DiaMenu[] | null;
  agua: Record<string, number>; // ml por día
  medidas: Record<string, { fecha: number; max: number }[]>; // cm por zona
  animo: Record<string, { sueno: Nivel3; energia: Nivel3 }>; // cómo te sientes, por día
};

export type Nivel3 = 0 | 1 | 2; // 0 mal · 1 regular · 2 bien

export type Sobra = { id: string; titulo: string; raciones: number; proteina: number; kcal: number; fecha: number };
export type Stock = { ing: string; cantidad: number; caduca?: string };
export type RecetaHecha = { id: string; titulo: string; ids: string[]; variante: number; fecha: number };

// Zonas a priorizar (acepta el formato antiguo de una sola zona).
export const zonas = (p: { enfasis?: Enfasis | Enfasis[] } | null | undefined): Enfasis[] =>
  (Array.isArray(p?.enfasis) ? p!.enfasis : p?.enfasis ? [p.enfasis] : []).filter((z) => z !== 'ninguno');

export function claveDia(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const CLAVE = 'mi-gym:v1';

export const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const ej = (nombre: string, series: number, reps: number): Ejercicio => ({
  id: nuevoId(),
  nombre,
  series,
  reps,
});

export const datosIniciales = (): Datos => ({
  rutinas: [
    {
      id: nuevoId(),
      ejemplo: true,
      nombre: 'Empuje',
      ejercicios: [
        ej('Press de banca', 4, 8),
        ej('Press militar', 3, 10),
        ej('Press inclinado con mancuernas', 3, 10),
        ej('Extensión de tríceps', 3, 12),
      ],
    },
    {
      id: nuevoId(),
      ejemplo: true,
      nombre: 'Tirón',
      ejercicios: [
        ej('Dominadas', 4, 8),
        ej('Remo con barra', 4, 10),
        ej('Jalón al pecho', 3, 12),
        ej('Curl de bíceps', 3, 12),
      ],
    },
    {
      id: nuevoId(),
      ejemplo: true,
      nombre: 'Pierna',
      ejercicios: [
        ej('Sentadilla', 4, 8),
        ej('Peso muerto rumano', 3, 10),
        ej('Prensa', 3, 12),
        ej('Elevación de gemelos', 4, 15),
      ],
    },
  ],
  sesiones: [],
  activo: null,
  descanso: 90,
  perfil: null,
  pesos: [],
  comida: {},
  despensa: [],
  recetasHechas: [],
  sobras: [],
  misAlimentos: [],
  preferencias: { dieta: 'todo', grupos: [], noGusta: [] },
  menu: null,
  agua: {},
  medidas: {},
  animo: {},
});

export async function cargar(): Promise<Datos> {
  const texto = await AsyncStorage.getItem(CLAVE);
  if (!texto) return datosIniciales();
  try {
    return { ...datosIniciales(), ...JSON.parse(texto) };
  } catch {
    // No se pisa lo que hubiera: se aparta por si se puede recuperar.
    await AsyncStorage.setItem(`${CLAVE}:danado`, texto);
    return datosIniciales();
  }
}

export const guardar = (d: Datos) => AsyncStorage.setItem(CLAVE, JSON.stringify(d));

const normal = (s: string) => s.trim().toLowerCase();
export const mismoEjercicio = (a: string, b: string) => normal(a) === normal(b);

export function ultimaVez(sesiones: Sesion[], nombre: string): SerieGuardada[] {
  for (const s of sesiones) {
    const e = s.ejercicios.find((x) => mismoEjercicio(x.nombre, nombre));
    if (!s.descarga && e?.series.length) return e.series;
  }
  return [];
}

export const pesoMaximo = (series: SerieGuardada[]) =>
  series.reduce((m, s) => Math.max(m, s.peso), 0);

export function historial(sesiones: Sesion[], nombre: string) {
  const puntos: { fecha: number; max: number }[] = [];
  for (const s of sesiones) {
    const e = s.ejercicios.find((x) => mismoEjercicio(x.nombre, nombre));
    // Sin peso (ejercicios en casa) lo que se compara son las repeticiones.
    if (!s.descarga && e?.series.length)
      puntos.push({ fecha: s.fecha, max: pesoMaximo(e.series) || Math.max(...e.series.map((x) => x.reps)) });
  }
  return puntos.reverse();
}

export function nombresEjercicios(sesiones: Sesion[]) {
  const vistos = new Map<string, string>();
  for (const s of sesiones)
    for (const e of s.ejercicios)
      if (!vistos.has(normal(e.nombre))) vistos.set(normal(e.nombre), e.nombre);
  return [...vistos.values()];
}

export const aNumero = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export const formatoNum = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export function iniciarActivo(rutina: Rutina, sesiones: Sesion[], semanaDescarga = false, ligero = false): Activo {
  const descarga = semanaDescarga || ligero;
  return {
    rutinaNombre: rutina.nombre,
    inicio: Date.now(),
    finDescanso: null,
    descarga,
    ligero: ligero && !semanaDescarga,
    ejercicios: rutina.ejercicios.map((e) => {
      const n = Math.max(ultimaVez(sesiones, e.nombre).length, e.series);
      return {
        nombre: e.nombre,
        objetivo: e.reps,
        repsMax: e.repsMax,
        descanso: e.descanso,
        series: Array.from({ length: descarga ? Math.max(2, n - 1) : n }, () => ({ peso: '', reps: '', hecha: false })),
      };
    }),
  };
}

export function cerrarActivo(a: Activo): Sesion {
  return {
    id: nuevoId(),
    rutinaNombre: a.rutinaNombre,
    fecha: Date.now(),
    minutos: Math.max(1, Math.round((Date.now() - a.inicio) / 60000)),
    descarga: a.descarga,
    ejercicios: a.ejercicios
      .map((e) => ({
        nombre: e.nombre,
        series: e.series
          .filter((s) => s.hecha)
          .map((s) => ({ peso: aNumero(s.peso), reps: aNumero(s.reps) })),
      }))
      .filter((e) => e.series.length > 0),
  };
}
