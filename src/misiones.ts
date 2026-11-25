// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Misiones del día (Fase 1, solo local). Son una VISTA del día, no un sistema de puntos:
// no dan XP, omitirlas o descansar no resta nada y nunca salen del móvil.
// Entreno, proteína y ánimo se deducen de tus datos; lo único que se guarda es lo que omites o marcas a mano.
import { Datos, claveDia } from './datos';
import { dolorReciente } from './adaptacion';
import { nutricion } from './reglas';

export type EstadoMision = 'pendiente' | 'hecha' | 'omitida';
export type IdMision = 'entrenar' | 'descansar' | 'proteina' | 'calentar' | 'animo';
export type Mision = {
  id: IdMision;
  icono: string;
  titulo: string;
  detalle: string;
  estado: EstadoMision;
  automatica: boolean; // true = se marca sola según tus datos (no se puede marcar a mano)
};

const DIA = 86400000;
const DIAS_GUARDADOS = 14;
const diaSemana = (t: number) => (new Date(t).getDay() + 6) % 7;

export const esDiaDeEntreno = (d: Datos, ahora = Date.now()) => {
  if (!d.perfil) return false;
  const dia = diaSemana(ahora);
  return (d.perfil.diasSemana ?? []).includes(dia) || d.rutinas.some((r) => r.deCoach && r.dia === dia);
};

export function misionesHoy(d: Datos, ahora = Date.now()): Mision[] {
  if (!d.perfil) return [];
  const hoy = claveDia(ahora);
  const omitidas = d.misiones?.omitidas?.[hoy] ?? [];
  const hechas = d.misiones?.hechas?.[hoy] ?? [];
  const estado = (id: IdMision, hecha: boolean): EstadoMision => (hecha || hechas.includes(id) ? 'hecha' : omitidas.includes(id) ? 'omitida' : 'pendiente');
  const entrenoHoy = d.sesiones.some((s) => claveDia(s.fecha) === hoy);
  const toca = esDiaDeEntreno(d, ahora);
  const plan = d.rutinas.find((r) => r.deCoach && r.dia === diaSemana(ahora));
  const animo = d.animo?.[hoy];
  const ligero = !!animo && animo.sueno + animo.energia <= 1; // mismo criterio que el día ligero
  const lista: Mision[] = [];

  if (entrenoHoy) {
    lista.push({ id: 'entrenar', icono: '💪', titulo: 'Entrenar hoy', detalle: 'Entreno guardado. ¡Buen trabajo!', estado: 'hecha', automatica: true });
  } else if (toca) {
    lista.push({
      id: 'entrenar', icono: '💪', titulo: 'Entrenar hoy',
      detalle: dolorReciente(d, ahora)
        ? 'Marcaste molestias hace poco: si te duele algo, no entrenes y descansa. Omitir está bien.'
        : `${plan ? `Hoy toca ${plan.nombre}. ` : ''}${ligero ? 'Hoy en versión ligera. ' : ''}Si hoy no es el día, omitir está bien.`,
      estado: estado('entrenar', false), automatica: false,
    });
  } else {
    lista.push({ id: 'descansar', icono: '🛌', titulo: 'Descansar', detalle: 'Hoy toca descansar: ya cuenta como hecho.', estado: 'hecha', automatica: true });
  }

  const meta = nutricion(d.perfil).proteina;
  const prot = (d.comida[hoy] ?? []).reduce((a, x) => a + x.proteina, 0);
  lista.push({
    id: 'proteina', icono: '🥩', titulo: 'Llegar a tu proteína',
    detalle: prot ? `Llevas ${Math.round(prot)} de ${meta} g.` : `Tu meta de hoy: ${meta} g. Registra tus comidas para verlo.`,
    estado: estado('proteina', prot >= meta), automatica: prot >= meta,
  });

  if (toca && !entrenoHoy) {
    lista.push({ id: 'calentar', icono: '🔥', titulo: 'Calentamiento', detalle: '5 minutos de movilidad suave antes de empezar.', estado: estado('calentar', false), automatica: false });
    lista.push({
      id: 'animo', icono: '🙂', titulo: '¿Cómo te sientes?',
      detalle: animo ? 'Ya lo registraste hoy.' : 'Te lo preguntaré al empezar el entreno.',
      estado: estado('animo', !!animo), automatica: !!animo,
    });
  }
  return lista;
}

// Cambia el estado de una misión (a mano). Solo guarda los últimos 14 días.
export function marcarMision(d: Datos, id: IdMision, nuevo: EstadoMision, ahora = Date.now()): Datos {
  const hoy = claveDia(ahora);
  const sin = (l: string[] | undefined) => (l ?? []).filter((x) => x !== id);
  const omitidas = { ...(d.misiones?.omitidas ?? {}) };
  const hechas = { ...(d.misiones?.hechas ?? {}) };
  omitidas[hoy] = nuevo === 'omitida' ? [...sin(omitidas[hoy]), id] : sin(omitidas[hoy]);
  hechas[hoy] = nuevo === 'hecha' ? [...sin(hechas[hoy]), id] : sin(hechas[hoy]);
  const limite = claveDia(ahora - DIAS_GUARDADOS * DIA);
  for (const mapa of [omitidas, hechas]) for (const k of Object.keys(mapa)) if (k < limite || mapa[k].length === 0) delete mapa[k];
  return { ...d, misiones: { omitidas, hechas } };
}
