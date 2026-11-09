import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { User } from '@supabase/supabase-js';

import { mensajeError, sb } from './nube';
import { Campo, Pildora, Tarjeta, c } from './ui';

type Modo = 'entrar' | 'registro' | 'olvido' | 'nueva';

export function Cuenta(p: { modoInicial?: Modo; onListo: (u: User) => void; onSinCuenta?: () => void }) {
  const [modo, setModo] = useState<Modo>(p.modoInicial ?? 'entrar');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const [cargando, setCargando] = useState(false);

  const titulo = { entrar: 'Entra en tu cuenta', registro: 'Crea tu cuenta gratis', olvido: 'Recuperar contraseña', nueva: 'Nueva contraseña' }[modo];
  const boton = { entrar: 'Entrar', registro: 'Crear cuenta', olvido: 'Enviarme un enlace', nueva: 'Guardar contraseña' }[modo];

  const enviar = async () => {
    if (!sb) return;
    setMsg(null);
    const mail = email.trim();
    if (modo !== 'nueva' && !/^\S+@\S+\.\S+$/.test(mail)) return setMsg({ t: 'Escribe un email válido.' });
    if ((modo === 'registro' || modo === 'nueva') && clave.length < 6) return setMsg({ t: 'La contraseña debe tener al menos 6 caracteres.' });
    setCargando(true);
    try {
      if (modo === 'entrar') {
        const { data, error } = await sb.auth.signInWithPassword({ email: mail, password: clave });
        if (error) throw error;
        p.onListo(data.user);
      } else if (modo === 'registro') {
        const { data, error } = await sb.auth.signUp({ email: mail, password: clave });
        if (error) throw error;
        if (data.session && data.user) p.onListo(data.user);
        else {
          setMsg({ t: 'Te hemos enviado un email para confirmar la cuenta. Ábrelo y vuelve aquí para entrar.', ok: true });
          setModo('entrar');
        }
      } else if (modo === 'olvido') {
        const destino = Platform.OS === 'web' ? window.location.origin + window.location.pathname : undefined;
        const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo: destino });
        if (error) throw error;
        setMsg({ t: 'Si hay una cuenta con ese email, te llegará un enlace para cambiar la contraseña.', ok: true });
      } else {
        const { data, error } = await sb.auth.updateUser({ password: clave });
        if (error) throw error;
        p.onListo(data.user);
      }
    } catch (e) {
      setMsg({ t: mensajeError(e) });
    }
    setCargando(false);
  };

  const Enlace = ({ texto, a }: { texto: string; a: Modo }) => (
    <Pressable accessibilityRole="link" onPress={() => { setModo(a); setMsg(null); }} hitSlop={8}>
      <Text style={e.enlace}>{texto}</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
        <Text style={e.marca}>Forja</Text>
        <Text style={e.lema}>Tu entreno, tu despensa y tu proteína en una sola app.</Text>
        <Tarjeta>
          <Text style={e.titulo}>{titulo}</Text>
          {modo !== 'nueva' ? (
            <Campo
              accessibilityLabel="Email"
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          ) : null}
          {modo !== 'olvido' ? (
            <Campo
              accessibilityLabel="Contraseña"
              placeholder={modo === 'entrar' ? 'Contraseña' : 'Contraseña (mínimo 6)'}
              secureTextEntry
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              value={clave}
              onChangeText={setClave}
              onSubmitEditing={enviar}
            />
          ) : null}
          {msg ? <Text style={[e.msg, msg.ok && { color: c.verde }]}>{msg.t}</Text> : null}
          <Pildora texto={cargando ? 'Un momento…' : boton} deshabilitado={cargando} onPress={enviar} />
          <View style={e.fila}>
            {modo === 'entrar' ? (
              <>
                <Enlace texto="Crear cuenta" a="registro" />
                <Enlace texto="¿Olvidaste la contraseña?" a="olvido" />
              </>
            ) : modo !== 'nueva' ? (
              <Enlace texto="Ya tengo cuenta" a="entrar" />
            ) : null}
          </View>
        </Tarjeta>
        <Text style={e.nota}>Con cuenta, tus datos se guardan en la nube (los ves en cualquier móvil) y puedes usar la IA: leer tickets, recetas y preguntar al coach. Solo tú puedes ver tus datos.</Text>
        {p.onSinCuenta ? <Pildora chica tipo="neutro" texto="Usar sin cuenta (solo en este móvil)" onPress={p.onSinCuenta} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const e = StyleSheet.create({
  pagina: { padding: 20, gap: 16, paddingTop: 48, maxWidth: 480, width: '100%', alignSelf: 'center' },
  marca: { color: c.oro, fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  lema: { color: c.suave, fontSize: 16, lineHeight: 22, marginTop: -8 },
  titulo: { color: c.texto, fontSize: 22, fontWeight: '900' },
  msg: { color: c.rojo, fontSize: 15, lineHeight: 21 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  enlace: { color: c.oro, fontSize: 15, fontWeight: '700' },
  nota: { color: c.suave, fontSize: 14, lineHeight: 20 },
});
