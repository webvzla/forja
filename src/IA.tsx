// Todo lo que usa la IA: leer tickets, recetas y el chat del coach.
// Los macros SIEMPRE se calculan con el catálogo de la app, no con lo que diga la IA.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Ingrediente, Linea, Receta, Tipo, Unidad, crearAlimento, macrosDe, porId, todosLosIngredientes } from './alimentos';
import { Datos, Stock, claveDia, nuevoId } from './datos';
import { ErrorIA, pedirIA, pedirJSON, textoErrorIA } from './nube';
import { nutricion } from './reglas';
import { Campo, Pildora, Tarjeta, c } from './ui';

const TIPOS: Tipo[] = ['proteina', 'legumbre', 'lacteo', 'suplemento', 'carbo', 'verdura', 'fruta', 'grasa'];
const UNIDADES: Unidad[] = ['g', 'ml', 'ud'];
const num = (x: unknown, def = 0) => {
  const n = typeof x === 'number' ? x : parseFloat(String(x ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : def;
};
const catalogo = () => todosLosIngredientes().map((x) => `${x.id}: ${x.nombre} (${x.unidad})`).join('\n');

export const textoError = (e: unknown) => textoErrorIA(typeof e === 'string' ? (e as ErrorIA) : 'fallo');

// ---------- Foto → base64 reducida ----------
export async function fotoParaIA(file: File): Promise<{ base64: string; tipo: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, mal) => {
      img.onload = ok;
      img.onerror = mal;
      img.src = url;
    });
    const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return { base64: lienzo.toDataURL('image/jpeg', 0.85).split(',')[1], tipo: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Ticket ----------
export type LineaTicket = { ing: string; cantidad: string; nuevo?: Ingrediente; caduca?: string };

export async function leerTicketIA(file: File): Promise<LineaTicket[]> {
  const imagen = await fotoParaIA(file);
  const r = await pedirJSON<{ items: any[] }>(
    `Analiza esta foto de un ticket de supermercado (probablemente España o Venezuela). Extrae SOLO los alimentos y bebidas (ignora bolsas, limpieza, higiene, mascotas).
Este es el catálogo de la app (id: nombre (unidad)):
${catalogo()}

Para cada alimento devuelve:
- "id": el id del catálogo que mejor encaja (ej. "pechuga de pollo" → "pollo", "skyr" → "yogur"), o null si no hay ninguno parecido
- "nombre": nombre genérico y claro en español
- "cantidad": cantidad TOTAL comprada en la unidad del catálogo (multiplica por las unidades compradas; si el peso no aparece, estima el formato típico)
- "unidad": "g", "ml" o "ud" (la del catálogo si tiene id)
- "dias": días aproximados que dura en casa (fresco 2-5, lácteos 7-15, seco 180)
Solo si "id" es null, añade también: "tipo" (proteina|legumbre|lacteo|suplemento|carbo|verdura|fruta|grasa) y los valores típicos por 100 g/ml (o por unidad si "ud"): "p" (proteína g), "kcal", "h" (carbohidratos g), "g" (grasa g).
Formato: {"items": [ ... ]}`,
    { imagen },
  );
  const suma = new Map<string, LineaTicket>();
  for (const x of r.items ?? []) {
    const cantidad = num(x.cantidad);
    if (!cantidad || !x.nombre) continue;
    const caduca = num(x.dias) ? claveDia(Date.now() + num(x.dias) * 86400000) : undefined;
    const ing = x.id ? porId(String(x.id)) : undefined;
    if (ing) {
      const prev = suma.get(ing.id);
      suma.set(ing.id, { ing: ing.id, cantidad: String(Math.round(cantidad + num(prev?.cantidad))), caduca: prev?.caduca ?? caduca });
      continue;
    }
    const tipo: Tipo = TIPOS.includes(x.tipo) ? x.tipo : 'proteina';
    const unidad: Unidad = UNIDADES.includes(x.unidad) ? x.unidad : 'g';
    const nuevo = { ...crearAlimento(String(x.nombre), tipo, unidad, [num(x.p), num(x.kcal), num(x.h), num(x.g)]), id: `p_${nuevoId()}` };
    suma.set(nuevo.id, { ing: nuevo.id, cantidad: String(Math.round(cantidad)), nuevo, caduca });
  }
  return [...suma.values()];
}

// ---------- Recetas ----------
export async function recetaIA(a: { d: Datos; ids: string[]; raciones: number; prohibido: Set<string>; pedido?: string }): Promise<Receta> {
  const { d } = a;
  const meta = d.perfil ? nutricion(d.perfil) : null;
  const hoy = (d.comida[claveDia()] ?? []).reduce((t, x) => ({ p: t.p + x.proteina, kcal: t.kcal + x.kcal }), { p: 0, kcal: 0 });
  const despensa = d.despensa
    .filter((s) => !a.prohibido.has(s.ing))
    .map((s) => {
      const ing = porId(s.ing);
      return ing ? `${ing.id}: ${ing.nombre}, hay ${Math.round(s.cantidad)} ${ing.unidad}${s.caduca ? `, caduca ${s.caduca}` : ''}` : null;
    })
    .filter(Boolean)
    .join('\n');
  const obligatorios = a.ids.map((id) => porId(id)?.nombre).filter(Boolean);
  const evitar = [...a.prohibido].map((id) => porId(id)?.nombre ?? id).join(', ');

  const r = await pedirJSON<{ titulo: string; sabor?: string; lineas: { id: string; cantidad: number }[]; pasos: string[] }>(
    `Eres cocinero y nutricionista deportivo. Crea UNA receta casera en español para ${a.raciones} ${a.raciones === 1 ? 'ración' : 'raciones'}.
${obligatorios.length ? `Ingredientes obligatorios: ${obligatorios.join(', ')}.` : 'Elige tú de la despensa, priorizando lo que caduca antes y la proteína.'}
${a.pedido ? `Lo que le apetece: ${a.pedido}.` : ''}
Despensa (id: nombre, cantidad):
${despensa || '(vacía)'}
${evitar ? `NO uses nunca: ${evitar}.` : ''}
${meta ? `Su meta diaria: ${meta.proteina} g de proteína y ${meta.kcal} kcal. Hoy lleva ${Math.round(hoy.p)} g y ${Math.round(hoy.kcal)} kcal. Una ración debería aportar unos ${Math.max(20, Math.min(55, Math.round(meta.proteina / 3)))} g de proteína.` : ''}
Usa ingredientes de la despensa (puedes añadir del catálogo si falta algo esencial). Sal, pimienta, especias, agua y un chorrito de aceite no cuentan.
Catálogo (id: nombre (unidad)):
${catalogo()}
Formato: {"titulo": "nombre apetecible", "sabor": "estilo o aliño en 3-5 palabras", "lineas": [{"id": "id del catálogo", "cantidad": cantidad TOTAL para todas las raciones en la unidad del catálogo}], "pasos": ["paso corto", "..."]}`,
  );

  const lineas: Linea[] = [];
  for (const l of r.lineas ?? []) {
    const ing = porId(String(l.id));
    const pedido = num(l.cantidad);
    if (!ing || !pedido || a.prohibido.has(ing.id) || lineas.some((x) => x.ing === ing.id)) continue;
    const stock = d.despensa.find((s: Stock) => s.ing === ing.id)?.cantidad ?? 0;
    lineas.push({ ing: ing.id, nombre: ing.nombre, cantidad: stock > 0 ? Math.min(pedido, stock) : pedido, unidad: ing.unidad, enStock: stock > 0 });
  }
  if (!lineas.length || !Array.isArray(r.pasos) || !r.pasos.length) throw 'fallo';
  const suma = lineas.reduce(
    (t, l) => {
      const m = macrosDe(porId(l.ing)!, l.cantidad / a.raciones);
      return { p: t.p + m.p, kcal: t.kcal + m.kcal, h: t.h + m.h, g: t.g + m.g };
    },
    { p: 0, kcal: 0, h: 0, g: 0 },
  );
  return {
    titulo: String(r.titulo || 'Receta del coach'),
    sabor: String(r.sabor || 'idea de la IA'),
    lineas,
    pasos: r.pasos.map(String).slice(0, 12),
    raciones: a.raciones,
    ...suma,
    nota: suma.p < 20 ? `Solo ${Math.round(suma.p)} g de proteína por ración: añade huevo, atún, pollo o yogur.` : null,
    opciones: 1,
  };
}

// ---------- Chat con el coach ----------
export function ChatCoach({ d }: { d: Datos }) {
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [cargando, setCargando] = useState(false);

  const preguntar = async () => {
    const q = pregunta.trim();
    if (!q || cargando) return;
    setCargando(true);
    setRespuesta('');
    const meta = d.perfil ? nutricion(d.perfil) : null;
    const contexto = {
      perfil: d.perfil && { sexo: d.perfil.sexo, edad: d.perfil.edad, altura: d.perfil.altura, peso: d.perfil.peso, objetivo: d.perfil.objetivo, dias: d.perfil.dias, nivel: d.perfil.nivel, equipo: d.perfil.equipo },
      metas: meta && { kcal: meta.kcal, proteina: meta.proteina },
      hoy: (d.comida[claveDia()] ?? []).map((x) => `${x.nombre} (${Math.round(x.proteina)} g prot)`),
      despensa: d.despensa.map((s) => porId(s.ing)?.nombre).filter(Boolean),
      ultimosEntrenos: d.sesiones.slice(0, 5).map((s) => ({ fecha: claveDia(s.fecha), rutina: s.rutinaNombre })),
      plan: d.rutinas.filter((r) => r.deCoach).map((r) => r.nombre),
    };
    try {
      const t = await pedirIA(
        `Eres el coach personal de la app Mi Gym: entrenador y nutricionista práctico. Responde en español, en menos de 120 palabras, concreto y accionable, sin markdown ni listas largas. Si es un tema médico o una lesión, recomienda ver a un profesional.
Datos del usuario: ${JSON.stringify(contexto)}
Pregunta: ${q}`,
      );
      setRespuesta(t.replace(/\*\*/g, '').trim());
    } catch (e) {
      setRespuesta(textoError(e));
    }
    setCargando(false);
  };

  return (
    <Tarjeta>
      <Text style={e.titulo}>Pregúntale al coach</Text>
      <Text style={e.sub}>Conoce tu perfil, tu despensa y tus entrenos.</Text>
      <Campo
        accessibilityLabel="Pregunta para el coach"
        placeholder="¿Qué ceno si mañana entreno pierna?"
        value={pregunta}
        onChangeText={setPregunta}
        onSubmitEditing={preguntar}
        multiline
      />
      <Pildora chica texto={cargando ? 'Pensando…' : 'Preguntar'} deshabilitado={cargando || !pregunta.trim()} onPress={preguntar} />
      {respuesta ? (
        <View style={e.respuesta}>
          <Text style={e.texto}>{respuesta}</Text>
        </View>
      ) : null}
    </Tarjeta>
  );
}

const e = StyleSheet.create({
  titulo: { color: c.texto, fontSize: 19, fontWeight: '900' },
  sub: { color: c.suave, fontSize: 15, lineHeight: 21 },
  respuesta: { backgroundColor: c.campo, borderRadius: 14, padding: 12 },
  texto: { color: c.texto, fontSize: 16, lineHeight: 23 },
});
