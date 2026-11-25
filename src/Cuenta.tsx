// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { User } from '@supabase/supabase-js';

import { mensajeError, sb } from './nube';
import { Campo, Pildora, Tarjeta, c, tam, Aviso } from './ui';
import { EnlacePrivacidad, EnlaceTerminos } from './Privacidad';
import { EtiquetaBeta } from './Beta';
import { EDAD_MINIMA, VERSION_TEXTOS } from './legal';
import { VERSION_CONSENTIMIENTO_SENSACIONES } from './consentimientos';
import { Captcha } from './Captcha';
import { opcionesCaptcha, requiereCaptcha } from './turnstile';
import { CAPTCHA_SITEKEY } from './config';

type Modo = 'entrar' | 'registro' | 'olvido' | 'nueva';

function Enlace({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
      <Text style={e.enlace}>{texto}</Text>
    </Pressable>
  );
}

export function Cuenta(p: { modoInicial?: Modo; invitacion?: string | null; onListo: (u: User) => void; onSinCuenta?: () => void }) {
  const [modo, setModo] = useState<Modo>(p.modoInicial ?? 'entrar');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mayor, setMayor] = useState(false); // tengo la edad mínima y acepto términos y privacidad
  const [consiente, setConsiente] = useState(false); // consentimiento explícito para guardar mis datos (pueden ser de salud) en la nube
  const [token, setToken] = useState<string | null>(null); // token de Turnstile (de un solo uso)
  const [reinicio, setReinicio] = useState(0);
  const [sensaciones, setSensaciones] = useState(false); // consentimiento APARTE y opcional para «cómo ha ido» y «me dolió algo» (sin marcar de partida)

  const conCaptcha = requiereCaptcha(CAPTCHA_SITEKEY, modo);
  const titulo = { entrar: 'Entra en tu cuenta', registro: 'Crea tu cuenta gratis', olvido: 'Recuperar contraseña', nueva: 'Nueva contraseña' }[modo];
  const boton = { entrar: 'Entrar', registro: 'Crear cuenta', olvido: 'Enviarme un enlace', nueva: 'Guardar contraseña' }[modo];

  const ir = (m: Modo) => {
    setModo(m);
    setMsg(null);
  };

  const enviar = async () => {
    if (!sb) return;
    setMsg(null);
    const mail = email.trim();
    if (modo !== 'nueva' && !/^\S+@\S+\.\S+$/.test(mail)) return setMsg({ t: 'Escribe un email válido.' });
    if ((modo === 'registro' || modo === 'nueva') && clave.length < 8) return setMsg({ t: 'La contraseña debe tener al menos 8 caracteres.' });
    if (modo === 'registro' && !(mayor && consiente)) return setMsg({ t: 'Para crear la cuenta marca las dos casillas.' });
    if (conCaptcha && !token) return setMsg({ t: 'Completa la comprobación anti-robots para continuar.' });
    const cap = opcionesCaptcha(conCaptcha ? token : null);
    setCargando(true);
    try {
      if (modo === 'entrar') {
        const { data, error } = await sb.auth.signInWithPassword({ email: mail, password: clave, options: { ...cap } });
        if (error) throw error;
        p.onListo(data.user);
      } else if (modo === 'registro') {
        // Se guarda en la cuenta (metadatos de Supabase) qué versión de los textos se aceptó y cuándo: es la prueba del consentimiento.
        const { data, error } = await sb.auth.signUp({ email: mail, password: clave, options: { data: { terminos: VERSION_TEXTOS, edad_minima: EDAD_MINIMA, consentimiento_datos_nube: VERSION_TEXTOS, consentimiento_sensaciones: sensaciones ? VERSION_CONSENTIMIENTO_SENSACIONES : 0, aceptado: new Date().toISOString() }, ...cap } });
        if (error) throw error;
        if (data.session && data.user) p.onListo(data.user);
        else {
          setMsg({ t: 'Te hemos enviado un email para confirmar la cuenta. Ábrelo y vuelve aquí para entrar.', ok: true });
          setModo('entrar');
        }
      } else if (modo === 'olvido') {
        const destino = Platform.OS === 'web' ? window.location.origin + window.location.pathname : undefined;
        const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo: destino, ...cap });
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
    if (conCaptcha) {
      setToken(null); // el token es de un solo uso: se pide uno nuevo tras cada intento
      setReinicio((r) => r + 1);
    }
    setCargando(false);
  };


  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={e.marca}>FORJA</Text>
          <EtiquetaBeta />
        </View>
        <Text style={e.lema}>Tu entreno, tu despensa y tu proteína en una sola app.</Text>
        {p.invitacion ? (
          <Aviso tipo="ok" texto={`Te han invitado a FORJA Arena (${p.invitacion}). Crea tu cuenta gratis y podrás aceptar la invitación.`} />
        ) : null}
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
              placeholder={modo === 'entrar' ? 'Contraseña' : 'Contraseña (mínimo 8)'}
              secureTextEntry
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              value={clave}
              onChangeText={setClave}
              onSubmitEditing={enviar}
            />
          ) : null}
          {modo === 'registro' ? (
            <View style={{ gap: 10 }}>
              <Casilla valor={mayor} onCambio={setMayor} etiqueta="Tengo 16 años o más y acepto los términos de uso y la política de privacidad">
                {`Tengo ${EDAD_MINIMA} años o más y acepto los términos de uso y la política de privacidad.`}
              </Casilla>
              <Casilla valor={consiente} onCambio={setConsiente} etiqueta="Consiento que se guarden mis datos en la nube">
                Consiento que FORJA guarde mis datos en la nube para sincronizarlos, incluidos los que pueden revelar información sobre mi salud (como peso y medidas). Puedo retirarlo borrando mi cuenta.
              </Casilla>
              <Casilla valor={sensaciones} onCambio={setSensaciones} etiqueta="Guardar también cómo me sientan los entrenos y si me dolió algo (opcional)">
                Opcional: quiero guardar también cómo me sientan los entrenos y si me dolió algo, para recibir sugerencias más prudentes. Puedo retirarlo cuando quiera en Ajustes → Privacidad (se borran las respuestas).
              </Casilla>
              <View style={e.fila}>
                <EnlaceTerminos />
                <EnlacePrivacidad />
              </View>
            </View>
          ) : null}
          {conCaptcha ? <Captcha token={token} onToken={setToken} reinicio={reinicio} /> : null}
          {msg ? <Text style={[e.msg, msg.ok && { color: c.verde }]}>{msg.t}</Text> : null}
          <Pildora texto={cargando ? 'Un momento…' : boton} deshabilitado={cargando || (modo === 'registro' && !(mayor && consiente)) || (conCaptcha && !token)} onPress={enviar} />
          <View style={e.fila}>
            {modo === 'entrar' ? (
              <>
                <Enlace texto="Crear cuenta" onPress={() => ir('registro')} />
                <Enlace texto="¿Olvidaste la contraseña?" onPress={() => ir('olvido')} />
              </>
            ) : modo !== 'nueva' ? (
              <Enlace texto="Ya tengo cuenta" onPress={() => ir('entrar')} />
            ) : null}
          </View>
        </Tarjeta>
        <Text style={e.nota}>Con cuenta, tus datos se guardan en la nube (los ves en cualquier móvil) y puedes competir con tus amigos en FORJA Arena. En Privacidad se explica quién puede ver cada dato.</Text>
        {p.onSinCuenta ? <Pildora chica tipo="neutro" texto="Usar sin cuenta (solo en este móvil)" onPress={p.onSinCuenta} /> : null}
        {modo !== 'registro' ? (
          <View style={e.fila}>
            <EnlaceTerminos />
            <EnlacePrivacidad />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Casilla({ valor, onCambio, etiqueta, children }: { valor: boolean; onCambio: (v: boolean) => void; etiqueta: string; children: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={etiqueta} accessibilityState={{ checked: valor }} onPress={() => onCambio(!valor)} style={e.casilla}>
      <View style={[e.caja, valor && { backgroundColor: c.oro }]}>{valor ? <Text style={{ color: c.sobreOro, fontWeight: '900' }}>✓</Text> : null}</View>
      <Text style={e.casillaTexto}>{children}</Text>
    </Pressable>
  );
}

const e = StyleSheet.create({
  casilla: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44 },
  caja: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: c.oro, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  casillaTexto: { color: c.texto, fontSize: tam(14), lineHeight: tam(20), flex: 1 },
  pagina: { padding: 20, gap: 16, paddingTop: 48, maxWidth: 480, width: '100%', alignSelf: 'center' },
  marca: { color: c.oro, fontSize: tam(40), fontWeight: '900', letterSpacing: -1 },
  lema: { color: c.suave, fontSize: tam(16), lineHeight: tam(22), marginTop: -8 },
  titulo: { color: c.texto, fontSize: tam(22), fontWeight: '900' },
  msg: { color: c.rojo, fontSize: tam(15), lineHeight: tam(21) },
  fila: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  enlace: { color: c.oro, fontSize: tam(15), fontWeight: '700' },
  nota: { color: c.suave, fontSize: tam(14), lineHeight: tam(20) },
});
