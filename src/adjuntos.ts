// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Capturas de pantalla opcionales de «Ayuda y opiniones».
//   · Solo JPG, PNG o WebP; 1 por opinión; hasta 2 MB (el mismo tope que el bucket privado del servidor); 10 por persona.
//   · Antes de subirla se REDUCE (lado máximo 1600 px) y se RECODIFICA en el dispositivo: eso borra los metadatos (ubicación, cámara,
//     fecha, miniaturas). Un comprobador (`tieneMetadatos`) lo verifica sobre el archivo final antes de subir.
//   · Nada de esto toca la red salvo la subida a su carpeta privada `<id>/<uuid>.<ext>` (ver supabase/migrations, migración 9).
// Las partes puras (validar, ruta, detectar metadatos, mensajes) se prueban con Node; las que usan el navegador (canvas) se prueban
// en Chrome (scripts/pruebas/e2e-adjuntos.mjs).

export const BUCKET_ADJUNTOS = 'opiniones-adjuntos';
export const ADJUNTO_MAX_BYTES = 2 * 1024 * 1024; // lo que se sube
export const ENTRADA_MAX_BYTES = 15 * 1024 * 1024; // lo máximo que se acepta elegir (después se reduce)
export const LADO_MAX = 1600;
export const MAX_CAPTURAS_POR_PERSONA = 10;
export const TIPOS_ADJUNTO = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type TipoAdjunto = (typeof TIPOS_ADJUNTO)[number];

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const extensionDe = (tipo: string): string | null => EXT[tipo] ?? null;

export function formatoBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

// Mensaje de error (o null si vale) para el archivo que se acaba de elegir, antes de procesarlo.
export function validarEntrada(tipo: string, bytes: number): string | null {
  if (!(TIPOS_ADJUNTO as readonly string[]).includes(tipo)) return 'Solo se admiten imágenes JPG, PNG o WebP.';
  if (bytes <= 0) return 'El archivo está vacío.';
  if (bytes > ENTRADA_MAX_BYTES) return `La imagen pesa demasiado (máximo ${formatoBytes(ENTRADA_MAX_BYTES)} antes de reducirla).`;
  return null;
}

const UUID_V4 = () => {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export const uuidNuevo = UUID_V4;

// Ruta en el almacén: `<id de la persona>/<uuid>.<ext>` (es lo único que permite la política del servidor).
export function rutaAdjunto(uid: string, uuid: string, tipo: string): string {
  const ext = extensionDe(tipo);
  if (!ext) throw new Error('tipo no admitido');
  return `${uid}/${uuid}.${ext}`;
}

// ¿Lleva metadatos el archivo? (EXIF, XMP, IPTC, comentarios, textos de PNG, fecha). Mira solo la estructura, no pinta nada.
export function tieneMetadatos(b: Uint8Array): boolean {
  const ascii = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return false;
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xda || m === 0xd9) return false; // empieza la imagen
      const len = (b[i + 2] << 8) | b[i + 3];
      if (m === 0xe1 && (ascii(i + 4, 4) === 'Exif' || ascii(i + 4, 28).startsWith('http://ns.adobe.com/xap'))) return true;
      if (m === 0xed || m === 0xfe) return true; // APP13 (IPTC/Photoshop) y comentarios
      if (m >= 0xe3 && m <= 0xef && m !== 0xee) return true; // otros APPn con datos de aplicaciones
      i += 2 + len;
    }
    return false;
  }
  // PNG
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') {
    let i = 8;
    while (i + 8 <= b.length) {
      const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
      const tipo = ascii(i + 4, 4);
      if (['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'].includes(tipo)) return true;
      if (tipo === 'IEND') return false;
      i += 12 + len;
    }
    return false;
  }
  // WebP (RIFF)
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    let i = 12;
    while (i + 8 <= b.length) {
      const tipo = ascii(i, 4);
      const len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24);
      if (tipo === 'EXIF' || tipo === 'XMP ') return true;
      i += 8 + len + (len & 1);
    }
    return false;
  }
  return false;
}

// Mensaje claro para los errores del almacén (no se enseñan textos técnicos).
export function mensajeErrorSubida(msg: string): string {
  const m = (msg ?? '').toLowerCase();
  if (/row-level security|unauthorized|403/.test(m)) return `No se pudo subir la captura: has llegado al máximo de ${MAX_CAPTURAS_POR_PERSONA} capturas de la beta. Envía la opinión sin captura o escríbenos por correo.`;
  if (/exceeded|too large|413|size/.test(m)) return 'La captura pesa demasiado. Prueba con otra más pequeña.';
  if (/mime|not supported|415|invalid/.test(m)) return 'Ese tipo de archivo no está admitido. Usa JPG, PNG o WebP.';
  if (/duplicate|exists|409/.test(m)) return 'Esa captura ya estaba subida. Vuelve a intentarlo.';
  return 'No se pudo subir la captura. Revisa tu conexión o quítala y envía la opinión sin ella.';
}

// ---- Solo navegador: reducir y recodificar (borra los metadatos) ----
export type ImagenLimpia = { blob: Blob; tipo: TipoAdjunto; ancho: number; alto: number; reducida: boolean };

async function cargar(entrada: Blob): Promise<{ dibujable: CanvasImageSource; ancho: number; alto: number; cerrar: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(entrada, { imageOrientation: 'from-image' });
      return { dibujable: bmp, ancho: bmp.width, alto: bmp.height, cerrar: () => bmp.close() };
    } catch {
      /* se prueba con <img> */
    }
  }
  const url = URL.createObjectURL(entrada);
  try {
    const img = new Image();
    await new Promise<void>((ok, mal) => { img.onload = () => ok(); img.onerror = () => mal(new Error('imagen no válida')); img.src = url; });
    return { dibujable: img, ancho: img.naturalWidth, alto: img.naturalHeight, cerrar: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const aBlob = (c: HTMLCanvasElement, tipo: string, calidad?: number) => new Promise<Blob | null>((r) => c.toBlob(r, tipo, calidad));

export async function limpiarImagen(entrada: Blob): Promise<ImagenLimpia> {
  const original = await cargar(entrada);
  try {
    const mayor = Math.max(original.ancho, original.alto);
    let escala = Math.min(1, LADO_MAX / mayor);
    // Se prueba primero con el mismo formato (una captura PNG se queda PNG); si pesa demasiado, JPEG con menos calidad y más pequeña.
    const preferido = (TIPOS_ADJUNTO as readonly string[]).includes(entrada.type) ? entrada.type : 'image/jpeg';
    const intentos: [string, number | undefined][] = preferido === 'image/png' ? [['image/png', undefined], ['image/jpeg', 0.88], ['image/jpeg', 0.75], ['image/jpeg', 0.6]]
      : preferido === 'image/webp' ? [['image/webp', 0.9], ['image/webp', 0.75], ['image/jpeg', 0.75]] : [['image/jpeg', 0.9], ['image/jpeg', 0.8], ['image/jpeg', 0.65]];
    for (let paso = 0; paso < 5; paso++) {
      const ancho = Math.max(1, Math.round(original.ancho * escala));
      const alto = Math.max(1, Math.round(original.alto * escala));
      const lienzo = document.createElement('canvas');
      lienzo.width = ancho;
      lienzo.height = alto;
      const ctx = lienzo.getContext('2d');
      if (!ctx) throw new Error('sin lienzo');
      for (const [tipo, calidad] of intentos) {
        ctx.clearRect(0, 0, ancho, alto);
        if (tipo === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ancho, alto); }
        ctx.drawImage(original.dibujable, 0, 0, ancho, alto);
        const blob = await aBlob(lienzo, tipo, calidad);
        if (!blob || !(TIPOS_ADJUNTO as readonly string[]).includes(blob.type)) continue; // el navegador no sabe codificar ese formato
        if (blob.size <= ADJUNTO_MAX_BYTES) return { blob, tipo: blob.type as TipoAdjunto, ancho, alto, reducida: blob.size < entrada.size || escala < 1 };
      }
      escala *= 0.75;
    }
    throw new Error('La imagen sigue pesando demasiado aunque se reduzca.');
  } finally {
    original.cerrar();
  }
}
