// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
import { ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, Vibration } from 'react-native';

import { c, radio, tam } from './tema';
export { c, tam };

type PropsPildora = {
  texto: string;
  onPress: () => void;
  tipo?: 'oro' | 'neutro' | 'peligro';
  deshabilitado?: boolean;
  chica?: boolean;
};

export function Pildora({ texto, onPress, tipo = 'oro', deshabilitado, chica }: PropsPildora) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texto}
      disabled={deshabilitado}
      onPress={onPress}
      style={({ pressed }) => [
        e.pildora,
        chica && e.pildoraChica,
        tipo === 'oro' && { backgroundColor: c.oro },
        tipo === 'neutro' && { backgroundColor: c.campo },
        tipo === 'peligro' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.rojo },
        (pressed || deshabilitado) && { opacity: 0.55 },
      ]}
    >
      <Text
        style={[
          e.pildoraTexto,
          chica && { fontSize: tam(15) },
          { color: tipo === 'oro' ? c.sobreOro : tipo === 'peligro' ? c.rojo : c.texto },
        ]}
      >
        {texto}
      </Text>
    </Pressable>
  );
}

export const Campo = (p: TextInputProps) => (
  <TextInput placeholderTextColor={c.placeholder} {...p} style={[e.campo, p.style]} />
);

export const Titulo = ({ children }: { children: ReactNode }) => <Text style={e.titulo}>{children}</Text>;
export const Tarjeta = ({ children, destacada }: { children: ReactNode; destacada?: boolean }) => (
  <View style={[e.tarjeta, destacada && { borderColor: c.oro, borderWidth: 1.5 }]}>{children}</View>
);

// ---------- Componentes del sistema de diseño ----------
export const Seccion = ({ children }: { children: ReactNode }) => <Text style={e.seccion}>{children}</Text>;

export function Chip(p: { texto: string; activo?: boolean; onPress?: () => void; etiqueta?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={p.etiqueta ?? p.texto}
      accessibilityState={{ selected: !!p.activo }}
      onPress={p.onPress}
      style={({ pressed }) => [e.chip, p.activo && { backgroundColor: c.oro }, pressed && { opacity: 0.7 }]}
    >
      <Text style={[e.chipTexto, p.activo && { color: c.sobreOro }]}>{p.texto}</Text>
    </Pressable>
  );
}

// Selector de una opción con aspecto de pestañas (Semanal | Mensual…)
export function Segmentos<T extends string>(p: { valor: T; opciones: [T, string][]; onCambio: (v: T) => void; etiqueta?: string }) {
  return (
    <View style={e.segmentos} accessibilityRole="tablist" accessibilityLabel={p.etiqueta}>
      {p.opciones.map(([v, t]) => (
        <Pressable
          key={v}
          accessibilityRole="tab"
          accessibilityState={{ selected: v === p.valor }}
          onPress={() => p.onCambio(v)}
          style={[e.segmento, v === p.valor && { backgroundColor: c.tarjeta }]}
        >
          <Text style={[e.segmentoTexto, v === p.valor && { color: c.texto }]}>{t}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Barra(p: { valor: number; max: number; color?: string; alto?: number; etiqueta?: string }) {
  const pct = p.max > 0 ? Math.max(0, Math.min(1, p.valor / p.max)) : 0;
  return (
    <View
      style={[e.barra, { height: p.alto ?? 10 }]}
      accessibilityRole="progressbar"
      accessibilityLabel={p.etiqueta}
      accessibilityValue={{ min: 0, max: p.max, now: Math.min(p.valor, p.max) }}
    >
      <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: radio.pildora, backgroundColor: p.color ?? c.oro }} />
    </View>
  );
}

// Avatar con iniciales y un color estable a partir del nombre.
const TONOS = ['#6C8CFF', '#FF8A65', '#4DB6AC', '#BA68C8', '#FFB74D', '#4FC3F7', '#AED581', '#F06292'];
export function Avatar({ nombre, tam: t = 44, borde }: { nombre: string; tam?: number; borde?: string }) {
  const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('') || '?';
  const tono = TONOS[[...nombre].reduce((a, ch) => a + ch.charCodeAt(0), 0) % TONOS.length];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: t, height: t, borderRadius: t / 2, backgroundColor: tono, alignItems: 'center', justifyContent: 'center', borderWidth: borde ? 3 : 0, borderColor: borde }}
    >
      <Text style={{ color: '#111', fontWeight: '900', fontSize: Math.round(t * 0.38) }}>{iniciales}</Text>
    </View>
  );
}

// Insignia circular para logros y medallas.
export function Insignia({ icono, conseguida, tam: t = 56 }: { icono: string; conseguida: boolean; tam?: number }) {
  return (
    <View
      style={{
        width: t, height: t, borderRadius: t / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: conseguida ? c.acentoSuave : c.campo, borderWidth: 2, borderColor: conseguida ? c.oro : c.borde,
        opacity: conseguida ? 1 : 0.55,
      }}
    >
      <Text style={{ fontSize: Math.round(t * 0.46) }}>{conseguida ? icono : '🔒'}</Text>
    </View>
  );
}

export function Vacio({ icono, titulo, texto, accion }: { icono: string; titulo: string; texto: string; accion?: ReactNode }) {
  return (
    <View style={e.vacio}>
      <Text style={{ fontSize: tam(40) }}>{icono}</Text>
      <Text style={e.vacioTitulo}>{titulo}</Text>
      <Text style={e.vacioTexto}>{texto}</Text>
      {accion}
    </View>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <View style={{ gap: 8 }} accessibilityLabel={texto} accessibilityRole="progressbar">
      {[0.9, 0.7, 0.5].map((w, i) => (
        <View key={i} style={{ height: 14, width: `${w * 100}%`, borderRadius: radio.s, backgroundColor: c.campo }} />
      ))}
    </View>
  );
}

export function Aviso({ tipo = 'info', texto }: { tipo?: 'ok' | 'error' | 'info'; texto: string }) {
  const color = tipo === 'ok' ? c.verde : tipo === 'error' ? c.rojo : c.texto;
  return (
    <View style={[e.aviso, { borderColor: tipo === 'info' ? c.borde : color }]} accessibilityRole={tipo === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite">
      <Text style={{ color, fontSize: tam(15), lineHeight: tam(21), fontWeight: '600' }}>{tipo === 'ok' ? '✓ ' : tipo === 'error' ? '⚠️ ' : 'ℹ️ '}{texto}</Text>
    </View>
  );
}

export function Dialogo(p: {
  titulo: string;
  mensaje?: string;
  si: string;
  no?: string;
  peligro?: boolean;
  onSi: () => void;
  onNo?: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={p.onNo ?? p.onSi}>
      <View style={e.velo}>
        <View style={e.dialogo}>
          <Text style={e.dialogoTitulo}>{p.titulo}</Text>
          {p.mensaje ? <Text style={e.dialogoMensaje}>{p.mensaje}</Text> : null}
          {p.children}
          <View style={{ gap: 10, marginTop: 8 }}>
            <Pildora texto={p.si} tipo={p.peligro ? 'peligro' : 'oro'} onPress={p.onSi} />
            {p.no && p.onNo ? <Pildora texto={p.no} tipo="neutro" onPress={p.onNo} /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

let audio: any = null;

// iPhone solo deja sonar si el audio se activó con un toque del usuario.
export function prepararSonido() {
  if (Platform.OS !== 'web') return;
  const w = window as any;
  const Contexto = w.AudioContext || w.webkitAudioContext;
  if (!audio && Contexto) audio = new Contexto();
  audio?.resume?.();
}

export function avisoFinDescanso() {
  if (Platform.OS !== 'web') {
    Vibration.vibrate(500);
    return;
  }
  if (!audio) return;
  [0, 0.28, 0.56].forEach((t) => {
    const osc = audio.createOscillator();
    const vol = audio.createGain();
    osc.frequency.value = 880;
    vol.gain.value = 0.25;
    osc.connect(vol).connect(audio.destination);
    osc.start(audio.currentTime + t);
    osc.stop(audio.currentTime + t + 0.18);
  });
}

const e = StyleSheet.create({
  pildora: {
    minHeight: 50,
    paddingHorizontal: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pildoraChica: { minHeight: 44, paddingHorizontal: 18 },
  pildoraTexto: { fontSize: tam(17), fontWeight: '800' },
  campo: {
    backgroundColor: c.campo,
    color: c.texto,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    minWidth: 0,
    fontSize: tam(16),
  },
  titulo: { color: c.texto, fontSize: tam(32), fontWeight: '900', letterSpacing: -0.5 },
  tarjeta: { backgroundColor: c.tarjeta, borderRadius: radio.l, padding: 16, gap: 10, borderWidth: c.oscuro ? 0 : 1, borderColor: c.borde },
  seccion: { color: c.texto, fontSize: tam(20), fontWeight: '900', marginTop: 6 },
  chip: { paddingHorizontal: 14, minHeight: 40, borderRadius: radio.pildora, justifyContent: 'center', backgroundColor: c.campo },
  chipTexto: { color: c.texto, fontSize: tam(14), fontWeight: '700' },
  segmentos: { flexDirection: 'row', backgroundColor: c.campo, borderRadius: radio.m, padding: 4, gap: 4 },
  segmento: { flex: 1, minHeight: 40, borderRadius: radio.s, alignItems: 'center', justifyContent: 'center' },
  segmentoTexto: { color: c.suave, fontSize: tam(15), fontWeight: '800' },
  barra: { width: '100%', backgroundColor: c.campo, borderRadius: radio.pildora, overflow: 'hidden' },
  vacio: { alignItems: 'center', gap: 8, paddingVertical: 24, paddingHorizontal: 12 },
  vacioTitulo: { color: c.texto, fontSize: tam(18), fontWeight: '900', textAlign: 'center' },
  vacioTexto: { color: c.suave, fontSize: tam(15), lineHeight: tam(21), textAlign: 'center' },
  aviso: { borderWidth: 1, borderRadius: radio.m, padding: 12, backgroundColor: c.campo },
  velo: { flex: 1, backgroundColor: c.velo, justifyContent: 'center', padding: 20 },
  dialogo: { backgroundColor: c.tarjeta, borderRadius: 24, padding: 22, gap: 10, maxWidth: 440, width: '100%', alignSelf: 'center' },
  dialogoTitulo: { color: c.texto, fontSize: tam(22), fontWeight: '900' },
  dialogoMensaje: { color: c.suave, fontSize: tam(16), lineHeight: tam(22) },
});
