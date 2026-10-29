/**
 * Vende Fácil — Actividad de usuarios (trazabilidad)
 * ------------------------------------------------------------
 * Lógica PURA: qué acciones delicadas quedan registradas y cómo se cuentan en palabras.
 * Con el control de usuarios rigiendo, cada acción delicada guarda QUIÉN la hizo, CUÁNDO, y
 * si la autorizó un administrador, QUIÉN la autorizó. Sin control de usuarios no se registra
 * nada (no hay a quién atribuírselo). Las ventas, compras, cobros y movimientos de caja además
 * guardan el usuario en su propia fila (`usuario_id`).
 */

import type { Permiso } from './permisos';

export type AccionActividad =
  | 'venta_anulada'
  | 'compra_registrada'
  | 'compra_modificada'
  | 'compra_anulada'
  | 'caja_ingreso'
  | 'caja_egreso'
  | 'pago_fiado_anulado'
  | 'cliente_modificado'
  | 'producto_creado'
  | 'producto_modificado'
  | 'stock_ajustado'
  | 'proveedor_creado'
  | 'proveedor_modificado'
  | 'usuario_creado'
  | 'usuario_modificado'
  | 'clave_cambiada'
  | 'control_activado'
  | 'control_desactivado'
  | 'clave_recuperacion_nueva'
  | 'serie_creada'
  | 'serie_modificada'
  | 'serie_desactivada'
  | 'serie_asignada'
  | 'serie_numero_cambiado';

export interface EventoActividad {
  accion: AccionActividad;
  /** Sobre qué: 'venta', 'compra', 'caja', 'cliente', 'producto', 'proveedor', 'usuario'... */
  entidad: string;
  entidadId?: number | null;
  /** Dato corto para reconocer el caso (ej. "V-12", el nombre del producto). Nunca contraseñas. */
  detalle?: string;
  /**
   * El permiso que hizo falta para esta acción. Si un administrador la autorizó hace un momento
   * para ESE permiso, queda anotado quién fue.
   */
  permiso?: Permiso;
}

/** Lo que usan los repositorios para dejar rastro, sin saber nada de sesiones ni pantallas. */
export interface RegistroActividad {
  /** Quién está usando la app ahora (null si no rige el control de usuarios). */
  usuarioActualId(): number | null;
  registrar(evento: EventoActividad): void;
}

export interface ActividadUsuario {
  id: number;
  fechaHora: string;
  usuarioId: number;
  usuarioNombre: string;
  accion: AccionActividad;
  entidad: string;
  entidadId: number | null;
  detalle: string | null;
  autorizadoPorId: number | null;
  autorizadoPorNombre: string | null;
}

/** Resumen de ventas de un usuario en un periodo (las ventas de antes del control salen como «Sin usuario»). */
export interface ResumenVentasUsuario {
  usuarioId: number | null;
  usuarioNombre: string;
  /** Ventas no anuladas. */
  cantidad: number;
  total: number;
  anuladas: number;
}

const VERBOS: Record<AccionActividad, string> = {
  venta_anulada: 'anuló la venta',
  compra_registrada: 'registró la compra',
  compra_modificada: 'modificó la compra',
  compra_anulada: 'anuló la compra',
  caja_ingreso: 'registró un ingreso de caja:',
  caja_egreso: 'registró un egreso de caja:',
  pago_fiado_anulado: 'anuló un pago de fiado de',
  cliente_modificado: 'modificó al cliente',
  producto_creado: 'creó el producto',
  producto_modificado: 'modificó el producto',
  stock_ajustado: 'ajustó el stock de',
  proveedor_creado: 'creó al proveedor',
  proveedor_modificado: 'modificó al proveedor',
  usuario_creado: 'creó al usuario',
  usuario_modificado: 'modificó al usuario',
  clave_cambiada: 'cambió la contraseña de',
  control_activado: 'encendió el control de usuarios',
  control_desactivado: 'apagó el control de usuarios',
  clave_recuperacion_nueva: 'generó una clave de recuperación nueva',
  serie_creada: 'creó la serie',
  serie_modificada: 'modificó la serie',
  serie_desactivada: 'desactivó la serie',
  serie_asignada: 'asignó la serie',
  serie_numero_cambiado: 'cambió el siguiente número de la serie',
};

/** «anuló la venta V-12», «creó el producto GASEOSA»... (sin el nombre de quien lo hizo). */
export function textoDeActividad(actividad: Pick<ActividadUsuario, 'accion' | 'detalle'>): string {
  const verbo = VERBOS[actividad.accion] ?? actividad.accion;
  return actividad.detalle ? `${verbo} ${actividad.detalle}` : verbo;
}
