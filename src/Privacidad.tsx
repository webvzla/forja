import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Pildora, c } from './ui';

const SECCIONES: [string, string][] = [
  ['Sin cuenta', 'Todo se guarda solo en tu móvil. No se envía nada a ningún sitio. Si borras la app o los datos del navegador, se pierde (usa "Guardar copia").'],
  ['Con cuenta', 'Se guardan tu email y tus datos de la app (perfil, entrenos, comidas, despensa, recetas, medidas) en Supabase, un servicio en la nube. Solo tú puedes verlos: ni los demás usuarios ni nadie desde la app tiene acceso.'],
  ['La IA', 'Cuando usas el escáner de tickets, la foto del plato, las recetas con IA o el chat del coach, se envía a Google Gemini lo necesario para responder: la foto o la pregunta y un resumen de tu perfil y despensa. No se envían tu email ni tu nombre. Las fotos no se guardan en Forja. Mientras se use el nivel gratuito de Gemini, Google puede usar ese contenido para mejorar sus productos.'],
  ['Retos con amigos', 'Si te unes a un grupo, sus miembros ven el apodo que elijas y tu resumen semanal (entrenos hechos, días que cumpliste la proteína y tu racha). Nada más: ni tu peso, ni tus comidas, ni tus medidas.'],
  ['Tus derechos', 'Puedes descargar tus datos con "Guardar copia" y borrar tu cuenta cuando quieras desde Coach → Tu cuenta → Borrar mi cuenta. Se borra todo al momento y no se puede recuperar.'],
  ['Salud', 'Forja da orientación general, no consejo médico. Si tienes una lesión, enfermedad o un problema con la comida, consulta a un profesional.'],
];

export function EnlacePrivacidad() {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="link" onPress={() => setAbierta(true)} hitSlop={8}>
        <Text style={e.enlace}>Privacidad: qué se guarda y qué se envía</Text>
      </Pressable>
      <Modal transparent animationType="fade" visible={abierta} onRequestClose={() => setAbierta(false)}>
        <View style={e.velo}>
          <View style={e.caja}>
            <Text style={e.titulo}>Privacidad</Text>
            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }}>
              {SECCIONES.map(([t, x]) => (
                <View key={t} style={{ gap: 4 }}>
                  <Text style={e.subtitulo}>{t}</Text>
                  <Text style={e.texto}>{x}</Text>
                </View>
              ))}
            </ScrollView>
            <Pildora texto="Entendido" onPress={() => setAbierta(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const e = StyleSheet.create({
  enlace: { color: c.suave, fontSize: 14, textDecorationLine: 'underline' },
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'center', padding: 20 },
  caja: { backgroundColor: c.tarjeta, borderRadius: 24, padding: 22, gap: 12, maxWidth: 480, width: '100%', alignSelf: 'center' },
  titulo: { color: c.texto, fontSize: 22, fontWeight: '900' },
  subtitulo: { color: c.oro, fontSize: 16, fontWeight: '800' },
  texto: { color: c.texto, fontSize: 15, lineHeight: 21 },
});
