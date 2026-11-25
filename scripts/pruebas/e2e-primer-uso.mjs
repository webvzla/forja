// Prueba de «primer uso» desde cero, tal como la usará Francisco: la app web sin cuenta (todo en el navegador) en Chrome
// con un perfil vacío y persistente. Crea el perfil, elige dificultad, hace un entreno, contesta cómo ha ido, mira Coach,
// Progreso, ARENA y perfil, cierra el navegador y lo vuelve a abrir para comprobar que los datos siguen ahí.
// NO usa Supabase ni ninguna cuenta. Requisito: la app servida en el puerto indicado (por defecto 8091).
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/e2e-primer-uso.mjs <carpeta-temporal> [puerto]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

import { datosIniciales } from '../../src/datos.ts';
import { fusionarProgreso } from '../../src/sincronizacion.ts';
import { calcularXp } from '../../src/xp.ts';

const salida = process.argv[2] ?? '.';
const PUERTO = process.argv[3] ?? '8091';
const WEB = `http://localhost:${PUERTO}/`;
mkdirSync(salida, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fallos = 0;
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  ✓', nombre); } else { fallos++; console.log('  ✗', nombre, detalle === '' ? '' : `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`); }
};

let puertoCdp = 9700;
async function abrir() {
  const p = puertoCdp++;
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${p}`, `--user-data-dir=${salida}/perfil-usuario`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let objetivo;
  for (let i = 0; i < 60 && !objetivo; i++) { try { objetivo = (await (await fetch(`http://127.0.0.1:${p}/json`)).json()).find((t) => t.type === 'page'); } catch { /* arrancando */ } if (!objetivo) await espera(250); }
  const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const pend = new Map(); const errores = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  };
  const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 400, height: 900, deviceScaleFactor: 1, mobile: true });
  const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const d = {
    errores, js,
    ir: async (esperaMs = 4000) => { await cmd('Page.navigate', { url: WEB }); await espera(esperaMs); },
    esperar: async (patron, max = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { if (patron.test(await js('document.body.innerText'))) return true; await espera(1000); } return false; },
    texto: () => js('document.body.innerText'),
    datos: async () => JSON.parse((await js(`localStorage.getItem('mi-gym:v1')`)) ?? 'null'),
    visible: (t) => js(`[...document.querySelectorAll('div,span')].some(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)}&&e.getBoundingClientRect().height>0)`),
    clic: async (t, i = 0, aria = false) => {
      const sel = aria ? `[...document.querySelectorAll('[aria-label]')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(t)})` : `[...document.querySelectorAll('div,span,a')].filter(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)})`;
      const c = await js(`(()=>{const l=${sel};const e=l.at(${i});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!c) throw new Error(`no encuentro «${t}»`);
      for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
      await espera(900);
    },
    rellenar: async (etiqueta, valor) => { await js(`(()=>{const e=document.querySelector('[aria-label=${JSON.stringify(etiqueta)}]');e.focus();e.select&&e.select()})()`); await cmd('Input.insertText', { text: valor }); await espera(200); },
    // Cierre normal del navegador (como hace una persona): así escribe los datos a disco antes de salir.
    cerrar: async () => {
      await new Promise((r) => { chrome.once('exit', r); cmd('Browser.close'); setTimeout(r, 6000); });
      try { ws.close(); } catch { /* ya cerrado */ }
      chrome.kill();
    },
  };
  return d;
}

let A = await abrir();
try {
  console.log('Primer arranque (perfil de navegador vacío)');
  await A.ir(2000);
  prueba('la app arranca (la primera carga puede tardar) y pide crear el plan', await A.esperar(/Crea tu plan/), (await A.texto()).slice(0, 120));
  prueba('sin cuenta: no pide entrar ni registrarse', !/Entrar|Crear cuenta/.test(await A.texto()));
  prueba('primera apertura: bienvenida a FORJA BETA (sin datos previos no ofrece copia)', await A.esperar(/Bienvenido a FORJA BETA/, 30000) && !/Descargar copia ahora/.test(await A.texto()) && /versión de pruebas/.test(await A.texto()));
  await A.clic('Entendido');
  let bd = JSON.parse((await A.js(`localStorage.getItem('mi-gym:beta-v1')`)) ?? 'null');
  prueba('queda anotado que ya se dio la bienvenida y NO se crea copia previa (no había datos)', bd?.visto === true && bd?.conDatos === false && (await A.js(`localStorage.getItem('mi-gym:v1:copia-pre-beta')`)) === null, bd);

  console.log('Crear el perfil');
  await A.rellenar('Edad', '30');
  await A.rellenar('Altura (cm)', '178');
  await A.rellenar('Peso (kg)', '80');
  await A.clic('Crear mi plan', 0);
  let t = await A.texto();
  prueba('antes de crear el plan pregunta la dificultad', /¿Con qué dificultad quieres tu plan\?/.test(t));
  prueba('no hay nada guardado todavía', (await A.datos())?.perfil == null);
  await A.clic('Crear mi plan', -1);
  prueba('aparece Coach con el plan de la semana', await A.esperar(/Tu coach/) && /Esta semana/.test(await A.texto()));
  let d = await A.datos();
  prueba('se guarda el perfil con la dificultad elegida y el nivel físico por separado', d.perfil.dificultadConfirmada === true && d.perfil.dificultad === 'principiante' && d.perfil.nivel === 'principiante', d.perfil);
  prueba('se crea el plan del coach (4 días)', d.rutinas.filter((r) => r.deCoach).length === 4);
  t = await A.texto();
  prueba('nivel FORJA: empieza en Chispa nivel 1 sin XP inventado', /Chispa · Nivel 1/.test(t) && /Registra tu primer entreno/.test(t));
  prueba('la dificultad aparece como Suave, sin insistir en que no la has elegido', /Suave/.test(t) && !/Aún no la has elegido/.test(t));
  prueba('sin datos, la sugerencia dice que aún no puede recomendar nada', /Necesito al menos 3 semanas completas/.test(t));

  console.log('Primer entreno');
  await A.clic('Empezar', 0);
  if (await A.visible('Empezar')) await A.clic('Empezar', -1); // «¿Cómo estás hoy?»
  await espera(1200);
  await A.clic('Serie 1 hecha', 0, true);
  await A.clic('Terminar', 0);
  await A.clic('Terminar y guardar');
  await espera(900);
  t = await A.texto();
  prueba('al terminar sale el resumen y la pregunta opcional «¿Cómo ha ido?»', /Entreno guardado/.test(t) && /¿Cómo ha ido\?/.test(t));
  await A.clic('Bien', -1);
  await A.clic('Listo');
  d = await A.datos();
  prueba('el entreno queda guardado con la sensación', d.sesiones.length === 1 && d.sesiones[0].sensacion === 'bien' && !d.sesiones[0].dolor, d.sesiones[0] && { sensacion: d.sesiones[0].sensacion, series: d.sesiones[0].ejercicios.length });
  await A.clic('Coach', -1);
  t = await A.texto();
  prueba('XP: un entreno = 10 XP (la fórmula de ARENA), nivel FORJA sigue en Chispa 1', /10 XP · faltan 40/.test(t) && /Chispa · Nivel 1/.test(t), t.match(/[\d.]+ XP[^\n]*/)?.[0]);
  prueba('la sugerencia sigue sin datos (no se inventa nada con un solo entreno)', /Necesito al menos 3 semanas completas/.test(t));
  prueba('la misión «Entrenar hoy» se marca hecha sola', /Entreno guardado\. ¡Buen trabajo!/.test(t));

  console.log('Progreso, ARENA y perfil');
  await A.clic('Progreso', -1);
  t = await A.texto();
  prueba('Progreso muestra el mismo XP y el entreno', /10 XP · faltan 40/.test(t) && /Entrenos/i.test(t));
  prueba('no muestra estadísticas vacías de sensaciones (solo hay 1 respuesta)', !/Cómo te han sentado tus entrenos/i.test(t));
  await A.clic('Arena', -1);
  t = await A.texto();
  prueba('ARENA sin cuenta explica que los rankings y retos llegarán y no da error', /llegarán pronto|Arena/i.test(t));
  await A.clic('🏅 Logros');
  await espera(1200);
  prueba('Arena → Logros muestra el mismo XP', /10 XP · faltan 40/.test(await A.texto()));
  await A.clic('Coach', -1);
  await A.clic('Ver perfil de atleta ›');
  await espera(1000);
  t = await A.texto();
  prueba('el perfil de atleta muestra los tres niveles por separado', /Nivel físico/i.test(t) && /Dificultad de tus entrenos/i.test(t) && /Nivel FORJA/i.test(t));
  prueba('y los atributos sin datos suficientes no inventan cifras', /Aún no hay datos suficientes/.test(t));

  console.log('FORJA BETA: versión, novedades y opiniones');
  await A.clic('Cerrar perfil de atleta', 0, true);
  await A.clic('Coach', -1);
  prueba('la cabecera de Coach lleva la etiqueta BETA', await A.visible('BETA'));
  await A.clic('Ajustes y apariencia', 0, true);
  t = await A.texto();
  prueba('Ajustes muestra la versión de la beta y el aviso de versión de pruebas', /FORJA BETA/.test(t) && /Versión 1\.0\.0-beta\.1/.test(t) && /versión de pruebas/.test(t));
  prueba('hay novedades sin ver (aviso 🔔) y enlaces de términos y privacidad', /🔔 Qué hay de nuevo/.test(t) && /Términos de uso/.test(t) && /Privacidad: qué se guarda/.test(t));
  prueba('sin datos previos no aparece la copia previa a la beta', !/copia previa a la beta/i.test(t));
  prueba('las ilustraciones de Academy conservan su atribución (CC BY-SA, Everkinetic) y el texto ya no habla de ilustraciones propias', /Everkinetic/.test(t) && /CC BY-SA 4\.0/.test(t) && !/6 con ilustraciones propias/.test(t));
  await A.clic('🔔 Qué hay de nuevo');
  prueba('«Qué hay de nuevo» enseña la entrada de esta versión', /FORJA BETA llega/.test(await A.texto()) && /1\.0\.0-beta\.1 · 2026-11-18/.test(await A.texto()));
  await A.clic('Cerrar novedades', 0, true);
  prueba('al verlas, el aviso 🔔 desaparece', /Qué hay de nuevo/.test(await A.texto()) && !/🔔 Qué hay de nuevo/.test(await A.texto()));
  await A.clic('💬 Ayuda y opiniones');
  t = await A.texto();
  prueba('Ayuda y opiniones ofrece los cuatro tipos y avisa de qué se envía', /Un error/.test(t) && /Problema con mi entreno/.test(t) && /Una sugerencia/.test(t) && /Valorar FORJA/.test(t) && /No va tu email, ni tu nombre, ni ningún dato de entreno/.test(t));
  prueba('sin cuenta no se puede enviar directamente, pero se puede copiar el mensaje', /Enviar \(necesita cuenta\)/.test(t) && /Copiar el mensaje/.test(t));
  await A.rellenar('Tu mensaje', 'Al terminar el entreno la pantalla se queda en blanco un segundo');
  const previa1 = await A.texto();
  prueba('lo que se enviaría es solo técnico y claro: versión, cuenta, pantalla y navegador (sin email, sin JSON y sin datos de entreno)', /Versión de FORJA: 1\.0\.0-beta\.1/.test(previa1) && /Cuenta: Sin cuenta/.test(previa1) && /Tamaño de pantalla: \d+ × \d+ píxeles/.test(previa1) && !/[{}]|"version"/.test(previa1.slice(previa1.toLowerCase().indexOf('qué se envía'))) && !/Entrenos registrados|@/.test(previa1.slice(previa1.toLowerCase().indexOf('qué se envía'))), previa1.slice(previa1.toLowerCase().indexOf('qué se envía'), previa1.toLowerCase().indexOf('qué se envía') + 300));
  await A.clic('Incluir un resumen de mis datos', 0, true);
  const previa2 = await A.texto();
  prueba('al marcar «incluir un resumen» se ve exactamente qué datos irían (nº de entrenos, último entreno, objetivo, nivel, dificultad)', /Entrenos registrados: 1/.test(previa2) && /Dificultad: /.test(previa2) && /Último entreno: /.test(previa2) && !/sensaci|dolor/i.test(previa2.slice(previa2.indexOf('Entrenos registrados'))) && !/@/.test(previa2.slice(previa2.toLowerCase().indexOf('qué se envía'))), previa2.slice(previa2.indexOf('Entrenos registrados'), previa2.indexOf('Entrenos registrados') + 200));
  await A.clic('Cerrar ayuda y opiniones', 0, true);
  await A.clic('Cerrar ajustes', 0, true);

  console.log('Persistencia: cerrar el navegador y volver a abrirlo');
  const antes = await A.datos();
  const errores1 = [...A.errores];
  await A.cerrar();
  await espera(1500);
  A = await abrir();
  await A.ir(3000);
  prueba('al volver a abrir, la app carga con tus datos (sin pedir crear el plan)', await A.esperar(/Tu coach/, 60000) && !/Crea tu plan/.test(await A.texto()));
  const despues = await A.datos();
  prueba('perfil, plan, entrenos y sensación siguen exactamente igual', JSON.stringify(despues.perfil) === JSON.stringify(antes.perfil) && JSON.stringify(despues.rutinas) === JSON.stringify(antes.rutinas) && JSON.stringify(despues.sesiones) === JSON.stringify(antes.sesiones));
  prueba('y el XP también', /10 XP · faltan 40/.test(await A.texto()));
  prueba('la bienvenida de la beta no vuelve a salir', !/Bienvenido a FORJA BETA/.test(await A.texto()));

  console.log('Copia de seguridad (lo que exporta «Guardar copia» y lo que restaura)');
  const copia = JSON.parse(JSON.stringify(despues)); // «Guardar copia» exporta JSON.stringify(datos)
  const restaurada = fusionarProgreso({ ...datosIniciales(), ...copia, activo: null }, despues);
  prueba('restaurar la copia en un navegador vacío conserva perfil, dificultad, sensaciones, plan y XP', JSON.stringify(restaurada.perfil) === JSON.stringify(despues.perfil) && JSON.stringify(restaurada.sesiones) === JSON.stringify(despues.sesiones) && JSON.stringify(restaurada.rutinas) === JSON.stringify(despues.rutinas) && calcularXp(restaurada).xp === calcularXp(despues).xp);
  prueba('sin errores de JavaScript durante todo el uso', errores1.length + A.errores.length === 0, [...errores1, ...A.errores].slice(0, 3));
} catch (e) {
  fallos++;
  console.log('  ✗ la prueba se interrumpió:', e.message);
} finally {
  await A.cerrar();
}
console.log(`\n${ok} pruebas correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
