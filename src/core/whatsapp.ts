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
  return new Date(fechaIso.replace(' ', 'T')).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** «de hoy», «de ayer», «de hace 20 días» (para la línea de la deuda más antigua). */
function textoDeudaMasAntigua(dias: number): string {
  if (dias <= 0) return 'de hoy';
  if (dias === 1) return 'de ayer';
  return `de hace ${dias} días`;
}

/**
 * Recordatorio de cobro (texto fijo). Si se conoce la antigüedad de la deuda más vieja
 * (`diasMasAntigua`), se agrega una línea con ella.
 */
export function construirMensajeDeuda(
  cliente: Cliente,
  deudas: DeudaPendienteDetalle[],
  simboloMoneda: string,
  diasMasAntigua?: number | null,
): string {
  const lineas = [`Hola ${cliente.nombre}, este es tu saldo pendiente en la tienda:`, ''];

  for (const deuda of deudas) {
    const etiquetaVenta = deuda.ventaId ? ` — V-${deuda.ventaId}` : '';
    lineas.push(
      `📅 ${formatearFecha(deuda.fecha)}${etiquetaVenta} — ${formatearMonto(deuda.saldoPendiente, simboloMoneda)}`,
    );
    if (deuda.saldoPendiente < deuda.montoOriginal) {
      lineas.push(
        `   (de ${formatearMonto(deuda.montoOriginal, simboloMoneda)}, ya abonaste ${formatearMonto(deuda.montoOriginal - deuda.saldoPendiente, simboloMoneda)})`,
      );
    }
    for (const linea of deuda.lineas) {
      lineas.push(`   • ${linea.producto} x${linea.cantidad}`);
    }
  }

  if (diasMasAntigua !== undefined && diasMasAntigua !== null) {
    lineas.push('');
    lineas.push(`⏳ Tu deuda más antigua es ${textoDeudaMasAntigua(diasMasAntigua)}.`);
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
    `🧾 Venta: ${venta.comprobante}`,
    `📅 Fecha: ${formatearFecha(venta.fechaHora)}`,
    '',
    'Productos:',
  ];

  for (const linea of lineasVenta) {
    lineas.push(`• ${linea.producto} x${linea.cantidad} — ${formatearMonto(linea.subtotal, simboloMoneda)}`);
    if (linea.descripcion) lineas.push(`   ${linea.descripcion}`);
  }

  lineas.push('');
  lineas.push(`💰 Total: ${formatearMonto(venta.total, simboloMoneda)}`);
  lineas.push(`💳 Método de pago: ${ETIQUETAS_METODO_PAGO_MENSAJE[venta.metodoPago] ?? venta.metodoPago}`);
  lineas.push('');
  lineas.push('¡Gracias por tu compra! 😊');

  return lineas.join('\n');
}

export interface DatosPagoMensaje {
  /** 'YYYY-MM-DD HH:MM:SS' en hora local. */
  fecha: string;
  monto: number;
  metodoPago: string;
  /** Lo que queda debiendo el cliente después de este pago. */
  saldoNuevo: number;
}

/**
 * Comprobante de un pago de fiado, para enviar por WhatsApp al cliente justo después de cobrar.
 * Es un aviso de la bodega, no un comprobante tributario.
 */
export function construirMensajePago(cliente: Pick<Cliente, 'nombre'>, pago: DatosPagoMensaje, simboloMoneda: string): string {
  const lineas = [
    `Hola ${cliente.nombre} 👋`,
    '',
    'Recibimos tu pago ✅',
    '',
    `📅 Fecha: ${formatearFecha(pago.fecha)}`,
    `💰 Pagaste: ${formatearMonto(pago.monto, simboloMoneda)}`,
    `💳 Método de pago: ${ETIQUETAS_METODO_PAGO_MENSAJE[pago.metodoPago] ?? pago.metodoPago}`,
    '',
  ];
  if (pago.saldoNuevo > 0) {
    lineas.push(`*Te queda por pagar: ${formatearMonto(pago.saldoNuevo, simboloMoneda)}*`);
  } else {
    lineas.push('*Ya no tienes deuda pendiente* 🙌');
  }
  lineas.push('');
  lineas.push('¡Gracias por tu pago! 😊');
  return lineas.join('\n');
}
