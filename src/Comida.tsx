import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Comida as ItemComida, Datos, aNumero, claveDia, nuevoId } from './datos';
import { ALIMENTOS, nutricion } from './reglas';
import { Despensa, Menu, Preset, Recetas } from './Cocina';
import { Campo, Pildora, Tarjeta, Titulo, c } from './ui';

type Vista = 'hoy' | 'despensa' | 'recetas' | 'menu';

function Barra({ valor, meta, color }: { valor: number; meta: number; color: string }) {
  return (
    <View style={e.barra}>
      <View style={{ height: '100%', borderRadius: 999, backgroundColor: color, width: `${Math.min(100, meta ? (valor / meta) * 100 : 0)}%` }} />
    </View>
  );
}

export function Comida(p: {
  datos: Datos;
  onCambio: (dia: string, items: ItemComida[]) => void;
  onActualizar: (f: (d: Datos) => Datos) => void;
}) {
  const [vista, setVista] = useState<Vista>('hoy');
  const [preset, setPreset] = useState<Preset | null>(null);
  const opciones: [Vista, string][] = [['hoy', 'Hoy'], ['despensa', 'Despensa'], ['recetas', 'Recetas'], ['menu', 'Menú']];
  return (
    <View style={{ flex: 1 }}>
      <View style={e.segmento}>
        {opciones.map(([v, texto]) => (
          <Pressable
            key={v}
            accessibilityRole="button"
            accessibilityState={{ selected: v === vista }}
            onPress={() => {
              setPreset(null);
              setVista(v);
            }}
            style={[e.opcion, v === vista && { backgroundColor: c.campo }]}
          >
            <Text style={[e.opcionTexto, v === vista && { color: c.oro }]}>{texto}</Text>
          </Pressable>
        ))}
      </View>
      {vista === 'hoy' ? (
        <Hoy datos={p.datos} onCambio={p.onCambio} onActualizar={p.onActualizar} />
      ) : vista === 'despensa' ? (
        <Despensa datos={p.datos} onActualizar={p.onActualizar} />
      ) : vista === 'recetas' ? (
        <Recetas key={preset?.n ?? 0} datos={p.datos} onActualizar={p.onActualizar} preset={preset} />
      ) : (
        <Menu
          datos={p.datos}
          onActualizar={p.onActualizar}
          onCocinar={(x) => {
            setPreset(x);
            setVista('recetas');
          }}
        />
      )}
    </View>
  );
}

function fechaDe(hace: number) {
  const f = new Date();
  f.setHours(12, 0, 0, 0);
  f.setDate(f.getDate() - hace);
  return f;
}

function Hoy(p: {
  datos: Datos;
  onCambio: (dia: string, items: ItemComida[]) => void;
  onActualizar: (f: (d: Datos) => Datos) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [proteina, setProteina] = useState('');
  const [kcal, setKcal] = useState('');
  const [hace, setHace] = useState(0);
  const d = p.datos;
  const fecha = fechaDe(hace);
  const dia = claveDia(fecha.getTime());
  const items = d.comida[dia] ?? [];
  const meta = d.perfil ? nutricion(d.perfil) : null;
  const totalP = items.reduce((n, x) => n + x.proteina, 0);
  const totalK = items.reduce((n, x) => n + x.kcal, 0);
  const faltan = meta ? meta.proteina - totalP : 0;
  const agua = d.agua[dia] ?? 0;
  const metaAgua = d.perfil ? Math.round((d.perfil.peso * 35) / 50) * 50 : 2000;

  const semana = Array.from({ length: 7 }, (_, k) => d.comida[claveDia(fechaDe(k).getTime())] ?? []).filter((x) => x.length);
  const mediaP = semana.length ? semana.reduce((n, x) => n + x.reduce((t, y) => t + y.proteina, 0), 0) / semana.length : 0;
  const mediaK = semana.length ? semana.reduce((n, x) => n + x.reduce((t, y) => t + y.kcal, 0), 0) / semana.length : 0;
  const cumplidos = meta ? semana.filter((x) => x.reduce((t, y) => t + y.proteina, 0) >= meta.proteina).length : 0;

  const anadir = (x: Omit<ItemComida, 'id'>) => p.onCambio(dia, [{ ...x, id: nuevoId() }, ...items]);
  const cambiarAgua = (ml: number) => p.onActualizar((x) => ({ ...x, agua: { ...x.agua, [dia]: Math.max(0, (x.agua[dia] ?? 0) + ml) } }));
  const valido = aNumero(proteina) > 0 || aNumero(kcal) > 0;

  return (
    <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
      <Titulo>{hace === 0 ? 'Comida de hoy' : fecha.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })}</Titulo>
      <View style={e.entre}>
        <Pildora chica tipo="neutro" texto="‹ Día anterior" onPress={() => setHace(hace + 1)} />
        {hace > 0 ? <Pildora chica tipo="neutro" texto="Día siguiente ›" onPress={() => setHace(hace - 1)} /> : null}
      </View>

      <Tarjeta>
        <View style={e.entre}>
          <Text style={e.rotulo}>Proteína</Text>
          <Text style={e.cifra}>{Math.round(totalP)}{meta ? ` / ${meta.proteina}` : ''} g</Text>
        </View>
        <Barra valor={totalP} meta={meta?.proteina ?? 0} color={c.oro} />
        <View style={e.entre}>
          <Text style={e.rotulo}>Calorías</Text>
          <Text style={e.cifra}>{Math.round(totalK)}{meta ? ` / ${meta.kcal}` : ''} kcal</Text>
        </View>
        <Barra valor={totalK} meta={meta?.kcal ?? 0} color={c.verde} />
        <Text style={e.sub}>
          {!meta
            ? 'Completa tu perfil en Coach para ver tus metas.'
            : faltan > 0
              ? `Te faltan ${Math.round(faltan)} g: son unos ${Math.round((faltan / 31) * 100)} g de pollo.`
              : '¡Meta de proteína cumplida!'}
        </Text>
        {semana.length ? (
          <Text style={e.sub}>
            Últimos 7 días: media de {Math.round(mediaP)} g y {Math.round(mediaK)} kcal{meta ? ` · meta cumplida ${cumplidos} de ${semana.length} días` : ''}.
          </Text>
        ) : null}
      </Tarjeta>

      <Tarjeta>
        <View style={e.entre}>
          <Text style={e.rotulo}>Agua</Text>
          <Text style={e.cifra}>{(agua / 1000).toFixed(2).replace('.', ',')} / {(metaAgua / 1000).toFixed(2).replace('.', ',')} l</Text>
        </View>
        <Barra valor={agua} meta={metaAgua} color="#6FB7FF" />
        <View style={e.fila}>
          <View style={{ flex: 1 }}><Pildora chica tipo="neutro" texto="+ 250 ml" onPress={() => cambiarAgua(250)} /></View>
          <View style={{ flex: 1 }}><Pildora chica tipo="neutro" texto="+ 500 ml" onPress={() => cambiarAgua(500)} /></View>
          <Pildora chica tipo="neutro" texto="− 250" deshabilitado={agua <= 0} onPress={() => cambiarAgua(-250)} />
        </View>
      </Tarjeta>

      {hace === 0 && d.sobras.length ? <Text style={e.seccion}>Sobras</Text> : null}
      {hace === 0
        ? d.sobras.map((s) => (
            <View key={s.id} style={e.item}>
              <View style={{ flex: 1 }}>
                <Text style={e.alimentoNombre}>{s.titulo}</Text>
                <Text style={e.sub}>{s.raciones} {s.raciones === 1 ? 'ración' : 'raciones'} · {Math.round(s.proteina)} g · {Math.round(s.kcal)} kcal</Text>
              </View>
              <Pildora
                chica
                texto="Comer"
                onPress={() =>
                  p.onActualizar((x) => ({
                    ...x,
                    comida: { ...x.comida, [dia]: [{ id: nuevoId(), nombre: `${s.titulo} (sobras)`, proteina: s.proteina, kcal: s.kcal }, ...(x.comida[dia] ?? [])] },
                    sobras: x.sobras.flatMap((y) => (y.id !== s.id ? [y] : y.raciones > 1 ? [{ ...y, raciones: y.raciones - 1 }] : [])),
                  }))
                }
              />
              <Pressable accessibilityRole="button" accessibilityLabel={`Tirar ${s.titulo}`} style={e.quitar} onPress={() => p.onActualizar((x) => ({ ...x, sobras: x.sobras.filter((y) => y.id !== s.id) }))}>
                <Text style={{ color: c.rojo, fontSize: 22, fontWeight: '800' }}>×</Text>
              </Pressable>
            </View>
          ))
        : null}

      <Text style={e.seccion}>Añadir rápido</Text>
      <View style={e.rejilla}>
        {ALIMENTOS.map((a) => (
          <Pressable
            key={a.nombre}
            accessibilityRole="button"
            accessibilityLabel={`Añadir ${a.nombre}`}
            onPress={() => anadir(a)}
            style={({ pressed }) => [e.alimento, pressed && { opacity: 0.6 }]}
          >
            <Text style={e.alimentoNombre}>{a.nombre}</Text>
            <Text style={e.sub}>{a.proteina} g · {a.kcal} kcal</Text>
          </Pressable>
        ))}
      </View>
      <Text style={e.nota}>Valores aproximados.</Text>

      <Text style={e.seccion}>Otro alimento</Text>
      <Tarjeta>
        <Campo accessibilityLabel="Nombre del alimento" placeholder="Nombre (opcional)" value={nombre} onChangeText={setNombre} />
        <View style={e.fila}>
          <Campo accessibilityLabel="Gramos de proteína" style={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Proteína (g)" value={proteina} onChangeText={setProteina} />
          <Campo accessibilityLabel="Calorías" style={{ flex: 1 }} keyboardType="number-pad" placeholder="Calorías" value={kcal} onChangeText={setKcal} />
        </View>
        <Pildora
          chica
          texto="Añadir"
          deshabilitado={!valido}
          onPress={() => {
            anadir({ nombre: nombre.trim() || 'Otro alimento', proteina: aNumero(proteina), kcal: aNumero(kcal) });
            setNombre('');
            setProteina('');
            setKcal('');
          }}
        />
      </Tarjeta>

      {items.length ? <Text style={e.seccion}>{hace === 0 ? 'Hoy has comido' : 'Ese día comiste'}</Text> : null}
      {items.map((x) => (
        <View key={x.id} style={e.item}>
          <View style={{ flex: 1 }}>
            <Text style={e.alimentoNombre}>{x.nombre}</Text>
            <Text style={e.sub}>{Math.round(x.proteina)} g · {Math.round(x.kcal)} kcal</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Quitar ${x.nombre}`}
            style={e.quitar}
            onPress={() => p.onCambio(dia, items.filter((y) => y.id !== x.id))}
          >
            <Text style={{ color: c.rojo, fontSize: 22, fontWeight: '800' }}>×</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const e = StyleSheet.create({
  segmento: { flexDirection: 'row', gap: 2, paddingHorizontal: 12, paddingTop: 10 },
  opcion: { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  opcionTexto: { color: c.suave, fontSize: 14, fontWeight: '800' },
  pagina: { padding: 16, gap: 14, paddingBottom: 32 },
  sub: { color: c.suave, fontSize: 14, lineHeight: 20 },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rotulo: { color: c.texto, fontSize: 16, fontWeight: '800' },
  cifra: { color: c.oro, fontSize: 18, fontWeight: '900' },
  barra: { height: 10, borderRadius: 999, backgroundColor: c.campo, overflow: 'hidden' },
  seccion: { color: c.texto, fontSize: 21, fontWeight: '900', marginTop: 6 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  alimento: { backgroundColor: c.tarjeta, borderRadius: 16, padding: 12, flexBasis: '48%', flexGrow: 1, minHeight: 66, justifyContent: 'center' },
  alimentoNombre: { color: c.texto, fontSize: 15, fontWeight: '800' },
  fila: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.tarjeta, borderRadius: 16, paddingLeft: 14, paddingVertical: 8 },
  quitar: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  nota: { color: c.suave, fontSize: 13 },
});
