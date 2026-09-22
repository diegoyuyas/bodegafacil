/**
 * Vende Fácil — Puertos de repositorio
 * ------------------------------------------------------------
 * La UI y la capa de negocio dependen de estas interfaces, nunca
 * de SQLite directamente (sección 5 del documento maestro: "la capa
 * de persistencia debe abstraerse de la interfaz"). La implementación
 * concreta vive en `src/infraestructura/sqlite/*` y se podría
 * reemplazar (ej. por el plugin nativo de Capacitor) sin tocar la UI.
 */

import type {
  Cliente,
  Compra,
  CompraListaItem,
  DeudaPendienteDetalle,
  EstadoRespaldo,
  HistorialCostoItem,
  LineaVentaMensaje,
  LineaVentaResumen,
  MetadatoRespaldo,
  MetodoPagoSinFiado,
  MovimientoCaja,
  MovimientoInventarioItem,
  Producto,
  ProductoMasVendidoItem,
  Proveedor,
  RegistrarVentaInput,
  ResumenDia,
  TipoRespaldo,
  Venta,
  VentaListaItem,
  VentaReimpresionItem,
} from './tipos';
import type { FilaVentaDetallada, FilaCompraDetallada } from './exportacion';
import type { EstadoPlan } from './plan';

export interface ProductoRepositorio {
  listarActivos(): Producto[];
  /** Para la pantalla de administración: incluye también los inactivos. */
  listarTodos(): Producto[];
  buscarPorNombre(texto: string): Producto[];
  obtenerPorId(id: number): Producto;
  crear(datos: DatosNuevoProducto): Producto;
  actualizarStock(id: number, nuevoStock: number): void;
  /** Edita los datos del producto, incluyendo si está activo (los inactivos no salen a vender). */
  actualizar(id: number, datos: DatosActualizarProducto): Producto;
  /**
   * Ajuste manual de stock (conteo físico, merma, corrección), sin pasar
   * por una compra. `delta` puede ser positivo (sumar) o negativo
   * (restar); se registra en movimiento_inventario con tipo 'ajuste'
   * para mantener la trazabilidad. Lanza ErrorDeNegocio si el ajuste
   * dejaría el stock en negativo o si no se da un motivo.
   */
  ajustarStock(id: number, delta: number, motivo: string): Producto;
  /** Kardex: movimientos de stock de un producto en un rango de fechas ('YYYY-MM-DD'), de más antiguo a más reciente. */
  listarMovimientosInventario(productoId: number, desde: string, hasta: string): MovimientoInventarioItem[];
}

export interface DatosNuevoProducto {
  nombre: string;
  categoriaId?: number | null;
  codigo?: string | null;
  precioVenta: number;
  costo: number;
  stockActual: number;
  stockMinimo: number;
  controlaStock: boolean;
  unidadMedida: string;
}

export interface DatosActualizarProducto {
  nombre: string;
  categoriaId?: number | null;
  codigo?: string | null;
  precioVenta: number;
  costo: number;
  stockMinimo: number;
  controlaStock: boolean;
  unidadMedida: string;
  activo: boolean;
}

export interface ClienteRepositorio {
  listarActivos(): Cliente[];
  /** Para la pantalla de administración: incluye también los inactivos. */
  listarTodos(): Cliente[];
  buscarPorTexto(texto: string): Cliente[];
  obtenerPorId(id: number): Cliente;
  crear(nombre: string, documento: string, telefono?: string | null): Cliente;
  /** Edita los datos del cliente, incluyendo si está activo. */
  actualizar(id: number, datos: DatosActualizarCliente): Cliente;
}

export interface DatosActualizarCliente {
  nombre: string;
  documento: string;
  telefono?: string | null;
  activo: boolean;
}

export interface VentaRepositorio {
  registrarVenta(input: RegistrarVentaInput): Venta;
  obtenerPorId(id: number): Venta;
  listarDeHoy(): Venta[];
  /** Para Inicio: ventas de hoy con nombre de cliente ya resuelto. */
  listarDeHoyConDetalle(): VentaListaItem[];
  /** Para el preview al expandir una venta en la lista. */
  obtenerLineas(ventaId: number): LineaVentaResumen[];
  /** Líneas con precio unitario y subtotal, para armar el mensaje de WhatsApp de una venta. */
  obtenerLineasParaMensaje(ventaId: number): LineaVentaMensaje[];
  /** Foto del comprobante de pago (Yape/Plin, Premium) — guarda solo la ruta del archivo. */
  guardarComprobantePago(ventaId: number, ruta: string): void;
  /** Repone stock, revierte caja/deuda, y marca la venta como anulada. */
  anularVenta(id: number, motivo?: string): void;
  /**
   * Guarda (o reemplaza) el teléfono de WhatsApp asociado a una venta ya
   * registrada — para cuando se completa recién al reenviar desde Inicio,
   * así no se vuelve a pedir la próxima vez.
   */
  actualizarTelefonoWhatsapp(id: number, telefono: string): void;
  resumenDelDia(fechaIso?: string): ResumenDia;
  /** Total histórico de ventas válidas (no anuladas) — para el umbral de Plan Pro. */
  contarTotalHistorico(): number;
  /**
   * Filas planas (venta + producto + cliente) listas para exportar a CSV.
   * `desde`/`hasta` son fechas 'YYYY-MM-DD' inclusivas; sin ellas, exporta todo el historial.
   */
  listarDetalleParaExportar(desde?: string, hasta?: string): FilaVentaDetallada[];
  /**
   * Productos más vendidos (cantidad, monto y ganancia) dentro de un
   * rango de fechas 'YYYY-MM-DD' inclusive, de mayor a menor cantidad
   * (Premium).
   */
  listarProductosMasVendidos(desde: string, hasta: string, limite?: number): ProductoMasVendidoItem[];
  /**
   * Para Más > Reimprimir documentos: ventas dentro de un rango de
   * fechas 'YYYY-MM-DD' inclusive que además coincidan con `texto`
   * libre (número de comprobante "V-1", nombre o documento del
   * cliente, o monto) — `texto` vacío no filtra por texto, solo por
   * fecha. De más reciente a más antigua.
   */
  buscarParaReimprimir(desde: string, hasta: string, texto: string): VentaReimpresionItem[];
}

/**
 * La caja es su propio dominio: tanto una venta al contado como el pago
 * de una deuda generan un ingreso de caja. Separarlo evita duplicar la
 * lógica de "saldo anterior + ingresos - egresos" en cada repositorio.
 */
export interface CajaRepositorio {
  obtenerSaldoActual(): number;
  registrarIngreso(
    monto: number,
    concepto: string,
    metodoPago: MetodoPagoSinFiado,
    ventaId?: number | null,
  ): void;
  registrarEgreso(monto: number, concepto: string, metodoPago: MetodoPagoSinFiado): void;
  listarMovimientosDeHoy(): MovimientoCaja[];
  /** Movimientos dentro de un rango de fechas 'YYYY-MM-DD' inclusive, para el reporte de caja (Premium). */
  listarMovimientosPorRango(desde: string, hasta: string): MovimientoCaja[];
}

export interface FiadoRepositorio {
  /**
   * Sin `desde`/`hasta`: todos los clientes con deuda activa hoy (para
   * la pantalla de Fiados). Con el rango 'YYYY-MM-DD' inclusive: solo
   * los clientes que generaron algún fiado dentro de ese período (para
   * exportar), aunque el saldo mostrado siempre es el saldo actual.
   */
  listarClientesConDeuda(desde?: string, hasta?: string): Cliente[];
  registrarPago(clienteId: number, monto: number, metodoPago: MetodoPagoSinFiado): void;
  /**
   * Deudas pendientes de un cliente (una por cada venta al fiado no
   * pagada del todo), con sus productos y fecha — para armar el
   * mensaje de cobranza por WhatsApp.
   */
  listarDeudasPendientesDetalladas(clienteId: number): DeudaPendienteDetalle[];
}

export interface ProveedorRepositorio {
  listarActivos(): Proveedor[];
  /** Para la pantalla de administración: incluye también los inactivos. */
  listarTodos(): Proveedor[];
  buscarPorTexto(texto: string): Proveedor[];
  obtenerPorId(id: number): Proveedor;
  crear(nombre: string, ruc?: string | null, telefono?: string | null): Proveedor;
  /** Edita los datos del proveedor, incluyendo si está activo. */
  actualizar(id: number, datos: DatosActualizarProveedor): Proveedor;
}

export interface DatosActualizarProveedor {
  nombre: string;
  ruc?: string | null;
  telefono?: string | null;
  activo: boolean;
}

export interface LineaCompraEntrada {
  productoId: number;
  cantidad: number;
  costoUnitario: number;
}

export interface RegistrarCompraInput {
  proveedorId?: number | null;
  /** Nombre escrito al vuelo, usado solo si no se eligió proveedorId. */
  proveedorNombreLibre?: string | null;
  /** Serie-número del comprobante, libre, hasta 15 caracteres. */
  comprobante?: string | null;
  lineas: LineaCompraEntrada[];
  metodoPago: MetodoPagoSinFiado;
}

export interface CompraRepositorio {
  /**
   * Registra una compra ya recibida: entra stock, se actualiza el
   * costo del producto (para que la ganancia futura sea correcta), y
   * sale el dinero de caja. En el Plan Gratis se asume que la compra
   * se paga al recibirla — sin cuentas por pagar pendientes.
   */
  registrarCompra(input: RegistrarCompraInput): Compra;
  listarRecientes(limite?: number): Compra[];
  /** Compras dentro de un rango de fechas 'YYYY-MM-DD' inclusive, con proveedor resuelto, para el reporte (Premium). */
  listarPorRango(desde: string, hasta: string): CompraListaItem[];
  /**
   * Filas planas (compra + producto) listas para exportar a Excel, con
   * el total de la compra repetido en cada línea. Sin `desde`/`hasta`,
   * exporta todo el historial.
   */
  listarDetalleParaExportar(desde?: string, hasta?: string): FilaCompraDetallada[];
  /**
   * Historial de costos de un producto específico: una fila por cada
   * vez que se compró, de más reciente a más antigua (Premium, dentro
   * de Reportes). `desde`/`hasta` ('YYYY-MM-DD') son opcionales; sin
   * ellos, devuelve todo el historial del producto.
   */
  listarHistorialCostos(productoId: number, desde?: string, hasta?: string): HistorialCostoItem[];
}

/** Acceso crudo clave-valor a la tabla configuracion_app. */
export interface ConfiguracionRepositorio {
  obtenerValor(clave: string): string | null;
  establecerValor(clave: string, valor: string): void;
  eliminarValor(clave: string): void;
}

/**
 * Panel de administrador: activar/desactivar Premium y proteger todo
 * eso con un PIN que solo conoce el dueño de la app (nunca se guarda
 * en texto plano, solo su hash).
 */
export interface PlanRepositorio {
  obtenerEstado(): EstadoPlan;
  /** `dias` puede ser cualquiera de los presets o un número libre entre 1 y 365. */
  activarPremium(dias: number): void;
  desactivarPremium(): void;
  tienePinConfigurado(): boolean;
  configurarPin(pinNuevo: string): Promise<void>;
  verificarPin(pin: string): Promise<boolean>;
  /** Devuelve false (sin cambiar nada) si pinActual no es correcto. */
  cambiarPin(pinActual: string, pinNuevo: string): Promise<boolean>;
  /** ID único de este dispositivo, listo para mostrar/copiar. Se genera y guarda solo, la primera vez que se pide. */
  obtenerIdDispositivoTexto(): string;
  /**
   * Valida un código de activación firmado (ver core/activacion.ts e
   * infraestructura/seguridad/activacion.ts) y, si es válido y no fue
   * usado antes en este dispositivo, activa Premium por los días que
   * trae adentro — reutilizando `activarPremium`. Lanza ErrorDeNegocio
   * con un mensaje amigable si el código no sirve.
   */
  activarConCodigo(codigoTexto: string): Promise<void>;
}

/**
 * PIN de acceso a la app (Más > Configuración > Configurar PIN) —
 * distinto del PIN del panel admin de `PlanRepositorio` de arriba.
 * Protege simplemente ABRIR Vende Fácil, no el panel de administrador.
 */
export interface BloqueoPinRepositorio {
  estaActivo(): boolean;
  /** Guarda el hash del PIN nuevo y activa el bloqueo. Lanza ErrorDeNegocio si el PIN no son 4 dígitos numéricos. */
  activar(pinNuevo: string): Promise<void>;
  /** Desactiva el bloqueo, solo si `pinActual` es correcto. Devuelve false (sin cambiar nada) si no lo es. */
  desactivar(pinActual: string): Promise<boolean>;
  verificar(pin: string): Promise<boolean>;
  /** Devuelve false (sin cambiar nada) si pinActual no es correcto. */
  cambiarPin(pinActual: string, pinNuevo: string): Promise<boolean>;
}

/** Registro de respaldos (tabla `metadato_respaldo`) — usado por el Backup Automático. */
export interface RespaldoRepositorio {
  registrar(
    tipo: TipoRespaldo,
    estado: EstadoRespaldo,
    rutaArchivo: string | null,
    tamanoBytes: number | null,
  ): void;
  /** El último backup AUTOMÁTICO completado con éxito, o null si nunca hubo uno. */
  obtenerUltimoAutomaticoExitoso(): MetadatoRespaldo | null;
}
