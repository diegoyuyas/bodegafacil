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
