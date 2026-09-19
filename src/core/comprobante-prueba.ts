/**
 * Texto corto para el botón "Imprimir prueba" de Más > Configuración
 * de Impresoras — confirma que la conexión Bluetooth y el corte de
 * papel funcionan, sin necesitar una venta real.
 */
import { normalizarParaImpresora, ANCHO_TICKET } from './comprobante-impresion';

export function construirTextoPrueba(nombreTienda: string): string {
  const ESC = '\x1B';
  const GS = '\x1D';
  const linea = '-'.repeat(ANCHO_TICKET);
  const texto =
    `${ESC}@${ESC}a\x01${ESC}E\x01${nombreTienda}\n${ESC}E\x00` +
    `\n${linea}\nImpresion de prueba\nVende Facil\n${linea}\n\n\n\n${GS}V\x00`;
  return normalizarParaImpresora(texto);
}
