/**
 * Vende Fácil — Prepara el logotipo para la ticketera (necesita canvas, por eso vive en infraestructura).
 * Toda la lógica de blanco y negro y de comandos está en `core/logo-impresion.ts` y se prueba aparte.
 */

import type { AnchoImpresora } from '@/core/impresora';
import {
  FILAS_POR_FRANJA,
  LOGO_COMANDOS_MAXIMO_CARACTERES,
  PUNTOS_POR_FRANJA,
  aMonocromo,
  anchoDeFranja,
  construirComandosLogo,
  dimensionesParaPapel,
  filasParaAlto,
  puntosDePapel,
  type EstiloLogoImpresion,
} from '@/core/logo-impresion';

interface LogoEnPuntos {
  negros: Uint8Array;
  ancho: number;
  alto: number;
  anchoFranja: number;
}

/** Abre el logotipo guardado, lo ajusta al papel y lo pasa a puntos blancos y negros. */
async function rasterizar(datosLogo: string, ancho: AnchoImpresora, estilo: EstiloLogoImpresion): Promise<LogoEnPuntos> {
  const img = new Image();
  img.src = datosLogo;
  await img.decode();
  if (img.naturalWidth <= 0 || img.naturalHeight <= 0) throw new Error('No se pudo abrir el logotipo.');

  const anchoFranja = anchoDeFranja(puntosDePapel(ancho));
  const papel = dimensionesParaPapel(img.naturalWidth, img.naturalHeight, anchoFranja);
  const alto = filasParaAlto(papel.alto); // las franjas imprimen 7 filas en 8 puntos: se compensa la altura

  const lienzo = document.createElement('canvas');
  lienzo.width = papel.ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Este dispositivo no puede preparar el logotipo.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, papel.ancho, alto);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, papel.ancho, alto);

  const pixeles = ctx.getImageData(0, 0, papel.ancho, alto).data;
  return { negros: aMonocromo(pixeles, papel.ancho, alto, estilo), ancho: papel.ancho, alto, anchoFranja };
}

/** Los comandos ESC/POS del logotipo, listos para ir arriba del ticket. Lanza si no se puede preparar. */
export async function prepararLogoParaImpresion(datosLogo: string, ancho: AnchoImpresora, estilo: EstiloLogoImpresion): Promise<string> {
  const logo = await rasterizar(datosLogo, ancho, estilo);
  const comandos = construirComandosLogo(logo.negros, logo.ancho, logo.alto, logo.anchoFranja);
  if (comandos.length > LOGO_COMANDOS_MAXIMO_CARACTERES) throw new Error('El logotipo es demasiado grande para imprimirlo.');
  return comandos;
}

/**
 * Vista previa en blanco y negro (PNG en texto) de cómo saldrá en papel: los mismos puntos que se mandan a la
 * ticketera, a su proporción real (cada fila de imagen ocupa 8/7 de punto de papel).
 */
export async function vistaPreviaEnBlancoYNegro(datosLogo: string, ancho: AnchoImpresora, estilo: EstiloLogoImpresion): Promise<string> {
  const logo = await rasterizar(datosLogo, ancho, estilo);
  const alturaPapel = Math.round((logo.alto * PUNTOS_POR_FRANJA) / FILAS_POR_FRANJA);

  const pequeno = document.createElement('canvas');
  pequeno.width = logo.ancho;
  pequeno.height = logo.alto;
  const ctxPequeno = pequeno.getContext('2d');
  if (!ctxPequeno) throw new Error('Este dispositivo no puede preparar la vista previa.');
  const imagen = ctxPequeno.createImageData(logo.ancho, logo.alto);
  for (let i = 0; i < logo.negros.length; i += 1) {
    const valor = logo.negros[i] === 1 ? 0 : 255;
    imagen.data[i * 4] = valor;
    imagen.data[i * 4 + 1] = valor;
    imagen.data[i * 4 + 2] = valor;
    imagen.data[i * 4 + 3] = 255;
  }
  ctxPequeno.putImageData(imagen, 0, 0);

  const lienzo = document.createElement('canvas');
  lienzo.width = logo.ancho;
  lienzo.height = alturaPapel;
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('Este dispositivo no puede preparar la vista previa.');
  ctx.imageSmoothingEnabled = false; // sin suavizar: se ven los puntos como saldrán
  ctx.drawImage(pequeno, 0, 0, logo.ancho, alturaPapel);
  return lienzo.toDataURL('image/png');
}
