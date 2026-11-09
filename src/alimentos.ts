import type { Stock } from './datos';

export type Unidad = 'g' | 'ml' | 'ud';
export type Tipo = 'proteina' | 'legumbre' | 'lacteo' | 'suplemento' | 'carbo' | 'verdura' | 'fruta' | 'grasa';
export type Ingrediente = {
  id: string;
  nombre: string;
  tipo: Tipo;
  unidad: Unidad;
  compra: number; // cantidad habitual al comprarlo
  por: number; // los valores son por esta cantidad
  p: number;
  kcal: number;
  h: number;
  g: number;
  claves: string[];
};

const i = (
  id: string, nombre: string, tipo: Tipo, unidad: Unidad, compra: number,
  [p, kcal, h, g]: number[], claves: string[], por = unidad === 'ud' ? 1 : 100,
): Ingrediente => ({ id, nombre, tipo, unidad, compra, por, p, kcal, h, g, claves });

export const INGREDIENTES: Ingrediente[] = [
  i('pollo', 'Pollo', 'proteina', 'g', 500, [23, 120, 0, 2], ['pollo', 'pechuga', 'contramuslo']),
  i('pavo', 'Pavo', 'proteina', 'g', 400, [24, 110, 0, 1], ['pavo']),
  i('carne', 'Carne picada', 'proteina', 'g', 400, [21, 170, 0, 10], ['carne picada', 'picada', 'ternera', 'carne', 'res', 'vacuno', 'solomillo']),
  i('cerdo', 'Cerdo', 'proteina', 'g', 400, [21, 145, 0, 6], ['cerdo', 'lomo']),
  i('atun', 'Atún', 'proteina', 'g', 160, [25, 120, 0, 1], ['atun', 'bonito']),
  i('salmon', 'Salmón', 'proteina', 'g', 300, [20, 208, 0, 13], ['salmon']),
  i('merluza', 'Merluza', 'proteina', 'g', 400, [18, 85, 0, 2], ['merluza', 'bacalao', 'dorada', 'lubina', 'pescado']),
  i('gambas', 'Gambas', 'proteina', 'g', 300, [20, 90, 0, 1], ['gamba', 'gambas', 'langostino', 'langostinos', 'camaron', 'camarones']),
  i('huevos', 'Huevos', 'proteina', 'ud', 12, [6, 70, 0.4, 5], ['huevo', 'huevos']),
  i('claras', 'Claras', 'proteina', 'ml', 500, [10, 50, 1, 0], ['claras', 'clara huevo']),
  i('tofu', 'Tofu', 'proteina', 'g', 250, [12, 120, 2, 7], ['tofu']),
  i('queso', 'Queso', 'lacteo', 'g', 250, [18, 280, 2, 22], ['queso']),
  i('yogur', 'Yogur', 'lacteo', 'g', 500, [10, 65, 4, 0], ['yogur', 'yogurt', 'skyr']),
  i('leche', 'Leche', 'lacteo', 'ml', 1000, [3.3, 60, 5, 3], ['leche']),
  i('caraotas', 'Caraotas', 'legumbre', 'g', 400, [8, 130, 23, 1], ['caraotas', 'alubias', 'alubia', 'judias negras', 'frijoles', 'frijol']),
  i('lentejas', 'Lentejas', 'legumbre', 'g', 400, [9, 115, 20, 0], ['lenteja', 'lentejas']),
  i('garbanzos', 'Garbanzos', 'legumbre', 'g', 400, [9, 140, 22, 3], ['garbanzo', 'garbanzos']),
  i('proteina_polvo', 'Proteína en polvo', 'suplemento', 'g', 1000, [75, 380, 8, 5], ['proteina polvo', 'whey', 'proteina']),
  i('harina', 'Harina de maíz', 'carbo', 'g', 1000, [7, 360, 77, 2], ['harina de maiz', 'harina maiz', 'harina pan', 'pan harina']),
  i('arroz', 'Arroz', 'carbo', 'g', 1000, [7, 360, 78, 1], ['arroz']),
  i('pasta', 'Pasta', 'carbo', 'g', 500, [12, 360, 72, 2], ['pasta', 'macarron', 'macarrones', 'espagueti', 'espaguetis', 'spaghetti', 'fideos', 'penne']),
  i('avena', 'Avena', 'carbo', 'g', 500, [13, 380, 60, 7], ['avena', 'copos avena']),
  i('pan', 'Pan', 'carbo', 'g', 400, [9, 265, 49, 3], ['pan', 'barra', 'integral molde', 'pan molde']),
  i('patata', 'Patata', 'carbo', 'g', 1000, [2, 77, 17, 0], ['patata', 'patatas', 'papa', 'papas']),
  i('batata', 'Batata', 'carbo', 'g', 500, [1.6, 86, 20, 0], ['batata', 'boniato']),
  i('tomate', 'Tomate', 'verdura', 'g', 500, [1, 18, 4, 0], ['tomate', 'tomates']),
  i('cebolla', 'Cebolla', 'verdura', 'g', 500, [1, 40, 9, 0], ['cebolla', 'cebollas']),
  i('ajo', 'Ajo', 'verdura', 'g', 50, [6, 150, 33, 0], ['ajo', 'ajos']),
  i('pimiento', 'Pimiento', 'verdura', 'g', 300, [1, 30, 6, 0], ['pimiento', 'pimientos']),
  i('zanahoria', 'Zanahoria', 'verdura', 'g', 500, [1, 40, 9, 0], ['zanahoria', 'zanahorias']),
  i('calabacin', 'Calabacín', 'verdura', 'g', 400, [1, 17, 3, 0], ['calabacin']),
  i('brocoli', 'Brócoli', 'verdura', 'g', 400, [3, 34, 7, 0], ['brocoli']),
  i('espinacas', 'Espinacas', 'verdura', 'g', 200, [3, 23, 4, 0], ['espinaca', 'espinacas']),
  i('lechuga', 'Lechuga', 'verdura', 'g', 300, [1, 15, 3, 0], ['lechuga', 'ensalada']),
  i('champinones', 'Champiñones', 'verdura', 'g', 250, [3, 22, 3, 0], ['champinon', 'champinones', 'setas']),
  i('aguacate', 'Aguacate', 'grasa', 'g', 300, [2, 160, 9, 15], ['aguacate', 'palta']),
  i('aceite', 'Aceite de oliva', 'grasa', 'ml', 1000, [0, 820, 0, 91], ['aceite']),
  i('frutos', 'Frutos secos', 'grasa', 'g', 200, [21, 580, 22, 50], ['almendra', 'almendras', 'nueces', 'nuez', 'cacahuete', 'cacahuetes', 'frutos secos']),
  i('platano', 'Plátano', 'fruta', 'g', 500, [1, 89, 23, 0], ['platano', 'platanos', 'banana', 'cambur']),
  i('manzana', 'Manzana', 'fruta', 'g', 500, [0, 52, 14, 0], ['manzana', 'manzanas']),
  i('fresas', 'Fresas', 'fruta', 'g', 400, [1, 32, 8, 0], ['fresa', 'fresas', 'frutos rojos', 'arandanos']),
  i('sardinas', 'Sardinas', 'proteina', 'g', 120, [21, 190, 0, 11], ['sardina', 'sardinas', 'caballa']),
  i('jamon', 'Jamón', 'proteina', 'g', 150, [18, 110, 1, 3], ['jamon', 'fiambre']),
  i('requeson', 'Requesón', 'lacteo', 'g', 250, [11, 100, 3, 4], ['requeson', 'cottage']),
  i('quinoa', 'Quinoa', 'carbo', 'g', 500, [14, 370, 64, 6], ['quinoa', 'quinua']),
  i('cuscus', 'Cuscús', 'carbo', 'g', 500, [13, 370, 72, 1], ['cuscus']),
  i('tortilla_trigo', 'Tortillas de trigo', 'carbo', 'g', 320, [8, 300, 50, 7], ['tortilla trigo', 'tortillas trigo', 'wrap', 'wraps', 'fajita', 'fajitas']),
  i('yuca', 'Yuca', 'carbo', 'g', 500, [1.4, 160, 38, 0], ['yuca', 'mandioca']),
  i('maiz', 'Maíz dulce', 'carbo', 'g', 300, [3, 90, 19, 1], ['maiz dulce', 'maiz', 'jojoto']),
  i('pepino', 'Pepino', 'verdura', 'g', 300, [1, 15, 3, 0], ['pepino', 'pepinos']),
  i('berenjena', 'Berenjena', 'verdura', 'g', 400, [1, 25, 6, 0], ['berenjena', 'berenjenas']),
  i('coliflor', 'Coliflor', 'verdura', 'g', 600, [2, 25, 5, 0], ['coliflor']),
  i('judias', 'Judías verdes', 'verdura', 'g', 400, [2, 31, 7, 0], ['judias verdes', 'vainitas', 'ejotes']),
  i('guisantes', 'Guisantes', 'verdura', 'g', 400, [5, 81, 14, 0], ['guisante', 'guisantes', 'arvejas']),
  i('naranja', 'Naranja', 'fruta', 'g', 1000, [1, 47, 12, 0], ['naranja', 'naranjas', 'mandarina', 'mandarinas']),
  i('pina', 'Piña', 'fruta', 'g', 1000, [1, 50, 13, 0], ['pina', 'anana']),
  i('mantequilla_cacahuete', 'Mantequilla de cacahuete', 'grasa', 'g', 350, [25, 600, 20, 50], ['mantequilla cacahuete', 'crema cacahuete']),
];

let propios: Ingrediente[] = [];
export const porId = (id: string) => INGREDIENTES.find((x) => x.id === id) ?? propios.find((x) => x.id === id);
export const todosLosIngredientes = () => [...INGREDIENTES, ...propios];

const normal = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n').replace(/[^a-z0-9.,/ ]+/g, ' ').replace(/\s+/g, ' ').trim();

function distancia(a: string, b: string) {
  const f = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let x = 1; x <= a.length; x++) {
    let previo = f[0];
    f[0] = x;
    for (let y = 1; y <= b.length; y++) {
      const t = f[y];
      f[y] = Math.min(f[y] + 1, f[y - 1] + 1, previo + (a[x - 1] === b[y - 1] ? 0 : 1));
      previo = t;
    }
  }
  return f[b.length];
}

// De la clave más específica a la más general ("harina pan" antes que "pan").
const calcularClaves = (xs: Ingrediente[]) =>
  xs.flatMap((x) => x.claves.map((c) => ({ c, x }))).sort((a, b) => b.c.length - a.c.length);
let CLAVES = calcularClaves(INGREDIENTES);

export function fijarPropios(lista: Ingrediente[]) {
  if (lista === propios) return;
  propios = lista;
  CLAVES = calcularClaves([...INGREDIENTES, ...lista]);
}

export function crearAlimento(nombre: string, tipo: Tipo, unidad: Unidad, [p, kcal, h, g]: number[]): Ingrediente {
  return {
    id: `p_${Date.now().toString(36)}`,
    nombre: nombre.trim(),
    tipo,
    unidad,
    compra: unidad === 'ud' ? 1 : 100,
    por: unidad === 'ud' ? 1 : 100,
    p, kcal, h, g,
    claves: [normal(nombre)],
  };
}
const NO_ES_COMIDA = /\b(dientes|dental|detergente|suavizante|champu|gel|papel|bolsa|gato|perro|corporal|lavavajillas|colonia)\b/;

export function buscarIngrediente(texto: string): Ingrediente | undefined {
  const t = ` ${normal(texto)} `;
  if (NO_ES_COMIDA.test(t)) return undefined;
  const exacta = CLAVES.find(({ c }) => t.includes(` ${c} `));
  if (exacta) return exacta.x;
  // Tolera erratas típicas de la lectura del ticket ("POLLD", "ARR0Z").
  const palabras = t.trim().split(' ').filter((w) => w.length >= 4);
  const aproximada = CLAVES.find(({ c }) => !c.includes(' ') && c.length >= 5 && palabras.some((w) => distancia(w, c) <= 1));
  return aproximada?.x;
}

const NO_ES_PRODUCTO = /\b(total|subtotal|iva|tarjeta|cambio|efectivo|factura|nif|cif|gracias|importe|ticket|entregado|visa|mastercard|base|cuota)\b/;

function cantidadDeLinea(linea: string, ing: Ingrediente): number {
  const num = (s: string) => parseFloat(s.replace(',', '.'));
  const inicio = linea.match(/^(\d{1,2})\s*x?\s+[a-z]/);
  const veces = inicio ? Math.max(1, parseInt(inicio[1], 10)) : 1;
  let m: RegExpMatchArray | null;
  if (ing.unidad === 'ud') {
    if (/\bdocena\b/.test(linea)) return 12 * veces;
    if ((m = linea.match(/\b(\d{1,2})\s*(uds?|unid|unidades)\b/)) || (m = linea.match(/\bx\s*(\d{1,2})\b/))) return parseInt(m[1], 10) * veces;
    return ing.compra * veces;
  }
  if ((m = linea.match(/(\d+[.,]?\d*)\s*(kg|kilo|kilos)\b/))) return num(m[1]) * 1000 * veces;
  if ((m = linea.match(/(\d+[.,]?\d*)\s*(l|lt|litro|litros)\b/))) return num(m[1]) * 1000 * veces;
  if ((m = linea.match(/(\d+)\s*(g|gr|grs|gramos|ml)\b/))) return num(m[1]) * veces;
  if ((m = linea.match(/(\d+)\s*cl\b/))) return num(m[1]) * 10 * veces;
  return ing.compra * veces;
}

export function leerTextoTicket(texto: string) {
  const suma = new Map<string, number>();
  let ignoradas = 0;
  for (const cruda of texto.split('\n')) {
    const linea = normal(cruda);
    if (linea.length < 3 || !/[a-z]{3}/.test(linea) || NO_ES_PRODUCTO.test(linea)) continue;
    const ing = buscarIngrediente(linea);
    if (!ing) {
      ignoradas++;
      continue;
    }
    // Un número absurdo suele ser un dígito mal leído: mejor la cantidad habitual, y el usuario revisa.
    const leida = cantidadDeLinea(linea, ing);
    suma.set(ing.id, (suma.get(ing.id) ?? 0) + (leida > ing.compra * 4 ? ing.compra : leida));
  }
  return { items: [...suma].map(([ing, cantidad]) => ({ ing, cantidad: Math.round(cantidad) })), ignoradas };
}

export const textoCantidad = (n: number, u: Unidad) =>
  u === 'ud' ? `${Math.round(n * 10) / 10} ud` : n >= 1000 ? `${Math.round(n / 10) / 100} ${u === 'g' ? 'kg' : 'l'}`.replace('.', ',') : `${Math.round(n)} ${u}`;

export const macrosDe = (ing: Ingrediente, cantidad: number) => {
  const f = cantidad / ing.por;
  return { p: ing.p * f, kcal: ing.kcal * f, h: ing.h * f, g: ing.g * f };
};

export function diasDeProteina(despensa: Stock[], meta: number) {
  const total = despensa.reduce((n, s) => {
    const ing = porId(s.ing);
    return n + (ing ? macrosDe(ing, s.cantidad).p : 0);
  }, 0);
  return meta > 0 ? total / meta : 0;
}

export type Linea = { ing: string; nombre: string; cantidad: number; unidad: Unidad; enStock: boolean };
export type Receta = {
  titulo: string;
  sabor: string;
  lineas: Linea[];
  pasos: string[];
  raciones: number;
  p: number;
  kcal: number;
  h: number;
  g: number;
  nota: string | null;
  opciones: number;
};

type Ctx = { todos: Ingrediente[]; main: Ingrediente[]; lact: Ingrediente[]; supl: Ingrediente[]; carb: Ingrediente[]; veg: Ingrediente[]; fat: Ingrediente[]; fruta: Ingrediente[]; sabor: string };

const lista = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
const nom = (xs: Ingrediente[]) => lista(xs.map((x) => x.nombre.toLowerCase()));
const LAS = ['espinacas', 'lentejas', 'caraotas', 'gambas', 'fresas', 'claras', 'sardinas', 'tortilla_trigo', 'judias'];
const LOS = ['huevos', 'garbanzos', 'champinones', 'frutos', 'guisantes'];
const LA = ['carne', 'merluza', 'harina', 'avena', 'pasta', 'patata', 'batata', 'cebolla', 'zanahoria', 'lechuga', 'leche', 'manzana', 'proteina_polvo', 'quinoa', 'yuca', 'berenjena', 'coliflor', 'naranja', 'pina', 'mantequilla_cacahuete'];
const conArt = (x: Ingrediente) =>
  x.id.startsWith('p_') ? x.nombre.toLowerCase() : `${LAS.includes(x.id) ? 'las' : LOS.includes(x.id) ? 'los' : LA.includes(x.id) ? 'la' : 'el'} ${x.nombre.toLowerCase()}`;
const art = (xs: Ingrediente[]) => lista(xs.map(conArt));
const tiene = (xs: Ingrediente[], ...ids: string[]) => xs.some((x) => ids.includes(x.id));
const sin = (xs: Ingrediente[], ...ids: string[]) => xs.filter((x) => !ids.includes(x.id));

function pasoMain(x: Ingrediente) {
  const n = conArt(x);
  if (x.id === 'carne') return 'Dora la carne picada 8 a 10 minutos, hasta que no quede rosa.';
  if (x.id === 'atun' || x.id === 'sardinas') return `Escurre ${n} y desmenuza.`;
  if (x.id === 'huevos') return 'Hierve los huevos 9 minutos (o hazlos a la plancha si los prefieres así).';
  if (x.id === 'claras') return 'Cuaja las claras en la sartén a fuego medio.';
  if (x.tipo === 'legumbre') return `Enjuaga ${n} y calienta 5 minutos.`;
  if (x.id === 'gambas') return 'Saltea las gambas 3 minutos, hasta que estén rosadas.';
  if (x.id === 'salmon' || x.id === 'merluza') return `Cocina ${n} a la plancha unos 4 minutos por cada lado.`;
  if (x.id === 'tofu') return 'Dora el tofu en dados 6 minutos.';
  return `Corta ${n} y cocina en la sartén 8 a 10 minutos, hasta que esté bien hecho por dentro.`;
}

function pasoCarbo(x: Ingrediente) {
  if (x.id === 'arroz') return 'Pon el arroz a cocinar en agua con sal unos 15 a 18 minutos, hasta que esté blando.';
  if (x.id === 'pasta') return 'Hierve agua con sal y cocina la pasta el tiempo que diga el paquete.';
  if (x.id === 'patata' || x.id === 'batata') return `Trocea ${conArt(x)} y hiérvela unos 20 minutos, hasta que esté blanda.`;
  if (x.id === 'quinoa') return 'Lava la quinoa y hiérvela 15 minutos.';
  if (x.id === 'cuscus') return 'Hidrata el cuscús 5 minutos con agua caliente y sal.';
  if (x.id === 'yuca') return 'Pela la yuca y hiérvela unos 25 minutos, hasta que esté blanda.';
  if (x.id === 'maiz') return 'Calienta el maíz 3 minutos.';
  if (x.id === 'tortilla_trigo') return 'Calienta las tortillas 30 segundos por cada lado.';
  if (x.id === 'pan') return 'Tuesta el pan.';
  return `Prepara ${conArt(x)}.`;
}

// Lechuga, pepino y tomate van en crudo; el resto se saltea.
const CRUDAS = ['lechuga', 'pepino', 'tomate'];
const pasoVerdura = (c: Ctx) => {
  const crudas = c.veg.filter((x) => CRUDAS.includes(x.id));
  const cocinadas = c.veg.filter((x) => !CRUDAS.includes(x.id));
  return [
    ...(cocinadas.length ? [`Corta ${art(cocinadas)} y saltéalo todo 4 o 5 minutos a fuego medio.`] : []),
    ...(crudas.length ? [`Lava y corta ${art(crudas)} en crudo para acompañar.`] : []),
  ];
};
const aceite = (c: Ctx) => (tiene(c.fat, 'aceite') ? 'Pon el aceite en la sartén. ' : 'Usa una sartén antiadherente. ');
const extras = (c: Ctx) => {
  const x = [...c.lact, ...sin(c.fat, 'aceite'), ...c.fruta, ...c.supl];
  return x.length ? [`Añade por encima ${art(x)}.`] : [];
};
const servir = (c: Ctx) => `Aliña con ${c.sabor}, prueba de sal y sirve.`;

type Plantilla = { vale: (c: Ctx) => boolean; titulo: (c: Ctx) => string; pasos: (c: Ctx) => string[] };

const PLANTILLAS: Plantilla[] = [
  {
    vale: (c) => tiene(c.carb, 'avena'),
    titulo: (c) => `Avena con ${nom([...c.fruta, ...c.lact, ...c.supl]) || 'canela'}`,
    pasos: (c) => [
      `Calienta la avena 3 minutos con ${c.lact.length ? 'la leche o un poco de agua' : 'agua'}, removiendo.`,
      ...(c.supl.length ? ['Fuera del fuego, mezcla la proteína en polvo.'] : []),
      ...(c.fruta.length ? [`Corta ${art(c.fruta)} y ponlo todo encima.`] : []),
      'Espolvorea canela y sirve.',
    ],
  },
  {
    vale: (c) => (c.supl.length > 0 || (c.fruta.length > 0 && c.lact.length > 0)) && !c.main.length && !sin(c.carb, 'avena').length,
    titulo: (c) => `Batido de ${nom([...c.fruta, ...c.supl, ...c.lact])}`,
    pasos: (c) => [`Pon en la batidora ${art([...c.fruta, ...c.supl, ...c.lact])}.`, 'Bate 1 minuto, con hielo o agua si lo quieres más ligero.', 'Sirve frío.'],
  },
  {
    vale: (c) => tiene(c.lact, 'yogur') && !c.main.length && (c.fruta.length > 0 || c.fat.length > 0),
    titulo: (c) => `Bol de yogur con ${nom([...c.fruta, ...c.fat, ...c.carb])}`,
    pasos: (c) => ['Pon el yogur en un bol.', ...(c.fruta.length ? [`Corta ${art(c.fruta)}.`] : []), `Añade ${art([...c.fruta, ...c.fat, ...c.carb])} por encima y sirve.`],
  },
  {
    vale: (c) => tiene(c.main, 'carne') && tiene(c.main, 'caraotas') && tiene(c.carb, 'arroz'),
    titulo: () => 'Pabellón ligero',
    pasos: (c) => [...c.carb.map(pasoCarbo), ...c.main.map(pasoMain), ...pasoVerdura(c), 'Sirve el arroz con la carne y las caraotas al lado.', ...extras(c), servir(c)],
  },
  {
    vale: (c) => tiene(c.carb, 'tortilla_trigo') && (c.main.length > 0 || c.lact.length > 0),
    titulo: (c) => `Wrap de ${nom([...c.main, ...c.lact])}`,
    pasos: (c) => [...c.main.map(pasoMain), ...pasoVerdura(c), 'Calienta las tortillas 30 segundos por cada lado.', `Rellena las tortillas${c.lact.length ? ` con ${art(c.lact)}` : ''}, aliña con ${c.sabor} y enróllalas.`],
  },
  {
    vale: (c) => tiene(c.main, 'carne', 'pollo', 'pavo') && tiene(c.carb, 'pan'),
    titulo: (c) => `Hamburguesa de ${nom(c.main.filter((x) => ['carne', 'pollo', 'pavo'].includes(x.id)))}`,
    pasos: (c) => [
      `Pica ${art(c.main)} si no viene picado y mézclalo con ${c.sabor}.`,
      'Forma la hamburguesa y cocínala 5 minutos por cada lado, hasta que esté bien hecha por dentro.',
      'Tuesta el pan.',
      ...pasoVerdura(c),
      'Monta la hamburguesa.',
      ...extras(c),
    ],
  },
  {
    vale: (c) => tiene(c.carb, 'pan') && (tiene(c.main, 'atun', 'huevos', 'sardinas', 'jamon') || tiene(c.fat, 'aguacate') || c.lact.length > 0),
    titulo: (c) => `Tostadas con ${nom([...c.main, ...c.lact, ...sin(c.fat, 'aceite')])}`,
    pasos: (c) => ['Tuesta el pan.', ...c.main.map(pasoMain), ...pasoVerdura(c), 'Reparte todo sobre las tostadas.', ...extras(c), servir(c)],
  },
  {
    vale: (c) => c.veg.length >= 2 && !c.main.length && c.carb.every((x) => x.id === 'patata'),
    titulo: (c) => `Crema de ${nom(c.veg)}`,
    pasos: (c) => [`Trocea ${art([...c.veg, ...c.carb])}.`, 'Cúbrelo con agua y déjalo hervir 20 minutos.', 'Tritura hasta que quede cremoso.', ...extras(c), servir(c)],
  },
  {
    vale: (c) => tiene(c.main, 'huevos') && c.veg.length > 0,
    titulo: (c) => `Revuelto de huevos con ${nom(c.veg)}`,
    pasos: (c) => [...c.carb.map(pasoCarbo), ...pasoVerdura(c), ...sin(c.main, 'huevos').map(pasoMain), `Añade los huevos batidos con ${c.sabor} y remueve 2 minutos.`, ...extras(c)],
  },
  {
    vale: (c) => tiene(c.carb, 'harina'),
    titulo: (c) => `Arepas rellenas de ${nom([...c.main, ...c.lact, ...c.veg]) || 'queso'}`,
    pasos: (c) => [
      'Mezcla la harina con agua tibia y sal hasta tener una masa suave. Reposa 3 minutos.',
      'Forma las arepas y dóralas 6 minutos por cada lado.',
      ...c.main.map(pasoMain),
      ...pasoVerdura(c),
      `Abre las arepas y rellénalas. Aliña con ${c.sabor}.`,
    ],
  },
  {
    vale: (c) => tiene(c.main, 'huevos', 'claras'),
    titulo: (c) => `Tortilla de ${nom([...sin(c.carb, 'pan'), ...c.veg, ...sin(c.main, 'huevos', 'claras'), ...c.lact]) || 'la casa'}`,
    pasos: (c) => [
      ...sin(c.carb, 'pan').map(pasoCarbo),
      ...sin(c.main, 'huevos', 'claras').map(pasoMain),
      ...pasoVerdura(c),
      `Bate ${art(c.main.filter((x) => x.id === 'huevos' || x.id === 'claras'))} con ${c.sabor}.`,
      `${aceite(c)}Vierte todo y cuaja 3 minutos por cada lado.`,
      ...extras(c),
    ],
  },
  {
    vale: (c) => tiene(c.carb, 'pasta'),
    titulo: (c) => `Pasta con ${nom([...c.main, ...c.veg]) || 'tomate'}`,
    pasos: (c) => ['Hierve agua con sal y cocina la pasta el tiempo que diga el paquete.', ...c.main.map(pasoMain), ...pasoVerdura(c), 'Mezcla todo en la sartén con un poco del agua de cocción.', ...extras(c), servir(c)],
  },
  {
    vale: (c) => c.main.some((x) => x.tipo === 'legumbre'),
    titulo: (c) => `Guiso de ${nom(c.main)}${c.veg.length ? ` con ${nom(c.veg)}` : ''}`,
    pasos: (c) => [
      ...sin(c.carb).map(pasoCarbo),
      ...pasoVerdura(c),
      ...c.main.filter((x) => x.tipo !== 'legumbre').map(pasoMain),
      `Añade ${art(c.main.filter((x) => x.tipo === 'legumbre'))} con un vaso de agua y cocina 12 minutos a fuego lento.`,
      ...extras(c),
      servir(c),
    ],
  },
  {
    vale: (c) => tiene(c.main, 'pollo', 'pavo', 'cerdo', 'salmon', 'merluza') && tiene(c.carb, 'patata', 'batata'),
    titulo: (c) => `${c.main[0].nombre} al horno con ${nom(c.carb)}`,
    pasos: (c) => [
      'Precalienta el horno a 200 °C.',
      `Corta ${art([...c.carb, ...c.veg])} y hornea 20 minutos.`,
      `Añade ${art(c.main)} con ${c.sabor} y hornea 20 minutos más, hasta que esté bien hecho por dentro.`,
      ...extras(c),
      'Sirve caliente.',
    ],
  },
  {
    vale: (c) => c.main.length > 0 && c.carb.length > 0,
    titulo: (c) => `Bowl de ${nom(c.main)} con ${nom(c.carb)}`,
    pasos: (c) => [...c.carb.map(pasoCarbo), ...c.main.map(pasoMain), ...pasoVerdura(c), 'Monta todo en un bol.', ...extras(c), servir(c)],
  },
  {
    vale: (c) => c.main.length > 0 && c.veg.some((x) => !CRUDAS.includes(x.id)) && !tiene(c.main, 'huevos', 'claras'),
    titulo: (c) => `Salteado de ${nom(c.main)} con ${nom(c.veg)}`,
    pasos: (c) => [...c.main.map(pasoMain), ...pasoVerdura(c), 'Junta todo en la sartén 1 minuto.', ...c.carb.map(pasoCarbo), ...extras(c), servir(c)],
  },
  {
    vale: (c) => tiene(c.veg, 'lechuga', 'espinacas', 'tomate'),
    titulo: (c) => `Ensalada de ${nom([...c.veg, ...c.main])}`,
    pasos: (c) => [...c.main.map(pasoMain), ...c.carb.map(pasoCarbo), `Lava y corta ${art(c.veg)}.`, 'Mezcla todo en un bol.', ...extras(c), servir(c)],
  },
  {
    vale: () => true,
    titulo: (c) => `Plato de ${nom(c.todos)}`,
    pasos: (c) => [...c.carb.map(pasoCarbo), ...c.main.map(pasoMain), ...pasoVerdura(c), 'Sirve todo junto.', ...extras(c), servir(c)],
  },
];

const SABORES = ['limón y orégano', 'pimentón y comino', 'ajo en polvo y perejil', 'curry suave', 'pimienta y romero'];

const redondea = (n: number, ing: Ingrediente) => (ing.unidad === 'ud' ? Math.max(1, Math.round(n)) : Math.max(5, Math.round(n / 5) * 5));
const entre = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function cantidadFija(x: Ingrediente, avena: boolean) {
  if (x.id === 'leche') return avena ? 250 : 200;
  if (x.id === 'yogur') return 170;
  if (x.id === 'queso') return 40;
  if (x.id === 'proteina_polvo') return 30;
  if (x.id === 'aceite') return 10;
  if (x.id === 'aguacate') return 50;
  if (x.id === 'frutos') return 20;
  if (x.id === 'ajo') return 5;
  if (x.id === 'cebolla') return 60;
  if (x.id === 'lechuga' || x.id === 'espinacas') return 80;
  return x.tipo === 'fruta' ? 120 : 120;
}

export function generarReceta(a: {
  ids: string[];
  despensa: Stock[];
  metaProteina: number | null;
  metaKcal: number | null;
  proteinaHoy: number;
  variante: number;
  raciones: number;
}): Receta | null {
  const todos = [...new Set(a.ids)].flatMap((id) => porId(id) ?? []);
  if (!todos.length) return null;
  const g = (...t: Tipo[]) => todos.filter((x) => t.includes(x.tipo));
  const c: Ctx = {
    todos,
    main: g('proteina', 'legumbre'),
    lact: g('lacteo'),
    supl: g('suplemento'),
    carb: g('carbo'),
    veg: g('verdura'),
    fat: g('grasa'),
    fruta: g('fruta'),
    sabor: SABORES[a.variante % SABORES.length],
  };
  const validas = PLANTILLAS.filter((p) => p.vale(c));
  if (validas.length > 1) validas.pop(); // "Plato de..." solo si no hay nada mejor
  const plantilla = validas[a.variante % validas.length];
  const esAvena = tiene(c.carb, 'avena');

  let objetivoP = a.metaProteina ? entre(a.metaProteina / 3, 20, 55) : 30;
  const restante = a.metaProteina ? a.metaProteina - a.proteinaHoy : null;
  if (restante !== null && restante >= 15 && restante < objetivoP) objetivoP = restante;

  const cantidades = new Map<string, number>();
  for (const x of [...c.lact, ...c.supl, ...c.veg, ...c.fat, ...c.fruta]) cantidades.set(x.id, cantidadFija(x, esAvena));
  const pFijo = [...cantidades].reduce((n, [id, q]) => n + macrosDe(porId(id)!, q).p, 0);
  const porMain = Math.max(objetivoP - pFijo, 10) / (c.main.length || 1);
  for (const x of c.main) {
    const max = x.unidad === 'ud' ? 5 : x.tipo === 'legumbre' ? 400 : 300;
    cantidades.set(x.id, redondea(entre((porMain / x.p) * x.por, x.unidad === 'ud' ? 2 : 60, max), x));
  }
  const kcalOtros = [...cantidades].reduce((n, [id, q]) => n + macrosDe(porId(id)!, q).kcal, 0);
  const restoK = Math.max(150, (a.metaKcal ? a.metaKcal / 3 : 600) - kcalOtros) / (c.carb.length || 1);
  for (const x of c.carb) {
    const [min, max] = x.id === 'patata' || x.id === 'batata' || x.id === 'yuca' ? [100, 400] : x.id === 'avena' ? [40, 80] : [40, 120];
    cantidades.set(x.id, redondea(entre((restoK / x.kcal) * x.por, min, max), x));
  }

  const lineas: Linea[] = todos.map((x) => {
    const pedido = (cantidades.get(x.id) ?? 0) * a.raciones;
    const stock = a.despensa.find((s) => s.ing === x.id)?.cantidad ?? 0;
    return { ing: x.id, nombre: x.nombre, cantidad: stock > 0 ? Math.min(pedido, stock) : pedido, unidad: x.unidad, enStock: stock > 0 };
  });
  const suma = lineas.reduce(
    (t, l) => {
      const m = macrosDe(porId(l.ing)!, l.cantidad / a.raciones);
      return { p: t.p + m.p, kcal: t.kcal + m.kcal, h: t.h + m.h, g: t.g + m.g };
    },
    { p: 0, kcal: 0, h: 0, g: 0 },
  );
  return {
    titulo: plantilla.titulo(c),
    sabor: c.sabor,
    lineas,
    pasos: plantilla.pasos(c),
    raciones: a.raciones,
    ...suma,
    nota: suma.p < 20 ? `Solo ${Math.round(suma.p)} g de proteína: añade huevo, atún, pollo o yogur para llegar a tu meta.` : null,
    opciones: validas.length * SABORES.length,
  };
}

export function sugerirIngredientes(despensa: Stock[], variante: number) {
  const hay = despensa.filter((s) => s.cantidad > 0).flatMap((s) => {
    const ing = porId(s.ing);
    return ing ? [{ ing, cantidad: s.cantidad, urgente: (diasParaCaducar(s) ?? 99) <= 3 }] : [];
  });
  const tomar = (tipos: Tipo[], n: number) => {
    const xs = hay.filter((x) => tipos.includes(x.ing.tipo)).sort((a, b) => Number(b.urgente) - Number(a.urgente) || macrosDe(b.ing, b.cantidad).p - macrosDe(a.ing, a.cantidad).p);
    if (!xs.length) return [];
    // Lo que caduca pronto va primero; si no hay urgencias, se va variando.
    const salto = xs[0].urgente ? 0 : variante;
    return Array.from({ length: Math.min(n, xs.length) }, (_, k) => xs[(salto + k) % xs.length].ing.id);
  };
  return [...tomar(['proteina', 'legumbre'], 1), ...tomar(['carbo'], 1), ...tomar(['verdura'], 2), ...(hay.some((x) => x.ing.id === 'aceite') ? ['aceite'] : [])];
}

export function parsearFecha(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!m) return null;
  const dia = +m[1];
  const mes = +m[2];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const ahora = new Date();
  let anio = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : ahora.getFullYear();
  // Sin año: una fecha ya muy pasada se entiende como del año próximo.
  if (!m[3] && new Date(anio, mes - 1, dia).getTime() < ahora.getTime() - 60 * 86400000) anio++;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

export function diasParaCaducar(s: { caduca?: string }) {
  if (!s.caduca) return null;
  const [a, m, d] = s.caduca.split('-').map(Number);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(a, m - 1, d).getTime() - hoy.getTime()) / 86400000);
}

export type Preferencias = { dieta: 'todo' | 'vegetariana' | 'vegana'; grupos: string[]; noGusta: string[] };

export const ALERGIAS: Record<string, string[]> = {
  Huevo: ['huevos', 'claras'],
  Lácteos: ['queso', 'yogur', 'leche', 'requeson', 'proteina_polvo'],
  Gluten: ['pan', 'pasta', 'avena', 'cuscus', 'tortilla_trigo'],
  'Frutos secos': ['frutos', 'mantequilla_cacahuete'],
  Marisco: ['gambas'],
  Pescado: ['atun', 'salmon', 'merluza', 'sardinas'],
  Soja: ['tofu'],
};
const CARNE = ['pollo', 'pavo', 'carne', 'cerdo', 'jamon', 'atun', 'salmon', 'merluza', 'gambas', 'sardinas'];
const ANIMAL = ['huevos', 'claras', 'queso', 'yogur', 'leche', 'requeson', 'proteina_polvo'];

export function prohibidos(p: Preferencias) {
  return new Set([
    ...(p.dieta === 'todo' ? [] : CARNE),
    ...(p.dieta === 'vegana' ? ANIMAL : []),
    ...p.grupos.flatMap((g) => ALERGIAS[g] ?? []),
    ...p.noGusta,
  ]);
}

export type ComidaMenu = {
  momento: string;
  ids: string[];
  variante: number;
  titulo: string;
  p: number;
  kcal: number;
  lineas: { ing: string; cantidad: number }[];
  hecha: boolean;
};
export type DiaMenu = { dia: number; comidas: ComidaMenu[] };

export function generarMenu(a: { despensa: Stock[]; metaProteina: number | null; metaKcal: number | null; prohibido: Set<string>; semilla: number; desde: number }): DiaMenu[] {
  const hay = (id: string) => a.despensa.some((s) => s.ing === id && s.cantidad > 0);
  const ordena = (ids: string[]) => {
    const ok = ids.filter((x) => !a.prohibido.has(x));
    return [...ok.filter(hay), ...ok.filter((x) => !hay(x))];
  };
  const mains = ordena(['pollo', 'atun', 'huevos', 'carne', 'salmon', 'pavo', 'merluza', 'lentejas', 'garbanzos', 'caraotas', 'tofu', 'cerdo']);
  const carbs = ordena(['arroz', 'patata', 'pasta', 'batata', 'quinoa']);
  const vegs = ordena(['brocoli', 'tomate', 'pimiento', 'calabacin', 'espinacas', 'zanahoria', 'champinones']);
  const desayunos = [['avena', 'leche', 'platano'], ['huevos', 'pan', 'tomate'], ['harina', 'queso'], ['yogur', 'fresas', 'frutos'], ['avena', 'manzana']]
    .filter((d) => d.every((x) => !a.prohibido.has(x)));
  if (!mains.length || !vegs.length) return [];
  const toma = (xs: string[], n: number) => (xs.length ? [xs[n % xs.length]] : []);
  const aceite = a.prohibido.has('aceite') ? [] : ['aceite'];

  const plato = (momento: string, ids: string[], variante: number): ComidaMenu | null => {
    const r = generarReceta({ ids, despensa: [], metaProteina: a.metaProteina, metaKcal: a.metaKcal, proteinaHoy: 0, variante, raciones: 1 });
    return r && { momento, ids, variante, titulo: r.titulo, p: r.p, kcal: r.kcal, lineas: r.lineas.map((l) => ({ ing: l.ing, cantidad: l.cantidad })), hecha: false };
  };

  return Array.from({ length: 7 }, (_, k) => {
    const s = k + a.semilla;
    const v1 = toma(vegs, s);
    const v2 = toma(vegs, s + 2).filter((x) => !v1.includes(x));
    const comidas = [
      desayunos.length ? plato('Desayuno', desayunos[s % desayunos.length], s) : null,
      plato('Comida', [...toma(mains, s), ...toma(carbs, s), ...v1, ...aceite], s),
      plato('Cena', [...toma(mains, s + 1), ...v2, ...toma(vegs, s + 3), ...aceite], s + 1),
    ].flatMap((x) => x ?? []);
    return { dia: (a.desde + k) % 7, comidas };
  });
}

export function listaCompra(menu: DiaMenu[], despensa: Stock[]) {
  const pide = new Map<string, number>();
  for (const d of menu) for (const c of d.comidas) if (!c.hecha) for (const l of c.lineas) pide.set(l.ing, (pide.get(l.ing) ?? 0) + l.cantidad);
  return [...pide].flatMap(([ing, cantidad]) => {
    const x = porId(ing);
    const falta = cantidad - (despensa.find((s) => s.ing === ing)?.cantidad ?? 0);
    if (!x || falta <= 0) return [];
    return [{ ing, falta, comprar: Math.ceil(falta / x.compra) * x.compra }];
  });
}

export const seAcaba = (s: Stock) => {
  const ing = porId(s.ing);
  return !!ing && s.cantidad > 0 && s.cantidad <= ing.compra * 0.2;
};
