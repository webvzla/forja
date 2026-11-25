// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Fusión segura de TODOS los datos entre dispositivos (entrenos, rutinas, comidas, despensa, peso, medidas, ajustes…).
// Funciones puras y SIN red: la parte de red está en subida.ts / nube.ts.
//
// Problema que resuelve: antes solo el libro de XP se fusionaba; el resto del documento lo sustituía el último
// dispositivo que guardaba, y al iniciar sesión mandaba la nube sobre lo local. Dos dispositivos podían perder
// entrenos o comidas. Aquí cada dato se fusiona por su identificador:
//   · Elementos con identificador (entrenos, rutinas, comidas…): unión. Si el mismo elemento está en los dos
//     lados, gana el modificado más tarde (marca `mod`); si uno lo borró, queda una «lápida» (`borrados`) y el
//     borrado gana salvo que el elemento se haya editado DESPUÉS de borrarlo.
//   · Campos sueltos (perfil, preferencias, ajustes…): gana el último cambio de ese campo.
//   · XP: como siempre, el máximo gana (sincronizacion.ts).
// La fusión es conmutativa, asociativa e idempotente (el orden y las repeticiones no importan; solo el ORDEN VISUAL de
// las listas puede variar: se conserva el de la base y los elementos nuevos se añaden detrás; los entrenos van por fecha).
// Las marcas y las lápidas viven en `ajustes.sync` y se rellenan en UN solo sitio (`registrarCambios`), comparando el
// estado anterior y el nuevo, sin tocar cada pantalla.
import { unirDecisiones } from './consentimientos';
import { Datos, claveDia } from './datos';
import { canonico, fusionarLibros, mismoContenido } from './sincronizacion';

// Versión del formato de marcas. Una app más antigua que el formato que encuentra en la nube NO escribe encima.
export const FORMATO_SYNC = 1;
const DIA = 86400000;
const CADUCA_MARCA = 120 * DIA; // marcas de elementos y lápidas se olvidan pasado este tiempo

export type LibroSync = { v: number; mod: Record<string, number>; borrados: Record<string, number> };
type Rec = Record<string, number>;

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const numero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

// Acepta lo que venga (nada, otra versión o datos dañados) y devuelve siempre un libro válido.
export function normalizarSync(x: unknown): LibroSync {
  const l: LibroSync = { v: FORMATO_SYNC, mod: {}, borrados: {} };
  if (!esObjeto(x)) return l;
  if (numero(x.v)) l.v = Math.floor(x.v);
  for (const campo of ['mod', 'borrados'] as const) {
    const o = x[campo];
    if (esObjeto(o)) for (const [k, v] of Object.entries(o)) if (typeof k === 'string' && k.length < 200 && numero(v)) l[campo][k] = v;
  }
  return l;
}

const maximo = (a: Rec, b: Rec): Rec => {
  const r: Rec = { ...a };
  for (const [k, v] of Object.entries(b)) if (v > (r[k] ?? 0)) r[k] = v;
  return r;
};
export const fusionarSync = (a: unknown, b: unknown): LibroSync => {
  const x = normalizarSync(a);
  const y = normalizarSync(b);
  return { v: Math.max(x.v, y.v), mod: maximo(x.mod, y.mod), borrados: maximo(x.borrados, y.borrados) };
};

// ¿Los datos de la nube vienen de una versión de la app más nueva que ésta? Entonces no se mezcla ni se escribe.
export const esquemaMasNuevo = (remoto: unknown) => {
  const s = esObjeto(remoto) && esObjeto(remoto.ajustes) && esObjeto(remoto.ajustes.sync) ? remoto.ajustes.sync.v : 0;
  return numero(s) && s > FORMATO_SYNC;
};

// ---------- Descripción de cada dato ----------
type Coleccion = 'rutinas' | 'sesiones' | 'recetasHechas' | 'sobras' | 'misAlimentos';
const POR_ID: Coleccion[] = ['rutinas', 'sesiones', 'recetasHechas', 'sobras', 'misAlimentos'];
type Mapa = 'agua' | 'animo' | 'precios';
const MAPAS: Mapa[] = ['agua', 'animo', 'precios'];
const SCALARES = ['perfil', 'preferencias', 'menu', 'voz', 'descanso', 'misiones'] as const;
const AJUSTES_PROPIOS = new Set(['xp', 'sync']); // el resto de `ajustes` se trata como campos sueltos

const idDe = (x: unknown) => (esObjeto(x) && (typeof x.id === 'string' || typeof x.id === 'number') ? String(x.id) : null);
const fechaDe = (x: unknown) => (esObjeto(x) && numero(x.fecha) ? x.fecha : 0);
const igual = (a: unknown, b: unknown) => a === b || canonico(a) === canonico(b);

// ---------- Registro de cambios (se llama al guardar, con el estado anterior y el nuevo) ----------
export function registrarCambios(prev: Datos, next: Datos, ahora = Date.now()): Datos {
  if (prev === next) return next;
  const l = fusionarSync(prev.ajustes?.sync, next.ajustes?.sync);
  const mod = { ...l.mod };
  const borrados = { ...l.borrados };
  const editado = (ruta: string) => { mod[ruta] = ahora; };
  const borrado = (ruta: string) => { delete mod[ruta]; borrados[ruta] = ahora; };
  const nuevoQueRevive = (ruta: string) => { if (borrados[ruta]) editado(ruta); }; // reaparece un id que se había borrado: gana el nuevo

  const comparar = <T,>(prefijo: string, antes: Map<string, T>, despues: Map<string, T>) => {
    for (const [k, v] of despues) {
      const ruta = `${prefijo}/${k}`;
      if (!antes.has(k)) nuevoQueRevive(ruta);
      else if (!igual(antes.get(k), v)) editado(ruta);
    }
    for (const k of antes.keys()) if (!despues.has(k)) borrado(`${prefijo}/${k}`);
  };
  const porId = (lista: unknown) => new Map<string, unknown>((Array.isArray(lista) ? lista : []).flatMap((x) => { const id = idDe(x); return id === null ? [] : [[id, x] as [string, unknown]]; }));

  for (const c of POR_ID) if (prev[c] !== next[c]) comparar(c, porId(prev[c]), porId(next[c]));
  if (prev.comida !== next.comida) {
    for (const dia of new Set([...Object.keys(prev.comida ?? {}), ...Object.keys(next.comida ?? {})]))
      if (prev.comida?.[dia] !== next.comida?.[dia]) comparar(`comida/${dia}`, porId(prev.comida?.[dia]), porId(next.comida?.[dia]));
  }
  if (prev.despensa !== next.despensa) {
    const porIng = (l: unknown) => new Map<string, unknown>((Array.isArray(l) ? l : []).flatMap((x) => (esObjeto(x) && typeof x.ing === 'string' ? [[x.ing, x] as [string, unknown]] : [])));
    comparar('despensa', porIng(prev.despensa), porIng(next.despensa));
  }
  for (const m of MAPAS) {
    if (prev[m] === next[m]) continue;
    const a = new Map(Object.entries(prev[m] ?? {}));
    const b = new Map(Object.entries(next[m] ?? {}));
    comparar(m, a, b);
  }
  for (const k of SCALARES) if (prev[k] !== next[k] && !igual(prev[k], next[k])) editado(k);
  for (const k of new Set([...Object.keys(prev.ajustes ?? {}), ...Object.keys(next.ajustes ?? {})])) {
    if (AJUSTES_PROPIOS.has(k)) continue;
    const a = (prev.ajustes as Record<string, unknown> | undefined)?.[k];
    const b = (next.ajustes as Record<string, unknown> | undefined)?.[k];
    if (a !== b && !igual(a, b)) editado(`ajustes.${k}`);
  }

  // Limpieza: lo antiguo se olvida (las marcas de campos sueltos, que no llevan «/», se conservan siempre).
  for (const [k, v] of Object.entries(mod)) if (k.includes('/') && v < ahora - CADUCA_MARCA) delete mod[k];
  for (const [k, v] of Object.entries(borrados)) if (v < ahora - CADUCA_MARCA) delete borrados[k];

  const nuevo: LibroSync = { v: l.v, mod, borrados };
  const actual = next.ajustes?.sync;
  if (actual && igual(actual, nuevo)) return next;
  if (!actual && !Object.keys(mod).length && !Object.keys(borrados).length) return next;
  return { ...next, ajustes: { ...next.ajustes, sync: nuevo } };
}

// ---------- Fusión ----------
type Elem<T> = { clave: string; valor: T };

// Fusiona dos conjuntos de elementos por clave con «gana el último cambio» y lápidas. Devuelve los elementos que
// siguen vivos (en el orden de `a`, seguidos de los nuevos de `b`) y las rutas que han quedado muertas.
function fusionarElementos<T>(prefijo: string, a: Elem<T>[], b: Elem<T>[], la: LibroSync, lb: LibroSync, intrinseco?: (v: T) => number) {
  const ma = new Map(a.map((e) => [e.clave, e.valor]));
  const mb = new Map(b.map((e) => [e.clave, e.valor]));
  const claves = [...ma.keys(), ...[...mb.keys()].filter((k) => !ma.has(k))];
  const vivos: Elem<T>[] = [];
  const muertos: string[] = [];
  for (const k of claves) {
    const ruta = `${prefijo}/${k}`;
    const cand: { v: T; sello: number }[] = [];
    if (ma.has(k)) cand.push({ v: ma.get(k)!, sello: Math.max(la.mod[ruta] ?? 0, intrinseco?.(ma.get(k)!) ?? 0) });
    if (mb.has(k)) cand.push({ v: mb.get(k)!, sello: Math.max(lb.mod[ruta] ?? 0, intrinseco?.(mb.get(k)!) ?? 0) });
    // Gana el sello mayor; con empate, el contenido «mayor» en orden canónico (determinista, sin depender del orden).
    cand.sort((x, y) => (y.sello !== x.sello ? y.sello - x.sello : canonico(y.v) < canonico(x.v) ? -1 : canonico(y.v) > canonico(x.v) ? 1 : 0));
    const ganador = cand[0];
    const lapida = Math.max(la.borrados[ruta] ?? 0, lb.borrados[ruta] ?? 0);
    if (lapida > 0 && ganador.sello <= lapida) muertos.push(ruta);
    else vivos.push({ clave: k, valor: ganador.v });
  }
  return { vivos, muertos };
}

const elementosId = (lista: unknown): Elem<unknown>[] => (Array.isArray(lista) ? lista : []).flatMap((x) => { const id = idDe(x); return id === null ? [] : [{ clave: id, valor: x }]; });
const sinId = (lista: unknown): unknown[] => (Array.isArray(lista) ? lista : []).filter((x) => idDe(x) === null);

function ganadorEscalar(ruta: string, va: unknown, vb: unknown, la: LibroSync, lb: LibroSync): unknown {
  const sa = la.mod[ruta] ?? 0;
  const sb = lb.mod[ruta] ?? 0;
  if (sa !== sb) return sa > sb ? va : vb;
  return canonico(va) >= canonico(vb) ? va : vb;
}

export function esVacio(d: Datos | null | undefined) {
  if (!d) return true;
  const hayComida = Object.values(d.comida ?? {}).some((x) => Array.isArray(x) && x.length);
  const rutinasPropias = (d.rutinas ?? []).some((r) => !r.ejemplo);
  return !d.perfil && !(d.sesiones?.length) && !hayComida && !(d.pesos?.length) && !(d.despensa?.length) && !(d.recetasHechas?.length) && !(d.misAlimentos?.length) && !rutinasPropias && !(d.sobras?.length) && !Object.keys(d.agua ?? {}).length;
}

// Fusiona `otro` (otro dispositivo, la nube o una copia) dentro de `base`. Devuelve LA MISMA referencia si no cambia nada.
export function fusionarDatos(base: Datos, otro?: Partial<Datos> | null): Datos {
  if (!otro || !esObjeto(otro)) return base;
  const la = normalizarSync(base.ajustes?.sync);
  const lb = normalizarSync((otro.ajustes as Datos['ajustes'] | undefined)?.sync);
  const muertos: string[] = [];
  const r: Record<string, unknown> = { ...base };

  for (const c of POR_ID) {
    const f = fusionarElementos(c, elementosId(base[c]), elementosId(otro[c]), la, lb, c === 'sesiones' ? fechaDe : undefined);
    muertos.push(...f.muertos);
    const lista = [...f.vivos.map((e) => e.valor), ...sinId(base[c])];
    r[c] = c === 'sesiones' ? (lista as { fecha: number; id: string }[]).sort((x, y) => y.fecha - x.fecha || (x.id < y.id ? -1 : 1)) : lista;
  }

  // Comidas por día: la clave de cada elemento es «día/id»
  const dias = new Set([...Object.keys(base.comida ?? {}), ...Object.keys(otro.comida ?? {})]);
  const comida: Datos['comida'] = {};
  for (const dia of dias) {
    const f = fusionarElementos(`comida/${dia}`, elementosId(base.comida?.[dia]), elementosId(otro.comida?.[dia]), la, lb);
    muertos.push(...f.muertos);
    const lista = [...f.vivos.map((e) => e.valor as Datos['comida'][string][number]), ...sinId(base.comida?.[dia]) as Datos['comida'][string]];
    comida[dia] = lista; // se conserva el día aunque quede vacío (así fusionar con uno mismo no cambia nada)
  }
  r.comida = comida;

  // Despensa (por alimento)
  const stock = (l: unknown): Elem<unknown>[] => (Array.isArray(l) ? l : []).flatMap((x) => (esObjeto(x) && typeof x.ing === 'string' ? [{ clave: x.ing, valor: x }] : []));
  const fd = fusionarElementos('despensa', stock(base.despensa), stock(otro.despensa), la, lb);
  muertos.push(...fd.muertos);
  r.despensa = fd.vivos.map((e) => e.valor);

  // Peso corporal (un valor por día; gana el más reciente)
  const porDia = (l: unknown): Elem<unknown>[] => (Array.isArray(l) ? l : []).flatMap((x) => (numero(fechaDe(x)) ? [{ clave: claveDia(fechaDe(x)), valor: x }] : []));
  r.pesos = fusionarElementos('pesos', porDia(base.pesos), porDia(otro.pesos), la, lb, fechaDe).vivos.map((e) => e.valor).sort((x, y) => fechaDe(x) - fechaDe(y));
  // Medidas por zona
  const medidas: Datos['medidas'] = {};
  for (const zona of new Set([...Object.keys(base.medidas ?? {}), ...Object.keys(otro.medidas ?? {})])) {
    const lista = fusionarElementos(`medidas/${zona}`, porDia(base.medidas?.[zona]), porDia(otro.medidas?.[zona]), la, lb, fechaDe).vivos.map((e) => e.valor as { fecha: number; max: number }).sort((x, y) => x.fecha - y.fecha);
    medidas[zona] = lista;
  }
  r.medidas = medidas;

  // Agua, ánimo y precios (por día o por alimento)
  for (const m of MAPAS) {
    const aMap = (x: unknown): Elem<unknown>[] => (esObjeto(x) ? Object.entries(x).map(([clave, valor]) => ({ clave, valor })) : []);
    const f = fusionarElementos(m, aMap(base[m]), aMap(otro[m]), la, lb, m === 'precios' ? fechaDe : undefined);
    muertos.push(...f.muertos);
    r[m] = Object.fromEntries(f.vivos.map((e) => [e.clave, e.valor]));
  }

  // Campos sueltos
  for (const k of SCALARES) {
    if (!(k in otro) || otro[k] === undefined) continue;
    r[k] = ganadorEscalar(k, base[k], otro[k], la, lb);
  }
  // Medallas vistas: unión
  const vistas = [...(base.medallasVistas ?? [])];
  for (const m of otro.medallasVistas ?? []) if (!vistas.includes(m)) vistas.push(m);
  r.medallasVistas = vistas;

  // Ajustes: XP con su propia regla, lo demás campo a campo
  const ab = (base.ajustes ?? {}) as Record<string, unknown>;
  const ao = ((otro.ajustes ?? {}) as Record<string, unknown>);
  const ajustes: Record<string, unknown> = { ...ab };
  for (const k of Object.keys(ao)) {
    if (AJUSTES_PROPIOS.has(k) || ao[k] === undefined) continue;
    ajustes[k] = k in ab ? ganadorEscalar(`ajustes.${k}`, ab[k], ao[k], la, lb) : ao[k];
  }
  // El consentimiento no sigue la regla de los ajustes: gana la decisión tomada más tarde y la retirada no se olvida.
  const sensaciones = unirDecisiones((base.ajustes?.consentimientos)?.sensaciones, (otro.ajustes as Datos['ajustes'] | undefined)?.consentimientos?.sensaciones);
  if (sensaciones) ajustes.consentimientos = { ...(ajustes.consentimientos as object | undefined), sensaciones };
  const xp = fusionarLibros(ab.xp, ao.xp);
  if (ab.xp !== undefined || ao.xp !== undefined) ajustes.xp = xp;

  const sync = fusionarSync(la, lb);
  for (const ruta of muertos) delete sync.mod[ruta];
  if (Object.keys(sync.mod).length || Object.keys(sync.borrados).length || base.ajustes?.sync || otro.ajustes?.sync) ajustes.sync = sync;
  r.ajustes = ajustes;

  const resultado = r as unknown as Datos;
  return mismoContenido(resultado, base) ? base : resultado;
}
