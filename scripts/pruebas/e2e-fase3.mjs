// Prueba LOCAL de interfaz de la Fase 3: la app web compilada SIN cuenta (todo en el navegador, sin Supabase) en Chrome,
// con datos de ejemplo para cada recomendación. Comprueba el selector, la sugerencia, el final del entreno y hace capturas.
// Requisitos: web compilada sin variables de Supabase y servida en :5191 con /forja/ y los .json de escenarios (ver gen).
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/e2e-fase3.mjs <carpeta-de-salida>
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';

const WEB = 'http://127.0.0.1:5191/forja/';
const salida = process.argv[2] ?? '.';
mkdirSync(salida, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fallos = 0;
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  ✓', nombre); } else { fallos++; console.log('  ✗', nombre, detalle === '' ? '' : `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`); }
};

async function dispositivo(puerto, ancho, alto, movil) {
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${salida}/perfil-${puerto}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let objetivo;
  for (let i = 0; i < 60 && !objetivo; i++) { try { objetivo = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); } catch { /* arrancando */ } if (!objetivo) await espera(250); }
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
  await cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: movil ? 2 : 1, mobile: !!movil });
  const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const d = {
    errores,
    cargar: async (json) => {
      await cmd('Page.navigate', { url: WEB }); await espera(1800);
      await js(`(async()=>{localStorage.clear();localStorage.setItem('mi-gym:v1', await fetch('/${json}.json').then(r=>r.text()));localStorage.setItem('mi-gym:beta-v1', JSON.stringify({ v: 1, conDatos: true, visto: true }));})()`);
      await cmd('Page.navigate', { url: WEB }); await espera(3500);
    },
    texto: () => js('document.body.innerText'),
    datos: async () => JSON.parse((await js(`localStorage.getItem('mi-gym:v1')`)) ?? 'null'),
    visible: (t) => js(`[...document.querySelectorAll('div,span')].some(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)}&&e.getBoundingClientRect().height>0)`),
    centrar: (t) => js(`(()=>{const e=[...document.querySelectorAll('div,span')].find(e=>e.children.length===0&&e.textContent.trim().startsWith(${JSON.stringify(t)}));if(e)e.scrollIntoView({block:'center'});return !!e})()`),
    clic: async (t, i = 0, aria = false) => {
      const sel = aria ? `[...document.querySelectorAll('[aria-label]')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(t)})` : `[...document.querySelectorAll('div,span,a')].filter(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)})`;
      const c = await js(`(()=>{const l=${sel};const e=l.at(${i});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!c) throw new Error(`no encuentro «${t}»`);
      for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
      await espera(900);
    },
    foto: async (f) => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${salida}/${f}.png`, Buffer.from(r.result.data, 'base64')); },
    alto: (h) => cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: h, deviceScaleFactor: movil ? 2 : 1, mobile: !!movil }),
    cerrar: () => { try { ws.close(); } catch { /* ya cerrado */ } chrome.kill(); },
  };
  return d;
}

const M = await dispositivo(9600, 390, 844, true);
const E = await dispositivo(9601, 1280, 800, false);
try {
  // ============ Escenarios de recomendación (móvil) ============
  const casos = [
    ['subir', 'subir', /Puedes probar «Exigente»/, ['Subir a Exigente', 'Mantener']],
    ['descanso', 'dolor', /Prioriza el descanso/, []],
    ['bajar', 'bajar', /Quizá te venga bien «Suave»/, ['Bajar a Suave', 'Mantener']],
    ['mantener', 'mantener', /Cuando me cuentes cómo te sientes/, []],
    ['sin-datos', 'sin', /Necesito al menos 3 semanas completas/, []],
  ];
  await M.alto(1150); // tarjeta completa en las capturas
  for (const [nombre, json, patron, botones] of casos) {
    console.log(`Escenario «${nombre}»`);
    await M.cargar(json);
    const t = await M.texto();
    prueba('la tarjeta de dificultad aparece en Coach', /Dificultad del entrenamiento/i.test(t));
    prueba('la sugerencia explica por qué', patron.test(t), t.slice(t.indexOf('Dificultad'), t.indexOf('Dificultad') + 300));
    for (const b of botones) prueba(`ofrece el botón «${b}»`, await M.visible(b));
    if (nombre !== 'descanso' && nombre !== 'bajar') prueba('no ofrece subir si no corresponde', nombre === 'subir' || !(await M.visible('Subir a Exigente')));
    if (nombre === 'subir') prueba('muestra el aviso general de salud', /no conoce tu estado de salud/.test(t));
    if (nombre === 'descanso') {
      prueba('con dolor recuerda no entrenar con dolor, aconseja consultar y no ofrece subir', /No entrenes con dolor/.test(t) && /consulta con un profesional/.test(t) && !(await M.visible('Subir a Exigente')));
      prueba('con dolor no hay botones que impliquen seguir entrenando (ni bajar ni semana de descarga)', !(await M.visible('Bajar a Suave')) && !(await M.visible('Semana de descarga')) && !(await M.visible('Mantener')));
      prueba('la revisión semanal no propone subir pesos con dolor reciente', /no te propongo subir pesos ni repeticiones/.test(t));
      // (el aviso general de salud que ya existía al final de Coach menciona «lesión»; aquí solo se mira la tarjeta de sugerencia)
      const tarjeta = t.slice(t.search(/DIFICULTAD DEL ENTRENAMIENTO/i), t.indexOf('Revisión semanal'));
      prueba('sin diagnóstico: la sugerencia no usa lenguaje médico', tarjeta.length > 100 && !/lesi[oó]n|tendin|desgarr|diagn[oó]stic|enfermedad|esguince|fractur/i.test(tarjeta), tarjeta.slice(0, 80));
    }
    await M.centrar('Dificultad del entrenamiento');
    await espera(300);
    await M.foto(`f3-movil-coach-${nombre}`);
  }

  await M.alto(844);
  // ============ Selector: reducir / mantener / aumentar ============
  console.log('Selector de dificultad');
  await M.cargar('subir');
  const antes = await M.datos();
  await M.clic('Cambiar');
  let t = await M.texto();
  prueba('el selector explica las tres opciones sin tecnicismos', /Reducir a Suave/.test(t) && /Mantener Media/.test(t) && /Aumentar a Exigente/.test(t) && /No cambia tu nivel físico ni tu nivel FORJA/.test(t));
  await M.foto('f3-movil-selector');
  await M.clic('Cerrar');
  prueba('cerrar no cambia nada', JSON.stringify((await M.datos()).perfil) === JSON.stringify(antes.perfil));
  await M.clic('Cambiar');
  await M.clic('+  Aumentar a Exigente');
  t = await M.texto();
  prueba('antes de aplicar enseña qué cambiará en el plan y deja elegir', /Tu plan del coach/i.test(t) && /Aplicar a mi plan/.test(t) && /Solo planes nuevos/.test(t) && /no cambian/.test(t));
  prueba('todavía no se ha cambiado nada (hay que confirmar)', (await M.datos()).perfil.dificultad === antes.perfil.dificultad);
  await M.foto('f3-movil-selector-confirmar');
  await M.clic('Confirmar: Exigente');
  const despues = await M.datos();
  prueba('la dificultad pasa a Exigente', despues.perfil.dificultad === 'avanzado');
  prueba('el nivel físico NO cambia', despues.perfil.nivel === antes.perfil.nivel, [antes.perfil.nivel, despues.perfil.nivel]);
  prueba('los entrenos no se tocan', JSON.stringify(despues.sesiones.map((s) => [s.id, s.fecha])) === JSON.stringify(antes.sesiones.map((s) => [s.id, s.fecha])));
  prueba('el plan del coach sube una serie en el primer ejercicio de cada día', despues.rutinas.filter((r) => r.deCoach).every((r, i) => r.ejercicios[0].series === antes.rutinas.filter((x) => x.deCoach)[i].ejercicios[0].series + 1 || r.ejercicios[0].series === 5));
  prueba('queda registrada la fecha del cambio', despues.ajustes?.dificultad?.cambio > 0);
  t = await M.texto();
  prueba('la tarjeta muestra Exigente y ya no insiste con subir', /Exigente/.test(t) && !/Puedes probar/.test(t));
  prueba('el nivel FORJA (XP) sigue igual', (await M.texto()).match(/([\d.]+) XP · faltan/)?.[1] !== undefined);

  // «Mantener» silencia la sugerencia
  await M.cargar('subir');
  await M.clic('Mantener', 0);
  const mant = await M.datos();
  prueba('«Mantener» no cambia la dificultad y silencia la sugerencia unas semanas', mant.perfil.dificultad === antes.perfil.dificultad && mant.ajustes?.dificultad?.silenciarHasta > Date.now());
  prueba('y la sugerencia desaparece de Coach', !/Puedes probar/.test(await M.texto()));

  // ============ Rutinas y Progreso ============
  console.log('Rutinas y Progreso');
  await M.cargar('subir');
  await M.clic('Rutinas', -1);
  t = await M.texto();
  prueba('Rutinas muestra la dificultad actual y avisa de la sugerencia', /Dificultad: Media/.test(t) && /Tienes una sugerencia en Coach/.test(t));
  await M.foto('f3-movil-rutinas');
  await M.clic('Dificultad Media. Cambiar', 0, true);
  prueba('desde Rutinas se abre el mismo selector', /Reducir a Suave/.test(await M.texto()));
  await M.clic('Cerrar');
  await M.clic('Progreso', -1);
  t = await M.texto();
  prueba('Progreso resume cómo te han sentado los entrenos (con respuestas suficientes)', /Cómo te han sentado tus entrenos/i.test(t) && /fáciles/.test(t));
  await M.foto('f3-movil-progreso');
  await M.cargar('mantener');
  await M.clic('Progreso', -1);
  prueba('sin respuestas, Progreso no muestra esa tarjeta (sin estadísticas vacías)', !/Cómo te han sentado tus entrenos/i.test(await M.texto()));

  // ============ Perfil de atleta: los tres niveles por separado ============
  console.log('Perfil de atleta');
  await M.cargar('subir');
  await M.clic('Ver perfil de atleta ›');
  await espera(900);
  await M.centrar('Tus tres niveles');
  t = await M.texto();
  prueba('el perfil explica los tres niveles por separado', /Nivel físico/i.test(t) && /Dificultad de tus entrenos/i.test(t) && /Nivel FORJA/i.test(t) && /nunca la cambia sola/.test(t));
  await M.foto('f3-movil-tres-niveles');

  // ============ Después del entreno ============
  console.log('Final del entreno');
  await M.cargar('mantener');
  const sesionesAntes = (await M.datos()).sesiones.length;
  await M.clic('Empezar', 0);
  if (await M.visible('Empezar')) await M.clic('Empezar', -1); // «¿Cómo estás hoy?»
  await espera(800);
  await M.clic('Serie 1 hecha', 0, true);
  await M.clic('Terminar', 0);
  await M.clic('Terminar y guardar');
  await espera(900);
  t = await M.texto();
  prueba('al terminar aparece «¿Cómo ha ido?» como algo opcional', /¿Cómo ha ido\?/.test(t) && /opcional/.test(t) && /Me dolió algo/.test(t));
  await M.foto('f3-movil-fin-entreno');
  const guardado = await M.datos();
  prueba('el entreno se guardó sin respuesta (es opcional)', guardado.sesiones.length === sesionesAntes + 1 && !guardado.sesiones[0].sensacion);
  await M.clic('Duro');
  await M.clic('Me dolió algo', 0, true);
  const conRespuesta = await M.datos();
  prueba('la respuesta se guarda solo en ese entreno', conRespuesta.sesiones[0].sensacion === 'duro' && conRespuesta.sesiones[0].dolor === true && conRespuesta.sesiones.filter((s) => s.dolor).length === 1);
  prueba('con dolor recuerda no entrenar con dolor', /No entrenes con dolor/.test(await M.texto()));
  await M.foto('f3-movil-fin-entreno-dolor');
  await M.clic('Listo');
  await espera(900);
  await M.clic('Coach', -1);
  await espera(600);
  prueba('tras marcar dolor, Coach prioriza el descanso y no propone subir', /Prioriza el descanso/.test(await M.texto()) && !(await M.visible('Subir a Exigente')));

  // ============ Revisión: nivel físico avanzado, dolor y revisión semanal ============
  console.log('Nivel físico avanzado: no se asume Exigente');
  await M.cargar('avanzado');
  const av0 = await M.datos();
  t = await M.texto();
  const plano = (x) => x.replace(/\s+/g, ' ');
  prueba('un nivel físico avanzado sin elegir dificultad empieza en Media, no en Exigente', /Media/.test(t) && !/Dificultad: Exigente/.test(t) && !/Puedes probar/.test(t));
  prueba('y avisa de que aún no la ha elegido', /Aún no la has elegido/.test(t));
  await M.clic('Editar perfil');
  await M.clic('Sáb');
  await M.clic('Guardar', 0);
  t = await M.texto();
  prueba('antes de rehacer el plan pregunta qué dificultad quiere', /¿Con qué dificultad quieres tu plan\?/.test(t) && /Rehacer mi plan/.test(t));
  prueba('deja claro que el nivel físico (Avanzado) no la decide ni se modifica', /nivel físico \(Avanzado\)/.test(t));
  prueba('la sugerida como punto de partida es Media', /Media · sugerida como punto de partida/.test(plano(t)));
  await M.foto('f3-movil-elegir-dificultad');
  const av1 = await M.datos();
  prueba('mientras no confirma, NO se ha cambiado nada (ni rutinas ni perfil ni nivel físico)', JSON.stringify(av1.rutinas) === JSON.stringify(av0.rutinas) && JSON.stringify(av1.perfil) === JSON.stringify(av0.perfil));
  await M.clic('Volver sin guardar');
  const av2 = await M.datos();
  prueba('Volver sin guardar tampoco cambia nada y el formulario sigue abierto', JSON.stringify(av2.rutinas) === JSON.stringify(av0.rutinas) && /Tu perfil/.test(await M.texto()));
  await M.clic('Guardar', 0);
  await M.clic('Rehacer mi plan');
  const av3 = await M.datos();
  prueba('al confirmar se guarda Media como elegida y el nivel físico sigue siendo Avanzado', av3.perfil.dificultad === 'intermedio' && av3.perfil.dificultadConfirmada === true && av3.perfil.nivel === 'avanzado', av3.perfil);
  prueba('se rehace el plan del coach con 5 días y sin aplicar la serie extra de Exigente a todos los días', av3.rutinas.filter((r) => r.deCoach).length === 5 && !av3.rutinas.filter((r) => r.deCoach).every((r) => r.ejercicios[0].series === 5));
  const propia = av3.rutinas.find((r) => r.id === 'mia');
  prueba('tu rutina propia se conserva exactamente', JSON.stringify(propia) === JSON.stringify(av0.rutinas.find((r) => r.id === 'mia')));
  const editada0 = av0.rutinas.find((r) => r.personalizada);
  const editada = av3.rutinas.find((r) => r.id === editada0.id);
  prueba('la rutina del coach que habías editado se conserva con tus ejercicios y descansos (pasa a ser tuya)', !!editada && editada.deCoach === false && JSON.stringify(editada.ejercicios) === JSON.stringify(editada0.ejercicios) && editada.nombre === editada0.nombre);
  prueba('ya no vuelve a preguntar (la dificultad está elegida)', /Media/.test(await M.texto()) && !/Aún no la has elegido/.test(await M.texto()));

  console.log('Dolor: prudencia al empezar a entrenar');
  await M.cargar('dolor');
  await M.clic('Empezar', 0);
  t = await M.texto();
  prueba('¿Cómo estás hoy? con dolor reciente recuerda no entrenar con dolor y no anima a subir', /Marcaste molestias hace poco/.test(t) && /no entrenes con dolor/.test(t) && !/intentar subir peso|A por ello/.test(t));
  await M.foto('f3-movil-animo-dolor');
  await M.clic('Cancelar');
  await M.cargar('subir');
  await M.clic('Empezar', 0);
  prueba('sin dolor, el mensaje habitual no cambia', !/Marcaste molestias/.test(await M.texto()));
  await M.clic('Cancelar');

  console.log('Revisión semanal: no toca lo personalizado');
  await M.cargar('avanzado');
  const rv0 = await M.datos();
  await M.clic('Ajustar mi plan');
  await espera(900);
  const rv1 = await M.datos();
  const sinFecha = (p) => { const { ajusteKcal, ultimaRevision, ...resto } = p; return JSON.stringify(resto); };
  prueba('Ajustar mi plan no cambia tus rutinas propias ni la editada', JSON.stringify(rv1.rutinas.find((r) => r.id === 'mia')) === JSON.stringify(rv0.rutinas.find((r) => r.id === 'mia')) && JSON.stringify(rv1.rutinas.find((r) => r.personalizada)) === JSON.stringify(rv0.rutinas.find((r) => r.personalizada)));
  prueba('ni tus entrenos (pesos)', JSON.stringify(rv1.sesiones) === JSON.stringify(rv0.sesiones));
  prueba('ni tus preferencias: solo pueden cambiar calorías y fecha de revisión', sinFecha(rv1.perfil) === sinFecha(rv0.perfil));
  prueba('ni sube la exigencia por su cuenta (mismas series en el plan)', JSON.stringify(rv1.rutinas.filter((r) => r.deCoach).map((r) => r.ejercicios.map((e) => e.series))) === JSON.stringify(rv0.rutinas.filter((r) => r.deCoach).map((r) => r.ejercicios.map((e) => e.series))));
  prueba('muestra el resultado de la revisión y se cierra', /Plan revisado/.test(await M.texto()));
  await M.clic('Listo');
  await M.clic('Rutinas', -1);
  prueba('Rutinas indica qué rutina del coach has editado tú', /editada por ti \(no se toca\)/.test(await M.texto()));
  await M.foto('f3-movil-rutina-editada');

  // ============ Escritorio ============
  console.log('Escritorio');
  await E.cargar('subir');
  await E.centrar('Dificultad del entrenamiento');
  await espera(300);
  await E.foto('f3-escritorio-coach');
  await E.clic('Cambiar');
  await E.foto('f3-escritorio-selector');
  await E.clic('Cerrar');
  await E.clic('Rutinas', -1);
  await E.foto('f3-escritorio-rutinas');

  console.log('Errores de JavaScript');
  prueba('sin errores de JavaScript (móvil y escritorio)', M.errores.length + E.errores.length === 0, [...M.errores, ...E.errores]);
} catch (e) {
  fallos++;
  console.log('  ✗ la prueba se interrumpió:', e.message);
} finally {
  M.cerrar(); E.cerrar();
}
console.log(`\n${ok} pruebas correctas, ${fallos} fallidas`);
process.exit(fallos ? 1 : 0);
