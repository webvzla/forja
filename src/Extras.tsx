// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Pantallas de: mapa muscular, medallas, resumen para compartir y calculadora de discos.
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { Datos, claveDia, formatoNum, pesoMaximo } from './datos';
import { Medalla, Musculo, NOMBRE_MUSCULO, discosPorLado, musculosSemana } from './calculos';
import { inicioSemana, nutricion } from './reglas';
import { Campo, Dialogo, Pildora, Tarjeta, c, tam } from './ui';
import { compartirArchivo } from './web';

// ---------- Mapa muscular ----------
const colorSeries = (n: number) => (n <= 0 ? c.campo : n < 4 ? c.nivel1 : n < 10 ? c.nivel2 : c.nivel3);

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

// Músculos que trabaja un ejercicio (FORJA Academy): principales en intenso, secundarios en suave.
export function MusculosEjercicio({ principales, secundarios }: { principales: Musculo[]; secundarios: Musculo[] }) {
  const series = Object.fromEntries((Object.keys(NOMBRE_MUSCULO) as Musculo[]).map((m) => [m, principales.includes(m) ? 12 : secundarios.includes(m) ? 2 : 0])) as Record<Musculo, number>;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityLabel={`Músculos principales: ${principales.map((m) => NOMBRE_MUSCULO[m]).join(', ')}${secundarios.length ? `. Secundarios: ${secundarios.map((m) => NOMBRE_MUSCULO[m]).join(', ')}` : ''}`}>
      <Cuerpo piezas={DELANTE} series={series} titulo="Delante" />
      <Cuerpo piezas={DETRAS} series={series} titulo="Detrás" />
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

// ---------- Estadísticas avanzadas ----------
const FUENTE = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const SEM = 7 * 86400000;
function Barras({ valores, etiquetas, destacar, alto = 110, sufijo = '' }: { valores: number[]; etiquetas: string[]; destacar?: number; alto?: number; sufijo?: string }) {
  const max = Math.max(1, ...valores);
  const W = 320, ancho = (W - 10) / valores.length;
  return (
    <Svg width="100%" height={alto + 34} viewBox={`0 0 ${W} ${alto + 34}`} accessibilityLabel={valores.map((v, i) => `${etiquetas[i]}: ${formatoNum(Math.round(v))}${sufijo}`).join(', ')}>
      {valores.map((v, i) => {
        const h = Math.max(v > 0 ? 4 : 0, (v / max) * alto);
        return <Rect key={i} x={5 + i * ancho + ancho * 0.18} y={14 + alto - h} width={ancho * 0.64} height={h} rx={5} fill={i === destacar ? c.oro : c.nivel2} />;
      })}
      {valores.map((v, i) => (
        <SvgText key={`v${i}`} x={5 + i * ancho + ancho / 2} y={10 + alto - Math.max(0, (v / max) * alto)} fontFamily={FUENTE} fontSize={9} fill={c.suave} textAnchor="middle">{v > 0 ? (v >= 1000 ? `${Math.round(v / 1000)}k` : formatoNum(Math.round(v))) : ''}</SvgText>
      ))}
      {etiquetas.map((t, i) => (
        <SvgText key={`t${i}`} x={5 + i * ancho + ancho / 2} y={alto + 30} fontFamily={FUENTE} fontSize={10} fill={c.suave} textAnchor="middle">{t}</SvgText>
      ))}
    </Svg>
  );
}

function Linea({ puntos, alto = 110 }: { puntos: { t: number; v: number }[]; alto?: number }) {
  const W = 320;
  const min = Math.min(...puntos.map((p) => p.v)), max = Math.max(...puntos.map((p) => p.v));
  const rango = Math.max(0.5, max - min);
  const X = (i: number) => 16 + (i * (W - 32)) / Math.max(1, puntos.length - 1);
  const Y = (v: number) => 12 + (1 - (v - min) / rango) * (alto - 24);
  return (
    <Svg width="100%" height={alto + 16} viewBox={`0 0 ${W} ${alto + 16}`} accessibilityLabel={`Peso: de ${formatoNum(puntos[0].v)} a ${formatoNum(puntos[puntos.length - 1].v)} kg`}>
      <Polyline points={puntos.map((p, i) => `${X(i)},${Y(p.v)}`).join(' ')} fill="none" stroke={c.oro} strokeWidth={3} strokeLinejoin="round" />
      {puntos.map((p, i) => <Circle key={i} cx={X(i)} cy={Y(p.v)} r={3.5} fill={c.oro} />)}
      <SvgText x={X(0)} y={alto + 12} fontFamily={FUENTE} fontSize={10} fill={c.suave}>{formatoNum(puntos[0].v)} kg</SvgText>
      <SvgText x={X(puntos.length - 1)} y={alto + 12} fontFamily={FUENTE} fontSize={10} fill={c.suave} textAnchor="end">{formatoNum(puntos[puntos.length - 1].v)} kg</SvgText>
    </Svg>
  );
}

function Cifra({ v, t }: { v: string; t: string }) {
  return (
    <View style={e.cifra}>
      <Text style={e.cifraValor} numberOfLines={1}>{v}</Text>
      <Text style={e.mini}>{t}</Text>
    </View>
  );
}

export function Estadisticas({ d }: { d: Datos }) {
  if (!d.sesiones.length) return null; // Progreso ya muestra su propio estado vacío
  const lunes = inicioSemana();
  const volumen = (desde: number) =>
    d.sesiones.filter((s) => s.fecha >= desde && s.fecha < desde + SEM).reduce((t, s) => t + s.ejercicios.reduce((a, x) => a + x.series.reduce((b, y) => b + y.peso * y.reps, 0), 0), 0);
  const semanas = Array.from({ length: 8 }, (_, i) => lunes - (7 - i) * SEM);
  const vol = semanas.map(volumen);
  const freq = Array(7).fill(0);
  d.sesiones.forEach((s) => (freq[(new Date(s.fecha).getDay() + 6) % 7] += 1));
  const ahora = new Date();
  const mes = d.sesiones.filter((s) => { const f = new Date(s.fecha); return f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear(); }).length;
  const horas = Math.round(d.sesiones.reduce((a, s) => a + s.minutos, 0) / 60);
  const total = d.sesiones.reduce((t, s) => t + s.ejercicios.reduce((a, x) => a + x.series.reduce((b, y) => b + y.peso * y.reps, 0), 0), 0);
  // Récords recientes: la última vez que se superó el peso máximo de cada ejercicio.
  const mejor = new Map<string, number>();
  const records: { nombre: string; kg: number; fecha: number }[] = [];
  for (const s of [...d.sesiones].reverse()) {
    if (s.descarga) continue;
    for (const x of s.ejercicios) {
      const k = x.nombre.toLowerCase(), m = pesoMaximo(x.series);
      if (m > 0 && mejor.has(k) && m > mejor.get(k)!) records.push({ nombre: x.nombre, kg: m, fecha: s.fecha });
      if (m > 0) mejor.set(k, Math.max(m, mejor.get(k) ?? 0));
    }
  }
  const pesos = d.pesos.slice(-10).map((p) => ({ t: p.fecha, v: p.max }));
  const fmt = (t: number) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  return (
    <>
      <View style={e.cifras}>
        <Cifra v={String(d.sesiones.length)} t="entrenos en total" />
        <Cifra v={String(mes)} t="este mes" />
        <Cifra v={`${horas} h`} t="entrenando" />
        <Cifra v={total >= 10000 ? `${formatoNum(Math.round(total / 1000))} t` : `${formatoNum(Math.round(total))} kg`} t="levantados" />
      </View>
      <Tarjeta>
        <Text style={e.titulo}>📦 Volumen por semana</Text>
        <Text style={e.sub}>Kilos × repeticiones de cada semana. Que suba poco a poco es buena señal.</Text>
        <Barras valores={vol} etiquetas={semanas.map((t, i) => (i === 7 ? 'esta' : fmt(t).replace('.', '')))} destacar={7} />
      </Tarjeta>
      <Tarjeta>
        <Text style={e.titulo}>📅 Qué días entrenas</Text>
        <Barras valores={freq} etiquetas={['L', 'M', 'X', 'J', 'V', 'S', 'D']} destacar={freq.indexOf(Math.max(...freq))} alto={80} sufijo=" entrenos" />
      </Tarjeta>
      {pesos.length >= 2 ? (
        <Tarjeta>
          <Text style={e.titulo}>⚖️ Evolución de tu peso</Text>
          <Linea puntos={pesos} />
        </Tarjeta>
      ) : null}
      {records.length ? (
        <Tarjeta>
          <Text style={e.titulo}>⭐ Récords recientes</Text>
          {records.slice(-5).reverse().map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={[e.sub, { color: c.texto, flex: 1, flexShrink: 1 }]}>{r.nombre}</Text>
              <Text style={[e.sub, { color: c.oro, fontWeight: '800' }]}>{formatoNum(r.kg)} kg · {fmt(r.fecha)}</Text>
            </View>
          ))}
        </Tarjeta>
      ) : null}
    </>
  );
}

// Aviso discreto de medalla nueva: aparece arriba, no bloquea y se va solo.
export function NuevasMedallas({ lista, onListo }: { lista: Medalla[]; onListo: () => void }) {
  const [entrada] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(entrada, { toValue: 1, useNativeDriver: Platform.OS !== 'web', friction: 7 }).start();
    const t = setTimeout(onListo, 5000);
    return () => clearTimeout(t);
  }, []);
  const m = lista[0];
  return (
    <Animated.View
      style={[e.toast, { opacity: entrada, transform: [{ translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Pressable onPress={onListo} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityLabel={`Nueva medalla: ${m.titulo}. Toca para cerrar`}>
        <Text style={{ fontSize: 30 }}>{m.icono}</Text>
        <View style={{ flex: 1 }}>
          <Text style={e.toastTitulo}>{lista.length === 1 ? '¡Nueva medalla!' : `¡${lista.length} medallas nuevas!`}</Text>
          <Text style={e.sub} numberOfLines={2}>{lista.map((x) => x.titulo).join(' · ')}</Text>
        </View>
        <Text style={{ color: c.suave, fontSize: tam(16) }}>✕</Text>
      </Pressable>
    </Animated.View>
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
    if ((x as any).roundRect) (x as any).roundRect(80, y, W - 160, 190, 36);
    else x.rect(80, y, W - 160, 190);
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
  x.fillText('Entreno + cocina en una app · forjagym.app', 80, 1270);
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
  toast: { position: 'absolute', top: 12, left: 12, right: 12, zIndex: 50, maxWidth: 520, alignSelf: 'center', backgroundColor: c.tarjeta, borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: c.oro, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  toastTitulo: { color: c.oro, fontSize: tam(16), fontWeight: '900' },
  titulo: { color: c.texto, fontSize: tam(19), fontWeight: '900' },
  sub: { color: c.suave, fontSize: tam(15), lineHeight: tam(21) },
  aviso: { color: c.oro, fontSize: tam(15), lineHeight: tam(21) },
  nota: { color: c.suave, fontSize: tam(13), lineHeight: tam(18) },
  mini: { color: c.suave, fontSize: tam(12) },
  cifras: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cifra: { width: '48%', flexGrow: 1, backgroundColor: c.tarjeta, borderRadius: 18, padding: 14, gap: 2, borderWidth: c.oscuro ? 0 : 1, borderColor: c.borde },
  cifraValor: { color: c.texto, fontSize: tam(26), fontWeight: '900' },
  leyenda: { flexDirection: 'row', justifyContent: 'center', gap: 14, flexWrap: 'wrap' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  medalla: { width: '31%', flexGrow: 1, backgroundColor: c.campo, borderRadius: 14, padding: 10, alignItems: 'center', gap: 2 },
  medallaTitulo: { color: c.texto, fontSize: tam(14), fontWeight: '800', textAlign: 'center' },
  chip: { paddingHorizontal: 12, minHeight: 38, borderRadius: 999, justifyContent: 'center', backgroundColor: c.campo },
  chipTexto: { color: c.texto, fontSize: tam(14), fontWeight: '700' },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 90, paddingVertical: 6, flexWrap: 'wrap' },
  disco: { width: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  discoTexto: { color: '#111', fontSize: tam(11), fontWeight: '900' },
});
