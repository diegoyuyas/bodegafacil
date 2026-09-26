/**
 * Vende Fácil — Información de la Tienda (Más > Configuración > Información de la Tienda)
 * ------------------------------------------------------------
 * Datos de la tienda para el comprobante impreso (Más > Configuración
 * > Configuración de Impresoras): nombre, documento, ubicación,
 * contacto y una leyenda libre al pie. El nombre de tienda reutiliza
 * la clave que ya existía (`CLAVE_NOMBRE_TIENDA` en
 * `core/configuracion.ts`) — acá solo viven las claves NUEVAS de esta
 * pantalla. Función Premium completa (ver la pantalla).
 */

export const CLAVE_TIENDA_DOCUMENTO = 'tienda_documento';
export const CLAVE_TIENDA_UBICACION = 'tienda_ubicacion';
export const CLAVE_TIENDA_CONTACTO = 'tienda_contacto';
export const CLAVE_TIENDA_LEYENDA = 'tienda_leyenda';
export const CLAVE_TIENDA_VENDEDOR = 'tienda_vendedor_nombre';
export const CLAVE_TIENDA_VENDEDOR_DOCUMENTO = 'tienda_vendedor_documento';

/** No obligatorio; cuando se llena, hasta 50 caracteres. */
export const LONGITUD_MAXIMA_UBICACION = 50;
/** No obligatorio; cuando se llena, hasta 15 caracteres. */
export const LONGITUD_MAXIMA_CONTACTO = 15;
/** No obligatoria; mensaje libre debajo del comprobante impreso. */
export const LONGITUD_MAXIMA_LEYENDA = 150;
/** No obligatorio; cuando se llena, hasta 50 caracteres. */
export const LONGITUD_MAXIMA_VENDEDOR = 50;
/** No obligatorio; cuando se llena, hasta 15 caracteres. No se imprime en el ticket, solo va al reporte de ventas. */
export const LONGITUD_MAXIMA_VENDEDOR_DOCUMENTO = 15;
