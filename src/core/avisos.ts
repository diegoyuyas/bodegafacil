/**
 * Vende Fácil — Avisos de éxito y estados de las listas (lógica pura)
 * ------------------------------------------------------------
 * Los textos y reglas que usa toda la app para confirmar que algo se guardó («Venta guardada ✓»)
 * y para decidir qué mostrar en una lista: cargando (esqueleto), vacía (con acción), sin resultados
 * de la búsqueda, o la lista. Sin UI: se prueba con `tsx`.
 */

export type TipoAviso = 'exito' | 'error' | 'info';

/** Textos de éxito de la app (sin la marca ✓: se agrega sola con `textoExito`). */
export const AVISOS = {
  ventaGuardada: 'Venta guardada',
  pagoRegistrado: 'Pago registrado',
  productoGuardado: 'Producto guardado',
  productoActualizado: 'Producto actualizado',
  stockAjustado: 'Stock ajustado',
  clienteGuardado: 'Cliente guardado',
  clienteActualizado: 'Cliente actualizado',
  telefonoGuardado: 'Teléfono guardado',
  compromisoGuardado: 'Compromiso de pago guardado',
  compromisoQuitado: 'Compromiso quitado',
  compraGuardada: 'Compra guardada',
} as const;

/** «Venta guardada» → «Venta guardada ✓». Idempotente: no repite la marca ni deja punto final. */
export function textoExito(texto: string): string {
  const limpio = texto.trim().replace(/[\s.✓✔]+$/u, '');
  return limpio === '' ? '✓' : `${limpio} ✓`;
}

const DURACION_MINIMA_MS = 2200;
const DURACION_MAXIMA_MS = 5000;
const MS_POR_CARACTER_EXTRA = 45;
const CARACTERES_CORTOS = 24;

/** Cuánto se queda el aviso en pantalla: lo justo para leerlo (más largo, más tiempo; entre 2.2 y 5 s). */
export function duracionAvisoMs(texto: string): number {
  const extra = Math.max(0, texto.length - CARACTERES_CORTOS) * MS_POR_CARACTER_EXTRA;
  return Math.min(DURACION_MAXIMA_MS, DURACION_MINIMA_MS + extra);
}

export type EstadoLista = 'cargando' | 'vacia' | 'sin_resultados' | 'lista';

/**
 * Qué mostrar en una lista.
 *  - `cargando`: los datos aún no están (esqueleto, nunca una pantalla vacía).
 *  - `vacia`: no hay nada guardado todavía (mensaje con la acción para crear el primero).
 *  - `sin_resultados`: hay datos, pero la búsqueda o el filtro no deja ninguno.
 *  - `lista`: hay algo que mostrar.
 */
export function estadoLista(datos: { cargando: boolean; total: number; visibles: number }): EstadoLista {
  if (datos.cargando) return 'cargando';
  if (datos.total === 0) return 'vacia';
  if (datos.visibles === 0) return 'sin_resultados';
  return 'lista';
}
