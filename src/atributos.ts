// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Atributos del perfil de atleta (Fase 1, solo local).
// Cada atributo muestra una cifra REAL con su unidad (nada de notas inventadas) y solo aparece cuando
// hay datos suficientes; si no, dice qué falta. «Recuperación» no se muestra todavía (Fase 3).
import { Datos, claveDia, mismoEjercicio, pesoMaximo } from './datos';
import { nutricion, patronDe } from './reglas';
import { EstadoXp, lunesDeSemana } from './xp';

const DIA = 86400000;

// Mínimos para mostrar cada atributo (se revisan con las pruebas).
export const MINIMOS = {
  disciplinaSemanas: 2,
  fuerzaEjercicios: 2,
  volumenSemanas: 2,
  nutricionDias: 14,
  equilibrioSeries: 24,
  equilibrioGrupos: 3,
} as const;
const TOPE_FUERZA = 0.2; // la barra se llena con +20 %

export type Atributo = {
  id: 'disciplina' | 'fuerza' | 'volumen' | 'nutricion' | 'equilibrio';
  nombre: string;
  visible: boolean; // false = faltan datos: se muestra `falta`
  texto: string; // la cifra real
  detalle: string;
  falta?: string;
  barra?: number; // 0–1 (si el atributo se representa con barra)
  reparto?: { nombre: string; pct: number }[]; // solo Equilibrio
};

const pct = (x: number) => `${Math.round(x * 100)} %`;
const decimal = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sinDatos = (id: Atributo['id'], nombre: string, falta: string): Atributo => ({ id, nombre, visible: false, texto: '', detalle: '', falta });

function disciplina(xp: EstadoXp | null): Atributo {
  const nombre = 'Disciplina';
  // La semana en la que empezaste (si fue a mitad de semana) no cuenta: estaba incompleta.
  const cerradas = (xp?.cerradas ?? []).filter((s) => !s.parcial).slice(-8);
  // Una semana sin ningún entreno registrado puede ser «no usé la app»: no se fía una cifra con tan poca actividad.
  const conEntrenos = cerradas.filter((s) => s.entrenos > 0).length;
  if (cerradas.length < MINIMOS.disciplinaSemanas || conEntrenos < MINIMOS.disciplinaSemanas)
    return sinDatos('disciplina', nombre, `Necesito al menos ${MINIMOS.disciplinaSemanas} semanas completas con algún entreno registrado (llevas ${conEntrenos}).`);
  const obj = cerradas.reduce((a, s) => a + s.objetivo, 0);
  const hechos = cerradas.reduce((a, s) => a + Math.min(s.entrenos, s.objetivo), 0);
  const c = obj ? hechos / obj : 0;
  const racha = xp?.racha ?? 0;
  return {
    id: 'disciplina', nombre, visible: true, barra: c,
    texto: `${pct(c)} de tus días objetivo`,
    detalle: `Últimas ${cerradas.length} semanas completas${racha >= 2 ? ` · racha de ${racha} semanas` : ''}.`,
  };
}

// Mejora (mediana) de tu mejor peso en las últimas 4 semanas frente a las 8 anteriores, en ejercicios con peso.
// `cambio` es null si no hay ejercicios comparables suficientes. Lo usan el atributo y la adaptación de dificultad.
export function progresoFuerza(d: Datos, ahora = Date.now()): { ejercicios: number; cambio: number | null } {
  const reciente = ahora - 28 * DIA;
  const antes = ahora - 84 * DIA;
  const mejores = new Map<string, { nombre: string; rec: number; ant: number }>();
  for (const s of d.sesiones) {
    if (s.descarga || s.fecha <= antes || s.fecha > ahora) continue;
    for (const e of s.ejercicios) {
      const p = pesoMaximo(e.series);
      if (p <= 0) continue;
      const k = [...mejores.keys()].find((x) => mismoEjercicio(x, e.nombre)) ?? e.nombre;
      const x = mejores.get(k) ?? { nombre: e.nombre, rec: 0, ant: 0 };
      if (s.fecha > reciente) x.rec = Math.max(x.rec, p);
      else x.ant = Math.max(x.ant, p);
      mejores.set(k, x);
    }
  }
  const comparables = [...mejores.values()].filter((x) => x.rec > 0 && x.ant > 0);
  if (comparables.length < MINIMOS.fuerzaEjercicios) return { ejercicios: comparables.length, cambio: null };
  return { ejercicios: comparables.length, cambio: mediana(comparables.map((x) => (x.rec - x.ant) / x.ant)) };
}

function fuerza(d: Datos, ahora: number): Atributo {
  const nombre = 'Progreso de fuerza';
  const { ejercicios, cambio } = progresoFuerza(d, ahora);
  if (cambio === null)
    return sinDatos('fuerza', nombre, `Necesito ${MINIMOS.fuerzaEjercicios} ejercicios con peso registrados en las últimas 4 semanas y en las 8 anteriores (hay ${ejercicios}).`);
  return {
    id: 'fuerza', nombre, visible: true, barra: Math.max(0, Math.min(1, cambio / TOPE_FUERZA)),
    texto: `${cambio > 0 ? '+' : cambio < 0 ? '−' : ''}${decimal(Math.abs(cambio) * 100)} % en ${ejercicios} ejercicios`,
    detalle: cambio > 0
      ? 'Tu mejor peso reciente frente a las 8 semanas anteriores (la barra se llena con +20 %).'
      : 'Sin mejora de peso reciente. Es normal en descargas, cambios de rutina o semanas de poca energía.',
  };
}

// Series por semana de las últimas 4 semanas completas (solo semanas con entrenos) frente a las que pide el plan del coach.
export function volumenMedio(d: Datos, ahora = Date.now()): { plan: number; semanas: number; media: number } {
  const plan = d.rutinas.filter((r) => r.deCoach).reduce((a, r) => a + r.ejercicios.reduce((b, e) => b + e.series, 0), 0);
  const semanas: number[] = [];
  for (let i = 4; i >= 1; i--) {
    const desde = lunesDeSemana(i, ahora);
    const hasta = lunesDeSemana(i - 1, ahora);
    const ses = d.sesiones.filter((s) => s.fecha >= desde && s.fecha < hasta);
    if (ses.length) semanas.push(ses.reduce((a, s) => a + s.ejercicios.reduce((b, e) => b + e.series.length, 0), 0));
  }
  return { plan, semanas: semanas.length, media: semanas.length ? semanas.reduce((a, b) => a + b, 0) / semanas.length : 0 };
}

function volumen(d: Datos, ahora: number): Atributo {
  const nombre = 'Volumen';
  const { plan, semanas: nSemanas, media } = volumenMedio(d, ahora);
  if (!plan) return sinDatos('volumen', nombre, 'Necesito un plan de tu coach para comparar tus series con las previstas.');
  if (nSemanas < MINIMOS.volumenSemanas)
    return sinDatos('volumen', nombre, `Necesito al menos ${MINIMOS.volumenSemanas} semanas completas con entrenos (llevas ${nSemanas}).`);
  return {
    id: 'volumen', nombre, visible: true, barra: Math.min(1, media / plan),
    texto: `${decimal(media)} de ${plan} series/semana (${pct(media / plan)})`,
    detalle: `Media de las últimas ${nSemanas} semanas con entrenos, frente a tu plan.`,
  };
}

function nutricionAtributo(d: Datos, ahora: number): Atributo {
  const nombre = 'Nutrición';
  if (!d.perfil) return sinDatos('nutricion', nombre, 'Necesito tu perfil para conocer tu proteína diaria.');
  const meta = nutricion(d.perfil).proteina;
  let registrados = 0, cumplidos = 0;
  for (let i = 1; i <= 28; i++) {
    const lista = d.comida[claveDia(ahora - i * DIA)] ?? [];
    if (!lista.length) continue;
    registrados++;
    if (lista.reduce((a, x) => a + x.proteina, 0) >= meta) cumplidos++;
  }
  if (registrados < MINIMOS.nutricionDias)
    return sinDatos('nutricion', nombre, `Necesito ${MINIMOS.nutricionDias} días con comida registrada en las últimas 4 semanas (llevas ${registrados}). Los días sin registrar no cuentan en tu contra.`);
  return {
    id: 'nutricion', nombre, visible: true, barra: cumplidos / registrados,
    texto: `Tu proteína ${cumplidos} de ${registrados} días registrados`,
    detalle: 'Solo cuentan los días en los que registraste comida (últimas 4 semanas, sin hoy).',
  };
}

const GRUPO: Record<string, string> = {
  empuje_h: 'Empuje', empuje_v: 'Empuje', empuje_aux: 'Empuje', triceps: 'Empuje',
  tiron_v: 'Tirón', tiron_h: 'Tirón', biceps: 'Tirón',
  rodilla: 'Pierna', cadera: 'Pierna', unilateral: 'Pierna', gemelos: 'Pierna',
  core: 'Core',
};

// Reparto de tus series entre grupos (sin nota: solo muestra cómo entrenas).
function equilibrio(d: Datos, ahora: number): Atributo {
  const nombre = 'Equilibrio';
  const desde = ahora - 28 * DIA;
  const por: Record<string, number> = { Empuje: 0, Tirón: 0, Pierna: 0, Core: 0 };
  for (const s of d.sesiones) {
    if (s.fecha <= desde || s.fecha > ahora) continue;
    for (const e of s.ejercicios) {
      const p = patronDe(e.nombre);
      const g = p ? GRUPO[p] : undefined;
      if (g) por[g] += e.series.length;
    }
  }
  const total = Object.values(por).reduce((a, b) => a + b, 0);
  const grupos = Object.values(por).filter((x) => x > 0).length;
  if (total < MINIMOS.equilibrioSeries || grupos < MINIMOS.equilibrioGrupos)
    return sinDatos('equilibrio', nombre, `Necesito al menos ${MINIMOS.equilibrioSeries} series en ${MINIMOS.equilibrioGrupos} grupos distintos en las últimas 4 semanas (hay ${total} series en ${grupos}).`);
  return {
    id: 'equilibrio', nombre, visible: true,
    texto: Object.entries(por).map(([g, n]) => `${g} ${pct(n / total)}`).join(' · '),
    detalle: 'Cómo repartes tus series entre grupos (últimas 4 semanas). No es una nota: un reparto distinto puede ser lo que buscas.',
    reparto: Object.entries(por).map(([g, n]) => ({ nombre: g, pct: n / total })),
  };
}

export function atributos(d: Datos, xp: EstadoXp | null, ahora = Date.now()): Atributo[] {
  return [
    disciplina(xp),
    fuerza(d, ahora),
    volumen(d, ahora),
    nutricionAtributo(d, ahora),
    equilibrio(d, ahora),
  ];
}
// Los tres primeros son fijos; Nutrición y Equilibrio solo se muestran con datos suficientes.
export const ATRIBUTOS_FIJOS = ['disciplina', 'fuerza', 'volumen'] as const;
