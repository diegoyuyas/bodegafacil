/**
 * Vende Fácil — Entrada de texto en campos numéricos
 * ------------------------------------------------------------
 * Los campos de cantidad/precio/stock son `<input type="text"
 * inputMode="numeric|decimal">` (no `type="number"`) para poder
 * dejarlos completamente vacíos mientras se escribe — con
 * `type="number"` el navegador no deja borrar el último dígito. El
 * costo de eso: al guardar el valor tipeado tal cual en el estado,
 * escribir sobre un campo que arranca en "0" da "018" en vez de "18"
 * (el navegador no lo corrige solo, porque para él es texto, no un
 * número). Esta función se usa en el `onChange` de esos campos para
 * limpiar eso al vuelo, sin bloquear que se pueda seguir escribiendo
 * un decimal como "0.5".
 */
export function limpiarNumeroEscrito(textoTipeado: string): string {
  // Vacío (borrando todo) o un cero solo/con punto decimal recién
  // empezado ("0", "0.") se dejan tal cual.
  if (textoTipeado === '' || textoTipeado === '0' || textoTipeado === '0.') {
    return textoTipeado;
  }
  // Ceros a la izquierda seguidos de otro dígito ("018", "003") se
  // recortan; un "0" seguido de "." ("0.5") no se toca.
  return textoTipeado.replace(/^0+(?=\d)/, '');
}

/**
 * Nombres de productos, clientes y proveedores: siempre en MAYÚSCULAS.
 * Se aplica en los repositorios (único punto por el que pasan la
 * pantalla, la importación masiva y los datos de ejemplo), así que ningún
 * camino puede guardar un nombre en minúsculas. Se usa la configuración
 * regional "es" para que ñ y las tildes suban bien (ñ → Ñ, á → Á).
 */
export function aMayusculas(texto: string): string {
  return texto.trim().toLocaleUpperCase('es');
}

/**
 * Mayúsculas mientras se escribe en un campo de nombre. A diferencia de
 * `aMayusculas` NO recorta espacios: si recortara, el usuario no podría
 * escribir el espacio entre dos palabras.
 */
export function mayusculasAlEscribir(texto: string): string {
  return texto.toLocaleUpperCase('es');
}

/**
 * Nombre de una PERSONA (clientes): solo letras —con tildes, ñ, ü—
 * separadas por espacios simples. Sin números ni símbolos.
 */
const PATRON_NOMBRE_PERSONA = /^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u;

export function esNombrePersonaValido(texto: string): boolean {
  return PATRON_NOMBRE_PERSONA.test(texto.trim().replace(/\s+/g, ' '));
}

/**
 * Para el `onChange` del campo de nombre de cliente: descarta al vuelo
 * todo lo que no sea letra o espacio, evita espacios dobles o al inicio,
 * y pasa a mayúsculas. Deja un espacio final para poder seguir tipeando.
 */
export function soloLetrasAlEscribir(texto: string): string {
  return mayusculasAlEscribir(
    texto
      .replace(/[^\p{L}\p{M}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .replace(/^ /, ''),
  );
}

/**
 * Para el `onChange` de campos de documento / RUC: deja solo letras (A-Z) y números,
 * sin espacios ni caracteres especiales (también limpia lo que se pegue).
 */
export function soloAlfanumericoAlEscribir(texto: string): string {
  return texto.replace(/[^A-Za-z0-9]/g, '');
}

/**
 * Para el `onChange` de campos de celular: deja solo números, sin espacios ni
 * caracteres especiales (también limpia lo que se pegue).
 */
export function soloDigitosAlEscribir(texto: string): string {
  return texto.replace(/\D/g, '');
}

/**
 * Parte un texto en líneas de hasta `maximo` caracteres sin cortar palabras:
 * una palabra que no entra completa pasa entera a la línea siguiente.
 * Ej. con 25: "LAPTOP LENOVO NEGRA CPU CORE I7" → ["LAPTOP LENOVO NEGRA CPU", "CORE I7"].
 * Una sola palabra más larga que el máximo se deja entera (no se parte).
 */
export function partirEnLineas(texto: string, maximo = 25): string[] {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of palabras) {
    if (actual === '') {
      actual = palabra;
    } else if (actual.length + 1 + palabra.length <= maximo) {
      actual += ` ${palabra}`;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual !== '') lineas.push(actual);
  return lineas;
}

/** Largo máximo de la descripción que se puede añadir a cada producto de una venta o compra. */
export const LIMITE_DESCRIPCION_LINEA = 100;

/**
 * Descripción de una línea de venta/compra lista para guardar: se aceptan TODOS los
 * caracteres (letras, números, símbolos, emojis), solo se recortan espacios de los
 * extremos y se limita a 100. Vacía → null (no se guarda ni se muestra nada).
 */
export function normalizarDescripcionLinea(texto: string | null | undefined): string | null {
  const limpio = Array.from((texto ?? '').replace(/[\r\n]+/g, ' ').trim())
    .slice(0, LIMITE_DESCRIPCION_LINEA)
    .join('')
    .trim();
  return limpio === '' ? null : limpio;
}

// ------------------------------------------------------------
// Alias de producto (venta por voz)
// ------------------------------------------------------------

/**
 * Forma "comparable" de un texto: minúsculas, sin tildes, espacios colapsados y
 * recortados. Toda comparación de alias/nombres para la venta por voz se hace con
 * esto (lo que dicta el micrófono no trae mayúsculas ni tildes confiables).
 * Ej.: "  Cobertura  Bítter " → "cobertura bitter".
 */
export function normalizarParaBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parte el texto de alias (separado por comas) en una lista limpia: cada alias en
 * MAYÚSCULAS, sin espacios sobrantes, sin vacíos y sin repetidos (un repetido se
 * detecta ignorando tildes y mayúsculas; se conserva el primero).
 * Ej.: "cobertura, Bitter,, COBERTURA , winter" → ["COBERTURA", "BITTER", "WINTER"].
 */
export function partirAlias(texto: string | null | undefined): string[] {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const crudo of (texto ?? '').split(',')) {
    const alias = aMayusculas(crudo.replace(/\s+/g, ' '));
    if (alias === '') continue;
    const clave = normalizarParaBusqueda(alias);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    lista.push(alias);
  }
  return lista;
}

/** Une una lista de alias al texto que se guarda en la base (null si no hay ninguno). */
export function unirAlias(lista: string[]): string | null {
  return lista.length === 0 ? null : lista.join(',');
}
