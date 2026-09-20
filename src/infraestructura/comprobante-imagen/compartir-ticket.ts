/**
 * Vende Fácil — Guardar ticket como... (checkbox en Ventas > Nueva venta)
 * ------------------------------------------------------------
 * Genera la imagen del comprobante y abre la hoja nativa "Compartir"
 * de Android (misma que ya usa Exportar a Excel/CSV) — el bodeguero
 * elige ahí mismo si la manda a su propio chat de WhatsApp, a otro
 * contacto, la guarda en Archivos, etc. No depende en nada de la
 * impresora Bluetooth: funciona aunque esta última siga bloqueada
 * como "Próximamente".
 */
import type { ContenedorRepositorios } from '../sqlite/contenedor';
import { construirDatosComprobanteDeVenta } from '../comprobante/datos-comprobante';
import { generarImagenComprobante } from './generar-imagen';
import { descargarImagen } from '../exportacion/descargas';

export async function guardarTicketComoImagen(contenedor: ContenedorRepositorios, ventaId: number): Promise<void> {
  const datos = construirDatosComprobanteDeVenta(contenedor, ventaId);
  const blob = await generarImagenComprobante(datos);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await descargarImagen(`ticket-V-${ventaId}.png`, bytes);
}
