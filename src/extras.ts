// Lógica de: comida según entreno, proteína más barata, mapa muscular, medallas, discos y voz.
import { Platform } from 'react-native';

import { macrosDe, porId } from './alimentos';
import { Datos, claveDia, pesoMaximo, zonas } from './datos';
import { Patron, inicioSemana, nutricion, patronDe } from './reglas';

const DIA = 86400000;

// ---------- Comida según el entreno del día ----------
export type MetaDia = { kcal: number; proteina: number; tipo: 'pierna' | 'entreno' | 'descanso'; delta: number; rutina: string | null };

export function metaDia(d: Datos, t = Date.now()): MetaDia | null {
  if (!d.perfil) return null;
  const n = nutricion(d.perfil);
  const dia = (new Date(t).getDay() + 6) % 7;
  const hecho = d.sesiones.find((s) => claveDia(s.fecha) === claveDia(t));
  const plan = d.rutinas.find((r) => r.deCoach && r.dia === dia);
  const rutina = hecho?.rutinaNombre ?? plan?.nombre ?? null;
  const descansos = Math.max(1, 7 - d.perfil.dias);
  // Lo que se suma los días de entreno se quita en los de descanso: la media de la semana no cambia.
  const quita = Math.min(400, Math.round((d.perfil.dias * 175) / descansos / 50) * 50);
  const pierna = !!rutina && /pierna|cuerpo completo/i.test(rutina);
  const tipo = rutina ? (pierna ? 'pierna' : 'entreno') : 'descanso';
  const delta = tipo === 'pierna' ? 250 : tipo === 'entreno' ? 150 : -quita;
  return { kcal: n.kcal + delta, proteina: n.proteina, tipo, delta, rutina };
}

export function textoMetaDia(m: MetaDia) {
  if (m.tipo === 'descanso') return `Hoy descansas: ${-m.delta} kcal menos, sobre todo en carbohidratos. La proteína se mantiene.`;
  return `Hoy toca ${m.rutina}: ${m.delta} kcal más en carbohidratos (arroz, pasta, patata, avena) para rendir y recuperar.`;
}

// ---------- Proteína más barata ----------
export type Precio = { euros: number; cantidad: number; fecha: number };

export function rankingProteina(d: Datos) {
  return Object.entries(d.precios ?? {})
    .flatMap(([id, pr]) => {
      const ing = porId(id);
      if (!ing || !pr.euros || !pr.cantidad) return [];
      const prot = macrosDe(ing, pr.cantidad).p;
      if (prot < 5 || ing.p / (ing.unidad === 'ud' ? 1 : ing.por / 100) < 3) return [];
      return [{ id, nombre: ing.nombre, eur100: (pr.euros / prot) * 100, fecha: pr.fecha }];
    })
    .sort((a, b) => a.eur100 - b.eur100);
}

// ---------- Mapa muscular ----------
export type Musculo = 'pecho' | 'hombros' | 'biceps' | 'triceps' | 'espalda' | 'abdomen' | 'cuadriceps' | 'femoral' | 'gluteo' | 'gemelos';
export const NOMBRE_MUSCULO: Record<Musculo, string> = {
  pecho: 'Pecho', hombros: 'Hombros', biceps: 'Bíceps', triceps: 'Tríceps', espalda: 'Espalda',
  abdomen: 'Abdomen', cuadriceps: 'Cuádriceps', femoral: 'Femoral', gluteo: 'Glúteo', gemelos: 'Gemelos',
};
// Músculo principal (cuenta 1 serie) y secundarios (media serie).
const TRABAJA: Record<Patron, [Musculo[], Musculo[]]> = {
  empuje_h: [['pecho'], ['triceps', 'hombros']],
  empuje_v: [['hombros'], ['triceps']],
  empuje_aux: [['pecho', 'hombros'], []],
  triceps: [['triceps'], []],
  tiron_v: [['espalda'], ['biceps']],
  tiron_h: [['espalda'], ['biceps', 'hombros']],
  biceps: [['biceps'], []],
  rodilla: [['cuadriceps'], ['gluteo']],
  cadera: [['femoral', 'gluteo'], ['espalda']],
  unilateral: [['cuadriceps', 'gluteo'], []],
  gemelos: [['gemelos'], []],
  core: [['abdomen'], []],
};

export function musculosSemana(d: Datos): Record<Musculo, number> {
  const r = Object.fromEntries(Object.keys(NOMBRE_MUSCULO).map((m) => [m, 0])) as Record<Musculo, number>;
  const lunes = inicioSemana();
  for (const s of d.sesiones) {
    if (s.fecha < lunes) continue;
    for (const e of s.ejercicios) {
      const p = patronDe(e.nombre);
      if (!p) continue;
      const [prin, sec] = TRABAJA[p];
      prin.forEach((m) => (r[m] += e.series.length));
      sec.forEach((m) => (r[m] += e.series.length / 2));
    }
  }
  return r;
}

// ---------- Medallas ----------
export type Medalla = { id: string; icono: string; titulo: string; texto: string; hecho: boolean; progreso?: string };

function semanasCumplidas(d: Datos) {
  const obj = d.perfil?.dias ?? 3;
  let racha = 0, mejor = 0;
  const lunes = inicioSemana();
  for (let i = 104; i >= 0; i--) {
    const desde = lunes - i * 7 * DIA;
    const n = d.sesiones.filter((s) => s.fecha >= desde && s.fecha < desde + 7 * DIA).length;
    if (n >= obj) mejor = Math.max(mejor, ++racha);
    else if (i > 0) racha = 0;
  }
  return mejor;
}

function contarRecords(d: Datos) {
  const mejor = new Map<string, number>();
  let n = 0;
  for (const s of [...d.sesiones].reverse()) {
    if (s.descarga) continue;
    for (const e of s.ejercicios) {
      const k = e.nombre.trim().toLowerCase();
      const m = pesoMaximo(e.series);
      if (m <= 0) continue;
      if (mejor.has(k) && m > mejor.get(k)!) n++;
      mejor.set(k, Math.max(m, mejor.get(k) ?? 0));
    }
  }
  return n;
}

function diasProteinaSeguidos(d: Datos) {
  if (!d.perfil) return 0;
  const meta = nutricion(d.perfil).proteina;
  let mejor = 0, racha = 0;
  const dias = Object.keys(d.comida).sort();
  let anterior = 0;
  for (const k of dias) {
    const t = new Date(`${k}T12:00:00`).getTime();
    const ok = (d.comida[k] ?? []).reduce((n, x) => n + x.proteina, 0) >= meta;
    racha = ok ? (anterior && t - anterior < 1.5 * DIA ? racha + 1 : 1) : 0;
    if (ok) anterior = t;
    mejor = Math.max(mejor, racha);
  }
  return mejor;
}

export function medallas(d: Datos): Medalla[] {
  const n = d.sesiones.length;
  const sem = semanasCumplidas(d);
  const rec = contarRecords(d);
  const prot = diasProteinaSeguidos(d);
  const recetas = d.recetasHechas.length;
  const m = (id: string, icono: string, titulo: string, texto: string, valor: number, meta: number): Medalla => ({
    id, icono, titulo, texto, hecho: valor >= meta, progreso: valor >= meta ? undefined : `${Math.floor(valor)}/${meta}`,
  });
  return [
    m('e1', '🏁', 'Primer paso', 'Tu primer entreno', n, 1),
    m('e10', '💪', 'Constante', '10 entrenos', n, 10),
    m('e50', '🏋️', 'Imparable', '50 entrenos', n, 50),
    m('e100', '🦾', 'Leyenda', '100 entrenos', n, 100),
    m('s1', '📅', 'Semana completa', 'Cumple tus días de una semana', sem, 1),
    m('s4', '🔥', 'Un mes en racha', '4 semanas seguidas cumpliendo', sem, 4),
    m('s12', '☄️', 'Tres meses en racha', '12 semanas seguidas', sem, 12),
    m('r1', '⭐', 'Primer récord', 'Supera tu peso en un ejercicio', rec, 1),
    m('r25', '🏆', 'Cazarrécords', '25 récords', rec, 25),
    m('p7', '🥩', 'Proteína perfecta', '7 días seguidos cumpliendo la proteína', prot, 7),
    m('c1', '🍳', 'Chef', 'Cocina tu primera receta', recetas, 1),
    m('c10', '👨‍🍳', 'Cocinillas', '10 recetas distintas', recetas, 10),
    m('z', '🎯', 'Con foco', 'Elige zonas a priorizar', zonas(d.perfil).length, 1),
  ];
}

// ---------- Calculadora de discos ----------
export const DISCOS = [25, 20, 15, 10, 5, 2.5, 1.25];
export function discosPorLado(peso: number, barra: number) {
  let resto = Math.round(((peso - barra) / 2) * 100) / 100;
  if (resto < 0) return null;
  const lista: number[] = [];
  for (const dsc of DISCOS) while (resto >= dsc - 0.001) { lista.push(dsc); resto = Math.round((resto - dsc) * 100) / 100; }
  return { lista, sobra: resto };
}
const CON_BARRA = ['press de banca', 'press militar', 'remo con barra', 'curl con barra', 'sentadilla', 'peso muerto', 'peso muerto rumano', 'hip thrust', 'press inclinado con barra'];
export const esConBarra = (nombre: string) => {
  const n = nombre.trim().toLowerCase();
  return CON_BARRA.includes(n) || n.includes('con barra');
};

// ---------- Voz ----------
export function hablar(texto: string) {
  if (Platform.OS !== 'web') return;
  const s = (window as any).speechSynthesis;
  if (!s) return;
  try {
    s.cancel();
    const u = new (window as any).SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES';
    u.rate = 1.05;
    s.speak(u);
  } catch {}
}
export const hayVoz = () => Platform.OS === 'web' && typeof window !== 'undefined' && !!(window as any).speechSynthesis;
