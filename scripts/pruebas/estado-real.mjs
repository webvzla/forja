// SOLO LECTURA contra `forja-dev` con las tres cuentas de prueba: estado de su libro de XP, sus puntos de ARENA y sus
// retos. Sirve para comprobar el día que se complete el reto. Credenciales por entorno (FORJA_URL, FORJA_KEY, FORJA_E1..3, FORJA_CLAVE);
// nunca se imprimen.   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/estado-real.mjs
import { createClient } from '@supabase/supabase-js';

import { calcularXp } from '../../src/xp.ts';

const URL = process.env.FORJA_URL;
const KEY = process.env.FORJA_KEY;
const FORJA_E1 = process.env.FORJA_E1;
const FORJA_E2 = process.env.FORJA_E2;
const FORJA_E3 = process.env.FORJA_E3;
const FORJA_CLAVE = process.env.FORJA_CLAVE;
if (!/^https:\/\/jfjvcndrssbbbfazqvbs\.supabase\.co$/.test(URL ?? '') || !KEY || !FORJA_CLAVE) throw new Error('entorno no válido');
for (const [et, email] of [['cuenta1', FORJA_E1], ['cuenta2', FORJA_E2], ['cuenta3', FORJA_E3]]) {
  const c = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: FORJA_CLAVE });
  if (error) { console.log(et, 'no se pudo iniciar sesión'); continue; }
  const uid = data.user.id;
  const fila = (await c.from('datos_usuario').select('datos').eq('user_id', uid).maybeSingle()).data?.datos;
  const retos = (await c.rpc('mis_retos')).data ?? [];
  const l = (await c.rpc('mis_logros')).data;
  const xp = fila ? calcularXp(fila)?.xp ?? null : null;
  console.log(et, JSON.stringify({
    filaEnNube: !!fila, xpCalculadoConLoQueHayEnNube: xp, semanasEnElLibro: Object.keys(fila?.ajustes?.xp?.semanas ?? {}).length, retosEnElLibro: fila?.ajustes?.xp?.retos ?? null,
    mis_logros: { puntos: l.puntos, retos_completados: l.retos_completados, retosPorSemana: l.semanas.filter((s) => s.retos > 0).map((s) => [s.semana, s.retos]) },
    retos: retos.map((r) => ({ nombre: r.nombre, terminado: r.terminado, cumplido: r.cumplido, dias_restantes: r.dias_restantes, miProgreso: r.participantes.find((p) => p.yo)?.progreso, meta: r.meta })),
  }));
}
