import { ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, Vibration } from 'react-native';

export const c = {
  fondo: '#0E0F13',
  tarjeta: '#191B22',
  campo: '#252832',
  borde: '#2F333F',
  texto: '#F5F3EC',
  suave: '#A3A7B5',
  oro: '#F2C14E',
  sobreOro: '#1B1605',
  verde: '#5BD6A0',
  rojo: '#FF7A70',
};

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
          chica && { fontSize: 15 },
          { color: tipo === 'oro' ? c.sobreOro : tipo === 'peligro' ? c.rojo : c.texto },
        ]}
      >
        {texto}
      </Text>
    </Pressable>
  );
}

export const Campo = (p: TextInputProps) => (
  <TextInput placeholderTextColor="#747987" {...p} style={[e.campo, p.style]} />
);

export const Titulo = ({ children }: { children: ReactNode }) => <Text style={e.titulo}>{children}</Text>;
export const Tarjeta = ({ children }: { children: ReactNode }) => <View style={e.tarjeta}>{children}</View>;

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
  pildoraTexto: { fontSize: 17, fontWeight: '800' },
  campo: {
    backgroundColor: c.campo,
    color: c.texto,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    minWidth: 0,
    fontSize: 16,
  },
  titulo: { color: c.texto, fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  tarjeta: { backgroundColor: c.tarjeta, borderRadius: 20, padding: 16, gap: 10 },
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'center', padding: 20 },
  dialogo: { backgroundColor: c.tarjeta, borderRadius: 24, padding: 22, gap: 10, maxWidth: 440, width: '100%', alignSelf: 'center' },
  dialogoTitulo: { color: c.texto, fontSize: 22, fontWeight: '900' },
  dialogoMensaje: { color: c.suave, fontSize: 16, lineHeight: 22 },
});
