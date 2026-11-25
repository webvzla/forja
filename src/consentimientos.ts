// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Consentimiento INDEPENDIENTE, opcional y revocable para guardar «cómo ha ido» y «me dolió algo» (datos que pueden ser de salud).
// Funciones puras, sin red. NO tocan ninguna regla, fórmula ni umbral de las Fases 1-3: solo deciden si esos dos datos se
// preguntan y se guardan. Sin ellos el motor de sugerencias ve «cero respuestas» y usa su rama habitual de «necesito más datos».
//
// Reglas (lo aprobado, «opción A»):
//   · Sin cuenta: se pregunta y se guarda como siempre (queda solo en el dispositivo; FORJA no lo recibe).
//   · Con cuenta: SOLO si la persona lo ha consentido. Sin decisión o con «no», no se pregunta, no se guarda y no se sube.
//   · Retirar el consentimiento borra las respuestas ya guardadas, y ninguna respuesta dada bajo un permiso retirado vuelve a
//     guardarse ni a subirse, aunque después se dé un permiso nuevo.
// La decisión vive en `ajustes.consentimientos.sensaciones` y, al crear la cuenta, también en los metadatos de la cuenta
// (`consentimiento_sensaciones`), que son la prueba del consentimiento.
// Al fusionar NO gana «el último ajuste guardado», sino la decisión que la persona tomó más tarde (`ts`); con empate gana el «no».
// `retirado` recuerda la última retirada y cada respuesta anota bajo qué permiso se dio (`permiso`): así una respuesta de antes
// de la retirada (o de un dispositivo que no la conocía) se descarta sin depender de los relojes.
import type { Datos } from './datos';

export const VERSION_CONSENTIMIENTO_SENSACIONES = 1;

export type DecisionSensaciones = { valor: boolean; v: number; ts: number; retirado?: number };

export const decisionSensaciones = (d: Datos): DecisionSensaciones | undefined => d.ajustes?.consentimientos?.sensaciones;

// ¿Se pregunta y se guarda? (único punto donde se decide)
export const sensacionesPermitidas = (d: Datos, conCuenta: boolean): boolean => !conCuenta || decisionSensaciones(d)?.valor === true;

export const respuestasGuardadas = (d: Datos): number => d.sesiones.filter((s) => !!s.sensacion || !!s.dolor).length;

const conSensaciones = (d: Datos, dec: DecisionSensaciones): Datos => ({ ...d, ajustes: { ...d.ajustes, consentimientos: { ...d.ajustes?.consentimientos, sensaciones: dec } } });

// Decisión tomada AHORA por la persona. Su momento es siempre posterior al de la decisión que sustituye, aunque el reloj vaya mal.
export function fijarSensaciones(d: Datos, valor: boolean, ahora = Date.now()): Datos {
  const actual = decisionSensaciones(d);
  if (actual && actual.valor === valor) return d;
  const ts = Math.max(ahora, (actual?.ts ?? 0) + 1);
  const retirado = valor ? actual?.retirado : ts;
  return conSensaciones(d, { valor, v: VERSION_CONSENTIMIENTO_SENSACIONES, ts, ...(retirado ? { retirado } : {}) });
}

// Une dos versiones de la decisión (otro dispositivo, la nube…): gana la tomada más tarde; con empate, el «no». La retirada más
// reciente no se olvida nunca. No depende del orden ni de las repeticiones.
export function unirDecisiones(a?: DecisionSensaciones, b?: DecisionSensaciones): DecisionSensaciones | undefined {
  if (!a || !b) return a ?? b;
  const gana = a.ts !== b.ts ? (a.ts > b.ts ? a : b) : a.valor !== b.valor ? (a.valor ? b : a) : a.v >= b.v ? a : b;
  const retirado = Math.max(a.retirado ?? 0, b.retirado ?? 0);
  return retirado && gana.retirado !== retirado ? { ...gana, retirado } : gana;
}

export function conDecision(d: Datos, otra: DecisionSensaciones | undefined): Datos {
  const actual = decisionSensaciones(d);
  const unida = unirDecisiones(actual, otra);
  return !unida || unida === actual ? d : conSensaciones(d, unida);
}

// Retirada anotada en este dispositivo aparte de los datos (sobrevive a cerrar sesión): ver App.tsx.
export const claveRetirada = (idUsuario: string) => `forja:retirada-sensaciones:${idUsuario}`;
export const conRetirada = (d: Datos, momento: number): Datos =>
  Number.isFinite(momento) && momento > 0 ? conDecision(d, { valor: false, v: VERSION_CONSENTIMIENTO_SENSACIONES, ts: momento, retirado: momento }) : d;

// Quita las respuestas de los entrenos que no cumplan `conservar`. Devuelve LA MISMA referencia si no quita nada.
function quitarDonde(d: Datos, conservar: (s: Datos['sesiones'][number]) => boolean): Datos {
  const sobra = (s: Datos['sesiones'][number]) => ('sensacion' in s || 'dolor' in s) && !conservar(s);
  if (!d.sesiones.some(sobra)) return d;
  return {
    ...d,
    sesiones: d.sesiones.map((s) => {
      if (!sobra(s)) return s;
      const { sensacion: _sensacion, dolor: _dolor, permiso: _permiso, ...resto } = s;
      return resto;
    }),
  };
}

// Quita «cómo ha ido» y «me dolió algo» de todos los entrenos.
export const quitarSensaciones = (d: Datos): Datos => quitarDonde(d, () => false);

// Lo único que una CUENTA puede conservar y subir: nada sin permiso; y, si alguna vez se retiró, solo lo respondido con un
// permiso posterior a la retirada.
export function sinRespuestasNoPermitidas(d: Datos): Datos {
  const dec = decisionSensaciones(d);
  if (dec?.valor !== true) return quitarSensaciones(d);
  const retirado = dec.retirado;
  return retirado ? quitarDonde(d, (s) => (s.permiso ?? 0) > retirado) : d;
}

// Anota bajo qué permiso se ha respondido en ese entreno (se llama justo al guardar la respuesta).
export function marcarPermiso(d: Datos, idSesion: string): Datos {
  const dec = decisionSensaciones(d);
  if (dec?.valor !== true) return d;
  return { ...d, sesiones: d.sesiones.map((s) => (s.id === idSesion && (s.sensacion || s.dolor) ? { ...s, permiso: dec.ts } : s)) };
}

// Una copia restaurada nunca cambia el consentimiento: se queda la decisión que había antes de restaurar (o ninguna).
export function conservarDecision(restaurado: Datos, actual: Datos): Datos {
  const { sensaciones: _deLaCopia, ...otros } = restaurado.ajustes?.consentimientos ?? {};
  const dec = decisionSensaciones(actual);
  if (!dec && !_deLaCopia) return restaurado;
  return { ...restaurado, ajustes: { ...restaurado.ajustes, consentimientos: { ...otros, ...(dec ? { sensaciones: dec } : {}) } } };
}

// Datos que se importan desde otra cuenta: sin su consentimiento y sin sus respuestas.
export const sinConsentimientoAjeno = (otro: Datos): Datos => conservarDecision(quitarSensaciones(otro), { ...otro, ajustes: {} });

// Decisión que la persona tomó al crear la cuenta (metadatos de Supabase). Acepta cualquier cosa y devuelve null si no hay nada fiable.
export function decisionDeMetadatos(meta: unknown): DecisionSensaciones | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  const x = m.consentimiento_sensaciones;
  if (x === undefined || x === null) return null;
  const valor = x === true || (typeof x === 'number' && x > 0);
  if (!valor && !(x === false || x === 0)) return null; // un valor raro no se interpreta
  const fecha = typeof m.aceptado === 'string' ? Date.parse(m.aceptado) : NaN;
  // Se fecha en el REGISTRO, nunca «ahora»: así cualquier decisión posterior gana. Sin fecha cuenta como la más antigua.
  return { valor, v: typeof x === 'number' && x > 0 ? x : VERSION_CONSENTIMIENTO_SENSACIONES, ts: Number.isFinite(fecha) && fecha > 0 ? fecha : 1 };
}

// Si todavía no hay decisión guardada en los datos y la cuenta trae una (la del registro), se adopta.
export function conDecisionInicial(d: Datos, meta: unknown): Datos {
  if (decisionSensaciones(d)) return d;
  const dec = decisionDeMetadatos(meta);
  return dec ? conSensaciones(d, dec) : d;
}

// Al entrar en la cuenta, antes de preguntar o subir nada.
//   · `nubeLeida` false (no se pudo leer o es de una versión más nueva): NO se hereda el «sí» del registro, porque puede estar retirado.
//   · `propios`: los datos del dispositivo son de esta cuenta (o de nadie); su decisión cuenta aunque no haya nada más guardado.
//   · `retirada`: retirada anotada en este dispositivo que quizá no llegó a la nube.
// Las respuestas cubiertas por una retirada se quitan sin preguntar.
export function prepararAlEntrar(final: Datos, o: { local: Datos; propios: boolean; nubeLeida: boolean; metadatos: unknown; retirada: number }): Datos {
  let d = o.nubeLeida ? conDecisionInicial(final, o.metadatos) : final;
  if (o.propios) d = conDecision(d, decisionSensaciones(o.local));
  d = conRetirada(d, o.retirada);
  return decisionSensaciones(d)?.retirado ? sinRespuestasNoPermitidas(d) : d;
}

// Con cuenta y sin consentimiento NO puede haber respuestas guardadas. Devuelve lo que habría que hacer.
export const hayRespuestasSinConsentimiento = (d: Datos, conCuenta: boolean) => conCuenta && !sensacionesPermitidas(d, true) && respuestasGuardadas(d) > 0;
