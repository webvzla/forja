// Retos con amigos: grupos con código, ranking semanal y rachas.
// Solo se comparte un resumen (entrenos, días con la proteína cumplida y racha), nunca peso ni comidas.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Datos, claveDia } from './datos';
import { sb } from './nube';
import { inicioSemana, nutricion } from './reglas';
import { compartirTexto } from './web';
import { Campo, Pildora, Tarjeta, c } from './ui';

const SEMANA_MS = 7 * 86400000;

export type Resumen = { semana: string; entrenos: number; objetivo: number; dias_proteina: number; racha: number };

export function calcularResumen(d: Datos): Resumen {
  const lunes = inicioSemana();
  const objetivo = d.perfil?.dias ?? 3;
  const entrenosDe = (desde: number) => d.sesiones.filter((s) => s.fecha >= desde && s.fecha < desde + SEMANA_MS).length;
  const meta = d.perfil ? nutricion(d.perfil).proteina : 0;
  let dias_proteina = 0;
  for (let i = 0; i < 7; i++) {
    const t = lunes + i * 86400000;
    if (t > Date.now()) break;
    const p = (d.comida[claveDia(t)] ?? []).reduce((n, x) => n + x.proteina, 0);
    if (meta > 0 && p >= meta) dias_proteina++;
  }
  // Racha: semanas seguidas cumpliendo los días de entreno (la actual cuenta si ya está cumplida).
  let racha = 0;
  for (let i = 0; i < 104; i++) {
    const ok = entrenosDe(lunes - i * SEMANA_MS) >= objetivo;
    if (ok) racha++;
    else if (i > 0) break;
  }
  return { semana: claveDia(lunes), entrenos: entrenosDe(lunes), objetivo, dias_proteina, racha };
}

export const puntos = (r: { entrenos: number; objetivo: number; dias_proteina: number; racha: number }) =>
  Math.min(r.entrenos, r.objetivo + 2) * 10 + (r.entrenos >= r.objetivo ? 15 : 0) + r.dias_proteina * 5 + Math.min(r.racha, 20) * 2;

// Sube el resumen cuando cambia (como mucho cada pocos segundos).
let ultimoSubido = '';
let temporizador: ReturnType<typeof setTimeout> | null = null;
export function subirResumen(d: Datos) {
  if (!sb) return;
  const r = calcularResumen(d);
  const clave = JSON.stringify(r);
  if (clave === ultimoSubido) return;
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(async () => {
    const { error } = await sb!.rpc('subir_resumen', {
      p_semana: r.semana, p_entrenos: r.entrenos, p_objetivo: r.objetivo, p_dias_proteina: r.dias_proteina, p_racha: r.racha,
    });
    if (!error) ultimoSubido = clave;
  }, 3000);
}

type Grupo = { id: string; nombre: string; codigo: string; miembros: number };
type Fila = { apodo: string; entrenos: number; objetivo: number; dias_proteina: number; racha: number; yo: boolean };

const errorAmable = (m: string) =>
  /codigo/.test(m) ? 'Ese código no existe. Revisa que esté bien escrito.'
    : /lleno/.test(m) ? 'Ese grupo ya está lleno (30 personas).'
      : /demasiados/.test(m) ? 'Ya estás en 10 grupos, sal de alguno primero.'
        : 'No se pudo completar. Revisa tu conexión.';

export function Retos({ d }: { d: Datos }) {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [activo, setActivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [modo, setModo] = useState<'nada' | 'crear' | 'unirse'>('nada');
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [apodo, setApodo] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const yo = calcularResumen(d);

  const cargarGrupos = async (elegir?: string) => {
    if (!sb) return;
    const { data, error } = await sb.rpc('mis_grupos');
    if (error) return setGrupos([]);
    const lista = (data ?? []) as Grupo[];
    setGrupos(lista);
    setActivo(elegir ?? (lista.some((g) => g.id === activo) ? activo : lista[0]?.id ?? null));
  };

  useEffect(() => {
    cargarGrupos();
  }, []);

  useEffect(() => {
    if (!sb || !activo) return setFilas(null);
    setFilas(null);
    sb.rpc('ranking', { p_grupo: activo, p_semana: yo.semana }).then(({ data }) => {
      const lista = ((data ?? []) as Fila[]).map((f) => (f.yo ? { ...f, ...yo } : f)); // lo mío, siempre al día
      setFilas(lista.sort((a, b) => puntos(b) - puntos(a)));
    });
  }, [activo, yo.entrenos, yo.dias_proteina, yo.racha]);

  const enviar = async () => {
    if (!sb) return;
    setMsg('');
    if (!apodo.trim()) return setMsg('Pon un apodo: es lo que verán tus amigos.');
    if (modo === 'crear' && !nombre.trim()) return setMsg('Ponle nombre al grupo.');
    if (modo === 'unirse' && codigo.trim().length < 6) return setMsg('El código tiene 6 letras o números.');
    setOcupado(true);
    const { data, error } =
      modo === 'crear'
        ? await sb.rpc('crear_grupo', { p_nombre: nombre.trim(), p_apodo: apodo.trim() })
        : await sb.rpc('unirse_grupo', { p_codigo: codigo.trim(), p_apodo: apodo.trim() });
    setOcupado(false);
    if (error) return setMsg(errorAmable(error.message));
    setModo('nada');
    setNombre('');
    setCodigo('');
    subirResumen(d);
    await cargarGrupos((data as any)?.id);
  };

  const grupo = grupos?.find((g) => g.id === activo);

  return (
    <Tarjeta>
      <Text style={e.titulo}>🏆 Retos con amigos</Text>
      <Text style={e.sub}>
        Esta semana: {yo.entrenos}/{yo.objetivo} entrenos · {yo.dias_proteina} días con tu proteína · racha de {yo.racha} {yo.racha === 1 ? 'semana' : 'semanas'} · {puntos(yo)} puntos
      </Text>

      {grupos && grupos.length > 1 ? (
        <View style={e.chips}>
          {grupos.map((g) => (
            <Pressable key={g.id} accessibilityRole="button" accessibilityState={{ selected: g.id === activo }} onPress={() => setActivo(g.id)} style={[e.chip, g.id === activo && { backgroundColor: c.oro }]}>
              <Text style={[e.chipTexto, g.id === activo && { color: c.sobreOro }]}>{g.nombre}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {grupo ? (
        <>
          <Text style={e.grupo}>{grupo.nombre} · {grupo.miembros} {grupo.miembros === 1 ? 'persona' : 'personas'}</Text>
          {!filas ? <Text style={e.sub}>Cargando…</Text> : null}
          {filas?.map((f, i) => (
            <View key={`${f.apodo}-${i}`} style={[e.fila, f.yo && e.filaYo]}>
              <Text style={e.puesto}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</Text>
              <View style={{ flex: 1 }}>
                <Text style={e.apodo}>{f.apodo}{f.yo ? ' (tú)' : ''}</Text>
                <Text style={e.detalle}>
                  {f.entrenos}/{f.objetivo} entrenos · {f.dias_proteina} días prot.{f.racha >= 2 ? ` · 🔥 ${f.racha} sem.` : ''}
                </Text>
              </View>
              <Text style={e.puntos}>{puntos(f)}</Text>
            </View>
          ))}
          {grupo.miembros === 1 ? <Text style={e.sub}>Estás solo de momento. Invita a tus amigos con el código.</Text> : null}
          <View style={e.botones}>
            <View style={{ flex: 1 }}>
              <Pildora
                chica
                tipo="neutro"
                texto={`Invitar · ${grupo.codigo}`}
                onPress={async () => {
                  const r = await compartirTexto(`¡Únete a mi grupo "${grupo.nombre}" en Forja! Entra en Progreso → Retos → Unirme y pon el código ${grupo.codigo}`).catch(() => null);
                  if (r === 'copiado') setMsg('Invitación copiada. Pégala en WhatsApp.');
                }}
              />
            </View>
            <Pildora
              chica
              tipo="peligro"
              texto="Salir"
              onPress={async () => {
                await sb?.rpc('salir_grupo', { p_grupo: grupo.id });
                setActivo(null);
                cargarGrupos();
              }}
            />
          </View>
          <Text style={e.nota}>Puntos: 10 por entreno (+15 si cumples tus días), 5 por día con tu proteína y 2 por semana de racha. El ranking se reinicia cada lunes.</Text>
        </>
      ) : grupos && !grupos.length && modo === 'nada' ? (
        <Text style={e.sub}>Crea un grupo y comparte el código con tus amigos, o únete al suyo. Solo verán tu apodo, tus entrenos de la semana, los días que cumples la proteína y tu racha.</Text>
      ) : null}

      {modo === 'nada' ? (
        <View style={e.botones}>
          <View style={{ flex: 1 }}><Pildora chica texto="Crear grupo" onPress={() => setModo('crear')} /></View>
          <View style={{ flex: 1 }}><Pildora chica tipo="neutro" texto="Unirme" onPress={() => setModo('unirse')} /></View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {modo === 'crear' ? (
            <Campo accessibilityLabel="Nombre del grupo" placeholder="Nombre del grupo (ej. Los del gym)" maxLength={40} value={nombre} onChangeText={setNombre} />
          ) : (
            <Campo accessibilityLabel="Código del grupo" placeholder="Código (6 letras o números)" autoCapitalize="characters" maxLength={6} value={codigo} onChangeText={setCodigo} />
          )}
          <Campo accessibilityLabel="Tu apodo" placeholder="Tu apodo (lo verán tus amigos)" maxLength={20} value={apodo} onChangeText={setApodo} />
          <View style={e.botones}>
            <View style={{ flex: 1 }}><Pildora chica tipo="neutro" texto="Cancelar" onPress={() => { setModo('nada'); setMsg(''); }} /></View>
            <View style={{ flex: 1 }}><Pildora chica texto={ocupado ? 'Un momento…' : modo === 'crear' ? 'Crear' : 'Unirme'} deshabilitado={ocupado} onPress={enviar} /></View>
          </View>
        </View>
      )}
      {msg ? <Text style={e.msg}>{msg}</Text> : null}
    </Tarjeta>
  );
}

const e = StyleSheet.create({
  titulo: { color: c.texto, fontSize: 19, fontWeight: '900' },
  sub: { color: c.suave, fontSize: 15, lineHeight: 21 },
  grupo: { color: c.oro, fontSize: 16, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 38, borderRadius: 999, justifyContent: 'center', backgroundColor: c.campo },
  chipTexto: { color: c.texto, fontSize: 14, fontWeight: '700' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14 },
  filaYo: { backgroundColor: c.campo },
  puesto: { width: 30, fontSize: 18, color: c.suave, fontWeight: '800', textAlign: 'center' },
  apodo: { color: c.texto, fontSize: 16, fontWeight: '800' },
  detalle: { color: c.suave, fontSize: 13 },
  puntos: { color: c.oro, fontSize: 20, fontWeight: '900' },
  botones: { flexDirection: 'row', gap: 10 },
  nota: { color: c.suave, fontSize: 13, lineHeight: 18 },
  msg: { color: c.oro, fontSize: 15, lineHeight: 21 },
});
