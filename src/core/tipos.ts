/**
 * Bodega Fácil — Tipos del núcleo de negocio
 * ------------------------------------------------------------
 * Estas interfaces reflejan 1 a 1 las tablas de `esquema.sql`.
 * Se usan en la capa de negocio y en los repositorios de acceso
 * a datos, para que toda la app hable el mismo idioma que la
 * base de datos: español.
 */

export type MetodoPago = 'efectivo' | 'yape' | 'plin' | 'tarjeta' | 'fiado';
export type MetodoPagoSinFiado = Exclude<MetodoPago, 'fiado'>;
export type EstadoDeuda = 'pendiente' | 'pagada_parcial' | 'pagada';
export type TipoMovimientoCaja = 'ingreso' | 'egreso';
export type TipoMovimientoInventario = 'entrada' | 'salida' | 'ajuste';
export type EstadoCompra = 'pendiente' | 'recibida' | 'anulada';
export type TipoRespaldo = 'manual' | 'automatico';
export type EstadoRespaldo = 'completado' | 'fallido';

export interface Categoria {
  id: number;
  nombre: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export interface Producto {
  id: number;
  nombre: string;
  categoriaId: number | null;
  codigo: string | null;
  precioVenta: number;
  costo: number;
  stockActual: number;
  stockMinimo: number;
  unidadMedida: string;
  activo: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

export interface Cliente {
  id: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  direccion: string | null;
  saldoPendiente: number;
  fechaUltimoPago: string | null;
  activo: boolean;
  creadoEn: string;
}

export interface Venta {
  id: number;
  fechaHora: string;
  clienteId: number | null;
  metodoPago: MetodoPago;
  subtotal: number;
  total: number;
  gananciaEstimada: number;
  anulada: boolean;
  motivoAnulacion: string | null;
  creadoEn: string;
}

export interface DetalleVenta {
  id: number;
  ventaId: number;
  productoId: number;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  subtotal: number;
  gananciaLinea: number;
}

export interface DeudaCliente {
  id: number;
  clienteId: number;
  ventaId: number | null;
  monto: number;
  saldoPendiente: number;
  estado: EstadoDeuda;
  fecha: string;
}

export interface PagoDeuda {
  id: number;
  clienteId: number;
  deudaId: number | null;
  monto: number;
  metodoPago: MetodoPagoSinFiado;
  nota: string | null;
  fecha: string;
}

export interface MovimientoCaja {
  id: number;
  tipo: TipoMovimientoCaja;
  monto: number;
  concepto: string;
  metodoPago: MetodoPagoSinFiado | null;
  ventaId: number | null;
  saldoResultante: number;
  fechaHora: string;
}

export interface Proveedor {
  id: number;
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  activo: boolean;
}

export interface Compra {
  id: number;
  proveedorId: number | null;
  /** Nombre escrito al vuelo cuando no se elige un proveedor guardado. */
  proveedorNombreLibre: string | null;
  /** Serie-número del comprobante, libre, hasta 15 caracteres (ej: F001-00000010). */
  comprobante: string | null;
  fecha: string;
  total: number;
  estado: EstadoCompra;
  nota: string | null;
}

export interface DetalleCompra {
  id: number;
  compraId: number;
  productoId: number;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
}

export interface MovimientoInventario {
  id: number;
  productoId: number;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  motivo: string;
  ventaId: number | null;
  compraId: number | null;
  stockResultante: number;
  fechaHora: string;
}

export interface ConfiguracionApp {
  clave: string;
  valor: string;
}

export interface MetadatoRespaldo {
  id: number;
  fechaHora: string;
  tipo: TipoRespaldo;
  rutaArchivo: string | null;
  tamanoBytes: number | null;
  estado: EstadoRespaldo;
}

/**
 * Forma de entrada para registrar una línea de venta, antes de
 * calcular subtotal y ganancia (eso lo hace la capa de reglas
 * de negocio, no la UI).
 */
export interface LineaVentaEntrada {
  productoId: number;
  cantidad: number;
}

/**
 * Resultado de construir una venta completa, listo para persistir.
 */
export interface VentaCalculada {
  detalles: DetalleVenta[];
  subtotal: number;
  total: number;
  gananciaEstimada: number;
}

/**
 * Entrada para el caso de uso "registrar venta" (capa de repositorios).
 */
export interface RegistrarVentaInput {
  lineas: LineaVentaEntrada[];
  metodoPago: MetodoPago;
  clienteId?: number | null;
}

/**
 * Resumen del día para el dashboard (sección 7 del documento maestro).
 */
export interface ResumenDia {
  fecha: string;
  totalVentas: number;
  gananciaEstimada: number;
  numeroVentas: number;
  porMetodoPago: { metodo: MetodoPago; monto: number }[];
  productosStockBajo: number;
  totalPorCobrar: number;
}

/** Una fila de la lista de ventas de hoy en Inicio (con nombre de cliente ya resuelto). */
export interface VentaListaItem {
  id: number;
  fechaHora: string;
  metodoPago: MetodoPago;
  total: number;
  clienteNombre: string | null;
  anulada: boolean;
}

/** Una línea de producto dentro de una venta, para el preview al expandir. */
export interface LineaVentaResumen {
  producto: string;
  cantidad: number;
}

/**
 * Una deuda pendiente individual (una venta al fiado, con sus
 * productos), para armar el mensaje de WhatsApp de cobranza.
 */
export interface DeudaPendienteDetalle {
  fecha: string;
  saldoPendiente: number;
  lineas: LineaVentaResumen[];
}

/** Una fila del reporte de compras por rango de fechas (con proveedor ya resuelto). */
export interface CompraListaItem {
  id: number;
  fecha: string;
  proveedorNombre: string | null;
  comprobante: string | null;
  total: number;
  estado: EstadoCompra;
}

/** Una fila del reporte "productos más vendidos" por rango de fechas. */
export interface ProductoMasVendidoItem {
  productoId: number;
  nombre: string;
  cantidadVendida: number;
  totalVendido: number;
  gananciaTotal: number;
}
