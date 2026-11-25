// Carrera REAL contra forja-dev (solo cuenta 2): varias sesiones guardando a la vez con el código de producción
// (src/subida.ts). Mide si se pierde progreso y cuántos reintentos hace el control de concurrencia.
//   FORJA_URL, FORJA_KEY, FORJA_E2, FORJA_CLAVE (por entorno; nunca se imprimen)
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/real-carrera.mjs [repeticiones] [sesiones]
import { createClient } from '@supabase/supabase-js';

import { claveDia } from '../../src/datos.ts';
import { datosDemo } from '../../src/demo.ts';
import { fusionarLibros, normalizarLibro } from '../../src/sincronizacion.ts';
import { subirDatos } from '../../src/subida.ts';
import { calcularXp, lunesDeSemana } from '../../src/xp.ts';

const URL = process.env.FORJA_URL;
const KEY = process.env.FORJA_KEY;
const FORJA_E2 = process.env.FORJA_E2;
const FORJA_CLAVE = process.env.FORJA_CLAVE;
if (!/^https:\/\/jfjvcndrssbbbfazqvbs\.supabase\.co$/.test(URL ?? '') || !KEY || !FORJA_E2 || !FORJA_CLAVE) throw new Error('entorno no válido');
const REPETICIONES = Number(process.argv[2] ?? 5);
const SESIONES = Number(process.argv[3] ?? 3);
const RONDAS = 10;

const abrir = async () => {
  const c = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: FORJA_E2, password: FORJA_CLAVE });
  if (error) throw new Error('no se pudo entrar');
  return { c, id: data.user.id };
};
const asentar = (d) => { const e = calcularXp(d); return e?.nuevo ? { ...d, ajustes: { ...d.ajustes, xp: e.libro } } : d; };
const base = asentar(datosDemo());
const semana = (n) => claveDia(lunesDeSemana(300 + n));

const sesiones = [];
for (let i = 0; i < SESIONES; i++) sesiones.push(await abrir());
const subir = (u, d) => u.c.from('datos_usuario').upsert({ user_id: u.id, datos: { ...d, activo: null }, actualizado: new Date().toISOString() }, { onConflict: 'user_id' });

let perdidasTormenta = 0, perdidasFinal = 0, esperadasTotal = 0, intentos = [], errores = 0, escrituras = 0;
for (let rep = 0; rep < REPETICIONES; rep++) {
  await subir(sesiones[0], base);
  let local = sesiones.map(() => base);
  const esperadas = [];
  for (let r = 0; r < RONDAS; r++) {
    local = local.map((d, i) => {
      const k = semana(i * 1000 + rep * 100 + r);
      esperadas.push(k);
      return { ...d, ajustes: { ...d.ajustes, xp: fusionarLibros(d.ajustes.xp, { v: 2, semanas: { [k]: [1, 1, 1] } }) } };
    });
    const res = await Promise.allSettled(sesiones.map((u, i) => subirDatos(u.c, u.id, local[i])));
    res.forEach((x, i) => {
      escrituras++;
      if (x.status === 'fulfilled' && !x.value.error) { local[i] = x.value.datos; intentos.push(x.value.intentos); } else errores++;
    });
  }
  const leer = async () => normalizarLibro((await sesiones[0].c.from('datos_usuario').select('xp:datos->ajustes->xp').eq('user_id', sesiones[0].id).maybeSingle()).data?.xp);
  let nube = await leer();
  perdidasTormenta += esperadas.filter((k) => !nube.semanas[k]).length;
  esperadasTotal += esperadas.length;
  for (let i = 0; i < SESIONES; i++) local[i] = (await subirDatos(sesiones[i].c, sesiones[i].id, local[i])).datos; // una sincronización normal cada una
  nube = await leer();
  perdidasFinal += esperadas.filter((k) => !nube.semanas[k]).length;
}
// Deja la cuenta 2 con datos de prueba limpios
await subir(sesiones[0], base);
const media = intentos.reduce((a, b) => a + b, 0) / Math.max(1, intentos.length);
const resumen = { repeticiones: REPETICIONES, sesionesSimultaneas: SESIONES, rondasPorRepeticion: RONDAS, escrituras, errores, semanasEsperadas: esperadasTotal, perdidasTrasLaTormenta: perdidasTormenta, perdidasTrasUnaSincronizacionNormal: perdidasFinal, intentosMedios: Math.round(media * 100) / 100, intentosMaximos: Math.max(...intentos) };
console.log(JSON.stringify(resumen, null, 1));
console.log(perdidasTormenta === 0 && perdidasFinal === 0 && errores === 0 ? 'SIN PÉRDIDAS' : 'HAY PÉRDIDAS O ERRORES');
process.exit(perdidasTormenta === 0 && perdidasFinal === 0 && errores === 0 ? 0 : 1);
