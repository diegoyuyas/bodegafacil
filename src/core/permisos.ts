/**
 * Vende Fácil — Permisos por rol (control de usuarios, solo Premium)
 * ------------------------------------------------------------
 * Lógica PURA. Un Administrador puede todo; un usuario Estándar solo lo
 * que está en PERMISOS_ESTANDAR. Para cambiar qué puede hacer un estándar
 * basta con tocar esa lista.
 */

import type { CategoriaPin } from './bloqueo-pin';
import type { RolUsuario } from './usuarios';

export type Permiso =
  // — Los dos roles —
  | 'crear_venta' // hacer pedidos (incluye la venta por voz)
  | 'crear_cliente'
  | 'ver_reportes' // verlos; exportarlos es otro permiso
  | 'registrar_pago_fiado' // cobrar un fiado
  | 'reimprimir' // reimprimir comprobantes
  // — Solo administrador —
  | 'anular_venta'
  | 'anular_compra'
  | 'modificar_compra'
  | 'registrar_compra'
  | 'movimiento_caja' // ingresos y egresos de caja
  | 'anular_pago_fiado'
  | 'modificar_cliente'
  | 'gestionar_productos' // crear/editar productos, precios y ajustar stock
  | 'gestionar_proveedores'
  | 'importar_datos'
  | 'exportar' // Excel, Drive, CSV y compartir reportes
  | 'respaldo' // respaldar y restaurar
  | 'configuracion'
  | 'administrar_usuarios';

/** Lo que puede hacer un usuario Estándar. */
export const PERMISOS_ESTANDAR: ReadonlySet<Permiso> = new Set<Permiso>([
  'crear_venta',
  'crear_cliente',
  'ver_reportes',
  'registrar_pago_fiado',
  'reimprimir',
]);

export function puedeHacer(rol: RolUsuario, permiso: Permiso): boolean {
  return rol === 'administrador' || PERMISOS_ESTANDAR.has(permiso);
}

/**
 * Acciones puntuales que un administrador puede AUTORIZAR a un usuario estándar escribiendo
 * su contraseña, sin cerrar sesión. Lo delicado de verdad (exportar, respaldos, configuración,
 * importar y administrar usuarios) NO se puede autorizar así: exige entrar como administrador.
 */
const PERMISOS_AUTORIZABLES: ReadonlySet<Permiso> = new Set<Permiso>([
  'anular_venta',
  'anular_compra',
  'modificar_compra',
  'registrar_compra',
  'movimiento_caja',
  'anular_pago_fiado',
  'modificar_cliente',
  'gestionar_productos',
  'gestionar_proveedores',
]);

export function esAutorizablePuntualmente(permiso: Permiso): boolean {
  return PERMISOS_AUTORIZABLES.has(permiso);
}

const DESCRIPCIONES: Record<Permiso, string> = {
  crear_venta: 'hacer pedidos',
  crear_cliente: 'crear clientes',
  ver_reportes: 'ver los reportes',
  registrar_pago_fiado: 'cobrar fiados',
  reimprimir: 'reimprimir comprobantes',
  anular_venta: 'anular ventas',
  anular_compra: 'anular compras',
  modificar_compra: 'modificar compras',
  registrar_compra: 'registrar compras',
  movimiento_caja: 'registrar ingresos y egresos de caja',
  anular_pago_fiado: 'anular pagos de fiado',
  modificar_cliente: 'modificar la información de los clientes',
  gestionar_productos: 'crear o modificar productos y su stock',
  gestionar_proveedores: 'crear o modificar proveedores',
  importar_datos: 'importar datos',
  exportar: 'exportar datos',
  respaldo: 'respaldar o restaurar los datos',
  configuracion: 'cambiar la configuración',
  administrar_usuarios: 'administrar usuarios',
};

export function descripcionDePermiso(permiso: Permiso): string {
  return DESCRIPCIONES[permiso];
}

export function mensajeSoloAdministrador(permiso: Permiso): string {
  return `Solo un administrador puede ${descripcionDePermiso(permiso)}.`;
}

/**
 * Cuando NO rige el control de usuarios, estas acciones siguen pidiendo el PIN de siempre
 * (Más > Configuración > Configurar PIN): «anular» para las anulaciones y «modificar» para el resto.
 */
export function categoriaPinDe(permiso: Permiso): CategoriaPin {
  return permiso === 'anular_venta' || permiso === 'anular_compra' || permiso === 'anular_pago_fiado' ? 'anular' : 'modificar';
}
