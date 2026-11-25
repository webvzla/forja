// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Ajustes: apariencia y personalización, tamaño de texto, pantalla de inicio y exportación.
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Datos, claveDia, copiaPreBeta } from './datos';
import { APARIENCIA_ORIGINAL, Apariencia, Modo, TAMANOS_TEXTO, TEMAS, apariencia, guardarApariencia, mismaApariencia, paleta } from './tema';
import { Aviso, Campo, Dialogo, Pildora, Segmentos, Seccion, Tarjeta, c, tam } from './ui';
import { iaActiva } from './nube';
import { Recomendar } from './Arena';
import { compartirArchivo, exportarCopia } from './web';
import { Novedades } from './Beta';
import { Opiniones } from './Opiniones';
import { EnlacePrivacidad, EnlaceTerminos } from './Privacidad';
import { VERSION, hayNovedadesSinVer } from './version';
import { decisionSensaciones, fijarSensaciones, quitarSensaciones, respuestasGuardadas } from './consentimientos';

export type Inicio = { ocultas: string[] };
export const TARJETAS_INICIO: [string, string][] = [
  ['instalar', 'Aviso para instalar la app'],
  ['atleta', 'Nivel y misiones de hoy'],
  ['chat', 'Pregúntale al coach (IA)'],
  ['dificultad', 'Dificultad y recomendaciones'],
  ['revision', 'Revisión semanal'],
  ['peso', 'Peso corporal'],
  ['medidas', 'Medidas'],
];

const COLORES_PROPIOS = ['#E8F04A', '#4AF0A8', '#4AC7F0', '#7C8CFF', '#E07CFF', '#FF6FA8', '#FF5C5C', '#FFB84A', '#C9A27C', '#9FB4C7'];

// Vista previa con la paleta elegida, sin aplicarla todavía.
function Muestra({ a }: { a: Apariencia }) {
  const p = paleta(a);
  return (
    <View style={{ backgroundColor: p.fondo, borderRadius: 18, padding: 12, gap: 10, borderWidth: 1, borderColor: p.borde }} accessibilityLabel="Vista previa del tema">
      <View style={{ backgroundColor: p.tarjeta, borderRadius: 16, padding: 14, gap: 8 }}>
        <Text style={{ color: p.texto, fontSize: tam(17), fontWeight: '900' }}>Pierna A · hoy</Text>
        <Text style={{ color: p.suave, fontSize: tam(14) }}>6 ejercicios · 45 min</Text>
        <View style={{ height: 10, borderRadius: 99, backgroundColor: p.campo, overflow: 'hidden' }}>
          <View style={{ width: '62%', height: '100%', backgroundColor: p.oro, borderRadius: 99 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ backgroundColor: p.oro, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 9 }}>
            <Text style={{ color: p.sobreOro, fontWeight: '800', fontSize: tam(15) }}>Empezar</Text>
          </View>
          <View style={{ backgroundColor: p.acentoSuave, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Text style={{ color: p.oro, fontWeight: '800', fontSize: tam(13) }}>🔥 4 semanas</Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {['Coach', 'Arena', 'Progreso'].map((t, i) => (
          <Text key={t} style={{ color: i === 1 ? p.oro : p.suave, fontWeight: '800', fontSize: tam(13) }}>{t}</Text>
        ))}
      </View>
    </View>
  );
}

function exportarCSV(d: Datos) {
  const filas = [['fecha', 'rutina', 'minutos', 'ejercicio', 'serie', 'peso_kg', 'repeticiones', 'descarga']];
  for (const s of [...d.sesiones].reverse())
    for (const x of s.ejercicios)
      x.series.forEach((y, i) => filas.push([claveDia(s.fecha), s.rutinaNombre, String(s.minutos), x.nombre, String(i + 1), String(y.peso), String(y.reps), s.descarga ? 'sí' : 'no']));
  const csv = filas.map((f) => f.map((v) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(';')).join('\n');
  return compartirArchivo(new Blob(['﻿' + csv], { type: 'text/csv' }), `forja-entrenos-${claveDia()}.csv`, 'Mis entrenos de Forja');
}

export function Ajustes(p: { d: Datos; onCerrar: () => void; onInicio: (i: Inicio) => void; onApariencia: (a: Apariencia) => void; onRestaurar?: (copia: Datos) => void; conCuenta?: boolean; onDatos?: (f: (d: Datos) => Datos) => void }) {
  const [a, setA] = useState<Apariencia>(apariencia);
  const [hex, setHex] = useState(apariencia.personal ?? '');
  const [msg, setMsg] = useState<{ t: string; tipo: 'ok' | 'error' } | null>(null);
  const [novedades, setNovedades] = useState(false);
  const [opiniones, setOpiniones] = useState(false);
  const [hayNuevas, setHayNuevas] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null); // copia exacta guardada antes de abrir la beta
  const [restaurarPrevia, setRestaurarPrevia] = useState(false);
  const [retirar, setRetirar] = useState(false); // confirmación de retirar el consentimiento de «cómo ha ido / me dolió algo»
  useEffect(() => {
    hayNovedadesSinVer().then(setHayNuevas);
    copiaPreBeta().then(setPrevia);
  }, [novedades]);
  const ocultas = p.d.ajustes?.inicio?.ocultas ?? [];
  const cambiado = !mismaApariencia(a, apariencia);

  const aplicar = (x: Apariencia) => {
    p.onApariencia(x); // se guarda también en la cuenta (si hay)
    setTimeout(() => guardarApariencia(x), 300);
  };

  return (
    <Modal animationType="slide" visible onRequestClose={p.onCerrar}>
      <View style={{ flex: 1, backgroundColor: c.fondo }}>
        <View style={e.cabecera}>
          <Text style={e.titulo}>Ajustes</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar ajustes" onPress={p.onCerrar} style={e.cerrar} hitSlop={8}>
            <Text style={{ color: c.texto, fontSize: tam(20), fontWeight: '900' }}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={e.pagina}>
          <Seccion>🎨 Apariencia y personalización</Seccion>
          <Tarjeta>
            <Text style={e.etiqueta}>Tema</Text>
            <View style={e.temas}>
              {TEMAS.map((t) => {
                const on = a.tema === t.id;
                return (
                  <Pressable key={t.id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Tema ${t.nombre}`} onPress={() => setA({ ...a, tema: t.id })} style={[e.tema, on && { borderColor: c.oro }]}>
                    <View style={[e.bola, { backgroundColor: t.oscuro }]} />
                    <Text style={e.temaTexto} numberOfLines={1}>{t.nombre}{t.id === 'verde' ? ' ★' : ''}</Text>
                  </Pressable>
                );
              })}
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: a.tema === 'personal' }} accessibilityLabel="Color personalizado" onPress={() => setA({ ...a, tema: 'personal', personal: a.personal ?? COLORES_PROPIOS[0] })} style={[e.tema, a.tema === 'personal' && { borderColor: c.oro }]}>
                <View style={[e.bola, { backgroundColor: a.personal ?? '#888', borderWidth: 2, borderColor: c.texto, borderStyle: 'dashed' }]} />
                <Text style={e.temaTexto}>Mi color</Text>
              </Pressable>
            </View>

            {a.tema === 'personal' ? (
              <View style={{ gap: 8 }}>
                <Text style={e.etiqueta}>Elige tu color</Text>
                <View style={e.colores}>
                  {COLORES_PROPIOS.map((col) => (
                    <Pressable key={col} accessibilityRole="radio" accessibilityLabel={`Color ${col}`} accessibilityState={{ checked: a.personal === col }} onPress={() => { setA({ ...a, personal: col }); setHex(col); }} style={[e.color, { backgroundColor: col }, a.personal === col && { borderColor: c.texto, borderWidth: 3 }]} />
                  ))}
                </View>
                <Campo
                  accessibilityLabel="Código de color"
                  placeholder="O escribe un código, ej. #4AC7F0"
                  autoCapitalize="characters"
                  maxLength={7}
                  value={hex}
                  onChangeText={(v) => {
                    const t = (v.startsWith('#') ? v : `#${v}`).toUpperCase();
                    setHex(t);
                    if (/^#[0-9A-F]{6}$/.test(t)) setA({ ...a, tema: 'personal', personal: t });
                  }}
                />
                <Text style={e.nota}>Si tu color no se lee bien sobre el fondo, Forja lo aclara u oscurece lo justo para que el texto sea legible.</Text>
              </View>
            ) : null}

            <Text style={e.etiqueta}>Modo</Text>
            <Segmentos<Modo> etiqueta="Modo de color" valor={a.modo} onCambio={(modo) => setA({ ...a, modo })} opciones={[['oscuro', '🌙 Oscuro'], ['claro', '☀️ Claro'], ['auto', '⚙️ Auto']]} />
            {a.modo === 'auto' ? <Text style={e.nota}>Sigue el modo claro u oscuro de tu móvil.</Text> : null}

            <Text style={e.etiqueta}>Vista previa</Text>
            <Muestra a={a} />

            <Pildora texto={cambiado ? 'Aplicar cambios' : 'Aplicado ✓'} deshabilitado={!cambiado} onPress={() => aplicar(a)} />
            {!mismaApariencia(apariencia, APARIENCIA_ORIGINAL) || cambiado ? (
              <Pildora
                chica
                tipo="neutro"
                texto="Restaurar diseño original"
                onPress={() => {
                  const o = { ...APARIENCIA_ORIGINAL };
                  setA(o);
                  setHex('');
                  aplicar(o);
                }}
              />
            ) : null}
          </Tarjeta>

          <Seccion>🔠 Tamaño del texto</Seccion>
          <Tarjeta>
            <Segmentos<string> etiqueta="Tamaño del texto" valor={String(a.texto)} onCambio={(v) => setA({ ...a, texto: Number(v) })} opciones={TAMANOS_TEXTO.map(([n, t]) => [String(n), t])} />
            <Text style={{ color: c.texto, fontSize: Math.round(16 * a.texto), lineHeight: Math.round(23 * a.texto) }}>
              Así se verán los textos: «Press de banca · 4 series de 8 repeticiones».
            </Text>
            {a.texto !== apariencia.texto ? <Pildora chica texto="Aplicar tamaño" onPress={() => aplicar(a)} /> : null}
          </Tarjeta>

          <Seccion>🏠 Pantalla de inicio</Seccion>
          <Tarjeta>
            <Text style={e.nota}>Elige qué tarjetas ver en Coach. El plan de la semana siempre se muestra.</Text>
            {TARJETAS_INICIO.filter(([id]) => id !== 'chat' || iaActiva).map(([id, texto]) => (
              <View key={id} style={e.fila}>
                <Text style={e.filaTexto}>{texto}</Text>
                <Switch
                  accessibilityLabel={`Mostrar ${texto}`}
                  value={!ocultas.includes(id)}
                  onValueChange={(si) => p.onInicio({ ocultas: si ? ocultas.filter((x) => x !== id) : [...ocultas, id] })}
                  trackColor={{ true: c.oro, false: c.borde }}
                  thumbColor="#FFFFFF"
                  {...({ activeThumbColor: '#FFFFFF' } as object)}
                />
              </View>
            ))}
          </Tarjeta>

          {Platform.OS === 'web' ? (
            <>
              <Seccion>📤 Exportar</Seccion>
              <Tarjeta>
                <Text style={e.nota}>Descarga todos tus entrenos en una hoja de cálculo (CSV): fecha, ejercicio, series, peso y repeticiones. Se abre con Excel, Numbers o Google Sheets.</Text>
                <Pildora
                  chica
                  tipo="neutro"
                  texto={`Exportar entrenos (${p.d.sesiones.length})`}
                  deshabilitado={!p.d.sesiones.length}
                  onPress={async () => {
                    const r = await exportarCSV(p.d).catch(() => 'error');
                    setMsg(r === 'error' ? { t: 'No se pudo exportar.', tipo: 'error' } : { t: r === 'descargado' ? 'Archivo descargado.' : 'Listo.', tipo: 'ok' });
                  }}
                />
                <Text style={e.nota}>La copia de seguridad completa (para restaurar) está en Coach → Copia de seguridad.</Text>
              </Tarjeta>
            </>
          ) : null}
          {msg ? <Aviso tipo={msg.tipo} texto={msg.t} /> : null}

          <Recomendar />

          {p.conCuenta && p.onDatos ? (
            <>
              <Seccion>🔒 Privacidad</Seccion>
              <Tarjeta>
                <View style={e.fila}>
                  <Text style={e.filaTexto}>Guardar cómo me sientan los entrenos y si me dolió algo</Text>
                  <Switch
                    accessibilityLabel="Guardar cómo me sientan los entrenos y si me dolió algo"
                    value={decisionSensaciones(p.d)?.valor === true}
                    onValueChange={(si) => (si ? p.onDatos?.((d) => fijarSensaciones(d, true)) : setRetirar(true))}
                    trackColor={{ true: c.oro, false: c.borde }}
                    thumbColor="#FFFFFF"
                    {...({ activeThumbColor: '#FFFFFF' } as object)}
                  />
                </View>
                <Text style={e.nota}>Es opcional y separado del resto. Si lo activas, FORJA te pregunta al terminar cada entreno «¿Cómo ha ido?» y «Me dolió algo» y lo guarda en tu cuenta para darte sugerencias más prudentes. No se comparte en Arena. Puedes retirarlo cuando quieras: se borran las respuestas ya guardadas, también en tus otros dispositivos y en la nube.</Text>
                <Text style={e.nota}>{decisionSensaciones(p.d)?.valor === true ? `Respuestas guardadas ahora: ${respuestasGuardadas(p.d)} ${respuestasGuardadas(p.d) === 1 ? 'entreno' : 'entrenos'}.` : 'Ahora no se pregunta ni se guarda nada de esto en tu cuenta.'}</Text>
              </Tarjeta>
            </>
          ) : null}
          {retirar ? (
            <Dialogo
              titulo="¿Dejar de guardar y borrar tus respuestas?"
              mensaje="Se borrarán «cómo ha ido» y «me dolió algo» de todos tus entrenos, en este dispositivo, en la nube y en tus otros dispositivos (estos, cuando vuelvan a sincronizar). Las copias que hayas descargado y la «copia previa a la beta» no cambian. FORJA dejará de preguntártelo. Si quieres conservar una copia, descárgala antes desde Coach → Copia de seguridad."
              si="Desactivar y borrar"
              no="Cancelar"
              peligro
              onSi={() => {
                p.onDatos?.((d) => quitarSensaciones(fijarSensaciones(d, false)));
                setRetirar(false);
                setMsg({ t: 'Listo: ya no se guarda cómo te sientan los entrenos y se han borrado las respuestas.', tipo: 'ok' });
              }}
              onNo={() => setRetirar(false)}
            />
          ) : null}

          <Seccion>🧪 FORJA BETA</Seccion>
          <Tarjeta>
            <Text style={e.nota}>Versión {VERSION}. Es una versión de pruebas: puede tener errores y la mejoramos cada pocas semanas con vuestras opiniones.</Text>
            <Pildora chica texto={hayNuevas ? '🔔 Qué hay de nuevo' : 'Qué hay de nuevo'} onPress={() => setNovedades(true)} />
            <Pildora chica tipo="neutro" texto="💬 Ayuda y opiniones" onPress={() => setOpiniones(true)} />
            {previa ? (
              <>
                <Text style={e.nota}>Antes de abrir la beta guardamos en este dispositivo una copia exacta de tus datos de entonces.</Text>
                {Platform.OS === 'web' ? <Pildora chica tipo="neutro" texto="Descargar la copia previa a la beta" onPress={() => exportarCopia(previa)} /> : null}
                {p.onRestaurar ? <Pildora chica tipo="neutro" texto="Volver a la copia previa a la beta" onPress={() => setRestaurarPrevia(true)} /> : null}
              </>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              <EnlaceTerminos />
              <EnlacePrivacidad />
            </View>
          </Tarjeta>
          {novedades ? <Novedades onCerrar={() => setNovedades(false)} /> : null}
          {opiniones ? <Opiniones d={p.d} onCerrar={() => setOpiniones(false)} /> : null}
          {restaurarPrevia && previa ? (
            <Dialogo
              titulo="¿Volver a la copia previa a la beta?"
              mensaje="Se sustituirán tus datos actuales por los que tenías antes de abrir la beta. Lo que hayas registrado después se perderá en este dispositivo (y en tu cuenta, si tienes). Descarga antes una copia de tus datos actuales desde Coach si quieres conservarlos."
              si="Sí, volver"
              no="Cancelar"
              peligro
              onSi={() => {
                try {
                  p.onRestaurar?.(JSON.parse(previa) as Datos);
                  setMsg({ t: 'Datos previos a la beta restaurados.', tipo: 'ok' });
                } catch {
                  setMsg({ t: 'La copia previa no se pudo leer.', tipo: 'error' });
                }
                setRestaurarPrevia(false);
              }}
              onNo={() => setRestaurarPrevia(false)}
            />
          ) : null}

          <Seccion>ℹ️ Acerca de FORJA</Seccion>
          <Tarjeta>
            <Text style={e.nota}>© 2026 FORJA. «FORJA», su nombre y su logotipo identifican a esta app y a su titular.</Text>
            <Text style={e.nota}>Ilustraciones de FORJA Academy: dibujos de Greg Priday (everkinetic.com) y del proyecto de datos abiertos Everkinetic. Los dibujos originales son CC BY-SA 3.0 y la versión vectorial usada es CC BY-SA 4.0; aquí se muestran convertidos a escala de grises y se distribuyen con la licencia CC BY-SA 4.0. Componentes de código abierto con sus propias licencias (MIT, BSD y otras).</Text>
            <Text style={e.nota}>FORJA da orientación general de entrenamiento y nutrición; no sustituye el consejo de un profesional sanitario.</Text>
          </Tarjeta>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const e = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  titulo: { color: c.texto, fontSize: tam(30), fontWeight: '900' },
  cerrar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.campo, alignItems: 'center', justifyContent: 'center' },
  pagina: { padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' },
  etiqueta: { color: c.suave, fontSize: tam(14), fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  temas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tema: { width: '31%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 14, backgroundColor: c.campo, borderWidth: 2, borderColor: 'transparent' },
  bola: { width: 30, height: 30, borderRadius: 15 },
  temaTexto: { color: c.texto, fontSize: tam(13), fontWeight: '700' },
  colores: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  color: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'transparent' },
  nota: { color: c.suave, fontSize: tam(14), lineHeight: tam(20) },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  filaTexto: { color: c.texto, fontSize: tam(16), flex: 1 },
});
