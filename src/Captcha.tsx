// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Widget de Cloudflare Turnstile para la web (en móvil nativo no se usa). Carga el script de Cloudflare solo cuando hace falta,
// dibuja el widget, entrega el token (de un solo uso) y se reinicia tras cada intento. Sin dependencias nuevas.
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { EstadoCaptcha, URL_SCRIPT_TURNSTILE, textoCaptcha } from './turnstile';
import { CAPTCHA_SITEKEY } from './config';
import { Pildora, c, tam } from './ui';

type ParametrosTurnstile = {
  sitekey: string;
  language?: string;
  theme?: 'auto' | 'light' | 'dark';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  'timeout-callback': () => void;
};
type ApiTurnstile = { render: (el: HTMLElement, p: ParametrosTurnstile) => string; reset: (id: string) => void; remove: (id: string) => void };
const api = (): ApiTurnstile | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { turnstile?: ApiTurnstile }).turnstile);

let promesaScript: Promise<void> | null = null;
function cargarScript(): Promise<void> {
  if (typeof document === 'undefined') return Promise.reject(new Error('sin documento'));
  if (api()) return Promise.resolve();
  if (promesaScript) return promesaScript;
  promesaScript = new Promise<void>((ok, mal) => {
    const s = document.createElement('script');
    s.src = URL_SCRIPT_TURNSTILE;
    s.async = true;
    s.defer = true;
    s.onload = () => (api() ? ok() : (promesaScript = null, s.remove(), mal(new Error('sin API'))));
    s.onerror = () => {
      promesaScript = null; // se podrá reintentar
      s.remove();
      mal(new Error('no se pudo cargar el script'));
    };
    document.head.appendChild(s);
  });
  return promesaScript;
}

export function Captcha(p: { token: string | null; onToken: (t: string | null) => void; reinicio: number }) {
  const caja = useRef<unknown>(null);
  const id = useRef<string | null>(null);
  const [estado, setEstado] = useState<EstadoCaptcha>('cargando');
  const [intento, setIntento] = useState(0);
  const { onToken } = p;

  useEffect(() => {
    if (Platform.OS !== 'web' || !CAPTCHA_SITEKEY) return;
    let vivo = true;
    cargarScript()
      .then(() => {
        const t = api();
        const el = caja.current as HTMLElement | null;
        if (!vivo || !t || !el) return;
        id.current = t.render(el, {
          sitekey: CAPTCHA_SITEKEY,
          language: 'es',
          theme: 'auto',
          callback: (token) => { if (vivo) { setEstado('listo'); onToken(token); } },
          'expired-callback': () => { if (vivo) { setEstado('caducado'); onToken(null); } },
          'timeout-callback': () => { if (vivo) { setEstado('caducado'); onToken(null); } },
          'error-callback': () => { if (vivo) { setEstado('error'); onToken(null); } },
        });
        setEstado('listo');
      })
      .catch(() => { if (vivo) { setEstado('sin-script'); onToken(null); } });
    return () => {
      vivo = false;
      const t = api();
      if (id.current && t) { try { t.remove(id.current); } catch { /* ya no está */ } }
      id.current = null;
    };
  }, [intento, onToken]);

  // Un token solo vale una vez: tras cada intento (bien o mal) el padre sube `reinicio` y se pide uno nuevo.
  useEffect(() => {
    const t = api();
    if (p.reinicio > 0 && id.current && t) { try { t.reset(id.current); } catch { /* se recreará al reintentar */ } }
  }, [p.reinicio]);

  const ayuda = textoCaptcha(estado, !!p.token);
  return (
    <View style={e.marco}>
      <View ref={caja as never} accessibilityLabel="Comprobación anti-robots" style={e.caja} />
      {ayuda ? <Text style={[e.texto, estado === 'sin-script' || estado === 'error' ? { color: c.rojo } : null]} accessibilityLiveRegion="polite">{ayuda}</Text> : null}
      {estado === 'sin-script' ? <Pildora chica tipo="neutro" texto="Reintentar" onPress={() => { setEstado('cargando'); setIntento((i) => i + 1); }} /> : null}
    </View>
  );
}

const e = StyleSheet.create({
  marco: { gap: 8, alignItems: 'center' },
  caja: { minHeight: 66, alignItems: 'center', justifyContent: 'center', width: '100%' },
  texto: { color: c.suave, fontSize: tam(13), lineHeight: tam(18), textAlign: 'center' },
});
