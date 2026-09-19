/**
 * Vende Fácil — Configuración de Impresoras (Más > Configuración de Impresoras)
 * ------------------------------------------------------------
 * Solo guarda cuál impresora Bluetooth (ya emparejada por Android) se
 * usa para imprimir comprobantes, y si la impresión está activada.
 * Función Premium.
 */

export const CLAVE_IMPRESORA_ACTIVA = 'impresora_bluetooth_activa';
export const CLAVE_IMPRESORA_DIRECCION = 'impresora_bluetooth_direccion';
export const CLAVE_IMPRESORA_NOMBRE = 'impresora_bluetooth_nombre';

/**
 * Interruptor manual: la impresión Bluetooth quedó implementada pero
 * nunca se probó en una ticketera física real. Mientras esto sea
 * `false`, la pantalla de Configuración de Impresoras, la de
 * Reimprimir documentos y el botón 🖨️ de Inicio muestran
 * "Próximamente" en vez de la función real — aunque el plan sea
 * Premium. Todo el código de impresión (core/comprobante-impresion.ts,
 * infraestructura/impresora-bluetooth/*) queda intacto y listo: para
 * activarlo de verdad, una vez probado con una impresora real, alcanza
 * con cambiar esto a `true`.
 */
export const IMPRESION_BLUETOOTH_DISPONIBLE = false;
