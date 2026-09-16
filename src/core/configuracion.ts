/**
 * Vende Fácil — Configuración (Más > Configuración)
 * ------------------------------------------------------------
 * Claves de configuracion_app para los interruptores ON/OFF y el
 * nombre de tienda editable de la pantalla Más > Configuración.
 * Igual que en core/plan.ts, acá solo vive la lógica pura (claves +
 * interpretación de strings); la lectura/escritura real pasa por
 * ConfiguracionRepositorio.
 *
 * Todo en configuracion_app se guarda como texto, así que los
 * booleanos se codifican como '1' (activado) / ausente o cualquier
 * otro valor (desactivado, que es el default).
 */

/** Precio editable al momento de vender — Free. Default: OFF. */
export const CLAVE_PRECIO_EDITABLE_VENTA = 'precio_editable_venta';

/** Notificación de stock bajo — Premium. Default: OFF. */
export const CLAVE_NOTIFICAR_STOCK_BAJO = 'notificar_stock_bajo';

/** Nombre propio del negocio — Premium. Reemplaza la etiqueta "Vende Fácil" en Inicio. */
export const CLAVE_NOMBRE_TIENDA = 'nombre_tienda';

/** Etiqueta que se muestra en Inicio mientras el dueño no configure un nombre propio. */
export const NOMBRE_TIENDA_PREDETERMINADO = 'Vende Fácil';

const VALOR_ACTIVADO = '1';
const VALOR_DESACTIVADO = '0';

/** Convierte lo guardado en configuracion_app (o null si nunca se tocó) a boolean. */
export function estaActivado(valorGuardado: string | null): boolean {
  return valorGuardado === VALOR_ACTIVADO;
}

/** Convierte un boolean al string que se guarda en configuracion_app. */
export function valorParaGuardar(activado: boolean): string {
  return activado ? VALOR_ACTIVADO : VALOR_DESACTIVADO;
}

/** Nombre de tienda a mostrar: el guardado si hay uno con contenido, si no el predeterminado. */
export function obtenerNombreTienda(valorGuardado: string | null): string {
  const limpio = valorGuardado?.trim();
  return limpio ? limpio : NOMBRE_TIENDA_PREDETERMINADO;
}
