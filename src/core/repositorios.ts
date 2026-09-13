/**
 * Bodega Fácil — Puertos de repositorio
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
  LineaVentaResumen,
  MetodoPagoSinFiado,
  MovimientoCaja,
  Producto,
  Proveedor,
  RegistrarVentaInput,
  ResumenDia,
  Venta,
  VentaListaItem,
} from './tipos';
import type { FilaVentaDetallada } from './exportacion';

export interface ProductoRepositorio {
  listarActivos(): Producto[];
  buscarPorNombre(texto: string): Producto[];
  obtenerPorId(id: number): Producto;
  crear(datos: DatosNuevoProducto): Producto;
  actualizarStock(id: number, nuevoStock: number): void;
}

export interface DatosNuevoProducto {
  nombre: string;
  categoriaId?: number | null;
  codigo?: string | null;
  precioVenta: number;
  costo: number;
  stockActual: number;
  stockMinimo: number;
  unidadMedida: string;
}

export interface ClienteRepositorio {
  listarActivos(): Cliente[];
  buscarPorTexto(texto: string): Cliente[];
  obtenerPorId(id: number): Cliente;
  crear(nombre: string, documento: string, telefono?: string | null): Cliente;
}

export interface VentaRepositorio {
  registrarVenta(input: RegistrarVentaInput): Venta;
  obtenerPorId(id: number): Venta;
  listarDeHoy(): Venta[];
  /** Para Inicio: ventas de hoy con nombre de cliente ya resuelto. */
  listarDeHoyConDetalle(): VentaListaItem[];
  /** Para el preview al expandir una venta en la lista. */
  obtenerLineas(ventaId: number): LineaVentaResumen[];
  /** Repone stock, revierte caja/deuda, y marca la venta como anulada. */
  anularVenta(id: number, motivo?: string): void;
  resumenDelDia(fechaIso?: string): ResumenDia;
  /** Total histórico de ventas válidas (no anuladas) — para el umbral de Plan Pro. */
  contarTotalHistorico(): number;
  /** Filas planas (venta + producto + cliente) listas para exportar a CSV. */
  listarDetalleParaExportar(): FilaVentaDetallada[];
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
}

export interface FiadoRepositorio {
  listarClientesConDeuda(): Cliente[];
  registrarPago(clienteId: number, monto: number, metodoPago: MetodoPagoSinFiado): void;
}

export interface ProveedorRepositorio {
  listarActivos(): Proveedor[];
  obtenerPorId(id: number): Proveedor;
  crear(nombre: string, telefono?: string | null): Proveedor;
}

export interface LineaCompraEntrada {
  productoId: number;
  cantidad: number;
  costoUnitario: number;
}

export interface RegistrarCompraInput {
  proveedorId?: number | null;
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
}
