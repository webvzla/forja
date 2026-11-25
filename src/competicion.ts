// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// FORJA ARENA: puntuación, rankings, amigos, retos y privacidad.
// Con DEMO = true los demás participantes son FICTICIOS. Sin DEMO, Arena usa el servidor (ArenaNube.tsx);
// las mismas reglas de puntos se calculan en supabase/migrations (privado.semanas).
import { Datos, claveDia, pesoMaximo } from './datos';
import { inicioSemana, nutricion } from './reglas';

const DIA = 86400000;
const SEMANA = 7 * DIA;

// ---------- Privacidad ----------
export type PreferenciasArena = {
  visible: 'amigos' | 'nadie';
  compartir: { entrenos: boolean; racha: boolean; medallas: boolean; records: boolean; retos: boolean };
  apodo: string;
  demo?: EstadoDemo;
};
export const PRIVACIDAD_INICIAL: PreferenciasArena = {
  visible: 'amigos',
  compartir: { entrenos: true, racha: true, medallas: true, records: false, retos: true },
  apodo: 'Tú',
};

// Mismas reglas que el servidor (privado.apodo_limpio): 2-24 letras, números, espacios, . _ -
// y sin nombres que puedan suplantar a FORJA.
export const apodoValido = (a: string) =>
  a.length >= 2 && a.length <= 24 && /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(a) && !/(forja|admin|soporte|oficial|moderador|staff|support)/i.test(a);

// Meta mínima de un reto (igual que el servidor): 2 entrenos/semana, la mitad de los días con
// proteína o 1 récord por semana, por persona si es en equipo.
export const metaMinima = (objetivo: TipoObjetivo, dias: number, personas = 1) =>
  personas * (objetivo === 'entrenos' ? Math.ceil((dias * 2) / 7) : objetivo === 'proteina' ? Math.ceil(dias / 2) : Math.ceil(dias / 7));

// ---------- Puntuación ----------
// Premia constancia y participación, no la fuerza: nadie gana por levantar más kilos.
export type Semana = { entrenos: number; objetivo: number; protDias: number; records: number; retos: number; racha: number };
export const REGLAS_PUNTOS = [
  ['Entreno completado', '10 pts (máx. 1 por día y tus días objetivo + 2 por semana)'],
  ['Semana cumplida', '+20 pts si haces tus días objetivo'],
  ['Día con tu proteína', '+3 pts (máx. 7 por semana)'],
  ['Racha', '+2 pts por semana seguida cumpliendo (máx. +20)'],
  ['Récord personal', '+5 pts (máx. 3 por semana): cuenta superarte a ti, no a otros'],
  ['Reto completado', '+15 pts (máx. 2 retos por semana)'],
] as const;

export function puntosSemana(s: Semana) {
  const entrenos = Math.min(s.entrenos, s.objetivo + 2);
  return (
    entrenos * 10 +
    (s.entrenos >= s.objetivo ? 20 : 0) +
    Math.min(s.protDias, 7) * 3 +
    Math.min(s.racha, 10) * 2 +
    Math.min(s.records, 3) * 5 +
    s.retos * 15
  );
}
// Constancia: % de tus días objetivo cumplidos (justo para quien entrena 3 o 6 días).
export const constancia = (ss: Semana[]) => {
  const obj = ss.reduce((a, s) => a + s.objetivo, 0);
  return obj ? Math.round((ss.reduce((a, s) => a + Math.min(s.entrenos, s.objetivo), 0) / obj) * 100) : 0;
};

// ---------- Mis datos reales, por semana ----------
export function misSemanas(d: Datos, n = 8, retosPorSemana: number[] = []): Semana[] {
  const lunes = inicioSemana();
  const objetivo = d.perfil?.dias ?? 3;
  const meta = d.perfil ? nutricion(d.perfil).proteina : 0;
  const mejorAntes = new Map<string, number>();
  const orden = [...d.sesiones].sort((a, b) => a.fecha - b.fecha);
  const recordsPorSemana = new Map<number, number>();
  for (const s of orden) {
    if (s.descarga) continue;
    const w = Math.floor((lunes + SEMANA - 1 - s.fecha) / SEMANA); // 0 = esta semana
    for (const x of s.ejercicios) {
      const k = x.nombre.toLowerCase();
      const m = pesoMaximo(x.series);
      if (m <= 0) continue;
      if (mejorAntes.has(k) && m > mejorAntes.get(k)!) recordsPorSemana.set(w, (recordsPorSemana.get(w) ?? 0) + 1);
      mejorAntes.set(k, Math.max(m, mejorAntes.get(k) ?? 0));
    }
  }
  const semanas: Semana[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const desde = lunes - i * SEMANA;
    const dias = new Set(d.sesiones.filter((s) => s.fecha >= desde && s.fecha < desde + SEMANA).map((s) => claveDia(s.fecha)));
    let protDias = 0;
    for (let k = 0; k < 7; k++) {
      const t = desde + k * DIA;
      if (meta && (d.comida[claveDia(t)] ?? []).reduce((a, x) => a + x.proteina, 0) >= meta) protDias++;
    }
    semanas.push({ entrenos: dias.size, objetivo, protDias, records: recordsPorSemana.get(i) ?? 0, retos: retosPorSemana[n - 1 - i] ?? 0, racha: 0 });
  }
  return conRachas(semanas);
}
function conRachas(ss: Semana[]) {
  let r = 0;
  return ss.map((s) => ({ ...s, racha: (r = s.entrenos >= s.objetivo ? r + 1 : 0) }));
}

// ---------- Participantes ficticios ----------
export type Persona = {
  id: string;
  apodo: string;
  nivel: string;
  desde: string;
  semanas: Semana[]; // 8 últimas, la última es la actual
  medallas: number;
  comparte: PreferenciasArena['compartir'];
};

function aleatorio(semilla: number) {
  let x = semilla;
  return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
}
function fingido(id: string, apodo: string, nivel: string, objetivo: number, ganas: number, semilla: number, comparte?: Partial<PreferenciasArena['compartir']>): Persona {
  const r = aleatorio(semilla);
  const hoy = (new Date().getDay() + 6) % 7; // días transcurridos de la semana actual
  const semanas = conRachas(
    Array.from({ length: 8 }, (_, i) => {
      const actual = i === 7;
      const tope = actual ? Math.max(0, Math.round(((hoy + 1) / 7) * (objetivo + 1))) : objetivo + 1;
      const entrenos = Math.min(tope, Math.max(0, Math.round(objetivo * ganas + (r() - 0.45) * 2.2)));
      const dias = actual ? hoy + 1 : 7;
      return { entrenos, objetivo, protDias: Math.min(dias, Math.round(dias * ganas * (0.5 + r() * 0.5))), records: r() < 0.45 * ganas ? 1 + Math.round(r()) : 0, retos: !actual && r() < 0.15 ? 1 : 0, racha: 0 };
    }),
  );
  return {
    id, apodo, nivel, desde: ['sept', 'oct', 'nov'][Math.floor(r() * 3)], semanas,
    medallas: 3 + Math.round(ganas * 7 + r() * 3),
    comparte: { entrenos: true, racha: true, medallas: true, records: r() > 0.4, retos: true, ...comparte },
  };
}

export const AMIGOS_DEMO: Persona[] = [
  fingido('laura', 'Laura M.', 'Intermedio', 4, 0.95, 11),
  fingido('carlos', 'Carlos R.', 'Avanzado', 5, 0.8, 23),
  fingido('sofia', 'Sofía G.', 'Principiante', 3, 0.9, 37),
  fingido('andres', 'Andrés P.', 'Intermedio', 4, 0.65, 41, { records: false }),
  fingido('vale', 'Valentina C.', 'Intermedio', 3, 0.75, 53),
  fingido('diego', 'Diego T.', 'Principiante', 3, 0.5, 67, { medallas: false }),
];
export const DIRECTORIO_DEMO: Persona[] = [
  fingido('pablo', 'Pablo N.', 'Intermedio', 4, 0.7, 71),
  fingido('lucia', 'Lucía F.', 'Avanzado', 5, 0.85, 83),
  fingido('javi', 'Javi M.', 'Principiante', 3, 0.6, 97),
  fingido('marta', 'Marta S.', 'Intermedio', 4, 0.8, 101),
  fingido('ivan', 'Iván L.', 'Principiante', 3, 0.55, 113),
];

// ---------- Retos ----------
export type TipoObjetivo = 'entrenos' | 'proteina' | 'records';
export type Reto = {
  id: string;
  nombre: string;
  modo: 'individual' | 'grupal';
  dias: 7 | 14 | 30;
  objetivo: TipoObjetivo;
  meta: number; // por persona (individual) o del equipo (grupal)
  inicio: number;
  participantes: string[]; // ids de amigos ('yo' incluido)
  creadoPor: string;
};
export const TEXTO_OBJETIVO_RETO: Record<TipoObjetivo, [string, string]> = {
  entrenos: ['Entrenos', 'entrenos'],
  proteina: ['Días con tu proteína', 'días con proteína'],
  records: ['Récords personales', 'récords'],
};

export type EstadoDemo = { amigos: string[]; enviadas: string[]; recibidas: string[]; bloqueados: string[]; retos: Reto[] };
export function estadoDemoInicial(): EstadoDemo {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const t = hoy.getTime();
  return {
    amigos: AMIGOS_DEMO.map((a) => a.id),
    enviadas: [],
    recibidas: ['marta', 'ivan'],
    bloqueados: [],
    retos: [
      { id: 'r1', nombre: 'Noviembre sin fallar', modo: 'grupal', dias: 30, objetivo: 'entrenos', meta: 70, inicio: t - 11 * DIA, participantes: ['yo', 'laura', 'carlos', 'sofia', 'andres'], creadoPor: 'laura' },
      { id: 'r2', nombre: 'Duelo de proteína', modo: 'individual', dias: 14, objetivo: 'proteina', meta: 10, inicio: t - 5 * DIA, participantes: ['yo', 'carlos', 'vale'], creadoPor: 'yo' },
      { id: 'r3', nombre: 'Semana a tope', modo: 'individual', dias: 7, objetivo: 'entrenos', meta: 4, inicio: t - 16 * DIA, participantes: ['yo', 'diego', 'sofia'], creadoPor: 'sofia' },
    ],
  };
}

// Progreso en un reto: el mío sale de mis datos reales; el de los demás es ficticio pero estable.
export function progresoReto(reto: Reto, id: string, d: Datos) {
  const fin = reto.inicio + reto.dias * DIA;
  const hasta = Math.min(Date.now(), fin);
  if (id === 'yo') {
    if (reto.objetivo === 'entrenos') return new Set(d.sesiones.filter((s) => s.fecha >= reto.inicio && s.fecha < hasta).map((s) => claveDia(s.fecha))).size;
    if (reto.objetivo === 'proteina') {
      const meta = d.perfil ? nutricion(d.perfil).proteina : 0;
      let n = 0;
      for (let t = reto.inicio; t < hasta; t += DIA) if (meta && (d.comida[claveDia(t)] ?? []).reduce((a, x) => a + x.proteina, 0) >= meta) n++;
      return n;
    }
    return misSemanas(d, Math.ceil(reto.dias / 7) + 1).reduce((a, s) => a + s.records, 0);
  }
  const p = [...AMIGOS_DEMO, ...DIRECTORIO_DEMO].find((x) => x.id === id);
  const r = aleatorio([...id, ...reto.id].reduce((a, ch) => a + ch.charCodeAt(0), 0));
  const transcurrido = Math.max(0, Math.min(1, (hasta - reto.inicio) / (fin - reto.inicio)));
  const ritmo = reto.objetivo === 'entrenos' ? ((p?.semanas[6].objetivo ?? 3) / 7) * reto.dias : reto.objetivo === 'proteina' ? reto.dias * 0.7 : reto.dias / 5;
  return Math.max(0, Math.round(ritmo * transcurrido * (0.6 + r() * 0.6)));
}

export const diasRestantes = (r: Reto) => Math.max(0, Math.ceil((r.inicio + r.dias * DIA - Date.now()) / DIA));
export const terminado = (r: Reto) => diasRestantes(r) === 0;

// ---------- Rankings ----------
export type Fila = { id: string; apodo: string; puntos: number; entrenos: number; constancia: number; racha: number; yo: boolean; antes?: number; persona?: Persona };
export type Periodo = 'semana' | 'mes';
export type Categoria = 'puntos' | 'entrenos' | 'constancia';

export function ranking(d: Datos, estado: EstadoDemo, apodo: string, periodo: Periodo, categoria: Categoria, desplazar = 0): Fila[] {
  const n = periodo === 'semana' ? 1 : 4;
  const tomar = (ss: Semana[]) => ss.slice(ss.length - n - desplazar, ss.length - desplazar);
  const yo = misSemanas(d, 8, retosMios(d, estado));
  const gente = AMIGOS_DEMO.filter((a) => estado.amigos.includes(a.id) && !estado.bloqueados.includes(a.id));
  const filas: Fila[] = [
    { id: 'yo', apodo, yo: true, ...cifras(tomar(yo)) },
    ...gente.map((p) => ({ id: p.id, apodo: p.apodo, yo: false, persona: p, ...cifras(tomar(p.semanas)) })),
  ];
  const clave = (f: Fila) => (categoria === 'puntos' ? f.puntos : categoria === 'entrenos' ? f.entrenos : f.constancia * 100 + f.racha);
  return filas.sort((a, b) => clave(b) - clave(a) || b.puntos - a.puntos);
}
function cifras(ss: Semana[]) {
  return {
    puntos: ss.reduce((a, s) => a + puntosSemana(s), 0),
    entrenos: ss.reduce((a, s) => a + s.entrenos, 0),
    constancia: constancia(ss),
    racha: ss[ss.length - 1]?.racha ?? 0,
  };
}
function retosMios(d: Datos, estado: EstadoDemo) {
  const lunes = inicioSemana();
  const porSemana = Array(8).fill(0);
  for (const r of estado.retos.filter((x) => terminado(x) && x.participantes.includes('yo'))) {
    const ok = r.modo === 'individual' ? progresoReto(r, 'yo', d) >= r.meta : r.participantes.reduce((a, id) => a + progresoReto(r, id, d), 0) >= r.meta;
    if (!ok) continue;
    const fin = r.inicio + r.dias * DIA;
    const w = 7 - Math.floor((lunes + SEMANA - 1 - fin) / SEMANA);
    if (w >= 0 && w < 8) porSemana[w]++;
  }
  return porSemana;
}
export const retosCompletados = (d: Datos, estado: EstadoDemo) => retosMios(d, estado).reduce((a, b) => a + b, 0);

// Posición en cada una de las últimas 8 semanas (1 = primero).
export function historialPosiciones(d: Datos, estado: EstadoDemo, apodo: string) {
  return Array.from({ length: 8 }, (_, i) => {
    const filas = ranking(d, estado, apodo, 'semana', 'puntos', 7 - i);
    return { semana: 8 - i, puesto: filas.findIndex((f) => f.yo) + 1, total: filas.length };
  });
}
