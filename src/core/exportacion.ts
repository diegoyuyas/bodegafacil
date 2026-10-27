/**
 * Vende Fácil — Exportación a CSV
 * ------------------------------------------------------------
 * Funciones puras: reciben datos ya consultados y devuelven un string
 * CSV. El efecto de lado (descargar el archivo) vive en
 * `src/infraestructura/exportacion/descargas.ts`, para poder probar
 * el formato del CSV sin un navegador real.
 */

import { etiquetaDeMovimientoCaja } from './reglas-negocio';
import { partirAlias } from './texto';
import type {
  Cliente,
  ClienteCompradorItem,
  CompraListaItem,
  DeudaClienteItem,
  GananciaProductoItem,
  HistorialCostoItem,
  MovimientoCaja,
  MovimientoInventarioItem,
  Producto,
  ProductoMasVendidoItem,
  Proveedor,
  VentaFormaPagoItem,
  AuditoriaTransaccion,
} from './tipos';

export interface FilaVentaDetallada {
  nombreVendedor: string;
  documentoVendedor: string;
  pedido: string;
  fecha: string;
  producto: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  metodoPago: string;
  cliente: string;
  /** Descripción corta que se añadió al producto en esa venta (si la hay). */
  descripcion?: string | null;
  /** URI de la foto del pago (Yape/Plin), si el bodeguero adjuntó una. Solo para verla en pantalla; no va a Excel/CSV. */
  comprobanteRuta?: string | null;
  /** Quién y cuándo la creó o anuló. Solo va a Excel (el CSV no lo incluye). */
  auditoria: AuditoriaTransaccion;
}

/**
 * Columnas que el dueño ve al final de cada hoja de Excel donde interviene un usuario: quién y cuándo
 * creó, anuló o modificó cada transacción. Los nombres van tal cual, en este orden.
 */
export const ENCABEZADOS_AUDITORIA = [
  'usuario_creacion',
  'usuario_anulacion',
  'usuario_modificacion',
  'fecha_creacion',
  'fecha_anulacion',
  'fecha_modificacion',
];

export function columnasAuditoria(a: AuditoriaTransaccion): (string | null)[] {
  return [a.usuarioCreacion, a.usuarioAnulacion, a.usuarioModificacion, a.fechaCreacion, a.fechaAnulacion, a.fechaModificacion];
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
  const conDescripcion = filas.some((f) => f.descripcion);
  return filasACsv(
    [
      'Nombre vendedor',
      'Nro. Documento vendedor',
      'Pedido',
      'Fecha',
      'Producto',
      ...(conDescripcion ? ['Descripción'] : []),
      'Cantidad',
      'Precio unitario',
      'Subtotal',
      'Método de pago',
      'Cliente',
    ],
    filas.map((f) => [
      f.nombreVendedor,
      f.documentoVendedor,
      f.pedido,
      f.fecha,
      f.producto,
      ...(conDescripcion ? [f.descripcion ?? ''] : []),
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
    encabezados: [
      'Fecha y hora',
      'Tipo',
      'Clase',
      'Cliente/Proveedor',
      'Concepto',
      'Método de pago',
      'Monto',
      'Saldo resultante',
      ...ENCABEZADOS_AUDITORIA,
    ],
    filas: movimientos.map((m) => [
      m.fechaHora,
      m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
      etiquetaDeMovimientoCaja(m) ?? 'Normal',
      m.referencia,
      m.concepto,
      m.metodoPago,
      m.monto,
      m.saldoResultante,
      ...columnasAuditoria(m.auditoria),
    ]),
  };
}

export function construirHojaCompras(compras: CompraListaItem[]): HojaExcel {
  return {
    nombre: 'Compras',
    encabezados: ['Fecha', 'Proveedor', 'Comprobante', 'Total', 'Estado', ...ENCABEZADOS_AUDITORIA],
    filas: compras.map((c) => [
      c.fecha,
      c.proveedorNombre ?? 'Sin especificar',
      c.comprobante,
      c.total,
      c.estado,
      ...columnasAuditoria(c.auditoria),
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
  /** Descripción corta que se añadió al producto en esa compra (si la hay). */
  descripcion?: string | null;
  auditoria: AuditoriaTransaccion;
}

export function construirHojaComprasDetallado(filas: FilaCompraDetallada[]): HojaExcel {
  const conDescripcion = filas.some((f) => f.descripcion);
  return {
    nombre: 'Compras',
    encabezados: [
      'Compra',
      'Fecha',
      'Proveedor',
      'Producto',
      ...(conDescripcion ? ['Descripción'] : []),
      'Cantidad',
      'Precio unitario',
      'Subtotal',
      'Total de la compra',
      'Comprobante',
      'Estado',
      ...ENCABEZADOS_AUDITORIA,
    ],
    filas: filas.map((f) => [
      f.compra,
      f.fecha,
      f.proveedor,
      f.producto,
      ...(conDescripcion ? [f.descripcion ?? ''] : []),
      f.cantidad,
      f.precioUnitario,
      f.subtotal,
      f.totalCompra,
      f.comprobante,
      f.estado,
      ...columnasAuditoria(f.auditoria),
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

export function construirHojaGananciaProductos(items: GananciaProductoItem[]): HojaExcel {
  return {
    nombre: 'Ganancia por producto',
    encabezados: ['Producto', 'Cantidad vendida', 'Total vendido', 'Costo', 'Ganancia', 'Margen %'],
    filas: items.map((i) => [
      i.nombre,
      i.cantidadVendida,
      i.totalVendido,
      i.costoTotal,
      i.gananciaTotal,
      Math.round(i.margenPorcentaje * 10) / 10,
    ]),
  };
}

export function construirHojaVentasFormaPago(
  items: VentaFormaPagoItem[],
  etiquetas: Record<string, string>,
): HojaExcel {
  return {
    nombre: 'Ventas por forma de pago',
    encabezados: ['Forma de pago', 'Cantidad de ventas', 'Total', '% del total'],
    filas: items.map((i) => [
      etiquetas[i.metodoPago] ?? i.metodoPago,
      i.cantidadVentas,
      i.total,
      Math.round(i.porcentaje * 10) / 10,
    ]),
  };
}

export function construirHojaMejoresClientes(items: ClienteCompradorItem[]): HojaExcel {
  return {
    nombre: 'Clientes que más compran',
    encabezados: ['Cliente', 'Cantidad de compras', 'Total comprado', 'Última compra'],
    filas: items.map((i) => [i.nombre, i.cantidadCompras, i.totalComprado, i.ultimaCompra.slice(0, 10)]),
  };
}

export function construirHojaDeudaAntiguedad(items: DeudaClienteItem[]): HojaExcel {
  return {
    nombre: 'Deuda por antigüedad',
    encabezados: ['Cliente', 'Celular', '0 a 7 días', '8 a 30 días', 'Más de 30 días', 'Total', 'Días de la más antigua'],
    filas: items.map((i) => [
      i.nombre,
      i.telefono ?? '',
      i.deuda0a7,
      i.deuda8a30,
      i.deuda31omas,
      i.total,
      i.diasMasAntigua,
    ]),
  };
}

export function construirHojaMayoresDeudores(items: DeudaClienteItem[]): HojaExcel {
  return {
    nombre: 'Clientes que más deben',
    encabezados: ['Cliente', 'Celular', 'Deuda total', 'Deudas pendientes', 'Días de la más antigua'],
    filas: items.map((i) => [i.nombre, i.telefono ?? '', i.total, i.cantidadDeudas, i.diasMasAntigua]),
  };
}

/** `nombre` permite armar también la hoja «Ventas anuladas» con las mismas columnas. */
export function construirHojaVentas(filas: FilaVentaDetallada[], nombre = 'Ventas'): HojaExcel {
  const conDescripcion = filas.some((f) => f.descripcion);
  return {
    nombre,
    encabezados: [
      'Nombre vendedor',
      'Nro. Documento vendedor',
      'Pedido',
      'Fecha',
      'Producto',
      ...(conDescripcion ? ['Descripción'] : []),
      'Cantidad',
      'Precio unitario',
      'Subtotal',
      'Método de pago',
      'Cliente',
      ...ENCABEZADOS_AUDITORIA,
    ],
    filas: filas.map((f) => [
      f.nombreVendedor,
      f.documentoVendedor,
      f.pedido,
      f.fecha,
      f.producto,
      ...(conDescripcion ? [f.descripcion ?? ''] : []),
      f.cantidad,
      f.precioUnitario,
      f.subtotal,
      f.metodoPago,
      f.cliente,
      ...columnasAuditoria(f.auditoria),
    ]),
  };
}

export function construirHojaProductos(productos: Producto[]): HojaExcel {
  return {
    nombre: 'Productos',
    encabezados: ['Nombre', 'Precio de venta', 'Costo', 'Stock actual', 'Stock mínimo', 'Unidad', 'Activo', 'Alias'],
    filas: productos.map((p) => [
      p.nombre,
      p.precioVenta,
      p.costo,
      p.stockActual,
      p.stockMinimo,
      p.unidadMedida,
      p.activo ? 'Sí' : 'No',
      p.alias ? partirAlias(p.alias).join(', ') : '',
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

const ETIQUETAS_TIPO_MOVIMIENTO: Record<MovimientoInventarioItem['tipo'], string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
};

/**
 * `cantidad` en movimiento_inventario no siempre es "positivo = entrada":
 * venta/compra guardan siempre una magnitud positiva y usan `tipo` para
 * indicar la dirección; solo 'ajuste' (ajuste manual de stock) guarda un
 * delta con signo. Esta función lee ambos casos correctamente.
 */
export function desglosarMovimientoInventario(m: MovimientoInventarioItem): {
  entrada: number | null;
  salida: number | null;
} {
  if (m.tipo === 'entrada') return { entrada: m.cantidad, salida: null };
  if (m.tipo === 'salida') return { entrada: null, salida: m.cantidad };
  return m.cantidad >= 0 ? { entrada: m.cantidad, salida: null } : { entrada: null, salida: Math.abs(m.cantidad) };
}

export function construirHojaKardex(nombreProducto: string, movimientos: MovimientoInventarioItem[]): HojaExcel {
  return {
    nombre: `Kardex - ${nombreProducto}`.slice(0, 31),
    encabezados: ['Fecha y hora', 'Tipo', 'Motivo', 'Documento', 'Cliente / Proveedor', 'Entrada', 'Salida', 'Saldo'],
    filas: movimientos.map((m) => {
      const { entrada, salida } = desglosarMovimientoInventario(m);
      return [
        m.fechaHora,
        ETIQUETAS_TIPO_MOVIMIENTO[m.tipo],
        m.motivo,
        m.documento ?? '',
        m.tercero ?? '',
        entrada,
        salida,
        m.stockResultante,
      ];
    }),
  };
}
