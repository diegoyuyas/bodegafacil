import type { ContenedorRepositorios } from '../sqlite/contenedor';
import {
  CLAVE_IMPRESORA_ACTIVA,
  CLAVE_IMPRESORA_CARACTERES,
  CLAVE_IMPRESORA_DIRECCION,
  CLAVE_IMPRESORA_PAPEL,
  leerAnchoImpresora,
} from '@/core/impresora';
import { construirTextoComprobante } from '@/core/comprobante-impresion';
import { construirDatosComprobanteDeVenta } from '../comprobante/datos-comprobante';
import { CLAVE_LOGO_DATOS, esLogoValido } from '@/core/logo';
import { CLAVE_LOGO_EN_TICKET, CLAVE_LOGO_ESTILO_TICKET, estiloLogoImpresion, logoEnTicketActivo } from '@/core/logo-impresion';
import { prepararLogoParaImpresion } from '../logo/preparar-logo-impresion';
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
    throw new Error('Activa la impresión Bluetooth en Más > Configuración > Configuración de Impresión > Sincronizar Impresora Bluetooth.');
  }
  const direccion = c.obtenerValor(CLAVE_IMPRESORA_DIRECCION);
  if (!direccion) {
    throw new Error('No hay ninguna impresora elegida en Más > Configuración > Configuración de Impresión > Sincronizar Impresora Bluetooth.');
  }

  const datos = construirDatosComprobanteDeVenta(contenedor, ventaId);
  // El ticket se arma al ancho del papel elegido (58 mm = 32 caracteres, 80 mm = 48, u otro).
  const ancho = leerAnchoImpresora(c.obtenerValor(CLAVE_IMPRESORA_PAPEL), c.obtenerValor(CLAVE_IMPRESORA_CARACTERES));

  // Logotipo arriba del ticket (si hay y está activo). Si por lo que sea no se puede preparar, el ticket sale igual,
  // sin logotipo: nunca se bloquea una venta por el logo.
  const logo = c.obtenerValor(CLAVE_LOGO_DATOS);
  if (logoEnTicketActivo(c.obtenerValor(CLAVE_LOGO_EN_TICKET)) && esLogoValido(logo)) {
    try {
      datos.logoParaImpresion = await prepararLogoParaImpresion(logo, ancho, estiloLogoImpresion(c.obtenerValor(CLAVE_LOGO_ESTILO_TICKET)));
    } catch {
      datos.logoParaImpresion = null;
    }
  }

  await imprimirEn(direccion, construirTextoComprobante(datos, ancho.caracteres));
}
