// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Sistema de diseño de Forja: colores, tamaños de texto, radios y espacios en un solo sitio.
// La apariencia se lee al arrancar (síncrono en web) para que todas las hojas de estilo
// se creen ya con el tema elegido. Cambiar de tema guarda la preferencia y recarga la app.
import { Platform } from 'react-native';

export type Modo = 'auto' | 'oscuro' | 'claro';
export type Apariencia = {
  tema: string; // id de TEMAS o 'personal'
  personal: string | null; // color propio (#RRGGBB)
  modo: Modo;
  texto: number; // escala del texto: 0.9 · 1 · 1.15 · 1.3
};

export const APARIENCIA_ORIGINAL: Apariencia = { tema: 'verde', personal: null, modo: 'oscuro', texto: 1 };

// Cada tema define su acento para fondo oscuro y para fondo claro (más oscuro, para que se lea).
export const TEMAS: { id: string; nombre: string; oscuro: string; claro: string }[] = [
  { id: 'verde', nombre: 'Verde Forja', oscuro: '#B8F34A', claro: '#3C7D12' },
  { id: 'oro', nombre: 'Oro', oscuro: '#F2C14E', claro: '#8F6400' },
  { id: 'azul', nombre: 'Azul', oscuro: '#5AA9FF', claro: '#1A62C4' },
  { id: 'morado', nombre: 'Morado', oscuro: '#B48CFF', claro: '#6B3FD1' },
  { id: 'coral', nombre: 'Rojo coral', oscuro: '#FF7A6B', claro: '#C2382A' },
  { id: 'turquesa', nombre: 'Turquesa', oscuro: '#3DD9C5', claro: '#0B7C6F' },
  { id: 'naranja', nombre: 'Naranja', oscuro: '#FF9F43', claro: '#B05A00' },
];

export const TAMANOS_TEXTO: [number, string][] = [
  [0.9, 'Pequeño'],
  [1, 'Normal'],
  [1.15, 'Grande'],
  [1.3, 'Muy grande'],
];

const CLAVE = 'forja:apariencia';

// ---------- Color ----------
const hexOk = (h: string | null | undefined): h is string => !!h && /^#[0-9a-f]{6}$/i.test(h);
function aRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const aHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');

function aHsl(h: string): [number, number, number] {
  const [r, g, b] = aRgb(h).map((x) => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, s, l];
}
function deHsl(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return aHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

export function luminancia(h: string) {
  const [r, g, b] = aRgb(h).map((x) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a: string, b: string) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// Ajusta la luminosidad hasta tener buen contraste (mínimo 4,5:1) con el fondo Y con las tarjetas.
function legible(acento: string, fondos: string[], oscuro: boolean) {
  const [h, s, l0] = aHsl(acento);
  let l = l0;
  const peor = (x: string) => Math.min(...fondos.map((f) => contraste(x, f)));
  for (let i = 0; i < 50 && peor(deHsl(h, s, l)) < 4.6; i++) l += oscuro ? 0.02 : -0.02;
  return deHsl(h, s, Math.max(0, Math.min(1, l)));
}

const mezcla = (a: string, b: string, t: number) => {
  const [x, y] = [aRgb(a), aRgb(b)];
  return aHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
};

// ---------- Paleta ----------
const BASE_OSCURA = { fondo: '#0E0F13', tarjeta: '#181A20', campo: '#24272F', borde: '#30343E', texto: '#F5F5F2', suave: '#A4A9B6', verde: '#5BD6A0', rojo: '#FF7A70' };
const BASE_CLARA = { fondo: '#F3F4F6', tarjeta: '#FFFFFF', campo: '#E9EBEF', borde: '#D8DBE1', texto: '#14161B', suave: '#5A606D', verde: '#147A4E', rojo: '#C53030' };

export function esOscuro(a: Apariencia) {
  if (a.modo === 'auto') {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return true;
    return !window.matchMedia('(prefers-color-scheme: light)').matches;
  }
  return a.modo === 'oscuro';
}

export function paleta(a: Apariencia) {
  const oscuro = esOscuro(a);
  const base = oscuro ? BASE_OSCURA : BASE_CLARA;
  const t = TEMAS.find((x) => x.id === a.tema) ?? TEMAS[0];
  const bruto = a.tema === 'personal' && hexOk(a.personal) ? a.personal : oscuro ? t.oscuro : t.claro;
  const acento = legible(bruto, [base.tarjeta, base.fondo, base.campo], oscuro);
  const sobre = contraste(acento, '#111111') >= contraste(acento, '#FFFFFF') ? '#111111' : '#FFFFFF';
  return {
    ...base,
    oscuro,
    oro: acento, // acento del tema (el nombre se mantiene por compatibilidad)
    sobreOro: sobre,
    acentoSuave: mezcla(base.tarjeta, acento, oscuro ? 0.16 : 0.12), // fondos de chips y avisos
    nivel1: mezcla(base.campo, acento, 0.35), // escala de intensidad (mapa muscular, gráficos)
    nivel2: mezcla(base.campo, acento, 0.65),
    nivel3: acento,
    placeholder: oscuro ? '#747987' : '#8A8F9B',
    velo: oscuro ? 'rgba(0,0,0,.72)' : 'rgba(20,22,27,.45)',
    oroMedalla: oscuro ? '#F5C542' : '#A87800',
    plata: oscuro ? '#C9CED8' : '#6F7785',
    bronce: oscuro ? '#D79A62' : '#9A5A24',
  };
}

// ---------- Lectura y guardado ----------
function leer(): Apariencia {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return APARIENCIA_ORIGINAL;
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (!v) return APARIENCIA_ORIGINAL;
    return {
      tema: typeof v.tema === 'string' ? v.tema : 'verde',
      personal: hexOk(v.personal) ? v.personal : null,
      modo: ['auto', 'oscuro', 'claro'].includes(v.modo) ? v.modo : 'oscuro',
      texto: TAMANOS_TEXTO.some(([n]) => n === v.texto) ? v.texto : 1,
    };
  } catch {
    return APARIENCIA_ORIGINAL;
  }
}

export const apariencia: Apariencia = leer();
export const c = paleta(apariencia);
export const tam = (n: number) => Math.round(n * apariencia.texto); // tamaño de texto escalado

export const radio = { s: 10, m: 14, l: 20, xl: 24, pildora: 999 };
export const espacio = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };

export const mismaApariencia = (a: Apariencia, b: Apariencia) =>
  a.tema === b.tema && a.modo === b.modo && a.texto === b.texto && (a.tema !== 'personal' || a.personal === b.personal);

export function guardarApariencia(a: Apariencia, recargar = true) {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {}
  if (recargar && !mismaApariencia(a, apariencia)) window.location.reload();
}

// Colores del navegador (barra de estado y fondo) acordes al tema.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  try {
    document.documentElement.style.backgroundColor = c.fondo;
    document.body && (document.body.style.backgroundColor = c.fondo);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.fondo);
    document.documentElement.style.colorScheme = c.oscuro ? 'dark' : 'light';
    if (apariencia.modo === 'auto' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => window.location.reload());
    }
  } catch {}
}
