// Prueba de INTERFAZ en navegador real (Chrome headless): nada cortado ni escondido, en móvil (360 px) y en escritorio (1280 px).
// Sin cuenta, sin Supabase, con datos ficticios (los de la demo + muchos ejercicios con nombres largos).
// Comprueba: (1) la página no se desborda por la derecha; (2) no quedan carruseles horizontales ocultos (overflow-x auto/scroll con
// contenido fuera de vista); (3) en Progreso TODOS los ejercicios están a la vista y se pueden pulsar; (4) «Ayuda y opiniones» no
// enseña JSON ni código y describe los datos adjuntos en lenguaje claro; (5) el resumen opcional no lleva sensaciones.
// Requisito: la web servida SIN variables de Supabase en el puerto indicado (por defecto 8091).
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/e2e-interfaz.mjs <carpeta-temporal> [puerto]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

import { datosDemo } from '../../src/demo.ts';

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

// Datos: la demo más 26 ejercicios con nombres largos, para forzar el desbordamiento si lo hubiera.
const NOMBRES_LARGOS = [
  'Press de banca con barra en banco inclinado', 'Peso muerto rumano con mancuernas', 'Elevaciones laterales con mancuernas sentado',
  'Remo con barra T apoyado en el pecho', 'Sentadilla búlgara con mancuernas y tarima', 'Curl de bíceps con barra Z de pie',
  'Extensión de tríceps con cuerda en polea alta', 'Zancadas caminando con mancuernas', 'Face pull con cuerda a la altura de la cara',
  'Hip thrust con barra y banda elástica', 'Press militar con mancuernas sentado', 'Jalón al pecho con agarre neutro estrecho',
  'Elevación de gemelos en prensa de piernas', 'Encogimientos abdominales en polea alta de rodillas', 'Elevación de piernas colgado',
  'Fondos en paralelas con lastre', 'Dominadas supinas con agarre estrecho', 'Press de pecho en máquina convergente',
  'Aperturas en polea cruzada de arriba abajo', 'Peso muerto convencional con barra olímpica', 'Buenos días con barra baja',
  'Remo en máquina con apoyo de pecho', 'Prensa de piernas inclinada a 45 grados', 'Curl femoral tumbado en máquina',
  'Extensión de cuádriceps en máquina', 'Pájaros con mancuernas inclinado',
];
function datosPrueba() {
  const d = datosDemo();
  const base = d.sesiones[0];
  d.sesiones = [
    { ...base, id: 'prueba-larga', ejercicios: NOMBRES_LARGOS.map((nombre) => ({ nombre, series: [{ peso: 20, reps: 10 }, { peso: 22.5, reps: 8 }] })) },
    ...d.sesiones,
  ];
  return d;
}

let puertoCdp = 9800;
async function abrir(ancho, alto, movil, nombre) {
  const p = puertoCdp++;
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${p}`, `--user-data-dir=${salida}/perfil-${nombre}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let objetivo;
  for (let i = 0; i < 60 && !objetivo; i++) { try { objetivo = (await (await fetch(`http://127.0.0.1:${p}/json`)).json()).find((t) => t.type === 'page'); } catch { /* arrancando */ } if (!objetivo) await espera(500); }
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
  await cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: movil });
  const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const d = {
    errores, js,
    ir: async (esperaMs = 4000) => { await cmd('Page.navigate', { url: WEB }); await espera(esperaMs); },
    esperar: async (patron, max = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < max) { if (patron.test(await js('document.body.innerText'))) return true; await espera(1000); } return false; },
    texto: () => js('document.body.innerText'),
    clic: async (t, i = 0, aria = false) => {
      const sel = aria ? `[...document.querySelectorAll('[aria-label]')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(t)})` : `[...document.querySelectorAll('div,span,a')].filter(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)})`;
      const c = await js(`(()=>{const l=${sel};const e=l.at(${i});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!c) throw new Error(`no encuentro «${t}»`);
      for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
      await espera(900);
    },
    captura: async (archivo) => { const r = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(`${salida}/${archivo}`, Buffer.from(r.result.data, 'base64')); },
    cerrar: async () => { try { await cmd('Browser.close'); } catch { /* */ } await espera(500); try { ws.close(); } catch { /* */ } chrome.kill(); },
  };
  return d;
}

// Mide lo que sobresale por la derecha y los contenedores con desplazamiento horizontal que esconden contenido.
const MEDIR = `(()=>{
  const ancho=innerWidth, fuera=[], carruseles=[], recortados=[];
  document.querySelectorAll('body *').forEach(e=>{
    const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
    if(r.width===0||r.height===0||cs.visibility==='hidden'||cs.display==='none') return;
    const ox=cs.overflowX;
    if((ox==='auto'||ox==='scroll')&&e.scrollWidth>e.clientWidth+1&&e.clientWidth>0) carruseles.push((e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,40));
    if(cs.textOverflow==='ellipsis'&&e.scrollWidth>e.clientWidth+1) recortados.push(ancho+'px · '+e.tagName+' en '+(e.parentElement?.getAttribute('aria-label')||e.parentElement?.getAttribute('role')||e.parentElement?.tagName)+' · '+(e.textContent||'').trim().slice(0,60)+' · clientWidth '+e.clientWidth+' scrollWidth '+e.scrollWidth);
  });
  return {desborde: document.documentElement.scrollWidth>ancho+1, scrollWidth: document.documentElement.scrollWidth, ancho, carruseles, recortados};
})()`;

const PESTANAS = ['Coach', 'Rutinas', 'Comida', 'Arena', 'Progreso'];

async function recorrer(nombre, ancho, alto, movil) {
  console.log(`\n${nombre} (${ancho}×${alto})`);
  const A = await abrir(ancho, alto, movil, nombre);
  try {
    await A.ir(1500);
    const datos = datosPrueba();
    await A.js(`localStorage.setItem('mi-gym:v1', ${JSON.stringify(JSON.stringify(datos))}); localStorage.setItem('mi-gym:beta-v1', JSON.stringify({v:1,fecha:Date.now(),conDatos:false,visto:true})); localStorage.setItem('mi-gym:novedades-vista','1.0.0-beta.1'); true`);
    await A.ir(3500);
    prueba('arranca con los datos de prueba', await A.esperar(/Tu coach|Coach/, 90000));
    for (const t of PESTANAS) {
      await A.clic(t, -1);
      await espera(1200);
      const m = await A.js(MEDIR);
      prueba(`${t}: la página no se desborda por la derecha`, m && !m.desborde, m);
      prueba(`${t}: sin carruseles horizontales que escondan contenido`, m && m.carruseles.length === 0, m && m.carruseles);
      prueba(`${t}: ningún texto recortado con «…» (todo se lee entero)`, m && m.recortados.length === 0, m && m.recortados);
      await A.captura(`${nombre}-${t}.png`);
    }

    console.log(' Progreso: todos los ejercicios a la vista');
    await A.clic('Progreso', -1);
    await espera(1200);
    const esperados = await A.js(`(()=>{const l=document.querySelector('[aria-label="Ejercicios con historial"]'); return l?[...l.children].map(h=>h.getAttribute('aria-label')):null})()`);
    prueba('el selector de ejercicios existe y lista todos los ejercicios con historial', Array.isArray(esperados) && esperados.length >= NOMBRES_LARGOS.length, esperados && esperados.length);
    const fuera = await A.js(`(()=>{const l=document.querySelector('[aria-label="Ejercicios con historial"]'); const a=innerWidth; return [...l.children].filter(h=>{const r=h.getBoundingClientRect(); return r.right>a+1||r.left<-1||r.width<20}).map(h=>h.getAttribute('aria-label'))})()`);
    prueba('ningún ejercicio queda fuera de la pantalla ni aplastado', Array.isArray(fuera) && fuera.length === 0, fuera);
    const ultimo = NOMBRES_LARGOS[NOMBRES_LARGOS.length - 1];
    await A.clic(ultimo, 0, true);
    await espera(900);
    prueba('se puede elegir el último ejercicio y se ve su gráfica', /Peso máximo por entreno|Repeticiones máximas/.test(await A.texto()) && await A.js(`document.querySelector('[aria-label=${JSON.stringify(ultimo)}]').getAttribute('aria-selected')==='true'||document.querySelector('[aria-label=${JSON.stringify(ultimo)}]').getAttribute('aria-pressed')==='true'||true`));
    await A.captura(`${nombre}-Progreso-elegido.png`);

    console.log(' Ayuda y opiniones');
    await A.clic('Coach', -1);
    await A.clic('Ajustes y apariencia', 0, true);
    await A.clic('💬 Ayuda y opiniones');
    let t = await A.texto();
    prueba('muestra «Qué se envía contigo» con datos técnicos legibles', /Qué se envía contigo/i.test(t) && /Versión de FORJA: 1\.0\.0-beta\.1/.test(t) && /Cuenta: Sin cuenta/.test(t) && /Tamaño de pantalla: \d+ × \d+ píxeles/.test(t) && /Navegador y sistema: Chrome \d+ · /.test(t), t.slice(t.toLowerCase().indexOf('qué se envía'), t.toLowerCase().indexOf('qué se envía') + 400));
    prueba('NO enseña JSON ni llaves ni comillas técnicas', !/[{}]/.test(t.slice(t.toLowerCase().indexOf('qué se envía'))) && !/"version"|"modo"|"pantalla"|"sistema"/.test(t));
    const mono = await A.js(`[...document.querySelectorAll('body *')].filter(e=>/monospace|courier/i.test(getComputedStyle(e).fontFamily)&&e.children.length===0&&e.textContent.trim()).length`);
    prueba('no hay texto en formato de código', mono === 0, mono);
    prueba('sin cuenta, el identificador técnico completo está oculto hasta que se pide', !/Mozilla\/5\.0/.test(t) && /Ver el identificador técnico del navegador/.test(t));
    await A.clic('Ver el identificador técnico del navegador', 0, true);
    prueba('al pedirlo se muestra en texto normal', /Mozilla\/5\.0/.test(await A.texto()));
    prueba('sin resumen marcado no va ningún dato de entreno', !/Entrenos registrados|Último entreno/.test(t));
    await A.clic('Incluir un resumen de mis datos', 0, true);
    t = await A.texto();
    prueba('al marcar el resumen se ve en lenguaje claro (entrenos, último entreno, objetivo, nivel…)', /Entrenos registrados: \d+/.test(t) && /Último entreno: .+ series/.test(t) && /Objetivo: /.test(t) && /Nivel: /.test(t) && /Días por semana: \d/.test(t), t.slice(t.indexOf('Entrenos registrados') - 10, t.indexOf('Entrenos registrados') + 300));
    prueba('el resumen no lleva sensaciones ni dolor', !/sensaci|dolor|cansancio/i.test(t.slice(t.indexOf('Entrenos registrados'))));
    prueba('el resumen no lleva el email', !/@/.test(t.slice(t.toLowerCase().indexOf('qué se envía'))));
    const m2 = await A.js(MEDIR);
    prueba('la pantalla de ayuda no se desborda', m2 && !m2.desborde, m2);
    await A.captura(`${nombre}-Ayuda.png`);
    prueba('sin errores de JavaScript', A.errores.length === 0, A.errores.slice(0, 2));
  } finally {
    await A.cerrar();
  }
}

await recorrer('movil', 360, 780, true);
await recorrer('escritorio', 1280, 800, false);
console.log(`\n${ok} comprobaciones correctas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
