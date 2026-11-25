// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { fijarPropios } from './src/alimentos';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import { Datos, Nivel3, Perfil, Rutina, bienvenidaBeta, cargar, cerrarActivo, copiaPreBeta, marcarBienvenidaVista, claveDia, datosIniciales, formatoNum, guardar, iniciarActivo, pesoMaximo, ultimaVez } from './src/datos';
import { EstadoNube, alCambiarEstado, alFusionarProgreso, borrarCuenta, cargarNube, eligioSinCuenta, guardarNube, nubeActiva, olvidarSincronizacion, sb, sincronizarAhora, usarSinCuenta, usuarioActual, volcarYa } from './src/nube';
import { esVacio, esquemaMasNuevo, fusionarDatos, registrarCambios } from './src/fusion';
import { claveRetirada, conservarDecision, decisionSensaciones, fijarSensaciones, hayRespuestasSinConsentimiento, marcarPermiso, prepararAlEntrar, quitarSensaciones, respuestasGuardadas, sensacionesPermitidas, sinConsentimientoAjeno, sinRespuestasNoPermitidas } from './src/consentimientos';
import { Cuenta } from './src/Cuenta';
import { iniciarCola, misLogros, programarSincronizacion } from './src/servidorArena';
import { aplicarRetosServidor, fusionarProgreso, mismoContenido, normalizarLibro } from './src/sincronizacion';
import { capturarInvitacion, olvidarInvitacion } from './src/invitaciones';
import { Arena } from './src/Arena';
import { DEMO } from './src/config';
import { datosDemo } from './src/demo';
import { apariencia, guardarApariencia, mismaApariencia } from './src/tema';
import { CompartirSemana, Estadisticas, MapaMuscular, NuevasMedallas } from './src/Extras';
import { Medalla, medallas } from './src/calculos';
import { generarPlan, planCambia, rutinasTrasRehacer } from './src/reglas';
import { dolorReciente } from './src/adaptacion';
import { Coach } from './src/Coach';
import { Comida } from './src/Comida';
import { Entreno } from './src/Entreno';
import { Progreso } from './src/Progreso';
import { TarjetaAtleta } from './src/Atleta';
import { ResumenSensaciones, SensacionTrasEntreno } from './src/Dificultad';
import { calcularXp } from './src/xp';
import { Rutinas } from './src/Rutinas';
import { Dialogo, c, tam } from './src/ui';
import { Bienvenida, BannerVersion } from './src/Beta';
import { EstadoVersion, comprobarVersion } from './src/version';
import { exportarCopia } from './src/web';

const DUENO = 'mi-gym:dueno';

type Resumen = { id: string; minutos: number; series: number; kilos: number; records: string[] };

export default function App() {
  const [datos, setDatosCrudo] = useState<Datos | null>(null);
  // Todo cambio que hace la persona pasa por aquí: se anota qué cambió (marcas y lápidas, ver fusion.ts) para poder
  // fusionar con otros dispositivos sin perder nada. Lo que llega de fuera (nube, otro dispositivo) usa `setDatosCrudo`.
  const setDatos = useCallback((x: Datos | null | ((d: Datos | null) => Datos | null)) => {
    setDatosCrudo((prev) => {
      const n = typeof x === 'function' ? x(prev) : x;
      return prev && n && prev !== n ? registrarCambios(prev, n) : n;
    });
  }, []);
  // Datos de este dispositivo que no son de la cuenta que acaba de entrar: se ofrece importarlos (nunca se mezclan solos).
  const [importar, setImportar] = useState<Datos | null>(null);
  // Mientras se decide qué hacer con respuestas de «cómo ha ido / me dolió algo» que no tienen consentimiento, no se sube ni se sincroniza nada.
  const [decidiendoSens, setDecidiendoSens] = useState(false);
  const [preguntaSens, setPreguntaSens] = useState<{ n: number; resolver: (activar: boolean) => void } | null>(null);
  const [bienvenida, setBienvenida] = useState<{ conDatos: boolean } | null>(null);
  const [version, setVersion] = useState<EstadoVersion | null>(null);
  const [pestana, setPestana] = useState<'coach' | 'rutinas' | 'comida' | 'arena' | 'progreso'>('coach');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [usuario, setUsuario] = useState<User | null>(null);
  const [pantallaCuenta, setPantallaCuenta] = useState<null | 'entrar' | 'registro' | 'nueva'>(null);
  // Código de un enlace de invitación (?amigo=FORJA-XXXXXX) pendiente de aceptar.
  const [invitacion, setInvitacion] = useState<string | null>(null);
  const [estadoNube, setEstadoNube] = useState<EstadoNube>('guardado');
  const [animo, setAnimo] = useState<{ rutina: Rutina; sueno: Nivel3; energia: Nivel3 } | null>(null);

  // Al entrar, los datos de este dispositivo y los de la nube se FUSIONAN (nada se pierde de ninguno). Si el dispositivo
  // tenía datos de OTRA cuenta, no se mezclan: se pregunta si importarlos.
  const entrar = async (u: User) => {
    setPantallaCuenta(null);
    setDecidiendoSens(true);
    setUsuario(u);
    iniciarCola(u.id);
    const local = await cargar();
    const dueno = await AsyncStorage.getItem(DUENO);
    const propios = !dueno || dueno === u.id;
    const nube = await cargarNube(u.id);
    const ofrecer = !propios && !esVacio(local) ? local : null;
    let final: Datos;
    let subirAhora = false;
    if (nube === 'error') {
      setEstadoNube('sin-conexion');
      final = propios ? local : datosIniciales();
    } else if (nube) {
      if (esquemaMasNuevo(nube)) {
        // La nube tiene datos de una versión más nueva de FORJA: no se toca nada hasta que actualices la app.
        setEstadoNube('version-antigua');
        final = propios ? local : datosIniciales();
      } else {
        const base: Datos = { ...datosIniciales(), ...nube, activo: propios ? local.activo : null };
        final = propios && !esVacio(local) ? fusionarDatos(base, local) : base;
        // La apariencia elegida en otro dispositivo se aplica aquí también.
        const ap = nube.ajustes?.apariencia;
        if (ap && !mismaApariencia(ap, apariencia)) guardarApariencia(ap);
      }
    } else {
      final = propios ? local : datosIniciales();
      subirAhora = true;
    }
    // Consentimiento de «cómo ha ido / me dolió algo»: con cuenta, sin consentimiento no puede haber respuestas guardadas ni subirse.
    const retirada = Number(await AsyncStorage.getItem(claveRetirada(u.id)).catch(() => null));
    let d = prepararAlEntrar(final, { local, propios, nubeLeida: nube !== 'error' && !(nube && esquemaMasNuevo(nube)), metadatos: u.user_metadata, retirada });
    if (hayRespuestasSinConsentimiento(d, true)) {
      const n = respuestasGuardadas(d);
      const activar = await new Promise<boolean>((resolver) => setPreguntaSens({ n, resolver }));
      d = activar ? fijarSensaciones(d, true) : quitarSensaciones(fijarSensaciones(d, false));
    }
    if (d !== final) d = registrarCambios(final, d);
    setDatosCrudo(d);
    if (subirAhora) guardarNube(u.id, d);
    setDecidiendoSens(false);
    if (ofrecer) setImportar(ofrecer);
    await AsyncStorage.setItem(DUENO, u.id);
    await usarSinCuenta(false);
  };

  const salir = async (borrar = false) => {
    // Lo último que hiciste (y tu progreso) se sube antes de cerrar la sesión: al volver a entrar sigue ahí.
    if (!borrar) await volcarYa().catch(() => {});
    if (borrar) {
      if (!(await borrarCuenta())) return false;
      if (usuario) await AsyncStorage.removeItem(claveRetirada(usuario.id)).catch(() => {});
    } else await sb?.auth.signOut();
    await AsyncStorage.removeItem(DUENO);
    iniciarCola(null);
    olvidarSincronizacion();
    const vacio = datosIniciales();
    await guardar(vacio);
    setUsuario(null);
    setDatosCrudo(vacio);
    setPantallaCuenta('entrar');
    return true;
  };

  useEffect(() => {
    alCambiarEstado(setEstadoNube);
    (async () => {
      const inv = nubeActiva && !DEMO ? await capturarInvitacion() : null;
      setInvitacion(inv);
      if (inv) setPestana('arena');
      const u = nubeActiva ? await usuarioActual() : null;
      if (u) return entrar(u);
      const local = await cargar();
      setDatosCrudo(DEMO && !local.perfil ? datosDemo() : local);
      // Quien llega con una invitación casi siempre es nuevo: se le propone crear la cuenta.
      if (nubeActiva && !DEMO && (inv || !(await eligioSinCuenta()))) setPantallaCuenta(inv ? 'registro' : 'entrar');
    })();
    const sub = sb?.auth.onAuthStateChange((ev) => {
      if (ev === 'PASSWORD_RECOVERY') setPantallaCuenta('nueva');
    });
    if (Platform.OS === 'web' && !__DEV__ && !DEMO) {
      navigator.serviceWorker?.register('sw.js').catch(() => {});
      navigator.storage?.persist?.().catch(() => {});
    }
    return () => sub?.data.subscription.unsubscribe();
  }, []);

  // Bienvenida a la beta (una sola vez por dispositivo) y aviso de «hay una versión nueva» (solo en la web publicada).
  const hayDatos0 = datos !== null;
  useEffect(() => {
    if (!hayDatos0 || DEMO) return;
    bienvenidaBeta().then(setBienvenida);
  }, [hayDatos0]);
  useEffect(() => {
    if (Platform.OS !== 'web' || __DEV__ || DEMO || typeof document === 'undefined') return;
    const mirar = () => comprobarVersion().then((v) => v.hayNueva && setVersion(v));
    void mirar();
    const alVolver = () => document.visibilityState === 'visible' && void mirar();
    document.addEventListener('visibilitychange', alVolver);
    const t = setInterval(mirar, 30 * 60000);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      clearInterval(t);
    };
  }, []);

  // Medallas recién conseguidas: se calculan al dibujar y se avisan una vez (al cerrar el aviso quedan como vistas).
  const nuevas: Medalla[] = useMemo(() => {
    if (!datos || datos.activo) return [];
    const vistas = datos.medallasVistas ?? [];
    return medallas(datos).filter((m) => m.hecho && !vistas.includes(m.id));
  }, [datos]);

  useEffect(() => {
    if (!datos) return;
    guardar(datos);
    if (usuario && !decidiendoSens) {
      // La retirada se anota también aparte: si se cierra sesión sin que llegue a la nube, sigue valiendo al volver a entrar.
      const retirado = decisionSensaciones(datos)?.retirado;
      if (retirado) AsyncStorage.setItem(claveRetirada(usuario.id), String(retirado)).catch(() => {});
      guardarNube(usuario.id, datos);
      programarSincronizacion(datos); // solo hechos; los puntos los calcula el servidor
    }
  }, [datos, decidiendoSens]);

  // Con cuenta y sin consentimiento no se guardan respuestas de «cómo ha ido / me dolió algo»: si llegan (p. ej. de otro dispositivo que
  // todavía no sabía que se retiró el consentimiento), se borran. El borrado es una edición normal: se propaga a la nube y al resto.
  useEffect(() => {
    if (!datos || !usuario || decidiendoSens) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sinRespuestasNoPermitidas(datos) !== datos) setDatos((x) => (x ? sinRespuestasNoPermitidas(x) : x));
  }, [datos, usuario, decidiendoSens, setDatos]);

  // Lo de otros dispositivos descubierto al subir o al sincronizar se incorpora (todos los datos, no solo el XP).
  useEffect(() => {
    alFusionarProgreso((m) => setDatosCrudo((d) => (d ? fusionarDatos(d, m) : d)));
  }, []);

  // Con cuenta: al volver a la app, al recuperar la conexión y cada pocos minutos se traen los cambios de otros dispositivos.
  useEffect(() => {
    const uid = usuario?.id;
    if (!uid || decidiendoSens || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const traer = () => {
      if (document.visibilityState === 'visible') void sincronizarAhora(uid).catch(() => {});
    };
    document.addEventListener('visibilitychange', traer);
    window.addEventListener('online', traer);
    const t = setInterval(traer, 180000);
    return () => {
      document.removeEventListener('visibilitychange', traer);
      window.removeEventListener('online', traer);
      clearInterval(t);
    };
  }, [usuario, decidiendoSens]);

  // Retos: solo el servidor sabe cuáles has completado. Se lee su cantidad por semana (solo lectura, función
  // `mis_logros` que ya existe) como máximo cada 10 minutos y se guarda como máximo visto: repetir no suma.
  const uidActual = useRef<string | null>(null);
  const ultimaLecturaRetos = useRef(0);
  useEffect(() => {
    uidActual.current = usuario?.id ?? null;
    ultimaLecturaRetos.current = 0;
  }, [usuario]);
  const hayDatos = datos !== null;
  useEffect(() => {
    const uid = usuario?.id;
    if (!uid || !hayDatos || DEMO || Date.now() - ultimaLecturaRetos.current < 600000) return;
    ultimaLecturaRetos.current = Date.now();
    misLogros()
      .then((r) => {
        if (uidActual.current !== uid) return; // se cerró la sesión o cambió la cuenta mientras tanto
        setDatosCrudo((d) => {
          if (!d) return d;
          const libro = aplicarRetosServidor(d.ajustes?.xp, r);
          return mismoContenido(libro, normalizarLibro(d.ajustes?.xp)) ? d : { ...d, ajustes: { ...d.ajustes, xp: libro } };
        });
      })
      .catch(() => {
        ultimaLecturaRetos.current = 0; // sin conexión: se reintenta en el próximo cambio de pestaña
      });
  }, [usuario, pestana, hayDatos]);

  // XP: las semanas que terminan se cierran una sola vez (no se recalculan al cambiar tus días objetivo).
  useEffect(() => {
    if (!datos || datos.activo) return;
    const est = calcularXp(datos);
    // Se vuelve a ejecutar una vez y se detiene: tras guardar el libro, `nuevo` pasa a ser false.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (est?.nuevo) setDatosCrudo((d) => (d ? { ...d, ajustes: { ...d.ajustes, xp: est.libro } } : d));
  }, [datos]);

  if (pantallaCuenta)
    return (
      <SafeAreaView style={e.raiz}>
        <StatusBar style={c.oscuro ? 'light' : 'dark'} />
        <Cuenta
          modoInicial={pantallaCuenta}
          invitacion={invitacion}
          onListo={entrar}
          onSinCuenta={pantallaCuenta === 'entrar' || pantallaCuenta === 'registro' ? () => { usarSinCuenta(true); setPantallaCuenta(null); } : undefined}
        />
      </SafeAreaView>
    );

  const dialogoSens = preguntaSens ? (
    <Dialogo
      titulo="Tus respuestas sobre cómo te sientan los entrenos"
      si="Activar y guardarlas en mi cuenta"
      no="Quitarlas de este dispositivo"
      onSi={() => { preguntaSens.resolver(true); setPreguntaSens(null); }}
      onNo={() => { preguntaSens.resolver(false); setPreguntaSens(null); }}
    >
      <Text style={e.resumen}>
        Este dispositivo tiene respuestas guardadas de «¿Cómo ha ido?» y «Me dolió algo» ({preguntaSens.n} {preguntaSens.n === 1 ? 'entreno' : 'entrenos'}). Sin tu consentimiento no se suben a tu cuenta. Puedes activar la opción (es opcional y puedes retirarla en Ajustes → Privacidad) o quitarlas de este dispositivo. Si las quitas, siguen en la copia previa a la beta de este dispositivo.
      </Text>
    </Dialogo>
  ) : null;

  if (!datos)
    return (
      <View style={[e.raiz, { justifyContent: 'center' }]}>
        <ActivityIndicator color={c.oro} size="large" />
        {dialogoSens}
      </View>
    );

  fijarPropios(datos.misAlimentos);

  const conPeso = (d: Datos, kg: number): Datos['pesos'] => {
    const hoy = claveDia();
    return [...d.pesos.filter((x) => claveDia(x.fecha) !== hoy), { fecha: Date.now(), max: kg }];
  };

  const guardarPerfil = (x: Perfil) => {
    const a = datos.perfil;
    // El nivel físico no rehace el plan. Al rehacerlo se conservan tus rutinas y las del coach que hayas editado.
    const rehacer = planCambia(a, x);
    setDatos({
      ...datos,
      perfil: x,
      pesos: a?.peso === x.peso ? datos.pesos : conPeso(datos, x.peso),
      rutinas: rehacer ? rutinasTrasRehacer(datos.rutinas, generarPlan(x)) : datos.rutinas,
    });
  };

  const enDescarga = () => (datos.perfil?.descargaHasta ?? 0) > Date.now();
  const arrancar = (r: Rutina, ligero = false) =>
    setDatos({ ...datos, activo: iniciarActivo(r, datos.sesiones, enDescarga(), ligero) });

  // Antes del primer entreno del día: ¿cómo has dormido y cómo vas de energía?
  const empezar = (r: Rutina) => {
    if (enDescarga() || datos.animo?.[claveDia()]) return arrancar(r, esFlojo(datos.animo?.[claveDia()]));
    setAnimo({ rutina: r, sueno: 2, energia: 1 });
  };

  const confirmarAnimo = () => {
    if (!animo) return;
    const hoy = claveDia();
    const valores = { sueno: animo.sueno, energia: animo.energia };
    setDatos({
      ...datos,
      animo: { ...(datos.animo ?? {}), [hoy]: valores },
      activo: iniciarActivo(animo.rutina, datos.sesiones, enDescarga(), esFlojo(valores)),
    });
    setAnimo(null);
  };

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
      id: sesion.id,
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
      <StatusBar style={c.oscuro ? 'light' : 'dark'} />
      {version?.hayNueva && !datos.activo ? <BannerVersion obligatoria={version.obligatoria} onActualizar={() => window.location.reload()} /> : null}
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
          voz={datos.voz}
          onVoz={(voz) => setDatos((d) => (d ? { ...d, voz } : d))}
          prudente={dolorReciente(datos)}
        />
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {pestana === 'coach' ? (
              <Coach
                datos={datos}
                onActualizar={(f) => setDatos((d) => (d ? f(d) : d))}
                cuenta={nubeActiva ? { email: usuario?.email ?? null, estado: estadoNube, onEntrar: () => setPantallaCuenta('entrar'), onSalir: () => salir(), onBorrar: () => salir(true) } : null}
                onPerfil={guardarPerfil}
                onPeso={(kg) =>
                  setDatos({ ...datos, pesos: conPeso(datos, kg), perfil: datos.perfil ? { ...datos.perfil, peso: kg } : null })
                }
                onEmpezar={empezar}
                onAjustar={(a) => setDatos({ ...datos, rutinas: a.rutinas, perfil: a.perfil })}
                onRestaurar={(copia) => setDatos(conservarDecision(fusionarProgreso({ ...datos, ...copia, activo: null }, datos), datos))}
                onDescarga={(hasta) => setDatos({ ...datos, perfil: datos.perfil ? { ...datos.perfil, descargaHasta: hasta } : null })}
                onMedida={(zona, cm) => {
                  const hoy = claveDia();
                  const previas = (datos.medidas[zona] ?? []).filter((x) => claveDia(x.fecha) !== hoy);
                  setDatos({ ...datos, medidas: { ...datos.medidas, [zona]: [...previas, { fecha: Date.now(), max: cm }] } });
                }}
              />
            ) : pestana === 'arena' ? (
              <Arena
                d={datos}
                conCuenta={!!usuario}
                onCuenta={nubeActiva ? () => setPantallaCuenta(invitacion ? 'registro' : 'entrar') : undefined}
                onActualizar={(f) => setDatos((d) => (d ? f(d) : d))}
                invitacion={invitacion}
                onInvitacionResuelta={() => {
                  olvidarInvitacion();
                  setInvitacion(null);
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
                d={datos}
                onActualizar={(f) => setDatos((d) => (d ? f(d) : d))}
                rutinas={datos.rutinas}
                onEmpezar={empezar}
                onGuardar={(r) =>
                  setDatos({
                    ...datos,
                    rutinas: datos.rutinas.some((x) => x.id === r.id)
                      ? datos.rutinas.map((x) => (x.id === r.id ? { ...r, ejemplo: undefined, ...(r.deCoach ? { personalizada: true } : {}) } : x))
                      : [...datos.rutinas, r],
                  })
                }
                onBorrar={(id) => setDatos({ ...datos, rutinas: datos.rutinas.filter((x) => x.id !== id) })}
              />
            ) : (
              <Progreso
                arriba={
                  <>
                    <TarjetaAtleta d={datos} onActualizar={(f) => setDatos((d) => (d ? f(d) : d))} />
                    <ResumenSensaciones d={datos} />
                    <Estadisticas d={datos} />
                    <MapaMuscular d={datos} />
                    <CompartirSemana d={datos} />
                  </>
                }
                sesiones={datos.sesiones}
                onBorrar={(id) => setDatos({ ...datos, sesiones: datos.sesiones.filter((x) => x.id !== id) })}
              />
            )}
          </View>
          <View style={e.pestanas} accessibilityRole="tablist">
            <Pestana icono="🏠" texto="Coach" activa={pestana === 'coach'} onPress={() => setPestana('coach')} />
            <Pestana icono="📋" texto="Rutinas" activa={pestana === 'rutinas'} onPress={() => setPestana('rutinas')} />
            <Pestana icono="🍽️" texto="Comida" activa={pestana === 'comida'} onPress={() => setPestana('comida')} />
            <Pestana icono="🏆" texto="Arena" activa={pestana === 'arena'} onPress={() => setPestana('arena')} />
            <Pestana icono="📈" texto="Progreso" activa={pestana === 'progreso'} onPress={() => setPestana('progreso')} />
          </View>
        </>
      )}
      {nuevas.length ? (
        <NuevasMedallas
          lista={nuevas}
          onListo={() => {
            setDatos((d) => (d ? { ...d, medallasVistas: [...new Set([...(d.medallasVistas ?? []), ...nuevas.map((m) => m.id)])] } : d));
          }}
        />
      ) : null}
      {bienvenida && !pantallaCuenta ? (
        <Bienvenida
          conDatos={bienvenida.conDatos}
          onCopia={async () => {
            const copia = await copiaPreBeta();
            if (copia) await exportarCopia(copia).catch(() => {});
            await marcarBienvenidaVista();
            setBienvenida(null);
          }}
          onCerrar={async () => {
            await marcarBienvenidaVista();
            setBienvenida(null);
          }}
        />
      ) : null}
      {dialogoSens}
      {importar ? (
        <Dialogo
          titulo="Datos de otra cuenta en este dispositivo"
          si="Importarlos a esta cuenta"
          no="No importar"
          onSi={() => {
            setDatosCrudo((d) => (d ? fusionarDatos(d, sinConsentimientoAjeno(importar)) : sinConsentimientoAjeno(importar)));
            setImportar(null);
          }}
          onNo={() => {
            AsyncStorage.setItem('mi-gym:v1:otra-cuenta', JSON.stringify(importar)).catch(() => {});
            setImportar(null);
          }}
        >
          <Text style={e.resumen}>
            Este dispositivo tenía datos ({importar.sesiones.length} {importar.sesiones.length === 1 ? 'entreno' : 'entrenos'}, {importar.rutinas.length} {importar.rutinas.length === 1 ? 'rutina' : 'rutinas'}) que no son de esta cuenta. Si son tuyos, impórtalos y se mezclarán con los de tu cuenta sin borrar nada. Si no, déjalos fuera: se guarda una copia aparte en el dispositivo.
          </Text>
        </Dialogo>
      ) : null}
      {animo ? (
        <Dialogo titulo="¿Cómo estás hoy?" si={esFlojo(animo) ? 'Empezar día ligero' : 'Empezar'} no="Cancelar" onSi={confirmarAnimo} onNo={() => setAnimo(null)}>
          <Text style={e.pregunta}>¿Qué tal has dormido?</Text>
          <Opciones3 valor={animo.sueno} textos={['Mal', 'Regular', 'Bien']} onCambio={(sueno) => setAnimo({ ...animo, sueno })} />
          <Text style={e.pregunta}>¿Cómo vas de energía?</Text>
          <Opciones3 valor={animo.energia} textos={['Baja', 'Normal', 'Alta']} onCambio={(energia) => setAnimo({ ...animo, energia })} />
          <Text style={e.consejo}>
            {dolorReciente(datos)
              ? 'Marcaste molestias hace poco. Si hoy te duele algo, no entrenes con dolor: descansa. Si no, ve con calma.'
              : esFlojo(animo)
              ? 'Hoy toca suave: una serie menos y cerca del 85 % del peso. Mejor eso que no ir o lesionarte.'
              : animo.sueno + animo.energia === 2
                ? 'Entreno normal. Si a mitad notas que no tiras, quita la última serie de cada ejercicio.'
                : '¡A por ello! Hoy es buen día para intentar subir peso.'}
          </Text>
        </Dialogo>
      ) : null}
      {resumen ? (
        <Dialogo titulo="¡Entreno guardado!" si="Listo" onSi={() => setResumen(null)}>
          <Text style={e.resumen}>
            {resumen.minutos} min · {resumen.series} {resumen.series === 1 ? 'serie' : 'series'} ·{formatoNum(resumen.kilos)} kg levantados
          </Text>
          {resumen.records.map((r) => (
            <Text key={r} style={e.record}>Nuevo récord · {r}</Text>
          ))}
          {sensacionesPermitidas(datos, !!usuario) ? <SensacionTrasEntreno idSesion={resumen.id} onActualizar={(f) => setDatos((d) => (d && sensacionesPermitidas(d, !!usuario) ? marcarPermiso(f(d), resumen.id) : d))} /> : null}
        </Dialogo>
      ) : null}
    </SafeAreaView>
  );
}

const esFlojo = (a?: { sueno: Nivel3; energia: Nivel3 }) => !!a && a.sueno + a.energia <= 1;

const Opciones3 = ({ valor, textos, onCambio }: { valor: Nivel3; textos: string[]; onCambio: (v: Nivel3) => void }) => (
  <View style={{ flexDirection: 'row', gap: 8 }}>
    {textos.map((t, i) => (
      <Pressable
        key={t}
        accessibilityRole="button"
        accessibilityLabel={t}
        accessibilityState={{ selected: valor === i }}
        onPress={() => onCambio(i as Nivel3)}
        style={[e.opcion3, valor === i && { backgroundColor: c.oro }]}
      >
        <Text style={[e.pestanaTexto, valor === i && { color: c.sobreOro }]}>{t}</Text>
      </Pressable>
    ))}
  </View>
);

const Pestana = ({ icono, texto, activa, onPress }: { icono: string; texto: string; activa: boolean; onPress: () => void }) => (
  <Pressable accessibilityRole="tab" accessibilityLabel={texto} accessibilityState={{ selected: activa }} onPress={onPress} style={e.pestana}>
    <View style={[e.pestanaIcono, activa && { backgroundColor: c.acentoSuave }]}>
      <Text style={{ fontSize: 19, opacity: activa ? 1 : 0.6 }}>{icono}</Text>
    </View>
    <Text style={[e.pestanaTexto, activa && { color: c.oro }]} numberOfLines={1}>{texto}</Text>
  </Pressable>
);

const e = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.fondo },
  pestanas: { flexDirection: 'row', gap: 2, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 8, borderTopWidth: 1, borderTopColor: c.borde, backgroundColor: c.tarjeta },
  pestana: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  pestanaIcono: { width: 52, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  pestanaTexto: { color: c.suave, fontSize: Math.min(tam(12), 14), fontWeight: '800' },
  resumen: { color: c.suave, fontSize: tam(16), lineHeight: tam(22) },
  record: { color: c.oro, fontSize: tam(16), fontWeight: '800' },
  pregunta: { color: c.texto, fontSize: tam(16), fontWeight: '800', marginTop: 4 },
  opcion3: { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: c.campo },
  consejo: { color: c.suave, fontSize: tam(15), lineHeight: tam(21) },
});
