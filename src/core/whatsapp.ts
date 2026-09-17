/**
 * Vende Fácil — Mensaje de cobranza por WhatsApp
 * ------------------------------------------------------------
 * Función pura: arma el texto del mensaje a partir de datos ya
 * consultados. No sabe nada de WhatsApp ni de números de teléfono —
 * eso vive en `src/infraestructura/whatsapp/enlace.ts`.
 */

import type { Cliente, DeudaPendienteDetalle, LineaVentaMensaje, Venta } from './tipos';
import { formatearMonto } from './moneda';

const ETIQUETAS_METODO_PAGO_MENSAJE: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
};

function formatearFecha(fechaIso: string): string {
  // fechaIso viene como 'YYYY-MM-DD HH:MM:SS' o similar de SQLite.
  return new Date(fechaIso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function construirMensajeDeuda(
  cliente: Cliente,
  deudas: DeudaPendienteDetalle[],
  simboloMoneda: string,
): string {
  const lineas = [`Hola ${cliente.nombre}, este es tu saldo pendiente en la tienda:`, ''];

  for (const deuda of deudas) {
    lineas.push(`📅 ${formatearFecha(deuda.fecha)} — ${formatearMonto(deuda.saldoPendiente, simboloMoneda)}`);
    for (const linea of deuda.lineas) {
      lineas.push(`   • ${linea.producto} x${linea.cantidad}`);
    }
  }

  lineas.push('');
  lineas.push(`*Total pendiente: ${formatearMonto(cliente.saldoPendiente, simboloMoneda)}*`);
  lineas.push('');
  lineas.push('¡Gracias por tu preferencia! 🙌');

  return lineas.join('\n');
}

/**
 * Arma el mensaje de detalle de una venta, para enviar por WhatsApp
 * al confirmarla (Ventas → Nueva venta) o al reenviarla después
 * (botón WhatsApp junto a "Anular venta" en Inicio).
 */
export function construirMensajeVenta(
  nombreTienda: string,
  venta: Venta,
  lineasVenta: LineaVentaMensaje[],
  simboloMoneda: string,
): string {
  const lineas = [
    'Hola 👋',
    '',
    `Gracias por tu compra en ${nombreTienda}.`,
    '',
    `🧾 Venta: V-${venta.id}`,
    `📅 Fecha: ${formatearFecha(venta.fechaHora)}`,
    '',
    'Productos:',
  ];

  for (const linea of lineasVenta) {
    lineas.push(`• ${linea.producto} x${linea.cantidad} — ${formatearMonto(linea.subtotal, simboloMoneda)}`);
  }

  lineas.push('');
  lineas.push(`💰 Total: ${formatearMonto(venta.total, simboloMoneda)}`);
  lineas.push(`💳 Método de pago: ${ETIQUETAS_METODO_PAGO_MENSAJE[venta.metodoPago] ?? venta.metodoPago}`);
  lineas.push('');
  lineas.push('¡Gracias por tu compra! 😊');

  return lineas.join('\n');
}
