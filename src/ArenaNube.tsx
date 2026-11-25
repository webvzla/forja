// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// ARENA con datos reales del servidor: ranking, amigos (solicitudes, búsqueda, bloqueos) y retos.
// Todo lo que se muestra de otras personas lo filtra el servidor según su privacidad.
import { Component, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import { Dato, Historial, ORO, Podio, Recomendar, e, nombreFila } from './Arena';
import { textoInvitacion } from './invitaciones';
import { PRIVACIDAD_INICIAL, type PreferenciasArena, REGLAS_PUNTOS, apodoValido, metaMinima, TEXTO_OBJETIVO_RETO, type TipoObjetivo } from './competicion';
import type { Datos } from './datos';
import {
  type Encontrado, type FichaAmigo, type FilaNube, type MiPerfil, type MisAmigos, type RetoNube,
  bloquear, buscarPerfiles, crearReto, desbloquear, eliminarAmistad, fichaAmigo, historialNube, miPerfil, misAmigos, misRetos,
  pendientes, rankingNube, responderAmistad, responderReto, salirReto, solicitarAmistad, textoError, vaciarCola,
} from './servidorArena';
import { Aviso, Avatar, Barra, Campo, Cargando, Chip, Dialogo, Pildora, Seccion, Segmentos, Tarjeta, Vacio, c, tam } from './ui';
import { compartirTexto } from './web';

type Pestana = 'ranking' | 'amigos' | 'retos';
type Periodo = 'semana' | 'mes';
type Categoria = 'puntos' | 'entrenos' | 'constancia';

// Carga con estado de error legible y reintento.
function useCarga<T>(f: () => Promise<T>, deps: unknown[]) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    (async () => {
      await vaciarCola().catch(() => {}); // primero sube lo pendiente, así el ranking ya lo incluye
      try {
        const r = await f();
        if (vivo) { setDatos(r); setError(''); }
      } catch (x) {
        if (vivo) setError(textoError(x));
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { datos, error, recargar: useCallback(() => setN((x) => x + 1), []) };
}

function ErrorCarga({ texto, onReintentar }: { texto: string; onReintentar: () => void }) {
  return (
    <Tarjeta>
      <Aviso tipo="error" texto={texto} />
      <Pildora chica tipo="neutro" texto="Reintentar" onPress={onReintentar} />
    </Tarjeta>
  );
}

// Si algo inesperado falla al dibujar Arena, solo se ve un aviso aquí; el resto de la app sigue.
class Protegido extends Component<{ children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  render() {
    return this.state.fallo ? <ErrorCarga texto="Arena no se ha podido cargar ahora mismo." onReintentar={() => this.setState({ fallo: false })} /> : this.props.children;
  }
}

type PropsNube = {
  d: Datos;
  pestana: Pestana;
  onActualizar: (f: (d: Datos) => Datos) => void;
  invitacion?: string | null;
  onInvitacionResuelta?: () => void;
};

export function ArenaNube(p: PropsNube) {
  return (
    <Protegido>
      <ArenaNubeContenido {...p} />
    </Protegido>
  );
}

function ArenaNubeContenido(p: PropsNube) {
  const [cola, setCola] = useState(0);
  useEffect(() => {
    pendientes().then(setCola).catch(() => {});
  }, [p.pestana, p.d]);
  return (
    <>
      {cola ? <Aviso tipo="info" texto={`${cola} ${cola === 1 ? 'cambio pendiente' : 'cambios pendientes'} de enviar. Se subirán solos cuando haya conexión.`} /> : null}
      {p.pestana === 'ranking' ? <RankingNube /> : p.pestana === 'amigos' ? <AmigosNube d={p.d} onActualizar={p.onActualizar} invitacion={p.invitacion ?? null} onInvitacionResuelta={p.onInvitacionResuelta} /> : <RetosNube d={p.d} />}
    </>
  );
}

// ---------- Ranking ----------
function RankingNube() {
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [categoria, setCategoria] = useState<Categoria>('puntos');
  const [reglas, setReglas] = useState(false);
  const r = useCarga(async () => {
    const [filas, antes, historial] = await Promise.all([
      rankingNube(periodo, categoria),
      rankingNube(periodo, categoria, periodo === 'semana' ? 1 : 4),
      historialNube(),
    ]);
    return { filas, antes, historial };
  }, [periodo, categoria]);

  const valor = (f: FilaNube) => (categoria === 'puntos' ? `${f.puntos} pts` : categoria === 'entrenos' ? `${f.entrenos}` : `${f.constancia} %`);
  const filtros = (
    <>
      <Segmentos<Periodo> etiqueta="Periodo" valor={periodo} onCambio={setPeriodo} opciones={[['semana', 'Esta semana'], ['mes', 'Este mes']]} />
      <View style={e.chips}>
        <Chip texto="⭐ Puntos" activo={categoria === 'puntos'} onPress={() => setCategoria('puntos')} />
        <Chip texto="🏋️ Entrenos" activo={categoria === 'entrenos'} onPress={() => setCategoria('entrenos')} />
        <Chip texto="🔥 Constancia" activo={categoria === 'constancia'} onPress={() => setCategoria('constancia')} />
      </View>
    </>
  );
  if (r.error) return <>{filtros}<ErrorCarga texto={r.error} onReintentar={r.recargar} /></>;
  if (!r.datos) return <>{filtros}<Cargando texto="Calculando el ranking…" /></>;
  const { filas, antes, historial } = r.datos;
  const yo = filas.findIndex((f) => f.yo) + 1;
  const mio = filas.find((f) => f.yo);

  return (
    <>
      {filtros}
      {filas.length < 2 ? (
        <>
          <Tarjeta>
            <Vacio icono="👥" titulo="Aún no tienes amigos en Arena" texto={`Esta semana llevas ${mio?.puntos ?? 0} puntos. Invita a tus amigos con tu enlace desde la pestaña Amigos para competir.`} />
          </Tarjeta>
          <Recomendar />
        </>
      ) : (
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
                  <Text style={e.detalle}>{f.entrenos} {f.entrenos === 1 ? 'entreno' : 'entrenos'} · {f.constancia} % constancia{f.racha >= 2 ? ` · 🔥 ${f.racha}` : ''}</Text>
                </View>
                <Text style={[e.mov, { color: mov > 0 ? c.verde : mov < 0 ? c.rojo : c.suave }]}>{mov > 0 ? `▲${mov}` : mov < 0 ? `▼${-mov}` : '–'}</Text>
                <Text style={e.valor}>{valor(f)}</Text>
              </View>
            );
          })}
        </Tarjeta>
      )}
      <Pressable accessibilityRole="button" onPress={() => setReglas(true)} hitSlop={6}>
        <Text style={e.enlace}>¿Cómo se consiguen los puntos?</Text>
      </Pressable>

      {filas.length >= 2 ? (
        <>
          <Seccion>📈 Tu historial</Seccion>
          <Tarjeta>
            <Text style={e.sub}>Estás {yo}º de {filas.length} {periodo === 'semana' ? 'esta semana' : 'este mes'}. Tu puesto en las últimas 8 semanas:</Text>
            <Historial puntos={historial} />
          </Tarjeta>
        </>
      ) : null}

      {reglas ? (
        <Dialogo titulo="Cómo se puntúa" si="Entendido" onSi={() => setReglas(false)}>
          <Text style={e.sub}>Arena premia la constancia y superarte a ti mismo, no levantar más que nadie.</Text>
          {REGLAS_PUNTOS.map(([t, x]) => (
            <View key={t}>
              <Text style={e.nombre}>{t}</Text>
              <Text style={e.sub}>{x}</Text>
            </View>
          ))}
          <Text style={e.nota}>Los puntos los calcula el servidor a partir de tus entrenos terminados (mín. 10 minutos y 3 series, de los últimos 7 días) y no se pueden editar a mano.</Text>
        </Dialogo>
      ) : null}
    </>
  );
}

// ---------- Amigos ----------
function FichaDialogo({ id, onCerrar, onCambio }: { id: string; onCerrar: () => void; onCambio: () => void }) {
  const [ficha, setFicha] = useState<FichaAmigo | null>(null);
  const [error, setError] = useState('');
  const [confirmar, setConfirmar] = useState<null | 'eliminar' | 'bloquear'>(null);
  useEffect(() => {
    fichaAmigo(id).then(setFicha).catch((x) => setError(textoError(x)));
  }, [id]);
  const accion = async () => {
    try {
      await (confirmar === 'eliminar' ? eliminarAmistad(id) : bloquear(id));
      onCambio();
      onCerrar();
    } catch (x) {
      setError(textoError(x));
      setConfirmar(null);
    }
  };
  if (confirmar && ficha)
    return (
      <Dialogo
        titulo={confirmar === 'eliminar' ? `¿Eliminar a ${ficha.apodo}?` : `¿Bloquear a ${ficha.apodo}?`}
        mensaje={confirmar === 'eliminar' ? 'Dejaréis de veros en el ranking y en la ficha. En los retos que compartáis seguiréis viendo el progreso. Podéis volver a ser amigos más adelante.' : 'No podrá verte, enviarte solicitudes ni invitarte a retos. No se le avisa.'}
        si={confirmar === 'eliminar' ? 'Eliminar' : 'Bloquear'}
        peligro
        no="Cancelar"
        onSi={accion}
        onNo={() => setConfirmar(null)}
      />
    );
  const mes = (v: string) => new Date(v).toLocaleDateString('es', { month: 'short', year: 'numeric' });
  return (
    <Dialogo titulo="" si="Cerrar" onSi={onCerrar}>
      {error ? <Aviso tipo="error" texto={error} /> : !ficha ? <Cargando /> : (
        <>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Avatar nombre={ficha.apodo} tam={76} borde={c.oro} />
            <Text style={e.perfilNombre}>{ficha.apodo}</Text>
            <Text style={e.sub}>{ficha.nivel ? `${ficha.nivel[0].toUpperCase()}${ficha.nivel.slice(1)} · ` : ''}en FORJA desde {mes(ficha.desde)}</Text>
          </View>
          <View style={e.datos}>
            <Dato v={String(ficha.entrenos ?? 0)} t="entrenos (4 sem.)" oculto={ficha.entrenos === null} />
            <Dato v={`🔥 ${ficha.racha ?? 0}`} t="semanas de racha" oculto={ficha.racha === null} />
            <Dato v={String(ficha.medallas ?? 0)} t="medallas" oculto={ficha.medallas === null} />
            <Dato v={String(ficha.records ?? 0)} t="récords (4 sem.)" oculto={ficha.records === null} />
          </View>
          <Text style={e.nota}>{ficha.privado ? '🔒 Tiene su perfil en privado: su ficha no muestra sus datos.' : '🔒 = no lo muestra en su ficha. Nunca se muestran peso, medidas ni comidas.'}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Pildora chica tipo="neutro" texto="Eliminar" onPress={() => setConfirmar('eliminar')} /></View>
            <View style={{ flex: 1 }}><Pildora chica tipo="peligro" texto="Bloquear" onPress={() => setConfirmar('bloquear')} /></View>
          </View>
        </>
      )}
    </Dialogo>
  );
}

function AmigosNube(p: { d: Datos; onActualizar: (f: (d: Datos) => Datos) => void; invitacion: string | null; onInvitacionResuelta?: () => void }) {
  const prefs: PreferenciasArena = { ...PRIVACIDAD_INICIAL, ...(p.d.ajustes?.arena ?? {}) };
  const guardar = (cambios: Partial<PreferenciasArena>) =>
    p.onActualizar((x) => ({ ...x, ajustes: { ...x.ajustes, arena: { ...PRIVACIDAD_INICIAL, ...(x.ajustes?.arena ?? {}), ...cambios } } }));
  const r = useCarga(async () => {
    const [perfil, amigos] = await Promise.all([miPerfil(), misAmigos()]);
    return { perfil, amigos } as { perfil: MiPerfil; amigos: MisAmigos };
  }, []);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Encontrado[] | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);
  const [apodo, setApodo] = useState(prefs.apodo.toLowerCase() === 'tú' ? '' : prefs.apodo);
  const miCodigo = r.datos?.perfil.codigo;
  const { invitacion, onInvitacionResuelta } = p;
  useEffect(() => {
    if (invitacion && miCodigo && invitacion === miCodigo) onInvitacionResuelta?.(); // abriste tu propio enlace
  }, [invitacion, miCodigo, onInvitacionResuelta]);

  // Búsqueda en el servidor (mín. 3 letras), con una pequeña espera para no lanzar una por tecla.
  const q = busca.trim();
  useEffect(() => {
    if (q.length < 3) return;
    let vivo = true;
    const t = setTimeout(() => {
      buscarPerfiles(q).then((x) => vivo && setResultados(x)).catch((x) => vivo && setMsg({ tipo: 'error', texto: textoError(x) }));
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [q]);

  const hacer = async (f: () => Promise<unknown>, ok?: string) => {
    setMsg(null);
    try {
      await f();
      if (ok) setMsg({ tipo: 'ok', texto: ok });
      r.recargar();
      if (q.length >= 3) buscarPerfiles(q).then(setResultados).catch(() => {});
    } catch (x) {
      setMsg({ tipo: 'error', texto: textoError(x) });
    }
  };

  if (r.error) return <ErrorCarga texto={r.error} onReintentar={r.recargar} />;
  if (!r.datos) return <Cargando texto="Cargando tus amigos…" />;
  const { perfil, amigos } = r.datos;
  const codigo = perfil.codigo;
  const pareceCodigo = /^forja-[a-z0-9]{4,6}$/i.test(q);

  // Invitación recibida por enlace: se pregunta antes de enviar la solicitud. Tu propio código se ignora.
  const inv = p.invitacion && p.invitacion !== codigo ? p.invitacion : null;

  return (
    <>
      {inv ? (
        <Tarjeta destacada>
          <Text style={e.titulo}>📨 Te han invitado</Text>
          <Text style={e.sub}>Alguien te ha enviado su código {inv}. ¿Le envías una solicitud de amistad? Cuando la acepte, os veréis en el ranking.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Pildora chica tipo="neutro" texto="Ahora no" onPress={() => p.onInvitacionResuelta?.()} /></View>
            <View style={{ flex: 1 }}>
              <Pildora chica texto="Enviar solicitud" onPress={() => hacer(async () => { const r = await solicitarAmistad({ codigo: inv }); p.onInvitacionResuelta?.(); return r; }, 'Solicitud enviada. Cuando la acepte, aparecerá en tus amigos.')} />
            </View>
          </View>
        </Tarjeta>
      ) : null}
      <Tarjeta>
        <Text style={e.titulo}>Invita a tus amigos</Text>
        <View style={e.codigo}>
          <Text style={e.codigoTexto} selectable>{codigo}</Text>
        </View>
        <Pildora
          chica
          texto="Compartir invitación"
          onPress={async () => {
            const x = await compartirTexto(textoInvitacion(codigo)).catch(() => null);
            if (x === 'copiado') setMsg({ tipo: 'info', texto: 'Invitación copiada. Pégala en WhatsApp.' });
          }}
        />
      </Tarjeta>

      <Campo accessibilityLabel="Buscar amigos por apodo o código" placeholder="🔍 Buscar por apodo o código (mín. 3 letras)" value={busca} onChangeText={setBusca} autoCapitalize="none" />
      {msg ? <Aviso tipo={msg.tipo} texto={msg.texto} /> : null}
      {q.length >= 3 && resultados ? (
        <Tarjeta>
          {resultados.length ? (
            resultados.map((x) => (
              <View key={x.id} style={e.fila}>
                <Avatar nombre={x.apodo} tam={38} />
                <View style={{ flex: 1 }}>
                  <Text style={e.nombre}>{x.apodo}</Text>
                  {x.nivel ? <Text style={e.detalle}>{x.nivel}</Text> : null}
                </View>
                {x.relacion === 'amigo' ? <Text style={e.detalle}>Amigos ✓</Text> : x.relacion === 'enviada' ? <Text style={e.detalle}>Enviada</Text> : (
                  <Pildora
                    chica
                    texto={x.relacion === 'recibida' ? 'Aceptar' : 'Añadir'}
                    onPress={() => hacer(() => (pareceCodigo ? solicitarAmistad({ codigo: q }) : solicitarAmistad({ id: x.id })), x.relacion === 'recibida' ? `Ahora eres amigo de ${x.apodo}.` : `Solicitud enviada a ${x.apodo}.`)}
                  />
                )}
              </View>
            ))
          ) : (
            <Text style={e.sub}>Nadie con ese apodo. Prueba con su código de invitación (FORJA-XXXX).</Text>
          )}
        </Tarjeta>
      ) : null}

      {amigos.recibidas.length ? (
        <>
          <Seccion>📨 Solicitudes ({amigos.recibidas.length})</Seccion>
          <Tarjeta>
            {amigos.recibidas.map((x) => (
              <View key={x.id} style={e.fila}>
                <Avatar nombre={x.apodo} tam={38} />
                <View style={{ flex: 1 }}>
                  <Text style={e.nombre}>{x.apodo}</Text>
                  <Text style={e.detalle}>Quiere ser tu amigo</Text>
                </View>
                <Pildora chica texto="Aceptar" onPress={() => hacer(() => responderAmistad(x.id, true), `Ahora eres amigo de ${x.apodo}.`)} />
                <Pressable accessibilityRole="button" accessibilityLabel={`Rechazar a ${x.apodo}`} onPress={() => hacer(() => responderAmistad(x.id, false))} style={e.rechazar} hitSlop={6}>
                  <Text style={{ color: c.suave, fontSize: tam(18), fontWeight: '900' }}>✕</Text>
                </Pressable>
              </View>
            ))}
          </Tarjeta>
        </>
      ) : null}

      <Seccion>👥 Tus amigos ({amigos.amigos.length})</Seccion>
      <Tarjeta>
        {amigos.amigos.length ? (
          amigos.amigos.map((x) => (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`Ver perfil de ${x.apodo}`} onPress={() => setFicha(x.id)} style={({ pressed }) => [e.fila, pressed && { opacity: 0.7 }]}>
              <Avatar nombre={x.apodo} tam={42} />
              <View style={{ flex: 1 }}>
                <Text style={e.nombre}>{x.apodo}</Text>
                {x.nivel ? <Text style={e.detalle}>{x.nivel}</Text> : null}
              </View>
              <Text style={{ color: c.suave, fontSize: tam(20) }}>›</Text>
            </Pressable>
          ))
        ) : (
          <Vacio icono="🤝" titulo="Sin amigos todavía" texto="Comparte tu código o búscalos por su apodo." />
        )}
        {amigos.enviadas.length ? (
          <>
            <Text style={e.etiqueta}>Solicitudes enviadas</Text>
            {amigos.enviadas.map((x) => (
              <View key={x.id} style={e.interruptor}>
                <Text style={e.interruptorTexto}>{x.apodo}</Text>
                <Pildora chica tipo="neutro" texto="Cancelar" onPress={() => hacer(() => eliminarAmistad(x.id))} />
              </View>
            ))}
          </>
        ) : null}
      </Tarjeta>

      <Seccion>🔒 Tu privacidad</Seccion>
      <Tarjeta>
        <Text style={e.etiqueta}>Tu apodo en Arena</Text>
        <Campo
          accessibilityLabel="Tu apodo en Arena"
          maxLength={24}
          placeholder={perfil.apodo}
          value={apodo}
          onChangeText={setApodo}
          onBlur={() => {
            const a = apodo.trim().replace(/\s+/g, ' ');
            if (!a) return;
            if (!apodoValido(a)) return setMsg({ tipo: 'error', texto: 'El apodo debe tener entre 2 y 24 letras o números (sin símbolos ni la palabra FORJA).' });
            guardar({ apodo: a });
          }}
        />
        <Text style={e.nota}>Así te ven los demás en Arena. Nunca se muestra tu email.</Text>
        <Text style={e.etiqueta}>¿Quién puede ver tu perfil?</Text>
        <Segmentos<'amigos' | 'nadie'> etiqueta="Visibilidad del perfil" valor={prefs.visible} onCambio={(visible) => guardar({ visible })} opciones={[['amigos', 'Solo amigos'], ['nadie', 'Nadie']]} />
        <Text style={e.etiqueta}>Qué se ve en tu ficha de amigo</Text>
        {([['entrenos', 'Entrenos y constancia'], ['racha', 'Racha'], ['medallas', 'Medallas'], ['records', 'Récords personales'], ['retos', 'Retos completados']] as const).map(([k, t]) => (
          <View key={k} style={e.interruptor}>
            <Text style={e.interruptorTexto}>{t}</Text>
            <Switch accessibilityLabel={`Compartir ${t}`} value={prefs.compartir[k] && prefs.visible !== 'nadie'} disabled={prefs.visible === 'nadie'} onValueChange={(v) => guardar({ compartir: { ...prefs.compartir, [k]: v } })} trackColor={{ true: c.oro, false: c.borde }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as object)} />
          </View>
        ))}
        <Text style={e.nota}>{prefs.visible === 'nadie' ? 'Con «Nadie» no apareces en búsquedas por apodo ni en rankings. Tus amigos te siguen viendo en su lista (apodo y nivel), en los retos se ve tu progreso y quien tenga tu código puede encontrarte.' : 'En el ranking, tus amigos ven siempre tus puntos, entrenos, constancia y racha: estos interruptores solo cambian tu ficha. Cualquiera con cuenta puede encontrarte por tu apodo y ver tu nivel de entrenamiento. En los retos se ve tu progreso.'} Nunca se muestran tu peso, medidas, comidas ni fotos.</Text>
        {amigos.bloqueados.length ? (
          <>
            <Text style={e.etiqueta}>Bloqueados</Text>
            {amigos.bloqueados.map((x) => (
              <View key={x.id} style={e.interruptor}>
                <Text style={e.interruptorTexto}>{x.apodo}</Text>
                <Pildora chica tipo="neutro" texto="Desbloquear" onPress={() => hacer(() => desbloquear(x.id))} />
              </View>
            ))}
          </>
        ) : null}
      </Tarjeta>

      {ficha ? <FichaDialogo id={ficha} onCerrar={() => setFicha(null)} onCambio={r.recargar} /> : null}
    </>
  );
}

// ---------- Retos ----------
function TarjetaRetoNube({ reto, onCambio }: { reto: RetoNube; onCambio: () => void }) {
  const [error, setError] = useState('');
  const aceptados = reto.participantes.filter((x) => x.estado === 'aceptado').sort((a, b) => b.progreso - a.progreso);
  const equipo = aceptados.reduce((a, x) => a + x.progreso, 0);
  const unidad = TEXTO_OBJETIVO_RETO[reto.objetivo][1];
  const invitados = reto.participantes.filter((x) => x.estado === 'invitado');
  const accion = async (f: () => Promise<unknown>) => {
    try {
      await f();
      onCambio();
    } catch (x) {
      setError(textoError(x));
    }
  };
  return (
    <Tarjeta destacada={!reto.terminado}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={e.titulo}>{reto.nombre}</Text>
          <Text style={e.detalle}>{reto.modo === 'grupal' ? '👥 En equipo' : '🧍 Individual'} · {reto.dias} días · meta {reto.meta} {unidad}{reto.modo === 'individual' ? ' cada uno' : ' entre todos'}</Text>
        </View>
        <View style={[e.etiquetaReto, { backgroundColor: reto.terminado ? c.campo : c.acentoSuave }]}>
          <Text style={{ color: reto.terminado ? c.suave : c.oro, fontWeight: '800', fontSize: tam(13) }}>{reto.terminado ? 'Terminado' : `Quedan ${reto.dias_restantes} d`}</Text>
        </View>
      </View>
      {reto.mi_estado === 'invitado' ? (
        <>
          <Text style={e.sub}>Te han invitado a este reto.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Pildora chica tipo="neutro" texto="No, gracias" onPress={() => accion(() => responderReto(reto.id, false))} /></View>
            <View style={{ flex: 1 }}><Pildora chica texto="Unirme" onPress={() => accion(() => responderReto(reto.id, true))} /></View>
          </View>
        </>
      ) : null}
      {reto.modo === 'grupal' ? (
        <View style={{ gap: 6 }}>
          <Text style={e.nombre}>Equipo: {equipo}/{reto.meta}</Text>
          <Barra valor={equipo} max={reto.meta} alto={14} etiqueta={`Progreso del equipo ${equipo} de ${reto.meta}`} />
        </View>
      ) : null}
      {aceptados.map((x, i) => (
        <View key={x.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[e.detalle, x.yo && { color: c.oro, fontWeight: '800' }]}>
              {reto.terminado && reto.modo === 'individual' && i === 0 ? '🏆 ' : ''}{x.yo ? 'Tú' : x.apodo}
            </Text>
            <Text style={e.detalle}>{x.progreso}{reto.modo === 'individual' ? `/${reto.meta}` : ''}</Text>
          </View>
          <Barra valor={x.progreso} max={reto.modo === 'individual' ? reto.meta : Math.max(1, ...aceptados.map((y) => y.progreso))} alto={8} color={x.yo ? c.oro : c.nivel2} etiqueta={`${x.yo ? 'Tú' : x.apodo}: ${x.progreso}`} />
        </View>
      ))}
      {invitados.length ? <Text style={e.nota}>Pendientes de unirse: {invitados.map((x) => x.apodo).join(', ')}</Text> : null}
      {reto.terminado ? <Aviso tipo={reto.cumplido ? 'ok' : 'info'} texto={reto.cumplido ? '¡Reto completado! +15 puntos en Arena.' : 'Esta vez no se llegó a la meta. ¡A por el siguiente!'} /> : null}
      {!reto.terminado && reto.mi_estado === 'aceptado' ? (
        <Pressable accessibilityRole="button" onPress={() => accion(() => salirReto(reto.id))} hitSlop={6}>
          <Text style={[e.enlace, { color: c.suave, fontSize: tam(13) }]}>Salir del reto</Text>
        </Pressable>
      ) : null}
      {error ? <Aviso tipo="error" texto={error} /> : null}
    </Tarjeta>
  );
}

function RetosNube({ d }: { d: Datos }) {
  const r = useCarga(async () => {
    const [retos, amigos] = await Promise.all([misRetos(), misAmigos()]);
    return { retos, amigos: amigos.amigos };
  }, []);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [modo, setModo] = useState<'individual' | 'grupal'>('individual');
  const [dias, setDias] = useState<7 | 14 | 30>(14);
  const [objetivo, setObjetivo] = useState<TipoObjetivo>('entrenos');
  const [meta, setMeta] = useState('8');
  const [invitados, setInvitados] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const sugerida = (o: TipoObjetivo, dd: number, m: string, n = invitados.length) => {
    const base = o === 'entrenos' ? Math.round(((d.perfil?.dias ?? 3) * dd) / 7) : o === 'proteina' ? Math.round(dd * 0.7) : Math.max(1, Math.round(dd / 7));
    const personas = m === 'grupal' ? n + 1 : 1;
    const tope = m === 'individual' && o !== 'records' ? dd : 1000;
    return String(Math.min(tope, Math.max(base * personas, metaMinima(o, dd, personas))));
  };

  const crear = async () => {
    setError('');
    const n = parseInt(meta, 10);
    if (nombre.trim().length < 3) return setError('Ponle un nombre de al menos 3 letras.');
    if (!n || n < 1) return setError('La meta tiene que ser un número mayor que 0.');
    if (modo === 'individual' && objetivo !== 'records' && n > dias) return setError(`En ${dias} días la meta máxima es ${dias}.`);
    if (modo === 'grupal' && !invitados.length) return setError('Un reto en equipo necesita al menos un amigo.');
    const minimo = metaMinima(objetivo, dias, modo === 'grupal' ? invitados.length + 1 : 1);
    if (n < minimo) return setError(`La meta mínima para este reto es ${minimo}, para que sea un reto de verdad.`);
    setEnviando(true);
    try {
      await crearReto({ nombre: nombre.trim(), modo, dias, objetivo, meta: n, invitados });
      setCreando(false);
      setNombre('');
      setInvitados([]);
      r.recargar();
    } catch (x) {
      setError(textoError(x));
    } finally {
      setEnviando(false);
    }
  };

  if (r.error) return <ErrorCarga texto={r.error} onReintentar={r.recargar} />;
  if (!r.datos) return <Cargando texto="Cargando retos…" />;
  const activos = r.datos.retos.filter((x) => !x.terminado);
  const pasados = r.datos.retos.filter((x) => x.terminado);

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
          {r.datos.amigos.length ? (
            <View style={e.chips}>
              {r.datos.amigos.map((a) => (
                <Chip key={a.id} texto={a.apodo} activo={invitados.includes(a.id)} onPress={() => {
                  const nuevos = invitados.includes(a.id) ? invitados.filter((x) => x !== a.id) : [...invitados, a.id].slice(0, 10);
                  setInvitados(nuevos);
                  if (modo === 'grupal') setMeta(sugerida(objetivo, dias, modo, nuevos.length));
                }} />
              ))}
            </View>
          ) : (
            <Text style={e.nota}>Aún no tienes amigos. Puedes crear un reto individual para ti o añadir amigos en la pestaña Amigos.</Text>
          )}
          {error ? <Aviso tipo="error" texto={error} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Pildora chica tipo="neutro" texto="Cancelar" onPress={() => { setCreando(false); setError(''); }} /></View>
            <View style={{ flex: 1 }}><Pildora chica texto={enviando ? 'Creando…' : 'Crear reto'} deshabilitado={enviando} onPress={crear} /></View>
          </View>
        </Tarjeta>
      ) : (
        <Pildora texto="＋ Crear reto" onPress={() => { setCreando(true); setMeta(sugerida(objetivo, dias, modo)); }} />
      )}

      <Seccion>🎯 En marcha ({activos.length})</Seccion>
      {activos.length ? activos.map((x) => <TarjetaRetoNube key={x.id} reto={x} onCambio={r.recargar} />) : (
        <Tarjeta><Vacio icono="🎯" titulo="Ningún reto en marcha" texto="Crea uno de 7, 14 o 30 días e invita a tus amigos." /></Tarjeta>
      )}
      {pasados.length ? (
        <>
          <Seccion>🏁 Terminados</Seccion>
          {pasados.map((x) => <TarjetaRetoNube key={x.id} reto={x} onCambio={r.recargar} />)}
        </>
      ) : null}
    </>
  );
}
