// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Dificultad del entrenamiento: selector, recomendación (orienta, nunca decide), sensación tras el entreno y resumen.
// Los cambios solo ocurren cuando pulsas un botón. No tocan tu nivel físico ni tu nivel FORJA.
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Accion, Recomendacion, aplicarCambioDificultad, mantenerDificultad, recomendar, registrarSensacion, resumenSensaciones } from './adaptacion';
import { Datos, Nivel, Perfil, Sensacion, dificultadDe } from './datos';
import { AVISO_GENERAL, DIFICULTADES, Direccion, EXPLICA_DIFICULTAD, NOMBRE_DIFICULTAD, TEXTO_DIRECCION, paso, puede } from './niveles';
import { reajustarPlan } from './reglas';
import { radio } from './tema';
import { Pildora, Tarjeta, c, tam } from './ui';

type Actualizar = (f: (d: Datos) => Datos) => void;

// Tres barritas que suben: cuántas están llenas indica la dificultad.
export function Medidor({ nivel }: { nivel: Nivel }) {
  const n = DIFICULTADES.indexOf(nivel) + 1;
  return (
    <View accessibilityLabel={`Dificultad ${NOMBRE_DIFICULTAD[nivel]}: ${n} de 3`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 36 }}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={{ width: 11, height: 10 + i * 8, borderRadius: 4, backgroundColor: i <= n ? c.oro : c.campo }} />
      ))}
    </View>
  );
}

const hayPlanDeCoach = (d: Datos) => d.rutinas.some((r) => r.deCoach);

function OpcionDireccion({ dir, actual, titulo, onElegir }: { dir: Direccion; actual: Nivel; titulo: string; onElegir: (d: Direccion) => void }) {
  const activa = puede(actual, dir);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${TEXTO_DIRECCION[dir]}`}
      accessibilityState={{ disabled: !activa }}
      disabled={!activa}
      onPress={() => onElegir(dir)}
      style={[e.opcion, !activa && { opacity: 0.45 }]}
    >
      <Text style={e.opcionTitulo}>{dir === 'bajar' ? '−  ' : dir === 'subir' ? '+  ' : '=  '}{titulo}</Text>
      <Text style={e.sub}>{activa ? TEXTO_DIRECCION[dir] : dir === 'bajar' ? 'Ya estás en la más suave.' : 'Ya estás en la más exigente.'}</Text>
    </Pressable>
  );
}

// ---------- Selector (ventana) ----------
export function SelectorDificultad(p: { d: Datos; onActualizar: Actualizar; onCerrar: () => void; inicial?: Direccion | null }) {
  const actual = dificultadDe(p.d.perfil!);
  const [pendiente, setPendiente] = useState<Direccion | null>(p.inicial && p.inicial !== 'mantener' ? p.inicial : null);
  const [alPlan, setAlPlan] = useState(true);
  const destino = pendiente ? paso(actual, pendiente) : actual;
  const plan = hayPlanDeCoach(p.d);
  const cambios = useMemo(() => (pendiente && plan ? reajustarPlan(p.d, destino).cambios : []), [p.d, pendiente, plan, destino]);

  const confirmar = () => {
    p.onActualizar((d) => aplicarCambioDificultad(d, destino, alPlan && plan));
    p.onCerrar();
  };
  const mantener = () => {
    p.onActualizar((d) => mantenerDificultad(d)); // elegir «mantener» cuenta como elegirla
    p.onCerrar();
  };

  const elegir = (dir: Direccion) => (dir === 'mantener' ? mantener() : setPendiente(dir));

  return (
    <Modal transparent animationType="slide" visible onRequestClose={p.onCerrar}>
      <View style={e.velo}>
        <View style={e.hoja}>
          <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
            <Text style={e.titulo}>{pendiente ? `Pasar a «${NOMBRE_DIFICULTAD[destino]}»` : 'Dificultad del entrenamiento'}</Text>
            {!pendiente ? (
              <>
                <Text style={e.sub}>Tú eliges cuánta exigencia quieres. No cambia tu nivel físico ni tu nivel FORJA.</Text>
                <View style={e.actual}>
                  <Medidor nivel={actual} />
                  <View style={{ flex: 1 }}>
                    <Text style={e.etiqueta}>Ahora</Text>
                    <Text style={e.grande}>{NOMBRE_DIFICULTAD[actual]}</Text>
                  </View>
                </View>
                <Text style={e.sub}>{EXPLICA_DIFICULTAD[actual]}</Text>
                <OpcionDireccion dir="bajar" actual={actual} titulo={`Reducir a ${NOMBRE_DIFICULTAD[paso(actual, 'bajar')]}`} onElegir={elegir} />
                <OpcionDireccion dir="mantener" actual={actual} titulo={`Mantener ${NOMBRE_DIFICULTAD[actual]}`} onElegir={elegir} />
                <OpcionDireccion dir="subir" actual={actual} titulo={`Aumentar a ${NOMBRE_DIFICULTAD[paso(actual, 'subir')]}`} onElegir={elegir} />
                <Pildora texto="Cerrar" tipo="neutro" onPress={p.onCerrar} />
              </>
            ) : (
              <>
                <View style={e.actual}>
                  <Medidor nivel={destino} />
                  <Text style={[e.sub, { flex: 1 }]}>{EXPLICA_DIFICULTAD[destino]}</Text>
                </View>
                {plan ? (
                  <>
                    <Text style={e.etiqueta}>Tu plan del coach</Text>
                    {cambios.length ? (
                      <View style={{ gap: 4 }}>
                        {cambios.slice(0, 4).map((x) => (
                          <Text key={x} style={e.sub}>• {x}</Text>
                        ))}
                        {cambios.length > 4 ? <Text style={e.sub}>… y {cambios.length - 4} cambios más.</Text> : null}
                      </View>
                    ) : (
                      <Text style={e.sub}>Tu plan actual no necesita cambios para este nivel.</Text>
                    )}
                    <View style={e.dos}>
                      <Pressable accessibilityRole="radio" accessibilityState={{ checked: alPlan }} onPress={() => setAlPlan(true)} style={[e.eleccion, alPlan && { backgroundColor: c.oro }]}>
                        <Text style={[e.eleccionTexto, alPlan && { color: c.sobreOro }]}>Aplicar a mi plan</Text>
                      </Pressable>
                      <Pressable accessibilityRole="radio" accessibilityState={{ checked: !alPlan }} onPress={() => setAlPlan(false)} style={[e.eleccion, !alPlan && { backgroundColor: c.oro }]}>
                        <Text style={[e.eleccionTexto, !alPlan && { color: c.sobreOro }]}>Solo planes nuevos</Text>
                      </Pressable>
                    </View>
                    <Text style={e.sub}>Tus rutinas propias, tus pesos y tus días de descanso no cambian.</Text>
                  </>
                ) : (
                  <Text style={e.sub}>Se usará cuando crees o rehagas tu plan.</Text>
                )}
                <Pildora texto={`Confirmar: ${NOMBRE_DIFICULTAD[destino]}`} onPress={confirmar} />
                <Pildora texto="Volver" tipo="neutro" onPress={() => setPendiente(null)} />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------- Elegir la dificultad antes de rehacer el plan (cuando nunca la has elegido) ----------
export function ElegirDificultadInicial(p: { perfil: Perfil; nuevo: boolean; onElegir: (n: Nivel) => void; onVolver: () => void }) {
  const [elegida, setElegida] = useState<Nivel>(dificultadDe(p.perfil));
  const nivelFisico = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' }[p.perfil.nivel];
  return (
    <Modal transparent animationType="slide" visible onRequestClose={p.onVolver}>
      <View style={e.velo}>
        <View style={e.hoja}>
          <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
            <Text style={e.titulo}>¿Con qué dificultad quieres tu plan?</Text>
            <Text style={e.sub}>
              Vamos a {p.nuevo ? 'crear' : 'rehacer'} tu plan del coach. Elige tú la dificultad: tu nivel físico ({nivelFisico}) no la decide por ti ni se modifica.
            </Text>
            {DIFICULTADES.map((n) => (
              <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${NOMBRE_DIFICULTAD[n]}. ${EXPLICA_DIFICULTAD[n]}`} accessibilityState={{ checked: elegida === n }} onPress={() => setElegida(n)} style={[e.opcion, elegida === n && { borderWidth: 2, borderColor: c.oro }]}>
                <View style={e.cabecera}>
                  <Medidor nivel={n} />
                  <Text style={e.opcionTitulo}>{NOMBRE_DIFICULTAD[n]}{n === dificultadDe(p.perfil) ? '  ·  sugerida como punto de partida' : ''}</Text>
                </View>
                <Text style={e.sub}>{EXPLICA_DIFICULTAD[n]}</Text>
              </Pressable>
            ))}
            <Text style={e.sub}>{p.nuevo ? '' : 'Se sustituye solo el plan del coach sin tocar. Tus rutinas propias y las que hayas editado se conservan. '}Podrás cambiar la dificultad cuando quieras.</Text>
            <Pildora texto={p.nuevo ? 'Crear mi plan' : 'Rehacer mi plan'} onPress={() => p.onElegir(elegida)} />
            <Pildora texto="Volver sin guardar" tipo="neutro" onPress={p.onVolver} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------- Tarjeta de Coach: dificultad actual + recomendación ----------
const TEXTO_ACCION = (a: Accion, r: Recomendacion, actual: Nivel) =>
  a === 'subir' ? `Subir a ${NOMBRE_DIFICULTAD[r.destino ?? paso(actual, 'subir')]}`
    : a === 'bajar' ? `Bajar a ${NOMBRE_DIFICULTAD[r.destino ?? paso(actual, 'bajar')]}`
      : a === 'descansar' ? 'Semana de descarga' : 'Mantener';

export function Recomendacion_({ rec, actual, onSubir, onBajar, onMantener, onDescansar }: { rec: Recomendacion; actual: Nivel; onSubir: () => void; onBajar: () => void; onMantener: () => void; onDescansar: () => void }) {
  if (rec.silenciada && !rec.informativa) return null;
  if (rec.informativa)
    return (
      <View accessibilityLabel={`Sugerencia: ${rec.motivos[0]}`} style={{ gap: 2 }}>
        <Text style={e.sub}>💡 {rec.motivos[0]}</Text>
      </View>
    );
  const alarma = rec.tipo === 'descanso';
  return (
    <View style={[e.reco, alarma && { borderLeftColor: c.rojo }]} accessibilityLabel={`Sugerencia: ${rec.titulo}`}>
      <Text style={e.recoTitulo}>{alarma ? '🛌 ' : '💡 '}{rec.titulo}</Text>
      {rec.motivos.map((m) => (
        <Text key={m} style={e.sub}>• {m}</Text>
      ))}
      <View style={e.acciones}>
        {rec.acciones.map((a) => (
          <Pildora
            key={a}
            chica
            tipo={a === 'mantener' ? 'neutro' : 'oro'}
            texto={TEXTO_ACCION(a, rec, actual)}
            onPress={a === 'subir' ? onSubir : a === 'bajar' ? onBajar : a === 'descansar' ? onDescansar : onMantener}
          />
        ))}
      </View>
      <Text style={e.nota}>{AVISO_GENERAL}</Text>
    </View>
  );
}

export function TarjetaDificultad(p: { d: Datos; onActualizar: Actualizar; onDescarga: (hasta: number | null) => void }) {
  const [selector, setSelector] = useState<Direccion | 'abrir' | null>(null);
  const rec = useMemo(() => recomendar(p.d), [p.d]);
  if (!p.d.perfil) return null;
  const actual = dificultadDe(p.d.perfil);
  return (
    <>
      <Tarjeta>
        <View style={e.cabecera}>
          <Medidor nivel={actual} />
          <View style={{ flex: 1 }}>
            <Text style={e.etiqueta}>Dificultad del entrenamiento</Text>
            <Text style={e.grande}>{NOMBRE_DIFICULTAD[actual]}</Text>
          </View>
          <Pildora chica tipo="neutro" texto="Cambiar" onPress={() => setSelector('abrir')} />
        </View>
        <Text style={e.sub}>{EXPLICA_DIFICULTAD[actual]}</Text>
        {!p.d.perfil.dificultadConfirmada ? <Text style={e.nota}>Aún no la has elegido: «{NOMBRE_DIFICULTAD[actual]}» es solo un punto de partida. Cámbiala cuando quieras.</Text> : null}
        {rec ? (
          <Recomendacion_
            rec={rec}
            actual={actual}
            onSubir={() => setSelector('subir')}
            onBajar={() => setSelector('bajar')}
            onMantener={() => p.onActualizar((d) => mantenerDificultad(d))}
            onDescansar={() => p.onDescarga(Date.now() + 7 * 86400000)}
          />
        ) : null}
      </Tarjeta>
      {selector ? <SelectorDificultad d={p.d} onActualizar={p.onActualizar} inicial={selector === 'abrir' ? null : selector} onCerrar={() => setSelector(null)} /> : null}
    </>
  );
}

// ---------- Línea en Rutinas ----------
export function EntradaDificultad(p: { d: Datos; onActualizar: Actualizar }) {
  const [abierto, setAbierto] = useState(false);
  const rec = useMemo(() => recomendar(p.d), [p.d]);
  if (!p.d.perfil) return null;
  const actual = dificultadDe(p.d.perfil);
  const sugerencia = rec && !rec.informativa && !rec.silenciada;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Dificultad ${NOMBRE_DIFICULTAD[actual]}. Cambiar`} onPress={() => setAbierto(true)} style={e.linea}>
        <Medidor nivel={actual} />
        <View style={{ flex: 1 }}>
          <Text style={e.lineaTitulo}>Dificultad: {NOMBRE_DIFICULTAD[actual]}</Text>
          <Text style={e.nota}>{sugerencia ? '💡 Tienes una sugerencia en Coach' : 'Toca para cambiarla'}</Text>
        </View>
        <Text style={{ color: c.oro, fontSize: tam(22), fontWeight: '900' }}>›</Text>
      </Pressable>
      {abierto ? <SelectorDificultad d={p.d} onActualizar={p.onActualizar} onCerrar={() => setAbierto(false)} /> : null}
    </>
  );
}

// ---------- Después del entreno (opcional) ----------
export function SensacionTrasEntreno(p: { idSesion: string; onActualizar: Actualizar }) {
  const [sensacion, setSensacion] = useState<Sensacion | undefined>();
  const [dolor, setDolor] = useState(false);
  const guardar = (s: Sensacion | undefined, dl: boolean) => {
    setSensacion(s);
    setDolor(dl);
    p.onActualizar((d) => registrarSensacion(d, p.idSesion, s, dl));
  };
  const opciones: [Sensacion, string][] = [['facil', 'Fácil'], ['bien', 'Bien'], ['duro', 'Duro']];
  return (
    <View style={{ gap: 8, marginTop: 4 }}>
      <Text style={e.pregunta}>¿Cómo ha ido? <Text style={e.nota}>(opcional)</Text></Text>
      <View style={e.dos}>
        {opciones.map(([v, t]) => (
          <Pressable key={v} accessibilityRole="button" accessibilityLabel={t} accessibilityState={{ selected: sensacion === v }} onPress={() => guardar(sensacion === v ? undefined : v, dolor)} style={[e.eleccion, sensacion === v && { backgroundColor: c.oro }]}>
            <Text style={[e.eleccionTexto, sensacion === v && { color: c.sobreOro }]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Me dolió algo" accessibilityState={{ checked: dolor }} onPress={() => guardar(sensacion, !dolor)} style={e.casilla}>
        <View style={[e.caja, dolor && { backgroundColor: c.rojo, borderColor: c.rojo }]}>{dolor ? <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>✓</Text> : null}</View>
        <Text style={e.sub}>Me dolió algo</Text>
      </Pressable>
      {dolor ? <Text style={[e.sub, { color: c.rojo }]}>No entrenes con dolor: descansa y, si no se pasa, consulta con un profesional.</Text> : null}
    </View>
  );
}

// ---------- Progreso: cómo te han sentado los entrenos ----------
export function ResumenSensaciones({ d }: { d: Datos }) {
  const r = useMemo(() => resumenSensaciones(d), [d]);
  if (!r) return null;
  const partes: [string, number, string][] = [['fáciles', r.facil, c.nivel1], ['bien', r.bien, c.nivel2], ['duros', r.duro, c.nivel3]];
  return (
    <Tarjeta>
      <Text style={e.etiqueta}>Cómo te han sentado tus entrenos</Text>
      <View accessibilityLabel={`Últimos ${r.n} entrenos: ${r.facil} fáciles, ${r.bien} bien, ${r.duro} duros`} style={{ flexDirection: 'row', height: 12, borderRadius: radio.pildora, overflow: 'hidden', gap: 2 }}>
        {partes.filter((x) => x[1] > 0).map(([t, n, col]) => (
          <View key={t} style={{ flex: n, backgroundColor: col }} />
        ))}
      </View>
      <Text style={e.sub}>{partes.map(([t, n]) => `${n} ${t}`).join(' · ')} (últimos 28 días)</Text>
      {r.dolores > 0 ? <Text style={[e.sub, { color: c.rojo }]}>Marcaste molestias en {r.dolores} {r.dolores === 1 ? 'entreno' : 'entrenos'}. No entrenes con dolor.</Text> : null}
    </Tarjeta>
  );
}

const e = StyleSheet.create({
  velo: { flex: 1, backgroundColor: c.velo, justifyContent: 'flex-end' },
  hoja: { backgroundColor: c.tarjeta, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 28, maxHeight: '88%', width: '100%', maxWidth: 520, alignSelf: 'center' },
  titulo: { color: c.texto, fontSize: tam(24), fontWeight: '900' },
  grande: { color: c.texto, fontSize: tam(22), fontWeight: '900' },
  etiqueta: { color: c.suave, fontSize: tam(13), fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  sub: { color: c.suave, fontSize: tam(15), lineHeight: tam(21) },
  nota: { color: c.suave, fontSize: tam(13), lineHeight: tam(18), fontWeight: '600' },
  actual: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.campo, borderRadius: radio.m, padding: 14 },
  opcion: { backgroundColor: c.campo, borderRadius: radio.m, padding: 14, gap: 4, minHeight: 56 },
  opcionTitulo: { color: c.texto, fontSize: tam(17), fontWeight: '900' },
  dos: { flexDirection: 'row', gap: 8 },
  eleccion: { flex: 1, minHeight: 44, borderRadius: radio.pildora, alignItems: 'center', justifyContent: 'center', backgroundColor: c.campo, paddingHorizontal: 10 },
  eleccionTexto: { color: c.texto, fontSize: tam(15), fontWeight: '800', textAlign: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  reco: { gap: 6, backgroundColor: c.acentoSuave, borderRadius: radio.m, padding: 14, borderLeftWidth: 4, borderLeftColor: c.oro },
  recoTitulo: { color: c.texto, fontSize: tam(17), fontWeight: '900' },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  linea: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.tarjeta, borderRadius: radio.l, paddingHorizontal: 16, paddingVertical: 12, minHeight: 60, borderWidth: c.oscuro ? 0 : 1, borderColor: c.borde },
  lineaTitulo: { color: c.texto, fontSize: tam(16), fontWeight: '800' },
  pregunta: { color: c.texto, fontSize: tam(16), fontWeight: '800' },
  casilla: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  caja: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: c.borde, alignItems: 'center', justifyContent: 'center' },
});
