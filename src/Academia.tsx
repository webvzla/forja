// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// FORJA ACADEMY: ficha visual de cada ejercicio («Cómo se hace»).
// Se abre encima del entreno (no lo desmonta), así que series, pesos y repeticiones no se pierden.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { NOMBRE_MUSCULO } from './calculos';
import { CREDITOS_VISUALES, type Ficha, NOMBRE_NIVEL, fichaDe, imagenes } from './biblioteca';
import { MusculosEjercicio } from './Extras';
import { Aviso, Seccion, Tarjeta, c, tam } from './ui';

const RITMOS = [
  [1600, 'Lento'],
  [1000, 'Normal'],
] as const;

// Nombre de cada fotograma: el primero es la posición inicial, el último el final del recorrido.
const etiqueta = (i: number, n: number, isometrico?: boolean) =>
  isometrico ? 'Posición que se mantiene' : i === 0 ? 'Posición inicial' : i === n - 1 ? 'Final del recorrido' : 'Movimiento';

// Secuencia de ida y vuelta: 0,1,…,n-1,…,1 (con pausa en los extremos).
function secuencia(n: number) {
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const ida = Array.from({ length: n }, (_, i) => i);
  return [0, 0, ...ida, n - 1, n - 1, ...ida.slice(1, -1).reverse()];
}

// Demostración: con 2 fotogramas alterna inicio y final con un fundido; con más, reproduce el
// movimiento completo de ida y vuelta. Se puede pausar, repetir, cambiar de velocidad, elegir
// posición y ampliar. Todos los fotogramas se cargan a la vez (sin parpadeos y también sin conexión).
function Demostracion({ ficha, onAmpliar }: { ficha: Ficha; onAmpliar: (i: number) => void }) {
  const v = ficha.visual!;
  const fotos = imagenes(v);
  const n = fotos.length;
  const pasos = secuencia(n);
  const [paso, setPaso] = useState(0);
  const [jugando, setJugando] = useState(n > 1);
  const [ritmo, setRitmo] = useState(0);
  const [error, setError] = useState(false);
  const [opacidad] = useState(() => new Animated.Value(0));
  const fase = pasos[paso % pasos.length] ?? 0;

  // Si el sistema pide reducir el movimiento, empieza en pausa.
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then((r) => r && setJugando(false)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!jugando || n < 2) return;
    const ms = n === 2 ? RITMOS[ritmo][0] : Math.round((RITMOS[ritmo][0] * 2.2) / pasos.length);
    const t = setInterval(() => setPaso((x) => (x + 1) % pasos.length), ms);
    return () => clearInterval(t);
  }, [jugando, ritmo, n, pasos.length]);

  useEffect(() => {
    if (n === 2) Animated.timing(opacidad, { toValue: fase, duration: 320, useNativeDriver: false }).start();
  }, [fase, n, opacidad]);

  if (error) return <Aviso tipo="info" texto="No se ha podido cargar la ilustración. Conéctate una vez a internet para guardarla en el móvil." />;

  const ir = (i: number) => {
    setJugando(false);
    setPaso(Math.max(0, pasos.indexOf(i)));
  };
  const nombreFase = etiqueta(fase, n, v.isometrico);

  return (
    <View style={{ gap: 10 }}>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${nombreFase} de ${ficha.nombre}. Toca para ampliar.`} onPress={() => onAmpliar(fase)} style={e.lienzo}>
        {n === 2 ? (
          <>
            <Image source={{ uri: fotos[0] }} style={e.imagen} resizeMode="contain" onError={() => setError(true)} accessibilityIgnoresInvertColors />
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacidad }]}>
              <Image source={{ uri: fotos[1] }} style={e.imagen} resizeMode="contain" onError={() => setError(true)} accessibilityIgnoresInvertColors />
            </Animated.View>
          </>
        ) : (
          fotos.map((f, i) => (
            <Image key={f} source={{ uri: f }} style={[StyleSheet.absoluteFill, e.imagen, { opacity: i === fase ? 1 : 0 }]} resizeMode="contain" onError={() => setError(true)} accessibilityIgnoresInvertColors />
          ))
        )}
        <View style={e.etiquetaFase}>
          <Text style={e.etiquetaFaseTexto}>{v.isometrico ? '⏸ ' : ''}{nombreFase}</Text>
        </View>
        <Text style={e.lupa}>⤢</Text>
      </Pressable>
      {n > 1 ? (
        <View style={e.progreso} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={e.progresoTexto}>Inicio</Text>
          <View style={e.progresoBarra}>
            <View style={[e.progresoRelleno, { width: `${(fase / (n - 1)) * 100}%` }]} />
          </View>
          <Text style={e.progresoTexto}>Final</Text>
        </View>
      ) : null}
      {n > 1 ? (
        <>
          <View style={e.controles}>
            <Boton texto={jugando ? '❚❚ Pausa' : '▶ Ver'} etiqueta={jugando ? '❚❚ Pausa' : '▶ Reproducir'} onPress={() => setJugando(!jugando)} />
            <Boton texto="↺ Repetir" onPress={() => { setPaso(0); setJugando(true); }} />
            <Boton texto={`⏱ ${RITMOS[ritmo][1]}`} onPress={() => setRitmo((r) => (r + 1) % RITMOS.length)} etiqueta="Cambiar velocidad" />
          </View>
          <View style={e.controles}>
            <Boton activo={!jugando && fase === 0} texto="Inicio" etiqueta="Posición inicial" onPress={() => ir(0)} />
            {n > 2 ? <Boton activo={!jugando && fase === Math.floor(n / 2)} texto="Movimiento" onPress={() => ir(Math.floor(n / 2))} /> : null}
            <Boton activo={!jugando && fase === n - 1} texto="Final" etiqueta="Final del recorrido" onPress={() => ir(n - 1)} />
          </View>
        </>
      ) : null}
      {v.nota ? <Text style={e.nota}>ℹ️ {v.nota}</Text> : null}
      <Credito ficha={ficha} />
    </View>
  );
}

function Credito({ ficha }: { ficha: Ficha }) {
  const cr = CREDITOS_VISUALES[ficha.visual!.fuente];
  return (
    <Text style={e.credito}>
      Ilustración: {cr.autor}
      {cr.url ? <>{' ('}<Text style={e.creditoEnlace} accessibilityRole="link" onPress={() => Linking.openURL(cr.url)}>origen</Text>)</> : null} ·{' '}
      {cr.licenciaUrl ? <Text style={e.creditoEnlace} accessibilityRole="link" onPress={() => Linking.openURL(cr.licenciaUrl)}>{cr.licencia}</Text> : cr.licencia}
      {' '}· {cr.cambios} Las ilustraciones son una guía de referencia, no sustituyen a un profesional.
    </Text>
  );
}

function Boton({ texto, onPress, activo, etiqueta }: { texto: string; onPress: () => void; activo?: boolean; etiqueta?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={etiqueta ?? texto} accessibilityState={{ selected: !!activo }} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [e.boton, activo && { backgroundColor: c.acentoSuave, borderColor: c.oro }, pressed && { opacity: 0.7 }]}>
      <Text style={[e.botonTexto, activo && { color: c.oro }]} numberOfLines={1}>{texto}</Text>
    </Pressable>
  );
}

function Ampliada({ ficha, inicio, onCerrar }: { ficha: Ficha; inicio: number; onCerrar: () => void }) {
  const fotos = imagenes(ficha.visual!);
  const n = fotos.length;
  const [i, setI] = useState(Math.min(inicio, n - 1));
  const nombre = etiqueta(i, n, ficha.visual!.isometrico);
  return (
    <Modal visible animationType="fade" onRequestClose={onCerrar}>
      <View style={e.ampliada}>
        <Text style={e.ampliadaTitulo}>{ficha.nombre} · {nombre}{n > 2 ? ` (${i + 1}/${n})` : ''}</Text>
        <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${nombre}. Toca para avanzar.`} style={e.ampliadaLienzo} onPress={() => setI((i + 1) % n)}>
          <Image source={{ uri: fotos[i] }} style={e.imagen} resizeMode="contain" />
        </Pressable>
        <View style={e.controles}>
          {n > 1 ? <Boton texto="◀ Anterior" onPress={() => setI(Math.max(0, i - 1))} /> : null}
          {n > 1 ? <Boton texto="Siguiente ▶" onPress={() => setI(Math.min(n - 1, i + 1))} /> : null}
          <Boton texto="✕ Cerrar" onPress={onCerrar} />
        </View>
      </View>
    </Modal>
  );
}

export function FichaEjercicio({ nombre, onCerrar }: { nombre: string; onCerrar: () => void }) {
  const [actual, setActual] = useState(nombre);
  const [ampliar, setAmpliar] = useState<number | null>(null);
  const ficha = fichaDe(actual);
  const desplazar = useRef<{ scrollTo: (o: { y: number; animated: boolean }) => void } | null>(null);
  const ir = (n: string) => {
    setActual(n);
    desplazar.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onCerrar}>
      <View style={e.raiz}>
        <View style={e.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={e.marca}>FORJA ACADEMY</Text>
            <Text style={e.titulo} accessibilityRole="header">{ficha?.nombre ?? actual}</Text>
          </View>
          {actual !== nombre ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Volver a ${nombre}`} onPress={() => ir(nombre)} style={e.cerrar} hitSlop={8}>
              <Text style={e.cerrarTexto}>↩</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar y volver al entreno" onPress={onCerrar} style={e.cerrar} hitSlop={8}>
            <Text style={e.cerrarTexto}>✕</Text>
          </Pressable>
        </View>
        <ScrollView ref={desplazar as never} contentContainerStyle={e.pagina}>
          {!ficha ? (
            <Aviso tipo="info" texto="Este ejercicio aún no está en la biblioteca de FORJA Academy. Pídele ayuda a un profesional del gimnasio si tienes dudas." />
          ) : (
            <>
              <View style={e.chips}>
                <Text style={e.chip}>{NOMBRE_NIVEL[ficha.nivel]}</Text>
                <Text style={e.chip}>{ficha.equipo}</Text>
              </View>

              <Tarjeta>
                {ficha.visual ? <Demostracion key={actual} ficha={ficha} onAmpliar={setAmpliar} /> : (
                  <Aviso tipo="info" texto="Falta contenido visual: aún no tenemos una demostración verificada y con licencia para este ejercicio. Sigue la explicación paso a paso." />
                )}
                {ficha.video ? null : <Text style={e.nota}>🎬 Vídeo: pendiente de material verificado con derechos de uso.</Text>}
              </Tarjeta>

              <Seccion>Paso a paso</Seccion>
              <Tarjeta>
                {ficha.pasos.map((p, i) => (
                  <View key={i} style={e.paso}>
                    <Text style={e.pasoNumero}>{i + 1}</Text>
                    <Text style={e.texto}>{p}</Text>
                  </View>
                ))}
              </Tarjeta>

              <Seccion>Músculos que trabajas</Seccion>
              <Tarjeta>
                <MusculosEjercicio principales={ficha.principales} secundarios={ficha.secundarios} />
                <Text style={e.texto}>
                  <Text style={{ fontWeight: '800' }}>Principales: </Text>{ficha.principales.map((m) => NOMBRE_MUSCULO[m]).join(', ')}
                  {ficha.secundarios.length ? <><Text style={{ fontWeight: '800' }}>{'\n'}Ayudan: </Text>{ficha.secundarios.map((m) => NOMBRE_MUSCULO[m]).join(', ')}</> : null}
                </Text>
                <Text style={e.nota}>{ficha.detalle}</Text>
              </Tarjeta>

              <Seccion>Respiración</Seccion>
              <Tarjeta><Text style={e.texto}>🌬️ {ficha.respiracion}</Text></Tarjeta>

              <Seccion>Errores frecuentes</Seccion>
              <Tarjeta>
                {ficha.errores.map(([mal, bien], i) => (
                  <View key={i} style={{ gap: 2 }}>
                    <Text style={[e.texto, { color: c.rojo, fontWeight: '700' }]}>✗ {mal}</Text>
                    <Text style={[e.texto, { color: c.verde }]}>✓ {bien}</Text>
                  </View>
                ))}
              </Tarjeta>

              <Seccion>Si estás empezando</Seccion>
              <Tarjeta>
                {ficha.principiantes.map((t, i) => <Text key={i} style={e.texto}>• {t}</Text>)}
              </Tarjeta>

              {ficha.alternativas.length ? (
                <>
                  <Seccion>Alternativas</Seccion>
                  <Tarjeta>
                    {ficha.alternativas.map(([n, cuando]) => {
                      const hay = !!fichaDe(n);
                      return (
                        <Pressable key={n} disabled={!hay} accessibilityRole={hay ? 'button' : undefined} accessibilityLabel={hay ? `Ver ficha de ${n}` : n} onPress={() => ir(n)} style={({ pressed }) => [e.alternativa, pressed && { opacity: 0.7 }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[e.texto, { fontWeight: '800' }]}>{n}</Text>
                            <Text style={e.nota}>{cuando}</Text>
                          </View>
                          {hay ? <Text style={{ color: c.suave, fontSize: tam(20) }}>›</Text> : null}
                        </Pressable>
                      );
                    })}
                  </Tarjeta>
                </>
              ) : null}

              <Text style={e.nota}>Si sientes dolor (no el esfuerzo normal), para. Ante una lesión o enfermedad, consulta con un profesional sanitario.</Text>
            </>
          )}
          <View style={{ height: 24 }} />
        </ScrollView>
        {ampliar !== null && ficha?.visual ? <Ampliada ficha={ficha} inicio={ampliar} onCerrar={() => setAmpliar(null)} /> : null}
      </View>
    </Modal>
  );
}

const e = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.fondo },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, maxWidth: 640, width: '100%', alignSelf: 'center' },
  marca: { color: c.oro, fontSize: tam(12), fontWeight: '900', letterSpacing: 3 },
  titulo: { color: c.texto, fontSize: tam(24), fontWeight: '900' },
  cerrar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.campo, alignItems: 'center', justifyContent: 'center' },
  cerrarTexto: { color: c.texto, fontSize: tam(20), fontWeight: '900' },
  pagina: { padding: 16, paddingTop: 4, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { color: c.suave, backgroundColor: c.campo, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, fontSize: tam(13), fontWeight: '700', overflow: 'hidden' },
  // Las ilustraciones son dibujos negros sobre blanco: van sobre un fondo claro en todos los temas.
  lienzo: { width: '100%', aspectRatio: 1.25, borderRadius: 16, backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: 1, borderColor: c.borde },
  imagen: { width: '100%', height: '100%' },
  progreso: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progresoTexto: { color: c.suave, fontSize: tam(12), fontWeight: '700' },
  progresoBarra: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.campo, overflow: 'hidden' },
  progresoRelleno: { height: 6, borderRadius: 3, backgroundColor: c.oro },
  etiquetaFase: { position: 'absolute', left: 10, bottom: 10, backgroundColor: 'rgba(17,17,17,0.78)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  etiquetaFaseTexto: { color: '#FFFFFF', fontSize: tam(13), fontWeight: '800' },
  lupa: { position: 'absolute', right: 10, top: 6, color: '#111111', fontSize: tam(22), fontWeight: '900' },
  controles: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  boton: { flexGrow: 1, flexBasis: 90, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.borde, backgroundColor: c.campo, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  botonTexto: { color: c.texto, fontSize: tam(14), fontWeight: '800' },
  nota: { color: c.suave, fontSize: tam(13), lineHeight: tam(18) },
  credito: { color: c.suave, fontSize: tam(11), lineHeight: tam(16) },
  creditoEnlace: { color: c.oro, textDecorationLine: 'underline' },
  texto: { color: c.texto, fontSize: tam(15), lineHeight: tam(22), flexShrink: 1 },
  paso: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  pasoNumero: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.oro, color: c.sobreOro, textAlign: 'center', lineHeight: 26, fontWeight: '900', fontSize: tam(14), overflow: 'hidden' },
  alternativa: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, minHeight: 44 },
  ampliada: { flex: 1, backgroundColor: '#FFFFFF', padding: 16, gap: 12, justifyContent: 'center' },
  ampliadaTitulo: { color: '#111111', fontSize: tam(18), fontWeight: '900', textAlign: 'center' },
  ampliadaLienzo: { flex: 1, maxHeight: 640, width: '100%' },
});
