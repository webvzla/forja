// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Lógica PURA de la función `avisar-opinion` (sin Deno ni red): validar el aviso que manda el disparador, comprobar el secreto
// compartido y construir el correo. Se prueba con Node (scripts/pruebas/avisar-opinion.test.mjs).
// El correo NUNCA lleva el texto de la opinión, ni datos de la persona, ni entrenos: solo tipo, versión, fecha, si trae captura
// y un enlace al panel de Supabase (que exige la sesión del titular).

export type Aviso = { id: string; tipo: 'error' | 'entreno' | 'sugerencia' | 'valoracion'; version: string; con_adjunto: boolean; creado: string; tabla: number | null };

const TIPOS: Record<string, string> = { error: 'Un error', entreno: 'Problema con un entreno', sugerencia: 'Una sugerencia', valoracion: 'Valoración' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Comparación en tiempo constante; el secreto esperado debe existir y tener al menos 32 caracteres.
export function secretoValido(recibido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!esperado || esperado.length < 32 || typeof recibido !== 'string') return false;
  const a = new TextEncoder().encode(recibido);
  const b = new TextEncoder().encode(esperado);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return d === 0;
}

// Se queda SOLO con los campos esperados y con la forma esperada: lo demás se descarta. Devuelve null si algo no cuadra.
export function validarAviso(x: unknown): Aviso | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || !UUID.test(o.id)) return null;
  if (typeof o.tipo !== 'string' || !(o.tipo in TIPOS)) return null;
  if (typeof o.version !== 'string' || !/^[0-9A-Za-z.+-]{1,40}$/.test(o.version)) return null;
  if (typeof o.con_adjunto !== 'boolean') return null;
  if (typeof o.creado !== 'string' || Number.isNaN(Date.parse(o.creado))) return null;
  const tabla = typeof o.tabla === 'number' && Number.isInteger(o.tabla) && o.tabla > 0 ? o.tabla : null;
  return { id: o.id, tipo: o.tipo as Aviso['tipo'], version: o.version, con_adjunto: o.con_adjunto, creado: new Date(o.creado).toISOString(), tabla };
}

export const enlacePanel = (ref: string | null | undefined, aviso: Aviso): string | null => {
  if (!ref || !/^[a-z0-9]{20}$/.test(ref)) return null;
  const base = `https://supabase.com/dashboard/project/${ref}`;
  return aviso.tabla ? `${base}/editor/${aviso.tabla}?filter=${encodeURIComponent(`id:eq:${aviso.id}`)}` : `${base}/editor`;
};

export function construirCorreo(aviso: Aviso, ref: string | null | undefined): { asunto: string; texto: string; html: string } {
  const tipo = TIPOS[aviso.tipo];
  const cuando = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(aviso.creado));
  const enlace = enlacePanel(ref, aviso);
  const lineas = [
    'Hay una opinión nueva en FORJA BETA.',
    '',
    `Tipo: ${tipo}`,
    `Versión de la app: ${aviso.version}`,
    `Recibida: ${cuando} (hora de Madrid)`,
    `Trae captura de pantalla: ${aviso.con_adjunto ? 'sí' : 'no'}`,
    `Identificador: ${aviso.id.slice(0, 8)}`,
    '',
    enlace ? `Ábrela en el panel de Supabase (te pedirá tu sesión): ${enlace}` : 'Ábrela en el panel de Supabase → Table Editor → beta_opiniones.',
    aviso.con_adjunto ? 'La captura NO se abre sola: se ve desde Storage → opiniones-adjuntos, cuando tú lo decidas.' : '',
    '',
    'Este aviso no incluye el texto de la opinión, ni datos de la persona, ni sus entrenos.',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '' ));
  const texto = lineas.join('\n');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:22px;color:#14161a">${lineas
    .map((l) => (l.startsWith('Ábrela en el panel de Supabase (te pedirá') && enlace ? `<p>Ábrela en el panel de Supabase (te pedirá tu sesión): <a href="${esc(enlace)}">abrir la opinión</a></p>` : l ? `<p>${esc(l)}</p>` : ''))
    .join('')}</div>`;
  return { asunto: `FORJA BETA · Nueva opinión (${tipo.toLowerCase()})`, texto, html };
}
