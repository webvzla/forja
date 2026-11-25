// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// FORJA ARENA: comunidad y competición (rankings, amigos, retos y logros).
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { DEMO } from './config';
import { Datos } from './datos';
import { medallas } from './calculos';
import {
  AMIGOS_DEMO, Categoria, DIRECTORIO_DEMO, EstadoDemo, Fila, Periodo, Persona, PRIVACIDAD_INICIAL, PreferenciasArena, REGLAS_PUNTOS,
  Reto, TEXTO_OBJETIVO_RETO, TipoObjetivo, diasRestantes, estadoDemoInicial, historialPosiciones, progresoReto, ranking, retosCompletados, terminado,
} from './competicion';
import { ArenaNube } from './ArenaNube';
import { misLogros } from './servidorArena';
import { TarjetaAtleta } from './Atleta';
import { Aviso, Avatar, Barra, Campo, Chip, Dialogo, Insignia, Pildora, Seccion, Segmentos, Tarjeta, Titulo, Vacio, c, tam } from './ui';
import { compartirTexto } from './web';
import { textoInvitacion, textoRecomendar } from './invitaciones';

type Pestana = 'ranking' | 'amigos' | 'retos' | 'logros';
export const nombreFila = (f: { yo: boolean; apodo: string }) => (f.yo && f.apodo.trim().toLowerCase() !== 'tú' ? `${f.apodo} (tú)` : f.apodo);
const FUENTE = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const ORO = c.oroMedalla;

type PropsArena = {
  d: Datos;
  onActualizar: (f: (d: Datos) => Datos) => void;
  conCuenta: boolean;
  onCuenta?: () => void;
  invitacion?: string | null; // código de un enlace de invitación pendiente
  onInvitacionResuelta?: () => void;
};

export function Arena(p: PropsArena) {
  const [pestana, setPestana] = useState<Pestana>(p.invitacion ? 'amigos' : 'ranking');
  const prefs: PreferenciasArena = { ...PRIVACIDAD_INICIAL, ...(p.d.ajustes?.arena ?? {}) };
  const estado: EstadoDemo = prefs.demo ?? estadoDemoInicial();
  const guardar = (cambios: Partial<PreferenciasArena>) =>
    p.onActualizar((x) => ({ ...x, ajustes: { ...x.ajustes, arena: { ...PRIVACIDAD_INICIAL, ...(x.ajustes?.arena ?? {}), demo: x.ajustes?.arena?.demo ?? estado, ...cambios } } }));
  const cambiarEstado = (f: (e: EstadoDemo) => EstadoDemo) => guardar({ demo: f(estado) });

  return (
    <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
      <View style={e.cabecera}>
        <Text style={e.marca}>FORJA</Text>
        <Titulo>Arena</Titulo>
      </View>
      {DEMO ? <Aviso tipo="info" texto="Modo demostración: los amigos, rankings y retos son ficticios. Tus propios entrenos sí cuentan." /> : null}
      <Segmentos<Pestana>
        etiqueta="Secciones de Arena"
        valor={pestana}
        onCambio={setPestana}
        opciones={[['ranking', '🏆 Top'], ['amigos', '👥 Amigos'], ['retos', '🎯 Retos'], ['logros', '🏅 Logros']]}
      />
      {pestana === 'logros' ? (
        <Logros d={p.d} completados={DEMO ? retosCompletados(p.d, estado) : undefined} conCuenta={p.conCuenta} onActualizar={p.onActualizar} />
      ) : !DEMO ? (
        <ArenaReal {...p} pestana={pestana} />
      ) : pestana === 'ranking' ? (
        <Ranking d={p.d} estado={estado} apodo={prefs.apodo} />
      ) : pestana === 'amigos' ? (
        <Amigos d={p.d} estado={estado} prefs={prefs} onEstado={cambiarEstado} onPrefs={guardar} />
      ) : (
        <RetosArena d={p.d} estado={estado} onEstado={cambiarEstado} />
      )}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// Arena con datos reales: rankings, amigos y retos del servidor (Supabase).
function ArenaReal(p: PropsArena & { pestana: Exclude<Pestana, 'logros'> }) {
  if (!p.conCuenta)
    return (
      <>
        {p.invitacion ? <Aviso tipo="ok" texto={`Tienes una invitación de un amigo (${p.invitacion}). Crea tu cuenta gratis para aceptarla.`} /> : null}
        <Tarjeta>
          <Vacio
            icono="🏟️"
            titulo="Compite con tus amigos"
            texto={p.onCuenta ? 'Rankings semanales, retos y rachas. Necesitas una cuenta para que tus amigos vean tu progreso (nunca tu peso ni lo que comes).' : 'Los rankings y retos con amigos llegarán pronto. Mientras, tus medallas y logros están en la pestaña Logros.'}
            accion={p.onCuenta ? <Pildora chica texto={p.invitacion ? 'Crear cuenta y aceptar' : 'Crear cuenta o entrar'} onPress={p.onCuenta} /> : undefined}
          />
        </Tarjeta>
        <Recomendar />
      </>
    );
  return <ArenaNube d={p.d} pestana={p.pestana} onActualizar={p.onActualizar} invitacion={p.invitacion ?? null} onInvitacionResuelta={p.onInvitacionResuelta} />;
}

// Compartir la app (sin datos personales). Sirve con o sin cuenta.
export function Recomendar() {
  const [aviso, setAviso] = useState('');
  return (
    <Tarjeta>
      <Text style={e.nombre}>¿Te gusta FORJA? Recomiéndala</Text>
      <Text style={e.sub}>Es gratis y funciona en el móvil sin descargar nada. Comparte el enlace por WhatsApp o donde quieras.</Text>
      <Pildora
        chica
        tipo="neutro"
        texto="📣 Recomendar FORJA"
        onPress={async () => {
          const r = await compartirTexto(textoRecomendar()).catch(() => null);
          setAviso(r === 'copiado' ? 'Enlace copiado. Pégalo en WhatsApp o donde quieras.' : r === null ? 'No se pudo compartir. Copia la dirección de la barra del navegador.' : '');
        }}
      />
      {aviso ? <Text style={e.nota}>{aviso}</Text> : null}
    </Tarjeta>
  );
}

// ---------- Ranking ----------
export function Podio({ filas }: { filas: { id: string; apodo: string; yo: boolean }[] }) {
  const orden = [filas[1], filas[0], filas[2]];
  const alto = [92, 124, 72];
  const color = [c.plata, ORO, c.bronce];
  return (
    <View style={e.podio} accessibilityLabel={`Podio: 1º ${filas[0]?.apodo ?? ''}, 2º ${filas[1]?.apodo ?? ''}, 3º ${filas[2]?.apodo ?? ''}`}>
      {orden.map((f, i) =>
        f ? (
          <View key={f.id} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            {i === 1 ? <Text style={{ fontSize: tam(22) }}>👑</Text> : null}
            <Avatar nombre={f.apodo} tam={i === 1 ? 62 : 50} borde={color[i]} />
            <Text style={[e.podioNombre, f.yo && { color: c.oro }]} numberOfLines={1}>{nombreFila(f)}</Text>
            <View style={[e.podioBase, { height: alto[i], backgroundColor: c.campo, borderTopColor: color[i] }]}>
              <Text style={[e.podioPuesto, { color: color[i] }]}>{[2, 1, 3][i]}</Text>
            </View>
          </View>
        ) : (
          <View key={i} style={{ flex: 1 }} />
        ),
      )}
    </View>
  );
}

export function Historial({ puntos }: { puntos: { semana: number; puesto: number; total: number }[] }) {
  const W = 300, H = 110, total = Math.max(...puntos.map((x) => x.total));
  const X = (i: number) => 20 + (i * (W - 40)) / (puntos.length - 1);
  const Y = (p: number) => 14 + ((p - 1) * (H - 34)) / Math.max(1, total - 1);
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel={`Tus puestos las últimas 8 semanas: ${puntos.map((x) => x.puesto).join(', ')}`}>
      <Line x1={20} x2={W - 20} y1={Y(1)} y2={Y(1)} stroke={c.borde} strokeDasharray="4 4" />
      <Polyline points={puntos.map((x, i) => `${X(i)},${Y(x.puesto)}`).join(' ')} fill="none" stroke={c.oro} strokeWidth={3} strokeLinejoin="round" />
      {puntos.map((x, i) => (
        <Circle key={i} cx={X(i)} cy={Y(x.puesto)} r={i === puntos.length - 1 ? 6 : 4} fill={i === puntos.length - 1 ? c.oro : c.tarjeta} stroke={c.oro} strokeWidth={2} />
      ))}
      {puntos.map((x, i) => (
        <SvgText key={`t${i}`} x={X(i)} y={H - 4} fontFamily={FUENTE} fontSize={10} fill={c.suave} textAnchor="middle">{i === puntos.length - 1 ? 'hoy' : `-${puntos.length - 1 - i}`}</SvgText>
      ))}
    </Svg>
  );
}

function Ranking({ d, estado, apodo }: { d: Datos; estado: EstadoDemo; apodo: string }) {
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [categoria, setCategoria] = useState<Categoria>('puntos');
  const [reglas, setReglas] = useState(false);
  const filas = useMemo(() => ranking(d, estado, apodo, periodo, categoria), [d, estado, apodo, periodo, categoria]);
  const antes = useMemo(() => ranking(d, estado, apodo, periodo, categoria, periodo === 'semana' ? 1 : 4), [d, estado, apodo, periodo, categoria]);
  const historial = useMemo(() => historialPosiciones(d, estado, apodo), [d, estado, apodo]);
  const valor = (f: Fila) => (categoria === 'puntos' ? `${f.puntos} pts` : categoria === 'entrenos' ? `${f.entrenos}` : `${f.constancia} %`);
  const yo = filas.findIndex((f) => f.yo) + 1;

  if (filas.length < 2)
    return <Tarjeta><Vacio icono="👥" titulo="Aún no tienes amigos en Arena" texto="Invita a tus amigos con tu código desde la pestaña Amigos para empezar a competir." /></Tarjeta>;

  return (
    <>
      <Segmentos<Periodo> etiqueta="Periodo" valor={periodo} onCambio={setPeriodo} opciones={[['semana', 'Esta semana'], ['mes', 'Este mes']]} />
      <View style={e.chips}>
        <Chip texto="⭐ Puntos" activo={categoria === 'puntos'} onPress={() => setCategoria('puntos')} />
        <Chip texto="🏋️ Entrenos" activo={categoria === 'entrenos'} onPress={() => setCategoria('entrenos')} />
        <Chip texto="🔥 Constancia" activo={categoria === 'constancia'} onPress={() => setCategoria('constancia')} />
      </View>
      <Tarjeta>
        <Podio filas={filas} />
        {filas.map((f, i) => {
          const previo = antes.findIndex((x) => x.id === f.id) + 1;
          const mov = previo ? previo - (i + 1) : 0;
          return (
            <View key={f.id} style={[e.fila, f.yo && { backgroundColor: c.acentoSuave }]} accessibilityLabel={`Puesto ${i + 1}: ${f.apodo}, ${valor(f)}${mov ? `, ${mov > 0 ? 'sube' : 'baja'} ${Math.abs(mov)}` : ''}`}>
              <Text style={[e.puesto, i < 3 && { color: [ORO, c.plata, c.bronce][i] }]}>{i + 1}</Text>
              <Avatar nombre={f.apodo} tam={38} />
              <View style={{ flex: 1 }}>
                <Text style={e.nombre} numberOfLines={1}>{nombreFila(f)}</Text>
                <Text style={e.detalle}>{f.entrenos} entrenos · {f.constancia} % constancia{f.racha >= 2 ? ` · 🔥 ${f.racha}` : ''}</Text>
              </View>
              <Text style={[e.mov, { color: mov > 0 ? c.verde : mov < 0 ? c.rojo : c.suave }]}>{mov > 0 ? `▲${mov}` : mov < 0 ? `▼${-mov}` : '–'}</Text>
              <Text style={e.valor}>{valor(f)}</Text>
            </View>
          );
        })}
        <Pressable accessibilityRole="button" onPress={() => setReglas(true)} hitSlop={6}>
          <Text style={e.enlace}>¿Cómo se consiguen los puntos?</Text>
        </Pressable>
      </Tarjeta>

      <Seccion>📈 Tu historial</Seccion>
      <Tarjeta>
        <Text style={e.sub}>Estás {yo}º de {filas.length} {periodo === 'semana' ? 'esta semana' : 'este mes'}. Tu puesto en las últimas 8 semanas:</Text>
        <Historial puntos={historial} />
      </Tarjeta>

      {reglas ? (
        <Dialogo titulo="Cómo se puntúa" si="Entendido" onSi={() => setReglas(false)}>
          <Text style={e.sub}>Arena premia la constancia y superarte a ti mismo, no levantar más que nadie.</Text>
          {REGLAS_PUNTOS.map(([t, x]) => (
            <View key={t}>
              <Text style={e.nombre}>{t}</Text>
              <Text style={e.sub}>{x}</Text>
            </View>
          ))}
          <Text style={e.nota}>Constancia = % de tus días objetivo cumplidos, para que sea justo entrenes 3 o 6 días.</Text>
        </Dialogo>
      ) : null}
    </>
  );
}

// ---------- Amigos ----------
export function Dato({ v, t, oculto }: { v: string; t: string; oculto?: boolean }) {
  return (
    <View style={e.dato}>
      <Text style={e.datoValor}>{oculto ? '🔒' : v}</Text>
      <Text style={e.datoTexto}>{t}</Text>
    </View>
  );
}

function Perfil({ persona, puesto, onCerrar, onEliminar, onBloquear }: { persona: Persona; puesto: number; onCerrar: () => void; onEliminar: () => void; onBloquear: () => void }) {
  const [confirmar, setConfirmar] = useState<null | 'eliminar' | 'bloquear'>(null);
  const actual = persona.semanas[7];
  const mes = persona.semanas.slice(4).reduce((a, s) => a + s.entrenos, 0);
  if (confirmar)
    return (
      <Dialogo
        titulo={confirmar === 'eliminar' ? `¿Eliminar a ${persona.apodo}?` : `¿Bloquear a ${persona.apodo}?`}
        mensaje={confirmar === 'eliminar' ? 'Dejaréis de ver vuestro progreso. Podéis volver a ser amigos más adelante.' : 'No podrá verte, enviarte solicitudes ni invitarte a retos. No se le avisa.'}
        si={confirmar === 'eliminar' ? 'Eliminar' : 'Bloquear'}
        peligro
        no="Cancelar"
        onSi={confirmar === 'eliminar' ? onEliminar : onBloquear}
        onNo={() => setConfirmar(null)}
      />
    );
  return (
    <Dialogo titulo="" si="Cerrar" onSi={onCerrar}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Avatar nombre={persona.apodo} tam={76} borde={c.oro} />
        <Text style={e.perfilNombre}>{persona.apodo}</Text>
        <Text style={e.sub}>{persona.nivel} · amigos desde {persona.desde} · {puesto}º en la semana</Text>
      </View>
      <View style={e.datos}>
        <Dato v={String(mes)} t="entrenos este mes" oculto={!persona.comparte.entrenos} />
        <Dato v={`🔥 ${actual.racha}`} t="semanas de racha" oculto={!persona.comparte.racha} />
        <Dato v={String(persona.medallas)} t="medallas" oculto={!persona.comparte.medallas} />
        <Dato v={String(persona.semanas.reduce((a, s) => a + s.records, 0))} t="récords (8 sem.)" oculto={!persona.comparte.records} />
      </View>
      <Text style={e.nota}>🔒 = lo tiene en privado. Nunca se comparten peso, medidas ni comidas.</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Pildora chica tipo="neutro" texto="Eliminar" onPress={() => setConfirmar('eliminar')} /></View>
        <View style={{ flex: 1 }}><Pildora chica tipo="peligro" texto="Bloquear" onPress={() => setConfirmar('bloquear')} /></View>
      </View>
    </Dialogo>
  );
}

function Amigos(p: { d: Datos; estado: EstadoDemo; prefs: PreferenciasArena; onEstado: (f: (e: EstadoDemo) => EstadoDemo) => void; onPrefs: (c: Partial<PreferenciasArena>) => void }) {
  const { estado, prefs } = p;
  const [busca, setBusca] = useState('');
  const [perfil, setPerfil] = useState<Persona | null>(null);
  const [msg, setMsg] = useState('');
  const todos = [...AMIGOS_DEMO, ...DIRECTORIO_DEMO];
  const porId = (id: string) => todos.find((x) => x.id === id)!;
  const amigos = estado.amigos.filter((id) => !estado.bloqueados.includes(id)).map(porId);
  const filas = ranking(p.d, estado, prefs.apodo, 'semana', 'puntos');
  const q = busca.trim().toLowerCase();
  const resultados = q.length >= 2 ? todos.filter((x) => x.apodo.toLowerCase().includes(q) && !estado.bloqueados.includes(x.id)) : [];
  const codigo = 'FORJA-7K2Q';

  return (
    <>
      <Tarjeta>
        <Text style={e.titulo}>Invita a tus amigos</Text>
        <View style={e.codigo}>
          <Text style={e.codigoTexto} selectable>{codigo}</Text>
        </View>
        <Pildora
          chica
          texto="Compartir invitación"
          onPress={async () => {
            const r = await compartirTexto(textoInvitacion(codigo)).catch(() => null);
            setMsg(r === 'copiado' ? 'Invitación copiada. Pégala en WhatsApp.' : '');
          }}
        />
        {msg ? <Text style={e.nota}>{msg}</Text> : null}
      </Tarjeta>

      <Campo accessibilityLabel="Buscar amigos por apodo" placeholder="🔍 Buscar por apodo o código" value={busca} onChangeText={setBusca} />
      {q.length >= 2 ? (
        <Tarjeta>
          {resultados.length ? (
            resultados.map((x) => {
              const ya = estado.amigos.includes(x.id), enviada = estado.enviadas.includes(x.id);
              return (
                <View key={x.id} style={e.fila}>
                  <Avatar nombre={x.apodo} tam={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={e.nombre}>{x.apodo}</Text>
                    <Text style={e.detalle}>{x.nivel}</Text>
                  </View>
                  {ya ? <Text style={e.detalle}>Amigos ✓</Text> : enviada ? <Text style={e.detalle}>Enviada</Text> : (
                    <Pildora chica texto="Añadir" onPress={() => p.onEstado((s) => ({ ...s, enviadas: [...s.enviadas, x.id] }))} />
                  )}
                </View>
              );
            })
          ) : (
            <Text style={e.sub}>Nadie con ese apodo. Prueba con su código de invitación.</Text>
          )}
        </Tarjeta>
      ) : null}

      {estado.recibidas.length ? (
        <>
          <Seccion>📨 Solicitudes ({estado.recibidas.length})</Seccion>
          <Tarjeta>
            {estado.recibidas.map(porId).map((x) => (
              <View key={x.id} style={e.fila}>
                <Avatar nombre={x.apodo} tam={38} />
                <View style={{ flex: 1 }}>
                  <Text style={e.nombre}>{x.apodo}</Text>
                  <Text style={e.detalle}>Quiere ser tu amigo</Text>
                </View>
                <Pildora chica texto="Aceptar" onPress={() => p.onEstado((s) => ({ ...s, recibidas: s.recibidas.filter((y) => y !== x.id), amigos: [...s.amigos, x.id] }))} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Rechazar a ${x.apodo}`} onPress={() => p.onEstado((s) => ({ ...s, recibidas: s.recibidas.filter((y) => y !== x.id) }))} style={e.rechazar} hitSlop={6}>
                  <Text style={{ color: c.suave, fontSize: tam(18), fontWeight: '900' }}>✕</Text>
                </Pressable>
              </View>
            ))}
          </Tarjeta>
        </>
      ) : null}

      <Seccion>👥 Tus amigos ({amigos.length})</Seccion>
      <Tarjeta>
        {amigos.length ? (
          amigos.map((x) => (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`Ver perfil de ${x.apodo}`} onPress={() => setPerfil(x)} style={({ pressed }) => [e.fila, pressed && { opacity: 0.7 }]}>
              <Avatar nombre={x.apodo} tam={42} />
              <View style={{ flex: 1 }}>
                <Text style={e.nombre}>{x.apodo}</Text>
                <Text style={e.detalle}>{x.nivel}{x.comparte.racha && x.semanas[7].racha >= 2 ? ` · 🔥 ${x.semanas[7].racha} semanas` : ''}</Text>
              </View>
              <Text style={{ color: c.suave, fontSize: tam(20) }}>›</Text>
            </Pressable>
          ))
        ) : (
          <Vacio icono="🤝" titulo="Sin amigos todavía" texto="Comparte tu código o búscalos por su apodo." />
        )}
      </Tarjeta>

      <Seccion>🔒 Tu privacidad</Seccion>
      <Tarjeta>
        <Text style={e.etiqueta}>Tu apodo en Arena</Text>
        <Campo accessibilityLabel="Tu apodo en Arena" maxLength={20} value={prefs.apodo} onChangeText={(apodo) => p.onPrefs({ apodo })} />
        <Text style={e.etiqueta}>¿Quién puede ver tu perfil?</Text>
        <Segmentos<'amigos' | 'nadie'> etiqueta="Visibilidad del perfil" valor={prefs.visible} onCambio={(visible) => p.onPrefs({ visible })} opciones={[['amigos', 'Solo amigos'], ['nadie', 'Nadie']]} />
        <Text style={e.etiqueta}>Qué compartes con tus amigos</Text>
        {([['entrenos', 'Entrenos y puntos'], ['racha', 'Racha'], ['medallas', 'Medallas'], ['records', 'Récords personales'], ['retos', 'Progreso en retos']] as const).map(([k, t]) => (
          <View key={k} style={e.interruptor}>
            <Text style={e.interruptorTexto}>{t}</Text>
            <Switch accessibilityLabel={`Compartir ${t}`} value={prefs.compartir[k] && prefs.visible !== 'nadie'} disabled={prefs.visible === 'nadie'} onValueChange={(v) => p.onPrefs({ compartir: { ...prefs.compartir, [k]: v } })} trackColor={{ true: c.oro, false: c.borde }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as object)} />
          </View>
        ))}
        <Text style={e.nota}>Tu perfil nunca es público. Peso, medidas, comidas y fotos no se comparten nunca.{prefs.visible === 'nadie' ? ' Con "Nadie" no apareces en los rankings de tus amigos.' : ''}</Text>
        {estado.bloqueados.length ? (
          <>
            <Text style={e.etiqueta}>Bloqueados</Text>
            {estado.bloqueados.map(porId).map((x) => (
              <View key={x.id} style={e.interruptor}>
                <Text style={e.interruptorTexto}>{x.apodo}</Text>
                <Pildora chica tipo="neutro" texto="Desbloquear" onPress={() => p.onEstado((s) => ({ ...s, bloqueados: s.bloqueados.filter((y) => y !== x.id) }))} />
              </View>
            ))}
          </>
        ) : null}
      </Tarjeta>

      {perfil ? (
        <Perfil
          persona={perfil}
          puesto={filas.findIndex((f) => f.id === perfil.id) + 1}
          onCerrar={() => setPerfil(null)}
          onEliminar={() => { p.onEstado((s) => ({ ...s, amigos: s.amigos.filter((y) => y !== perfil.id) })); setPerfil(null); }}
          onBloquear={() => { p.onEstado((s) => ({ ...s, amigos: s.amigos.filter((y) => y !== perfil.id), bloqueados: [...s.bloqueados, perfil.id] })); setPerfil(null); }}
        />
      ) : null}
    </>
  );
}

// ---------- Retos ----------
function TarjetaReto({ reto, d, nombres }: { reto: Reto; d: Datos; nombres: (id: string) => string }) {
  const fin = terminado(reto);
  const prog = reto.participantes.map((id) => ({ id, v: progresoReto(reto, id, d) })).sort((a, b) => b.v - a.v);
  const equipo = prog.reduce((a, x) => a + x.v, 0);
  const unidad = TEXTO_OBJETIVO_RETO[reto.objetivo][1];
  const conseguido = reto.modo === 'grupal' ? equipo >= reto.meta : (prog.find((x) => x.id === 'yo')?.v ?? 0) >= reto.meta;
  return (
    <Tarjeta destacada={!fin}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={e.titulo}>{reto.nombre}</Text>
          <Text style={e.detalle}>{reto.modo === 'grupal' ? '👥 En equipo' : '🧍 Individual'} · {reto.dias} días · meta {reto.meta} {unidad}{reto.modo === 'individual' ? ' cada uno' : ' entre todos'}</Text>
        </View>
        <View style={[e.etiquetaReto, { backgroundColor: fin ? c.campo : c.acentoSuave }]}>
          <Text style={{ color: fin ? c.suave : c.oro, fontWeight: '800', fontSize: tam(13) }}>{fin ? 'Terminado' : `Quedan ${diasRestantes(reto)} d`}</Text>
        </View>
      </View>
      {reto.modo === 'grupal' ? (
        <View style={{ gap: 6 }}>
          <Text style={e.nombre}>Equipo: {equipo}/{reto.meta}</Text>
          <Barra valor={equipo} max={reto.meta} alto={14} etiqueta={`Progreso del equipo ${equipo} de ${reto.meta}`} />
        </View>
      ) : null}
      {prog.map((x, i) => (
        <View key={x.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[e.detalle, x.id === 'yo' && { color: c.oro, fontWeight: '800' }]}>
              {fin && reto.modo === 'individual' && i === 0 ? '🏆 ' : ''}{nombres(x.id)}
            </Text>
            <Text style={e.detalle}>{x.v}{reto.modo === 'individual' ? `/${reto.meta}` : ''}</Text>
          </View>
          <Barra valor={x.v} max={reto.modo === 'individual' ? reto.meta : Math.max(1, ...prog.map((y) => y.v))} alto={8} color={x.id === 'yo' ? c.oro : c.nivel2} etiqueta={`${nombres(x.id)}: ${x.v}`} />
        </View>
      ))}
      {fin ? <Aviso tipo={conseguido ? 'ok' : 'info'} texto={conseguido ? '¡Reto completado! +15 puntos en Arena.' : 'Esta vez no se llegó a la meta. ¡A por el siguiente!'} /> : null}
    </Tarjeta>
  );
}

function RetosArena(p: { d: Datos; estado: EstadoDemo; onEstado: (f: (e: EstadoDemo) => EstadoDemo) => void }) {
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [modo, setModo] = useState<'individual' | 'grupal'>('individual');
  const [dias, setDias] = useState<7 | 14 | 30>(14);
  const [objetivo, setObjetivo] = useState<TipoObjetivo>('entrenos');
  const [meta, setMeta] = useState('8');
  const [invitados, setInvitados] = useState<string[]>([]);
  const [error, setError] = useState('');
  const nombres = (id: string) => (id === 'yo' ? 'Tú' : [...AMIGOS_DEMO, ...DIRECTORIO_DEMO].find((x) => x.id === id)?.apodo ?? '?');
  const activos = p.estado.retos.filter((r) => !terminado(r));
  const pasados = p.estado.retos.filter(terminado);
  const amigos = AMIGOS_DEMO.filter((a) => p.estado.amigos.includes(a.id) && !p.estado.bloqueados.includes(a.id));

  const sugerida = (o: TipoObjetivo, dd: number, m: string) => {
    const base = o === 'entrenos' ? Math.round(((p.d.perfil?.dias ?? 3) * dd) / 7) : o === 'proteina' ? Math.round(dd * 0.7) : Math.max(1, Math.round(dd / 7));
    return String(m === 'grupal' ? base * (invitados.length + 1) : base);
  };

  const crear = () => {
    setError('');
    const n = parseInt(meta, 10);
    if (!nombre.trim()) return setError('Ponle un nombre al reto.');
    if (!n || n < 1) return setError('La meta tiene que ser un número mayor que 0.');
    if (modo === 'grupal' && !invitados.length) return setError('Un reto en equipo necesita al menos un amigo.');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const reto: Reto = { id: `r${Date.now()}`, nombre: nombre.trim(), modo, dias, objetivo, meta: n, inicio: hoy.getTime(), participantes: ['yo', ...invitados], creadoPor: 'yo' };
    p.onEstado((s) => ({ ...s, retos: [reto, ...s.retos] }));
    setCreando(false);
    setNombre('');
    setInvitados([]);
  };

  return (
    <>
      {creando ? (
        <Tarjeta destacada>
          <Text style={e.titulo}>Nuevo reto</Text>
          <Campo accessibilityLabel="Nombre del reto" placeholder="Nombre (ej. Diciembre imparable)" maxLength={40} value={nombre} onChangeText={setNombre} />
          <Segmentos<'individual' | 'grupal'> etiqueta="Tipo de reto" valor={modo} onCambio={(m) => { setModo(m); setMeta(sugerida(objetivo, dias, m)); }} opciones={[['individual', '🧍 Individual'], ['grupal', '👥 En equipo']]} />
          <Text style={e.etiqueta}>Duración</Text>
          <Segmentos<string> etiqueta="Duración" valor={String(dias)} onCambio={(v) => { const dd = Number(v) as 7 | 14 | 30; setDias(dd); setMeta(sugerida(objetivo, dd, modo)); }} opciones={[['7', '7 días'], ['14', '14 días'], ['30', '30 días']]} />
          <Text style={e.etiqueta}>Objetivo</Text>
          <View style={e.chips}>
            {(Object.keys(TEXTO_OBJETIVO_RETO) as TipoObjetivo[]).map((o) => (
              <Chip key={o} texto={TEXTO_OBJETIVO_RETO[o][0]} activo={objetivo === o} onPress={() => { setObjetivo(o); setMeta(sugerida(o, dias, modo)); }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Campo accessibilityLabel="Meta del reto" keyboardType="number-pad" style={{ width: 90 }} value={meta} onChangeText={setMeta} />
            <Text style={[e.sub, { flex: 1 }]}>{TEXTO_OBJETIVO_RETO[objetivo][1]} {modo === 'grupal' ? 'entre todos' : 'cada uno'}</Text>
          </View>
          <Text style={e.etiqueta}>Invita a amigos</Text>
          <View style={e.chips}>
            {amigos.map((a) => (
              <Chip key={a.id} texto={a.apodo} activo={invitados.includes(a.id)} onPress={() => setInvitados(invitados.includes(a.id) ? invitados.filter((x) => x !== a.id) : [...invitados, a.id])} />
            ))}
          </View>
          {error ? <Aviso tipo="error" texto={error} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Pildora chica tipo="neutro" texto="Cancelar" onPress={() => { setCreando(false); setError(''); }} /></View>
            <View style={{ flex: 1 }}><Pildora chica texto="Crear reto" onPress={crear} /></View>
          </View>
        </Tarjeta>
      ) : (
        <Pildora texto="＋ Crear reto" onPress={() => { setCreando(true); setMeta(sugerida(objetivo, dias, modo)); }} />
      )}

      <Seccion>🎯 En marcha ({activos.length})</Seccion>
      {activos.length ? activos.map((r) => <TarjetaReto key={r.id} reto={r} d={p.d} nombres={nombres} />) : (
        <Tarjeta><Vacio icono="🎯" titulo="Ningún reto en marcha" texto="Crea uno de 7, 14 o 30 días e invita a tus amigos." /></Tarjeta>
      )}
      {pasados.length ? (
        <>
          <Seccion>🏁 Terminados</Seccion>
          {pasados.map((r) => <TarjetaReto key={r.id} reto={r} d={p.d} nombres={nombres} />)}
        </>
      ) : null}
    </>
  );
}

// ---------- Logros ----------
function Logros({ d, completados: demo, conCuenta, onActualizar }: { d: Datos; completados?: number; conCuenta: boolean; onActualizar: (f: (d: Datos) => Datos) => void }) {
  const [nube, setNube] = useState<number | null>(null);
  useEffect(() => {
    if (demo !== undefined || !conCuenta) return;
    let vivo = true;
    misLogros().then((l) => vivo && setNube(l.retos_completados)).catch(() => {});
    return () => { vivo = false; };
  }, [demo, conCuenta]);
  const completados = demo ?? nube ?? 0;
  const lista = [
    ...medallas(d),
    { id: 'rt1', icono: '🎯', titulo: 'Retador', texto: 'Completa tu primer reto', hecho: completados >= 1, progreso: `${completados}/1` },
    { id: 'rt5', icono: '🏟️', titulo: 'Gladiador', texto: 'Completa 5 retos', hecho: completados >= 5, progreso: `${completados}/5` },
  ];
  const hechas = lista.filter((m) => m.hecho).length;
  return (
    <>
      <TarjetaAtleta d={d} onActualizar={onActualizar} />
      <Tarjeta>
        <Text style={e.titulo}>{hechas} de {lista.length} logros</Text>
        <Barra valor={hechas} max={lista.length} alto={12} etiqueta={`${hechas} de ${lista.length} logros`} />
      </Tarjeta>
      <View style={e.rejilla}>
        {lista.map((m) => {
          const [v, t] = (m.progreso ?? '').split('/').map(Number);
          return (
            <View key={m.id} style={[e.logro, m.hecho && { borderColor: c.oro }]} accessibilityLabel={`${m.titulo}: ${m.texto}${m.hecho ? ', conseguido' : `, ${m.progreso}`}`}>
              <Insignia icono={m.icono} conseguida={m.hecho} />
              <Text style={e.logroTitulo} numberOfLines={2}>{m.titulo}</Text>
              <Text style={e.logroTexto} numberOfLines={2}>{m.texto}</Text>
              {!m.hecho && t ? <Barra valor={v} max={t} alto={6} /> : null}
            </View>
          );
        })}
      </View>
    </>
  );
}

export const e = StyleSheet.create({
  pagina: { padding: 16, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' },
  cabecera: { gap: 0 },
  marca: { color: c.oro, fontSize: tam(14), fontWeight: '900', letterSpacing: 4 },
  titulo: { color: c.texto, fontSize: tam(18), fontWeight: '900' },
  sub: { color: c.suave, fontSize: tam(15), lineHeight: tam(21) },
  nota: { color: c.suave, fontSize: tam(13), lineHeight: tam(18) },
  etiqueta: { color: c.suave, fontSize: tam(13), fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  enlace: { color: c.oro, fontSize: tam(15), fontWeight: '700', textAlign: 'center', paddingVertical: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  podio: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 4, paddingBottom: 6 },
  podioNombre: { color: c.texto, fontSize: tam(14), fontWeight: '800', maxWidth: '100%' },
  podioBase: { width: '100%', borderTopLeftRadius: 14, borderTopRightRadius: 14, borderTopWidth: 4, alignItems: 'center', justifyContent: 'center' },
  podioPuesto: { fontSize: tam(30), fontWeight: '900' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 14, minHeight: 52 },
  puesto: { width: 22, color: c.suave, fontSize: tam(16), fontWeight: '900', textAlign: 'center' },
  nombre: { color: c.texto, fontSize: tam(16), fontWeight: '800' },
  detalle: { color: c.suave, fontSize: tam(13), lineHeight: tam(18) },
  mov: { fontSize: tam(13), fontWeight: '800', width: 30, textAlign: 'center' },
  valor: { color: c.oro, fontSize: tam(16), fontWeight: '900', minWidth: 56, textAlign: 'right' },
  codigo: { backgroundColor: c.campo, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: c.borde, borderStyle: 'dashed' },
  codigoTexto: { color: c.oro, fontSize: tam(26), fontWeight: '900', letterSpacing: 3 },
  rechazar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.campo, alignItems: 'center', justifyContent: 'center' },
  interruptor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 10 },
  interruptorTexto: { color: c.texto, fontSize: tam(16), flex: 1 },
  perfilNombre: { color: c.texto, fontSize: tam(22), fontWeight: '900' },
  datos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dato: { width: '48%', flexGrow: 1, backgroundColor: c.campo, borderRadius: 14, padding: 12, alignItems: 'center' },
  datoValor: { color: c.texto, fontSize: tam(22), fontWeight: '900' },
  datoTexto: { color: c.suave, fontSize: tam(12), textAlign: 'center' },
  etiquetaReto: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  logro: { width: '47%', flexGrow: 1, backgroundColor: c.tarjeta, borderRadius: 18, padding: 14, alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: c.borde },
  logroTitulo: { color: c.texto, fontSize: tam(15), fontWeight: '900', textAlign: 'center' },
  logroTexto: { color: c.suave, fontSize: tam(12), lineHeight: tam(16), textAlign: 'center' },
});
