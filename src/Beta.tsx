// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Piezas de la beta: etiqueta BETA, «Qué hay de nuevo», bienvenida y aviso de versión nueva.
import { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Dialogo, Pildora, Tarjeta, c, tam } from './ui';
import { NOVEDADES, VERSION, marcarNovedadesVistas } from './version';

export const EtiquetaBeta = () => (
  <View style={e.beta} accessibilityLabel="Versión beta">
    <Text style={e.betaTexto}>BETA</Text>
  </View>
);

const ICONO = { nuevo: '✨', mejora: '⬆️', arreglo: '🔧' } as const;
const NOMBRE = { nuevo: 'Nuevo', mejora: 'Mejora', arreglo: 'Arreglo' } as const;

export function Novedades({ onCerrar }: { onCerrar: () => void }) {
  useEffect(() => {
    void marcarNovedadesVistas();
  }, []);
  return (
    <Modal animationType="slide" visible onRequestClose={onCerrar}>
      <View style={{ flex: 1, backgroundColor: c.fondo }}>
        <View style={e.cabecera}>
          <Text style={e.titulo}>Qué hay de nuevo</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar novedades" onPress={onCerrar} style={e.cerrar} hitSlop={8}>
            <Text style={{ color: c.texto, fontSize: tam(20), fontWeight: '900' }}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={e.pagina}>
          <Text style={e.nota}>Estás usando FORJA BETA {VERSION}. Mejoramos la app cada pocas semanas con vuestras opiniones.</Text>
          {NOVEDADES.map((n) => (
            <Tarjeta key={n.version} destacada={n.version === VERSION}>
              <Text style={e.version}>{n.version} · {n.fecha}</Text>
              <Text style={e.nombre}>{n.titulo}</Text>
              {n.cambios.map((x) => (
                <Text key={x.texto} style={e.cambio}>{ICONO[x.tipo]} <Text style={{ fontWeight: '800' }}>{NOMBRE[x.tipo]}:</Text> {x.texto}</Text>
              ))}
            </Tarjeta>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// Primera apertura con la beta. Si ya había datos, se explica la copia automática que se guardó antes de tocar nada.
export function Bienvenida({ conDatos, onCopia, onCerrar }: { conDatos: boolean; onCopia: () => void; onCerrar: () => void }) {
  return (
    <Dialogo
      titulo="Bienvenido a FORJA BETA"
      si={conDatos ? 'Descargar copia ahora' : 'Entendido'}
      no={conDatos ? 'Entendido' : undefined}
      onSi={conDatos ? onCopia : onCerrar}
      onNo={conDatos ? onCerrar : undefined}
    >
      <Text style={e.cambio}>
        {conDatos
          ? 'Tus datos siguen aquí tal como los dejaste. Antes de nada hemos guardado una copia de seguridad dentro de este dispositivo (Ajustes → FORJA BETA). '
          : ''}
        Esta es una versión de pruebas: puede tener errores y la mejoramos cada pocas semanas con vuestras opiniones. Cuéntanos qué falla o qué te falta desde Ajustes → Ayuda y opiniones, y haz una copia de seguridad de vez en cuando.
      </Text>
    </Dialogo>
  );
}

export function BannerVersion({ obligatoria, onActualizar }: { obligatoria: boolean; onActualizar: () => void }) {
  return (
    <View style={[e.banner, obligatoria && { borderColor: c.oro }]} accessibilityRole="alert">
      <Text style={e.bannerTexto}>{obligatoria ? 'Esta versión de FORJA BETA ya no es compatible.' : 'Hay una versión nueva de FORJA BETA.'}</Text>
      <Pildora chica texto="Actualizar" onPress={onActualizar} />
    </View>
  );
}

const e = StyleSheet.create({
  beta: { backgroundColor: c.oro, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  betaTexto: { color: c.sobreOro, fontSize: tam(11), fontWeight: '900', letterSpacing: 1 },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  titulo: { color: c.texto, fontSize: tam(30), fontWeight: '900' },
  cerrar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.campo, alignItems: 'center', justifyContent: 'center' },
  pagina: { padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' },
  nota: { color: c.suave, fontSize: tam(14), lineHeight: tam(20) },
  version: { color: c.suave, fontSize: tam(13), fontWeight: '800' },
  nombre: { color: c.texto, fontSize: tam(20), fontWeight: '900' },
  cambio: { color: c.texto, fontSize: tam(15), lineHeight: tam(22) },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: c.tarjeta, borderBottomWidth: 1, borderColor: c.borde },
  bannerTexto: { color: c.texto, fontSize: tam(14), fontWeight: '700', flex: 1 },
});
