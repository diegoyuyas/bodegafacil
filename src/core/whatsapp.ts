/**
 * Bodega Fácil — Mensaje de cobranza por WhatsApp
 * ------------------------------------------------------------
 * Función pura: arma el texto del mensaje a partir de datos ya
 * consultados. No sabe nada de WhatsApp ni de números de teléfono —
 * eso vive en `src/infraestructura/whatsapp/enlace.ts`.
 */

import type { Cliente, DeudaPendienteDetalle } from './tipos';

function formatearSoles(monto: number): string {
  return `S/ ${monto.toFixed(2)}`;
}

function formatearFecha(fechaIso: string): string {
  // fechaIso viene como 'YYYY-MM-DD HH:MM:SS' o similar de SQLite.
  return new Date(fechaIso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function construirMensajeDeuda(cliente: Cliente, deudas: DeudaPendienteDetalle[]): string {
  const lineas = [`Hola ${cliente.nombre}, este es tu saldo pendiente en la tienda:`, ''];

  for (const deuda of deudas) {
    lineas.push(`📅 ${formatearFecha(deuda.fecha)} — ${formatearSoles(deuda.saldoPendiente)}`);
    for (const linea of deuda.lineas) {
      lineas.push(`   • ${linea.producto} x${linea.cantidad}`);
    }
  }

  lineas.push('');
  lineas.push(`*Total pendiente: ${formatearSoles(cliente.saldoPendiente)}*`);
  lineas.push('');
  lineas.push('¡Gracias por tu preferencia! 🙌');

  return lineas.join('\n');
}
