import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { fijarPropios } from './src/alimentos';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import { Datos, Perfil, Rutina, cargar, cerrarActivo, claveDia, datosIniciales, formatoNum, guardar, iniciarActivo, pesoMaximo, ultimaVez } from './src/datos';
import { EstadoNube, alCambiarEstado, cargarNube, eligioSinCuenta, guardarNube, nubeActiva, sb, usarSinCuenta, usuarioActual } from './src/nube';
import { Cuenta } from './src/Cuenta';
import { generarPlan } from './src/reglas';
import { Coach } from './src/Coach';
import { Comida } from './src/Comida';
import { Entreno } from './src/Entreno';
import { Progreso } from './src/Progreso';
import { Rutinas } from './src/Rutinas';
import { Dialogo, c } from './src/ui';

const DUENO = 'mi-gym:dueno';

type Resumen = { minutos: number; series: number; kilos: number; records: string[] };

export default function App() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [pestana, setPestana] = useState<'coach' | 'rutinas' | 'comida' | 'progreso'>('coach');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [usuario, setUsuario] = useState<User | null>(null);
  const [pantallaCuenta, setPantallaCuenta] = useState<null | 'entrar' | 'nueva'>(null);
  const [estadoNube, setEstadoNube] = useState<EstadoNube>('guardado');

  // Al entrar: si la nube tiene datos, mandan; si está vacía, se suben los del móvil
  // (solo si no eran de otra cuenta).
  const entrar = async (u: User) => {
    setPantallaCuenta(null);
    setUsuario(u);
    const local = await cargar();
    const dueno = await AsyncStorage.getItem(DUENO);
    const nube = await cargarNube(u.id);
    if (nube === 'error') {
      setEstadoNube('sin-conexion');
      setDatos(dueno === u.id ? local : datosIniciales());
    } else if (nube) {
      setDatos({ ...datosIniciales(), ...nube, activo: dueno === u.id ? local.activo : null });
    } else {
      const base = !dueno || dueno === u.id ? local : datosIniciales();
      setDatos(base);
      guardarNube(u.id, base);
    }
    await AsyncStorage.setItem(DUENO, u.id);
    await usarSinCuenta(false);
  };

  const salir = async () => {
    await sb?.auth.signOut();
    await AsyncStorage.removeItem(DUENO);
    const vacio = datosIniciales();
    await guardar(vacio);
    setUsuario(null);
    setDatos(vacio);
    setPantallaCuenta('entrar');
  };

  useEffect(() => {
    alCambiarEstado(setEstadoNube);
    (async () => {
      const u = nubeActiva ? await usuarioActual() : null;
      if (u) return entrar(u);
      const local = await cargar();
      setDatos(local);
      if (nubeActiva && !(await eligioSinCuenta())) setPantallaCuenta('entrar');
    })();
    const sub = sb?.auth.onAuthStateChange((ev) => {
      if (ev === 'PASSWORD_RECOVERY') setPantallaCuenta('nueva');
    });
    if (Platform.OS === 'web' && !__DEV__) {
      navigator.serviceWorker?.register('sw.js').catch(() => {});
      navigator.storage?.persist?.().catch(() => {});
    }
    return () => sub?.data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!datos) return;
    guardar(datos);
    if (usuario) guardarNube(usuario.id, datos);
  }, [datos]);

  if (pantallaCuenta)
    return (
      <SafeAreaView style={e.raiz}>
        <StatusBar style="light" />
        <Cuenta
          modoInicial={pantallaCuenta}
          onListo={entrar}
          onSinCuenta={pantallaCuenta === 'entrar' ? () => { usarSinCuenta(true); setPantallaCuenta(null); } : undefined}
        />
      </SafeAreaView>
    );

  if (!datos)
    return (
      <View style={[e.raiz, { justifyContent: 'center' }]}>
        <ActivityIndicator color={c.oro} size="large" />
      </View>
    );

  fijarPropios(datos.misAlimentos);

  const conPeso = (d: Datos, kg: number): Datos['pesos'] => {
    const hoy = claveDia();
    return [...d.pesos.filter((x) => claveDia(x.fecha) !== hoy), { fecha: Date.now(), max: kg }];
  };

  const guardarPerfil = (x: Perfil) => {
    const a = datos.perfil;
    const rehacer =
      !a || a.objetivo !== x.objetivo || [...(a.diasSemana ?? [])].sort().join() !== [...x.diasSemana].sort().join() || a.nivel !== x.nivel || a.equipo !== x.equipo || a.enfasis !== x.enfasis;
    setDatos({
      ...datos,
      perfil: x,
      pesos: a?.peso === x.peso ? datos.pesos : conPeso(datos, x.peso),
      rutinas: rehacer
        ? [...generarPlan(x), ...datos.rutinas.filter((r) => !r.deCoach && !r.ejemplo)]
        : datos.rutinas,
    });
  };

  const empezar = (r: Rutina) =>
    setDatos({ ...datos, activo: iniciarActivo(r, datos.sesiones, (datos.perfil?.descargaHasta ?? 0) > Date.now()) });

  const terminar = () => {
    if (!datos.activo) return;
    const sesion = cerrarActivo(datos.activo);
    const todas = sesion.ejercicios.flatMap((x) => x.series);
    const records = sesion.ejercicios
      .filter((x) => {
        const antes = datos.sesiones.flatMap((s) =>
          s.ejercicios.filter((y) => y.nombre.trim().toLowerCase() === x.nombre.trim().toLowerCase()).flatMap((y) => y.series),
        );
        return ultimaVez(datos.sesiones, x.nombre).length > 0 && pesoMaximo(x.series) > pesoMaximo(antes);
      })
      .map((x) => `${x.nombre}: ${formatoNum(pesoMaximo(x.series))} kg`);
    setResumen({
      minutos: sesion.minutos,
      series: todas.length,
      kilos: todas.reduce((n, s) => n + s.peso * s.reps, 0),
      records,
    });
    setDatos({ ...datos, activo: null, sesiones: [sesion, ...datos.sesiones] });
    setPestana('progreso');
  };

  return (
    <SafeAreaView style={e.raiz}>
      <StatusBar style="light" />
      {datos.activo ? (
        <Entreno
          activo={datos.activo}
          perfil={datos.perfil}
          sesiones={datos.sesiones}
          descanso={datos.descanso}
          onCambio={(activo) => setDatos((d) => (d ? { ...d, activo } : d))}
          onDescanso={(descanso) => setDatos((d) => (d ? { ...d, descanso } : d))}
          onTerminar={terminar}
          onDescartar={() => setDatos({ ...datos, activo: null })}
        />
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {pestana === 'coach' ? (
              <Coach
                datos={datos}
                cuenta={nubeActiva ? { email: usuario?.email ?? null, estado: estadoNube, onEntrar: () => setPantallaCuenta('entrar'), onSalir: salir } : null}
                onPerfil={guardarPerfil}
                onPeso={(kg) =>
                  setDatos({ ...datos, pesos: conPeso(datos, kg), perfil: datos.perfil ? { ...datos.perfil, peso: kg } : null })
                }
                onEmpezar={empezar}
                onAjustar={(a) => setDatos({ ...datos, rutinas: a.rutinas, perfil: a.perfil })}
                onRestaurar={(copia) => setDatos({ ...datos, ...copia, activo: null })}
                onDescarga={(hasta) => setDatos({ ...datos, perfil: datos.perfil ? { ...datos.perfil, descargaHasta: hasta } : null })}
                onMedida={(zona, cm) => {
                  const hoy = claveDia();
                  const previas = (datos.medidas[zona] ?? []).filter((x) => claveDia(x.fecha) !== hoy);
                  setDatos({ ...datos, medidas: { ...datos.medidas, [zona]: [...previas, { fecha: Date.now(), max: cm }] } });
                }}
              />
            ) : pestana === 'comida' ? (
              <Comida
                datos={datos}
                onCambio={(dia, items) => setDatos({ ...datos, comida: { ...datos.comida, [dia]: items } })}
                onActualizar={(f) => setDatos((d) => (d ? f(d) : d))}
              />
            ) : pestana === 'rutinas' ? (
              <Rutinas
                rutinas={datos.rutinas}
                onEmpezar={empezar}
                onGuardar={(r) =>
                  setDatos({
                    ...datos,
                    rutinas: datos.rutinas.some((x) => x.id === r.id)
                      ? datos.rutinas.map((x) => (x.id === r.id ? { ...r, ejemplo: undefined } : x))
                      : [...datos.rutinas, r],
                  })
                }
                onBorrar={(id) => setDatos({ ...datos, rutinas: datos.rutinas.filter((x) => x.id !== id) })}
              />
            ) : (
              <Progreso
                sesiones={datos.sesiones}
                onBorrar={(id) => setDatos({ ...datos, sesiones: datos.sesiones.filter((x) => x.id !== id) })}
              />
            )}
          </View>
          <View style={e.pestanas} accessibilityRole="tablist">
            <Pestana texto="Coach" activa={pestana === 'coach'} onPress={() => setPestana('coach')} />
            <Pestana texto="Rutinas" activa={pestana === 'rutinas'} onPress={() => setPestana('rutinas')} />
            <Pestana texto="Comida" activa={pestana === 'comida'} onPress={() => setPestana('comida')} />
            <Pestana texto="Progreso" activa={pestana === 'progreso'} onPress={() => setPestana('progreso')} />
          </View>
        </>
      )}
      {resumen ? (
        <Dialogo titulo="¡Entreno guardado!" si="Listo" onSi={() => setResumen(null)}>
          <Text style={e.resumen}>
            {resumen.minutos} min · {resumen.series} {resumen.series === 1 ? 'serie' : 'series'} ·{formatoNum(resumen.kilos)} kg levantados
          </Text>
          {resumen.records.map((r) => (
            <Text key={r} style={e.record}>Nuevo récord · {r}</Text>
          ))}
        </Dialogo>
      ) : null}
    </SafeAreaView>
  );
}

const Pestana = ({ texto, activa, onPress }: { texto: string; activa: boolean; onPress: () => void }) => (
  <Pressable
    accessibilityRole="tab"
    accessibilityState={{ selected: activa }}
    onPress={onPress}
    style={[e.pestana, activa && { backgroundColor: c.oro }]}
  >
    <Text style={[e.pestanaTexto, activa && { color: c.sobreOro }]}>{texto}</Text>
  </Pressable>
);

const e = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.fondo },
  pestanas: { flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.borde },
  pestana: { flex: 1, minHeight: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  pestanaTexto: { color: c.suave, fontSize: 14, fontWeight: '800' },
  resumen: { color: c.suave, fontSize: 16, lineHeight: 22 },
  record: { color: c.oro, fontSize: 16, fontWeight: '800' },
});
