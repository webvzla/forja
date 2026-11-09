import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Activo, EjercicioActivo, Perfil, Sesion, formatoNum, pesoMaximo, ultimaVez } from './datos';
import { GUIAS } from './guias';
import { alternativas, pesoSugerido } from './reglas';
import { Campo, Dialogo, Pildora, Tarjeta, avisoFinDescanso, c, prepararSonido } from './ui';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function Entreno(p: {
  activo: Activo;
  perfil: Perfil | null;
  sesiones: Sesion[];
  descanso: number;
  onCambio: (a: Activo) => void;
  onDescanso: (segundos: number) => void;
  onTerminar: () => void;
  onDescartar: () => void;
}) {
  const a = p.activo;
  const [ahora, setAhora] = useState(Date.now());
  const [dialogo, setDialogo] = useState<'terminar' | 'salir' | null>(null);
  const [guia, setGuia] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<number | null>(null);
  const [recienTerminado, setRecienTerminado] = useState(false);
  const avisado = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Se cuenta contra una hora de fin, así no se desajusta si el móvil se bloquea.
  const restante = a.finDescanso ? Math.ceil((a.finDescanso - ahora) / 1000) : null;
  useEffect(() => {
    if (restante === null) {
      avisado.current = false;
    } else if (restante <= 0 && !avisado.current) {
      avisado.current = true;
      avisoFinDescanso();
      setRecienTerminado(true);
      p.onCambio({ ...a, finDescanso: null });
      setTimeout(() => setRecienTerminado(false), 3000);
    }
  }, [restante]);

  const hechas = a.ejercicios.reduce((n, x) => n + x.series.filter((s) => s.hecha).length, 0);
  const total = a.ejercicios.reduce((n, x) => n + x.series.length, 0);

  const referencia = (x: EjercicioActivo, j: number) => {
    const sug = pesoSugerido(p.sesiones, x.nombre, x.objetivo, x.repsMax);
    const u = ultimaVez(p.sesiones, x.nombre);
    const ref = u[j] ?? u[u.length - 1];
    if (a.descarga && ref) return { peso: formatoNum(Math.round((ref.peso * 0.85) / 2.5) * 2.5), reps: String(ref.reps) };
    if (sug?.sube) return { peso: formatoNum(sug.peso), reps: String(x.objetivo) };
    if (sug?.reps) return { peso: '0', reps: String(sug.reps) };
    return ref ? { peso: formatoNum(ref.peso), reps: String(ref.reps) } : { peso: '0', reps: String(x.objetivo) };
  };

  const editarSerie = (i: number, j: number, cambio: object) =>
    p.onCambio({
      ...a,
      ejercicios: a.ejercicios.map((x, xi) =>
        xi !== i ? x : { ...x, series: x.series.map((s, sj) => (sj === j ? { ...s, ...cambio } : s)) },
      ),
    });

  const marcar = (i: number, j: number) => {
    prepararSonido();
    const x = a.ejercicios[i];
    const s = x.series[j];
    if (s.hecha) return editarSerie(i, j, { hecha: false });
    const ref = referencia(x, j);
    const peso = s.peso || ref.peso;
    const reps = s.reps || ref.reps;
    p.onCambio({
      ...a,
      finDescanso: Date.now() + (x.descanso ?? p.descanso) * 1000,
      ejercicios: a.ejercicios.map((y, yi) =>
        yi !== i
          ? y
          : { ...y, series: y.series.map((z, zj) => (zj === j ? { peso, reps, hecha: true } : z)) },
      ),
    });
  };

  const cambiarSeries = (i: number, delta: 1 | -1) =>
    p.onCambio({
      ...a,
      ejercicios: a.ejercicios.map((x, xi) => {
        if (xi !== i) return x;
        if (delta === 1) return { ...x, series: [...x.series, { peso: '', reps: '', hecha: false }] };
        const ult = x.series[x.series.length - 1];
        return x.series.length > 1 && !ult.hecha ? { ...x, series: x.series.slice(0, -1) } : x;
      }),
    });

  const sumarDescanso = (delta: number) => {
    if (a.finDescanso) p.onCambio({ ...a, finDescanso: Math.max(Date.now(), a.finDescanso + delta * 1000) });
    // Las rutinas del coach traen su descanso; el ajuste solo cuenta para este descanso.
    if (!a.ejercicios.some((x) => x.descanso)) p.onDescanso(Math.min(600, Math.max(15, p.descanso + delta)));
  };

  const cambiarEjercicio = (i: number, nombre: string) => {
    p.onCambio({
      ...a,
      ejercicios: a.ejercicios.map((x, xi) =>
        xi === i ? { ...x, nombre, series: x.series.map(() => ({ peso: '', reps: '', hecha: false })) } : x,
      ),
    });
    setCambiando(null);
  };

  const primero = a.ejercicios[0];
  const pesoPrimero = primero ? pesoMaximo(ultimaVez(p.sesiones, primero.nombre)) : 0;
  const calentamiento =
    pesoPrimero > 0
      ? `5 minutos de cardio suave. Después, en ${primero.nombre}: 10 repeticiones con ${formatoNum(Math.round((pesoPrimero * 0.5) / 2.5) * 2.5)} kg y 5 con ${formatoNum(Math.round((pesoPrimero * 0.7) / 2.5) * 2.5)} kg.`
      : '5 minutos de cardio suave y una serie muy ligera del primer ejercicio.';

  return (
    <View style={{ flex: 1 }}>
      <View style={e.cabecera}>
        <View style={{ flex: 1 }}>
          <Text style={e.titulo} numberOfLines={1}>{a.rutinaNombre}</Text>
          <Text style={e.sub}>{hechas} de {total} series · {mmss(Math.floor((ahora - a.inicio) / 1000))}</Text>
        </View>
        <Pildora chica texto="Terminar" onPress={() => setDialogo('terminar')} />
      </View>

      <ScrollView contentContainerStyle={e.pagina} keyboardShouldPersistTaps="handled">
        {a.descarga ? (
          <Tarjeta>
            <Text style={e.ejercicio}>Semana de descarga</Text>
            <Text style={e.sub}>Una serie menos y cerca del 85 % de tu peso, para recuperarte y volver con más fuerza.</Text>
          </Tarjeta>
        ) : null}
        {hechas === 0 ? (
          <Tarjeta>
            <Text style={e.ejercicio}>Calentamiento</Text>
            <Text style={e.sub}>{calentamiento}</Text>
          </Tarjeta>
        ) : null}
        {a.ejercicios.map((x, i) => {
          const u = ultimaVez(p.sesiones, x.nombre);
          const sug = pesoSugerido(p.sesiones, x.nombre, x.objetivo, x.repsMax);
          const objetivo = x.repsMax ? `${x.objetivo}–${x.repsMax}` : String(x.objetivo);
          return (
            <Tarjeta key={i}>
              <Text style={e.ejercicio}>{x.nombre}</Text>
              <View style={e.fila}>
                {GUIAS[x.nombre] ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Cómo se hace ${x.nombre}`} style={e.enlace} onPress={() => setGuia(x.nombre)}>
                    <Text style={e.enlaceTexto}>Cómo se hace</Text>
                  </Pressable>
                ) : null}
                {alternativas(x.nombre, p.perfil).length && !x.series.some((s) => s.hecha) ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Cambiar ${x.nombre}`} style={e.enlace} onPress={() => setCambiando(i)}>
                    <Text style={e.enlaceTexto}>Cambiar</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={e.sub}>
                {u.length
                  ? `Última vez: ${u.map((s) => `${formatoNum(s.peso)}×${formatoNum(s.reps)}`).join('  ')}`
                  : `Primera vez · objetivo ${objetivo} reps`}
              </Text>
              {!a.descarga && sug?.sube ? <Text style={e.sube}>Hoy sube a {formatoNum(sug.peso)} kg</Text> : null}
              {!a.descarga && sug?.reps ? <Text style={e.sube}>Hoy intenta {sug.reps} repeticiones</Text> : null}
              <View style={e.fila}>
                <Text style={[e.col, e.colN]}>#</Text>
                <Text style={[e.col, { flex: 1 }]}>kg</Text>
                <Text style={[e.col, { flex: 1 }]}>reps</Text>
                <View style={{ width: 48 }} />
              </View>
              {x.series.map((s, j) => {
                const ref = referencia(x, j);
                return (
                  <View key={j} style={e.fila}>
                    <Text style={[e.num, e.colN, s.hecha && { color: c.verde }]}>{j + 1}</Text>
                    <Campo
                      accessibilityLabel={`${x.nombre}, serie ${j + 1}, kilos`}
                      style={[e.dato, s.hecha && e.datoHecho]}
                      keyboardType="decimal-pad"
                      placeholder={ref.peso}
                      value={s.peso}
                      onChangeText={(peso) => editarSerie(i, j, { peso })}
                    />
                    <Campo
                      accessibilityLabel={`${x.nombre}, serie ${j + 1}, repeticiones`}
                      style={[e.dato, s.hecha && e.datoHecho]}
                      keyboardType="number-pad"
                      placeholder={ref.reps}
                      value={s.reps}
                      onChangeText={(reps) => editarSerie(i, j, { reps })}
                    />
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: s.hecha }}
                      accessibilityLabel={`Serie ${j + 1} hecha`}
                      onPress={() => marcar(i, j)}
                      style={[e.check, s.hecha && e.checkHecho]}
                    >
                      <Text style={{ color: s.hecha ? '#07281A' : c.suave, fontSize: 20, fontWeight: '900' }}>✓</Text>
                    </Pressable>
                  </View>
                );
              })}
              <View style={e.fila}>
                <View style={{ flex: 1 }}>
                  <Pildora chica tipo="neutro" texto="+ Serie" onPress={() => cambiarSeries(i, 1)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Pildora
                    chica
                    tipo="neutro"
                    texto="− Serie"
                    deshabilitado={x.series.length < 2 || x.series[x.series.length - 1].hecha}
                    onPress={() => cambiarSeries(i, -1)}
                  />
                </View>
              </View>
            </Tarjeta>
          );
        })}
        <Pildora tipo="peligro" texto="Salir sin guardar" onPress={() => setDialogo('salir')} />
      </ScrollView>

      {restante !== null || recienTerminado ? (
        <View style={[e.descanso, recienTerminado && { backgroundColor: c.verde }]}>
          {recienTerminado ? (
            <Text style={e.fin}>¡A por la siguiente serie!</Text>
          ) : (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel="Quitar 15 segundos" style={e.ajuste} onPress={() => sumarDescanso(-15)}>
                <Text style={e.ajusteTexto}>−15</Text>
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={e.cuenta} accessibilityLiveRegion="none">{mmss(Math.max(0, restante ?? 0))}</Text>
                <Text style={e.descansoSub}>Descanso</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Añadir 15 segundos" style={e.ajuste} onPress={() => sumarDescanso(15)}>
                <Text style={e.ajusteTexto}>+15</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Saltar descanso" style={e.ajuste} onPress={() => p.onCambio({ ...a, finDescanso: null })}>
                <Text style={e.ajusteTexto}>Saltar</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {guia ? (
        <Dialogo titulo={guia} si="Entendido" onSi={() => setGuia(null)}>
          <Text style={e.guia}>{GUIAS[guia].como}</Text>
          <Text style={[e.guia, { color: c.oro }]}>Error típico: {GUIAS[guia].error}</Text>
        </Dialogo>
      ) : null}
      {cambiando !== null ? (
        <Dialogo titulo="Cambiar por" mensaje="Solo para este entreno: tu rutina no cambia." si="Cancelar" onSi={() => setCambiando(null)}>
          <View style={{ gap: 8 }}>
            {alternativas(a.ejercicios[cambiando].nombre, p.perfil).map((n) => (
              <Pildora key={n} chica tipo="neutro" texto={n} onPress={() => cambiarEjercicio(cambiando, n)} />
            ))}
          </View>
        </Dialogo>
      ) : null}
      {dialogo === 'terminar' ? (
        hechas === 0 ? (
          <Dialogo
            titulo="No has marcado ninguna serie"
            mensaje="Marca con ✓ las series que hagas. Si te vas ahora no se guarda nada."
            si="Seguir entrenando"
            onSi={() => setDialogo(null)}
          />
        ) : (
          <Dialogo
            titulo="¿Terminar el entreno?"
            mensaje={hechas < total ? `Series marcadas que se guardan: ${hechas}. Sin marcar, que no se guardan: ${total - hechas}.` : 'Has completado todas las series.'}
            si="Terminar y guardar"
            no="Seguir entrenando"
            onSi={() => {
              setDialogo(null);
              p.onTerminar();
            }}
            onNo={() => setDialogo(null)}
          />
        )
      ) : null}
      {dialogo === 'salir' ? (
        <Dialogo
          titulo="¿Salir sin guardar?"
          mensaje="Se pierde todo lo apuntado en este entreno."
          si="Salir y perderlo"
          peligro
          no="Seguir entrenando"
          onSi={p.onDescartar}
          onNo={() => setDialogo(null)}
        />
      ) : null}
    </View>
  );
}

const e = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: c.borde },
  titulo: { color: c.texto, fontSize: 26, fontWeight: '900' },
  sub: { color: c.suave, fontSize: 15, lineHeight: 21 },
  pagina: { padding: 16, gap: 14, paddingBottom: 40 },
  ejercicio: { color: c.texto, fontSize: 20, fontWeight: '800' },
  sube: { color: c.oro, fontSize: 15, fontWeight: '800' },
  enlace: { minHeight: 44, justifyContent: 'center', paddingRight: 14 },
  enlaceTexto: { color: c.oro, fontSize: 15, fontWeight: '700' },
  guia: { color: c.texto, fontSize: 16, lineHeight: 23 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  col: { color: c.suave, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  colN: { width: 26, textAlign: 'center' },
  num: { color: c.suave, fontSize: 17, fontWeight: '800' },
  dato: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  datoHecho: { backgroundColor: 'rgba(91,214,160,.14)' },
  check: { width: 48, height: 44, borderRadius: 12, backgroundColor: c.campo, alignItems: 'center', justifyContent: 'center' },
  checkHecho: { backgroundColor: c.verde },
  descanso: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.oro, paddingHorizontal: 12, paddingVertical: 10, gap: 4, minHeight: 72 },
  cuenta: { color: c.sobreOro, fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'] },
  descansoSub: { color: c.sobreOro, fontSize: 13, fontWeight: '700' },
  ajuste: { minWidth: 56, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  ajusteTexto: { color: c.sobreOro, fontSize: 16, fontWeight: '800' },
  fin: { flex: 1, textAlign: 'center', color: '#07281A', fontSize: 22, fontWeight: '900' },
});
