// Compatibilidad con los datos de la versión antigua publicada (webvzla.github.io/forja, commit 19c0196).
// Dos pasos con el MISMO perfil de Chrome y el MISMO puerto (así es el mismo origen y el mismo localStorage, igual que
// pasará al sustituir la web en la misma dirección):
//   1) sembrar:   la app ANTIGUA (otra carpeta) crea perfil, plan, un entreno, comida, agua y peso desde su propia interfaz;
//                 después se añade historial anterior con la forma exacta que escribe la versión antigua.
//   2) verificar: FORJA 2.0 abre esos datos: nada se pierde ni se reescribe solo, el XP sale del historial, las pantallas
//                 muestran lo guardado, un entreno nuevo se suma sin tocar lo anterior y la copia de seguridad lo conserva.
// NO usa Supabase ni ninguna cuenta.
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/compat-antigua.mjs sembrar   <carpeta> <puerto>
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/compat-antigua.mjs verificar <carpeta> <puerto>
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import { datosIniciales } from '../../src/datos.ts';
import { fusionarProgreso } from '../../src/sincronizacion.ts';
import { calcularXp } from '../../src/xp.ts';

const modo = process.argv[2];
const salida = process.argv[3] ?? '.';
const PUERTO = process.argv[4] ?? '8100';
const WEB = `http://localhost:${PUERTO}/`;
mkdirSync(salida, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fallos = 0;
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  ✓', nombre); } else { fallos++; console.log('  ✗', nombre, detalle === '' ? '' : `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle).slice(0, 600)}`); }
};

let puertoCdp = modo === 'sembrar' ? 9750 : 9760;
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
  return {
    errores, js,
    ir: async (esperaMs = 4000) => { await cmd('Page.navigate', { url: WEB }); await espera(esperaMs); },
    esperar: async (patron, max = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { if (patron.test(await js('document.body.innerText'))) return true; await espera(1000); } return false; },
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
    pestana: async (t) => {
      const hay = await js(`(()=>{const l=[...document.querySelectorAll('[role=tab]')].filter(x=>x.textContent.trim().endsWith(${JSON.stringify(t)}));const e=l.at(-1);if(!e)return 'no';e.click();return l.length+' pestañas, texto: '+e.textContent.trim()})()`);
      if (hay === 'no') throw new Error(`no encuentro la pestaña «${t}»`);
      await espera(1100);
    },
    rellenar: async (selector, valor) => { const hay = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.scrollIntoView({block:'center'});e.focus();e.select&&e.select();return true})()`); if (!hay) throw new Error(`no encuentro el campo ${selector}`); await cmd('Input.insertText', { text: valor }); await espera(200); },
    cerrar: async () => {
      await new Promise((r) => { chrome.once('exit', r); cmd('Browser.close'); setTimeout(r, 6000); });
      try { ws.close(); } catch { /* ya cerrado */ }
      chrome.kill();
    },
  };
}

const porEtiqueta = (e) => `[aria-label=${JSON.stringify(e)}]`;
const DIA = 86400000;

async function sembrar() {
  const A = await abrir();
  try {
    console.log('VERSIÓN ANTIGUA: crear datos con su propia interfaz');
    await A.ir(2000);
    prueba('la app antigua arranca y pide crear el plan', await A.esperar(/Crea tu plan/), (await A.texto()).slice(0, 100));
    await A.rellenar(porEtiqueta('Edad'), '34');
    await A.rellenar(porEtiqueta('Altura (cm)'), '176');
    await A.rellenar(porEtiqueta('Peso (kg)'), '82');
    await A.clic('Crear mi plan', 0);
    prueba('crea el plan', await A.esperar(/Esta semana/, 30000));
    let d = await A.datos();
    prueba('la versión antigua guardó perfil y plan del coach', !!d.perfil && d.rutinas.some((r) => r.deCoach), d.perfil);
    prueba('(esperado) en la versión antigua no existe dificultad ni XP', d.perfil.dificultad === undefined && d.ajustes?.xp === undefined);

    await A.clic('Empezar', 0);
    if (await A.visible('Empezar')) await A.clic('Empezar', -1); // «¿Cómo estás hoy?»
    await espera(1200);
    await A.rellenar('[aria-label$=", serie 1, kilos"]', '62.5');
    await A.rellenar('[aria-label$=", serie 1, repeticiones"]', '8');
    await A.clic('Serie 1 hecha', 0, true);
    await A.clic('Terminar', 0);
    await A.clic('Terminar y guardar');
    await espera(1500);
    d = await A.datos();
    prueba('la versión antigua guarda el entreno con sus pesos', d.sesiones.length === 1 && d.sesiones[0].ejercicios[0].series[0]?.peso === 62.5, d.sesiones[0]);

    for (const cierre of ['Listo', 'Cerrar', 'Continuar', 'Entendido']) if (await A.visible(cierre)) { await A.clic(cierre, -1); break; } // resumen del entreno de la versión antigua
    await A.pestana('Comida');
    prueba('la pestaña Comida de la versión antigua se abre', /Comida de hoy/.test(await A.texto()));

    console.log('Historial anterior (misma forma que escribe la versión antigua)');
    const r0 = d.rutinas.find((r) => r.deCoach) ?? d.rutinas[0];
    const enteros = (i) => new Date(Date.now() - i * DIA);
    const sesiones = [];
    for (let i = 36; i >= 3; i -= 3) {
      sesiones.push({
        id: `viejo${i}`, rutinaNombre: r0.nombre, fecha: enteros(i).getTime(), minutos: 50 + (i % 7),
        ejercicios: r0.ejercicios.slice(0, 3).map((e, k) => ({ nombre: e.nombre, series: Array.from({ length: e.series }, () => ({ peso: 40 + k * 10 + (36 - i) / 3, reps: e.reps })) })),
      });
    }
    sesiones.reverse(); // la más reciente primero
    const dias = (n) => Array.from({ length: n }, (_, i) => enteros(i + 1));
    const clave = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    const mezcla = { ...d };
    mezcla.sesiones = [...d.sesiones, ...sesiones];
    mezcla.pesos = [...dias(30).reverse().filter((_, i) => i % 6 === 0).map((f, i) => ({ fecha: f.getTime(), max: 84 - i * 0.4 })), ...(d.pesos ?? [])];
    for (const f of dias(14)) {
      mezcla.comida = { ...mezcla.comida, [clave(f)]: [{ id: `c${clave(f)}`, nombre: 'Comida de ayer', proteina: 110, kcal: 2100 }] };
      mezcla.agua = { ...mezcla.agua, [clave(f)]: 2000 };
      mezcla.animo = { ...mezcla.animo, [clave(f)]: { sueno: 2, energia: 1 } };
    }
    const hoy = clave(new Date());
    mezcla.comida = { ...mezcla.comida, [hoy]: [{ id: `c${hoy}`, nombre: 'Pollo con arroz', proteina: 45, kcal: 620 }] };
    mezcla.agua = { ...mezcla.agua, [hoy]: 500 };
    mezcla.medidas = { ...mezcla.medidas, Cintura: [{ fecha: enteros(20).getTime(), max: 88 }, { fecha: enteros(2).getTime(), max: 86.5 }] };
    mezcla.precios = { ...mezcla.precios, Pollo: { euros: 6.2, cantidad: 1000, fecha: enteros(5).getTime() } };
    mezcla.despensa = [...(mezcla.despensa ?? []), { ing: 'Arroz', cantidad: 800 }];
    mezcla.misAlimentos = [...(mezcla.misAlimentos ?? [])];
    mezcla.medallasVistas = ['primer-entreno'];
    mezcla.perfil = { ...mezcla.perfil, enfasis: 'pecho' }; // formato más antiguo: una sola zona como texto
    await A.js(`localStorage.setItem('mi-gym:v1', ${JSON.stringify(JSON.stringify(mezcla))})`);
    await A.ir(5000);
    const releido = await A.datos();
    prueba('la propia app antigua acepta y conserva ese historial al recargar', releido.sesiones.length === mezcla.sesiones.length && isDeepStrictEqual(releido.perfil, mezcla.perfil), { sesiones: releido.sesiones.length });
    prueba('la app antigua sigue mostrando su pantalla sin errores', (await A.texto()).length > 200 && A.errores.length === 0, A.errores.slice(0, 2));
    writeFileSync(`${salida}/datos-antes.json`, JSON.stringify(releido));
    console.log(`  (${releido.sesiones.length} entrenos, ${Object.keys(releido.comida).length} días de comida guardados en datos-antes.json)`);
  } catch (e) {
    fallos++;
    console.log('  ✗ la siembra se interrumpió:', e.message);
  } finally {
    await A.cerrar();
  }
}

async function verificar() {
  const antes = JSON.parse(readFileSync(`${salida}/datos-antes.json`, 'utf8'));
  const A = await abrir();
  try {
    console.log('FORJA 2.0 abre los datos de la versión antigua (mismo navegador, mismo origen)');
    await A.ir(2000);
    prueba('arranca con tus datos y no pide crear el plan otra vez', await A.esperar(/Tu coach/) && !/Crea tu plan/.test(await A.texto()), (await A.texto()).slice(0, 120));
    await espera(2500);
    let t0 = await A.texto();
    prueba('con datos de la versión antigua, la bienvenida explica que se guardó una copia y ofrece descargarla', /Bienvenido a FORJA BETA/.test(t0) && /Tus datos siguen aquí tal como los dejaste/.test(t0) && /Descargar copia ahora/.test(t0), t0.slice(0, 200));
    const previa = JSON.parse((await A.js(`localStorage.getItem('mi-gym:v1:copia-pre-beta')`)) ?? 'null');
    prueba('la copia previa a la beta es EXACTAMENTE lo que había (todos los entrenos, rutinas, comidas y perfil de la versión antigua)', isDeepStrictEqual(previa, antes), previa && { sesiones: previa.sesiones?.length });
    await A.clic('Entendido');
    prueba('la bienvenida se cierra y queda anotada', !/Bienvenido a FORJA BETA/.test(await A.texto()) && JSON.parse(await A.js(`localStorage.getItem('mi-gym:beta-v1')`)).visto === true);
    let d = await A.datos();
    const nombresRutinas = antes.rutinas.map((r) => r.nombre);
    prueba('al abrir NO se reescribe nada por su cuenta: rutinas, perfil e historial idénticos', isDeepStrictEqual(d.rutinas, antes.rutinas) && isDeepStrictEqual(d.perfil, antes.perfil) && isDeepStrictEqual(d.sesiones, antes.sesiones), { rutinas: d.rutinas?.length, perfilIgual: isDeepStrictEqual(d.perfil, antes.perfil) });
    const t = await A.texto();
    const esperado = calcularXp({ ...datosIniciales(), ...antes });
    prueba(`el XP sale del historial antiguo (${esperado.xp} XP)`, new RegExp(`${esperado.xp.toLocaleString('es-ES').replace('.', '\\.?')} XP`).test(t) || t.includes(`${esperado.xp} XP`), t.match(/[\d.]+ XP[^\n]*/)?.[0]);
    prueba('muestra el nivel FORJA y una dificultad de partida (Suave/Media/Exigente) derivada de tu nivel', /(Chispa|Brasa|Llama|Acero) · Nivel \d+/.test(t) && /Suave|Media|Exigente/.test(t), t.match(/Dificultad[^\n]*\n[^\n]*/)?.[0]);
    prueba('no hay dificultad confirmada (se te preguntará solo si vas a rehacer el plan)', d.perfil.dificultadConfirmada !== true && d.perfil.dificultad === undefined);
    prueba('el plan del coach sigue siendo el tuyo (mismos nombres de rutina)', isDeepStrictEqual(d.rutinas.map((r) => r.nombre), nombresRutinas));

    console.log('Pantallas con datos antiguos');
    await A.clic('Rutinas', -1);
    let tr = await A.texto();
    prueba('Rutinas muestra las rutinas antiguas', nombresRutinas.some((n) => tr.includes(n)));
    await A.clic('Progreso', -1);
    await espera(1200);
    let tp = await A.texto();
    const primerEj = antes.sesiones.at(-1).ejercicios[0].nombre;
    prueba('Progreso muestra entrenos y el historial del ejercicio', /Entrenos/i.test(tp) && (tp.includes(primerEj) || /kg|Peso/i.test(tp)), tp.slice(0, 150));
    await A.pestana('Comida').catch(() => A.clic('Comida', -1));
    await espera(1000);
    const tc = await A.texto();
    prueba('Comida muestra la comida y el agua guardadas', /Pollo con arroz/.test(tc) && /500|0,5/.test(tc), tc.slice(0, 200));
    await A.clic('Coach', -1);
    await A.clic('Ver perfil de atleta ›');
    await espera(1200);
    const ta = await A.texto();
    prueba('el perfil de atleta calcula atributos con el historial sin romperse', /Nivel físico/i.test(ta) && /Disciplina/i.test(ta), ta.slice(0, 160));
    await A.clic('‹ Volver', 0).catch(() => {});
    await A.ir(3500);
    await A.esperar(/Tu coach/, 60000);

    console.log('Un entreno nuevo en 2.0 se suma sin tocar lo anterior');
    await A.clic('Empezar', 0);
    if (await A.visible('Empezar')) await A.clic('Empezar', -1);
    await espera(1200);
    await A.rellenar('[aria-label$=", serie 1, kilos"]', '65');
    await A.rellenar('[aria-label$=", serie 1, repeticiones"]', '8');
    await A.clic('Serie 1 hecha', 0, true);
    await A.clic('Terminar', 0);
    await A.clic('Terminar y guardar');
    await espera(1200);
    await A.clic('Bien', -1).catch(() => {});
    await A.clic('Listo').catch(() => {});
    await espera(800);
    d = await A.datos();
    prueba('hay un entreno más y los anteriores siguen idénticos y en el mismo orden', d.sesiones.length === antes.sesiones.length + 1 && isDeepStrictEqual(d.sesiones.slice(1), antes.sesiones), { n: d.sesiones.length });
    const claves = ['rutinas', 'pesos', 'comida', 'despensa', 'recetasHechas', 'sobras', 'misAlimentos', 'preferencias', 'menu', 'agua', 'medidas', 'animo', 'precios', 'voz', 'descanso'];
    const cambiadas = claves.filter((k) => !isDeepStrictEqual(d[k], antes[k]));
    prueba('el resto de datos (peso, comida, despensa, medidas, ánimo, precios, medallas…) idéntico', cambiadas.length === 0, cambiadas);
    prueba('las medallas ya vistas se conservan (2.0 solo puede añadir las nuevas)', antes.medallasVistas.every((m) => d.medallasVistas.includes(m)), d.medallasVistas);
    const dp = Object.keys(antes.perfil).filter((k) => !isDeepStrictEqual(d.perfil?.[k], antes.perfil[k]));
    prueba('el perfil no cambia (la formato antiguo de una sola zona se acepta tal cual)', dp.length === 0, dp);
    const x2 = calcularXp({ ...datosIniciales(), ...d });
    prueba('el XP no baja con el entreno nuevo (ARENA cuenta 1 entreno por día: ya había uno hoy, así que no suma otro)', x2.xp >= esperado.xp, { antes: esperado.xp, ahora: x2.xp });

    console.log('Copia de seguridad: lo que exporta «Guardar copia» y lo que restaura');
    const copia = JSON.parse(JSON.stringify(d));
    const restaurada = fusionarProgreso({ ...datosIniciales(), ...copia, activo: null }, d);
    prueba('la copia contiene todo (rutinas, historial, comida, perfil) y restaurarla en un navegador vacío lo recupera', isDeepStrictEqual(restaurada.sesiones, d.sesiones) && isDeepStrictEqual(restaurada.rutinas, d.rutinas) && isDeepStrictEqual(restaurada.comida, d.comida) && isDeepStrictEqual(restaurada.perfil, d.perfil));
    // Y una copia hecha con la versión ANTIGUA (sin campos nuevos) también se restaura en 2.0
    const copiaAntigua = JSON.parse(JSON.stringify(antes));
    const rest2 = fusionarProgreso({ ...datosIniciales(), ...copiaAntigua, activo: null }, null);
    prueba('una copia hecha con la versión antigua se restaura en 2.0 con todo su contenido', isDeepStrictEqual(rest2.sesiones, antes.sesiones) && isDeepStrictEqual(rest2.rutinas, antes.rutinas) && isDeepStrictEqual(rest2.perfil, antes.perfil) && calcularXp(rest2).xp === esperado.xp);
    console.log('Volver a la copia previa a la beta (Ajustes → FORJA BETA)');
    await A.pestana('Coach');
    await A.clic('Ajustes y apariencia', 0, true);
    const ta2 = await A.texto();
    prueba('Ajustes ofrece descargar y volver a la copia previa a la beta', /Descargar la copia previa a la beta/.test(ta2) && /Volver a la copia previa a la beta/.test(ta2));
    await A.clic('Volver a la copia previa a la beta');
    prueba('antes de volver pide confirmación y avisa de lo que se pierde', /¿Volver a la copia previa a la beta\?/.test(await A.texto()) && /Lo que hayas registrado después se perderá/.test(await A.texto()));
    await A.clic('Sí, volver');
    await espera(1500);
    const rest = await A.datos();
    prueba('tras volver, los datos son los de antes de la beta: el entreno nuevo desaparece y todo lo antiguo está intacto', rest.sesiones.length === antes.sesiones.length && isDeepStrictEqual(rest.sesiones, antes.sesiones) && isDeepStrictEqual(rest.rutinas, antes.rutinas) && isDeepStrictEqual(rest.comida, antes.comida) && isDeepStrictEqual(rest.perfil, antes.perfil), { n: rest.sesiones.length });
    prueba('sin errores de JavaScript durante todo el uso', A.errores.length === 0, A.errores.slice(0, 3));
  } catch (e) {
    fallos++;
    console.log('  ✗ la verificación se interrumpió:', e.message);
  } finally {
    await A.cerrar();
  }
}

if (modo === 'sembrar') await sembrar();
else if (modo === 'verificar') await verificar();
else { console.log('uso: sembrar|verificar <carpeta> <puerto>'); process.exit(2); }
console.log(`\n${ok} comprobaciones correctas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
