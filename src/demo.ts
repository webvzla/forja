// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Datos ficticios para la demostración (solo se usan si DEMO = true en config.ts).
import { Datos, Perfil, Sesion, claveDia, datosIniciales, nuevoId } from './datos';
import { generarPlan, inicioSemana } from './reglas';

const DIA = 86400000;

export function datosDemo(): Datos {
  const perfil: Perfil = {
    sexo: 'h', edad: 29, altura: 178, peso: 79.5, objetivo: 'musculo', objetivo2: 'fuerza', dias: 4, diasSemana: [0, 1, 3, 4],
    descargaHasta: null, nivel: 'intermedio', equipo: 'gym', enfasis: ['pecho', 'abdomen'], ajusteKcal: 0, ultimaRevision: null,
  };
  const rutinas = generarPlan(perfil);
  const lunes = inicioSemana();
  const sesiones: Sesion[] = [];
  const comida: Datos['comida'] = {};
  let x = 7;
  const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  // 6 semanas atrás hasta hoy
  for (let t = lunes - 6 * 7 * DIA; t <= Date.now(); t += DIA) {
    const dia = (new Date(t).getDay() + 6) % 7;
    const semana = Math.floor((t - (lunes - 6 * 7 * DIA)) / (7 * DIA));
    const rutina = rutinas.find((ru) => ru.dia === dia);
    if (rutina && r() > 0.12 && t < Date.now() - 3600000) {
      sesiones.push({
        id: nuevoId(),
        rutinaNombre: rutina.nombre,
        fecha: t + 18 * 3600000,
        minutos: 45 + Math.round(r() * 25),
        ejercicios: rutina.ejercicios.map((e, i) => {
          const base = [60, 40, 30, 22, 14, 12][i] ?? 12;
          const peso = Math.round((base + semana * (i < 2 ? 2.5 : 1)) * 2) / 2;
          return { nombre: e.nombre, series: Array.from({ length: e.series }, () => ({ peso, reps: e.reps + Math.round(r() * 2) })) };
        }),
      });
    }
    if (t <= Date.now()) {
      const prot = 120 + Math.round(r() * 60);
      comida[claveDia(t)] = [
        { id: nuevoId(), nombre: 'Avena con yogur y plátano', proteina: 28, kcal: 520 },
        { id: nuevoId(), nombre: 'Pollo con arroz y verduras', proteina: 45, kcal: 750 },
        { id: nuevoId(), nombre: 'Batido de proteína', proteina: 25, kcal: 180 },
        { id: nuevoId(), nombre: 'Cena', proteina: prot - 98, kcal: 700 + Math.round(r() * 300) },
      ];
    }
  }
  sesiones.sort((a, b) => b.fecha - a.fecha);
  const pesos = Array.from({ length: 7 }, (_, i) => ({ fecha: lunes - (6 - i) * 7 * DIA, max: Math.round((78.2 + i * 0.22) * 10) / 10 }));
  return {
    ...datosIniciales(),
    perfil,
    rutinas,
    sesiones,
    comida,
    pesos,
    medidas: { pecho: [{ fecha: lunes - 28 * DIA, max: 101 }, { fecha: lunes, max: 103 }], cintura: [{ fecha: lunes - 28 * DIA, max: 84 }, { fecha: lunes, max: 83 }] },
    despensa: [{ ing: 'pollo', cantidad: 800 }, { ing: 'huevos', cantidad: 10 }, { ing: 'arroz', cantidad: 900 }, { ing: 'avena', cantidad: 500 }, { ing: 'yogur', cantidad: 750 }, { ing: 'atun', cantidad: 240 }],
    precios: { pollo: { euros: 6.9, cantidad: 1000, fecha: Date.now() }, huevos: { euros: 2.6, cantidad: 12, fecha: Date.now() }, atun: { euros: 3.2, cantidad: 240, fecha: Date.now() } },
    recetasHechas: [{ id: nuevoId(), titulo: 'Bowl de pollo y arroz', ids: ['pollo', 'arroz'], variante: 0, fecha: Date.now() - 2 * DIA }],
    medallasVistas: ['e1', 'e10', 'e25', 's1', 's4', 'r1', 'r25', 'p7', 'c1', 'z'],
  };
}
