/**
 * Vende Fácil — PIN de acceso a la app (Más > Configuración > Configurar PIN)
 * ------------------------------------------------------------
 * Distinto del PIN del panel de administrador (`core/plan.ts`,
 * `CLAVE_ADMIN_PIN_HASH`): ese protege activar/desactivar Premium;
 * este protege simplemente ABRIR la app. Mismo mecanismo (hash
 * SHA-256, nunca el PIN en texto plano — ver
 * `infraestructura/sqlite/bloqueo-pin.repositorio.ts`), pero claves y
 * estado independientes: activar/desactivar uno no toca el otro.
 */

export const CLAVE_BLOQUEO_PIN_ACTIVO = 'bloqueo_pin_activo';
export const CLAVE_BLOQUEO_PIN_HASH = 'bloqueo_pin_hash';

/**
 * Para qué se pide el PIN (cada uno es un interruptor independiente en
 * Más > Configuración > Configurar PIN). Solo tienen efecto si hay un PIN
 * configurado y activo.
 *  - 'ingresar'  : al abrir la app.
 *  - 'anular'    : anular ventas, compras, fiados y pagos de fiados.
 *  - 'modificar' : modificar/ajustar productos, stock, clientes, proveedores,
 *                  compras, cobrar fiados e ingresos/egresos de caja.
 */
export type DestinoPin = 'ingresar' | 'anular' | 'modificar';
/** Los destinos que se piden en medio de una operación (todos menos 'ingresar'). */
export type CategoriaPin = Exclude<DestinoPin, 'ingresar'>;

export const CLAVE_PIN_PARA_INGRESAR = 'pin_requerido_ingresar';
export const CLAVE_PIN_PARA_ANULAR = 'pin_requerido_anular';
export const CLAVE_PIN_PARA_MODIFICAR = 'pin_requerido_modificar';

export const CLAVE_POR_DESTINO: Record<DestinoPin, string> = {
  ingresar: CLAVE_PIN_PARA_INGRESAR,
  anular: CLAVE_PIN_PARA_ANULAR,
  modificar: CLAVE_PIN_PARA_MODIFICAR,
};

export const LONGITUD_PIN_ACCESO = 4;

/** El PIN de acceso es siempre de 4 dígitos numéricos (a diferencia del PIN admin, que es libre). */
export function pinAccesoTieneFormatoValido(pin: string): boolean {
  return new RegExp(`^[0-9]{${LONGITUD_PIN_ACCESO}}$`).test(pin);
}
