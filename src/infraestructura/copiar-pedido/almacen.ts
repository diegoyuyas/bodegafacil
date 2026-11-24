import type { ItemACopiar } from '@/core/copiar-pedido';

/**
 * Puente entre «Pedidos» y «Nueva venta» para «Copiar pedido». Se guarda en sessionStorage (no en la base de
 * datos) y se lee UNA sola vez: si la persona sale de Nueva venta y vuelve a entrar, empieza vacía.
 */
const CLAVE = 'vendefacil:copiar-pedido';

export interface PedidoACopiar {
  comprobante: string;
  items: ItemACopiar[];
}

export function guardarPedidoACopiar(pedido: PedidoACopiar): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(pedido));
  } catch {
    // Sin almacenamiento disponible: Nueva venta abrirá vacía.
  }
}

/** Devuelve el pedido pendiente de copiar y lo borra; null si no hay (o si lo guardado no es válido). */
export function tomarPedidoACopiar(): PedidoACopiar | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (crudo === null) return null;
    sessionStorage.removeItem(CLAVE);
    const dato = JSON.parse(crudo) as Partial<PedidoACopiar>;
    if (typeof dato.comprobante !== 'string' || !Array.isArray(dato.items)) return null;
    const items = dato.items.filter(
      (i): i is ItemACopiar =>
        !!i && typeof i.productoId === 'number' && typeof i.nombre === 'string' && typeof i.cantidadBase === 'number' && i.cantidadBase > 0,
    );
    return items.length > 0 ? { comprobante: dato.comprobante, items } : null;
  } catch {
    return null;
  }
}
