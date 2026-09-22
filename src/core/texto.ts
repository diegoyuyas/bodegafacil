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
