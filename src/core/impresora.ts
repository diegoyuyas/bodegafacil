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
 * Interruptor manual de la impresión Bluetooth. En `false`, la
 * pantalla de Configuración de Impresión, la de Reimprimir documentos
 * y el botón 🖨️ de Inicio muestran "Próximamente" en vez de la
 * función real — aunque el plan sea Premium.
 *
 * Ya en `true` para poder probar con una impresora térmica Bluetooth
 * real desde el APK instalado en un Android. IMPORTANTE: dentro de un
 * navegador (Chrome en PC, o abriendo la app en el navegador del
 * celular) esto NO va a imprimir de verdad — `listarImpresorasEmparejadas`
 * / `imprimirEn` (infraestructura/impresora-bluetooth/impresora.ts)
 * muestran el aviso "La impresión Bluetooth solo funciona dentro de la
 * app instalada en el celular, no en el navegador." en cuanto se las
 * usa fuera del APK. El Bluetooth clásico (SPP) que usan las
 * ticketeras no es accesible desde un navegador, ni en PC ni en
 * celular — solo desde la app nativa. Se puede navegar y revisar la
 * pantalla en Chrome (para ver que el diseño se vea bien), pero la
 * prueba de impresión real necesita sí o sí el APK en un Android con
 * la ticketera ya emparejada por Bluetooth.
 */
export const IMPRESION_BLUETOOTH_DISPONIBLE = true;
