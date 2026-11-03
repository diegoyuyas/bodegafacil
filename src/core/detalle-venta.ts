/**
 * Vende Fácil — Detalle de una venta del Historial de ventas (lógica pura)
 * ------------------------------------------------------------
 * Lo que muestra el pop-up al tocar una venta: sus productos con cantidad, precio unitario y subtotal,
 * qué acciones se ofrecen y el aviso al anular. Sin UI ni base de datos: se prueba con `tsx`.
 * Anular NO borra la venta: queda en el historial marcada como «Anulada», fuera de los totales y de Caja.
 */
import { formatearMonto } from './moneda';
import { redondear } from './reglas-negocio';
import type { LineaVentaResumen } from './tipos';
import { textoCantidad } from './ventas-semana';

export const TEXTO_CONFIRMAR_ANULACION = '¿Seguro que quieres anular esta venta?';

export interface FilaDetalleVenta {
  producto: string;
  cantidad: number;
  /** '2', '1.5'… sin ceros de más. */
  cantidadTexto: string;
  /** null en ventas muy antiguas que no guardaron el precio de cada producto. */
  precioUnitario: number | null;
  /** cantidad × precio unitario, a 2 decimales (null si no hay precio). */
  subtotal: number | null;
  descripcion: string | null;
}

export function construirDetalleVenta(lineas: LineaVentaResumen[]): FilaDetalleVenta[] {
  return lineas.map((l) => {
    const precio = l.precioUnitario ?? null;
    return {
      producto: l.producto,
      cantidad: l.cantidad,
      cantidadTexto: textoCantidad(l.cantidad),
      precioUnitario: precio,
      subtotal: precio === null ? null : redondear(l.cantidad * precio),
      descripcion: l.descripcion && l.descripcion.trim() !== '' ? l.descripcion : null,
    };
  });
}

export interface AccionesVenta {
  whatsapp: boolean;
  /** 'activo' = se puede; 'premium' = se muestra desactivado con aviso (función Premium); 'oculto' = no aplica. */
  reimprimir: 'activo' | 'premium' | 'oculto';
  anular: boolean;
}

/** Una venta anulada ya no admite acciones (queda solo para consulta); si no, las 3 acciones. */
export function accionesDeVenta(venta: { anulada: boolean }, esPremium: boolean): AccionesVenta {
  if (venta.anulada) return { whatsapp: false, reimprimir: 'oculto', anular: false };
  return { whatsapp: true, reimprimir: esPremium ? 'activo' : 'premium', anular: true };
}

/**
 * Aviso extra del cuadro de confirmación cuando la venta es un fiado con abonos ya cobrados
 * (se anula solo lo que falta por cobrar). null = no hace falta aviso.
 */
export function avisoAnulacionFiado(cobrado: number, simboloMoneda: string): string | null {
  if (!(cobrado > 0)) return null;
  return `Es un fiado y ya tiene ${formatearMonto(cobrado, simboloMoneda)} cobrados. Solo se cancelará lo que falta por cobrar.`;
}
