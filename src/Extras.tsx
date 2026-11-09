// Pantallas de: mapa muscular, medallas, resumen para compartir y calculadora de discos.
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { Datos, claveDia, formatoNum, pesoMaximo } from './datos';
import { Medalla, Musculo, NOMBRE_MUSCULO, discosPorLado, medallas, musculosSemana } from './calculos';
import { inicioSemana, nutricion } from './reglas';
import { Campo, Dialogo, Pildora, Tarjeta, c } from './ui';
import { compartirArchivo } from './web';

// ---------- Mapa muscular ----------
const colorSeries = (n: number) => (n <= 0 ? c.campo : n < 4 ? '#5A4A1C' : n < 10 ? '#A8862F' : c.oro);

type Pieza = [Musculo | null, number, number, number, number];
// [músculo, x, y, ancho, alto] sobre un cuerpo de 120 × 210
const DELANTE: Pieza[] = [
  ['hombros', 26, 40, 16, 14], ['hombros', 78, 40, 16, 14],
  ['pecho', 42, 42, 18, 20], ['pecho', 60, 42, 18, 20],
  ['biceps', 22, 56, 12, 28], ['biceps', 86, 56, 12, 28],
  [null, 20, 86, 11, 26], [null, 89, 86, 11, 26],
  ['abdomen', 46, 64, 28, 38],
  ['cuadriceps', 40, 108, 18, 52], ['cuadriceps', 62, 108, 18, 52],
  [null, 42, 164, 14, 36], [null, 64, 164, 14, 36],
];
const DETRAS: Pieza[] = [
  ['hombros', 26, 40, 16, 14], ['hombros', 78, 40, 16, 14],
  ['espalda', 42, 40, 36, 50],
  ['triceps', 22, 56, 12, 28], ['triceps', 86, 56, 12, 28],
  [null, 20, 86, 11, 26], [null, 89, 86, 11, 26],
  [null, 46, 90, 28, 12],
  ['gluteo', 40, 102, 19, 20], ['gluteo', 61, 102, 19, 20],
  ['femoral', 40, 124, 18, 36], ['femoral', 62, 124, 18, 36],
  ['gemelos', 42, 164, 14, 36], ['gemelos', 64, 164, 14, 36],
];

function Cuerpo({ piezas, series, titulo }: { piezas: Pieza[]; series: Record<Musculo, number>; titulo: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <Svg width="100%" height={200} viewBox="0 0 120 210">
        <Circle cx={60} cy={20} r={13} fill={c.campo} />
        {piezas.map(([m, x, y, w, h], i) => (
          <Rect key={i} x={x} y={y} width={w} height={h} rx={6} fill={m ? colorSeries(series[m]) : c.campo} opacity={m ? 1 : 0.6} />
        ))}
      </Svg>
      <Text style={e.mini}>{titulo}</Text>
    </View>
  );
}

export function MapaMuscular({ d }: { d: Datos }) {
  const series = musculosSemana(d);
  const total = Object.values(series).reduce((a, b) => a + b, 0);
  const olvidados = (Object.keys(series) as Musculo[]).filter((m) => series[m] < 2).map((m) => NOMBRE_MUSCULO[m].toLowerCase());
  return (
    <Tarjeta>
      <Text style={e.titulo}>🫀 Tus músculos esta semana</Text>
      <View style={{ flexDirection: 'row' }}>
        <Cuerpo piezas={DELANTE} series={series} titulo="Delante" />
        <Cuerpo piezas={DETRAS} series={series} titulo="Detrás" />
      </View>
      <View style={e.leyenda}>
        {[['Nada', 0], ['Poco', 2], ['Bien', 6], ['A tope', 12]].map(([t, n]) => (
          <View key={t as string} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: colorSeries(n as number) }} />
            <Text style={e.mini}>{t}</Text>
          </View>
        ))}
      </View>
      {total ? (
        <>
          <Text style={e.sub}>
            {(Object.keys(series) as Musculo[]).filter((m) => series[m] > 0).map((m) => `${NOMBRE_MUSCULO[m]} ${formatoNum(series[m])}`).join(' · ')} series
          </Text>
          {olvidados.length && olvidados.length < 10 ? <Text style={e.aviso}>Apenas has trabajado: {olvidados.join(', ')}.</Text> : null}
        </>
      ) : (
        <Text style={e.sub}>Entrena esta semana y verás qué músculos has trabajado.</Text>
      )}
      <Text style={e.nota}>Para crecer, lo recomendado son unas 10–20 series por músculo a la semana.</Text>
    </Tarjeta>
  );
}

// ---------- Medallas ----------
export function Medallas({ d }: { d: Datos }) {
  const lista = medallas(d);
  const hechas = lista.filter((m) => m.hecho).length;
  return (
    <Tarjeta>
      <Text style={e.titulo}>🏅 Medallas · {hechas}/{lista.length}</Text>
      <View style={e.rejilla}>
        {lista.map((m) => (
          <View key={m.id} style={[e.medalla, !m.hecho && { opacity: 0.4 }]} accessibilityLabel={`${m.titulo}: ${m.texto}${m.hecho ? ', conseguida' : ''}`}>
            <Text style={{ fontSize: 26 }}>{m.icono}</Text>
            <Text style={e.medallaTitulo} numberOfLines={2}>{m.titulo}</Text>
            <Text style={e.mini} numberOfLines={2}>{m.hecho ? m.texto : `${m.texto} · ${m.progreso}`}</Text>
          </View>
        ))}
      </View>
    </Tarjeta>
  );
}

export function NuevasMedallas({ lista, onListo }: { lista: Medalla[]; onListo: () => void }) {
  return (
    <Dialogo titulo={lista.length === 1 ? '¡Nueva medalla!' : `¡${lista.length} medallas nuevas!`} si="¡Vamos!" onSi={onListo}>
      {lista.slice(0, 6).map((m) => (
        <View key={m.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 32 }}>{m.icono}</Text>
          <View style={{ flex: 1 }}>
            <Text style={e.medallaTitulo}>{m.titulo}</Text>
            <Text style={e.sub}>{m.texto}</Text>
          </View>
        </View>
      ))}
    </Dialogo>
  );
}

// ---------- Resumen de la semana para compartir ----------
export function datosSemana(d: Datos) {
  const lunes = inicioSemana();
  const sesiones = d.sesiones.filter((s) => s.fecha >= lunes);
  const antes = d.sesiones.filter((s) => s.fecha < lunes && !s.descarga);
  const kilos = sesiones.reduce((t, s) => t + s.ejercicios.reduce((a, x) => a + x.series.reduce((b, y) => b + y.peso * y.reps, 0), 0), 0);
  const mejoras = new Set<string>();
  for (const s of sesiones) {
    if (s.descarga) continue;
    for (const x of s.ejercicios) {
      const previo = pesoMaximo(antes.flatMap((a) => a.ejercicios.filter((y) => y.nombre.toLowerCase() === x.nombre.toLowerCase()).flatMap((y) => y.series)));
      if (previo > 0 && pesoMaximo(x.series) > previo) mejoras.add(x.nombre);
    }
  }
  const meta = d.perfil ? nutricion(d.perfil).proteina : 0;
  let diasProt = 0;
  for (let i = 0; i < 7; i++) {
    const t = lunes + i * 86400000;
    if (meta && (d.comida[claveDia(t)] ?? []).reduce((n, x) => n + x.proteina, 0) >= meta) diasProt++;
  }
  return { entrenos: sesiones.length, objetivo: d.perfil?.dias ?? 3, kilos, records: [...mejoras], diasProt, lunes };
}

async function dibujarResumen(d: Datos): Promise<Blob> {
  const s = datosSemana(d);
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = cv.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#191B22');
  g.addColorStop(1, '#0E0F13');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const fuente = (peso: number, tam: number) => `${peso} ${tam}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  x.fillStyle = c.oro;
  x.font = fuente(900, 64);
  x.fillText('FORJA', 80, 140);
  x.fillStyle = c.suave;
  x.font = fuente(600, 38);
  const f = (t: number) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  x.fillText(`Mi semana · ${f(s.lunes)} – ${f(s.lunes + 6 * 86400000)}`, 80, 205);

  const tarjeta = (y: number, valor: string, texto: string, color: string) => {
    x.fillStyle = '#252832';
    x.beginPath();
    (x as any).roundRect ? (x as any).roundRect(80, y, W - 160, 190, 36) : x.rect(80, y, W - 160, 190);
    x.fill();
    x.fillStyle = color;
    x.font = fuente(900, 96);
    x.fillText(valor, 130, y + 120);
    x.fillStyle = c.texto;
    x.font = fuente(700, 38);
    x.fillText(texto, 130, y + 166);
  };
  tarjeta(270, `${s.entrenos}/${s.objetivo}`, s.entrenos >= s.objetivo ? 'entrenos · ¡semana cumplida! 🔥' : 'entrenos esta semana', c.oro);
  tarjeta(490, `${formatoNum(Math.round(s.kilos))} kg`, 'levantados en total', c.verde);
  tarjeta(710, String(s.records.length), s.records.length === 1 ? 'récord personal' : 'récords personales', '#6FB7FF');
  tarjeta(930, `${s.diasProt}/7`, 'días cumpliendo mi proteína', c.oro);

  x.fillStyle = c.suave;
  x.font = fuente(600, 32);
  if (s.records.length) x.fillText(`⭐ ${s.records.slice(0, 2).join(' · ')}`.slice(0, 52), 80, 1190);
  x.fillStyle = c.oro;
  x.font = fuente(800, 34);
  x.fillText('Entreno + cocina en una app · webvzla.github.io/forja', 80, 1270);
  return new Promise((ok) => cv.toBlob((b) => ok(b!), 'image/png'));
}

export function CompartirSemana({ d }: { d: Datos }) {
  const [msg, setMsg] = useState('');
  if (Platform.OS !== 'web') return null;
  const s = datosSemana(d);
  return (
    <Tarjeta>
      <Text style={e.titulo}>📤 Comparte tu semana</Text>
      <Text style={e.sub}>
        {s.entrenos}/{s.objetivo} entrenos · {formatoNum(Math.round(s.kilos))} kg levantados · {s.records.length} {s.records.length === 1 ? 'récord' : 'récords'} · {s.diasProt}/7 días de proteína
      </Text>
      <Pildora
        chica
        texto="Crear imagen y compartir"
        onPress={async () => {
          setMsg('');
          const r = await compartirArchivo(await dibujarResumen(d), `forja-semana-${claveDia()}.png`, 'Mi semana en Forja').catch(() => 'error');
          if (r === 'descargado') setMsg('Imagen descargada: búscala en Descargas o en Fotos.');
          if (r === 'error') setMsg('No se pudo crear la imagen.');
        }}
      />
      {msg ? <Text style={e.sub}>{msg}</Text> : null}
    </Tarjeta>
  );
}

// ---------- Calculadora de discos ----------
const ALTO_DISCO: Record<number, number> = { 25: 84, 20: 80, 15: 70, 10: 60, 5: 46, 2.5: 36, 1.25: 30 };
export function Discos({ peso, onCerrar }: { peso: number; onCerrar: () => void }) {
  const [kg, setKg] = useState(peso > 0 ? String(peso).replace('.', ',') : '');
  const [barra, setBarra] = useState(20);
  const valor = parseFloat(kg.replace(',', '.')) || 0;
  const r = valor ? discosPorLado(valor, barra) : null;
  return (
    <Dialogo titulo="🧮 Discos por lado" si="Listo" onSi={onCerrar}>
      <Campo accessibilityLabel="Peso total en kilos" keyboardType="decimal-pad" placeholder="Peso total (kg)" value={kg} onChangeText={setKg} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[20, 15, 10].map((b) => (
          <Pressable key={b} accessibilityRole="button" accessibilityState={{ selected: b === barra }} onPress={() => setBarra(b)} style={[e.chip, b === barra && { backgroundColor: c.oro }]}>
            <Text style={[e.chipTexto, b === barra && { color: c.sobreOro }]}>Barra {b} kg</Text>
          </Pressable>
        ))}
      </View>
      {!valor ? null : !r ? (
        <Text style={e.aviso}>Ese peso es menos que la barra sola ({barra} kg).</Text>
      ) : (
        <>
          <View style={e.barra}>
            {r.lista.length ? (
              r.lista.map((p, i) => (
                <View key={i} style={[e.disco, { height: ALTO_DISCO[p] ?? 30, backgroundColor: p >= 20 ? c.oro : p >= 10 ? '#6FB7FF' : p >= 5 ? c.verde : c.suave }]}>
                  <Text style={e.discoTexto}>{formatoNum(p)}</Text>
                </View>
              ))
            ) : (
              <Text style={e.sub}>Solo la barra.</Text>
            )}
          </View>
          <Text style={e.sub}>
            {r.lista.length ? `En cada lado: ${r.lista.map(formatoNum).join(' + ')} kg.` : ''}
            {r.sobra > 0 ? ` No se puede exacto: te quedas a ${formatoNum(valor - r.sobra * 2)} kg.` : ''}
          </Text>
        </>
      )}
    </Dialogo>
  );
}

const e = StyleSheet.create({
  titulo: { color: c.texto, fontSize: 19, fontWeight: '900' },
  sub: { color: c.suave, fontSize: 15, lineHeight: 21 },
  aviso: { color: c.oro, fontSize: 15, lineHeight: 21 },
  nota: { color: c.suave, fontSize: 13, lineHeight: 18 },
  mini: { color: c.suave, fontSize: 12 },
  leyenda: { flexDirection: 'row', justifyContent: 'center', gap: 14, flexWrap: 'wrap' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  medalla: { width: '31%', flexGrow: 1, backgroundColor: c.campo, borderRadius: 14, padding: 10, alignItems: 'center', gap: 2 },
  medallaTitulo: { color: c.texto, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  chip: { paddingHorizontal: 12, minHeight: 38, borderRadius: 999, justifyContent: 'center', backgroundColor: c.campo },
  chipTexto: { color: c.texto, fontSize: 14, fontWeight: '700' },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 90, paddingVertical: 6, flexWrap: 'wrap' },
  disco: { width: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  discoTexto: { color: '#111', fontSize: 11, fontWeight: '900' },
});
