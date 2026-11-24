/**
 * Vende Fácil — «Copiar pedido» (lógica pura)
 * ------------------------------------------------------------
 * Desde el detalle de un pedido (Pedidos) se copian SOLO sus productos y cantidades a una Nueva venta.
 * No se copian el cliente ni la forma de pago (la nueva venta arranca en Efectivo, sin cliente) ni los precios
 * ni las notas: se usa el precio y el stock de HOY de cada producto. Sin UI ni base de datos: se prueba con `tsx`.
 */
import type { LineaVentaResumen, Producto } from './tipos';
import { configuracionFraccionDeProducto, type ConfiguracionFraccion } from './venta-fraccion';

export interface ItemACopiar {
  productoId: number;
  nombre: string;
  /** En unidades de STOCK (la unidad más pequeña): 1 caja de 12 + 8 sueltas = 20. */
  cantidadBase: number;
}

/**
 * Productos y cantidades de un pedido, uno por producto (si un producto salió en dos líneas —cajas y sueltas—
 * se suman). Una línea sin `productoId` (dato antiguo) no se puede copiar y se salta.
 */
export function itemsParaCopiar(lineas: LineaVentaResumen[]): ItemACopiar[] {
  const items: ItemACopiar[] = [];
  for (const l of lineas) {
    if (l.productoId === undefined || !(l.cantidad > 0)) continue;
    const base = l.cantidad * (l.factorStock ?? 1);
    const existente = items.find((i) => i.productoId === l.productoId);
    if (existente) existente.cantidadBase += base;
    else items.push({ productoId: l.productoId, nombre: l.producto, cantidadBase: base });
  }
  return items;
}

export interface CantidadCopiada {
  /** En la unidad con la que se cuenta en el carrito (la más pequeña si se vende por fracciones; si no, enteros). */
  cantidad: number;
  /** Tope del carrito para este producto (Infinity si no lleva control de stock). */
  disponible: number;
  /** true si se pidió más de lo que hay en stock y se bajó a lo disponible. */
  recortada: boolean;
  /** Cómo se parte el producto, solo si hoy se vende por fracciones o en cajas completas. */
  configuracion: ConfiguracionFraccion | null;
}

/**
 * Cuánto de un producto puede ir al carrito. null = no se puede copiar (sin stock, o es un producto por fracciones
 * que hoy se vende en cajas completas y lo pedido no llega a una caja).
 */
export function cantidadParaCarrito(
  cantidadBase: number,
  producto: Pick<
    Producto,
    'formaVenta' | 'unidadEntera' | 'unidadFraccion' | 'factorFraccion' | 'precioFraccion' | 'precioVenta' | 'costo' | 'controlaStock' | 'stockActual'
  >,
  fraccionActiva: boolean,
): CantidadCopiada | null {
  const configuracion = producto.formaVenta === 'fraccion' ? configuracionFraccionDeProducto(producto, true) : null;
  // Interruptor apagado: el carrito cuenta cajas completas, no unidades sueltas.
  const enCajas = configuracion !== null && !fraccionActiva;
  const deseada = enCajas ? Math.floor(cantidadBase / configuracion.factor) : Math.floor(cantidadBase);
  const disponible = !producto.controlaStock
    ? Infinity
    : enCajas
      ? Math.floor(producto.stockActual / configuracion.factor)
      : producto.stockActual;
  if (deseada <= 0 || disponible <= 0) return null;
  const cantidad = Math.min(deseada, disponible);
  return { cantidad, disponible, recortada: cantidad < deseada, configuracion };
}

/** Aviso que se ve en Nueva venta tras copiar. */
export function textoAvisoCopia(comprobante: string, copiados: number, omitidos: string[], recortados: string[]): string {
  const partes = [`Se copiaron ${copiados} ${copiados === 1 ? 'producto' : 'productos'} del pedido ${comprobante}.`];
  if (omitidos.length > 0) partes.push(`No se pudieron copiar (sin stock o ya no están a la venta): ${omitidos.join(', ')}.`);
  if (recortados.length > 0) partes.push(`Cantidad ajustada al stock disponible: ${recortados.join(', ')}.`);
  return partes.join(' ');
}
