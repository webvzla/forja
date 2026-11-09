import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { Sesion, formatoNum, historial, nombresEjercicios, pesoMaximo } from './datos';
import { Dialogo, Tarjeta, Titulo, c } from './ui';

const fecha = (t: number) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' });

const contarSeries = (s: Sesion) => {
  const n = s.ejercicios.reduce((t, x) => t + x.series.length, 0);
  return `${n} ${n === 1 ? 'serie' : 'series'}`;
};

export function Grafica({ puntos }: { puntos: { fecha: number; max: number }[] }) {
  const [ancho, setAncho] = useState(0);
  const alto = 180;
  const margen = 14;
  const min = Math.min(...puntos.map((x) => x.max));
  const max = Math.max(...puntos.map((x) => x.max));
  const rango = max - min || 1;
  const xy = puntos.map((x, i) => ({
    x: puntos.length === 1 ? ancho / 2 : margen + (i * (ancho - margen * 2)) / (puntos.length - 1),
    y: max === min ? alto / 2 : alto - margen - ((x.max - min) * (alto - margen * 2)) / rango,
  }));
  return (
    <View onLayout={(ev) => setAncho(ev.nativeEvent.layout.width)} accessibilityLabel={`Gráfica de peso máximo: de ${formatoNum(puntos[0].max)} a ${formatoNum(puntos[puntos.length - 1].max)} kilos`}>
      {ancho > 0 ? (
        <Svg width={ancho} height={alto}>
          {[margen, alto / 2, alto - margen].map((y) => (
            <Line key={y} x1={0} x2={ancho} y1={y} y2={y} stroke={c.borde} strokeWidth={1} />
          ))}
          {xy.length > 1 ? (
            <Polyline points={xy.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={c.oro} strokeWidth={3} strokeLinejoin="round" />
          ) : null}
          {xy.map((q, i) => (
            <Circle key={i} cx={q.x} cy={q.y} r={i === xy.length - 1 ? 6 : 4} fill={c.oro} />
          ))}
        </Svg>
      ) : (
        <View style={{ height: alto }} />
      )}
      <View style={e.entre}>
        <Text style={e.sub}>{fecha(puntos[0].fecha)}</Text>
        <Text style={e.sub}>{fecha(puntos[puntos.length - 1].fecha)}</Text>
      </View>
    </View>
  );
}

export function Progreso(p: { sesiones: Sesion[]; onBorrar: (id: string) => void }) {
  const nombres = nombresEjercicios(p.sesiones);
  const [elegido, setElegido] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<Sesion | null>(null);
  const actual = elegido && nombres.includes(elegido) ? elegido : nombres[0];

  if (!actual)
    return (
      <View style={[e.pagina, { flex: 1 }]}>
        <Titulo>Progreso</Titulo>
        <Tarjeta>
          <Text style={e.vacioTitulo}>Aún no hay entrenos</Text>
          <Text style={e.sub}>Termina tu primera rutina y aquí verás cómo sube tu peso en cada ejercicio.</Text>
        </Tarjeta>
      </View>
    );

  const puntos = historial(p.sesiones, actual);
  const record = Math.max(...puntos.map((x) => x.max));
  const ultimo = puntos[puntos.length - 1].max;
  const cambio = ultimo - puntos[0].max;

  return (
    <ScrollView contentContainerStyle={e.pagina}>
      <Titulo>Progreso</Titulo>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {nombres.map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityState={{ selected: n === actual }}
            onPress={() => setElegido(n)}
            style={[e.chip, n === actual && { backgroundColor: c.oro }]}
          >
            <Text style={[e.chipTexto, n === actual && { color: c.sobreOro }]}>{n}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Tarjeta>
        <Text style={e.vacioTitulo}>
          {p.sesiones.some((s) => s.ejercicios.some((x) => x.nombre === actual && pesoMaximo(x.series) > 0))
            ? 'Peso máximo por entreno (kg)'
            : 'Repeticiones máximas por entreno'}
        </Text>
        <Grafica puntos={puntos} />
        <View style={e.datos}>
          <Dato valor={formatoNum(record)} texto="Récord" />
          <Dato valor={formatoNum(ultimo)} texto="Último" />
          <Dato valor={`${cambio > 0 ? '+' : ''}${formatoNum(cambio)}`} texto="Desde el inicio" />
        </View>
      </Tarjeta>
      <Text style={e.seccion}>Entrenos</Text>
      {p.sesiones.map((s) => (
        <Tarjeta key={s.id}>
          <View style={e.entre}>
            <Text style={e.vacioTitulo}>{s.rutinaNombre}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Borrar entreno ${s.rutinaNombre}`} hitSlop={12} onPress={() => setBorrar(s)}>
              <Text style={{ color: c.rojo, fontSize: 15 }}>Borrar</Text>
            </Pressable>
          </View>
          <Text style={e.sub}>
            {fecha(s.fecha)} · {s.minutos} min · {contarSeries(s)}
          </Text>
        </Tarjeta>
      ))}
      {borrar ? (
        <Dialogo
          titulo="¿Borrar este entreno?"
          mensaje="También desaparece de tu gráfica. No se puede deshacer."
          si="Borrar"
          peligro
          no="No, volver"
          onSi={() => {
            p.onBorrar(borrar.id);
            setBorrar(null);
          }}
          onNo={() => setBorrar(null)}
        />
      ) : null}
    </ScrollView>
  );
}

const Dato = ({ valor, texto }: { valor: string; texto: string }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={e.valor}>{valor}</Text>
    <Text style={[e.sub, { textAlign: 'center' }]}>{texto}</Text>
  </View>
);

const e = StyleSheet.create({
  pagina: { padding: 16, gap: 14, paddingBottom: 32 },
  sub: { color: c.suave, fontSize: 14, lineHeight: 20 },
  vacioTitulo: { color: c.texto, fontSize: 17, fontWeight: '800' },
  entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: { backgroundColor: c.campo, borderRadius: 999, paddingHorizontal: 16, minHeight: 42, justifyContent: 'center' },
  chipTexto: { color: c.texto, fontSize: 15, fontWeight: '700' },
  datos: { flexDirection: 'row', marginTop: 6 },
  valor: { color: c.oro, fontSize: 26, fontWeight: '900' },
  seccion: { color: c.texto, fontSize: 21, fontWeight: '900', marginTop: 6 },
});
