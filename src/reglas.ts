import {
  Datos,
  Ejercicio,
  Enfasis,
  Equipo,
  Objetivo,
  Perfil,
  Rutina,
  Sesion,
  historial,
  mismoEjercicio,
  nuevoId,
  pesoMaximo,
  ultimaVez,
  zonas,
} from './datos';

type Patron =
  | 'empuje_h' | 'empuje_v' | 'empuje_aux' | 'triceps'
  | 'tiron_v' | 'tiron_h' | 'biceps'
  | 'rodilla' | 'cadera' | 'unilateral' | 'gemelos' | 'core';
type Item = { n: string; p: Patron; eq: Equipo[]; dificil?: boolean };

const G: Equipo[] = ['gym'];
const GM: Equipo[] = ['gym', 'mancuernas'];
const C: Equipo[] = ['casa'];
const T: Equipo[] = ['gym', 'mancuernas', 'casa'];

const CATALOGO: Item[] = [
  { n: 'Press de banca', p: 'empuje_h', eq: G, dificil: true },
  { n: 'Press con mancuernas', p: 'empuje_h', eq: GM },
  { n: 'Press en máquina', p: 'empuje_h', eq: G },
  { n: 'Flexiones', p: 'empuje_h', eq: C },
  { n: 'Flexiones con pies elevados', p: 'empuje_h', eq: C, dificil: true },
  { n: 'Press militar', p: 'empuje_v', eq: G, dificil: true },
  { n: 'Press de hombros con mancuernas', p: 'empuje_v', eq: GM },
  { n: 'Elevaciones laterales', p: 'empuje_v', eq: GM },
  { n: 'Flexiones pica', p: 'empuje_v', eq: C },
  { n: 'Press inclinado con mancuernas', p: 'empuje_aux', eq: GM },
  { n: 'Aperturas con mancuernas', p: 'empuje_aux', eq: GM },
  { n: 'Fondos en paralelas', p: 'empuje_aux', eq: G, dificil: true },
  { n: 'Flexiones inclinadas', p: 'empuje_aux', eq: C },
  { n: 'Extensión de tríceps en polea', p: 'triceps', eq: G },
  { n: 'Extensión de tríceps con mancuerna', p: 'triceps', eq: GM },
  { n: 'Fondos en silla', p: 'triceps', eq: C },
  { n: 'Jalón al pecho', p: 'tiron_v', eq: G },
  { n: 'Dominadas', p: 'tiron_v', eq: G, dificil: true },
  { n: 'Pullover con mancuerna', p: 'tiron_v', eq: GM },
  { n: 'Remo invertido bajo una mesa', p: 'tiron_v', eq: C },
  { n: 'Remo en polea', p: 'tiron_h', eq: G },
  { n: 'Remo con barra', p: 'tiron_h', eq: G, dificil: true },
  { n: 'Remo con mancuerna', p: 'tiron_h', eq: GM },
  { n: 'Remo con mochila', p: 'tiron_h', eq: C },
  { n: 'Curl con barra', p: 'biceps', eq: G },
  { n: 'Curl con mancuernas', p: 'biceps', eq: GM },
  { n: 'Curl con mochila', p: 'biceps', eq: C },
  { n: 'Prensa', p: 'rodilla', eq: G },
  { n: 'Sentadilla', p: 'rodilla', eq: G, dificil: true },
  { n: 'Sentadilla goblet', p: 'rodilla', eq: GM },
  { n: 'Sentadilla con peso corporal', p: 'rodilla', eq: C },
  { n: 'Peso muerto rumano', p: 'cadera', eq: G, dificil: true },
  { n: 'Peso muerto rumano con mancuernas', p: 'cadera', eq: GM },
  { n: 'Curl femoral', p: 'cadera', eq: G },
  { n: 'Puente de glúteo', p: 'cadera', eq: C },
  { n: 'Zancadas con mancuernas', p: 'unilateral', eq: GM },
  { n: 'Subidas al cajón', p: 'unilateral', eq: GM },
  { n: 'Zancadas', p: 'unilateral', eq: C },
  { n: 'Elevación de gemelos', p: 'gemelos', eq: T },
  { n: 'Encogimientos abdominales', p: 'core', eq: T },
  { n: 'Elevación de piernas', p: 'core', eq: T },
  { n: 'Plancha', p: 'core', eq: T },
  { n: 'Plancha lateral', p: 'core', eq: T },
  { n: 'Crunch en polea', p: 'core', eq: G },
  { n: 'Rueda abdominal', p: 'core', eq: GM, dificil: true },
  { n: 'Dead bug', p: 'core', eq: T },
];

const ACCESORIOS: Patron[] = ['triceps', 'biceps', 'gemelos', 'core'];
const PIERNA: Patron[] = ['rodilla', 'cadera', 'unilateral'];

const CUERPO: Patron[] = ['rodilla', 'empuje_h', 'tiron_h', 'cadera', 'empuje_v', 'tiron_v', 'core'];
const TORSO: Patron[] = ['empuje_h', 'tiron_h', 'empuje_v', 'tiron_v', 'triceps', 'biceps'];
const INFERIOR: Patron[] = ['rodilla', 'cadera', 'unilateral', 'gemelos', 'core'];
const EMPUJE: Patron[] = ['empuje_h', 'empuje_v', 'empuje_aux', 'triceps'];
const TIRON: Patron[] = ['tiron_v', 'tiron_h', 'tiron_h', 'biceps'];

// ---------- Objetivos (hasta 2 combinados) ----------
export const TEXTO_OBJETIVO: Record<Objetivo, string> = {
  grasa: 'Perder grasa',
  musculo: 'Ganar músculo',
  fuerza: 'Ganar fuerza',
  mantener: 'Mantenerme',
};
export const objetivos = (p: { objetivo: Objetivo; objetivo2?: Objetivo | null }): Objetivo[] =>
  p.objetivo2 && p.objetivo2 !== p.objetivo ? [p.objetivo, p.objetivo2] : [p.objetivo];
const con = (o: Objetivo[], ...x: Objetivo[]) => x.every((y) => o.includes(y));
export const esRecomposicion = (o: Objetivo[]) => con(o, 'grasa', 'musculo');
export function textoObjetivo(p: { objetivo: Objetivo; objetivo2?: Objetivo | null }) {
  const o = objetivos(p);
  if (esRecomposicion(o)) return 'Perder grasa y ganar músculo';
  if (con(o, 'musculo', 'fuerza')) return 'Ganar músculo y fuerza';
  if (con(o, 'grasa', 'fuerza')) return 'Perder grasa y ganar fuerza';
  if (con(o, 'mantener', 'musculo')) return 'Mantener peso y ganar músculo';
  if (con(o, 'mantener', 'fuerza')) return 'Mantener peso y ganar fuerza';
  return TEXTO_OBJETIVO[o[0]];
}
// Combinaciones que se contradicen.
export const incompatibles = (a: Objetivo, b: Objetivo) => [a, b].includes('grasa') && [a, b].includes('mantener');

type Dia = [string, Patron[], number];
const PLANES: Record<number, Dia[]> = {
  2: [['Cuerpo completo A', CUERPO, 0], ['Cuerpo completo B', CUERPO, 1]],
  3: [['Cuerpo completo A', CUERPO, 0], ['Cuerpo completo B', CUERPO, 1], ['Cuerpo completo C', CUERPO, 2]],
  4: [['Torso A', TORSO, 0], ['Pierna A', INFERIOR, 0], ['Torso B', TORSO, 1], ['Pierna B', INFERIOR, 1]],
  5: [['Empuje', EMPUJE, 0], ['Tirón', TIRON, 0], ['Pierna A', INFERIOR, 0], ['Torso', TORSO, 1], ['Pierna B', INFERIOR, 1]],
  6: [
    ['Empuje A', EMPUJE, 0], ['Tirón A', TIRON, 0], ['Pierna A', INFERIOR, 0],
    ['Empuje B', EMPUJE, 1], ['Tirón B', TIRON, 1], ['Pierna B', INFERIOR, 1],
  ],
};
const DIAS_SEMANA: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
};
export const NOMBRE_DIA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const ENFASIS: Record<Enfasis, Patron[]> = {
  ninguno: [],
  pecho: ['empuje_h', 'empuje_aux'],
  espalda: ['tiron_v', 'tiron_h'],
  pierna: ['rodilla', 'cadera', 'unilateral'],
  gluteo: ['cadera', 'unilateral'],
  brazos: ['triceps', 'biceps'],
  abdomen: ['core'],
};

function rango(o: Objetivo[], p: Patron): [number, number] {
  if (p === 'core' || p === 'gemelos') return [12, 20];
  const acc = ACCESORIOS.includes(p);
  // Fuerza combinada con otro objetivo: básicos pesados (5-8) y accesorios del otro objetivo.
  if (o.includes('fuerza') && o.length > 1 && !o.includes('mantener')) {
    if (!acc) return [5, 8];
    return o.includes('grasa') ? [12, 15] : [10, 15];
  }
  if (esRecomposicion(o)) return acc ? [10, 15] : [8, 12];
  const objetivo = o.includes('fuerza') ? 'fuerza' : o.includes('musculo') ? 'musculo' : o[0];
  if (objetivo === 'fuerza') return acc ? [8, 12] : [4, 6];
  if (objetivo === 'musculo') return acc ? [10, 15] : [8, 12];
  if (objetivo === 'grasa') return acc ? [12, 15] : [10, 15];
  return [8, 12];
}

function descansoDe(o: Objetivo[], p: Patron) {
  if (p === 'core' || p === 'gemelos') return 45;
  if (ACCESORIOS.includes(p)) return 60;
  if (o.includes('fuerza')) return o.length > 1 ? 150 : 180;
  if (esRecomposicion(o)) return 75;
  if (o.includes('musculo')) return 90;
  return { fuerza: 180, musculo: 90, mantener: 75, grasa: 60 }[o[0]];
}

const MAS_DIFICIL: Record<string, string> = {
  'Flexiones inclinadas': 'Flexiones',
  Flexiones: 'Flexiones con pies elevados',
  'Sentadilla con peso corporal': 'Zancadas',
  'Puente de glúteo': 'Zancadas',
};

export function alternativas(nombre: string, perfil: Perfil | null) {
  const actual = CATALOGO.find((x) => mismoEjercicio(x.n, nombre));
  if (!actual) return [];
  const equipo = perfil?.equipo ?? 'gym';
  return CATALOGO.filter((x) => x.p === actual.p && x.n !== actual.n && x.eq.includes(equipo)).map((x) => x.n);
}

function opciones(p: Patron, perfil: Perfil) {
  const validas = CATALOGO.filter((x) => x.p === p && x.eq.includes(perfil.equipo));
  if (perfil.nivel !== 'principiante') return validas;
  const faciles = validas.filter((x) => !x.dificil);
  return faciles.length ? faciles : validas;
}

export function generarPlan(perfil: Perfil): Rutina[] {
  const dias = PLANES[perfil.dias];
  const semana = perfil.diasSemana?.length === perfil.dias ? [...perfil.diasSemana].sort((a, b) => a - b) : DIAS_SEMANA[perfil.dias];
  return dias.map(([nombre, plantilla, variante], i) => {
    const usados = new Set<string>();
    const ejercicios: Ejercicio[] = [];
    // Abdomen: dos ejercicios de core todos los días (aunque sea día de torso).
    const prioridad = zonas(perfil);
    const patrones = prioridad.includes('abdomen') ? [...plantilla.filter((x) => x !== 'core'), 'core', 'core'] as Patron[] : plantilla;
    for (const p of patrones) {
      const libres = opciones(p, perfil).filter((x) => !usados.has(x.n));
      if (!libres.length) continue;
      const item = libres[variante % libres.length];
      usados.add(item.n);
      const acc = ACCESORIOS.includes(p);
      const base = perfil.nivel === 'principiante' || acc ? 3 : 4;
      const extra = prioridad.some((z) => ENFASIS[z].includes(p)) ? 1 : 0;
      // Sin peso, pocas repeticiones no sirven: el esfuerzo llega con más repeticiones y menos descanso.
      const enCasa = perfil.equipo === 'casa' && p !== 'core' && p !== 'gemelos';
      // En las planchas las repeticiones son segundos aguantando.
      const [reps, repsMax] = item.n.startsWith('Plancha') ? [30, 60] : enCasa ? [10, 15] : rango(objetivos(perfil), p);
      const descanso = enCasa ? 75 : descansoDe(objetivos(perfil), p);
      ejercicios.push({ id: nuevoId(), nombre: item.n, series: Math.min(5, base + extra), reps, repsMax, descanso });
    }
    return { id: nuevoId(), nombre, ejercicios, deCoach: true, dia: semana[i] };
  });
}

const incremento = (nombre: string) => {
  const item = CATALOGO.find((x) => mismoEjercicio(x.n, nombre));
  return item && PIERNA.includes(item.p) ? 5 : 2.5;
};

// Doble progresión: si llegaste al tope de repeticiones en todas las series, toca subir peso.
export function pesoSugerido(sesiones: Sesion[], nombre: string, objetivo: number, repsMax?: number) {
  const u = ultimaVez(sesiones, nombre);
  if (!u.length) return null;
  const max = pesoMaximo(u);
  const tope = Math.max(repsMax ?? objetivo + 2, objetivo);
  const llega = u.every((s) => s.reps >= tope);
  if (max === 0) {
    const mejor = Math.max(...u.map((s) => s.reps));
    return { peso: 0, sube: false, reps: llega ? mejor + 1 : null, dificil: llega && mejor >= tope + 5 ? (MAS_DIFICIL[nombre] ?? null) : null };
  }
  return { peso: llega ? max + incremento(nombre) : max, sube: llega, reps: null, dificil: null };
}

function estancado(sesiones: Sesion[], e: Ejercicio) {
  const h = historial(sesiones, e.nombre).slice(-3);
  if (h.length < 3 || h[0].max <= 0) return false;
  const s = pesoSugerido(sesiones, e.nombre, e.reps, e.repsMax);
  return h[2].max <= h[0].max && !s?.sube && !s?.reps;
}

export function nutricion(p: Perfil) {
  const base = 10 * p.peso + 6.25 * p.altura - 5 * p.edad + (p.sexo === 'h' ? 5 : -161);
  const factor = p.dias <= 3 ? 1.375 : p.dias <= 5 ? 1.55 : 1.725;
  const mantenimiento = base * factor;
  const metros = p.altura / 100;
  const imc = p.peso / (metros * metros);

  const o = objetivos(p);
  const solo = { grasa: -0.2, musculo: 0.1, fuerza: 0.05, mantener: 0 };
  let cambio = o.length === 1 ? solo[o[0]]
    : esRecomposicion(o) ? -0.1 // déficit pequeño: pierdes grasa sin frenar el músculo
      : con(o, 'grasa', 'fuerza') ? -0.15
        : con(o, 'musculo', 'fuerza') ? 0.1
          : 0; // mantener + músculo/fuerza
  let aviso: string | null = null;
  if (cambio < 0 && p.edad < 18) {
    cambio = 0;
    aviso = 'Con menos de 18 años no te propongo déficit de calorías: estás creciendo.';
  } else if (cambio < 0 && imc < 18.5) {
    cambio = 0;
    aviso = 'Tu peso ya es bajo para tu altura, así que no te propongo déficit. Consulta con un profesional.';
  }

  const minimo = p.sexo === 'h' ? 1500 : 1200;
  const ajuste = cambio === 0 && aviso ? 0 : p.ajusteKcal;
  const kcal = Math.max(minimo, Math.round((mantenimiento * (1 + cambio) + ajuste) / 50) * 50);
  const gk = { grasa: 2, musculo: 1.8, fuerza: 1.8, mantener: 1.6 };
  const gramosKg = esRecomposicion(o) ? 2.2 : Math.max(...o.map((x) => gk[x]));
  const pesoReferencia = Math.min(p.peso, 27 * metros * metros);
  return { kcal, proteina: Math.round(pesoReferencia * gramosKg), imc, aviso };
}

const DIA_MS = 86400000;

export function inicioSemana(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
export const diaHoy = () => (new Date().getDay() + 6) % 7;

export function revisar(d: Datos) {
  const ahora = Date.now();
  const perfil = d.perfil!;
  const hechos = d.sesiones.filter((s) => s.fecha > ahora - 7 * DIA_MS).length;
  const anteriores = d.sesiones.filter((s) => s.fecha <= ahora - 7 * DIA_MS && s.fecha > ahora - 14 * DIA_MS).length;
  const plan = d.rutinas.filter((r) => r.deCoach).flatMap((r) => r.ejercicios);

  const vistos = new Set<string>();
  const unicos = plan.filter((e) => !vistos.has(e.nombre) && vistos.add(e.nombre));
  const suben = unicos.flatMap((e) => {
    const s = pesoSugerido(d.sesiones, e.nombre, e.reps, e.repsMax);
    return s?.sube || s?.reps ? [{ nombre: e.nombre, peso: s.peso, reps: s.reps }] : [];
  });
  const estancados = unicos.filter((e) => estancado(d.sesiones, e)).map((e) => e.nombre);

  const recientes = d.pesos.filter((p) => p.fecha > ahora - 28 * DIA_MS);
  let tendencia: number | null = null;
  if (recientes.length >= 2) {
    const a = recientes[0];
    const b = recientes[recientes.length - 1];
    const semanas = (b.fecha - a.fecha) / (7 * DIA_MS);
    if (semanas >= 1) tendencia = (b.max - a.max) / semanas;
  }

  let semanasSeguidas = 0;
  for (let k = 0; k < 8; k++) {
    const n = d.sesiones.filter((s) => !s.descarga && s.fecha > ahora - (k + 1) * 7 * DIA_MS && s.fecha <= ahora - k * 7 * DIA_MS).length;
    if (n < Math.max(1, perfil.dias - 1)) break;
    semanasSeguidas++;
  }
  const enDescarga = (perfil.descargaHasta ?? 0) > ahora;
  const pideDescarga = !enDescarga && (semanasSeguidas >= 5 || estancados.length >= 3);

  const faltan = perfil.ultimaRevision ? Math.ceil(7 - (ahora - perfil.ultimaRevision) / DIA_MS) : 0;
  return { enDescarga, pideDescarga, semanasSeguidas, hechos, anteriores, objetivo: perfil.dias, suben, estancados, tendencia, faltan: Math.max(0, faltan), hayDatos: d.sesiones.length > 0 };
}

// Aplica la revisión semanal: cambia lo estancado, sube el volumen si cumples y ajusta calorías.
export function ajustarPlan(d: Datos): { rutinas: Rutina[]; perfil: Perfil; cambios: string[] } {
  const perfil = d.perfil!;
  const r = revisar(d);
  const cambios: string[] = [];

  let rutinas = d.rutinas.map((rut) => {
    if (!rut.deCoach) return rut;
    const ejercicios = rut.ejercicios.map((e) => {
      const dificil = pesoSugerido(d.sesiones, e.nombre, e.reps, e.repsMax)?.dificil;
      if (dificil && !rut.ejercicios.some((y) => mismoEjercicio(y.nombre, dificil))) {
        cambios.push(`${rut.nombre}: ${e.nombre} ya te queda fácil, ahora ${dificil}.`);
        return { ...e, id: nuevoId(), nombre: dificil };
      }
      if (!r.estancados.includes(e.nombre)) return e;
      const actual = CATALOGO.find((x) => mismoEjercicio(x.n, e.nombre));
      if (!actual) return e;
      const alt = opciones(actual.p, perfil).find(
        (x) => x.n !== actual.n && !rut.ejercicios.some((y) => mismoEjercicio(y.nombre, x.n)),
      );
      if (!alt) return e;
      cambios.push(`${rut.nombre}: ${e.nombre} estaba estancado, ahora ${alt.n}.`);
      return { ...e, id: nuevoId(), nombre: alt.n };
    });
    return { ...rut, ejercicios };
  });

  const cumple = r.hechos >= r.objetivo && r.anteriores >= r.objetivo;
  if (cumple && !r.estancados.length && perfil.nivel !== 'principiante') {
    rutinas = rutinas.map((rut) => {
      const primero = rut.ejercicios[0];
      if (!rut.deCoach || !primero || primero.series >= 5) return rut;
      cambios.push(`${rut.nombre}: una serie más en ${primero.nombre}.`);
      return { ...rut, ejercicios: rut.ejercicios.map((e, i) => (i === 0 ? { ...e, series: e.series + 1 } : e)) };
    });
  }

  let ajusteKcal = perfil.ajusteKcal;
  if (r.tendencia !== null) {
    const limite = (n: number) => Math.max(-300, Math.min(300, n));
    const o = objetivos(perfil);
    const bajar = o.includes('grasa');
    const subir = !bajar && o.includes('musculo') && !o.includes('mantener');
    if (bajar && esRecomposicion(o) && r.tendencia > 0.1) {
      ajusteKcal = limite(ajusteKcal - 100);
      cambios.push('Tu peso sube: 100 kcal menos al día para seguir perdiendo grasa.');
    } else if (bajar && !esRecomposicion(o) && r.tendencia >= -0.1) {
      ajusteKcal = limite(ajusteKcal - 100);
      cambios.push('Tu peso no baja: 100 kcal menos al día.');
    } else if (bajar && r.tendencia < -perfil.peso * 0.01) {
      ajusteKcal = limite(ajusteKcal + 100);
      cambios.push('Estás bajando demasiado rápido: 100 kcal más al día.');
    } else if (subir && r.tendencia <= 0.05) {
      ajusteKcal = limite(ajusteKcal + 100);
      cambios.push('Tu peso no sube: 100 kcal más al día.');
    }
  }

  if (r.hechos < r.objetivo / 2 && r.anteriores < r.objetivo / 2 && perfil.dias > 2)
    cambios.push(`Entrenas menos de lo previsto. Si te cuesta, edita tu perfil y baja a ${perfil.dias - 1} días.`);
  if (!cambios.length) cambios.push('Vas bien: mantén el plan esta semana y sigue subiendo pesos cuando te lo indique.');

  return { rutinas, perfil: { ...perfil, ajusteKcal, ultimaRevision: Date.now() }, cambios };
}

export const ALIMENTOS = [
  { nombre: 'Pollo (100 g)', proteina: 31, kcal: 165 },
  { nombre: 'Carne magra (100 g)', proteina: 26, kcal: 200 },
  { nombre: 'Atún (100 g)', proteina: 25, kcal: 120 },
  { nombre: 'Huevo (1)', proteina: 6, kcal: 70 },
  { nombre: 'Queso blanco (50 g)', proteina: 9, kcal: 140 },
  { nombre: 'Yogur griego (170 g)', proteina: 17, kcal: 110 },
  { nombre: 'Leche (250 ml)', proteina: 8, kcal: 150 },
  { nombre: 'Caraotas (1 taza)', proteina: 15, kcal: 225 },
  { nombre: 'Lentejas (1 taza)', proteina: 18, kcal: 230 },
  { nombre: 'Arepa mediana', proteina: 4, kcal: 200 },
  { nombre: 'Arroz (1 taza)', proteina: 4, kcal: 205 },
  { nombre: 'Batido de proteína', proteina: 24, kcal: 120 },
];
