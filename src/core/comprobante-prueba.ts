/**
 * Texto corto para el botón "Imprimir prueba" de Más > Configuración > Configuración de Impresión >
 * Sincronizar Impresora Bluetooth — confirma que la conexión Bluetooth y el corte de papel funcionan y que
 * el ancho de papel elegido (58 mm, 80 mm u otro) es el correcto, sin necesitar una venta real.
 *
 * Trae una regla (1234567890...) y una línea con una barra | en cada borde, del ancho exacto elegido:
 *  - si NO se ve la barra del borde derecho, el papel es más angosto que lo elegido → elegir un ancho menor;
 *  - si sobra mucho margen a la derecha, el papel es más ancho → elegir un ancho mayor.
 */
import { normalizarParaImpresora, ANCHO_TICKET } from './comprobante-impresion';

/** La regla: 1234567890 repetido hasta llenar exactamente `ancho` caracteres. */
export function construirReglaDeAncho(ancho: number): string {
  return Array.from({ length: ancho }, (_, i) => String((i + 1) % 10)).join('');
}

/** Una línea de exactamente `ancho` caracteres con una barra en cada borde. */
export function construirMarcoDeAncho(ancho: number): string {
  return `|${'='.repeat(Math.max(ancho - 2, 0))}|`;
}

export function construirTextoPrueba(
  nombreTienda: string,
  ancho: number = ANCHO_TICKET,
  etiquetaPapel: string = '58 mm',
): string {
  const ESC = '\x1B';
  const GS = '\x1D';
  const linea = '-'.repeat(ancho);
  const texto =
    `${ESC}@${ESC}a\x01${ESC}E\x01${nombreTienda}\n${ESC}E\x00` +
    `\nImpresion de prueba\nVende Facil\n${linea}\n` +
    `${ESC}a\x00Papel: ${etiquetaPapel}\nCaracteres por linea: ${ancho}\n` +
    `${construirReglaDeAncho(ancho)}\n${construirMarcoDeAncho(ancho)}\n` +
    `Si no ves la barra | de la\nderecha, elige un ancho menor.\n` +
    `Si sobra mucho margen,\nelige un ancho mayor.\n` +
    `${ESC}a\x01${linea}\n\n\n\n${GS}V\x00`;
  return normalizarParaImpresora(texto);
}

/**
 * Ticket de prueba del logotipo (botón «Imprimir prueba del logotipo» en Información del Negocio): solo el logotipo
 * y un texto corto, para ver cómo sale en la ticketera sin gastar un ticket de venta.
 */
export function construirTextoPruebaLogo(comandosLogo: string): string {
  const ESC = '\x1B';
  const GS = '\x1D';
  const texto =
    `${ESC}@${comandosLogo}${ESC}a\x01\nPrueba de logotipo\n` +
    `Si salen simbolos raros o\nse ve mal, apaga el logo en\nInformacion del Negocio.\n\n\n\n${GS}V\x00`;
  return normalizarParaImpresora(texto);
}

