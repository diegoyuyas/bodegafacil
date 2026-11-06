/**
 * Vende Fácil — Editar el subtotal de una línea de venta (lógica pura)
 * ------------------------------------------------------------
 * Con «Precio editable al vender» activo, el vendedor puede escribir cuánto quiere cobrar por una línea (p. ej.
 * 6 panes a S/ 1.00 aunque cada uno cueste S/ 0.20) y la app calcula el precio por unidad de ESA venta. No es un
 * descuento: es como haber escrito el precio por unidad a mano. El precio del producto en la lista no cambia.
 */
import { redondear } from './reglas-negocio';

/**
 * Precio por unidad que, multiplicado por la cantidad y redondeado a centavos, da exactamente `subtotal`.
 * Primero prueba con 2 decimales (S/ 1.20 ÷ 6 = 0.20); si no cuadra (S/ 1.00 ÷ 6 = 0.17 daría 1.02), usa más
 * decimales (0.1667 × 6 = 1.0002 → S/ 1.00). Devuelve null si el subtotal o la cantidad no sirven.
 */
export function calcularPrecioDesdeSubtotal(subtotal: number, cantidad: number): number | null {
  if (!Number.isFinite(subtotal) || !Number.isFinite(cantidad) || subtotal < 0 || cantidad <= 0) return null;
  const objetivo = redondear(subtotal);
  for (const decimales of [2, 4, 5, 6, 7, 8]) {
    const factor = 10 ** decimales;
    const precio = Math.round((objetivo / cantidad) * factor) / factor;
    if (redondear(precio * cantidad) === objetivo) return precio;
  }
  return objetivo / cantidad;
}

/** El precio por unidad como se muestra al vendedor: 2 decimales, y hasta 4 solo si hacen falta (0.1667). */
export function textoPrecioUnitario(precio: number): string {
  return precio.toFixed(4).replace(/0{1,2}$/, '');
}
