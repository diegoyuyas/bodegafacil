/**
 * Vende Fácil — Exportación a CSV
 * ------------------------------------------------------------
 * Funciones puras: reciben datos ya consultados y devuelven un string
 * CSV. El efecto de lado (descargar el archivo) vive en
 * `src/infraestructura/exportacion/descargas.ts`, para poder probar
 * el formato del CSV sin un navegador real.
 */

import type {
  Cliente,
  CompraListaItem,
  HistorialCostoItem,
  MovimientoCaja,
  Producto,
  ProductoMasVendidoItem,
  Proveedor,
} from './tipos';

export interface FilaVentaDetallada {
  pedido: string;
  fecha: string;
  producto: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  metodoPago: string;
  cliente: string;
}

function escaparCsv(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (/[",\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function filasACsv(
  encabezados: string[],
  filas: (string | number | null | undefined)[][],
): string {
  const lineas = [
    encabezados.map(escaparCsv).join(','),
    ...filas.map((fila) => fila.map(escaparCsv).join(',')),
  ];
  return lineas.join('\r\n');
}

export function exportarVentasACsv(filas: FilaVentaDetallada[]): string {
  return filasACsv(
    ['Pedido', 'Fecha', 'Producto', 'Cantidad', 'Precio unitario', 'Subtotal', 'Método de pago', 'Cliente'],
    filas.map((f) => [
      f.pedido,
      f.fecha,
      f.producto,
      f.cantidad,
      f.precioUnitario,
      f.subtotal,
      f.metodoPago,
      f.cliente,
    ]),
  );
}

export function exportarProductosACsv(productos: Producto[]): string {
  return filasACsv(
    ['Nombre', 'Precio de venta', 'Costo', 'Stock actual', 'Stock mínimo', 'Unidad'],
    productos.map((p) => [p.nombre, p.precioVenta, p.costo, p.stockActual, p.stockMinimo, p.unidadMedida]),
  );
}

export function exportarFiadosACsv(clientes: Cliente[]): string {
  return filasACsv(
    ['Cliente', 'Teléfono', 'Saldo pendiente', 'Último pago'],
    clientes.map((c) => [c.nombre, c.telefono, c.saldoPendiente, c.fechaUltimoPago]),
  );
}

/**
 * Vende Fácil — Exportación a Excel (.xlsx)
 * ------------------------------------------------------------
 * Estas funciones son puras: arman encabezados + filas a partir de
 * datos ya consultados, sin depender de ninguna librería de Excel.
 * `HojaExcel` es un formato intermedio neutral; convertirlo al binario
 * .xlsx real (con la librería `xlsx`) es un efecto de infraestructura
 * y vive en `src/infraestructura/exportacion/excel.ts`.
 */
export interface HojaExcel {
  /** Nombre de la pestaña dentro del libro. Excel limita esto a 31 caracteres. */
  nombre: string;
  encabezados: string[];
  filas: (string | number | null | undefined)[][];
}

export function construirHojaCaja(movimientos: MovimientoCaja[]): HojaExcel {
  return {
    nombre: 'Caja',
    encabezados: ['Fecha y hora', 'Tipo', 'Concepto', 'Método de pago', 'Monto', 'Saldo resultante'],
    filas: movimientos.map((m) => [
      m.fechaHora,
      m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
      m.concepto,
      m.metodoPago,
      m.monto,
      m.saldoResultante,
    ]),
  };
}

export function construirHojaCompras(compras: CompraListaItem[]): HojaExcel {
  return {
    nombre: 'Compras',
    encabezados: ['Fecha', 'Proveedor', 'Comprobante', 'Total', 'Estado'],
    filas: compras.map((c) => [
      c.fecha,
      c.proveedorNombre ?? 'Sin especificar',
      c.comprobante,
      c.total,
      c.estado,
    ]),
  };
}

/**
 * Una línea de producto dentro de una compra, para la exportación
 * "todo a Excel" (a diferencia de `CompraListaItem`, que es un
 * resumen por compra sin detalle de productos).
 */
export interface FilaCompraDetallada {
  compra: string;
  fecha: string;
  proveedor: string;
  producto: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  /** Total de la compra completa (igual en todas las líneas de una misma compra). */
  totalCompra: number;
  comprobante: string | null;
  estado: string;
}

export function construirHojaComprasDetallado(filas: FilaCompraDetallada[]): HojaExcel {
  return {
    nombre: 'Compras',
    encabezados: [
      'Compra',
      'Fecha',
      'Proveedor',
      'Producto',
      'Cantidad',
      'Precio unitario',
      'Subtotal',
      'Total de la compra',
      'Comprobante',
      'Estado',
    ],
    filas: filas.map((f) => [
      f.compra,
      f.fecha,
      f.proveedor,
      f.producto,
      f.cantidad,
      f.precioUnitario,
      f.subtotal,
      f.totalCompra,
      f.comprobante,
      f.estado,
    ]),
  };
}

export function construirHojaMasVendidos(items: ProductoMasVendidoItem[]): HojaExcel {
  return {
    nombre: 'Más vendidos',
    encabezados: ['Producto', 'Cantidad vendida', 'Total vendido', 'Ganancia'],
    filas: items.map((i) => [i.nombre, i.cantidadVendida, i.totalVendido, i.gananciaTotal]),
  };
}

export function construirHojaVentas(filas: FilaVentaDetallada[]): HojaExcel {
  return {
    nombre: 'Ventas',
    encabezados: ['Pedido', 'Fecha', 'Producto', 'Cantidad', 'Precio unitario', 'Subtotal', 'Método de pago', 'Cliente'],
    filas: filas.map((f) => [
      f.pedido,
      f.fecha,
      f.producto,
      f.cantidad,
      f.precioUnitario,
      f.subtotal,
      f.metodoPago,
      f.cliente,
    ]),
  };
}

export function construirHojaProductos(productos: Producto[]): HojaExcel {
  return {
    nombre: 'Productos',
    encabezados: ['Nombre', 'Precio de venta', 'Costo', 'Stock actual', 'Stock mínimo', 'Unidad', 'Activo'],
    filas: productos.map((p) => [
      p.nombre,
      p.precioVenta,
      p.costo,
      p.stockActual,
      p.stockMinimo,
      p.unidadMedida,
      p.activo ? 'Sí' : 'No',
    ]),
  };
}

export function construirHojaClientes(clientes: Cliente[]): HojaExcel {
  return {
    nombre: 'Clientes',
    encabezados: ['Nombre', 'Documento', 'Teléfono', 'Saldo pendiente', 'Activo'],
    filas: clientes.map((c) => [
      c.nombre,
      c.documento,
      c.telefono,
      c.saldoPendiente,
      c.activo ? 'Sí' : 'No',
    ]),
  };
}

export function construirHojaProveedores(proveedores: Proveedor[]): HojaExcel {
  return {
    nombre: 'Proveedores',
    encabezados: ['Nombre', 'RUC', 'Teléfono', 'Activo'],
    filas: proveedores.map((p) => [p.nombre, p.ruc, p.telefono, p.activo ? 'Sí' : 'No']),
  };
}

/**
 * Historial de costos de un producto puntual (Premium, dentro de
 * Reportes). `nombreProducto` va como prefijo del nombre de la
 * pestaña para identificar de qué producto se trata al abrir el
 * Excel descargado.
 */
export function construirHojaHistorialCostos(
  nombreProducto: string,
  items: HistorialCostoItem[],
): HojaExcel {
  return {
    nombre: `Costos - ${nombreProducto}`.slice(0, 31),
    encabezados: ['Fecha', 'Costo unitario', 'Cantidad', 'Proveedor', 'Compra'],
    filas: items.map((i) => [
      i.fecha,
      i.costoUnitario,
      i.cantidad,
      i.proveedorNombre ?? 'Sin especificar',
      `C-${i.compraId}`,
    ]),
  };
}
