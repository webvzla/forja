// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Ayuda y opiniones: errores, problemas con un entreno, sugerencias y valoración. Con cuenta se envía a la tabla
// `beta_opiniones` (función `enviar_opinion`, ver supabase/migrations). Sin cuenta, o si falla, se puede enviar por correo
// o copiar el mensaje. NUNCA se adjuntan datos de entreno sin que la persona lo marque, y ve lo que se envía.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ADJUNTO_MAX_BYTES, BUCKET_ADJUNTOS, ENTRADA_MAX_BYTES, MAX_CAPTURAS_POR_PERSONA, TIPOS_ADJUNTO, formatoBytes, limpiarImagen, mensajeErrorSubida, rutaAdjunto, tieneMetadatos, uuidNuevo, validarEntrada } from './adjuntos';
import { Datos } from './datos';
import { CORREO_CONTACTO } from './legal';
import { sb, usuarioActual } from './nube';
import { datosTecnicos, lineasResumen, lineasTecnicas, resumenDatos, textoCorreo } from './opinionesDatos';
import { Aviso, Campo, Chip, Pildora, Seccion, Tarjeta, c, tam } from './ui';
import { NOMBRE_APP, VERSION } from './version';

export type TipoOpinion = 'error' | 'entreno' | 'sugerencia' | 'valoracion';
export const TIPOS: [TipoOpinion, string][] = [
  ['error', '🐞 Un error'],
  ['entreno', '🏋️ Problema con mi entreno'],
  ['sugerencia', '💡 Una sugerencia'],
  ['valoracion', '⭐ Valorar FORJA'],
];
export const MAX_TEXTO = 2000;

function Estrellas({ valor, onCambio }: { valor: number; onCambio: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel="Valoración">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} accessibilityRole="radio" accessibilityState={{ checked: valor === n }} accessibilityLabel={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`} onPress={() => onCambio(valor === n ? 0 : n)} hitSlop={6}>
          <Text style={{ fontSize: tam(32), color: n <= valor ? c.oro : c.borde }}>{n <= valor ? '★' : '☆'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Opiniones({ d, onCerrar }: { d: Datos; onCerrar: () => void }) {
  const [tipo, setTipo] = useState<TipoOpinion>('error');
  const [texto, setTexto] = useState('');
  const [estrellas, setEstrellas] = useState(0);
  const [incluir, setIncluir] = useState(false);
  const [estado, setEstado] = useState<'editando' | 'enviando' | 'enviado' | 'error'>('editando');
  const [motivo, setMotivo] = useState('');
  const [copiado, setCopiado] = useState(false);
  const conCuenta = !!sb;
  const tecnico = useMemo(() => datosTecnicos(VERSION, conCuenta), [conCuenta]);
  const datos = useMemo(() => (incluir ? resumenDatos(d) : null), [incluir, d]);
  const [verUa, setVerUa] = useState(false);
  // Captura opcional (solo web y con cuenta): se reduce y se limpia en el dispositivo; se ve la vista previa y se puede quitar antes de enviar.
  const [adjunto, setAdjunto] = useState<{ blob: Blob; tipo: string; url: string; ancho: number; alto: number; reducida: boolean } | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [errorAdjunto, setErrorAdjunto] = useState('');
  const urlActual = useRef<string | null>(null);
  const puedeAdjuntar = Platform.OS === 'web' && conCuenta;
  useEffect(() => () => { if (urlActual.current) URL.revokeObjectURL(urlActual.current); }, []);
  const soltar = () => { if (urlActual.current) URL.revokeObjectURL(urlActual.current); urlActual.current = null; };
  const quitarAdjunto = () => { soltar(); setAdjunto(null); setErrorAdjunto(''); };
  const procesarArchivo = async (f: File) => {
    setErrorAdjunto('');
    const malo = validarEntrada(f.type, f.size);
    if (malo) return setErrorAdjunto(malo);
    setProcesando(true);
    try {
      const limpia = await limpiarImagen(f);
      if (tieneMetadatos(new Uint8Array(await limpia.blob.arrayBuffer()))) throw new Error('metadatos');
      soltar();
      const url = URL.createObjectURL(limpia.blob);
      urlActual.current = url;
      setAdjunto({ blob: limpia.blob, tipo: limpia.tipo, url, ancho: limpia.ancho, alto: limpia.alto, reducida: limpia.reducida });
    } catch {
      setErrorAdjunto('No se pudo preparar esa imagen. Prueba con otra captura (JPG, PNG o WebP).');
    }
    setProcesando(false);
  };
  const elegirCaptura = () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = TIPOS_ADJUNTO.join(',');
    i.setAttribute('aria-label', 'Elegir una captura de pantalla');
    i.setAttribute('data-forja', 'captura');
    i.style.display = 'none';
    i.onchange = () => {
      const f = i.files?.[0];
      i.remove();
      if (f) void procesarArchivo(f);
    };
    document.body.appendChild(i);
    i.click();
  };
  const valido = texto.trim().length >= 5 || (tipo === 'valoracion' && estrellas > 0);

  const enviar = async () => {
    setEstado('enviando');
    try {
      const u = await usuarioActual();
      if (!sb || !u) {
        setMotivo('Para enviarlo directamente necesitas una cuenta. Puedes mandarlo por correo o copiar el mensaje.');
        return setEstado('error');
      }
      // La captura (si la hay) se sube primero a SU carpeta privada; si falla, no se envía nada y se puede reintentar o quitarla.
      let ruta: string | null = null;
      if (adjunto && puedeAdjuntar) {
        ruta = rutaAdjunto(u.id, uuidNuevo(), adjunto.tipo);
        const { error: errorSubida } = await sb.storage.from(BUCKET_ADJUNTOS).upload(ruta, adjunto.blob, { contentType: adjunto.tipo, upsert: false, cacheControl: '3600' });
        if (errorSubida) {
          setMotivo(mensajeErrorSubida(String(errorSubida.message ?? '')));
          return setEstado('error');
        }
      }
      // Las estrellas solo cuentan en «Valorar FORJA»: si se marcaron y luego se cambió de tipo, no viajan.
      const { error } = await sb.rpc('enviar_opinion', { p_tipo: tipo, p_texto: texto.trim(), p_estrellas: tipo === 'valoracion' ? estrellas || null : null, p_version: VERSION, p_tecnico: tecnico, p_datos: datos, p_adjunto: ruta });
      if (error) {
        const m = String(error.message ?? '');
        setMotivo(/l[ií]mite|demasiad/i.test(m) ? 'Hoy ya has enviado varias opiniones. Inténtalo mañana o escríbenos por correo.' : 'No se pudo enviar. Revisa tu conexión o mándalo por correo.');
        return setEstado('error');
      }
      setEstado('enviado');
    } catch {
      setMotivo('No se pudo enviar. Revisa tu conexión o mándalo por correo.');
      setEstado('error');
    }
  };

  const cuerpo = textoCorreo(TIPOS.find(([t]) => t === tipo)?.[1] ?? tipo, texto, tipo === 'valoracion' ? estrellas : 0, tecnico, datos);
  const porCorreo = () => Linking.openURL(`mailto:${CORREO_CONTACTO}?subject=${encodeURIComponent(`[${NOMBRE_APP} ${VERSION}] ${TIPOS.find(([t]) => t === tipo)?.[1] ?? ''}`)}&body=${encodeURIComponent(cuerpo.slice(0, 1800))}`);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(cuerpo);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <Modal animationType="slide" visible onRequestClose={onCerrar}>
      <View style={{ flex: 1, backgroundColor: c.fondo }}>
        <View style={e.cabecera}>
          <Text style={e.titulo}>Ayuda y opiniones</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar ayuda y opiniones" onPress={onCerrar} style={e.cerrar} hitSlop={8}>
            <Text style={{ color: c.texto, fontSize: tam(20), fontWeight: '900' }}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
          {estado === 'enviado' ? (
            <>
              <Aviso tipo="ok" texto="¡Gracias! Lo hemos recibido. Lo leemos todo y vuestras opiniones deciden qué mejoramos primero." />
              <Pildora texto="Cerrar" onPress={onCerrar} />
            </>
          ) : (
            <>
              <Text style={e.nota}>Cuéntanos qué ha pasado o qué te falta. Lo leemos todo. No hace falta que seas técnico.</Text>
              <Seccion>¿Qué quieres contarnos?</Seccion>
              <View style={e.chips}>
                {TIPOS.map(([t, nombre]) => (
                  <Chip key={t} texto={nombre} activo={tipo === t} onPress={() => setTipo(t)} />
                ))}
              </View>
              {tipo === 'valoracion' ? (
                <>
                  <Text style={e.etiqueta}>¿Cómo valoras FORJA hasta ahora?</Text>
                  <Estrellas valor={estrellas} onCambio={setEstrellas} />
                </>
              ) : null}
              <Campo
                accessibilityLabel="Tu mensaje"
                placeholder={tipo === 'error' ? '¿Qué hiciste y qué pasó? ¿Qué esperabas que pasara?' : tipo === 'entreno' ? '¿Qué problema tuviste con tu entreno? (pesos, series, sugerencias…)' : tipo === 'sugerencia' ? '¿Qué te gustaría que hiciera FORJA?' : 'Comentario (opcional)'}
                multiline
                maxLength={MAX_TEXTO}
                value={texto}
                onChangeText={setTexto}
                style={{ minHeight: 120, textAlignVertical: 'top' }}
              />
              <Text style={e.nota}>{texto.length}/{MAX_TEXTO}</Text>

              <Tarjeta>
                <Text style={e.etiqueta}>Qué se envía contigo</Text>
                <Text style={e.nota}>Estos datos técnicos se adjuntan solos, para que podamos reproducir el fallo. No va tu email, ni tu nombre, ni ningún dato de entreno salvo que lo marques más abajo.</Text>
                <View accessibilityLabel="Datos técnicos que se enviarán" style={{ gap: 4 }}>
                  {lineasTecnicas(tecnico).map(([k, v]) => (
                    <Text key={k} style={e.dato}>
                      <Text style={e.datoEtiqueta}>{k}: </Text>
                      {v}
                    </Text>
                  ))}
                </View>
                {tecnico.sistema ? (
                  <>
                    <Pressable accessibilityRole="button" accessibilityLabel={verUa ? 'Ocultar el identificador técnico del navegador' : 'Ver el identificador técnico del navegador'} onPress={() => setVerUa(!verUa)} hitSlop={8}>
                      <Text style={e.enlace}>{verUa ? 'Ocultar el identificador técnico del navegador' : 'Ver el identificador técnico del navegador'}</Text>
                    </Pressable>
                    {verUa ? <Text style={e.nota}>{tecnico.sistema}</Text> : null}
                  </>
                ) : null}
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: incluir }} accessibilityLabel="Incluir un resumen de mis datos" onPress={() => setIncluir(!incluir)} style={e.casilla}>
                  <View style={[e.caja, incluir && { backgroundColor: c.oro }]}>{incluir ? <Text style={{ color: c.sobreOro, fontWeight: '900' }}>✓</Text> : null}</View>
                  <Text style={e.casillaTexto}>Incluir un resumen de mis datos (nº de entrenos, último entreno, objetivo, nivel y dificultad)</Text>
                </Pressable>
                {datos ? (
                  <View accessibilityLabel="Resumen de datos que se enviará" style={{ gap: 4 }}>
                    {lineasResumen(datos).map(([k, v]) => (
                      <Text key={k} style={e.dato}>
                        <Text style={e.datoEtiqueta}>{k}: </Text>
                        {v}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </Tarjeta>

              {puedeAdjuntar ? (
                <Tarjeta>
                  <Text style={e.etiqueta}>Captura de pantalla (opcional)</Text>
                  <Text style={e.nota}>
                    Puedes añadir una imagen (JPG, PNG o WebP; una sola, de hasta {formatoBytes(ADJUNTO_MAX_BYTES)}; máximo {MAX_CAPTURAS_POR_PERSONA} en total). Antes de subirla se reduce y se limpia en tu dispositivo: se borran los datos ocultos de la imagen (ubicación, cámara, fecha). Se guarda en un almacén privado que solo ve el equipo de FORJA y no se borra sola, tampoco al borrar tu cuenta: para quitarla, escríbenos. Revisa la vista previa: si se ve algo personal, quítala o tápalo antes.
                  </Text>
                  {adjunto ? (
                    <View style={{ gap: 8 }}>
                      <Image source={{ uri: adjunto.url }} accessibilityLabel="Vista previa de la captura" style={e.vista} resizeMode="contain" />
                      <Text style={e.nota} accessibilityLabel="Datos de la captura">
                        Captura lista · {adjunto.ancho} × {adjunto.alto} px · {formatoBytes(adjunto.blob.size)}{adjunto.reducida ? ' · reducida y sin datos ocultos' : ' · sin datos ocultos'}
                      </Text>
                      <Pildora chica tipo="neutro" texto="🗑️ Quitar la captura" onPress={quitarAdjunto} />
                    </View>
                  ) : (
                    <Pildora chica tipo="neutro" texto={procesando ? 'Preparando la imagen…' : '📎 Añadir una captura'} deshabilitado={procesando} onPress={elegirCaptura} />
                  )}
                  {errorAdjunto ? <Aviso tipo="error" texto={errorAdjunto} /> : null}
                  <Text style={e.nota}>Tamaño máximo al elegirla: {formatoBytes(ENTRADA_MAX_BYTES)}.</Text>
                </Tarjeta>
              ) : null}

              {estado === 'error' ? <Aviso tipo="error" texto={motivo} /> : null}
              <Pildora texto={estado === 'enviando' ? 'Enviando…' : conCuenta ? 'Enviar' : 'Enviar (necesita cuenta)'} deshabilitado={!valido || estado === 'enviando' || !conCuenta} onPress={enviar} />
              {!conCuenta || estado === 'error' ? (
                <View style={{ gap: 8 }}>
                  <Text style={e.nota}>También puedes enviarlo por otra vía:</Text>
                  {CORREO_CONTACTO ? <Pildora chica tipo="neutro" texto="✉️ Enviar por correo" deshabilitado={!valido} onPress={porCorreo} /> : null}
                  {Platform.OS === 'web' ? <Pildora chica tipo="neutro" texto={copiado ? '✓ Mensaje copiado' : 'Copiar el mensaje'} deshabilitado={!valido} onPress={copiar} /> : null}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const e = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  titulo: { color: c.texto, fontSize: tam(28), fontWeight: '900' },
  cerrar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.campo, alignItems: 'center', justifyContent: 'center' },
  pagina: { padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' },
  nota: { color: c.suave, fontSize: tam(14), lineHeight: tam(20) },
  etiqueta: { color: c.suave, fontSize: tam(14), fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  casilla: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  caja: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: c.oro, alignItems: 'center', justifyContent: 'center' },
  casillaTexto: { color: c.texto, fontSize: tam(15), flex: 1 },
  vista: { width: '100%', height: 200, borderRadius: 12, backgroundColor: c.campo },
  dato: { color: c.texto, fontSize: tam(14), lineHeight: tam(20), flexShrink: 1 },
  datoEtiqueta: { color: c.suave, fontWeight: '800' },
  enlace: { color: c.oro, fontSize: tam(14), fontWeight: '700', textDecorationLine: 'underline' },
});
