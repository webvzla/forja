// Funciones que solo existen en la versión web instalable.
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

export function elegirArchivo(accept: string): Promise<File | null> {
  return new Promise((resolver) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    const fin = (f: File | null) => {
      input.remove();
      resolver(f);
    };
    input.addEventListener('change', () => fin(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => fin(null));
    input.click();
  });
}

function cargarTesseract(): Promise<any> {
  const w = window as any;
  if (w.Tesseract) return Promise.resolve(w.Tesseract);
  return new Promise((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = TESSERACT;
    s.onload = () => resolver(w.Tesseract);
    s.onerror = () => rechazar(new Error('sin conexión'));
    document.head.appendChild(s);
  });
}

// Reduce la foto y la pasa a blanco y negro: se lee mejor y el iPhone no se queda sin memoria.
async function prepararImagen(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, mal) => {
      img.onload = ok;
      img.onerror = mal;
      img.src = url;
    });
    const escala = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    const ctx = lienzo.getContext('2d')!;
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const d = datos.data;
    for (let i = 0; i < d.length; i += 4) {
      const gris = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = Math.max(0, Math.min(255, (gris - 128) * 1.5 + 128));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(datos, 0, 0);
    return lienzo;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function leerTicket(file: File, progreso: (p: number) => void): Promise<string> {
  const Tesseract = await cargarTesseract();
  const imagen = await prepararImagen(file);
  const worker = await Tesseract.createWorker('spa', 1, {
    logger: (m: any) => m.status === 'recognizing text' && progreso(m.progress),
  });
  try {
    const { data } = await worker.recognize(imagen);
    return data.text as string;
  } finally {
    await worker.terminate();
  }
}

export async function compartirTexto(texto: string): Promise<'compartido' | 'copiado' | 'cancelado'> {
  const n = navigator as any;
  if (n.share) {
    try {
      await n.share({ text: texto });
      return 'compartido';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelado';
    }
  }
  await navigator.clipboard.writeText(texto);
  return 'copiado';
}

export async function exportarCopia(contenido: string) {
  const nombre = `mi-gym-${new Date().toISOString().slice(0, 10)}.json`;
  const archivo = new File([contenido], nombre, { type: 'application/json' });
  const n = navigator as any;
  if (n.canShare?.({ files: [archivo] })) {
    try {
      await n.share({ files: [archivo], title: 'Copia de Mi Gym' });
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
