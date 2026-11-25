// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Perfil de atleta: nivel FORJA, emblema (yunque + llama), atributos y misiones. Todo se calcula en el móvil.
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

import { Atributo, ATRIBUTOS_FIJOS, atributos } from './atributos';
import { medallas } from './calculos';
import { REGLAS_PUNTOS } from './competicion';
import { Datos, dificultadDe } from './datos';
import { NOMBRE_DIFICULTAD } from './niveles';
import { EstadoMision, IdMision, Mision, marcarMision, misionesHoy } from './misiones';
import { Barra, Insignia, Pildora, Seccion, Tarjeta, c, tam } from './ui';
import { Tramo, TITULOS, XP_NOTA_ARENA, calcularXp, progresoNivel } from './xp';

const NOMBRE_NIVEL = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' } as const;
const miles = (n: number) => n.toLocaleString('es');

// ---------- Emblema: un yunque fijo con una llama que crece según el tramo ----------
const LLAMA = 'M0,0 C-15,-3 -19,-17 -9,-31 C-7,-23 -3,-21 0,-27 C2,-36 11,-41 7,-54 C22,-41 24,-19 15,-6 C11,0 5,3 0,0 Z';
const NUCLEO = 'M0,-2 C-7,-4 -9,-12 -4,-19 C-3,-14 -1,-13 0,-17 C1,-22 6,-25 4,-31 C11,-24 12,-11 7,-5 C5,-2 2,-1 0,-2 Z';
const ESCALA = [0.34, 0.56, 0.82, 1.06];

export function Emblema({ tramo, tamano = 120 }: { tramo: Tramo; tamano?: number }) {
  const s = ESCALA[tramo];
  return (
    <Svg width={tamano} height={tamano} viewBox="0 0 120 120" accessibilityLabel={`Emblema de nivel ${TITULOS[tramo]}: un yunque con una llama${tramo === 0 ? ' pequeña' : tramo === 3 ? ' grande' : ''}`}>
      <Defs>
        <RadialGradient id={`brillo${tramo}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={c.oro} stopOpacity={0.38} />
          <Stop offset="100%" stopColor={c.oro} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {tramo >= 1 ? <Circle cx={60} cy={62 - 20 * s} r={20 + 26 * s} fill={`url(#brillo${tramo})`} /> : null}
      <G transform={`translate(60 63) scale(${s})`}>
        <Path d={LLAMA} fill={c.oro} />
        <Path d={NUCLEO} fill="#FFFFFF" opacity={0.6} />
      </G>
      {tramo === 0 ? (
        <>
          <Circle cx={46} cy={40} r={2.2} fill={c.oro} />
          <Circle cx={74} cy={34} r={1.8} fill={c.oro} />
          <Circle cx={66} cy={22} r={1.4} fill={c.oro} opacity={0.7} />
        </>
      ) : null}
      {tramo >= 2 ? (
        <>
          <Circle cx={34} cy={36} r={2.4} fill={c.oro} />
          <Circle cx={88} cy={30} r={2} fill={c.oro} />
          {tramo === 3 ? <Circle cx={22} cy={52} r={1.8} fill={c.oro} opacity={0.8} /> : null}
          {tramo === 3 ? <Circle cx={98} cy={50} r={2.2} fill={c.oro} opacity={0.8} /> : null}
        </>
      ) : null}
      {/* Yunque */}
      <Path d="M14 66 L84 66 Q97 66 106 55 L111 55 L111 67 Q102 79 87 81 L87 86 L96 86 L96 100 L24 100 L24 86 L33 86 L33 81 Q20 79 14 66 Z" fill={c.texto} fillOpacity={0.88} stroke={tramo === 3 ? c.oro : 'none'} strokeWidth={tramo === 3 ? 2 : 0} />
      <Path d="M16 66 L84 66" stroke={c.suave} strokeWidth={2} strokeLinecap="round" opacity={tramo === 3 ? 1 : 0.6} />
      <Path d="M30 100 L30 94 L90 94 L90 100 Z" fill={c.fondo} opacity={0.35} />
    </Svg>
  );
}

// ---------- Misiones del día ----------
export function MisionesHoy({ d, onActualizar }: { d: Datos; onActualizar: (f: (d: Datos) => Datos) => void }) {
  const lista = useMemo(() => misionesHoy(d), [d]);
  if (!lista.length) return null;
  const cambiar = (id: IdMision, estado: EstadoMision) => onActualizar((x) => marcarMision(x, id, estado));
  return (
    <Tarjeta>
      <Text style={e.sub}>Opcionales y sin penalización: omitir una misión o descansar no resta nada.</Text>
      {lista.map((m) => (
        <FilaMision key={m.id} m={m} onCambiar={cambiar} />
      ))}
    </Tarjeta>
  );
}

function FilaMision({ m, onCambiar }: { m: Mision; onCambiar: (id: IdMision, e: EstadoMision) => void }) {
  const hecha = m.estado === 'hecha';
  const omitida = m.estado === 'omitida';
  const aMano = m.id === 'calentar';
  return (
    <View style={[e.mision, omitida && { opacity: 0.6 }]}>
      <Text style={{ fontSize: tam(24) }}>{hecha ? '✅' : m.icono}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[e.misionTitulo, hecha && { color: c.verde }]}>{m.titulo}{omitida ? ' · omitida' : ''}</Text>
        <Text style={e.sub}>{m.detalle}</Text>
        {!m.automatica ? (
          <View style={e.acciones}>
            {m.estado === 'pendiente' ? (
              <>
                {aMano ? <Pildora chica texto="Hecha" onPress={() => onCambiar(m.id, 'hecha')} /> : null}
                <Pildora chica tipo="neutro" texto="Omitir hoy" onPress={() => onCambiar(m.id, 'omitida')} />
              </>
            ) : (
              <Pildora chica tipo="neutro" texto="Deshacer" onPress={() => onCambiar(m.id, 'pendiente')} />
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------- Estado de nivel (se calcula con lo que ya registras) ----------
export function useXp(d: Datos) {
  return useMemo(() => {
    const est = calcularXp(d);
    return { est, nivel: progresoNivel(est?.xp ?? 0) };
  }, [d]);
}

// Tarjeta resumen: se puede abrir el perfil completo.
export function TarjetaAtleta({ d, onActualizar, misiones }: { d: Datos; onActualizar: (f: (d: Datos) => Datos) => void; misiones?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const { est, nivel } = useXp(d);
  if (!d.perfil) return null;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Tu nivel: ${nivel.titulo}, nivel ${nivel.nivel}. Abrir perfil de atleta`} onPress={() => setAbierto(true)}>
        <Tarjeta destacada>
          <View style={e.resumen}>
            <Emblema tramo={nivel.tramo} tamano={72} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={e.sub}>Nivel FORJA</Text>
              <Text style={e.grande}>{nivel.titulo} · Nivel {nivel.nivel}</Text>
              <Barra valor={nivel.fraccion} max={1} alto={8} etiqueta="Progreso hacia el siguiente nivel" />
              <Text style={e.sub}>{est ? `${miles(est.xp)} XP · faltan ${miles(nivel.faltan)} para el nivel ${nivel.nivel + 1}` : 'Registra tu primer entreno para empezar a ganar XP.'}</Text>
            </View>
          </View>
          <Text style={e.enlace}>Ver perfil de atleta ›</Text>
        </Tarjeta>
      </Pressable>
      {misiones ? (
        <>
          <Text style={e.seccion}>Misiones de hoy</Text>
          <MisionesHoy d={d} onActualizar={onActualizar} />
        </>
      ) : null}
      {abierto ? <PerfilAtleta d={d} onActualizar={onActualizar} onCerrar={() => setAbierto(false)} /> : null}
    </>
  );
}

// ---------- Pantalla completa ----------
function BarrasXp({ semanas }: { semanas: { lunes: string; puntos: number; actual: boolean }[] }) {
  const max = Math.max(1, ...semanas.map((s) => s.puntos));
  const alto = 90;
  return (
    <View accessibilityLabel={`XP de las últimas ${semanas.length} semanas: ${semanas.map((s) => s.puntos).join(', ')}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: alto + 22 }}>
      {semanas.map((s) => (
        <View key={s.lunes} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
          <Text style={[e.mini, { color: s.actual ? c.oro : c.suave }]}>{s.puntos}</Text>
          <View style={{ width: '70%', height: Math.max(4, (s.puntos / max) * alto), borderRadius: 6, backgroundColor: s.actual ? c.oro : c.nivel2 }} />
        </View>
      ))}
    </View>
  );
}

function FilaAtributo({ a }: { a: Atributo }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={e.atributo}>{a.nombre}</Text>
      {a.visible ? (
        <>
          <Text style={e.atributoValor}>{a.texto}</Text>
          {a.barra !== undefined ? <Barra valor={a.barra} max={1} alto={10} etiqueta={`${a.nombre}: ${a.texto}`} /> : null}
          {a.reparto ? (
            <View style={{ flexDirection: 'row', height: 10, borderRadius: 999, overflow: 'hidden', gap: 2 }} accessibilityLabel={a.texto}>
              {a.reparto.map((r, i) => (
                <View key={r.nombre} style={{ flex: Math.max(r.pct, 0.02), backgroundColor: [c.nivel3, c.nivel2, c.nivel1, c.borde][i % 4] }} />
              ))}
            </View>
          ) : null}
          <Text style={e.sub}>{a.detalle}</Text>
        </>
      ) : (
        <Text style={e.sub}>Aún no hay datos suficientes. {a.falta}</Text>
      )}
    </View>
  );
}

export function PerfilAtleta({ d, onActualizar, onCerrar }: { d: Datos; onActualizar: (f: (d: Datos) => Datos) => void; onCerrar: () => void }) {
  const { est, nivel } = useXp(d);
  const todos = useMemo(() => atributos(d, est), [d, est]);
  const mostrar = todos.filter((a) => (ATRIBUTOS_FIJOS as readonly string[]).includes(a.id) || a.visible);
  const medallasHechas = useMemo(() => medallas(d), [d]);
  const conseguidas = medallasHechas.filter((m) => m.hecho);
  if (!d.perfil) return null;
  return (
    <Modal animationType="slide" visible onRequestClose={onCerrar}>
      <View style={{ flex: 1, backgroundColor: c.fondo }}>
        <View style={e.cabecera}>
          <Text style={e.titulo}>Perfil de atleta</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar perfil de atleta" onPress={onCerrar} style={e.cerrar} hitSlop={8}>
            <Text style={{ color: c.texto, fontSize: tam(20), fontWeight: '900' }}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={e.pagina}>
          <Tarjeta destacada>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Emblema tramo={nivel.tramo} tamano={140} />
              <Text style={e.titulo}>{nivel.titulo}</Text>
              <Text style={e.grande}>Nivel {nivel.nivel}</Text>
            </View>
            <Barra valor={nivel.fraccion} max={1} alto={12} etiqueta="Progreso hacia el siguiente nivel" />
            <Text style={[e.sub, { textAlign: 'center' }]}>
              {est ? `${miles(est.xp)} XP · faltan ${miles(nivel.faltan)} para el nivel ${nivel.nivel + 1}` : 'Registra tu primer entreno o tus comidas para empezar a ganar XP.'}
            </Text>
            {est && est.retosXp > 0 ? <Text style={[e.sub, { textAlign: 'center' }]}>Incluye {miles(est.retosXp)} XP de retos completados.</Text> : null}
            <Text style={e.aviso}>{XP_NOTA_ARENA}</Text>
          </Tarjeta>

          <Seccion>Tus tres niveles, por separado</Seccion>
          <Tarjeta>
            <Text style={e.etiqueta}>Nivel físico</Text>
            <Text style={e.grande}>{NOMBRE_NIVEL[d.perfil.nivel]}</Text>
            <Text style={e.sub}>Tu propia valoración. FORJA no mide tu forma física y no la cambia por su cuenta.</Text>
            <Text style={[e.etiqueta, { marginTop: 8 }]}>Dificultad de tus entrenos</Text>
            <Text style={e.grande}>{NOMBRE_DIFICULTAD[dificultadDe(d.perfil)]}</Text>
            <Text style={e.sub}>La eliges tú (en Coach o Rutinas). FORJA solo te sugiere, nunca la cambia sola.</Text>
            <Text style={[e.etiqueta, { marginTop: 8 }]}>Nivel FORJA</Text>
            <Text style={e.grande}>{nivel.titulo} · Nivel {nivel.nivel}</Text>
            <Text style={e.sub}>Sale de tu XP. Puedes ser Principiante en nivel físico y tener muchos XP, o al revés.</Text>
          </Tarjeta>

          <Seccion>Misiones de hoy</Seccion>
          <MisionesHoy d={d} onActualizar={onActualizar} />

          <Seccion>Atributos</Seccion>
          <Tarjeta>
            {mostrar.map((a) => (
              <FilaAtributo key={a.id} a={a} />
            ))}
            <Text style={e.sub}>Calculado con lo que registras en FORJA. Si no hay datos suficientes, no se muestra una cifra.</Text>
          </Tarjeta>

          {est ? (
            <>
              <Seccion>XP por semana</Seccion>
              <Tarjeta>
                <BarrasXp semanas={est.semanas} />
                <Text style={e.sub}>Tus últimas semanas (hasta 8). Una semana sin entrenar no resta nada: las semanas ya cerradas nunca bajan.</Text>
              </Tarjeta>
            </>
          ) : null}

          <Seccion>Medallas</Seccion>
          <Tarjeta>
            <Text style={e.sub}>{conseguidas.length} de {medallasHechas.length} conseguidas. Las medallas no dan XP.</Text>
            {conseguidas.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {conseguidas.slice(0, 10).map((m) => (
                  <Insignia key={m.id} icono={m.icono} conseguida tam={44} />
                ))}
              </View>
            ) : null}
          </Tarjeta>

          <Seccion>Cómo se gana XP</Seccion>
          <Tarjeta>
            <Text style={e.sub}>Tu XP es la suma de los puntos de cada semana, con las mismas reglas que ARENA (sin ranking nuevo ni puntos aparte):</Text>
            {REGLAS_PUNTOS.map(([t, x]) => (
              <View key={t} style={{ gap: 2 }}>
                <Text style={e.atributo}>{t}{t === 'Reto completado' ? ' · se lee de tu cuenta' : ''}</Text>
                <Text style={e.sub}>{x}</Text>
              </View>
            ))}
            <Text style={e.sub}>Las misiones no dan XP. El nivel no afecta a rankings ni a tus rutinas.</Text>
          </Tarjeta>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const e = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  titulo: { color: c.texto, fontSize: tam(28), fontWeight: '900' },
  cerrar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.campo, alignItems: 'center', justifyContent: 'center' },
  pagina: { padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' },
  sub: { color: c.suave, fontSize: tam(14), lineHeight: tam(20) },
  aviso: { color: c.suave, fontSize: tam(13), lineHeight: tam(19), backgroundColor: c.campo, borderRadius: 12, padding: 10 },
  grande: { color: c.texto, fontSize: tam(20), fontWeight: '900' },
  seccion: { color: c.texto, fontSize: tam(21), fontWeight: '900', marginTop: 6 },
  enlace: { color: c.oro, fontSize: tam(15), fontWeight: '800' },
  resumen: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mision: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  misionTitulo: { color: c.texto, fontSize: tam(16), fontWeight: '800' },
  acciones: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  atributo: { color: c.texto, fontSize: tam(16), fontWeight: '800' },
  atributoValor: { color: c.oro, fontSize: tam(18), fontWeight: '900' },
  mini: { fontSize: tam(11), fontWeight: '800' },
  etiqueta: { color: c.suave, fontSize: tam(13), fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
});
