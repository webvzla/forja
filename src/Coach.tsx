// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { elegirArchivo, exportarCopia } from './web';
import { ChatCoach } from './IA';
import { iaActiva, type EstadoNube } from './nube';
import { EnlacePrivacidad } from './Privacidad';
import { Instalar } from './Instalar';
import { Ajustes } from './Ajustes';
import { EtiquetaBeta } from './Beta';
import { Datos, Enfasis, Equipo, Nivel, Objetivo, Perfil, Rutina, aNumero, formatoNum, zonas } from './datos';
import { NOMBRE_DIA, ajustarPlan, diaHoy, inicioSemana, nutricion, revisar, TEXTO_OBJETIVO, adaptarRutina, incompatibles, objetivos, textoObjetivo } from './reglas';
import { Grafica } from './Progreso';
import { TarjetaAtleta } from './Atleta';
import { ElegirDificultadInicial, TarjetaDificultad } from './Dificultad';
import { fijarDificultad, requiereElegirDificultad } from './niveles';
import { dolorReciente } from './adaptacion';
import { Campo, Dialogo, Pildora, Tarjeta, Titulo, c, tam } from './ui';

function Opciones<T extends string | number>(p: {
  titulo: string;
  valor: T;
  opciones: [T, string][];
  onCambio: (v: T) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={e.etiqueta}>{p.titulo}</Text>
      <View style={e.chips}>
        {p.opciones.map(([v, texto]) => (
          <Pressable
            key={String(v)}
            accessibilityRole="button"
            accessibilityLabel={`${p.titulo}: ${texto}`}
            accessibilityState={{ selected: v === p.valor }}
            onPress={() => p.onCambio(v)}
            style={[e.chip, v === p.valor && { backgroundColor: c.oro }]}
          >
            <Text style={[e.chipTexto, v === p.valor && { color: c.sobreOro }]}>{texto}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Qué hace el plan con cada combinación (claves en orden alfabético).
const EXPLICA: Record<string, string> = {
  'grasa+musculo': 'Recomposición: un déficit pequeño de calorías y mucha proteína para perder grasa sin perder músculo. Va más lento que hacer una cosa cada vez, pero se nota en el espejo.',
  'fuerza+grasa': 'Pesos altos en los ejercicios básicos (5–8 repeticiones) y un déficit moderado para perder grasa sin perder fuerza.',
  'fuerza+musculo': 'Básicos pesados (5–8 repeticiones) para la fuerza y accesorios de 10–15 para el músculo, con un pequeño superávit de calorías.',
  'mantener+musculo': 'Comes lo justo para mantener el peso y entrenas para ganar músculo: cambio lento pero sin subir de peso.',
  'fuerza+mantener': 'Comes lo justo para mantener el peso y entrenas pesado para ganar fuerza.',
};

const ZONAS: [Enfasis, string][] = [['ninguno', 'Ninguna'], ['pecho', 'Pecho'], ['espalda', 'Espalda'], ['pierna', 'Pierna'], ['gluteo', 'Glúteo'], ['brazos', 'Brazos'], ['abdomen', 'Abdomen']];


function Formulario(p: { inicial: Perfil | null; onGuardar: (x: Perfil) => void; onCancelar?: () => void }) {
  const i = p.inicial;
  const [sexo, setSexo] = useState<'h' | 'm'>(i?.sexo ?? 'h');
  const [edad, setEdad] = useState(i ? String(i.edad) : '');
  const [altura, setAltura] = useState(i ? String(i.altura) : '');
  const [peso, setPeso] = useState(i ? formatoNum(i.peso) : '');
  const [metas, setMetas] = useState<Objetivo[]>(i ? objetivos(i) : ['musculo']);
  const [avisoMetas, setAvisoMetas] = useState('');
  const objetivo = metas[0];
  const [diasSemana, setDiasSemana] = useState<number[]>(i?.diasSemana ?? [0, 1, 3, 4]);
  const [nivel, setNivel] = useState<Nivel>(i?.nivel ?? 'principiante');
  const [equipo, setEquipo] = useState<Equipo>(i?.equipo ?? 'gym');
  const [enfasis, setEnfasis] = useState<Enfasis[]>(zonas(i));
  const [avisoZonas, setAvisoZonas] = useState('');
  const [error, setError] = useState('');
  const [eligiendo, setEligiendo] = useState<Perfil | null>(null);

  const guardar = () => {
    const ed = aNumero(edad);
    const al = aNumero(altura);
    const pe = aNumero(peso);
    if (ed < 14 || ed > 100) return setError('Pon una edad entre 14 y 100 años.');
    if (al < 120 || al > 230) return setError('Pon tu altura en centímetros, por ejemplo 175.');
    if (pe < 30 || pe > 250) return setError('Pon tu peso en kilos, por ejemplo 78.');
    if (diasSemana.length < 2 || diasSemana.length > 6) return setError('Elige entre 2 y 6 días para entrenar.');
    // La dificultad se fija aquí: cambiar el nivel físico no la cambia sola. Si el cambio rehace el plan y nunca la has
    // elegido, se te pregunta antes (nunca se asume «Exigente» por ser nivel avanzado).
    const nuevo = fijarDificultad(i, {
      sexo, edad: Math.round(ed), altura: Math.round(al), peso: pe, objetivo, objetivo2: metas[1] ?? null, dias: diasSemana.length, diasSemana, nivel, equipo, enfasis,
      descargaHasta: i?.descargaHasta ?? null,
      ajusteKcal: i && objetivos(i).join() === metas.join() ? i.ajusteKcal : 0,
      ultimaRevision: i?.ultimaRevision ?? null,
    });
    if (requiereElegirDificultad(i, nuevo)) return setEligiendo(nuevo);
    p.onGuardar(nuevo);
  };

  return (
    <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
      {eligiendo ? (
        <ElegirDificultadInicial
          perfil={eligiendo}
          nuevo={!i}
          onVolver={() => setEligiendo(null)}
          onElegir={(n) => p.onGuardar({ ...eligiendo, dificultad: n, dificultadConfirmada: true })}
        />
      ) : null}
      <Titulo>{i ? 'Tu perfil' : 'Crea tu plan'}</Titulo>
      {!i ? <Text style={e.sub}>Con estos datos preparo tu semana de entreno, tus calorías y tu proteína.</Text> : null}
      <Opciones titulo="Sexo" valor={sexo} onCambio={setSexo} opciones={[['h', 'Hombre'], ['m', 'Mujer']]} />
      <View style={e.fila}>
        <Dato titulo="Edad" valor={edad} onCambio={setEdad} pista="30" />
        <Dato titulo="Altura (cm)" valor={altura} onCambio={setAltura} pista="175" />
        <Dato titulo="Peso (kg)" valor={peso} onCambio={setPeso} pista="78" />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={e.etiqueta}>¿Qué quieres conseguir? (hasta 2)</Text>
        <View style={e.chips}>
          {(Object.entries(TEXTO_OBJETIVO) as [Objetivo, string][]).map(([o, texto]) => {
            const on = metas.includes(o);
            return (
              <Pressable
                key={o}
                accessibilityRole="button"
                accessibilityLabel={`¿Qué quieres conseguir?: ${texto}`}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setAvisoMetas('');
                  if (on) return metas.length > 1 ? setMetas(metas.filter((x) => x !== o)) : undefined;
                  if (metas.some((x) => incompatibles(x, o))) return setAvisoMetas('Perder grasa y mantenerte se contradicen: elige uno de los dos.');
                  if (metas.length >= 2) return setAvisoMetas('Máximo 2 objetivos: con más a la vez no avanzas bien en ninguno. Quita uno primero.');
                  setMetas([...metas, o]);
                }}
                style={[e.chip, on && { backgroundColor: c.oro }]}
              >
                <Text style={[e.chipTexto, on && { color: c.sobreOro }]}>{texto}</Text>
              </Pressable>
            );
          })}
        </View>
        {avisoMetas ? <Text style={{ color: c.oro, fontSize: tam(15), lineHeight: tam(21) }}>{avisoMetas}</Text> : null}
        {metas.length > 1 ? <Text style={e.sub}>{EXPLICA[[...metas].sort().join('+')] ?? ''}</Text> : null}
      </View>
      <View style={{ gap: 8 }}>
        <Text style={e.etiqueta}>¿Qué días entrenas?</Text>
        <View style={e.chips}>
          {NOMBRE_DIA.map((n, k) => {
            const on = diasSemana.includes(k);
            return (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`Entrenar ${n}`}
                accessibilityState={{ selected: on }}
                onPress={() => setDiasSemana(on ? diasSemana.filter((x) => x !== k) : [...diasSemana, k])}
                style={[e.chip, { paddingHorizontal: 12 }, on && { backgroundColor: c.oro }]}
              >
                <Text style={[e.chipTexto, on && { color: c.sobreOro }]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Opciones titulo="Nivel físico" valor={nivel} onCambio={setNivel} opciones={[['principiante', 'Principiante'], ['intermedio', 'Intermedio'], ['avanzado', 'Avanzado']]} />
      <Text style={e.sub}>Es tu propia valoración. No cambia la dificultad de tus entrenos: esa la eliges tú en Coach o en Rutinas.</Text>
      <Opciones titulo="¿Dónde entrenas?" valor={equipo} onCambio={setEquipo} opciones={[['gym', 'Gimnasio'], ['mancuernas', 'Solo mancuernas'], ['casa', 'En casa, sin material']]} />
      <View style={{ gap: 8 }}>
        <Text style={e.etiqueta}>Zonas que quieres priorizar (hasta 3)</Text>
        <View style={e.chips}>
          {ZONAS.map(([z, texto]) => {
            const on = z === 'ninguno' ? !enfasis.length : enfasis.includes(z);
            return (
              <Pressable
                key={z}
                accessibilityRole="button"
                accessibilityLabel={`Priorizar ${texto}`}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setAvisoZonas('');
                  if (z === 'ninguno') return setEnfasis([]);
                  if (on) return setEnfasis(enfasis.filter((x) => x !== z));
                  if (enfasis.length >= 3) return setAvisoZonas('Máximo 3. Si priorizas todo, no priorizas nada: el plan normal ya trabaja todo el cuerpo por igual.');
                  setEnfasis([...enfasis, z]);
                }}
                style={[e.chip, on && { backgroundColor: c.oro }]}
              >
                <Text style={[e.chipTexto, on && { color: c.sobreOro }]}>{texto}</Text>
              </Pressable>
            );
          })}
        </View>
        {avisoZonas ? <Text style={{ color: c.oro, fontSize: tam(15), lineHeight: tam(21) }}>{avisoZonas}</Text> : null}
        {enfasis.length ? <Text style={e.sub}>Esas zonas llevan una serie más.{enfasis.includes('abdomen') ? ' Abdomen: dos ejercicios cada día. Para que se marque, lo que más cuenta es bajar grasa: la comida pesa más que los abdominales.' : ''}</Text> : null}
      </View>
      {error ? <Text style={{ color: c.rojo, fontSize: tam(15) }}>{error}</Text> : null}
      {i ? <Text style={e.sub}>Si cambias objetivo, días, experiencia, lugar o zona, se rehacen las rutinas del coach.</Text> : null}
      <Pildora texto={i ? 'Guardar' : 'Crear mi plan'} onPress={guardar} />
      {p.onCancelar ? <Pildora texto="Cancelar" tipo="neutro" onPress={p.onCancelar} /> : null}
    </ScrollView>
  );
}

const Dato = (p: { titulo: string; valor: string; onCambio: (v: string) => void; pista: string }) => (
  <View style={{ flex: 1, gap: 6 }}>
    <Text style={e.etiqueta}>{p.titulo}</Text>
    <Campo accessibilityLabel={p.titulo} keyboardType="decimal-pad" placeholder={p.pista} value={p.valor} onChangeText={p.onCambio} style={{ textAlign: 'center' }} />
  </View>
);

export function Coach(p: {
  datos: Datos;
  onPerfil: (x: Perfil) => void;
  onPeso: (kg: number) => void;
  onEmpezar: (r: Rutina) => void;
  onAjustar: (r: ReturnType<typeof ajustarPlan>) => void;
  onRestaurar: (copia: Datos) => void;
  onDescarga: (hasta: number | null) => void;
  onMedida: (zona: string, cm: number) => void;
  onActualizar: (f: (d: Datos) => Datos) => void;
  cuenta?: { email: string | null; estado: EstadoNube; onEntrar: () => void; onSalir: () => void; onBorrar: () => Promise<boolean> } | null;
}) {
  const [copia, setCopia] = useState<Datos | null>(null);
  const [sinGym, setSinGym] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [borrar, setBorrar] = useState<'no' | 'preguntar' | 'borrando' | 'error'>('no');
  const [errorCopia, setErrorCopia] = useState('');
  const [zona, setZona] = useState('Cintura');
  const [medida, setMedida] = useState('');
  const [editando, setEditando] = useState(false);
  const [peso, setPeso] = useState('');
  const [cambios, setCambios] = useState<string[] | null>(null);
  const { datos: d } = p;

  if (!d.perfil || editando)
    return (
      <Formulario
        inicial={d.perfil}
        onCancelar={d.perfil ? () => setEditando(false) : undefined}
        onGuardar={(x) => {
          p.onPerfil(x);
          setEditando(false);
        }}
      />
    );

  const perfil = d.perfil;
  const n = nutricion(perfil);
  const r = revisar(d);
  const plan = d.rutinas.filter((x) => x.deCoach).sort((a, b) => (a.dia ?? 0) - (b.dia ?? 0));
  const lunes = inicioSemana();
  const hoy = diaHoy();
  const ver = (id: string) => !(d.ajustes?.inicio?.ocultas ?? []).includes(id);
  const pesoValido = aNumero(peso) >= 30 && aNumero(peso) <= 250;

  return (
    <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Titulo>Tu coach</Titulo>
          <EtiquetaBeta />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Ajustes y apariencia" onPress={() => setAjustes(true)} hitSlop={8} style={e.engranaje}>
          <Text style={{ fontSize: tam(22) }}>⚙️</Text>
        </Pressable>
      </View>
      {ver('instalar') ? <Instalar /> : null}
      <Tarjeta>
        <Text style={e.grande}>{textoObjetivo(perfil)}</Text>
        <Text style={e.sub}>{perfil.dias} días por semana · {formatoNum(perfil.peso)} kg · IMC {formatoNum(Math.round(n.imc * 10) / 10)}</Text>
        <View style={e.datos}>
          <Cifra valor={String(n.kcal)} texto="kcal al día (media)" />
          <Cifra valor={`${n.proteina} g`} texto="proteína al día" />
        </View>
        {n.aviso ? <Text style={{ color: c.oro, fontSize: tam(15), lineHeight: tam(21) }}>{n.aviso}</Text> : null}
        <Pildora chica tipo="neutro" texto="Editar perfil" onPress={() => setEditando(true)} />
      </Tarjeta>

      {ver('atleta') ? <TarjetaAtleta d={d} onActualizar={p.onActualizar} misiones /> : null}

      {iaActiva && p.cuenta?.email && ver('chat') ? <ChatCoach d={d} /> : null}

      <Text style={e.seccion}>Esta semana</Text>
      {plan.map((x) => {
        const hecha = d.sesiones.some((s) => s.fecha >= lunes && (s.rutinaNombre === x.nombre || s.rutinaNombre.startsWith(`${x.nombre} (`)));
        return (
          <View key={x.id} style={[e.dia, x.dia === hoy && e.diaHoy]}>
            <Text style={[e.diaNombre, x.dia === hoy && { color: c.oro }]}>{NOMBRE_DIA[x.dia ?? 0]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={e.rutina}>{x.nombre}</Text>
              <Text style={e.sub}>{x.ejercicios.length} ejercicios · {x.ejercicios[0]?.reps}–{x.ejercicios[0]?.repsMax} reps</Text>
            </View>
            {hecha ? (
              <Text style={{ color: c.verde, fontSize: tam(15), fontWeight: '800' }}>Hecho ✓</Text>
            ) : (
              <Pildora chica texto="Empezar" tipo={x.dia === hoy ? 'oro' : 'neutro'} onPress={() => p.onEmpezar(x)} />
            )}
          </View>
        );
      })}
      {plan.length && perfil.equipo !== 'casa' ? (
        <Pildora chica tipo="neutro" texto="🏠 Hoy no tengo gym" onPress={() => setSinGym(true)} />
      ) : null}

      {ver('dificultad') ? <TarjetaDificultad d={d} onActualizar={p.onActualizar} onDescarga={p.onDescarga} /> : null}

      {ver('revision') ? (
        <>
      <Text style={e.seccion}>Revisión semanal</Text>
      <Tarjeta>
        <Text style={e.rutina}>Últimos 7 días: {r.hechos} de {r.objetivo} entrenos</Text>
        {dolorReciente(d) ? (
          <Text style={e.sub}>Marcaste molestias hace poco: no te propongo subir pesos ni repeticiones hasta que estés bien.</Text>
        ) : (
          r.suben.map((x) => (
            <Text key={x.nombre} style={e.linea}>
              {x.reps ? `${x.nombre}: intenta ${x.reps} repeticiones` : `Sube ${x.nombre} a ${formatoNum(x.peso)} kg`}
            </Text>
          ))
        )}
        {r.estancados.map((x) => (
          <Text key={x} style={[e.linea, { color: c.rojo }]}>{x} lleva 3 entrenos sin mejorar</Text>
        ))}
        {r.tendencia !== null ? (
          <Text style={e.sub}>Tu peso: {r.tendencia > 0 ? '+' : ''}{formatoNum(Math.round(r.tendencia * 100) / 100)} kg por semana</Text>
        ) : null}
        <Pildora
          texto={r.faltan ? `Próxima revisión en ${r.faltan} ${r.faltan === 1 ? 'día' : 'días'}` : 'Ajustar mi plan'}
          deshabilitado={r.faltan > 0 || !r.hayDatos}
          onPress={() => {
            const a = ajustarPlan(d);
            p.onAjustar(a);
            setCambios(a.cambios);
          }}
        />
        {!r.hayDatos ? <Text style={e.sub}>Disponible cuando guardes tu primer entreno.</Text> : null}
        {r.enDescarga ? (
          <>
            <Text style={e.linea}>Estás en semana de descarga.</Text>
            <Pildora chica tipo="neutro" texto="Terminar descarga" onPress={() => p.onDescarga(null)} />
          </>
        ) : null}
        {r.pideDescarga ? (
          <>
            <Text style={e.sub}>
              {r.semanasSeguidas >= 5
                ? `Llevas ${r.semanasSeguidas} semanas seguidas entrenando duro: te vendría bien recuperar.`
                : 'Varios ejercicios se han estancado: te vendría bien recuperar.'}
            </Text>
            <Pildora chica tipo="neutro" texto="Hacer semana de descarga" onPress={() => p.onDescarga(Date.now() + 7 * 86400000)} />
          </>
        ) : null}
      </Tarjeta>

        </>
      ) : null}

      {ver('peso') ? (
        <>
      <Text style={e.seccion}>Peso corporal</Text>
      <Tarjeta>
        {d.pesos.length ? <Grafica puntos={d.pesos} /> : null}
        <View style={e.fila}>
          <Campo accessibilityLabel="Peso de hoy en kilos" style={{ flex: 1 }} keyboardType="decimal-pad" placeholder="Peso de hoy (kg)" value={peso} onChangeText={setPeso} />
          <Pildora
            chica
            texto="Guardar"
            deshabilitado={!pesoValido}
            onPress={() => {
              p.onPeso(aNumero(peso));
              setPeso('');
            }}
          />
        </View>
      </Tarjeta>

        </>
      ) : null}

      {ver('medidas') ? (
        <>
      <Text style={e.seccion}>Medidas</Text>
      <Tarjeta>
        <View style={e.chips}>
          {['Cintura', 'Pecho', 'Brazo', 'Cadera', 'Muslo'].map((z) => (
            <Pressable
              key={z}
              accessibilityRole="button"
              accessibilityState={{ selected: z === zona }}
              onPress={() => setZona(z)}
              style={[e.chip, z === zona && { backgroundColor: c.oro }]}
            >
              <Text style={[e.chipTexto, z === zona && { color: c.sobreOro }]}>{z}</Text>
            </Pressable>
          ))}
        </View>
        {d.medidas[zona]?.length ? <Grafica puntos={d.medidas[zona]} /> : null}
        <View style={e.fila}>
          <Campo accessibilityLabel={`${zona} en centímetros`} style={{ flex: 1 }} keyboardType="decimal-pad" placeholder={`${zona} (cm)`} value={medida} onChangeText={setMedida} />
          <Pildora
            chica
            texto="Guardar"
            deshabilitado={aNumero(medida) < 20 || aNumero(medida) > 250}
            onPress={() => {
              p.onMedida(zona, aNumero(medida));
              setMedida('');
            }}
          />
        </View>
      </Tarjeta>

        </>
      ) : null}

      {p.cuenta ? (
        <>
          <Text style={e.seccion}>Tu cuenta</Text>
          <Tarjeta>
            {p.cuenta.email ? (
              <>
                <Text style={e.sub}>{p.cuenta.email}</Text>
                <Text style={{ color: p.cuenta.estado === 'sin-conexion' || p.cuenta.estado === 'version-antigua' ? c.oro : c.verde, fontSize: tam(15) }}>
                  {p.cuenta.estado === 'guardado' ? '✓ Datos guardados en la nube' : p.cuenta.estado === 'guardando' ? 'Guardando…' : p.cuenta.estado === 'version-antigua' ? 'Tu cuenta tiene datos de una versión más nueva de FORJA. Recarga la página para actualizar: hasta entonces no se sincroniza.' : 'Sin conexión: se guarda en el móvil y se sube al volver'}
                </Text>
                <Pildora chica tipo="neutro" texto="Cerrar sesión" onPress={p.cuenta.onSalir} />
                <Pildora chica tipo="peligro" texto="Borrar mi cuenta" onPress={() => setBorrar('preguntar')} />
                {borrar === 'error' ? <Text style={{ color: c.rojo, fontSize: tam(15) }}>No se pudo borrar. Revisa tu conexión e inténtalo de nuevo.</Text> : null}
              </>
            ) : (
              <>
                <Text style={e.sub}>Estás usando la app sin cuenta: los datos solo viven en este móvil. Con una cuenta se guardan en la nube, se sincronizan entre tus dispositivos y puedes competir en FORJA Arena con tus amigos.</Text>
                <Pildora chica texto="Crear cuenta o entrar" onPress={p.cuenta.onEntrar} />
              </>
            )}
            <EnlacePrivacidad />
          </Tarjeta>
        </>
      ) : null}

      {Platform.OS === 'web' ? (
        <>
          <Text style={e.seccion}>Copia de seguridad</Text>
          <Tarjeta>
            <Text style={e.sub}>{p.cuenta?.email ? 'Tus datos ya están en la nube. Si quieres, guarda también una copia en Archivos o iCloud.' : 'Tus datos viven en este móvil. Guarda una copia en Archivos o iCloud de vez en cuando.'}</Text>
            <Pildora chica tipo="neutro" texto="Guardar copia" onPress={() => exportarCopia(JSON.stringify(d))} />
            <Pildora
              chica
              tipo="neutro"
              texto="Restaurar copia"
              onPress={async () => {
                setErrorCopia('');
                const f = await elegirArchivo('*/*');
                if (!f) return;
                try {
                  const x = JSON.parse(await f.text());
                  if (!Array.isArray(x.rutinas) || !Array.isArray(x.sesiones)) throw new Error('no válida');
                  setCopia(x);
                } catch {
                  setErrorCopia('Ese archivo no es una copia de Forja.');
                }
              }}
            />
            {errorCopia ? <Text style={{ color: c.rojo, fontSize: tam(15) }}>{errorCopia}</Text> : null}
          </Tarjeta>
        </>
      ) : null}

      {ajustes ? (
        <Ajustes
          d={d}
          onCerrar={() => setAjustes(false)}
          onInicio={(inicio) => p.onActualizar((x) => ({ ...x, ajustes: { ...x.ajustes, inicio } }))}
          onApariencia={(apariencia) => p.onActualizar((x) => ({ ...x, ajustes: { ...x.ajustes, apariencia } }))}
          onRestaurar={p.onRestaurar}
          conCuenta={!!p.cuenta?.email}
          onDatos={p.onActualizar}
        />
      ) : null}

      {sinGym ? (
        <Dialogo titulo="¿Qué tienes hoy?" mensaje="Te cambio la sesión de hoy por una equivalente: mismos músculos, con lo que tengas a mano." si="Cancelar" onSi={() => setSinGym(false)}>
          {(perfil.equipo === 'gym' ? (['mancuernas', 'casa'] as const) : (['casa'] as const)).map((eq) => (
            <Pildora
              key={eq}
              texto={eq === 'mancuernas' ? '🏋️ Tengo mancuernas' : '🏠 Nada, solo mi cuerpo'}
              tipo="neutro"
              onPress={() => {
                const pendientes = plan.filter((x) => !d.sesiones.some((s) => s.fecha >= lunes && s.rutinaNombre.startsWith(x.nombre)));
                const base = plan.find((x) => x.dia === hoy) ?? pendientes.find((x) => (x.dia ?? 0) >= hoy) ?? pendientes[0] ?? plan[0];
                setSinGym(false);
                p.onEmpezar(adaptarRutina(base, eq));
              }}
            />
          ))}
        </Dialogo>
      ) : null}

      {borrar === 'preguntar' || borrar === 'borrando' ? (
        <Dialogo
          titulo="¿Borrar tu cuenta?"
          mensaje="Se borran tu cuenta, tus datos sincronizados, tu Arena y el texto de tus opiniones, y se vacían los datos de la app en este dispositivo. NO se borran solas las capturas que enviaste ni el nombre de los retos que creaste: para las capturas, escríbenos antes (ver Privacidad). No se puede deshacer; si quieres conservar tus datos, guarda antes una copia."
          si={borrar === 'borrando' ? 'Borrando…' : 'Sí, borrar todo'}
          peligro
          no="Cancelar"
          onSi={async () => {
            if (borrar === 'borrando') return;
            setBorrar('borrando');
            setBorrar((await p.cuenta?.onBorrar()) ? 'no' : 'error');
          }}
          onNo={() => setBorrar('no')}
        />
      ) : null}

      {copia ? (
        <Dialogo
          titulo="¿Restaurar esta copia?"
          mensaje="Sustituye tus datos actuales por los de la copia."
          si="Restaurar"
          peligro
          no="Cancelar"
          onSi={() => {
            p.onRestaurar(copia);
            setCopia(null);
          }}
          onNo={() => setCopia(null)}
        />
      ) : null}

      <Text style={e.nota}>Orientación general, no consejo médico. Si tienes una lesión, enfermedad o problema renal, consulta antes a un profesional.</Text>

      {cambios ? (
        <Dialogo titulo="Plan revisado" si="Listo" onSi={() => setCambios(null)}>
          {cambios.map((x) => (
            <Text key={x} style={{ color: c.texto, fontSize: tam(16), lineHeight: tam(22) }}>{x}</Text>
          ))}
        </Dialogo>
      ) : null}
    </ScrollView>
  );
}

const Cifra = ({ valor, texto }: { valor: string; texto: string }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={e.valor}>{valor}</Text>
    <Text style={e.sub}>{texto}</Text>
  </View>
);

const e = StyleSheet.create({
  engranaje: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.campo, alignItems: 'center', justifyContent: 'center' },
  pagina: { padding: 16, gap: 14, paddingBottom: 32 },
  sub: { color: c.suave, fontSize: tam(14), lineHeight: tam(20) },
  etiqueta: { color: c.texto, fontSize: tam(15), fontWeight: '700' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: c.campo, borderRadius: 999, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  chipTexto: { color: c.texto, fontSize: tam(15), fontWeight: '700' },
  grande: { color: c.texto, fontSize: tam(24), fontWeight: '900' },
  datos: { flexDirection: 'row', marginVertical: 6 },
  valor: { color: c.oro, fontSize: tam(28), fontWeight: '900' },
  seccion: { color: c.texto, fontSize: tam(21), fontWeight: '900', marginTop: 6 },
  dia: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.tarjeta, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: 'transparent' },
  diaHoy: { borderColor: c.oro },
  diaNombre: { color: c.suave, width: tam(40), fontSize: tam(15), fontWeight: '800' },
  rutina: { color: c.texto, fontSize: tam(17), fontWeight: '800' },
  linea: { color: c.verde, fontSize: tam(15), lineHeight: tam(21), fontWeight: '700' },
  nota: { color: c.suave, fontSize: tam(13), lineHeight: tam(18) },
});
