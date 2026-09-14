import type { Cliente, Compra, MovimientoCaja, Producto, Proveedor, Venta } from '@/core/tipos';

// Las filas que devuelve sql.js tienen exactamente los nombres de
// columna de esquema.sql (snake_case). Estos tipos documentan esa
// forma antes de mapearla a las interfaces del dominio (camelCase).

export interface FilaProducto {
  id: number;
  nombre: string;
  categoria_id: number | null;
  codigo: string | null;
  precio_venta: number;
  costo: number;
  stock_actual: number;
  stock_minimo: number;
  unidad_medida: string;
  activo: number;
  creado_en: string;
  actualizado_en: string;
}

export function mapearProducto(fila: FilaProducto): Producto {
  return {
    id: fila.id,
    nombre: fila.nombre,
    categoriaId: fila.categoria_id,
    codigo: fila.codigo,
    precioVenta: fila.precio_venta,
    costo: fila.costo,
    stockActual: fila.stock_actual,
    stockMinimo: fila.stock_minimo,
    unidadMedida: fila.unidad_medida,
    activo: fila.activo === 1,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export interface FilaCliente {
  id: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  direccion: string | null;
  saldo_pendiente: number;
  fecha_ultimo_pago: string | null;
  activo: number;
  creado_en: string;
}

export function mapearCliente(fila: FilaCliente): Cliente {
  return {
    id: fila.id,
    nombre: fila.nombre,
    documento: fila.documento,
    telefono: fila.telefono,
    direccion: fila.direccion,
    saldoPendiente: fila.saldo_pendiente,
    fechaUltimoPago: fila.fecha_ultimo_pago,
    activo: fila.activo === 1,
    creadoEn: fila.creado_en,
  };
}

export interface FilaMovimientoCaja {
  id: number;
  tipo: MovimientoCaja['tipo'];
  monto: number;
  concepto: string;
  metodo_pago: MovimientoCaja['metodoPago'];
  venta_id: number | null;
  saldo_resultante: number;
  fecha_hora: string;
}

export function mapearMovimientoCaja(fila: FilaMovimientoCaja): MovimientoCaja {
  return {
    id: fila.id,
    tipo: fila.tipo,
    monto: fila.monto,
    concepto: fila.concepto,
    metodoPago: fila.metodo_pago,
    ventaId: fila.venta_id,
    saldoResultante: fila.saldo_resultante,
    fechaHora: fila.fecha_hora,
  };
}
export interface FilaVenta {
  id: number;
  fecha_hora: string;
  cliente_id: number | null;
  metodo_pago: Venta['metodoPago'];
  subtotal: number;
  total: number;
  ganancia_estimada: number;
  anulada: number;
  motivo_anulacion: string | null;
  creado_en: string;
}

export function mapearVenta(fila: FilaVenta): Venta {
  return {
    id: fila.id,
    fechaHora: fila.fecha_hora,
    clienteId: fila.cliente_id,
    metodoPago: fila.metodo_pago,
    subtotal: fila.subtotal,
    total: fila.total,
    gananciaEstimada: fila.ganancia_estimada,
    anulada: fila.anulada === 1,
    motivoAnulacion: fila.motivo_anulacion,
    creadoEn: fila.creado_en,
  };
}

export interface FilaProveedor {
  id: number;
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  activo: number;
}

export function mapearProveedor(fila: FilaProveedor): Proveedor {
  return {
    id: fila.id,
    nombre: fila.nombre,
    ruc: fila.ruc,
    telefono: fila.telefono,
    activo: fila.activo === 1,
  };
}

export interface FilaCompra {
  id: number;
  proveedor_id: number | null;
  proveedor_nombre_libre: string | null;
  comprobante: string | null;
  fecha: string;
  total: number;
  estado: Compra['estado'];
  nota: string | null;
}

export function mapearCompra(fila: FilaCompra): Compra {
  return {
    id: fila.id,
    proveedorId: fila.proveedor_id,
    proveedorNombreLibre: fila.proveedor_nombre_libre,
    comprobante: fila.comprobante,
    fecha: fila.fecha,
    total: fila.total,
    estado: fila.estado,
    nota: fila.nota,
  };
}
