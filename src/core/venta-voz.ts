/**
 * Vende Fácil — Analizador de la venta por voz
 * ------------------------------------------------------------
 * Función PURA (sin micrófono, sin SQLite, sin pantalla): recibe lo que
 * dictó el celular como texto y devuelve una lista ORDENADA de acciones
 * ("agregar 2 de tal producto", "pago yape", "guardar venta"...).
 * Sin IA de pago: solo reglas.
 *
 * Cómo se habla: primero la cantidad y luego el producto.
 *   «una hamburguesa, dos gaseosa inka cola, un octavo de pollo a la brasa»
 *
 * Para saber dónde termina un producto y empieza el siguiente se prueban
 * las formas de partir la frase y se queda la que mejor "encaja" con los
 * nombres y alias de los productos (así un producto con un número en su
 * nombre, como "Inca Kola 500 ml", no se confunde con una cantidad).
 * Al comparar se ignoran tildes, mayúsculas y plurales, y se toleran
 * errores de pronunciación (inka/inca, kola/cola).
 */

import { normalizarParaBusqueda, partirAlias } from './texto';
import type { MetodoPago, Producto } from './tipos';

// ------------------------------------------------------------
// Resultado
// ------------------------------------------------------------

export interface CandidatoProducto {
  producto: Producto;
  /** 0 a 1: qué tan bien coincide con lo que se dijo. */
  puntaje: number;
}

export type AccionVoz =
  /** Se entendió un producto. `seguro` = hay un único candidato con buena coincidencia; si no, hay que elegir tocando. */
  | { tipo: 'agregar'; cantidad: number; texto: string; candidatos: CandidatoProducto[]; seguro: boolean }
  /** Se dijo algo con forma de producto, pero no se parece a ninguno. */
  | { tipo: 'no_encontrado'; cantidad: number; texto: string }
  | { tipo: 'metodo_pago'; metodo: MetodoPago }
  | { tipo: 'cliente'; texto: string }
  | { tipo: 'borrar_ultimo' }
  | { tipo: 'guardar' }
  | { tipo: 'cancelar' };

// ------------------------------------------------------------
// Texto: tokens, plurales, pronunciación
// ------------------------------------------------------------

/** Palabras que casi no cuentan al comparar (artículos, preposiciones). */
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'a', 'al', 'con', 'y', 'e', 'en']);

/** Relleno de conversación que se puede saltar entre productos. */
const RELLENO = new Set([
  'y', 'e', 'con', 'mas', 'tambien', 'ademas', 'agrega', 'agregar', 'agregame', 'ponme', 'pon', 'poner',
  'dame', 'quiero', 'queria', 'por', 'favor', 'ya', 'otro', 'otra', 'luego', 'despues', 'entonces', 'ok',
]);

const UMBRAL_COINCIDENCIA = 0.55;
const MAXIMO_TOKENS_PRODUCTO = 9;

function tokenizar(texto: string): string[] {
  return normalizarParaBusqueda(texto)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** "gaseosas" → "gaseosa", "panes" → "pan", "limones" → "limon". */
function singular(t: string): string {
  if (t.length > 4 && t.endsWith('nes')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s')) return t.slice(0, -1);
  return t;
}

/** Forma "como suena": inca/inka, kola/cola, hamburguesa/amburguesa se igualan. */
function fonetica(t: string): string {
  return t
    .replace(/ch/g, 'x')
    .replace(/h/g, '')
    .replace(/qu/g, 'k')
    .replace(/c(?=[ei])/g, 's')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/gu(?=[ei])/g, 'g')
    .replace(/ll/g, 'y')
    .replace(/v/g, 'b')
    .replace(/w/g, 'u')
    .replace(/(.)\1+/g, '$1');
}

interface Tok {
  raw: string;
  forma: string;
  peso: number;
}

function aTok(raw: string): Tok {
  return { raw, forma: fonetica(singular(raw)), peso: PALABRAS_VACIAS.has(raw) ? 0.35 : 1 };
}

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0] as number;
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temporal = fila[j] as number;
      fila[j] = Math.min(
        (fila[j] as number) + 1,
        (fila[j - 1] as number) + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = temporal;
    }
  }
  return fila[b.length] as number;
}

function similitud(a: string, b: string): number {
  if (a === b) return 1;
  const corta = Math.min(a.length, b.length);
  if (corta >= 4) {
    const d = distancia(a, b);
    if (d === 1) return 0.82;
    if (d === 2 && corta >= 7) return 0.7;
  }
  return 0;
}

// ------------------------------------------------------------
// Índice de productos
// ------------------------------------------------------------

export interface ProductoIndexado {
  producto: Producto;
  /** Nombre completo, nombre sin paréntesis, lo de dentro del paréntesis y cada alias. */
  variantes: Tok[][];
}

export function indexarProductos(productos: Producto[]): ProductoIndexado[] {
  return productos.map((producto) => {
    const textos: string[] = [producto.nombre];
    const sinParentesis = producto.nombre.replace(/\([^)]*\)/g, ' ');
    if (sinParentesis.trim() !== '' && sinParentesis !== producto.nombre) textos.push(sinParentesis);
    const patron = /\(([^)]*)\)/g;
    let coincidencia = patron.exec(producto.nombre);
    while (coincidencia) {
      textos.push(coincidencia[1] ?? '');
      coincidencia = patron.exec(producto.nombre);
    }
    for (const alias of partirAlias(producto.alias)) textos.push(alias);
    const variantes = textos.map((t) => tokenizar(t).map(aTok)).filter((v) => v.length > 0);
    return { producto, variantes };
  });
}

/**
 * `puntaje` (0 a 1): cuánto de lo dicho está en la variante y cuánto de la variante se dijo.
 * `acierto`: peso de las palabras dichas que sí coincidieron (sirve para elegir cómo partir la frase).
 */
function puntajeFrase(frase: Tok[], variante: Tok[]): { puntaje: number; acierto: number; exacto: boolean } {
  let pesoFrase = 0;
  let pesoVariante = 0;
  for (const t of frase) pesoFrase += t.peso;
  for (const t of variante) pesoVariante += t.peso;

  const usados = new Array<boolean>(variante.length).fill(false);
  let aciertoFrase = 0;
  let aciertoVariante = 0;
  let informativo = false;
  let exacto = false;
  for (const f of frase) {
    let mejor = 0;
    let indice = -1;
    for (let j = 0; j < variante.length; j++) {
      if (usados[j]) continue;
      const s = similitud(f.forma, (variante[j] as Tok).forma);
      if (s > mejor) {
        mejor = s;
        indice = j;
      }
    }
    if (indice >= 0) {
      usados[indice] = true;
      aciertoFrase += f.peso * mejor;
      aciertoVariante += (variante[indice] as Tok).peso * mejor;
      if (f.peso === 1 && mejor >= 0.7) informativo = true;
      if (f.peso === 1 && mejor === 1) exacto = true;
    }
  }
  // Una frase de solo "de la el..." no identifica a ningún producto.
  if (!informativo) return { puntaje: 0, acierto: 0, exacto: false };
  return {
    puntaje: 0.6 * (aciertoFrase / pesoFrase) + 0.4 * (aciertoVariante / pesoVariante),
    acierto: aciertoFrase,
    exacto,
  };
}

interface CandidatoInterno extends CandidatoProducto {
  acierto: number;
  /** Alguna palabra importante coincidió tal cual (no solo "parecida"). */
  exacto: boolean;
}

function candidatosDeFrase(frase: Tok[], indice: ProductoIndexado[]): CandidatoInterno[] {
  const candidatos: CandidatoInterno[] = [];
  for (const item of indice) {
    let mejor = { puntaje: 0, acierto: 0, exacto: false };
    for (const variante of item.variantes) {
      const r = puntajeFrase(frase, variante);
      if (r.puntaje > mejor.puntaje) mejor = r;
    }
    if (mejor.puntaje >= UMBRAL_COINCIDENCIA) {
      candidatos.push({ producto: item.producto, puntaje: mejor.puntaje, acierto: mejor.acierto, exacto: mejor.exacto });
    }
  }
  return candidatos.sort((a, b) => b.puntaje - a.puntaje);
}

/** Deja el mejor candidato y los que casi empatan con él (máx. 4) y decide si es seguro. */
function resolverAmbiguedad(todos: CandidatoInterno[]): { candidatos: CandidatoProducto[]; seguro: boolean } {
  const candidatos: CandidatoProducto[] = todos.map((c) => ({ producto: c.producto, puntaje: c.puntaje }));
  const primero = candidatos[0] as CandidatoProducto;
  const cercanos = candidatos.filter((c) => c.puntaje >= primero.puntaje - 0.08).slice(0, 4);
  // Solo se agrega sin preguntar si hay UN candidato claro y alguna palabra coincidió tal cual:
  // una coincidencia solo "parecida" (cosa ≈ coca) siempre se confirma tocando.
  const seguro = cercanos.length === 1 && primero.puntaje >= 0.7 && (todos[0] as CandidatoInterno).exacto;
  // Si no es seguro se muestran también otros parecidos para poder elegir.
  return { candidatos: seguro ? cercanos : candidatos.slice(0, 4), seguro };
}

// ------------------------------------------------------------
// Cantidades
// ------------------------------------------------------------

const NUMEROS = new Map<string, number>([
  ['un', 1], ['uno', 1], ['una', 1], ['dos', 2], ['tres', 3], ['cuatro', 4], ['cinco', 5], ['seis', 6],
  ['siete', 7], ['ocho', 8], ['nueve', 9], ['diez', 10], ['once', 11], ['doce', 12], ['trece', 13],
  ['catorce', 14], ['quince', 15], ['dieciseis', 16], ['diecisiete', 17], ['dieciocho', 18],
  ['diecinueve', 19], ['veinte', 20], ['veintiun', 21], ['veintiuno', 21], ['veintiuna', 21],
  ['veintidos', 22], ['veintitres', 23], ['veinticuatro', 24], ['veinticinco', 25], ['veintiseis', 26],
  ['veintisiete', 27], ['veintiocho', 28], ['veintinueve', 29], ['treinta', 30], ['cuarenta', 40],
  ['cincuenta', 50], ['sesenta', 60], ['setenta', 70], ['ochenta', 80], ['noventa', 90], ['cien', 100],
]);

/** Cantidad que empieza en el token `i`: "dos", "2", "media docena", "treinta y cinco", "una docena". */
export function cantidadEn(tokens: string[], i: number): { valor: number; largo: number } | null {
  const t = tokens[i];
  if (t === undefined) return null;
  if (t === 'media' && tokens[i + 1] === 'docena') return { valor: 6, largo: 2 };
  if (t === 'docena') return { valor: 12, largo: 1 };

  let base: number | undefined;
  let largo = 1;
  if (/^\d{1,3}$/.test(t)) {
    base = Number(t);
  } else {
    base = NUMEROS.get(t);
    if (base !== undefined && base >= 30 && base < 100 && base % 10 === 0 && tokens[i + 1] === 'y') {
      const unidad = NUMEROS.get(tokens[i + 2] ?? '');
      if (unidad !== undefined && unidad >= 1 && unidad <= 9) {
        base += unidad;
        largo = 3;
      }
    }
  }
  if (base === undefined || base <= 0) return null;
  const siguiente = tokens[i + largo];
  if (siguiente === 'docena' || siguiente === 'docenas') return { valor: base * 12, largo: largo + 1 };
  return { valor: base, largo };
}

// ------------------------------------------------------------
// Partir una frase en productos
// ------------------------------------------------------------

type AccionProducto = Extract<AccionVoz, { tipo: 'agregar' | 'no_encontrado' }>;

function interpretarProductos(crudos: string[], indice: ProductoIndexado[]): AccionProducto[] {
  const n = crudos.length;
  if (n === 0) return [];
  const toks = crudos.map(aTok);
  const cache = new Map<string, CandidatoInterno[]>();

  interface Paso {
    valor: number;
    siguiente: number;
    accion: AccionProducto | null;
  }
  const mejor: Paso[] = new Array<Paso>(n + 1);
  mejor[n] = { valor: 0, siguiente: n, accion: null };

  for (let i = n - 1; i >= 0; i--) {
    let elegido: Paso = { valor: Number.NEGATIVE_INFINITY, siguiente: i + 1, accion: null };

    // a) Saltar relleno ("y", "ponme", "por favor"...).
    if (RELLENO.has(crudos[i] as string)) {
      elegido = { valor: (mejor[i + 1] as Paso).valor, siguiente: i + 1, accion: null };
    }

    // b) Un producto, con cantidad explícita o sin ella (entonces vale 1).
    const cantidad = cantidadEn(crudos, i);
    const opciones: { cantidad: number; inicio: number; bono: number }[] = [{ cantidad: 1, inicio: i, bono: -0.2 }];
    if (cantidad) opciones.push({ cantidad: cantidad.valor, inicio: i + cantidad.largo, bono: 0.3 });

    for (const opcion of opciones) {
      for (let largo = 1; largo <= MAXIMO_TOKENS_PRODUCTO && opcion.inicio + largo <= n; largo++) {
        const fin = opcion.inicio + largo;
        const frase = toks.slice(opcion.inicio, fin);
        if (RELLENO.has((frase[0] as Tok).raw) && frase.length === 1) continue;

        const clave = frase.map((t) => t.raw).join(' ');
        let candidatos = cache.get(clave);
        if (!candidatos) {
          candidatos = candidatosDeFrase(frase, indice);
          cache.set(clave, candidatos);
        }
        const pesoTotal = frase.reduce((suma, t) => suma + t.peso, 0);
        // Premia las palabras que coinciden y castiga las que sobran (así no se "come" la cantidad
        // ni palabras de otro producto dentro de una frase larga).
        const acierto = candidatos[0]?.acierto ?? 0;
        const valor =
          candidatos.length > 0
            ? acierto - 0.5 * (pesoTotal - acierto) + opcion.bono
            : -0.6 * pesoTotal + opcion.bono;
        const total = valor + (mejor[fin] as Paso).valor;
        if (total > elegido.valor) {
          const texto = clave;
          const accion: AccionProducto =
            candidatos.length > 0
              ? { tipo: 'agregar', cantidad: opcion.cantidad, texto, ...resolverAmbiguedad(candidatos) }
              : { tipo: 'no_encontrado', cantidad: opcion.cantidad, texto };
          elegido = { valor: total, siguiente: fin, accion };
        }
      }
    }
    mejor[i] = elegido;
  }

  const acciones: AccionProducto[] = [];
  let i = 0;
  while (i < n) {
    const paso = mejor[i] as Paso;
    if (paso.accion) acciones.push(paso.accion);
    i = paso.siguiente;
  }
  return acciones;
}

// ------------------------------------------------------------
// Comandos
// ------------------------------------------------------------

type Comando =
  | { tipo: 'guardar' }
  | { tipo: 'cancelar' }
  | { tipo: 'borrar_ultimo' }
  | { tipo: 'metodo_pago'; metodo: MetodoPago }
  | { tipo: 'cliente' };

const COMANDOS: { frase: string[]; comando: Comando; saltar?: string[] }[] = [
  { frase: ['guardar', 'venta'], comando: { tipo: 'guardar' } },
  { frase: ['guarda', 'venta'], comando: { tipo: 'guardar' } },
  { frase: ['guardar'], comando: { tipo: 'guardar' }, saltar: ['la', 'venta', 'ya'] },
  { frase: ['guarda'], comando: { tipo: 'guardar' }, saltar: ['la', 'venta', 'ya'] },
  { frase: ['cancelar', 'venta'], comando: { tipo: 'cancelar' } },
  { frase: ['cancelar'], comando: { tipo: 'cancelar' }, saltar: ['la', 'venta'] },
  { frase: ['cancela'], comando: { tipo: 'cancelar' }, saltar: ['la', 'venta'] },
  { frase: ['borrar', 'ultimo'], comando: { tipo: 'borrar_ultimo' } },
  { frase: ['borra', 'ultimo'], comando: { tipo: 'borrar_ultimo' } },
  { frase: ['quitar', 'ultimo'], comando: { tipo: 'borrar_ultimo' } },
  { frase: ['quita', 'ultimo'], comando: { tipo: 'borrar_ultimo' } },
  { frase: ['eliminar', 'ultimo'], comando: { tipo: 'borrar_ultimo' } },
  { frase: ['efectivo'], comando: { tipo: 'metodo_pago', metodo: 'efectivo' } },
  { frase: ['yape'], comando: { tipo: 'metodo_pago', metodo: 'yape' } },
  { frase: ['plin'], comando: { tipo: 'metodo_pago', metodo: 'plin' } },
  { frase: ['tarjeta'], comando: { tipo: 'metodo_pago', metodo: 'tarjeta' } },
  { frase: ['fiado'], comando: { tipo: 'metodo_pago', metodo: 'fiado' } },
  { frase: ['cliente'], comando: { tipo: 'cliente' } },
];

/** Palabras que preceden a la forma de pago ("pago yape", "con yape", "al fiado", "en efectivo"). */
const ANTES_DEL_PAGO = new Set(['pago', 'paga', 'pagan', 'con', 'al', 'a', 'en', 'por']);
const MAXIMO_TOKENS_NOMBRE_CLIENTE = 4;

function esPalabraComando(token: string, objetivo: string): boolean {
  return similitud(fonetica(token), fonetica(objetivo)) >= 0.82;
}

function comandoEn(tokens: string[], i: number): { comando: Comando; largo: number; saltar: string[] } | null {
  for (const definicion of COMANDOS) {
    const coincide = definicion.frase.every((palabra, k) => {
      const token = tokens[i + k];
      return token !== undefined && esPalabraComando(token, palabra);
    });
    if (coincide) return { comando: definicion.comando, largo: definicion.frase.length, saltar: definicion.saltar ?? [] };
  }
  return null;
}

// ------------------------------------------------------------
// Entrada principal
// ------------------------------------------------------------

/** Convierte lo dictado en acciones, en el mismo orden en que se dijeron. */
export function interpretarFrase(texto: string, indice: ProductoIndexado[]): AccionVoz[] {
  const tokens = tokenizar(texto);
  const acciones: AccionVoz[] = [];
  let tramo: string[] = [];

  const cerrarTramo = () => {
    acciones.push(...interpretarProductos(tramo, indice));
    tramo = [];
  };

  let i = 0;
  while (i < tokens.length) {
    const hallado = comandoEn(tokens, i);
    if (!hallado) {
      tramo.push(tokens[i] as string);
      i += 1;
      continue;
    }

    const { comando } = hallado;
    if (comando.tipo === 'metodo_pago') {
      const ultimo = tramo[tramo.length - 1];
      if (ultimo !== undefined && ANTES_DEL_PAGO.has(ultimo)) tramo.pop();
    }
    cerrarTramo();
    i += hallado.largo;

    if (comando.tipo === 'cliente') {
      const nombre: string[] = [];
      while (
        i < tokens.length &&
        nombre.length < MAXIMO_TOKENS_NOMBRE_CLIENTE &&
        !comandoEn(tokens, i) &&
        !cantidadEn(tokens, i)
      ) {
        nombre.push(tokens[i] as string);
        i += 1;
      }
      if (nombre[0] === 'de' || nombre[0] === 'es') nombre.shift();
      acciones.push({ tipo: 'cliente', texto: nombre.join(' ') });
      continue;
    }

    acciones.push(comando);
    while (i < tokens.length && hallado.saltar.includes(tokens[i] as string)) i += 1;
  }
  cerrarTramo();
  return acciones;
}

// ------------------------------------------------------------
// Respuesta a "¿Guardar la venta?"
// ------------------------------------------------------------

const PALABRAS_SI = new Set(['si', 'confirmar', 'confirmo', 'confirma', 'guardar', 'guarda', 'ok', 'dale', 'listo', 'correcto']);
const PALABRAS_NO = new Set(['no', 'seguir', 'sigue', 'volver', 'espera', 'editar', 'cancelar', 'cancela', 'atras']);

/** Mientras se muestra una pregunta de confirmación, solo se entiende "sí" o "no". */
export function interpretarRespuestaSiNo(texto: string): 'si' | 'no' | null {
  const tokens = tokenizar(texto);
  if (tokens.some((t) => PALABRAS_NO.has(t))) return 'no';
  if (tokens.some((t) => PALABRAS_SI.has(t))) return 'si';
  return null;
}
