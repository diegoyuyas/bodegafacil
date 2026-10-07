/**
 * Vende Fácil — Tipos del núcleo de negocio
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
  /** false = no lleva stock (ej. servicios, recarga de celular): no descuenta ni bloquea venta; stockActual/stockMinimo quedan en 0. */
  controlaStock: boolean;
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
  /** Número usado para WhatsApp en esta venta puntual (clientes eventuales no tienen teléfono propio guardado). */
  telefonoWhatsapp: string | null;
  /** Foto del comprobante de pago (Yape/Plin, Premium, opcional) — ruta del archivo, no la foto en sí. */
  comprobantePagoRuta: string | null;
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
  descripcion?: string | null;
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

/**
 * A qué venta/cliente/compra corresponde un movimiento de caja — solo
 * para poder MOSTRAR a quién pertenece (ver MovimientoCaja.referencia);
 * nunca afecta montos ni saldo.
 */
/**
 * 'normal': plata que realmente entró o salió (venta, compra, cobro, ingreso/egreso manual).
 * 'anulacion' / 'ajuste': reversas por anular o modificar algo; no son ingresos ni egresos
 * reales, así que los totales las muestran aparte.
 */
export type ClaseMovimientoCaja = 'normal' | 'anulacion' | 'ajuste';

export interface ReferenciaCajaMovimiento {
  clase?: ClaseMovimientoCaja;
  /** Abono de fiado que originó el movimiento (cobro), para poder marcarlo si luego se anula el pago. */
  abonoId?: number | null;
  ventaId?: number | null;
  compraId?: number | null;
  clienteId?: number | null;
}

export interface MovimientoCaja {
  id: number;
  tipo: TipoMovimientoCaja;
  monto: number;
  concepto: string;
  metodoPago: MetodoPagoSinFiado | null;
  ventaId: number | null;
  /** Compra a la que pertenece el movimiento (la compra y sus ajustes), si aplica. */
  compraId: number | null;
  saldoResultante: number;
  fechaHora: string;
  clase: ClaseMovimientoCaja;
  /** La venta o compra a la que pertenece este movimiento fue anulada: se muestra en gris y no cuenta en los totales. */
  anulado: boolean;
  /**
   * Parte de un cobro de fiado que corresponde a ventas que luego se anularon y cuyo dinero
   * se devolvió al cliente. Ese pedazo ya no es plata real: no cuenta en los totales.
   */
  montoAnulado: number;
  /** Cliente de la venta/cobro, proveedor de la compra, o "Ajuste Manual" si no aplica ninguno. */
  referencia: string;
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
  metodoPago: MetodoPagoSinFiado | null;
  motivoAnulacion: string | null;
}

export interface DetalleCompra {
  id: number;
  compraId: number;
  productoId: number;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
  descripcion?: string | null;
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
  /**
   * Precio a cobrar por unidad, si se quiere anular el precioVenta
   * del catálogo (switch "Precio editable al vender" en Más >
   * Configuración). Si se omite, se usa el precioVenta del producto.
   */
  precioUnitario?: number;
  /** Nota corta de la línea (hasta 100 caracteres), solo si está activo "Añadir descripción en Venta/Compra". */
  descripcion?: string | null;
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
  /** Número de celular para WhatsApp, si se ingresó uno (independiente de si se marcó "Enviar a WhatsApp"). */
  telefonoWhatsapp?: string | null;
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
  /** Precio unitario cobrado (el preview de Inicio lo muestra). */
  precioUnitario?: number;
  descripcion?: string | null;
}

/** Una línea de producto con precio, para armar el mensaje de WhatsApp de una venta (Ventas → Nueva venta / reenvío). */
export interface LineaVentaMensaje {
  producto: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  descripcion?: string | null;
}

/** Una fila de resultado en Más > Reimprimir documentos. */
export interface VentaReimpresionItem {
  id: number;
  fechaHora: string;
  metodoPago: MetodoPago;
  total: number;
  clienteNombre: string | null;
  clienteDocumento: string | null;
  anulada: boolean;
}

/**
 * Una deuda pendiente individual (una venta al fiado, con sus
 * productos), para armar el mensaje de WhatsApp de cobranza.
 */
export interface DeudaPendienteDetalle {
  /** Venta al fiado que originó esta deuda (null solo en datos muy antiguos). */
  ventaId: number | null;
  fecha: string;
  /** Monto original de la venta al fiado. */
  montoOriginal: number;
  /** Lo que todavía falta cobrar de ESTA venta (ya descontados los abonos). */
  saldoPendiente: number;
  lineas: LineaVentaResumen[];
}

/**
 * Un pago (abono) de fiado ya registrado, con todas sus porciones juntas
 * (un abono puede repartirse entre varias ventas al fiado).
 */
export interface PagoFiado {
  /** Identifica el abono completo; es lo que se pasa a `anularPago`. */
  clave: string;
  clienteId: number;
  fecha: string;
  monto: number;
  metodoPago: MetodoPagoSinFiado;
  fotoRuta: string | null;
  /** Ventas al fiado a las que se aplicó este pago. */
  ventas: number[];
  anulado: boolean;
  motivoAnulacion: string | null;
  fechaAnulacion: string | null;
}

/** Una fila de la bitácora de pagos de fiado anulados. */
export interface RegistroBitacoraAnulacionPago {
  id: number;
  clienteId: number | null;
  clienteNombre: string;
  monto: number;
  metodoPago: string;
  fechaPago: string;
  motivo: string;
  detalle: string;
  fechaAnulacion: string;
}

/** Una foto (Yape/Plin) de un abono de fiado, aplicada a una venta puntual. */
export interface FotoPagoFiado {
  /** Fila de pago_deuda — para poder reenlazarla si el archivo original ya no existe. */
  pagoDeudaId: number;
  ventaId: number;
  fotoRuta: string;
  fecha: string;
}

/** Una fila del reporte de compras por rango de fechas (con proveedor ya resuelto). */
export interface CompraListaItem {
  id: number;
  fecha: string;
  proveedorNombre: string | null;
  comprobante: string | null;
  total: number;
  estado: EstadoCompra;
  metodoPago: MetodoPagoSinFiado | null;
  /** Nombres de los productos de esta compra, separados por coma — solo para poder buscar por producto en el listado. */
  productos: string;
}

/** Una fila del reporte "productos más vendidos" por rango de fechas. */
export interface ProductoMasVendidoItem {
  productoId: number;
  nombre: string;
  cantidadVendida: number;
  totalVendido: number;
  gananciaTotal: number;
}

/**
 * Una entrada del historial de costos de un producto: lo que costó
 * cada vez que se compró, tomado de las compras registradas
 * (Premium, sección "Historial de costos" dentro de Reportes).
 */
export interface HistorialCostoItem {
  fecha: string;
  costoUnitario: number;
  cantidad: number;
  proveedorNombre: string | null;
  compraId: number;
}

/** Un movimiento de stock de un producto (Kardex), leído de movimiento_inventario. */
export interface MovimientoInventarioItem {
  id: number;
  fechaHora: string;
  tipo: 'entrada' | 'salida' | 'ajuste';
  cantidad: number;
  /** 'venta', 'compra', 'ajuste_manual', 'importacion_stock', etc. */
  motivo: string;
  /** Stock del producto justo después de este movimiento. */
  stockResultante: number;
}

/** Campo de producto que puede quedar registrado en su bitácora de cambios manuales. */
export type CampoHistorialProducto = 'nombre' | 'precio_venta' | 'costo' | 'stock' | 'stock_minimo';

/**
 * Una fila de la bitácora de un producto — un cambio manual a la vez
 * (Editar cambia nombre/precio/costo/stock mínimo; Ajustar cambia
 * stock). `valorAnterior` es null en la fila que deja el valor inicial
 * al crear el producto. `motivo` solo aplica a 'stock' (el motivo que
 * se escribió al ajustar).
 */
export interface HistorialProductoItem {
  campo: CampoHistorialProducto;
  valorAnterior: string | null;
  valorNuevo: string;
  motivo: string | null;
  fecha: string;
}
