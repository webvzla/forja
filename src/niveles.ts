// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Los TRES conceptos de FORJA, siempre independientes (ninguno cambia a otro automáticamente):
//  · Nivel FORJA  → progresión del juego (Chispa · Brasa · Llama · Acero). Sale de tu XP (xp.ts).
//  · Nivel físico → tu propia valoración de tu condición (principiante · intermedio · avanzado). Campo `perfil.nivel`.
//  · Dificultad   → la intensidad que ELIGES para tus entrenos (Suave · Media · Exigente). Campo `perfil.dificultad`.
// La dificultad usa los mismos tres valores que `Nivel` para ser compatible con lo ya guardado, pero se muestra con
// otros nombres para que nadie la confunda con su nivel físico.
import { Nivel, Perfil, dificultadDe, dificultadPorDefecto } from './datos';
import { planCambia } from './reglas';

export const DIFICULTADES: Nivel[] = ['principiante', 'intermedio', 'avanzado'];
export const NOMBRE_DIFICULTAD: Record<Nivel, string> = { principiante: 'Suave', intermedio: 'Media', avanzado: 'Exigente' };
export const NOMBRE_NIVEL_FISICO: Record<Nivel, string> = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };

// Qué implica cada una, sin tecnicismos.
export const EXPLICA_DIFICULTAD: Record<Nivel, string> = {
  principiante: 'Entrenos más llevaderos: 3 series en los ejercicios principales y variantes más sencillas.',
  intermedio: 'El punto de partida habitual: 4 series en los ejercicios principales y todos los ejercicios disponibles.',
  avanzado: 'Como Media, con una serie extra en el primer ejercicio de cada día. Más exigente: solo si te sobra energía.',
};

export type Direccion = 'bajar' | 'mantener' | 'subir';
export const TEXTO_DIRECCION: Record<Direccion, string> = {
  bajar: 'Entrenos algo más ligeros. Buena opción si te cuesta cumplir o terminas agotado.',
  mantener: 'Seguir como estás. Si no hay motivo para cambiar, es la mejor opción.',
  subir: 'Un poco más de exigencia. Solo si cumples tu semana y terminas con ganas de más.',
};

export const paso = (actual: Nivel, dir: Direccion): Nivel => {
  const i = DIFICULTADES.indexOf(actual) + (dir === 'subir' ? 1 : dir === 'bajar' ? -1 : 0);
  return DIFICULTADES[Math.max(0, Math.min(DIFICULTADES.length - 1, i))];
};
export const puede = (actual: Nivel, dir: Direccion) => paso(actual, dir) !== actual || dir === 'mantener';

export const AVISO_GENERAL = 'Sugerencia general. FORJA no conoce tu estado de salud ni mide tu capacidad: tú decides.';

// Al guardar el perfil (formulario): la dificultad se FIJA para que cambiar el nivel físico no la cambie sola.
//  · Perfil nuevo: punto de partida según tu nivel físico, pero «avanzado» empieza en Media (nunca Exigente sin elegirla).
//  · Perfil existente: se conserva la que tenías (aunque aún no la hubieras elegido).
// Esto NO la marca como elegida: si nunca la has elegido tú, se te pregunta antes de rehacer el plan.
export const fijarDificultad = (previo: Perfil | null | undefined, nuevo: Perfil): Perfil => ({
  ...nuevo,
  dificultad: previo ? dificultadDe(previo) : (nuevo.dificultad ?? dificultadPorDefecto(nuevo.nivel)),
  dificultadConfirmada: previo ? previo.dificultadConfirmada : nuevo.dificultadConfirmada,
});

// ¿Hay que pedirte que elijas la dificultad antes de guardar? Sí, si el cambio rehace el plan del coach y tú nunca la has elegido.
export const requiereElegirDificultad = (previo: Perfil | null | undefined, nuevo: Perfil) => planCambia(previo, nuevo) && !previo?.dificultadConfirmada;
