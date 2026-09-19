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

export const LONGITUD_PIN_ACCESO = 4;

/** El PIN de acceso es siempre de 4 dígitos numéricos (a diferencia del PIN admin, que es libre). */
export function pinAccesoTieneFormatoValido(pin: string): boolean {
  return new RegExp(`^[0-9]{${LONGITUD_PIN_ACCESO}}$`).test(pin);
}
