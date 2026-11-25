// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Versión de la app, registro de novedades y comprobación de «hay una versión nueva».
// La versión debe coincidir con `expo.version` de app.json (lo comprueba scripts/lanzamiento.mjs y una prueba).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const VERSION = '1.0.0-beta.1';
export const NOMBRE_APP = 'FORJA BETA';

export type CambioNovedad = { tipo: 'nuevo' | 'mejora' | 'arreglo'; texto: string };
export type Novedad = { version: string; fecha: string; titulo: string; cambios: CambioNovedad[] };

// La más reciente primero. Cada versión publicada añade aquí su entrada (es lo que ven las personas en «Qué hay de nuevo»).
export const NOVEDADES: Novedad[] = [
  {
    version: '1.0.0-beta.1',
    fecha: '2026-11-18',
    titulo: 'FORJA BETA llega',
    cambios: [
      { tipo: 'nuevo', texto: 'Nivel FORJA (de Chispa a Acero), atributos y misiones diarias opcionales, sin penalizaciones.' },
      { tipo: 'nuevo', texto: 'Dificultad independiente de tu nivel físico y sugerencias para subir, mantener o bajar. Tú decides siempre.' },
      { tipo: 'nuevo', texto: 'ARENA: rankings y retos con tus amigos. No hay ranking público: en el ranking solo te ven los amigos que aceptas; en un reto, los demás participantes ven tu progreso.' },
      { tipo: 'nuevo', texto: 'Cuentas con sincronización entre dispositivos: lo que registras en el móvil y en el ordenador se une sin pisarse.' },
      { tipo: 'nuevo', texto: 'Ayuda y opiniones dentro de la app: cuéntanos errores, sugerencias o problemas con tus entrenos, con una captura de pantalla opcional (se limpia en tu dispositivo y es privada).' },
      { tipo: 'mejora', texto: 'Privacidad: «cómo ha ido» y «me dolió algo» solo se guardan en tu cuenta si lo activas (es opcional) y puedes retirarlo cuando quieras: se borran las respuestas, también en tus otros dispositivos cuando vuelven a sincronizar.' },
      { tipo: 'mejora', texto: 'Copia automática de tus datos antes de empezar con la beta, para no perder nunca lo que ya tenías.' },
      { tipo: 'mejora', texto: 'Las actualizaciones llegan más rápido y sin dejar versiones antiguas guardadas.' },
    ],
  },
];

const CLAVE_VISTA = 'mi-gym:novedades-vista';

export async function hayNovedadesSinVer(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CLAVE_VISTA)) !== NOVEDADES[0].version;
  } catch {
    return false;
  }
}
export const marcarNovedadesVistas = () => AsyncStorage.setItem(CLAVE_VISTA, NOVEDADES[0].version).catch(() => {});

// Compara la versión que está publicada (version.json, que se genera al compilar) con la que está ejecutándose.
// Solo en la web ya publicada. Sin conexión o ante cualquier fallo, no avisa de nada.
export type EstadoVersion = { hayNueva: boolean; obligatoria: boolean; publicada: string | null };
export async function comprobarVersion(url = 'version.json'): Promise<EstadoVersion> {
  const nada: EstadoVersion = { hayNueva: false, obligatoria: false, publicada: null };
  if (Platform.OS !== 'web' || typeof fetch === 'undefined') return nada;
  try {
    const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return nada;
    const j = (await r.json()) as { version?: unknown; minima?: unknown };
    if (typeof j.version !== 'string' || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(j.version)) return nada;
    const obligatoria = typeof j.minima === 'string' && /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(j.minima) && compararVersiones(VERSION, j.minima) < 0;
    return { hayNueva: j.version !== VERSION && compararVersiones(VERSION, j.version) < 0, obligatoria, publicada: j.version };
  } catch {
    return nada;
  }
}

// «1.0.0-beta.2» > «1.0.0-beta.1» > «1.0.0-alpha»; sin sufijo es posterior a cualquier sufijo de la misma versión.
export function compararVersiones(a: string, b: string): number {
  const [na, pa = ''] = a.split('-');
  const [nb, pb = ''] = b.split('-');
  const x = na.split('.').map(Number);
  const y = nb.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  if (pa === pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  const sa = pa.split('.');
  const sb = pb.split('.');
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const p = sa[i] ?? '';
    const q = sb[i] ?? '';
    if (p === q) continue;
    const np = Number(p);
    const nq = Number(q);
    if (p !== '' && q !== '' && !Number.isNaN(np) && !Number.isNaN(nq)) return np < nq ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}
