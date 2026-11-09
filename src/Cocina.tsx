import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Datos, Stock, aNumero, claveDia, formatoNum, nuevoId } from './datos';
import {
  ALERGIAS, Preferencias, Receta, Tipo, Unidad, buscarIngrediente, crearAlimento, diasDeProteina, diasParaCaducar, fechaCorta,
  generarMenu, generarReceta, leerTextoTicket, listaCompra, parsearFecha, porId, prohibidos, seAcaba, sugerirIngredientes, textoCantidad,
} from './alimentos';
import { NOMBRE_DIA, diaHoy, nutricion } from './reglas';
import { compartirTexto, elegirArchivo, leerTicket } from './web';
import { Campo, Dialogo, Pildora, Tarjeta, c } from './ui';

type Actualizar = (f: (d: Datos) => Datos) => void;
export type Preset = { ids: string[]; variante: number; dia: number; comida: number; n: number };

const sumar = (despensa: Stock[], ing: string, cantidad: number) =>
  despensa.some((s) => s.ing === ing)
    ? despensa.map((s) => (s.ing === ing ? { ...s, cantidad: s.cantidad + cantidad } : s))
    : [...despensa, { ing, cantidad }];

function Chips<T extends string>(p: { opciones: [T, string][]; activo: (v: T) => boolean; onPulsar: (v: T) => void }) {
  return (
    <View style={e.chips}>
      {p.opciones.map(([v, texto]) => {
        const on = p.activo(v);
        return (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityLabel={texto}
            accessibilityState={{ selected: on }}
            onPress={() => p.onPulsar(v)}
            style={[e.chip, on && { backgroundColor: c.oro }]}
          >
            <Text style={[e.chipTexto, on && { color: c.sobreOro }]}>{texto}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FilaStock(p: { s: Stock; onCantidad: (n: number) => void; onCaduca: (f?: string) => void; onQuitar: () => void }) {
  const ing = porId(p.s.ing);
  const [texto, setTexto] = useState(String(p.s.cantidad));
  const [fecha, setFecha] = useState(p.s.caduca ? fechaCorta(p.s.caduca) : '');
  if (!ing) return null;
  const dias = diasParaCaducar(p.s);
  const aviso = dias === null ? null : dias < 0 ? 'Caducado' : dias === 0 ? 'Caduca hoy' : dias <= 3 ? `Caduca en ${dias} ${dias === 1 ? 'día' : 'días'}` : null;
  return (
    <View style={e.itemColumna}>
      <View style={e.fila}>
        <View style={{ flex: 1 }}>
          <Text style={e.nombre}>{ing.nombre}</Text>
          {aviso ? <Text style={{ color: c.rojo, fontSize: 13, fontWeight: '700' }}>{aviso}</Text> : null}
          {seAcaba(p.s) ? <Text style={{ color: c.oro, fontSize: 13, fontWeight: '700' }}>Se está acabando</Text> : null}
        </View>
        <Campo
          accessibilityLabel={`Cantidad de ${ing.nombre}`}
          style={e.cantidad}
          keyboardType="decimal-pad"
          value={texto}
          onChangeText={setTexto}
          onBlur={() => {
            const n = aNumero(texto);
            setTexto(String(n));
            p.onCantidad(n);
          }}
        />
        <Text style={e.unidad}>{ing.unidad}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${ing.nombre}`} style={e.quitar} onPress={p.onQuitar}>
          <Text style={{ color: c.rojo, fontSize: 22, fontWeight: '800' }}>×</Text>
        </Pressable>
      </View>
      <View style={e.fila}>
        <Text style={e.sub}>Caduca</Text>
        <Campo
          accessibilityLabel={`Caducidad de ${ing.nombre}`}
          style={e.cantidad}
          placeholder="dd/mm"
          value={fecha}
          onChangeText={setFecha}
          onBlur={() => {
            if (!fecha.trim()) return p.onCaduca(undefined);
            const f = parsearFecha(fecha);
            if (f) p.onCaduca(f);
            else setFecha(p.s.caduca ? fechaCorta(p.s.caduca) : '');
          }}
        />
      </View>
    </View>
  );
}

const TIPOS: [Tipo, string][] = [['proteina', 'Proteína'], ['carbo', 'Carbohidrato'], ['verdura', 'Verdura'], ['fruta', 'Fruta'], ['lacteo', 'Lácteo'], ['grasa', 'Grasa']];
const UNIDADES: [Unidad, string][] = [['g', 'Gramos'], ['ml', 'Mililitros'], ['ud', 'Unidades']];

export function Despensa({ datos: d, onActualizar }: { datos: Datos; onActualizar: Actualizar }) {
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState<{ items: { ing: string; cantidad: string }[]; ignoradas: number } | null>(null);
  const [nombre, setNombre] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [aviso, setAviso] = useState('');
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Tipo>('proteina');
  const [unidad, setUnidad] = useState<Unidad>('g');
  const [valores, setValores] = useState({ p: '', kcal: '', h: '', g: '' });
  const meta = d.perfil ? nutricion(d.perfil).proteina : 0;
  const dias = diasDeProteina(d.despensa, meta);
  const orden = [...d.despensa].sort((a, b) => (diasParaCaducar(a) ?? 9999) - (diasParaCaducar(b) ?? 9999));

  const escanear = async () => {
    setError('');
    const f = await elegirArchivo('image/*');
    if (!f) return;
    setEstado('Preparando el lector…');
    try {
      const texto = await leerTicket(f, (x) => setEstado(`Leyendo el ticket… ${Math.round(x * 100)} %`));
      const r = leerTextoTicket(texto);
      if (!r.items.length) setError('No reconocí ningún alimento. Prueba con una foto recta, con buena luz y el ticket entero.');
      else setRevision({ ignoradas: r.ignoradas, items: r.items.map((x) => ({ ing: x.ing, cantidad: String(x.cantidad) })) });
    } catch {
      setError('No pude leer el ticket. La primera vez necesita internet para preparar el lector.');
    }
    setEstado(null);
  };

  const anadir = () => {
    const ing = buscarIngrediente(nombre);
    if (!ing) {
      setAviso('');
      setNuevo(nombre.trim());
      return;
    }
    const n = aNumero(cantidad) || ing.compra;
    onActualizar((x) => ({ ...x, despensa: sumar(x.despensa, ing.id, n) }));
    setAviso(`Añadido: ${ing.nombre}, ${textoCantidad(n, ing.unidad)}.`);
    setNombre('');
    setCantidad('');
  };

  const guardarNuevo = () => {
    const ing = crearAlimento(nuevo ?? '', tipo, unidad, [aNumero(valores.p), aNumero(valores.kcal), aNumero(valores.h), aNumero(valores.g)]);
    const n = aNumero(cantidad) || ing.compra;
    onActualizar((x) => ({ ...x, misAlimentos: [...x.misAlimentos, ing], despensa: sumar(x.despensa, ing.id, n) }));
    setAviso(`Creado y añadido: ${ing.nombre}.`);
    setNuevo(null);
    setNombre('');
    setCantidad('');
    setValores({ p: '', kcal: '', h: '', g: '' });
  };

  return (
    <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
      {Platform.OS === 'web' ? (
        <Tarjeta>
          <Text style={e.titulo}>Escanea tu ticket</Text>
          <Text style={e.sub}>Foto recta y con buena luz. La imagen se lee en tu móvil y no se envía a ningún sitio.</Text>
          <Pildora texto={estado ?? 'Hacer foto del ticket'} deshabilitado={!!estado} onPress={escanear} />
          {error ? <Text style={e.error}>{error}</Text> : null}
        </Tarjeta>
      ) : null}

      <Tarjeta>
        <Text style={e.titulo}>Añadir a mano</Text>
        <Campo accessibilityLabel="Alimento" placeholder="Alimento (ej. pollo)" value={nombre} onChangeText={setNombre} />
        <View style={e.fila}>
          <Campo accessibilityLabel="Cantidad" style={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Cantidad (g, ml o ud)" value={cantidad} onChangeText={setCantidad} />
          <Pildora chica texto="Añadir" deshabilitado={!nombre.trim()} onPress={anadir} />
        </View>
        {aviso ? <Text style={e.sub}>{aviso}</Text> : null}
      </Tarjeta>

      <Text style={e.seccion}>Mi despensa</Text>
      {meta > 0 && d.despensa.length ? (
        <Text style={e.sub}>Tienes proteína para unos {formatoNum(Math.round(dias * 10) / 10)} días de tu meta.</Text>
      ) : null}
      {!d.despensa.length ? <Text style={e.sub}>Vacía. Escanea un ticket o añade algo a mano.</Text> : null}
      {orden.map((s) => (
        <FilaStock
          key={`${s.ing}-${s.cantidad}`}
          s={s}
          onCantidad={(n) => onActualizar((x) => ({ ...x, despensa: x.despensa.map((y) => (y.ing === s.ing ? { ...y, cantidad: n } : y)) }))}
          onCaduca={(f) => onActualizar((x) => ({ ...x, despensa: x.despensa.map((y) => (y.ing === s.ing ? { ...y, caduca: f } : y)) }))}
          onQuitar={() => onActualizar((x) => ({ ...x, despensa: x.despensa.filter((y) => y.ing !== s.ing) }))}
        />
      ))}

      {nuevo !== null ? (
        <Dialogo
          titulo={`Crear "${nuevo}"`}
          mensaje="Mira la etiqueta del producto. Es la primera vez que lo guardas."
          si="Guardar alimento"
          no="Cancelar"
          onSi={guardarNuevo}
          onNo={() => setNuevo(null)}
        >
          <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 10 }}>
            <Chips opciones={TIPOS} activo={(v) => v === tipo} onPulsar={setTipo} />
            <Chips opciones={UNIDADES} activo={(v) => v === unidad} onPulsar={setUnidad} />
            <Text style={e.sub}>Valores por {unidad === 'ud' ? 'unidad' : `100 ${unidad}`}</Text>
            <View style={e.fila}>
              <Campo accessibilityLabel="Proteína del alimento" style={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Proteína" value={valores.p} onChangeText={(p) => setValores({ ...valores, p })} />
              <Campo accessibilityLabel="Calorías del alimento" style={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Calorías" value={valores.kcal} onChangeText={(kcal) => setValores({ ...valores, kcal })} />
            </View>
            <View style={e.fila}>
              <Campo accessibilityLabel="Carbohidratos del alimento" style={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Carbos" value={valores.h} onChangeText={(h) => setValores({ ...valores, h })} />
              <Campo accessibilityLabel="Grasa del alimento" style={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Grasa" value={valores.g} onChangeText={(g) => setValores({ ...valores, g })} />
            </View>
          </ScrollView>
        </Dialogo>
      ) : null}

      {revision ? (
        <Dialogo
          titulo="Revisa tu compra"
          mensaje={`Corrige lo que haga falta.${revision.ignoradas ? ` Líneas sin reconocer: ${revision.ignoradas}.` : ''}`}
          si="Guardar en la despensa"
          no="Descartar"
          onSi={() => {
            onActualizar((x) => ({
              ...x,
              despensa: revision.items.reduce((acc, it) => (aNumero(it.cantidad) > 0 ? sumar(acc, it.ing, aNumero(it.cantidad)) : acc), x.despensa),
            }));
            setRevision(null);
          }}
          onNo={() => setRevision(null)}
        >
          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 8 }}>
            {revision.items.map((it, k) => (
              <View key={it.ing} style={e.fila}>
                <Text style={[e.nombre, { flex: 1 }]}>{porId(it.ing)?.nombre}</Text>
                <Campo
                  accessibilityLabel={`Cantidad comprada de ${porId(it.ing)?.nombre}`}
                  style={e.cantidad}
                  keyboardType="decimal-pad"
                  value={it.cantidad}
                  onChangeText={(t) => setRevision({ ...revision, items: revision.items.map((y, n) => (n === k ? { ...y, cantidad: t } : y)) })}
                />
                <Text style={e.unidad}>{porId(it.ing)?.unidad}</Text>
              </View>
            ))}
          </ScrollView>
        </Dialogo>
      ) : null}
    </ScrollView>
  );
}

function PanelPreferencias({ pref, onCambio }: { pref: Preferencias; onCambio: (p: Preferencias) => void }) {
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState('');
  return (
    <View style={{ gap: 10 }}>
      <Text style={e.nombre}>Dieta</Text>
      <Chips
        opciones={[['todo', 'Como de todo'], ['vegetariana', 'Vegetariana'], ['vegana', 'Vegana']]}
        activo={(v) => v === pref.dieta}
        onPulsar={(dieta) => onCambio({ ...pref, dieta })}
      />
      <Text style={e.nombre}>Alergias</Text>
      <Chips
        opciones={Object.keys(ALERGIAS).map((g): [string, string] => [g, g])}
        activo={(g) => pref.grupos.includes(g)}
        onPulsar={(g) => onCambio({ ...pref, grupos: pref.grupos.includes(g) ? pref.grupos.filter((x) => x !== g) : [...pref.grupos, g] })}
      />
      <Text style={e.nombre}>No me gusta</Text>
      <View style={e.fila}>
        <Campo accessibilityLabel="Alimento que no te gusta" style={{ flex: 1 }} placeholder="Ej. cebolla" value={texto} onChangeText={setTexto} />
        <Pildora
          chica
          tipo="neutro"
          texto="Añadir"
          deshabilitado={!texto.trim()}
          onPress={() => {
            const ing = buscarIngrediente(texto);
            if (!ing) return setAviso(`No conozco "${texto.trim()}".`);
            setAviso('');
            setTexto('');
            if (!pref.noGusta.includes(ing.id)) onCambio({ ...pref, noGusta: [...pref.noGusta, ing.id] });
          }}
        />
      </View>
      {aviso ? <Text style={e.error}>{aviso}</Text> : null}
      {pref.noGusta.length ? (
        <Chips
          opciones={pref.noGusta.map((id): [string, string] => [id, `${porId(id)?.nombre ?? id} ×`])}
          activo={() => false}
          onPulsar={(id) => onCambio({ ...pref, noGusta: pref.noGusta.filter((x) => x !== id) })}
        />
      ) : null}
      <Text style={e.nota}>Si tienes una alergia, revisa siempre las etiquetas: esto solo filtra los ingredientes de la app.</Text>
    </View>
  );
}

export function Recetas({ datos: d, onActualizar, preset }: { datos: Datos; onActualizar: Actualizar; preset: Preset | null }) {
  const [texto, setTexto] = useState('');
  const [marcados, setMarcados] = useState<string[]>(preset?.ids ?? []);
  const [activos, setActivos] = useState<string[]>(preset?.ids ?? []);
  const [variante, setVariante] = useState(preset?.variante ?? 0);
  const [raciones, setRaciones] = useState(1);
  const [aviso, setAviso] = useState('');
  const [origen, setOrigen] = useState(preset);
  const [verPref, setVerPref] = useState(false);
  const [hecha, setHecha] = useState<{ receta: Receta; deshacer: () => void } | null>(null);

  const meta = d.perfil ? nutricion(d.perfil) : null;
  const hoy = claveDia();
  const prohibido = prohibidos(d.preferencias);
  const permitidas = activos.filter((x) => !prohibido.has(x));
  const receta = generarReceta({
    ids: permitidas,
    despensa: d.despensa,
    metaProteina: meta?.proteina ?? null,
    metaKcal: meta?.kcal ?? null,
    proteinaHoy: (d.comida[hoy] ?? []).reduce((n, x) => n + x.proteina, 0),
    variante,
    raciones,
  });

  const crear = () => {
    const escritos = texto.split(/,|;|\n|\sy\s/).map((x) => x.trim()).filter(Boolean);
    const encontrados = escritos.flatMap((x) => buscarIngrediente(x)?.id ?? []);
    const raros = escritos.filter((x) => !buscarIngrediente(x));
    const ids = [...new Set([...marcados, ...encontrados])];
    const evitados = ids.filter((x) => prohibido.has(x)).map((x) => porId(x)?.nombre);
    setAviso(
      [raros.length ? `No conozco: ${raros.join(', ')}.` : '', evitados.length ? `Quitado por tus preferencias: ${evitados.join(', ')}.` : '', !ids.length && !raros.length ? 'Elige o escribe al menos un ingrediente.' : '']
        .filter(Boolean)
        .join(' '),
    );
    setActivos(ids);
    setVariante(0);
    setOrigen(null);
  };

  const sugerir = () => {
    const v = variante + 1;
    const ids = sugerirIngredientes(d.despensa.filter((s) => !prohibido.has(s.ing)), v);
    setAviso(ids.length ? '' : 'Tu despensa está vacía o no encaja con tus preferencias.');
    setMarcados(ids);
    setActivos(ids);
    setVariante(v);
    setOrigen(null);
  };

  const cocinar = (r: Receta) => {
    const comidaId = nuevoId();
    const sobraId = nuevoId();
    const antes = { despensa: d.despensa, menu: d.menu };
    const ref = origen;
    onActualizar((x) => ({
      ...x,
      despensa: x.despensa
        .map((s) => {
          const l = r.lineas.find((y) => y.ing === s.ing);
          return l ? { ...s, cantidad: Math.max(0, Math.round((s.cantidad - l.cantidad) * 100) / 100) } : s;
        })
        .filter((s) => s.cantidad > 0),
      comida: { ...x.comida, [hoy]: [{ id: comidaId, nombre: r.titulo, proteina: r.p, kcal: r.kcal }, ...(x.comida[hoy] ?? [])] },
      sobras: r.raciones > 1 ? [{ id: sobraId, titulo: r.titulo, raciones: r.raciones - 1, proteina: r.p, kcal: r.kcal, fecha: Date.now() }, ...x.sobras] : x.sobras,
      menu: ref && x.menu
        ? x.menu.map((m, i) => (i !== ref.dia ? m : { ...m, comidas: m.comidas.map((y, j) => (j === ref.comida ? { ...y, hecha: true } : y)) }))
        : x.menu,
      recetasHechas: [
        { id: nuevoId(), titulo: r.titulo, ids: r.lineas.map((l) => l.ing), variante, fecha: Date.now() },
        ...x.recetasHechas.filter((y) => y.titulo !== r.titulo),
      ].slice(0, 15),
    }));
    setHecha({
      receta: r,
      deshacer: () =>
        onActualizar((x) => ({
          ...x,
          despensa: antes.despensa,
          menu: antes.menu,
          comida: { ...x.comida, [hoy]: (x.comida[hoy] ?? []).filter((y) => y.id !== comidaId) },
          sobras: x.sobras.filter((y) => y.id !== sobraId),
        })),
    });
    setActivos([]);
    setMarcados([]);
    setTexto('');
    setOrigen(null);
  };

  return (
    <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
      <Tarjeta>
        <Text style={e.titulo}>¿Qué cocinamos?</Text>
        {d.despensa.some((s) => !prohibido.has(s.ing)) ? (
          <Chips
            opciones={d.despensa.filter((s) => !prohibido.has(s.ing)).map((s): [string, string] => [s.ing, porId(s.ing)?.nombre ?? s.ing])}
            activo={(id) => marcados.includes(id)}
            onPulsar={(id) => setMarcados(marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id])}
          />
        ) : null}
        <Campo accessibilityLabel="Ingredientes" placeholder="O escribe: pollo, arroz, tomate" value={texto} onChangeText={setTexto} />
        <Pildora texto="Crear receta" onPress={crear} />
        <Pildora texto="Sorpréndeme con mi despensa" tipo="neutro" onPress={sugerir} />
        {aviso ? <Text style={e.error}>{aviso}</Text> : null}
        <Pildora chica tipo="neutro" texto={verPref ? 'Ocultar alergias y gustos' : 'Alergias y gustos'} onPress={() => setVerPref(!verPref)} />
        {verPref ? <PanelPreferencias pref={d.preferencias} onCambio={(preferencias) => onActualizar((x) => ({ ...x, preferencias }))} /> : null}
      </Tarjeta>

      {receta ? (
        <Tarjeta>
          <Text style={e.receta}>{receta.titulo}</Text>
          <Text style={e.sub}>Con {receta.sabor}</Text>
          <View style={e.macros}>
            <Macro valor={Math.round(receta.kcal)} texto="kcal" />
            <Macro valor={Math.round(receta.p)} texto="proteína" />
            <Macro valor={Math.round(receta.h)} texto="carbos" />
            <Macro valor={Math.round(receta.g)} texto="grasa" />
          </View>
          <Text style={e.sub}>Por ración{receta.raciones > 1 ? ` · las cantidades son para ${receta.raciones}` : ''}</Text>
          {receta.nota ? <Text style={{ color: c.oro, fontSize: 15, lineHeight: 21 }}>{receta.nota}</Text> : null}

          <View style={e.fila}>
            <Text style={[e.nombre, { flex: 1 }]}>Raciones</Text>
            {[1, 2, 3].map((n) => (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`${n} raciones`}
                accessibilityState={{ selected: n === raciones }}
                onPress={() => setRaciones(n)}
                style={[e.racion, n === raciones && { backgroundColor: c.oro }]}
              >
                <Text style={[e.chipTexto, n === raciones && { color: c.sobreOro }]}>{n}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={e.titulo}>Ingredientes</Text>
          {receta.lineas.map((l) => (
            <View key={l.ing} style={e.entre}>
              <Text style={e.linea}>{l.nombre}</Text>
              <Text style={{ color: l.enStock ? c.verde : c.rojo, fontSize: 15, fontWeight: '700' }}>
                {textoCantidad(l.cantidad, l.unidad)}{l.enStock ? '' : ' · te falta'}
              </Text>
            </View>
          ))}

          <Text style={e.titulo}>Pasos</Text>
          {receta.pasos.map((x, k) => (
            <Text key={k} style={e.paso}>{k + 1}. {x}</Text>
          ))}

          <Pildora texto="La hago" onPress={() => cocinar(receta)} />
          <Pildora texto="Otra idea" tipo="neutro" onPress={() => setVariante(variante + 1)} />
          <Text style={e.nota}>
            Al pulsar "La hago" se descuenta de tu despensa y se apunta una ración en tu comida de hoy.
            {receta.raciones > 1 ? ' El resto queda en Sobras.' : ''}
          </Text>
        </Tarjeta>
      ) : null}

      {d.recetasHechas.length ? <Text style={e.seccion}>Repetir</Text> : null}
      {d.recetasHechas.map((r) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          style={e.item}
          onPress={() => {
            setMarcados(r.ids);
            setActivos(r.ids);
            setVariante(r.variante);
            setOrigen(null);
          }}
        >
          <Text style={[e.nombre, { flex: 1, paddingVertical: 12 }]}>{r.titulo}</Text>
        </Pressable>
      ))}

      {hecha ? (
        <Dialogo
          titulo="¡Buen provecho!"
          mensaje={`Apuntado: ${Math.round(hecha.receta.kcal)} kcal y ${Math.round(hecha.receta.p)} g de proteína.${hecha.receta.raciones > 1 ? ` Raciones guardadas en Sobras: ${hecha.receta.raciones - 1}.` : ''}`}
          si="Listo"
          no="Deshacer"
          onSi={() => setHecha(null)}
          onNo={() => {
            hecha.deshacer();
            setHecha(null);
          }}
        >
          {hecha.receta.lineas.filter((l) => l.enStock).map((l) => (
            <Text key={l.ing} style={e.linea}>− {textoCantidad(l.cantidad, l.unidad)} de {l.nombre.toLowerCase()}</Text>
          ))}
        </Dialogo>
      ) : null}
    </ScrollView>
  );
}

export function Menu({ datos: d, onActualizar, onCocinar }: { datos: Datos; onActualizar: Actualizar; onCocinar: (p: Preset) => void }) {
  const [aviso, setAviso] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const meta = d.perfil ? nutricion(d.perfil) : null;
  const compra = d.menu ? listaCompra(d.menu, d.despensa) : [];

  const crear = () => {
    const menu = generarMenu({
      despensa: d.despensa,
      metaProteina: meta?.proteina ?? null,
      metaKcal: meta?.kcal ?? null,
      prohibido: prohibidos(d.preferencias),
      semilla: Math.floor(Date.now() / 1000) % 12,
      desde: diaHoy(),
    });
    if (!menu.length) return setAviso('Con tus preferencias actuales no puedo montar un menú completo.');
    setAviso('');
    onActualizar((x) => ({ ...x, menu }));
  };

  const textoLista = compra.map((x) => `- ${porId(x.ing)?.nombre}: ${textoCantidad(x.comprar, porId(x.ing)!.unidad)}`).join('\n');

  return (
    <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
      <Tarjeta>
        <Text style={e.titulo}>Menú de la semana</Text>
        <Text style={e.sub}>Usa primero lo que tienes y respeta tus alergias y gustos.</Text>
        <Pildora texto={d.menu ? 'Hacer otro menú' : 'Crear mi menú'} onPress={() => (d.menu ? setConfirmar(true) : crear())} />
        {aviso ? <Text style={e.error}>{aviso}</Text> : null}
      </Tarjeta>

      {d.menu?.map((m, i) => (
        <Tarjeta key={i}>
          <Text style={[e.titulo, m.dia === diaHoy() && { color: c.oro }]}>{NOMBRE_DIA[m.dia]}</Text>
          {m.comidas.map((x, j) => (
            <View key={j} style={e.fila}>
              <View style={{ flex: 1 }}>
                <Text style={e.sub}>{x.momento} · {Math.round(x.kcal)} kcal · {Math.round(x.p)} g</Text>
                <Text style={[e.linea, { fontWeight: '700' }]}>{x.titulo}</Text>
              </View>
              {x.hecha ? (
                <Text style={{ color: c.verde, fontSize: 15, fontWeight: '800' }}>Hecho ✓</Text>
              ) : (
                <Pildora chica tipo="neutro" texto="Ver" onPress={() => onCocinar({ ids: x.ids, variante: x.variante, dia: i, comida: j, n: Date.now() })} />
              )}
            </View>
          ))}
        </Tarjeta>
      ))}

      {d.menu ? <Text style={e.seccion}>Lista de la compra</Text> : null}
      {d.menu && !compra.length ? <Text style={e.sub}>Tienes todo lo necesario para este menú.</Text> : null}
      {compra.map((x) => (
        <View key={x.ing} style={e.item}>
          <View style={{ flex: 1 }}>
            <Text style={e.nombre}>{porId(x.ing)?.nombre}</Text>
            <Text style={e.sub}>Comprar {textoCantidad(x.comprar, porId(x.ing)!.unidad)}</Text>
          </View>
          <View style={{ paddingRight: 8 }}>
            <Pildora chica tipo="neutro" texto="Comprado" onPress={() => onActualizar((y) => ({ ...y, despensa: sumar(y.despensa, x.ing, x.comprar) }))} />
          </View>
        </View>
      ))}
      {compra.length && Platform.OS === 'web' ? (
        <Pildora
          chica
          tipo="neutro"
          texto="Compartir lista"
          onPress={async () => {
            const r = await compartirTexto(`Lista de la compra\n${textoLista}`);
            if (r === 'copiado') setAviso('Lista copiada.');
          }}
        />
      ) : null}

      {confirmar ? (
        <Dialogo
          titulo="¿Hacer otro menú?"
          mensaje="Sustituye el menú actual y su lista de la compra."
          si="Hacer otro"
          no="Cancelar"
          onSi={() => {
            setConfirmar(false);
            crear();
          }}
          onNo={() => setConfirmar(false)}
        />
      ) : null}
    </ScrollView>
  );
}

const Macro = ({ valor, texto }: { valor: number; texto: string }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={e.valor}>{valor}</Text>
    <Text style={e.sub}>{texto}</Text>
  </View>
);

const e = StyleSheet.create({
  pagina: { padding: 16, gap: 14, paddingBottom: 32 },
  sub: { color: c.suave, fontSize: 14, lineHeight: 20 },
  error: { color: c.rojo, fontSize: 15, lineHeight: 21 },
  titulo: { color: c.texto, fontSize: 18, fontWeight: '800' },
  receta: { color: c.texto, fontSize: 24, fontWeight: '900' },
  seccion: { color: c.texto, fontSize: 21, fontWeight: '900', marginTop: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.tarjeta, borderRadius: 16, paddingLeft: 14, paddingVertical: 6 },
  itemColumna: { backgroundColor: c.tarjeta, borderRadius: 16, paddingLeft: 14, paddingVertical: 8, gap: 6 },
  nombre: { color: c.texto, fontSize: 16, fontWeight: '800' },
  cantidad: { width: 78, textAlign: 'center' },
  unidad: { color: c.suave, fontSize: 14, width: 24 },
  quitar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: c.campo, borderRadius: 999, paddingHorizontal: 14, minHeight: 42, justifyContent: 'center' },
  chipTexto: { color: c.texto, fontSize: 15, fontWeight: '700' },
  racion: { backgroundColor: c.campo, borderRadius: 999, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  macros: { flexDirection: 'row', marginVertical: 4 },
  valor: { color: c.oro, fontSize: 24, fontWeight: '900' },
  linea: { color: c.texto, fontSize: 15, lineHeight: 21, flexShrink: 1 },
  paso: { color: c.texto, fontSize: 16, lineHeight: 23 },
  nota: { color: c.suave, fontSize: 13, lineHeight: 18 },
});
