// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// FORJA ACADEMY · biblioteca central de ejercicios.
// Para añadir un ejercicio: añade una entrada a EJERCICIOS (la clave es el nombre exacto que usan
// las rutinas) y, si tienes material visual con licencia adecuada, pon las imágenes en
// public/academia/<id>-1.webp (posición inicial) y <id>-2.webp (final del recorrido) y regístralas
// en CREDITOS_VISUALES y en public/academia/CREDITOS.md. Sin material fiable, deja `visual` vacío:
// la ficha muestra la explicación escrita y avisa de que falta contenido visual.
import type { Musculo } from './calculos';

export type Nivel = 'principiante' | 'intermedio' | 'avanzado';
export type Visual = {
  id: string; // archivos public/academia/<id>-1.webp … <id>-N.webp (1 = inicio, N = final)
  fuente: keyof typeof CREDITOS_VISUALES;
  nota?: string; // diferencias entre la ilustración y el ejercicio de la rutina
  fotogramas?: number; // por defecto 2 (inicio y final); las ilustraciones propias traen el movimiento completo
  isometrico?: boolean; // ejercicio sin movimiento (se mantiene la posición)
};
export type Video = { url: string; fuente: string; licencia: string; verificado: string };
export type Ficha = {
  nombre: string;
  principales: Musculo[];
  secundarios: Musculo[];
  detalle: string; // músculos con más precisión
  equipo: string;
  nivel: Nivel;
  pasos: string[];
  respiracion: string;
  errores: [string, string][]; // [error, cómo corregirlo]
  principiantes: string[];
  alternativas: [string, string][]; // [ejercicio, cuándo usarlo]
  visual?: Visual;
  video?: Video;
};

export const CREDITOS_VISUALES = {
  everkinetic: {
    autor: 'Greg Priday (everkinetic.com) y proyecto de datos abiertos Everkinetic',
    licencia: 'CC BY-SA 4.0',
    url: 'https://github.com/everkinetic/data',
    licenciaUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.es',
    cambios: 'Convertidas a WebP en escala de grises (sin cambiar el dibujo).',
  },
} as const;

const ek = (id: string, nota?: string): Visual => ({ id, fuente: 'everkinetic', nota });

const RESP_EMPUJE = 'Toma aire arriba, aguántalo mientras bajas y suéltalo al empujar, sobre todo en la parte más dura.';
const RESP_TIRON = 'Suelta el aire al tirar y tómalo mientras vuelves despacio a la posición inicial.';
const RESP_PIERNA = 'Toma aire y aprieta el abdomen antes de bajar; suéltalo al subir, pasada la parte más dura.';
const RESP_CORE = 'No aguantes la respiración: respira corto y constante manteniendo el abdomen firme.';

export const EJERCICIOS: Record<string, Ficha> = {
  // ---------------- Pecho ----------------
  'Press de banca': {
    nombre: 'Press de banca', principales: ['pecho'], secundarios: ['triceps', 'hombros'],
    detalle: 'Pectoral mayor; ayudan el tríceps y la parte delantera del hombro.', equipo: 'Barra y banco', nivel: 'intermedio',
    pasos: [
      'Túmbate con los ojos bajo la barra y los pies apoyados en el suelo.',
      'Junta y baja las escápulas; agarra la barra algo más ancho que los hombros.',
      'Saca la barra y colócala sobre el pecho con los brazos estirados.',
      'Baja controlando hasta rozar la parte media-baja del pecho, con los codos a unos 45-60° del cuerpo.',
      'Empuja hacia arriba y un poco hacia atrás hasta estirar los brazos.',
    ],
    respiracion: RESP_EMPUJE,
    errores: [
      ['Rebotar la barra en el pecho.', 'Para un instante abajo y empuja sin impulso.'],
      ['Levantar los glúteos del banco.', 'Mantén glúteos y espalda alta apoyados; baja el peso si hace falta.'],
      ['Codos totalmente abiertos (a 90°).', 'Acércalos un poco al cuerpo para proteger el hombro.'],
    ],
    principiantes: ['Usa un compañero o barras de seguridad cuando subas de peso.', 'Empieza con la barra sola para aprender la trayectoria.'],
    alternativas: [['Press con mancuernas', 'Si te molesta el hombro o no hay barra libre.'], ['Flexiones', 'Sin material o en casa.'], ['Press en máquina', 'Para entrenar sin compañero con más seguridad.']],
    visual: ek('press-de-banca'),
  },
  'Press con mancuernas': {
    nombre: 'Press con mancuernas', principales: ['pecho'], secundarios: ['triceps', 'hombros'],
    detalle: 'Pectoral mayor, con más estabilización de hombro que con barra.', equipo: 'Mancuernas y banco', nivel: 'principiante',
    pasos: [
      'Siéntate con las mancuernas sobre los muslos y túmbate llevándolas al pecho.',
      'Estira los brazos sobre el pecho con las palmas mirando hacia los pies.',
      'Baja las mancuernas a los lados del pecho, con los codos algo por debajo del banco.',
      'Empuja hasta arriba juntándolas sin chocarlas.',
    ],
    respiracion: RESP_EMPUJE,
    errores: [['Abrir demasiado los codos.', 'Lleva los codos a unos 45° del cuerpo.'], ['Dejar caer las mancuernas al acabar.', 'Bájalas a los muslos y siéntate con ellas.']],
    principiantes: ['Elige un peso con el que controles la bajada en 2-3 segundos.'],
    alternativas: [['Press de banca', 'Cuando quieras mover más peso.'], ['Flexiones', 'Sin material.']],
    visual: ek('press-con-mancuernas'),
  },
  'Press en máquina': {
    nombre: 'Press en máquina', principales: ['pecho'], secundarios: ['triceps', 'hombros'],
    detalle: 'Pectoral mayor con trayectoria guiada.', equipo: 'Máquina de press de pecho', nivel: 'principiante',
    pasos: [
      'Ajusta el asiento para que las asas queden a la altura de la mitad del pecho.',
      'Apoya bien la espalda y junta las escápulas.',
      'Empuja hasta casi estirar los brazos, sin bloquear de golpe.',
      'Vuelve despacio hasta notar el estiramiento del pecho.',
    ],
    respiracion: RESP_EMPUJE,
    errores: [['Despegar la espalda del respaldo.', 'Baja el peso y mantén la espalda apoyada.'], ['Asas demasiado altas.', 'Baja el asiento hasta que queden a la altura del pecho.']],
    principiantes: ['Buen ejercicio para aprender a empujar sin miedo a que caiga el peso.'],
    alternativas: [['Press con mancuernas', 'Para trabajar más la estabilidad.'], ['Flexiones', 'Sin máquina.']],
    visual: ek('press-en-maquina'),
  },
  Flexiones: {
    nombre: 'Flexiones', principales: ['pecho'], secundarios: ['triceps', 'hombros', 'abdomen'],
    detalle: 'Pectoral, tríceps y hombro; el abdomen mantiene el cuerpo recto.', equipo: 'Ninguno', nivel: 'principiante',
    pasos: [
      'Apoya las manos algo más abiertas que los hombros y los pies juntos o un poco separados.',
      'Pon el cuerpo recto de la cabeza a los talones, con abdomen y glúteos apretados.',
      'Baja el pecho hasta casi tocar el suelo, con los codos a unos 45°.',
      'Empuja el suelo hasta estirar los brazos.',
    ],
    respiracion: RESP_EMPUJE,
    errores: [['Dejar caer la cadera.', 'Aprieta glúteos y abdomen; si no puedes, apoya las rodillas.'], ['Bajar solo la cabeza.', 'Baja el pecho entero manteniendo el cuello alineado.']],
    principiantes: ['Empieza con las manos en una mesa firme (flexiones inclinadas) o con las rodillas apoyadas.'],
    alternativas: [['Flexiones inclinadas', 'Para hacerlas más fáciles.'], ['Flexiones con pies elevados', 'Para hacerlas más difíciles.'], ['Press de banca', 'En el gimnasio.']],
    visual: ek('flexiones'),
  },
  'Flexiones con pies elevados': {
    nombre: 'Flexiones con pies elevados', principales: ['pecho'], secundarios: ['hombros', 'triceps', 'abdomen'],
    detalle: 'Más trabajo de la parte alta del pecho y del hombro.', equipo: 'Silla o banco estable', nivel: 'intermedio',
    pasos: ['Pon los pies sobre una silla o banco y las manos en el suelo bajo los hombros.', 'Cuerpo recto y abdomen firme.', 'Baja el pecho controlando.', 'Empuja hasta estirar los brazos.'],
    respiracion: RESP_EMPUJE,
    errores: [['Doblar la cadera hacia arriba.', 'Mantén la línea recta apretando glúteos.'], ['Usar un apoyo que se mueve.', 'Usa algo firme y que no resbale.']],
    principiantes: ['Domina primero 15 flexiones normales seguidas.'],
    alternativas: [['Flexiones', 'Si no completas las repeticiones.'], ['Press inclinado con mancuernas', 'En el gimnasio.']],
    visual: ek('flexiones-pies-elevados'),
  },
  'Flexiones inclinadas': {
    nombre: 'Flexiones inclinadas', principales: ['pecho'], secundarios: ['triceps', 'hombros'],
    detalle: 'Versión fácil de la flexión: cuanto más alto el apoyo, más fácil.', equipo: 'Mesa o banco firme', nivel: 'principiante',
    pasos: ['Apoya las manos en el borde de una mesa o banco firme.', 'Echa los pies atrás hasta tener el cuerpo recto.', 'Baja el pecho hacia el borde.', 'Empuja hasta estirar los brazos.'],
    respiracion: RESP_EMPUJE,
    errores: [['Usar un apoyo que se mueve.', 'Comprueba que la mesa no vuelca ni resbala.'], ['Hundir la cadera.', 'Aprieta glúteos y abdomen.']],
    principiantes: ['Baja la altura del apoyo poco a poco hasta llegar al suelo.'],
    alternativas: [['Flexiones', 'Cuando hagas 15 seguidas con facilidad.']],
    visual: ek('flexiones', 'La ilustración muestra las manos en el suelo; en la inclinada las apoyas en una superficie firme y elevada, y el movimiento es el mismo.'),
  },
  'Press inclinado con mancuernas': {
    nombre: 'Press inclinado con mancuernas', principales: ['pecho'], secundarios: ['hombros', 'triceps'],
    detalle: 'Parte alta del pectoral (haz clavicular).', equipo: 'Mancuernas y banco inclinado', nivel: 'intermedio',
    pasos: ['Pon el banco a unos 30°.', 'Lleva las mancuernas sobre la parte alta del pecho con los brazos estirados.', 'Baja hasta los lados de la parte alta del pecho.', 'Empuja hasta arriba sin chocarlas.'],
    respiracion: RESP_EMPUJE,
    errores: [['Banco demasiado vertical (más de 45°).', 'Con 30° trabaja más el pecho y menos el hombro.'], ['Arquear mucho la espalda.', 'Mantén glúteos y espalda alta en el banco.']],
    principiantes: ['Usa algo menos de peso que en el press plano.'],
    alternativas: [['Flexiones con pies elevados', 'Sin material.'], ['Press con mancuernas', 'Si no hay banco inclinable.']],
    visual: ek('press-inclinado-mancuernas'),
  },
  'Aperturas con mancuernas': {
    nombre: 'Aperturas con mancuernas', principales: ['pecho'], secundarios: ['hombros'],
    detalle: 'Pectoral en estiramiento; ejercicio de aislamiento.', equipo: 'Mancuernas y banco', nivel: 'intermedio',
    pasos: ['Túmbate con las mancuernas arriba, palmas enfrentadas y codos un poco doblados.', 'Abre los brazos en arco manteniendo ese ángulo de codo.', 'Baja hasta notar estiramiento en el pecho, sin pasar la línea del hombro.', 'Cierra en el mismo arco como si abrazaras un árbol.'],
    respiracion: 'Toma aire al abrir y suéltalo al cerrar.',
    errores: [['Bajar demasiado y forzar el hombro.', 'Para cuando los codos lleguen a la altura del banco.'], ['Convertirlo en un press doblando los codos.', 'Mantén el mismo ángulo de codo todo el recorrido.']],
    principiantes: ['Usa poco peso: aquí manda el control, no los kilos.'],
    alternativas: [['Press con mancuernas', 'Si notas molestias en el hombro.']],
    visual: ek('aperturas-mancuernas', 'La ilustración usa un banco ligeramente inclinado; en plano se hace igual.'),
  },
  'Fondos en paralelas': {
    nombre: 'Fondos en paralelas', principales: ['pecho', 'triceps'], secundarios: ['hombros'],
    detalle: 'Pectoral inferior y tríceps; exige hombros sanos.', equipo: 'Paralelas', nivel: 'avanzado',
    pasos: ['Sujétate en las barras con los brazos estirados y los hombros bajos.', 'Inclina un poco el tronco hacia delante.', 'Baja doblando los codos hasta unos 90°.', 'Empuja hasta estirar los brazos.'],
    respiracion: RESP_EMPUJE,
    errores: [['Bajar más de lo que tolera el hombro.', 'Para a 90° de codo o antes si notas molestia.'], ['Encoger los hombros hacia las orejas.', 'Empuja las barras hacia abajo y mantén el cuello largo.']],
    principiantes: ['Empieza con máquina asistida o con una goma, o haz fondos en silla.'],
    alternativas: [['Fondos en silla', 'Versión más fácil en casa.'], ['Press con mancuernas', 'Si te molestan los hombros.']],
    visual: ek('fondos-paralelas', 'La ilustración muestra las rodillas dobladas, una forma habitual de hacerlos.'),
  },
  // ---------------- Hombro ----------------
  'Press militar': {
    nombre: 'Press militar', principales: ['hombros'], secundarios: ['triceps', 'abdomen'],
    detalle: 'Deltoides (sobre todo la parte delantera) y tríceps.', equipo: 'Barra', nivel: 'intermedio',
    pasos: ['Coge la barra a la altura de la clavícula, algo más ancho que los hombros.', 'Aprieta glúteos y abdomen.', 'Sube la barra en línea recta apartando la cabeza un poco hacia atrás.', 'Estira los brazos con la barra sobre la cabeza y baja controlando.'],
    respiracion: RESP_EMPUJE,
    errores: [['Arquear la zona lumbar.', 'Aprieta glúteos y abdomen; baja el peso.'], ['Empujar la barra hacia delante.', 'Llévala recta, pegada a la cara.']],
    principiantes: ['Aprende primero con mancuernas sentado.'],
    alternativas: [['Press de hombros con mancuernas', 'Más cómodo para la muñeca y el hombro.'], ['Flexiones pica', 'Sin material.']],
    visual: ek('press-militar', 'La ilustración lo muestra sentado; de pie es igual, apretando glúteos y abdomen.'),
  },
  'Press de hombros con mancuernas': {
    nombre: 'Press de hombros con mancuernas', principales: ['hombros'], secundarios: ['triceps'],
    detalle: 'Deltoides anterior y medio.', equipo: 'Mancuernas', nivel: 'principiante',
    pasos: ['Sentado o de pie, coloca las mancuernas a la altura de los hombros con las palmas hacia delante.', 'Abdomen firme y espalda recta.', 'Empuja hacia arriba hasta casi estirar los brazos.', 'Baja despacio hasta los hombros.'],
    respiracion: RESP_EMPUJE,
    errores: [['Impulsarse con las piernas.', 'Hazlo sentado con respaldo si te cuesta no ayudarte.'], ['Arquear la espalda.', 'Aprieta el abdomen y baja el peso.']],
    principiantes: ['Sentado con respaldo es la forma más segura de empezar.'],
    alternativas: [['Press militar', 'Para progresar con barra.'], ['Flexiones pica', 'Sin material.']],
    visual: ek('press-hombros-mancuernas', 'La ilustración lo muestra a una mano; con las dos a la vez es igual.'),
  },
  'Elevaciones laterales': {
    nombre: 'Elevaciones laterales', principales: ['hombros'], secundarios: [],
    detalle: 'Deltoides medio (da anchura al hombro).', equipo: 'Mancuernas', nivel: 'principiante',
    pasos: ['De pie, mancuernas a los lados y codos ligeramente doblados.', 'Sube los brazos hacia los lados hasta la altura de los hombros.', 'Para un instante arriba.', 'Baja despacio.'],
    respiracion: 'Suelta el aire al subir y tómalo al bajar.',
    errores: [['Balancear el cuerpo para subirlas.', 'Usa menos peso y sube controlando.'], ['Subir por encima de los hombros encogiendo el cuello.', 'Para a la altura del hombro.']],
    principiantes: ['Con 2-5 kg es suficiente al principio.'],
    alternativas: [['Press de hombros con mancuernas', 'Si quieres mover más peso.']],
    visual: ek('elevaciones-laterales'),
  },
  'Flexiones pica': {
    nombre: 'Flexiones pica', principales: ['hombros'], secundarios: ['triceps'],
    detalle: 'Hombro y tríceps sin material.', equipo: 'Ninguno', nivel: 'intermedio',
    pasos: ['Colócate en posición de flexión y sube la cadera formando una V invertida.', 'Manos algo más abiertas que los hombros.', 'Dobla los codos llevando la cabeza hacia el suelo por delante de las manos, como si formaran un triángulo.', 'Empuja hasta estirar los brazos.'],
    respiracion: RESP_EMPUJE,
    errores: [['Bajar la cadera y convertirlo en flexión normal.', 'Mantén la cadera alta todo el rato.'], ['Abrir los codos del todo.', 'Llévalos un poco hacia atrás.']],
    principiantes: ['Baja solo hasta donde controles; aumenta el recorrido poco a poco.'],
    alternativas: [['Press de hombros con mancuernas', 'Con material.'], ['Flexiones', 'Si te cuesta la posición.']],
    visual: ek('flexiones', 'Ilustración de referencia: una flexión normal. En la pica la cadera va alta (forma de V) y el cuerpo baja inclinado hacia delante, con la cabeza entre los brazos.'),
  },
  // ---------------- Tríceps ----------------
  'Extensión de tríceps en polea': {
    nombre: 'Extensión de tríceps en polea', principales: ['triceps'], secundarios: [],
    detalle: 'Tríceps, sobre todo las cabezas lateral y medial.', equipo: 'Polea alta', nivel: 'principiante',
    pasos: ['De pie frente a la polea, agarra la barra o cuerda con los codos pegados al cuerpo.', 'Estira los brazos hacia abajo sin mover los codos.', 'Aprieta el tríceps abajo.', 'Sube despacio hasta que los antebrazos queden paralelos al suelo.'],
    respiracion: 'Suelta el aire al estirar y tómalo al subir.',
    errores: [['Mover los codos hacia delante.', 'Imagina que los codos están pegados a las costillas.'], ['Inclinarse encima del peso.', 'Mantente casi erguido y baja el peso.']],
    principiantes: ['Es un buen ejercicio para empezar: fácil de controlar.'],
    alternativas: [['Extensión de tríceps con mancuerna', 'Sin polea.'], ['Fondos en silla', 'En casa.']],
    visual: ek('extension-triceps-polea'),
  },
  'Extensión de tríceps con mancuerna': {
    nombre: 'Extensión de tríceps con mancuerna', principales: ['triceps'], secundarios: [],
    detalle: 'Tríceps, sobre todo la cabeza larga (por la posición del brazo sobre la cabeza).', equipo: 'Mancuerna', nivel: 'principiante',
    pasos: ['Sentado o de pie, sujeta una mancuerna con las dos manos sobre la cabeza.', 'Baja la mancuerna detrás de la cabeza doblando los codos, que apuntan hacia arriba.', 'Estira los brazos hasta arriba.', 'Repite manteniendo los codos cerca de la cabeza.'],
    respiracion: 'Toma aire al bajar y suéltalo al estirar.',
    errores: [['Abrir los codos hacia los lados.', 'Mantenlos apuntando al techo.'], ['Arquear la espalda.', 'Hazlo sentado con respaldo y abdomen firme.']],
    principiantes: ['Empieza con poco peso: la bajada detrás de la cabeza requiere control.'],
    alternativas: [['Extensión de tríceps en polea', 'En el gimnasio.'], ['Fondos en silla', 'Sin material.']],
    visual: ek('extension-triceps-mancuerna', 'La ilustración usa una barra; con una mancuerna sujeta con las dos manos el movimiento es el mismo.'),
  },
  'Fondos en silla': {
    nombre: 'Fondos en silla', principales: ['triceps'], secundarios: ['pecho', 'hombros'],
    detalle: 'Tríceps con el peso del cuerpo.', equipo: 'Silla firme o banco', nivel: 'principiante',
    pasos: ['Apoya las manos en el borde de una silla firme, dedos hacia delante.', 'Adelanta los pies y deja la cadera cerca de la silla.', 'Baja doblando los codos hasta unos 90°.', 'Empuja hasta estirar los brazos.'],
    respiracion: RESP_EMPUJE,
    errores: [['Alejar la cadera de la silla.', 'Baja casi rozando el borde.'], ['Bajar demasiado.', 'Para a 90° de codo para cuidar el hombro.']],
    principiantes: ['Con las rodillas dobladas es más fácil; estira las piernas para hacerlo más difícil.'],
    alternativas: [['Extensión de tríceps con mancuerna', 'Si te molesta el hombro.'], ['Fondos en paralelas', 'Para progresar.']],
    visual: ek('fondos-silla', 'La ilustración usa un banco; con una silla firme apoyada en la pared es igual.'),
  },
  // ---------------- Espalda ----------------
  'Jalón al pecho': {
    nombre: 'Jalón al pecho', principales: ['espalda'], secundarios: ['biceps'],
    detalle: 'Dorsal ancho y músculos entre las escápulas; ayuda el bíceps.', equipo: 'Polea alta', nivel: 'principiante',
    pasos: ['Siéntate con los muslos sujetos bajo los rodillos.', 'Agarra la barra algo más ancho que los hombros.', 'Saca pecho y tira de la barra hacia la parte alta del pecho llevando los codos hacia abajo.', 'Sube despacio hasta estirar los brazos.'],
    respiracion: RESP_TIRON,
    errores: [['Echarse muy atrás para tirar.', 'Inclínate solo un poco y baja el peso.'], ['Tirar detrás de la nuca.', 'Lleva la barra siempre por delante, al pecho.']],
    principiantes: ['Piensa en llevar los codos a los bolsillos, no en tirar con las manos.'],
    alternativas: [['Dominadas', 'Para progresar con tu peso.'], ['Remo invertido bajo una mesa', 'En casa.']],
    visual: ek('jalon-al-pecho', 'La ilustración usa un agarre estrecho en V; el movimiento hacia el pecho es el mismo.'),
  },
  Dominadas: {
    nombre: 'Dominadas', principales: ['espalda'], secundarios: ['biceps'],
    detalle: 'Dorsal ancho, romboides y bíceps.', equipo: 'Barra de dominadas', nivel: 'avanzado',
    pasos: ['Cuélgate con las manos algo más abiertas que los hombros y palmas hacia delante.', 'Baja los hombros (aléjalos de las orejas).', 'Sube hasta que la barbilla pase la barra.', 'Baja del todo controlando.'],
    respiracion: RESP_TIRON,
    errores: [['Balancearse o dar patadas.', 'Cruza los pies y aprieta el abdomen.'], ['Hacer medias repeticiones.', 'Baja hasta estirar los brazos en cada repetición.']],
    principiantes: ['Usa una goma elástica, máquina asistida o haz solo la bajada lenta (negativas).'],
    alternativas: [['Jalón al pecho', 'Si aún no haces dominadas.'], ['Remo invertido bajo una mesa', 'En casa.']],
    visual: ek('dominadas'),
  },
  'Pullover con mancuerna': {
    nombre: 'Pullover con mancuerna', principales: ['espalda', 'pecho'], secundarios: ['triceps'],
    detalle: 'Dorsal y pectoral en estiramiento.', equipo: 'Mancuerna y banco', nivel: 'intermedio',
    pasos: ['Túmbate y sujeta una mancuerna con las dos manos sobre el pecho, brazos casi rectos.', 'Lleva la mancuerna en arco hacia atrás, por detrás de la cabeza.', 'Baja hasta notar estiramiento sin arquear la espalda.', 'Vuelve en el mismo arco hasta sobre el pecho.'],
    respiracion: 'Toma aire al bajar la mancuerna y suéltalo al volver.',
    errores: [['Doblar mucho los codos.', 'Mantén los brazos casi rectos.'], ['Arquear la zona lumbar.', 'Aprieta el abdomen y no bajes tanto.']],
    principiantes: ['Usa poco peso y sujeta bien la mancuerna por el disco.'],
    alternativas: [['Jalón al pecho', 'Para la espalda con más peso.']],
    visual: ek('pullover-mancuerna'),
  },
  'Remo invertido bajo una mesa': {
    nombre: 'Remo invertido bajo una mesa', principales: ['espalda'], secundarios: ['biceps'],
    detalle: 'Espalda media y dorsal con el peso del cuerpo.', equipo: 'Mesa muy firme', nivel: 'principiante',
    pasos: ['Túmbate bajo una mesa muy firme y agarra el borde con las manos a la anchura de los hombros.', 'Pon el cuerpo recto apoyando los talones.', 'Tira del pecho hacia el borde juntando las escápulas.', 'Baja despacio hasta estirar los brazos.'],
    respiracion: RESP_TIRON,
    errores: [['Usar una mesa que pueda volcarse.', 'Comprueba antes que soporta tu peso; si dudas, no lo hagas.'], ['Dejar caer la cadera.', 'Aprieta glúteos y abdomen.']],
    principiantes: ['Con las rodillas dobladas es más fácil.'],
    alternativas: [['Remo con mochila', 'Si no tienes una mesa segura.'], ['Remo en polea', 'En el gimnasio.']],
    visual: ek('remo-invertido', 'La ilustración usa una barra fija; con el borde de una mesa firme es el mismo movimiento.'),
  },
  'Remo en polea': {
    nombre: 'Remo en polea', principales: ['espalda'], secundarios: ['biceps'],
    detalle: 'Romboides, trapecio medio y dorsal.', equipo: 'Polea baja', nivel: 'principiante',
    pasos: ['Siéntate con los pies apoyados y las rodillas algo dobladas.', 'Agarra el asa con la espalda recta.', 'Tira hacia el abdomen juntando las escápulas.', 'Vuelve despacio estirando los brazos sin encorvarte.'],
    respiracion: RESP_TIRON,
    errores: [['Balancear el tronco adelante y atrás.', 'El tronco casi quieto; tira con la espalda.'], ['Encoger los hombros.', 'Hombros bajos y lejos de las orejas.']],
    principiantes: ['Piensa en sacar pecho al tirar.'],
    alternativas: [['Remo con mancuerna', 'Sin polea.'], ['Remo invertido bajo una mesa', 'En casa.']],
    visual: ek('remo-polea'),
  },
  'Remo con barra': {
    nombre: 'Remo con barra', principales: ['espalda'], secundarios: ['biceps', 'femoral'],
    detalle: 'Toda la espalda; los femorales y lumbares sujetan la postura.', equipo: 'Barra', nivel: 'intermedio',
    pasos: ['De pie, inclina el tronco a unos 45° llevando la cadera atrás y con la espalda recta.', 'Agarra la barra con los brazos estirados.', 'Tira de la barra hacia el abdomen llevando los codos atrás.', 'Baja controlando sin perder la postura.'],
    respiracion: RESP_TIRON,
    errores: [['Redondear la espalda.', 'Saca pecho y baja el peso.'], ['Levantar el tronco para subir la barra.', 'Mantén el ángulo del tronco todo el rato.']],
    principiantes: ['Aprende antes la bisagra de cadera con el peso muerto rumano.'],
    alternativas: [['Remo con mancuerna', 'Con apoyo para la zona lumbar.'], ['Remo en polea', 'Más fácil de controlar.']],
    visual: ek('remo-barra', 'La ilustración usa agarre con las palmas hacia arriba; con las palmas hacia abajo es igual.'),
  },
  'Remo con mancuerna': {
    nombre: 'Remo con mancuerna', principales: ['espalda'], secundarios: ['biceps'],
    detalle: 'Dorsal y espalda media, un lado cada vez.', equipo: 'Mancuerna y banco', nivel: 'principiante',
    pasos: ['Apoya una mano y la rodilla del mismo lado en un banco.', 'Espalda recta y paralela al suelo.', 'Tira de la mancuerna hacia la cadera con el codo pegado.', 'Baja hasta estirar el brazo.'],
    respiracion: RESP_TIRON,
    errores: [['Girar el tronco para subirla.', 'Mantén los hombros paralelos al banco.'], ['Tirar hacia el hombro.', 'Lleva la mancuerna hacia la cadera.']],
    principiantes: ['Muy buen ejercicio para aprender a tirar con la espalda.'],
    alternativas: [['Remo con mochila', 'En casa.'], ['Remo en polea', 'En el gimnasio.']],
    visual: ek('remo-mancuerna'),
  },
  'Remo con mochila': {
    nombre: 'Remo con mochila', principales: ['espalda'], secundarios: ['biceps'],
    detalle: 'Espalda con una mochila cargada como peso.', equipo: 'Mochila con libros o botellas', nivel: 'principiante',
    pasos: ['Carga una mochila y sujétala por las asas.', 'Inclínate llevando la cadera atrás con la espalda recta.', 'Tira de la mochila hacia el abdomen.', 'Baja despacio.'],
    respiracion: RESP_TIRON,
    errores: [['Dar tirones rápidos.', 'Sube y baja controlando.'], ['Redondear la espalda.', 'Saca pecho y apoya una mano si hace falta.']],
    principiantes: ['Revisa que las asas aguantan el peso antes de empezar.'],
    alternativas: [['Remo invertido bajo una mesa', 'Si tienes una mesa segura.'], ['Remo con mancuerna', 'Con material.']],
    visual: ek('remo-barra', 'Ilustración de referencia con barra: con la mochila sujeta por las asas el movimiento es el mismo.'),
  },
  // ---------------- Bíceps ----------------
  'Curl con barra': {
    nombre: 'Curl con barra', principales: ['biceps'], secundarios: [],
    detalle: 'Bíceps y braquial.', equipo: 'Barra', nivel: 'principiante',
    pasos: ['De pie, agarra la barra con las palmas hacia arriba a la anchura de los hombros.', 'Codos pegados al cuerpo.', 'Sube la barra doblando los codos.', 'Baja despacio hasta estirar los brazos.'],
    respiracion: 'Suelta el aire al subir y tómalo al bajar.',
    errores: [['Balancear el cuerpo.', 'Baja el peso y apoya la espalda en una pared si hace falta.'], ['Adelantar los codos.', 'Mantenlos pegados a las costillas.']],
    principiantes: ['Controla la bajada: es la mitad del trabajo.'],
    alternativas: [['Curl con mancuernas', 'Más cómodo para las muñecas.'], ['Curl con mochila', 'En casa.']],
    visual: ek('curl-barra'),
  },
  'Curl con mancuernas': {
    nombre: 'Curl con mancuernas', principales: ['biceps'], secundarios: [],
    detalle: 'Bíceps y braquial, cada brazo por separado.', equipo: 'Mancuernas', nivel: 'principiante',
    pasos: ['De pie, mancuernas a los lados con las palmas hacia delante.', 'Codos pegados al cuerpo.', 'Sube las mancuernas doblando los codos.', 'Baja despacio.'],
    respiracion: 'Suelta el aire al subir y tómalo al bajar.',
    errores: [['Mover los codos hacia delante.', 'Mantenlos quietos junto al cuerpo.'], ['Balancearse.', 'Usa menos peso.']],
    principiantes: ['Puedes alternar brazos para concentrarte en cada uno.'],
    alternativas: [['Curl con barra', 'Para mover más peso.'], ['Curl con mochila', 'En casa.']],
    visual: ek('curl-mancuernas'),
  },
  'Curl con mochila': {
    nombre: 'Curl con mochila', principales: ['biceps'], secundarios: [],
    detalle: 'Bíceps usando una mochila cargada.', equipo: 'Mochila cargada', nivel: 'principiante',
    pasos: ['Agarra la mochila por el asa superior.', 'Codo pegado al cuerpo.', 'Sube doblando el codo.', 'Baja despacio sin dejarla caer.'],
    respiracion: 'Suelta el aire al subir y tómalo al bajar.',
    errores: [['Dejarla caer de golpe.', 'Controla la bajada.'], ['Mover el hombro.', 'Solo se mueve el codo.']],
    principiantes: ['Ajusta el peso con más o menos libros.'],
    alternativas: [['Curl con mancuernas', 'Con material.']],
    visual: ek('curl-mancuernas', 'Ilustración de referencia con mancuernas: con la mochila el movimiento es el mismo.'),
  },
  // ---------------- Pierna ----------------
  Prensa: {
    nombre: 'Prensa', principales: ['cuadriceps', 'gluteo'], secundarios: ['femoral'],
    detalle: 'Cuádriceps y glúteo con la espalda apoyada.', equipo: 'Máquina de prensa', nivel: 'principiante',
    pasos: ['Siéntate con la espalda y la cadera bien apoyadas.', 'Pies en la plataforma a la anchura de los hombros.', 'Quita los seguros y baja doblando las rodillas hasta unos 90°.', 'Empuja hasta casi estirar las piernas, sin bloquear las rodillas.'],
    respiracion: RESP_PIERNA,
    errores: [['Despegar la zona lumbar del respaldo al bajar.', 'No bajes tanto; para antes de que la cadera se levante.'], ['Bloquear las rodillas arriba.', 'Deja una ligera flexión.'], ['Rodillas hacia dentro.', 'Empújalas en la dirección de los pies.']],
    principiantes: ['Aprende a usar los seguros antes de cargar peso.'],
    alternativas: [['Sentadilla goblet', 'Sin máquina.'], ['Sentadilla', 'Para progresar con barra.']],
    visual: ek('prensa'),
  },
  Sentadilla: {
    nombre: 'Sentadilla', principales: ['cuadriceps', 'gluteo'], secundarios: ['femoral', 'abdomen'],
    detalle: 'Cuádriceps, glúteo y aductores; el tronco trabaja para mantener la postura.', equipo: 'Barra y soporte', nivel: 'intermedio',
    pasos: ['Coloca la barra sobre la parte alta de la espalda, no sobre el cuello.', 'Pies a la anchura de los hombros, puntas algo abiertas.', 'Toma aire, aprieta el abdomen y baja llevando la cadera atrás y abajo.', 'Baja hasta que el muslo quede al menos paralelo al suelo si tu movilidad lo permite.', 'Sube empujando el suelo con todo el pie.'],
    respiracion: RESP_PIERNA,
    errores: [['Rodillas hacia dentro.', 'Empújalas hacia fuera, en la línea de los pies.'], ['Levantar los talones.', 'Reparte el peso por todo el pie; mejora la movilidad del tobillo.'], ['Redondear la espalda abajo.', 'No bajes tanto y mantén el pecho alto.']],
    principiantes: ['Domina antes la sentadilla goblet.', 'Usa siempre los soportes de seguridad.'],
    alternativas: [['Sentadilla goblet', 'Para aprender la técnica.'], ['Prensa', 'Si te molesta la espalda.']],
    visual: ek('sentadilla'),
  },
  'Sentadilla goblet': {
    nombre: 'Sentadilla goblet', principales: ['cuadriceps', 'gluteo'], secundarios: ['abdomen'],
    detalle: 'Cuádriceps y glúteo; el peso delante ayuda a mantener el tronco erguido.', equipo: 'Mancuerna o kettlebell', nivel: 'principiante',
    pasos: ['Sujeta una mancuerna en vertical pegada al pecho.', 'Pies a la anchura de los hombros.', 'Baja como para sentarte, con los codos entre las rodillas.', 'Sube empujando el suelo.'],
    respiracion: RESP_PIERNA,
    errores: [['Levantar los talones.', 'Peso en todo el pie; abre un poco más las piernas.'], ['Encorvar la espalda.', 'Mantén el pecho alto y la mancuerna pegada.']],
    principiantes: ['La mejor forma de aprender a hacer sentadillas.'],
    alternativas: [['Sentadilla con peso corporal', 'Sin material.'], ['Prensa', 'En máquina.']],
    visual: ek('sentadilla', 'Ilustración de referencia con barra: en la goblet sujetas una mancuerna pegada al pecho y el movimiento es el mismo.'),
  },
  'Sentadilla con peso corporal': {
    nombre: 'Sentadilla con peso corporal', principales: ['cuadriceps', 'gluteo'], secundarios: [],
    detalle: 'Cuádriceps y glúteo sin material.', equipo: 'Ninguno', nivel: 'principiante',
    pasos: ['De pie, pies a la anchura de los hombros.', 'Lleva los brazos al frente para equilibrarte.', 'Baja la cadera atrás y abajo con el pecho alto.', 'Sube empujando el suelo.'],
    respiracion: RESP_PIERNA,
    errores: [['Encorvar la espalda.', 'Mira al frente y saca pecho.'], ['Rodillas hacia dentro.', 'Empújalas hacia fuera.']],
    principiantes: ['Si te cuesta, baja hasta sentarte en una silla y vuelve a subir.'],
    alternativas: [['Sentadilla goblet', 'Para añadir peso.'], ['Zancadas', 'Para trabajar cada pierna.']],
    visual: ek('sentadilla', 'Ilustración de referencia con barra: sin peso, con los brazos estirados al frente, el movimiento es el mismo.'),
  },
  'Peso muerto rumano': {
    nombre: 'Peso muerto rumano', principales: ['femoral', 'gluteo'], secundarios: ['espalda'],
    detalle: 'Isquiotibiales y glúteo; la zona lumbar trabaja para mantener la espalda recta.', equipo: 'Barra', nivel: 'intermedio',
    pasos: ['De pie con la barra en las manos y las rodillas apenas dobladas.', 'Lleva la cadera hacia atrás bajando la barra pegada a las piernas.', 'Baja hasta notar tensión en la parte trasera del muslo, con la espalda recta.', 'Sube empujando la cadera hacia delante.'],
    respiracion: RESP_PIERNA,
    errores: [['Redondear la espalda.', 'Baja solo hasta donde mantengas la espalda recta.'], ['Separar la barra de las piernas.', 'Que roce los muslos durante todo el recorrido.']],
    principiantes: ['Practica la bisagra con un palo apoyado en la espalda.'],
    alternativas: [['Peso muerto rumano con mancuernas', 'Más fácil de aprender.'], ['Puente de glúteo', 'Si te molesta la zona lumbar.']],
    visual: ek('peso-muerto-rumano'),
  },
  'Peso muerto rumano con mancuernas': {
    nombre: 'Peso muerto rumano con mancuernas', principales: ['femoral', 'gluteo'], secundarios: ['espalda'],
    detalle: 'Isquiotibiales y glúteo.', equipo: 'Mancuernas', nivel: 'principiante',
    pasos: ['De pie con una mancuerna en cada mano delante de los muslos.', 'Rodillas apenas dobladas.', 'Lleva la cadera atrás bajando las mancuernas pegadas a las piernas.', 'Sube empujando la cadera hacia delante.'],
    respiracion: RESP_PIERNA,
    errores: [['Doblar demasiado las rodillas.', 'Es la cadera la que va atrás, no una sentadilla.'], ['Redondear la espalda.', 'Saca pecho y no bajes tanto.']],
    principiantes: ['Empieza con poco peso hasta sentir el estiramiento del femoral.'],
    alternativas: [['Peso muerto rumano', 'Con barra para más peso.'], ['Puente de glúteo', 'Sin carga en la espalda.']],
    visual: ek('peso-muerto-rumano', 'Ilustración de referencia con barra: con mancuernas el movimiento es el mismo.'),
  },
  'Curl femoral': {
    nombre: 'Curl femoral', principales: ['femoral'], secundarios: ['gemelos'],
    detalle: 'Isquiotibiales aislados.', equipo: 'Máquina de femoral', nivel: 'principiante',
    pasos: ['Túmbate boca abajo con el rodillo sobre los tobillos y las rodillas justo fuera del banco.', 'Agarra las asas.', 'Dobla las rodillas llevando los talones hacia los glúteos.', 'Baja despacio.'],
    respiracion: 'Suelta el aire al doblar y tómalo al bajar.',
    errores: [['Levantar la cadera.', 'Mantén la cadera pegada al banco; baja el peso.'], ['Soltar el peso de golpe.', 'Controla la bajada.']],
    principiantes: ['Ajusta el rodillo para que apoye justo encima del tobillo.'],
    alternativas: [['Peso muerto rumano con mancuernas', 'Sin máquina.'], ['Puente de glúteo', 'En casa.']],
    visual: ek('curl-femoral'),
  },
  'Puente de glúteo': {
    nombre: 'Puente de glúteo', principales: ['gluteo'], secundarios: ['femoral'],
    detalle: 'Glúteo mayor e isquiotibiales.', equipo: 'Ninguno (o peso sobre la cadera)', nivel: 'principiante',
    pasos: ['Túmbate boca arriba con las rodillas dobladas y los pies apoyados.', 'Aprieta el abdomen.', 'Sube la cadera apretando los glúteos hasta formar una línea de rodillas a hombros.', 'Para un segundo arriba y baja despacio.'],
    respiracion: 'Suelta el aire al subir y tómalo al bajar.',
    errores: [['Arquear la zona lumbar arriba.', 'Sube solo hasta la línea recta, apretando glúteos.'], ['Empujar con las puntas.', 'Empuja con los talones.']],
    principiantes: ['Añade una mochila sobre la cadera cuando te resulte fácil.'],
    alternativas: [['Peso muerto rumano con mancuernas', 'Para más carga.']],
    visual: ek('puente-gluteo'),
  },
  'Zancadas con mancuernas': {
    nombre: 'Zancadas con mancuernas', principales: ['cuadriceps', 'gluteo'], secundarios: ['femoral'],
    detalle: 'Cuádriceps y glúteo, cada pierna por separado.', equipo: 'Mancuernas', nivel: 'intermedio',
    pasos: ['De pie con una mancuerna en cada mano.', 'Da un paso largo hacia delante.', 'Baja hasta que la rodilla de atrás casi toque el suelo.', 'Empuja con el pie de delante para volver.'],
    respiracion: RESP_PIERNA,
    errores: [['Dar un paso demasiado corto.', 'Que ambas rodillas formen unos 90° abajo.'], ['Rodilla de delante hacia dentro.', 'Mantenla en la línea del pie.']],
    principiantes: ['Apóyate en una pared con una mano para el equilibrio.'],
    alternativas: [['Zancadas', 'Sin peso.'], ['Subidas al cajón', 'Si te cuesta el equilibrio.']],
    visual: ek('zancadas'),
  },
  Zancadas: {
    nombre: 'Zancadas', principales: ['cuadriceps', 'gluteo'], secundarios: ['femoral'],
    detalle: 'Cuádriceps y glúteo con el peso del cuerpo.', equipo: 'Ninguno', nivel: 'principiante',
    pasos: ['De pie, manos en la cintura.', 'Da un paso largo hacia delante.', 'Baja con el tronco recto hasta casi tocar el suelo con la rodilla de atrás.', 'Vuelve empujando con el pie de delante.'],
    respiracion: RESP_PIERNA,
    errores: [['Rodilla de delante hacia dentro.', 'Mantenla alineada con el pie.'], ['Inclinar el tronco.', 'Mira al frente con el pecho alto.']],
    principiantes: ['Empieza con zancadas hacia atrás: son más fáciles para las rodillas.'],
    alternativas: [['Zancadas con mancuernas', 'Para añadir peso.'], ['Sentadilla con peso corporal', 'Si te cuesta el equilibrio.']],
    visual: ek('zancadas', 'Ilustración de referencia con mancuernas: sin peso es el mismo movimiento.'),
  },
  'Subidas al cajón': {
    nombre: 'Subidas al cajón', principales: ['cuadriceps', 'gluteo'], secundarios: [],
    detalle: 'Cuádriceps y glúteo de la pierna que sube.', equipo: 'Cajón, banco o escalón estable', nivel: 'principiante',
    pasos: ['Coloca un pie entero sobre un cajón estable.', 'Empuja con esa pierna para subir hasta quedar de pie encima.', 'Baja despacio con la misma pierna.', 'Haz todas las repeticiones y cambia de pierna.'],
    respiracion: RESP_PIERNA,
    errores: [['Impulsarse con la pierna de abajo.', 'El trabajo lo hace la pierna de arriba.'], ['Usar un apoyo inestable.', 'Comprueba que no se mueve ni resbala.']],
    principiantes: ['Empieza con un escalón bajo.'],
    alternativas: [['Zancadas', 'Sin cajón.'], ['Prensa', 'En máquina.']],
    visual: ek('subidas-cajon', 'La ilustración usa un banco y mancuernas; sin peso es igual.'),
  },
  'Elevación de gemelos': {
    nombre: 'Elevación de gemelos', principales: ['gemelos'], secundarios: [],
    detalle: 'Gemelos y sóleo.', equipo: 'Ninguno o peso', nivel: 'principiante',
    pasos: ['De pie con la punta de los pies en un escalón y los talones fuera.', 'Baja los talones hasta notar estiramiento.', 'Sube de puntillas lo más alto posible.', 'Para un segundo arriba y baja despacio.'],
    respiracion: 'Respira de forma normal; suelta el aire al subir.',
    errores: [['Hacer rebotes rápidos.', 'Sube y baja despacio con una pausa arriba.'], ['Recorrido corto.', 'Baja del todo y sube del todo.']],
    principiantes: ['Apóyate en una pared para el equilibrio.'],
    alternativas: [['Subidas al cajón', 'Trabajo de pierna completa.']],
    visual: ek('elevacion-gemelos', 'La ilustración usa una barra; sin peso o con mancuernas es igual.'),
  },
  // ---------------- Abdomen ----------------
  Plancha: {
    nombre: 'Plancha', principales: ['abdomen'], secundarios: ['hombros', 'gluteo'],
    detalle: 'Recto abdominal y transverso; ejercicio isométrico (sin movimiento).', equipo: 'Ninguno', nivel: 'principiante',
    pasos: ['Apoya los antebrazos con los codos bajo los hombros.', 'Estira las piernas apoyando las puntas de los pies.', 'Cuerpo recto de la cabeza a los talones, glúteos apretados.', 'Aguanta el tiempo indicado.'],
    respiracion: RESP_CORE,
    errores: [['Dejar caer la cadera.', 'Aprieta glúteos y mete un poco la pelvis.'], ['Subir mucho la cadera.', 'Busca una línea recta.']],
    principiantes: ['Empieza con las rodillas apoyadas o tandas de 15-20 segundos.'],
    alternativas: [['Plancha lateral', 'Para los oblicuos.'], ['Dead bug', 'Si te molesta la zona lumbar.']],
    visual: ek('flexiones', 'La plancha es la posición de arriba de la flexión (brazos estirados) y se mantiene quieta, sin bajar: cabeza, espalda, cadera y talones en línea recta.'),
  },
  'Plancha lateral': {
    nombre: 'Plancha lateral', principales: ['abdomen'], secundarios: ['hombros', 'gluteo'],
    detalle: 'Oblicuos y estabilizadores de la cadera.', equipo: 'Ninguno', nivel: 'principiante',
    pasos: ['De lado, apoya el antebrazo con el codo bajo el hombro.', 'Piernas estiradas una sobre otra.', 'Sube la cadera hasta formar una línea recta.', 'Aguanta y repite del otro lado.'],
    respiracion: RESP_CORE,
    errores: [['Dejar caer la cadera.', 'Empuja la cadera hacia el techo.'], ['Girar el tronco.', 'Mantén hombros y cadera en el mismo plano.']],
    principiantes: ['Apoya la rodilla de abajo para hacerla más fácil.'],
    alternativas: [['Plancha', 'Si te cuesta de lado.']],
    visual: ek('plancha-lateral', 'La ilustración la muestra con el brazo estirado; sobre el antebrazo es más fácil.'),
  },
  'Dead bug': {
    nombre: 'Dead bug', principales: ['abdomen'], secundarios: [],
    detalle: 'Transverso y recto abdominal con la zona lumbar protegida.', equipo: 'Ninguno', nivel: 'principiante',
    pasos: ['Túmbate boca arriba con los brazos hacia el techo y las rodillas dobladas a 90° en el aire.', 'Pega la zona lumbar al suelo.', 'Estira a la vez un brazo hacia atrás y la pierna contraria hacia delante sin despegar la espalda.', 'Vuelve y cambia de lado.'],
    respiracion: 'Suelta el aire al estirar brazo y pierna; tómalo al volver.',
    errores: [['Despegar la zona lumbar del suelo.', 'Estira menos la pierna hasta que puedas mantenerla pegada.'], ['Ir deprisa.', 'Movimiento lento y controlado.']],
    principiantes: ['Empieza moviendo solo las piernas.'],
    alternativas: [['Plancha', 'Otro ejercicio de estabilidad.']],
    visual: ek('elevacion-piernas', 'Ilustración de referencia: también se hace tumbado boca arriba con el abdomen firme. En el dead bug estiras brazo y pierna contrarios, sin despegar la zona lumbar.'),
  },
  'Crunch en polea': {
    nombre: 'Crunch en polea', principales: ['abdomen'], secundarios: [],
    detalle: 'Recto abdominal con carga.', equipo: 'Polea alta con cuerda', nivel: 'intermedio',
    pasos: ['De rodillas frente a la polea, sujeta la cuerda junto a la cabeza.', 'Lleva el pecho hacia las rodillas redondeando la espalda.', 'Aprieta el abdomen abajo.', 'Vuelve despacio sin dejar que el peso te levante.'],
    respiracion: 'Suelta el aire al encogerte y tómalo al volver.',
    errores: [['Tirar con los brazos.', 'Las manos quietas junto a la cabeza; mueve el tronco.'], ['Sentarse sobre los talones.', 'La cadera se mantiene quieta.']],
    principiantes: ['Empieza con poco peso para sentir el abdomen.'],
    alternativas: [['Encogimientos abdominales', 'Sin polea.'], ['Rueda abdominal', 'Más difícil.']],
    visual: ek('crunch-polea', 'La ilustración lo muestra sentado; de rodillas el movimiento del tronco es el mismo.'),
  },
  'Elevación de piernas': {
    nombre: 'Elevación de piernas', principales: ['abdomen'], secundarios: [],
    detalle: 'Recto abdominal (parte baja) y flexores de la cadera.', equipo: 'Ninguno', nivel: 'principiante',
    pasos: ['Túmbate boca arriba con las manos bajo los glúteos.', 'Piernas estiradas o algo dobladas.', 'Súbelas hasta la vertical sin despegar la zona lumbar.', 'Bájalas despacio sin tocar el suelo.'],
    respiracion: 'Suelta el aire al subir y tómalo al bajar.',
    errores: [['Arquear la zona lumbar al bajar.', 'No bajes tanto o dobla las rodillas.'], ['Dejar caer las piernas.', 'Baja en 2-3 segundos.']],
    principiantes: ['Con las rodillas dobladas es más fácil.'],
    alternativas: [['Dead bug', 'Más suave para la espalda.'], ['Encogimientos abdominales', 'Otra opción en el suelo.']],
    visual: ek('elevacion-piernas'),
  },
  'Encogimientos abdominales': {
    nombre: 'Encogimientos abdominales', principales: ['abdomen'], secundarios: [],
    detalle: 'Recto abdominal.', equipo: 'Ninguno', nivel: 'principiante',
    pasos: ['Túmbate boca arriba con las rodillas dobladas.', 'Manos junto a la cabeza sin tirar del cuello.', 'Despega los hombros del suelo acercando las costillas a la cadera.', 'Baja despacio.'],
    respiracion: 'Suelta el aire al subir y tómalo al bajar.',
    errores: [['Tirar del cuello con las manos.', 'Las manos solo acompañan; mira al techo.'], ['Subir con impulso.', 'Movimiento corto y controlado.']],
    principiantes: ['No hace falta subir mucho: basta despegar los hombros.'],
    alternativas: [['Plancha', 'Si te molesta el cuello.'], ['Crunch en polea', 'Con carga.']],
    visual: ek('encogimientos', 'La ilustración los muestra con las piernas sobre un banco; con los pies en el suelo es igual.'),
  },
  'Rueda abdominal': {
    nombre: 'Rueda abdominal', principales: ['abdomen'], secundarios: ['espalda', 'hombros'],
    detalle: 'Todo el abdomen trabajando para que no se hunda la cadera.', equipo: 'Rueda abdominal', nivel: 'avanzado',
    pasos: ['De rodillas, sujeta la rueda bajo los hombros.', 'Aprieta el abdomen y los glúteos.', 'Rueda hacia delante estirando el cuerpo sin arquear la espalda.', 'Vuelve tirando con el abdomen.'],
    respiracion: 'Toma aire al ir hacia delante y suéltalo al volver.',
    errores: [['Arquear la zona lumbar.', 'Avanza menos; aumenta el recorrido poco a poco.'], ['Volver tirando con la cadera.', 'Recoge con el abdomen, el cuerpo como un bloque.']],
    principiantes: ['Rueda hacia una pared para limitar el recorrido.'],
    alternativas: [['Plancha', 'Para ganar base primero.']],
    visual: ek('rueda-abdominal', 'La ilustración usa una barra con discos; con la rueda es el mismo movimiento.'),
  },
};

export const fichaDe = (nombre: string): Ficha | undefined => EJERCICIOS[nombre] ?? EJERCICIOS[Object.keys(EJERCICIOS).find((k) => k.toLowerCase() === nombre.trim().toLowerCase()) ?? ''];
export const imagenes = (v: Visual): string[] =>
  Array.from({ length: v.fotogramas ?? 2 }, (_, i) => `academia/${v.id}-${i + 1}.webp`);
export const NOMBRE_NIVEL: Record<Nivel, string> = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };
