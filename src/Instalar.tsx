// Botón para instalar Forja como app (Chrome en Android y ordenador) y guía para iPhone.
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';

import { Dialogo, Pildora, Tarjeta, c } from './ui';

const yaInstalada = () =>
  Platform.OS !== 'web' || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const esIphone = () => Platform.OS === 'web' && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function Instalar() {
  const [puede, setPuede] = useState(() => Platform.OS === 'web' && !!(window as any).__instalar);
  const [guia, setGuia] = useState(false);
  const [oculto, setOculto] = useState(() => {
    try {
      return yaInstalada() || localStorage.getItem('forja:no-instalar') === '1';
    } catch {
      return yaInstalada();
    }
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listo = () => setPuede(true);
    const hecha = () => setOculto(true);
    window.addEventListener('forja-instalable', listo);
    window.addEventListener('appinstalled', hecha);
    return () => {
      window.removeEventListener('forja-instalable', listo);
      window.removeEventListener('appinstalled', hecha);
    };
  }, []);

  if (oculto || (!puede && !esIphone())) return null;

  const instalar = async () => {
    const ev = (window as any).__instalar;
    if (!ev) return setGuia(true);
    ev.prompt();
    const r = await ev.userChoice.catch(() => null);
    if (r?.outcome === 'accepted') setOculto(true);
    (window as any).__instalar = null;
    setPuede(false);
  };

  return (
    <Tarjeta>
      <Text style={e.titulo}>📲 Instala Forja en tu móvil</Text>
      <Text style={e.sub}>Tendrás su icono en la pantalla de inicio y se abrirá a pantalla completa, como cualquier app. Funciona sin internet.</Text>
      <Pildora chica texto={esIphone() ? 'Cómo instalarla' : 'Instalar Forja'} onPress={esIphone() ? () => setGuia(true) : instalar} />
      <Pildora
        chica
        tipo="neutro"
        texto="Ahora no"
        onPress={() => {
          try {
            localStorage.setItem('forja:no-instalar', '1');
          } catch {}
          setOculto(true);
        }}
      />
      {guia ? (
        <Dialogo titulo="Instalar en iPhone" si="Entendido" onSi={() => setGuia(false)}>
          <Text style={e.paso}>1. Pulsa el botón Compartir (el cuadrado con la flecha hacia arriba ⬆️). En Safari está abajo; en Chrome, arriba a la derecha.</Text>
          <Text style={e.paso}>2. Baja y elige "Añadir a pantalla de inicio".</Text>
          <Text style={e.paso}>3. Pulsa "Añadir". Forja aparecerá con su icono junto al resto de tus apps.</Text>
        </Dialogo>
      ) : null}
    </Tarjeta>
  );
}

const e = StyleSheet.create({
  titulo: { color: c.texto, fontSize: 19, fontWeight: '900' },
  sub: { color: c.suave, fontSize: 15, lineHeight: 21 },
  paso: { color: c.texto, fontSize: 16, lineHeight: 23 },
});
