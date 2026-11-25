// Prueba LOCAL de extremo a extremo de las CAPTURAS opcionales y del AVISO de opinión nueva: la app web real (compilada) en Chrome
// contra el Supabase SIMULADO (Postgres en memoria con las migraciones y RLS REALES, incluida la migración 9; Storage y pg_net simulados).
// NO usa Supabase real ni cuentas reales: todo ocurre en 127.0.0.1 con una cuenta inventada. Comprueba, usando la interfaz:
//   · elegir una captura (JPG con EXIF/GPS, PNG con texto, imagen grande), ver la vista previa, quitarla y volver a ponerla;
//   · que se SUBE sin metadatos, con ≤ 2 MB y ≤ 1600 px, a la carpeta privada `<id>/<uuid>.<ext>`, y que la opinión la enlaza;
//   · rechazos: GIF, archivo que no es imagen, archivo enorme; fallo de subida (no se pierde nada ni se crea la opinión); límite de 10;
//   · que no hay lecturas automáticas del almacén y que un bucket privado no responde por URL pública;
//   · el aviso: una llamada por opinión, con secreto en la cabecera y SIN texto, autor, email, datos técnicos ni ruta de la captura.
// Requisitos: 1) servidor simulado en :54321  2) web compilada con EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 servida en :5189
//   node --import ./scripts/pruebas/registrar.mjs scripts/pruebas/e2e-adjuntos.mjs <carpeta-temporal>
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';

import { tieneMetadatos } from '../../src/adjuntos.ts';

const API = 'http://127.0.0.1:54321';
const WEB = 'http://127.0.0.1:5189/forja/';
const salida = process.argv[2] ?? '.';
mkdirSync(salida, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fallos = 0;
const prueba = (nombre, cond, detalle = '') => {
  if (cond) { ok++; console.log('  ✓', nombre); } else { fallos++; console.log('  ✗', nombre, detalle === '' ? '' : `\n      ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle).slice(0, 700)}`); }
};
const prueba_ = { 'x-prueba': 'si', 'content-type': 'application/json' };
const sql = async (q, p = []) => (await fetch(API + '/__prueba/sql', { method: 'POST', headers: prueba_, body: JSON.stringify({ sql: q, params: p }) })).json();
const objetos = async () => (await fetch(API + '/__prueba/objetos', { headers: prueba_ })).json();
const objeto = async (ruta) => { const r = await fetch(`${API}/__prueba/objeto?ruta=${encodeURIComponent(ruta)}`, { headers: prueba_ }); return r.ok ? r.json() : null; };

async function abrir(nombre) {
  const puerto = 9900;
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${salida}/perfil-${nombre}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let objetivo;
  for (let i = 0; i < 60 && !objetivo; i++) { try { objetivo = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); } catch { /* arrancando */ } if (!objetivo) await espera(250); }
  const ws = new WebSocket(objetivo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const pend = new Map(); const errores = []; const peticiones = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    if (d.method === 'Network.requestWillBeSent') peticiones.push({ metodo: d.params.request.method, url: d.params.request.url });
  };
  const cmd = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await cmd('Page.enable'); await cmd('Runtime.enable'); await cmd('Network.enable'); await cmd('DOM.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 400, height: 900, deviceScaleFactor: 1, mobile: true });
  const js = async (e) => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const d = {
    errores, peticiones, js, cmd,
    ir: async () => { await cmd('Page.navigate', { url: WEB }); await espera(2800); },
    texto: () => js('document.body.innerText'),
    visible: (t) => js(`[...document.querySelectorAll('[aria-label]')].some(e=>e.getAttribute('aria-label')===${JSON.stringify(t)}&&e.getBoundingClientRect().height>0)`),
    clic: async (t, i = 0, aria = false) => {
      const sel = aria ? `[...document.querySelectorAll('[aria-label]')].filter(e=>e.getAttribute('aria-label')===${JSON.stringify(t)})` : `[...document.querySelectorAll('div,span,a')].filter(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(t)})`;
      const c = await js(`(()=>{const l=${sel};const e=l.at(${i});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!c) throw new Error(`no encuentro «${t}»`);
      for (const type of ['mousePressed', 'mouseReleased']) await cmd('Input.dispatchMouseEvent', { type, x: c[0], y: c[1], button: 'left', clickCount: 1 });
      await espera(900);
    },
    rellenar: async (selector, valor) => {
      const hay = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.scrollIntoView({block:'center'});e.focus();e.select&&e.select();return true})()`);
      if (!hay) throw new Error(`no encuentro el campo ${selector}`);
      await cmd('Input.insertText', { text: valor });
      await espera(200);
    },
    // Pulsa «Añadir una captura» y entrega el archivo al selector de archivos que la app acaba de crear.
    elegirArchivo: async (ruta) => {
      await d.clic('📎 Añadir una captura');
      const raiz = (await cmd('DOM.getDocument', { depth: -1 })).result.root.nodeId;
      const q = await cmd('DOM.querySelector', { nodeId: raiz, selector: 'input[data-forja="captura"]' });
      if (!q.result?.nodeId) throw new Error('no apareció el selector de archivos');
      await cmd('DOM.setFileInputFiles', { files: [ruta], nodeId: q.result.nodeId });
      await espera(2500);
    },
    cerrar: async () => { try { await cmd('Browser.close'); } catch { /* */ } await espera(400); try { ws.close(); } catch { /* */ } chrome.kill(); },
  };
  return d;
}

// ---- Imágenes de prueba (se fabrican en el propio Chrome con canvas y se les añade metadatos desde Node) ----
const FABRICAR = (tipo, ancho, alto, calidad, ruido) => `(async()=>{const c=document.createElement('canvas');c.width=${ancho};c.height=${alto};const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,${ancho},${alto});g.addColorStop(0,'#2a7bd6');g.addColorStop(1,'#e8f04a');x.fillStyle=g;x.fillRect(0,0,${ancho},${alto});
  x.fillStyle='#14161a';x.font='bold 40px sans-serif';x.fillText('FORJA captura de prueba',20,60);
  if(${ruido}){const im=x.getImageData(0,0,${ancho},${alto});for(let i=0;i<im.data.length;i+=4){im.data[i]=Math.random()*255;im.data[i+1]=Math.random()*255;im.data[i+2]=Math.random()*255;}x.putImageData(im,0,0);}
  const b=await new Promise(r=>c.toBlob(r,${JSON.stringify(tipo)},${calidad}));const u=new Uint8Array(await b.arrayBuffer());let s='';for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode(...u.subarray(i,i+8192));return btoa(s);})()`;
const be16 = (n) => [(n >> 8) & 255, n & 255];
function conExif(jpeg) {
  const datos = [...Buffer.from('Exif\0\0'), ...Buffer.from('GPSLatitude=40.4168;GPSLongitude=-3.7038;Make=Pixel;Owner=Pepe Perez')];
  const seg = [0xff, 0xe1, ...be16(datos.length + 2), ...datos];
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from(seg), jpeg.subarray(2)]);
}
function conTextoPng(png) {
  const dato = Buffer.from('Author\0Pepe Perez, calle Mayor 5');
  const crc = Buffer.alloc(4); // el CRC no importa para esta prueba: Chrome ignora los trozos auxiliares
  const largo = Buffer.alloc(4); largo.writeUInt32BE(dato.length);
  const trozo = Buffer.concat([largo, Buffer.from('tEXt'), dato, crc]);
  return Buffer.concat([png.subarray(0, 33), trozo, png.subarray(33)]);
}

const A = await abrir('adjuntos');
const CORREO = 'captura1@prueba.local';
const CLAVE = 'secreto-de-prueba-1';
try {
  await A.ir();
  // Un perfil con plan (los datos de ejemplo «vacío con perfil») para que, tras registrarse, aparezca Coach y no la pantalla de crear el plan.
  await A.js(`(async()=>{localStorage.setItem('mi-gym:v1', await fetch('/vacio.json').then(r=>r.text()));})()`);
  await A.js(`localStorage.setItem('mi-gym:beta-v1', JSON.stringify({v:1,fecha:Date.now(),conDatos:false,visto:true})); localStorage.setItem('mi-gym:novedades-vista','1.0.0-beta.1'); true`);
  await A.ir();

  console.log('Imágenes de prueba');
  const jpgBase = Buffer.from(await A.js(FABRICAR('image/jpeg', 640, 360, 0.9, false)), 'base64');
  const jpgExif = conExif(jpgBase);
  const pngBase = Buffer.from(await A.js(FABRICAR('image/png', 500, 300, undefined, false)), 'base64');
  const pngTexto = conTextoPng(pngBase);
  const webp = Buffer.from(await A.js(FABRICAR('image/webp', 480, 270, 0.9, false)), 'base64');
  const grande = Buffer.from(await A.js(FABRICAR('image/jpeg', 2800, 2400, 0.97, true)), 'base64');
  prueba('las imágenes de prueba tienen los metadatos que se quieren quitar', tieneMetadatos(jpgExif) && tieneMetadatos(pngTexto) && jpgExif.includes('GPSLatitude') && pngTexto.includes('Pepe Perez') && grande.length > 2 * 1024 * 1024, { exif: tieneMetadatos(jpgExif), png: tieneMetadatos(pngTexto), grande: grande.length });
  const f = (n, b) => { const r = `${salida}/${n}`.replace(/\\/g, '/'); writeFileSync(r, b); return r; };
  const archivos = {
    jpgExif: f('foto-con-exif.jpg', jpgExif), pngTexto: f('captura-con-texto.png', pngTexto), webp: f('captura.webp', webp), grande: f('grande.jpg', grande),
    gif: f('animada.gif', Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')),
    falsa: f('no-es-imagen.jpg', Buffer.from('esto no es una imagen, solo texto')),
    enorme: f('enorme.png', Buffer.alloc(16 * 1024 * 1024 + 1, 7)),
  };

  console.log('Registro y pantalla de ayuda');
  await A.clic('Crear cuenta', 0);
  await A.rellenar('[aria-label="Email"]', CORREO);
  await A.rellenar('[aria-label="Contraseña"]', CLAVE);
  await A.clic('Tengo 16 años o más y acepto los términos de uso y la política de privacidad', 0, true);
  await A.clic('Consiento que se guarden mis datos en la nube', 0, true);
  await A.clic('Crear cuenta', -1);
  await espera(5500);
  const uid = (await sql(`select id from auth.users where email = $1`, [CORREO]))[0]?.id;
  prueba('cuenta de prueba creada en el servidor simulado', !!uid);
  const cerrarMedallas = async () => { for (let i = 0; i < 3; i++) { const t = await A.js(`[...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith('Nueva medalla'))?.getAttribute('aria-label') ?? null`); if (!t) return; await A.clic(t, 0, true); } };
  await cerrarMedallas();
  await A.clic('Ajustes y apariencia', 0, true);
  await A.clic('💬 Ayuda y opiniones');
  let t = await A.texto();
  prueba('con cuenta aparece «Captura de pantalla (opcional)» con los límites y la limpieza explicados', /Captura de pantalla \(opcional\)/i.test(t) && /JPG, PNG o WebP/.test(t) && /2,0 MB/.test(t) && /se reduce y se limpia en tu dispositivo/.test(t) && /ubicación, cámara, fecha/.test(t) && /privado/.test(t));
  prueba('al abrir la ayuda no se pide ni se descarga nada del almacén', !A.peticiones.some((p) => /storage\/v1/.test(p.url)));

  console.log('Rechazos antes de subir nada');
  await A.elegirArchivo(archivos.gif);
  prueba('un GIF se rechaza con un mensaje claro y no hay vista previa', /Solo se admiten imágenes JPG, PNG o WebP/.test(await A.texto()) && !(await A.visible('Vista previa de la captura')));
  await A.elegirArchivo(archivos.falsa);
  prueba('un archivo .jpg que en realidad no es una imagen no se acepta', /No se pudo preparar esa imagen/.test(await A.texto()) && !(await A.visible('Vista previa de la captura')));
  await A.elegirArchivo(archivos.enorme);
  prueba('un archivo de más de 15 MB se rechaza antes de procesarlo', /pesa demasiado/.test(await A.texto()) && !(await A.visible('Vista previa de la captura')));

  console.log('Vista previa, quitar y volver a poner');
  await A.elegirArchivo(archivos.jpgExif);
  t = await A.texto();
  prueba('una foto JPG con EXIF/GPS se acepta y se ve la vista previa con sus datos', (await A.visible('Vista previa de la captura')) && /Captura lista · \d+ × \d+ px · \d+ KB/.test(t) && /sin datos ocultos/.test(t), t.slice(t.indexOf('Captura lista') - 5, t.indexOf('Captura lista') + 120));
  const vista = await A.js(`(()=>{const e=document.querySelector('[aria-label="Vista previa de la captura"]'); if(!e) return null; const r=e.getBoundingClientRect(); const bg=getComputedStyle(e).backgroundImage; return {ancho:Math.round(r.width), alto:Math.round(r.height), blob:/blob:/.test(bg)||[...e.querySelectorAll('img')].some(i=>/^blob:/.test(i.src))}})()`);
  prueba('la vista previa es una imagen local (blob:) con tamaño visible', vista && vista.blob && vista.ancho > 100 && vista.alto > 50, vista);
  await A.clic('🗑️ Quitar la captura');
  prueba('«Quitar la captura» elimina la vista previa y vuelve a ofrecer añadirla', !(await A.visible('Vista previa de la captura')) && /Añadir una captura/.test(await A.texto()));
  await A.elegirArchivo(archivos.jpgExif);
  prueba('se puede volver a elegir la captura', await A.visible('Vista previa de la captura'));

  console.log('Enviar con captura (JPG con EXIF)');
  await A.rellenar('[aria-label="Tu mensaje"]', 'Mi nombre es Pepe Perez y la gráfica no carga, mira la captura');
  await A.clic('Enviar', -1);
  await espera(3500);
  prueba('se confirma el envío', /Lo hemos recibido/.test(await A.texto()), (await A.texto()).slice(0, 200));
  const lista = await objetos();
  const ruta1 = lista.find((x) => x.startsWith(`opiniones-adjuntos/${uid}/`));
  prueba('la captura se subió al bucket privado, a SU carpeta, con nombre uuid.jpg', !!ruta1 && new RegExp(`^opiniones-adjuntos/${uid}/[0-9a-f-]{36}\\.jpg$`).test(ruta1), lista);
  const o1 = ruta1 ? await objeto(ruta1) : null;
  const b1 = o1 ? Buffer.from(o1.base64, 'base64') : Buffer.alloc(0);
  prueba('lo subido es JPG, SIN metadatos (ni EXIF ni GPS ni autor), y pesa menos de 2 MB', o1?.tipo === 'image/jpeg' && b1[0] === 0xff && b1[1] === 0xd8 && !tieneMetadatos(b1) && !b1.includes('GPSLatitude') && !b1.includes('Pepe') && b1.length <= 2 * 1024 * 1024, { tipo: o1?.tipo, bytes: b1.length, meta: tieneMetadatos(b1) });
  const fila1 = (await sql(`select adjunto, texto, estado from public.beta_opiniones order by creado`)).at(-1);
  prueba('la opinión queda guardada y enlazada a esa captura', fila1?.adjunto === ruta1?.replace('opiniones-adjuntos/', '') && fila1?.estado === 'nueva', fila1);

  console.log('El aviso (con secreto configurado en Vault)');
  // Se configura el secreto como lo haría el titular; a partir de aquí cada opinión nueva debe producir UN aviso sin datos sensibles.
  await sql(`insert into vault._secretos values ('aviso_opiniones_url', 'https://proyecto.supabase.co/functions/v1/avisar-opinion'), ('aviso_opiniones_secreto', 'secreto-de-prueba-largo-0123456789abcdef')`);
  await A.clic('Cerrar', 0);
  await A.clic('💬 Ayuda y opiniones');

  console.log('Enviar con captura PNG con texto; segunda opinión con aviso');
  await A.clic('💡 Una sugerencia');
  await A.elegirArchivo(archivos.pngTexto);
  prueba('un PNG con texto incrustado se acepta y se ve la vista previa', await A.visible('Vista previa de la captura'));
  await A.rellenar('[aria-label="Tu mensaje"]', 'Me gustaría ver más gráficas, vivo en la calle Mayor 5');
  await A.clic('Enviar', -1);
  await espera(3500);
  prueba('se confirma el envío del PNG', /Lo hemos recibido/.test(await A.texto()));
  const ruta2 = (await objetos()).find((x) => x.startsWith(`opiniones-adjuntos/${uid}/`) && x.endsWith('.png'));
  const o2 = ruta2 ? await objeto(ruta2) : null;
  const b2 = o2 ? Buffer.from(o2.base64, 'base64') : Buffer.alloc(0);
  prueba('lo subido es PNG sin trozos de texto ni metadatos', o2?.tipo === 'image/png' && !tieneMetadatos(b2) && !b2.includes('Pepe') && !b2.includes('Mayor'), { tipo: o2?.tipo, meta: tieneMetadatos(b2) });
  const llamadas = await sql(`select url, headers, body from net._llamadas order by id`);
  prueba('el aviso: una sola llamada (solo la opinión posterior al secreto), con el secreto en la cabecera', llamadas.length === 1 && llamadas[0].headers['x-forja-aviso'] === 'secreto-de-prueba-largo-0123456789abcdef' && llamadas[0].url.endsWith('/avisar-opinion'), llamadas);
  const cuerpoAviso = JSON.stringify(llamadas[0]?.body ?? {});
  prueba('el aviso NO lleva el texto, el autor, el email, los datos técnicos ni la ruta de la captura, solo si trae captura', ['Pepe', 'Mayor', 'gráficas', uid, CORREO, 'Mozilla', 'opiniones-adjuntos', '.png'].every((x) => !cuerpoAviso.includes(x)) && llamadas[0]?.body?.con_adjunto === true && llamadas[0]?.body?.tipo === 'sugerencia', cuerpoAviso);

  console.log('Fallos y límites');
  await A.clic('Cerrar', 0);
  await A.clic('💬 Ayuda y opiniones');
  await A.elegirArchivo(archivos.webp);
  prueba('una captura WebP se acepta', await A.visible('Vista previa de la captura'));
  await A.rellenar('[aria-label="Tu mensaje"]', 'Prueba de fallo de subida del almacén');
  await A.cmd('Network.setBlockedURLs', { urls: ['*storage/v1/object*'] });
  const antes = (await sql(`select count(*)::int as n from public.beta_opiniones`))[0].n;
  await A.clic('Enviar', -1);
  await espera(3000);
  t = await A.texto();
  prueba('si falla la subida: mensaje claro, NO se crea la opinión, y la captura y el texto siguen ahí para reintentar', /No se pudo subir la captura/.test(t) && (await sql(`select count(*)::int as n from public.beta_opiniones`))[0].n === antes && (await A.visible('Vista previa de la captura')), t.slice(0, 300));
  await A.cmd('Network.setBlockedURLs', { urls: [] });
  await A.clic('Enviar', -1);
  await espera(3500);
  prueba('al volver la red, el reintento funciona sin repetir nada', /Lo hemos recibido/.test(await A.texto()) && (await sql(`select count(*)::int as n from public.beta_opiniones`))[0].n === antes + 1);
  // Cupo: se llenan hasta 10 las capturas de la persona (como administrador) y se intenta una más.
  const ya = (await objetos()).filter((x) => x.startsWith(`opiniones-adjuntos/${uid}/`)).length;
  for (let i = ya; i < 10; i++) await sql(`insert into storage.objects (bucket_id, name, owner_id) values ('opiniones-adjuntos', $1, $2)`, [`${uid}/${crypto.randomUUID()}.jpg`, uid]);
  await A.clic('Cerrar', 0);
  await A.clic('💬 Ayuda y opiniones');
  await A.elegirArchivo(archivos.jpgExif);
  await A.rellenar('[aria-label="Tu mensaje"]', 'Esta ya no debería poder llevar captura');
  const antes2 = (await sql(`select count(*)::int as n from public.beta_opiniones`))[0].n;
  await A.clic('Enviar', -1);
  await espera(3000);
  t = await A.texto();
  prueba('con 10 capturas ya subidas, la 11ª se rechaza con un mensaje claro y no se crea la opinión', /máximo de 10 capturas/.test(t) && (await sql(`select count(*)::int as n from public.beta_opiniones`))[0].n === antes2, t.slice(0, 300));
  await A.clic('🗑️ Quitar la captura');
  await A.clic('Enviar', -1);
  await espera(3000);
  prueba('sin captura la opinión se envía igualmente (también con el cupo lleno)', /Lo hemos recibido/.test(await A.texto()));

  console.log('Imagen grande: se reduce');
  await A.clic('Cerrar', 0);
  await A.clic('💬 Ayuda y opiniones');
  await A.elegirArchivo(archivos.grande);
  t = await A.texto();
  const dim = t.match(/Captura lista · (\d+) × (\d+) px · (\d+(?:,\d)?) (KB|MB)( · reducida)?/);
  prueba('una foto de más de 2 MB se reduce a ≤ 1600 px y ≤ 2 MB y lo dice', !!dim && Math.max(+dim[1], +dim[2]) <= 1600 && (dim[4] === 'KB' || parseFloat(dim[3].replace(',', '.')) <= 2) && !!dim[5], t.slice(t.indexOf('Captura lista') - 5, t.indexOf('Captura lista') + 120));

  console.log('Acceso al almacén');
  const token = await A.js(`(()=>{const k=Object.keys(localStorage).find(x=>/^sb-.*-auth-token$/.test(x)); try { return JSON.parse(localStorage.getItem(k)).access_token } catch { return null }})()`);
  const publica = await fetch(`${API}/storage/v1/object/public/opiniones-adjuntos/${ruta1.replace('opiniones-adjuntos/', '')}`);
  const conSesion = await fetch(`${API}/storage/v1/object/opiniones-adjuntos/${ruta1.replace('opiniones-adjuntos/', '')}`, { headers: { authorization: `Bearer ${token}` } });
  prueba('por URL pública el bucket privado no responde con la imagen', !publica.ok && /Bucket not found|not_found/.test(await publica.text()));
  prueba('ni siquiera la propia persona puede leerla por la API', !conSesion.ok);
  prueba('en todo el uso, la app NO ha leído nada del almacén (solo subidas con POST)', !A.peticiones.some((p) => /storage\/v1/.test(p.url) && p.metodo !== 'POST' && p.metodo !== 'OPTIONS'), A.peticiones.filter((p) => /storage\/v1/.test(p.url)).map((p) => p.metodo + ' ' + p.url.slice(-40)));
  const mono = await A.js(`document.documentElement.scrollWidth <= innerWidth + 1`);
  prueba('la pantalla de ayuda con la captura no se desborda en móvil', mono === true);
  prueba('sin errores de JavaScript', A.errores.length === 0, A.errores.slice(0, 2));
} finally {
  await A.cerrar();
}
console.log(`\n${ok} comprobaciones correctas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
