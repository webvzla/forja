// Prueba de CARRERA: tres «dispositivos» con la misma cuenta guardan entrenos A LA VEZ, muchas veces, contra el Supabase
// SIMULADO (Postgres en memoria con las migraciones y RLS reales; nada real). Antes de la beta, el último que guardaba pisaba
// al resto (en la prueba real de la Fase 2 se perdían 2-4 de 24). Ahora no debe perderse NINGUNO.
// Requisito: servidor simulado en :54321 (node supabase/pruebas/servidor-simulado.mjs).
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/carrera-simulada.mjs [rondas]
import { createClient } from '@supabase/supabase-js';

import { datosIniciales } from '../../src/datos.ts';
import { fusionarDatos, registrarCambios } from '../../src/fusion.ts';
import { subirDatos } from '../../src/subida.ts';

const API = 'http://127.0.0.1:54321';
const RONDAS = Number(process.argv[2] ?? 25);
const clave = 'secreto-de-prueba-1';
const email = `carrera-${Date.now()}@prueba.local`;
const cliente = () => createClient(API, 'clave-de-prueba', { auth: { persistSession: false, autoRefreshToken: false } });

const primero = cliente();
const alta = await primero.auth.signUp({ email, password: clave });
if (alta.error) throw alta.error;
const uid = alta.data.user.id;

const dispositivos = await Promise.all([0, 1, 2].map(async (i) => {
  const sb = cliente();
  const { error } = await sb.auth.signInWithPassword({ email, password: clave });
  if (error) throw error;
  return { i, sb, d: { ...datosIniciales(), rutinas: [] }, vista: undefined, intentos: [] };
}));

const ses = (id, t) => ({ id, rutinaNombre: `Torso ${id}`, fecha: t, minutos: 50, ejercicios: [{ nombre: 'Press', series: [{ peso: 60, reps: 8 }] }] });
async function guardar(dev, sesion) {
  dev.d = registrarCambios(dev.d, { ...dev.d, sesiones: [sesion, ...dev.d.sesiones] });
  const r = await subirDatos(dev.sb, uid, dev.d, 6, dev.vista);
  if (r.error) throw r.error;
  if (r.cambio) dev.d = fusionarDatos(dev.d, r.datos);
  dev.vista = r.actualizado ?? dev.vista;
  dev.intentos.push(r.intentos);
}

let t = Date.now() - 1000 * 3600 * 24 * 30;
const esperados = new Set();
for (let ronda = 0; ronda < RONDAS; ronda++) {
  await Promise.all(dispositivos.map((dev) => {
    const id = `d${dev.i}-r${ronda}`;
    esperados.add(id);
    return guardar(dev, ses(id, (t += 60000)));
  }));
}
// Ronda final de sincronización: cada dispositivo vuelve a subir lo suyo (como al volver a la app)
for (const dev of dispositivos) await guardar(dev, ses(`final-${dev.i}`, (t += 60000))).then(() => esperados.add(`final-${dev.i}`));
for (const dev of dispositivos) await guardar(dev, ses(`cierre-${dev.i}`, (t += 60000))).then(() => esperados.add(`cierre-${dev.i}`));

const { data: fila } = await primero.from('datos_usuario').select('datos').eq('user_id', uid).maybeSingle();
const enNube = new Set((fila?.datos?.sesiones ?? []).map((s) => s.id));
const perdidos = [...esperados].filter((id) => !enNube.has(id));
const intentos = dispositivos.flatMap((d) => d.intentos);
console.log(`${RONDAS} rondas × 3 dispositivos guardando a la vez: ${esperados.size} entrenos escritos`);
console.log(`En la nube: ${enNube.size} · perdidos: ${perdidos.length}${perdidos.length ? ' → ' + perdidos.slice(0, 6).join(', ') : ''}`);
console.log(`Intentos por guardado: media ${(intentos.reduce((a, b) => a + b, 0) / intentos.length).toFixed(2)}, máximo ${Math.max(...intentos)}`);
// Cada dispositivo, tras una última puesta al día, ve los mismos entrenos que la nube
let distintos = 0;
for (const dev of dispositivos) {
  const { data } = await dev.sb.from('datos_usuario').select('datos').eq('user_id', uid).maybeSingle();
  dev.d = fusionarDatos(dev.d, data.datos);
  if (dev.d.sesiones.length !== enNube.size) distintos++;
}
console.log(`Dispositivos que no coinciden con la nube tras ponerse al día: ${distintos}`);
const ok = perdidos.length === 0 && distintos === 0 && enNube.size === esperados.size;
console.log(ok ? 'RESULTADO: correcto, no se pierde ningún entreno.' : 'RESULTADO: FALLO, se pierden datos.');
process.exit(ok ? 0 : 1);
