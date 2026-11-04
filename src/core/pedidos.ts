/**
 * Vende Fácil — Pantalla «Pedidos» (lógica pura)
 * ------------------------------------------------------------
 * Antes era el «Historial de ventas» desplegable de Inicio; ahora es una pantalla fija (acceso «Pedidos» de la
 * barra inferior). Aquí: las etiquetas de forma de pago, el buscador (cliente, producto, forma de pago o monto),
 * los totales del rango y si el rango es «hoy». Sin UI ni base de datos: se prueba con `tsx`.
 */
import type { LineaVentaResumen, VentaListaItem } from './tipos';

export const ETIQUETAS_METODO_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
};

export function etiquetaMetodoPago(metodo: string): string {
  return ETIQUETAS_METODO_PAGO[metodo] ?? metodo;
}

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function coincidePalabra(venta: VentaListaItem, lineas: LineaVentaResumen[], palabra: string): boolean {
  const p = sinTildes(palabra);
  if (sinTildes(venta.clienteNombre ?? 'Cliente eventual').includes(p)) return true;
  if (sinTildes(etiquetaMetodoPago(venta.metodoPago)).includes(p) || sinTildes(venta.metodoPago).includes(p)) return true;
  if (venta.total.toFixed(2).includes(palabra.trim())) return true;
  return lineas.some((l) => sinTildes(l.producto).includes(p));
}

/**
 * Pedidos que coinciden con lo escrito. Ignora mayúsculas y tildes y acepta varias palabras en cualquier orden
 * («yape ana» = pagos con Yape de Ana). Busca en: cliente, forma de pago, productos del pedido y monto.
 * `lineasPorVenta` puede venir incompleto: un pedido sin sus productos cargados solo se busca por lo demás.
 */
export function filtrarPedidos(
  pedidos: VentaListaItem[],
  lineasPorVenta: Record<number, LineaVentaResumen[]>,
  busqueda: string,
): VentaListaItem[] {
  const palabras = busqueda.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return pedidos;
  return pedidos.filter((v) => palabras.every((p) => coincidePalabra(v, lineasPorVenta[v.id] ?? [], p)));
}

/** Cantidad y total de los pedidos vigentes (los anulados no cuentan). */
export function resumirPedidos(pedidos: VentaListaItem[]): { cantidad: number; total: number } {
  const vigentes = pedidos.filter((v) => !v.anulada);
  const total = vigentes.reduce((suma, v) => suma + v.total, 0);
  return { cantidad: vigentes.length, total: Math.round(total * 100) / 100 };
}

export function rangoEsHoy(desde: string, hasta: string, hoy: string): boolean {
  return desde === hoy && hasta === hoy;
}

export function rangoInvalido(desde: string, hasta: string): boolean {
  return desde > hasta;
}
