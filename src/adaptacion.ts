// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Adaptación del entrenamiento: FORJA ORIENTA, la persona DECIDE.
//  · `recomendar` es una función pura: lee tus datos y propone mantener, subir, bajar o descansar con sus motivos.
//    No cambia nada. Nunca sube la dificultad por su cuenta.
//  · Los cambios solo ocurren con las acciones de abajo, que se ejecutan cuando pulsas un botón.
//  · Reglas: sin datos suficientes no se afirma nada; con dolor no se propone subir; más volumen no cuenta como más
//    progreso; se respetan los días de descanso (nunca se propone entrenar más días).
//  · La dificultad, el nivel físico y el nivel FORJA (XP) son independientes: nada de aquí toca los otros dos.
import { Datos, Nivel, Sensacion, dificultadDe } from './datos';
import { NOMBRE_DIFICULTAD, paso } from './niveles';
import { progresoFuerza, volumenMedio } from './atributos';
import { revisar, reajustarPlan } from './reglas';
import { calcularXp } from './xp';

const DIA = 86400000;

// Umbrales (se pueden afinar con el uso real; las pruebas los fijan).
export const UMBRALES = {
  semanasMinimas: 3, // semanas completas con entrenos para poder valorar algo
  constanciaSubir: 0.8,
  constanciaBajar: 0.5,
  respuestasParaSubir: 5,
  facilesParaSubir: 0.6,
  durosMaximoParaSubir: 0.2,
  respuestasParaBajar: 4,
  durosParaBajar: 0.5,
  animoRespuestasFiables: 6, // días con respuesta en 14 días para fiarse de «cómo estás hoy»
  animoBajoFrecuente: 0.5,
  volumenExceso: 1.2, // 120 % de las series previstas
  diasDolor: 14,
  diasAnimo: 14,
  diasSensaciones: 28,
  diasEsperaTrasCambio: 21,
  diasSilencio: 28,
} as const;

export type TipoRecomendacion = 'mantener' | 'subir' | 'bajar' | 'descanso' | 'sin-datos';
export type Accion = 'mantener' | 'subir' | 'bajar' | 'descansar';
export type Recomendacion = {
  tipo: TipoRecomendacion;
  titulo: string;
  motivos: string[];
  acciones: Accion[]; // botones que se ofrecen (vacío = solo información)
  destino?: Nivel; // dificultad a la que llevaría subir o bajar
  silenciada: boolean; // la persona pidió «mantener»: no se vuelve a insistir durante unas semanas
  informativa: boolean; // sin novedad: se muestra en una línea, sin botones
};

const pct = (x: number) => `${Math.round(x * 100)} %`;
const decimal = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
const hace = (t: number, ahora: number) => Math.max(0, Math.floor((ahora - t) / DIA));
const fechaDe = (k: string) => {
  const [a, m, dia] = k.split('-').map(Number);
  return new Date(a, m - 1, dia, 12).getTime();
};

// ---------- Señales (todas salen de lo que ya registras) ----------
export function senales(d: Datos, ahora = Date.now()) {
  const est = d.perfil ? calcularXp(d) : null;
  const completas = (est?.cerradas ?? []).filter((s) => !s.parcial).slice(-4);
  const conEntrenos = completas.filter((s) => s.entrenos > 0).length;
  const objetivo = completas.reduce((a, s) => a + s.objetivo, 0);
  const constancia = objetivo ? completas.reduce((a, s) => a + Math.min(s.entrenos, s.objetivo), 0) / objetivo : null;

  const sens = d.sesiones.filter((s) => !s.descarga && s.sensacion && s.fecha > ahora - UMBRALES.diasSensaciones * DIA);
  const conteo = { facil: 0, bien: 0, duro: 0 };
  for (const s of sens) conteo[s.sensacion as Sensacion]++;

  const dolor = d.sesiones.filter((s) => s.dolor && s.fecha > ahora - UMBRALES.diasDolor * DIA).length;

  const animos = Object.entries(d.animo ?? {}).filter(([k]) => fechaDe(k) > ahora - UMBRALES.diasAnimo * DIA && fechaDe(k) <= ahora + DIA);
  const animosBajos = animos.filter(([, v]) => v.sueno + v.energia <= 1).length;

  const fuerza = progresoFuerza(d, ahora);
  const volumen = volumenMedio(d, ahora);
  return {
    semanasCompletas: completas.length, conEntrenos, constancia,
    respuestas: sens.length, ...conteo,
    dolor,
    animoDias: animos.length, animoBajos: animosBajos,
    fuerza: fuerza.cambio, volumen: volumen.plan > 0 && volumen.semanas >= 2 ? volumen.media / volumen.plan : null,
  };
}

// ¿Has marcado molestias hace poco? Con esto la app es prudente: no anima a subir ni a entrenar con dolor.
export const dolorReciente = (d: Datos, ahora = Date.now()) => d.sesiones.some((s) => s.dolor && s.fecha > ahora - UMBRALES.diasDolor * DIA);

// ---------- Recomendación ----------
export function recomendar(d: Datos, ahora = Date.now()): Recomendacion | null {
  const perfil = d.perfil;
  if (!perfil) return null;
  const actual = dificultadDe(perfil);
  const meta = d.ajustes?.dificultad;
  const silenciada = (meta?.silenciarHasta ?? 0) > ahora;
  const s = senales(d, ahora);
  const r = revisar(d);
  const nombre = NOMBRE_DIFICULTAD[actual];
  const base = { silenciada: false, informativa: false };

  // 1) Dolor: prioridad absoluta. Solo se aconseja descansar y consultar; no se ofrece ningún botón que implique seguir
  //    entrenando (ni bajar ni «descarga», que siguen siendo entrenos), no se propone subir y no se puede silenciar.
  //    FORJA no sabe qué te pasa y no emite ningún juicio sobre ello: solo orienta.
  if (s.dolor > 0)
    return {
      ...base, tipo: 'descanso', titulo: 'Prioriza el descanso', acciones: [],
      motivos: [
        `Marcaste que te dolió algo en ${s.dolor === 1 ? 'un entreno' : `${s.dolor} entrenos`} de las últimas ${UMBRALES.diasDolor / 7} semanas.`,
        'No entrenes con dolor: descansa y, si no se pasa, consulta con un profesional.',
        'Si el dolor es fuerte, aparece de golpe o te preocupa, no esperes: consulta con un profesional.',
        'Mientras tanto no te propongo subir la dificultad ni pesos.',
      ],
    };

  // 2) Semana de descarga en marcha: no tocar nada.
  if (r.enDescarga)
    return { ...base, tipo: 'mantener', titulo: `Mantén «${nombre}»`, motivos: ['Estás en semana de descarga: no cambies la dificultad ahora.'], acciones: [], informativa: true };

  // 3) Cambio reciente: dar tiempo.
  if (meta?.cambio && ahora - meta.cambio < UMBRALES.diasEsperaTrasCambio * DIA)
    return {
      ...base, tipo: 'mantener', titulo: `Mantén «${nombre}»`, informativa: true, acciones: [],
      motivos: [`Cambiaste la dificultad hace ${hace(meta.cambio, ahora)} ${hace(meta.cambio, ahora) === 1 ? 'día' : 'días'}: dale unas semanas antes de valorar otro cambio.`],
    };

  // 4) Pocos datos: no se inventa nada.
  if (s.conEntrenos < UMBRALES.semanasMinimas)
    return {
      ...base, tipo: 'sin-datos', titulo: 'Aún no hay datos para recomendarte', acciones: [], informativa: true,
      motivos: [`Necesito al menos ${UMBRALES.semanasMinimas} semanas completas entrenando para valorarlo (llevas ${s.conEntrenos}).`],
    };

  // 5) Descanso por sobrecarga o por recuperación baja (esta última solo si hay datos fiables).
  const animoFiable = s.animoDias >= UMBRALES.animoRespuestasFiables;
  const animoBajo = animoFiable && s.animoBajos / s.animoDias >= UMBRALES.animoBajoFrecuente;
  if (r.pideDescarga || animoBajo) {
    const motivos: string[] = [];
    if (r.semanasSeguidas >= 5) motivos.push(`Llevas ${r.semanasSeguidas} semanas seguidas entrenando casi todos tus días.`);
    if (r.estancados.length >= 3) motivos.push(`${r.estancados.length} ejercicios llevan varios entrenos sin mejorar: más volumen no es más progreso.`);
    if (animoBajo) motivos.push(`En ${s.animoBajos} de los últimos ${s.animoDias} días que lo contaste dormiste mal o tenías poca energía.`);
    motivos.push('Una semana más ligera suele ayudar a seguir progresando.');
    return { ...base, silenciada, tipo: 'descanso', titulo: 'Prioriza el descanso', motivos, acciones: ['descansar', 'mantener'] };
  }

  // 6) Bajar: te cuesta cumplir o terminas agotado.
  const costaCumplir = s.constancia !== null && s.constancia < UMBRALES.constanciaBajar;
  const muchoDuro = s.respuestas >= UMBRALES.respuestasParaBajar && s.duro / s.respuestas >= UMBRALES.durosParaBajar;
  if (costaCumplir || muchoDuro) {
    const motivos: string[] = [];
    if (costaCumplir) motivos.push(`Cumpliste el ${pct(s.constancia as number)} de tus días previstos en las últimas ${s.semanasCompletas} semanas.`);
    if (muchoDuro) motivos.push(`${s.duro} de tus últimos ${s.respuestas} entrenos te parecieron duros.`);
    if (actual === 'principiante') {
      motivos.push('Ya estás en «Suave». Si te sigue costando, puedes reducir los días de entreno en tu perfil.');
      return { ...base, silenciada, tipo: 'mantener', titulo: `Mantén «${nombre}»`, motivos, acciones: ['mantener'] };
    }
    const destino = paso(actual, 'bajar');
    motivos.push('Bajar un nivel no es un paso atrás: es adaptarte para seguir con constancia.');
    return { ...base, silenciada, tipo: 'bajar', titulo: `Quizá te venga bien «${NOMBRE_DIFICULTAD[destino]}»`, motivos, acciones: ['bajar', 'mantener'], destino };
  }

  // 7) Subir: solo con constancia alta, sensaciones fáciles registradas y sin señales de alarma.
  const bloqueoVolumen = s.volumen !== null && s.volumen > UMBRALES.volumenExceso && (s.fuerza === null || s.fuerza <= 0);
  const fuerzaBaja = s.fuerza !== null && s.fuerza < 0;
  const muchosEstancados = r.estancados.length >= 2;
  const facilSuficiente = s.respuestas >= UMBRALES.respuestasParaSubir && s.facil / s.respuestas >= UMBRALES.facilesParaSubir && s.duro / s.respuestas <= UMBRALES.durosMaximoParaSubir;
  if (actual !== 'avanzado' && (s.constancia ?? 0) >= UMBRALES.constanciaSubir && facilSuficiente && !bloqueoVolumen && !fuerzaBaja && !muchosEstancados) {
    const destino = paso(actual, 'subir');
    const motivos = [
      `Cumpliste el ${pct(s.constancia as number)} de tus días previstos en las últimas ${s.semanasCompletas} semanas.`,
      `${s.facil} de tus últimos ${s.respuestas} entrenos te parecieron fáciles.`,
    ];
    if (s.fuerza !== null && s.fuerza > 0) motivos.push(`Tu mejor peso subió un ${decimal(s.fuerza * 100)} % respecto a las semanas anteriores.`);
    motivos.push('Sube la intensidad, no los días: tus días de descanso se quedan como están.');
    return { ...base, silenciada, tipo: 'subir', titulo: `Puedes probar «${NOMBRE_DIFICULTAD[destino]}»`, motivos, acciones: ['subir', 'mantener'], destino };
  }

  // 8) Mantener (con el motivo real).
  const motivos: string[] = [];
  if (bloqueoVolumen) motivos.push('Haces más series de las previstas sin mejorar tu peso: más volumen no es más progreso. Mejor mantener.');
  else if (fuerzaBaja) motivos.push('Tu mejor peso ha bajado un poco: mantén la dificultad y revisa descanso y comida.');
  else if (muchosEstancados) motivos.push(`${r.estancados.length} ejercicios llevan varios entrenos sin mejorar: antes de subir, dale tiempo.`);
  else if (s.respuestas < UMBRALES.respuestasParaSubir)
    motivos.push(`Cuando me cuentes cómo te sientes tras entrenar (llevo ${s.respuestas} de ${UMBRALES.respuestasParaSubir} respuestas) podré valorar si subir.`);
  else motivos.push('Tu constancia y tus sensaciones encajan con tu nivel actual.');
  return { ...base, tipo: 'mantener', titulo: `Mantén «${nombre}»`, motivos, acciones: [], informativa: true };
}

// ---------- Acciones: solo se ejecutan cuando la persona pulsa un botón ----------

// Cambia la dificultad. Toca ÚNICAMENTE `perfil.dificultad` (y, si lo aceptas, el plan del coach). No cambia tu nivel
// físico, tu XP ni tus entrenos. Una rutina propia nunca se modifica.
export function aplicarCambioDificultad(d: Datos, nueva: Nivel, aplicarAlPlan: boolean, ahora = Date.now()): Datos {
  const perfil = d.perfil;
  if (!perfil || nueva === dificultadDe(perfil)) return d;
  return {
    ...d,
    perfil: { ...perfil, dificultad: nueva, dificultadConfirmada: true },
    rutinas: aplicarAlPlan ? reajustarPlan(d, nueva).rutinas : d.rutinas,
    ajustes: { ...d.ajustes, dificultad: { cambio: ahora } },
  };
}

// «Mantener» en la dificultad actual: cuenta como elegirla (ya no se te preguntará al rehacer el plan) y no se vuelve a
// proponer un cambio durante unas semanas. No cambia nada más.
export function mantenerDificultad(d: Datos, ahora = Date.now()): Datos {
  const perfil = d.perfil;
  const base = perfil ? { ...d, perfil: { ...perfil, dificultad: dificultadDe(perfil), dificultadConfirmada: true } } : d;
  return silenciarRecomendacion(base, ahora);
}

// Silenciar la sugerencia sin más (no cuenta como elegir).
export function silenciarRecomendacion(d: Datos, ahora = Date.now()): Datos {
  return { ...d, ajustes: { ...d.ajustes, dificultad: { ...d.ajustes?.dificultad, silenciarHasta: ahora + UMBRALES.diasSilencio * DIA } } };
}

// Guarda cómo te sentó un entreno (solo ese entreno).
export function registrarSensacion(d: Datos, idSesion: string, sensacion: Sensacion | undefined, dolor: boolean | undefined): Datos {
  if (!d.sesiones.some((x) => x.id === idSesion)) return d;
  return {
    ...d,
    sesiones: d.sesiones.map((x) => {
      if (x.id !== idSesion) return x;
      const { sensacion: _s, dolor: _d, ...resto } = x;
      return { ...resto, ...(sensacion ? { sensacion } : {}), ...(dolor ? { dolor: true } : {}) };
    }),
  };
}

// Resumen para Progreso: solo si hay respuestas suficientes (no se muestra una estadística con 1 o 2 datos).
export function resumenSensaciones(d: Datos, ahora = Date.now()) {
  const s = senales(d, ahora);
  if (s.respuestas < 3) return null;
  return { n: s.respuestas, facil: s.facil, bien: s.bien, duro: s.duro, dolores: s.dolor };
}
