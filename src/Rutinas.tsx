import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Rutina, nuevoId } from './datos';
import { Campo, Dialogo, Pildora, Tarjeta, Titulo, c } from './ui';

export function Rutinas(p: {
  rutinas: Rutina[];
  onEmpezar: (r: Rutina) => void;
  onGuardar: (r: Rutina) => void;
  onBorrar: (id: string) => void;
}) {
  const [editando, setEditando] = useState<Rutina | null>(null);

  if (editando)
    return (
      <Editor
        inicial={editando}
        existe={p.rutinas.some((r) => r.id === editando.id)}
        onCerrar={() => setEditando(null)}
        onGuardar={(r) => {
          p.onGuardar(r);
          setEditando(null);
        }}
        onBorrar={() => {
          p.onBorrar(editando.id);
          setEditando(null);
        }}
      />
    );

  return (
    <ScrollView contentContainerStyle={e.pagina}>
      <Titulo>Mis rutinas</Titulo>
      {p.rutinas.map((r) => (
        <Tarjeta key={r.id}>
          <Text style={e.nombre}>{r.nombre}</Text>
          {r.deCoach ? <Text style={{ color: c.oro, fontSize: 14, fontWeight: '800' }}>Plan del coach</Text> : null}
          <Text style={e.detalle}>{r.ejercicios.map((x) => x.nombre).join(' · ')}</Text>
          <View style={e.fila}>
            <View style={{ flex: 1 }}>
              <Pildora texto="Empezar" onPress={() => p.onEmpezar(r)} />
            </View>
            <Pildora texto="Editar" tipo="neutro" onPress={() => setEditando(r)} />
          </View>
        </Tarjeta>
      ))}
      <Pildora
        texto="+ Nueva rutina"
        tipo="neutro"
        onPress={() =>
          setEditando({
            id: nuevoId(),
            nombre: '',
            ejercicios: [{ id: nuevoId(), nombre: '', series: 3, reps: 10 }],
          })
        }
      />
    </ScrollView>
  );
}

function Editor(p: {
  inicial: Rutina;
  existe: boolean;
  onCerrar: () => void;
  onGuardar: (r: Rutina) => void;
  onBorrar: () => void;
}) {
  const [r, setR] = useState(p.inicial);
  const [confirmar, setConfirmar] = useState(false);
  const validos = r.ejercicios.filter((x) => x.nombre.trim());
  const listo = r.nombre.trim() && validos.length > 0;

  const cambiar = (id: string, cambio: object) =>
    setR({ ...r, ejercicios: r.ejercicios.map((x) => (x.id === id ? { ...x, ...cambio } : x)) });
  const entero = (t: string) => Math.min(99, parseInt(t.replace(/\D/g, ''), 10) || 0);

  return (
    <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
      <Titulo>{p.existe ? 'Editar rutina' : 'Nueva rutina'}</Titulo>
      <Campo
        accessibilityLabel="Nombre de la rutina"
        placeholder="Nombre (ej. Pierna)"
        value={r.nombre}
        onChangeText={(nombre) => setR({ ...r, nombre })}
      />
      {r.ejercicios.map((x) => (
        <Tarjeta key={x.id}>
          <View style={e.fila}>
            <Campo
              accessibilityLabel="Nombre del ejercicio"
              style={{ flex: 1 }}
              placeholder="Ejercicio"
              value={x.nombre}
              onChangeText={(nombre) => cambiar(x.id, { nombre })}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quitar ${x.nombre || 'ejercicio'}`}
              style={e.quitar}
              onPress={() => setR({ ...r, ejercicios: r.ejercicios.filter((y) => y.id !== x.id) })}
            >
              <Text style={{ color: c.rojo, fontSize: 22, fontWeight: '800' }}>×</Text>
            </Pressable>
          </View>
          <View style={e.fila}>
            <Text style={e.etiqueta}>Series</Text>
            <Campo
              accessibilityLabel="Series"
              style={e.numero}
              keyboardType="number-pad"
              value={x.series ? String(x.series) : ''}
              onChangeText={(t) => cambiar(x.id, { series: entero(t) })}
            />
            <Text style={e.etiqueta}>Reps</Text>
            <Campo
              accessibilityLabel="Repeticiones"
              style={e.numero}
              keyboardType="number-pad"
              value={x.reps ? String(x.reps) : ''}
              onChangeText={(t) => cambiar(x.id, { reps: entero(t) })}
            />
          </View>
        </Tarjeta>
      ))}
      <Pildora
        texto="+ Añadir ejercicio"
        tipo="neutro"
        onPress={() =>
          setR({ ...r, ejercicios: [...r.ejercicios, { id: nuevoId(), nombre: '', series: 3, reps: 10 }] })
        }
      />
      <Pildora
        texto="Guardar"
        deshabilitado={!listo}
        onPress={() =>
          p.onGuardar({
            ...r,
            nombre: r.nombre.trim(),
            ejercicios: validos.map((x) => ({
              ...x,
              nombre: x.nombre.trim(),
              series: x.series || 1,
              reps: x.reps || 1,
            })),
          })
        }
      />
      <Pildora texto="Cancelar" tipo="neutro" onPress={p.onCerrar} />
      {p.existe ? <Pildora texto="Borrar rutina" tipo="peligro" onPress={() => setConfirmar(true)} /> : null}
      {confirmar ? (
        <Dialogo
          titulo="¿Borrar esta rutina?"
          mensaje="Tu historial de entrenos se conserva."
          si="Borrar"
          peligro
          no="No, volver"
          onSi={p.onBorrar}
          onNo={() => setConfirmar(false)}
        />
      ) : null}
    </ScrollView>
  );
}

const e = StyleSheet.create({
  pagina: { padding: 16, gap: 14, paddingBottom: 32 },
  nombre: { color: c.texto, fontSize: 24, fontWeight: '900' },
  detalle: { color: c.suave, fontSize: 15, lineHeight: 21 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  etiqueta: { color: c.suave, fontSize: 15 },
  numero: { width: 62, textAlign: 'center' },
  quitar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
