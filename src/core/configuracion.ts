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

/** Añadir una descripción corta (hasta 100 caracteres) a cada producto de una venta o compra — Free. Default: OFF. */
export const CLAVE_DESCRIPCION_LINEAS = 'descripcion_en_lineas';

/** Notificación de stock bajo — Premium. Default: OFF. */
export const CLAVE_NOTIFICAR_STOCK_BAJO = 'notificar_stock_bajo';

/**
 * Modo venta por voz — Premium. Default: OFF. Por ahora solo habilita el campo
 * "Alias" en Nuevo/Editar producto; la venta por voz en sí llega en otra etapa.
 */
export const CLAVE_MODO_VENTA_VOZ = 'modo_venta_voz';

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

/**
 * ÚNICO punto que decide si el modo venta por voz (y con él el campo Alias) está
 * disponible: la clave tiene que estar en ON **y** el plan tiene que ser Premium.
 * Para cambiar el plan que lo habilita, se cambia solo acá.
 */
export function modoVentaVozDisponible(valorGuardado: string | null, esPremium: boolean): boolean {
  return esPremium && estaActivado(valorGuardado);
}

/** Nombre de tienda a mostrar: el guardado si hay uno con contenido, si no el predeterminado. */
export function obtenerNombreTienda(valorGuardado: string | null): string {
  const limpio = valorGuardado?.trim();
  return limpio ? limpio : NOMBRE_TIENDA_PREDETERMINADO;
}

/**
 * Control de usuarios — Premium. Default: OFF. Con '1' la app pide usuario y contraseña al
 * abrirse (ver core/usuarios.ts y core/permisos.ts).
 */
export const CLAVE_CONTROL_USUARIOS = 'control_usuarios';

/** Huella (JSON) de la clave de recuperación de los administradores. Nunca la clave en sí. */
export const CLAVE_USUARIOS_RECUPERACION = 'usuarios_recuperacion';

/**
 * ÚNICO punto que decide si el control de usuarios rige: el interruptor tiene que estar en ON
 * **y** el plan tiene que ser Premium. Si el Premium vence, el control se SUSPENDE (la app entra
 * normal, como siempre) y los usuarios se conservan hasta que se reactive el Premium.
 */
export function controlUsuariosVigente(valorGuardado: string | null, esPremium: boolean): boolean {
  return esPremium && estaActivado(valorGuardado);
}
