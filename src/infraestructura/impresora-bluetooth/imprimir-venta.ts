import type { ContenedorRepositorios } from '../sqlite/contenedor';
import { CLAVE_IMPRESORA_ACTIVA, CLAVE_IMPRESORA_DIRECCION } from '@/core/impresora';
import { construirTextoComprobante } from '@/core/comprobante-impresion';
import { construirDatosComprobanteDeVenta } from '../comprobante/datos-comprobante';
import { imprimirEn } from './impresora';

/**
 * Imprime el comprobante de una venta ya registrada (recién hecha o
 * antigua, da igual — se reconstruye todo desde la base). Lanza un
 * error con mensaje legible si la impresión Bluetooth no está
 * activada, no hay impresora elegida, o falla la conexión.
 */
export async function imprimirComprobanteDeVenta(
  contenedor: ContenedorRepositorios,
  ventaId: number,
): Promise<void> {
  const c = contenedor.configuracion;

  if (c.obtenerValor(CLAVE_IMPRESORA_ACTIVA) !== '1') {
    throw new Error('Activa la impresión Bluetooth en Más > Configuración > Configuración de Impresoras.');
  }
  const direccion = c.obtenerValor(CLAVE_IMPRESORA_DIRECCION);
  if (!direccion) {
    throw new Error('No hay ninguna impresora elegida en Más > Configuración > Configuración de Impresoras.');
  }

  const datos = construirDatosComprobanteDeVenta(contenedor, ventaId);
  await imprimirEn(direccion, construirTextoComprobante(datos));
}
