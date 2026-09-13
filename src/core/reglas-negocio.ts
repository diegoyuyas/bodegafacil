/**
 * Bodega Fácil — Reglas de negocio
 * ------------------------------------------------------------
 * Núcleo de negocio independiente de la interfaz (sección 5.1
 * del documento maestro). Estas funciones son PURAS: reciben
 * datos, devuelven resultados, y no acceden a SQLite ni a la UI.
 * Esto permite que la misma lógica sirva para entrada manual,
 * entrada por voz, o cualquier otro origen futuro.
 *
 * Corresponde a la sección 29 (Reglas de negocio importantes)
 * del documento maestro.
 */

import type { DetalleVenta, LineaVentaEntrada, Producto, VentaCalculada } from './tipos';

// ------------------------------------------------------------
// Errores de dominio
// ------------------------------------------------------------

export class ErrorDeNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeNegocio';
  }
}

// ------------------------------------------------------------
// Venta y ganancia
// ------------------------------------------------------------

/**
 * Ganancia = Precio de venta - Costo (por unidad).
 */
export function calcularGananciaUnitaria(precioVenta: number, costo: number): number {
  return redondear(precioVenta - costo);
}

/**
 * Ganancia de línea = (Precio de venta - Costo) × Cantidad.
 */
export function calcularGananciaLinea(
  precioVenta: number,
  costo: number,
  cantidad: number,
): number {
  return redondear(calcularGananciaUnitaria(precioVenta, costo) * cantidad);
}

/**
 * Subtotal de una línea de venta = Precio de venta × Cantidad.
 */
export function calcularSubtotalLinea(precioVenta: number, cantidad: number): number {
  return redondear(precioVenta * cantidad);
}

/**
 * Verifica que el producto tenga stock suficiente para la cantidad
 * solicitada. Lanza ErrorDeNegocio si no alcanza.
 */
export function verificarStockDisponible(producto: Producto, cantidad: number): void {
  if (cantidad <= 0) {
    throw new ErrorDeNegocio(`La cantidad debe ser mayor a cero (producto: ${producto.nombre}).`);
  }
  if (producto.stockActual < cantidad) {
    throw new ErrorDeNegocio(
      `Stock insuficiente de "${producto.nombre}". Disponible: ${producto.stockActual}, solicitado: ${cantidad}.`,
    );
  }
}

/**
 * Construye el detalle de una línea de venta a partir de un producto
 * y una cantidad. No modifica stock ni persiste nada: solo calcula.
 */
export function construirDetalleVenta(
  producto: Producto,
  cantidad: number,
): Omit<DetalleVenta, 'id' | 'ventaId'> {
  verificarStockDisponible(producto, cantidad);

  const precioUnitario = producto.precioVenta;
  const costoUnitario = producto.costo;
  const subtotal = calcularSubtotalLinea(precioUnitario, cantidad);
  const gananciaLinea = calcularGananciaLinea(precioUnitario, costoUnitario, cantidad);

  return {
    productoId: producto.id,
    cantidad,
    precioUnitario,
    costoUnitario,
    subtotal,
    gananciaLinea,
  };
}

/**
 * Construye una venta completa (subtotal, total y ganancia estimada)
 * a partir de una lista de líneas y el catálogo de productos.
 * `obtenerProducto` es una función inyectada (por ejemplo, una
 * consulta al repositorio local) para mantener esta función pura
 * y fácil de probar.
 */
export function construirVenta(
  lineas: LineaVentaEntrada[],
  obtenerProducto: (productoId: number) => Producto,
): VentaCalculada {
  if (lineas.length === 0) {
    throw new ErrorDeNegocio('Una venta debe tener al menos un producto.');
  }

  const detalles: DetalleVenta[] = lineas.map((linea) => {
    const producto = obtenerProducto(linea.productoId);
    const detalle = construirDetalleVenta(producto, linea.cantidad);
    return { ...detalle, id: 0, ventaId: 0 }; // ids reales los asigna el repositorio al guardar
  });

  const subtotal = redondear(detalles.reduce((acumulado, d) => acumulado + d.subtotal, 0));
  const gananciaEstimada = redondear(
    detalles.reduce((acumulado, d) => acumulado + d.gananciaLinea, 0),
  );

  // En el MVP no hay descuentos/impuestos adicionales, por lo que
  // total y subtotal coinciden. Este es el único lugar que habría
  // que tocar si en el futuro se agregan descuentos.
  const total = subtotal;

  return { detalles, subtotal, total, gananciaEstimada };
}

// ------------------------------------------------------------
// Stock / inventario
// ------------------------------------------------------------

/**
 * Stock nuevo = Stock anterior + Entradas - Salidas.
 */
export function calcularStockNuevo(
  stockAnterior: number,
  entradas: number,
  salidas: number,
): number {
  const nuevo = redondear(stockAnterior + entradas - salidas);
  if (nuevo < 0) {
    throw new ErrorDeNegocio(
      `El movimiento dejaría el stock en negativo (resultado: ${nuevo}).`,
    );
  }
  return nuevo;
}

// ------------------------------------------------------------
// Deuda / fiados
// ------------------------------------------------------------

/**
 * Deuda nueva = Deuda anterior + Nuevos fiados - Pagos.
 */
export function calcularDeudaNueva(
  deudaAnterior: number,
  nuevosFiados: number,
  pagos: number,
): number {
  const nueva = redondear(deudaAnterior + nuevosFiados - pagos);
  if (nueva < 0) {
    throw new ErrorDeNegocio(`La deuda no puede quedar negativa (resultado: ${nueva}).`);
  }
  return nueva;
}

/**
 * Determina el estado de una deuda según su saldo pendiente
 * frente al monto original.
 */
export function determinarEstadoDeuda(
  montoOriginal: number,
  saldoPendiente: number,
): 'pendiente' | 'pagada_parcial' | 'pagada' {
  if (saldoPendiente <= 0) return 'pagada';
  if (saldoPendiente < montoOriginal) return 'pagada_parcial';
  return 'pendiente';
}

// ------------------------------------------------------------
// Caja
// ------------------------------------------------------------

/**
 * Saldo = Saldo anterior + Ingresos - Egresos.
 */
export function calcularSaldoCaja(
  saldoAnterior: number,
  ingresos: number,
  egresos: number,
): number {
  return redondear(saldoAnterior + ingresos - egresos);
}

// ------------------------------------------------------------
// Clientes
// ------------------------------------------------------------

const PATRON_DOCUMENTO = /^[A-Za-z0-9]{1,15}$/;

/**
 * El documento de identidad debe ser alfanumérico y de hasta 15
 * caracteres (no hace falta llenar los 15 — un DNI de 8 dígitos, por
 * ejemplo, también es válido). Es la llave que evita clientes
 * duplicados.
 */
export function validarDocumentoIdentidad(documento: string): void {
  if (!PATRON_DOCUMENTO.test(documento)) {
    throw new ErrorDeNegocio('El documento debe ser alfanumérico, de hasta 15 caracteres.');
  }
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

/**
 * Redondea a 2 decimales para evitar errores de punto flotante
 * en montos de dinero (ej: 0.1 + 0.2 !== 0.3).
 */
export function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
