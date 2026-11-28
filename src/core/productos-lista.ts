/**
 * Lógica pura de la pantalla «Productos» (lista, filtros y pop-up de opciones).
 * La pantalla solo muestra lo que decide este módulo, así se prueba sin celular.
 */
import type { Producto, TipoProducto } from './tipos';

export type FiltroTipoProducto = 'todos' | TipoProducto;

/** Botones de filtro por tipo, en el orden en que se ven (reemplazan al selector desplegable). */
export const OPCIONES_FILTRO_TIPO: ReadonlyArray<{ valor: FiltroTipoProducto; texto: string }> = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'venta_compra', texto: 'Venta' },
  { valor: 'insumo', texto: 'Insumos' },
];

export type EtiquetaProducto = 'insumo' | 'inactivo' | 'stock_bajo';

export const TEXTO_ETIQUETA_PRODUCTO: Record<EtiquetaProducto, string> = {
  insumo: 'Insumo',
  inactivo: 'Inactivo',
  stock_bajo: 'Stock bajo',
};

type ProductoParaEtiquetas = Pick<Producto, 'tipo' | 'activo' | 'controlaStock' | 'stockActual' | 'stockMinimo'>;

/** Stock bajo: solo si el producto controla stock y llegó al mínimo (un insumo nunca lleva stock). */
export function esStockBajo(producto: ProductoParaEtiquetas): boolean {
  return producto.tipo !== 'insumo' && producto.controlaStock && producto.stockActual <= producto.stockMinimo;
}

/** Etiquetas (chips) de un producto, siempre en este orden: Insumo, Inactivo, Stock bajo. */
export function etiquetasProducto(producto: ProductoParaEtiquetas): EtiquetaProducto[] {
  const etiquetas: EtiquetaProducto[] = [];
  if (producto.tipo === 'insumo') etiquetas.push('insumo');
  if (!producto.activo) etiquetas.push('inactivo');
  if (esStockBajo(producto)) etiquetas.push('stock_bajo');
  return etiquetas;
}

/** Palabra pequeña bajo el monto de la lista: un insumo muestra su costo; un producto de venta, su precio. */
export function nombreMontoProducto(producto: Pick<Producto, 'tipo'>): 'costo' | 'precio' {
  return producto.tipo === 'insumo' ? 'costo' : 'precio';
}

export type BotonOpcionProducto = 'editar' | 'ajustar_stock' | 'bitacora';

export const TEXTO_BOTON_OPCION_PRODUCTO: Record<BotonOpcionProducto, string> = {
  editar: 'Editar',
  ajustar_stock: 'Ajustar stock',
  bitacora: 'Bitácora',
};

/** Botones del pop-up, en fila: «Ajustar stock» solo existe si el producto no es insumo y controla stock. */
export function botonesOpcionesProducto(
  producto: Pick<Producto, 'tipo' | 'controlaStock'>,
): BotonOpcionProducto[] {
  const botones: BotonOpcionProducto[] = ['editar'];
  if (producto.tipo !== 'insumo' && producto.controlaStock) botones.push('ajustar_stock');
  botones.push('bitacora');
  return botones;
}

export type DatoResumenProducto = 'precio' | 'costo' | 'stock';

export const TEXTO_DATO_RESUMEN_PRODUCTO: Record<DatoResumenProducto, string> = {
  precio: 'Precio',
  costo: 'Costo',
  stock: 'Stock',
};

/** Cuadros de resumen del pop-up: un insumo solo muestra su costo (no tiene precio de venta ni stock). */
export function datosResumenProducto(producto: Pick<Producto, 'tipo'>): DatoResumenProducto[] {
  return producto.tipo === 'insumo' ? ['costo'] : ['precio', 'costo', 'stock'];
}
