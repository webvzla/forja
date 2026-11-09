import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { elegirArchivo, exportarCopia } from './web';
import { Datos, Enfasis, Equipo, Nivel, Objetivo, Perfil, Rutina, aNumero, formatoNum } from './datos';
import { NOMBRE_DIA, ajustarPlan, diaHoy, inicioSemana, nutricion, revisar } from './reglas';
import { Grafica } from './Progreso';
import { Campo, Dialogo, Pildora, Tarjeta, Titulo, c } from './ui';

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

const TEXTO_OBJETIVO: Record<Objetivo, string> = {
  grasa: 'Perder grasa',
  musculo: 'Ganar músculo',
  fuerza: 'Ganar fuerza',
  mantener: 'Mantenerme',
};

function Formulario(p: { inicial: Perfil | null; onGuardar: (x: Perfil) => void; onCancelar?: () => void }) {
  const i = p.inicial;
  const [sexo, setSexo] = useState<'h' | 'm'>(i?.sexo ?? 'h');
  const [edad, setEdad] = useState(i ? String(i.edad) : '');
  const [altura, setAltura] = useState(i ? String(i.altura) : '');
  const [peso, setPeso] = useState(i ? formatoNum(i.peso) : '');
  const [objetivo, setObjetivo] = useState<Objetivo>(i?.objetivo ?? 'musculo');
  const [diasSemana, setDiasSemana] = useState<number[]>(i?.diasSemana ?? [0, 1, 3, 4]);
  const [nivel, setNivel] = useState<Nivel>(i?.nivel ?? 'principiante');
  const [equipo, setEquipo] = useState<Equipo>(i?.equipo ?? 'gym');
  const [enfasis, setEnfasis] = useState<Enfasis>(i?.enfasis ?? 'ninguno');
  const [error, setError] = useState('');

  const guardar = () => {
    const ed = aNumero(edad);
    const al = aNumero(altura);
    const pe = aNumero(peso);
    if (ed < 14 || ed > 100) return setError('Pon una edad entre 14 y 100 años.');
    if (al < 120 || al > 230) return setError('Pon tu altura en centímetros, por ejemplo 175.');
    if (pe < 30 || pe > 250) return setError('Pon tu peso en kilos, por ejemplo 78.');
    if (diasSemana.length < 2 || diasSemana.length > 6) return setError('Elige entre 2 y 6 días para entrenar.');
    p.onGuardar({
      sexo, edad: Math.round(ed), altura: Math.round(al), peso: pe, objetivo, dias: diasSemana.length, diasSemana, nivel, equipo, enfasis,
      descargaHasta: i?.descargaHasta ?? null,
      ajusteKcal: i?.objetivo === objetivo ? i.ajusteKcal : 0,
      ultimaRevision: i?.ultimaRevision ?? null,
    });
  };

  return (
    <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
      <Titulo>{i ? 'Tu perfil' : 'Crea tu plan'}</Titulo>
      {!i ? <Text style={e.sub}>Con estos datos preparo tu semana de entreno, tus calorías y tu proteína.</Text> : null}
      <Opciones titulo="Sexo" valor={sexo} onCambio={setSexo} opciones={[['h', 'Hombre'], ['m', 'Mujer']]} />
      <View style={e.fila}>
        <Dato titulo="Edad" valor={edad} onCambio={setEdad} pista="30" />
        <Dato titulo="Altura (cm)" valor={altura} onCambio={setAltura} pista="175" />
        <Dato titulo="Peso (kg)" valor={peso} onCambio={setPeso} pista="78" />
      </View>
      <Opciones titulo="¿Qué quieres conseguir?" valor={objetivo} onCambio={setObjetivo} opciones={Object.entries(TEXTO_OBJETIVO) as [Objetivo, string][]} />
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
      <Opciones titulo="Experiencia" valor={nivel} onCambio={setNivel} opciones={[['principiante', 'Principiante'], ['intermedio', 'Intermedio'], ['avanzado', 'Avanzado']]} />
      <Opciones titulo="¿Dónde entrenas?" valor={equipo} onCambio={setEquipo} opciones={[['gym', 'Gimnasio'], ['mancuernas', 'Solo mancuernas'], ['casa', 'En casa, sin material']]} />
      <Opciones titulo="Zona que quieres priorizar" valor={enfasis} onCambio={setEnfasis} opciones={[['ninguno', 'Ninguna'], ['pecho', 'Pecho'], ['espalda', 'Espalda'], ['pierna', 'Pierna'], ['gluteo', 'Glúteo'], ['brazos', 'Brazos']]} />
      {error ? <Text style={{ color: c.rojo, fontSize: 15 }}>{error}</Text> : null}
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
}) {
  const [copia, setCopia] = useState<Datos | null>(null);
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
  const pesoValido = aNumero(peso) >= 30 && aNumero(peso) <= 250;

  return (
    <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
      <Titulo>Tu coach</Titulo>
      <Tarjeta>
        <Text style={e.grande}>{TEXTO_OBJETIVO[perfil.objetivo]}</Text>
        <Text style={e.sub}>{perfil.dias} días por semana · {formatoNum(perfil.peso)} kg · IMC {formatoNum(Math.round(n.imc * 10) / 10)}</Text>
        <View style={e.datos}>
          <Cifra valor={String(n.kcal)} texto="kcal al día" />
          <Cifra valor={`${n.proteina} g`} texto="proteína al día" />
        </View>
        {n.aviso ? <Text style={{ color: c.oro, fontSize: 15, lineHeight: 21 }}>{n.aviso}</Text> : null}
        <Pildora chica tipo="neutro" texto="Editar perfil" onPress={() => setEditando(true)} />
      </Tarjeta>

      <Text style={e.seccion}>Esta semana</Text>
      {plan.map((x) => {
        const hecha = d.sesiones.some((s) => s.fecha >= lunes && s.rutinaNombre === x.nombre);
        return (
          <View key={x.id} style={[e.dia, x.dia === hoy && e.diaHoy]}>
            <Text style={[e.diaNombre, x.dia === hoy && { color: c.oro }]}>{NOMBRE_DIA[x.dia ?? 0]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={e.rutina}>{x.nombre}</Text>
              <Text style={e.sub}>{x.ejercicios.length} ejercicios · {x.ejercicios[0]?.reps}–{x.ejercicios[0]?.repsMax} reps</Text>
            </View>
            {hecha ? (
              <Text style={{ color: c.verde, fontSize: 15, fontWeight: '800' }}>Hecho ✓</Text>
            ) : (
              <Pildora chica texto="Empezar" tipo={x.dia === hoy ? 'oro' : 'neutro'} onPress={() => p.onEmpezar(x)} />
            )}
          </View>
        );
      })}

      <Text style={e.seccion}>Revisión semanal</Text>
      <Tarjeta>
        <Text style={e.rutina}>Últimos 7 días: {r.hechos} de {r.objetivo} entrenos</Text>
        {r.suben.map((x) => (
          <Text key={x.nombre} style={e.linea}>
            {x.reps ? `${x.nombre}: intenta ${x.reps} repeticiones` : `Sube ${x.nombre} a ${formatoNum(x.peso)} kg`}
          </Text>
        ))}
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

      {Platform.OS === 'web' ? (
        <>
          <Text style={e.seccion}>Copia de seguridad</Text>
          <Tarjeta>
            <Text style={e.sub}>Tus datos viven en este móvil. Guarda una copia en Archivos o iCloud de vez en cuando.</Text>
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
                  setErrorCopia('Ese archivo no es una copia de Mi Gym.');
                }
              }}
            />
            {errorCopia ? <Text style={{ color: c.rojo, fontSize: 15 }}>{errorCopia}</Text> : null}
          </Tarjeta>
        </>
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
            <Text key={x} style={{ color: c.texto, fontSize: 16, lineHeight: 22 }}>{x}</Text>
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
  pagina: { padding: 16, gap: 14, paddingBottom: 32 },
  sub: { color: c.suave, fontSize: 14, lineHeight: 20 },
  etiqueta: { color: c.texto, fontSize: 15, fontWeight: '700' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: c.campo, borderRadius: 999, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  chipTexto: { color: c.texto, fontSize: 15, fontWeight: '700' },
  grande: { color: c.texto, fontSize: 24, fontWeight: '900' },
  datos: { flexDirection: 'row', marginVertical: 6 },
  valor: { color: c.oro, fontSize: 28, fontWeight: '900' },
  seccion: { color: c.texto, fontSize: 21, fontWeight: '900', marginTop: 6 },
  dia: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.tarjeta, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: 'transparent' },
  diaHoy: { borderColor: c.oro },
  diaNombre: { color: c.suave, width: 38, fontSize: 15, fontWeight: '800' },
  rutina: { color: c.texto, fontSize: 17, fontWeight: '800' },
  linea: { color: c.verde, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  nota: { color: c.suave, fontSize: 13, lineHeight: 18 },
});
