/**
 * Vende Fácil — Logotipo en la ticketera (Etapa 2)
 * ------------------------------------------------------------
 * Lógica PURA: pasa el logotipo a blanco y negro y lo convierte en comandos ESC/POS de imagen.
 *
 * Decisión técnica importante: el plugin de Bluetooth solo acepta TEXTO (`data: string`) y no se pudo comprobar
 * cómo lo convierte a bytes (probablemente UTF-8). Un byte mayor a 127 se mandaría como DOS bytes y la imagen saldría
 * corrupta. Por eso el logotipo se manda con `ESC *` (imagen por columnas) usando solo 7 de los 8 puntos de cada
 * byte: todos los bytes quedan entre 0 y 127 y viajan igual en cualquier codificación. A cambio, cada franja imprime
 * 7 filas de imagen en 8 puntos de papel (se deja una fila en blanco arriba de cada franja, una línea muy fina), y la
 * altura se compensa para que el logotipo no se vea estirado.
 *
 *  - `ESC 3 8` fija el avance de línea en 8 puntos: las franjas se pegan una debajo de otra sin solaparse.
 *  - Los anchos de la franja se eligen para que `nL` (el ancho módulo 256) sea menor a 128 y también viaje en 7 bits.
 *  - El logotipo se centra rellenando con blanco a los lados (no depende de la alineación de la impresora).
 */

import type { AnchoImpresora } from './impresora';
import { LOGO_ALTO_MAXIMO } from './logo';

/** '1' (predeterminado) o '0': imprimir el logotipo arriba del ticket de la ticketera. */
export const CLAVE_LOGO_EN_TICKET = 'tienda_logo_en_ticket';
/** 'nitido' (predeterminado, ideal para logotipos) o 'sombras' (para fotos: tonos con puntos). */
export const CLAVE_LOGO_ESTILO_TICKET = 'tienda_logo_estilo_ticket';

export type EstiloLogoImpresion = 'nitido' | 'sombras';

/** Una franja imprime 7 filas de imagen en 8 puntos de papel. */
export const FILAS_POR_FRANJA = 7;
export const PUNTOS_POR_FRANJA = 8;
/** Puntos de papel que ocupa un carácter con la fuente normal (12 × 24). */
export const PUNTOS_POR_CARACTER = 12;
/** Por debajo de este brillo (0 = negro, 255 = blanco) un punto sale negro en el estilo nítido. */
const UMBRAL_NEGRO = 140;
/** Un logotipo ya impreso no debe pasar de este tamaño en datos (seguridad). */
export const LOGO_COMANDOS_MAXIMO_CARACTERES = 60_000;

export function logoEnTicketActivo(valorGuardado: string | null): boolean {
  return valorGuardado !== '0';
}

export function estiloLogoImpresion(valorGuardado: string | null): EstiloLogoImpresion {
  return valorGuardado === 'sombras' ? 'sombras' : 'nitido';
}

/** Puntos de ancho del papel: 58 mm → 384, 80 mm → 576, otro → caracteres × 12 (múltiplo de 8). */
export function puntosDePapel(ancho: AnchoImpresora): number {
  if (ancho.papel === '80') return 576;
  if (ancho.papel === 'otro') return Math.floor((ancho.caracteres * PUNTOS_POR_CARACTER) / 8) * 8;
  return 384;
}

/**
 * Ancho (en puntos) de cada franja: el mayor múltiplo de 8 que cabe en el papel y cuyo ancho módulo 256 sea
 * menor a 128 (para que el byte `nL` del comando viaje en 7 bits). 58 mm → 376, 80 mm → 576.
 */
export function anchoDeFranja(puntosPapel: number): number {
  for (let ancho = Math.floor(puntosPapel / 8) * 8; ancho >= 8; ancho -= 8) {
    if (ancho % 256 < 128) return ancho;
  }
  return 8;
}

/** Cuántas filas de imagen hacen falta para cubrir `altoPuntos` de papel (por las franjas de 7 filas en 8 puntos). */
export function filasParaAlto(altoPuntos: number): number {
  return Math.max(1, Math.round((altoPuntos * FILAS_POR_FRANJA) / PUNTOS_POR_FRANJA));
}

/** Tamaño en el papel (puntos): cabe en el ancho de la franja y en 160 de alto, sin agrandar. */
export function dimensionesParaPapel(anchoLogo: number, altoLogo: number, anchoFranja: number): { ancho: number; alto: number } {
  const escala = Math.min(1, anchoFranja / anchoLogo, LOGO_ALTO_MAXIMO / altoLogo);
  return { ancho: Math.max(1, Math.round(anchoLogo * escala)), alto: Math.max(1, Math.round(altoLogo * escala)) };
}

/**
 * RGBA → puntos negros (1) y blancos (0), de `ancho × alto`. Lo transparente se trata como blanco.
 *  - 'nitido': negro si el brillo está por debajo del umbral (letras y trazos limpios).
 *  - 'sombras': difusión de error de Floyd–Steinberg (los grises se reparten en puntos; para fotos).
 */
export function aMonocromo(rgba: ArrayLike<number>, ancho: number, alto: number, estilo: EstiloLogoImpresion): Uint8Array {
  const brillo = new Float32Array(ancho * alto);
  for (let i = 0; i < ancho * alto; i += 1) {
    const a = (rgba[i * 4 + 3] ?? 255) / 255;
    const r = 255 + ((rgba[i * 4] ?? 255) - 255) * a;
    const g = 255 + ((rgba[i * 4 + 1] ?? 255) - 255) * a;
    const b = 255 + ((rgba[i * 4 + 2] ?? 255) - 255) * a;
    brillo[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const negros = new Uint8Array(ancho * alto);
  if (estilo === 'nitido') {
    for (let i = 0; i < brillo.length; i += 1) negros[i] = (brillo[i] ?? 255) < UMBRAL_NEGRO ? 1 : 0;
    return negros;
  }

  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      const i = y * ancho + x;
      const viejo = brillo[i] ?? 255;
      const nuevo = viejo < 128 ? 0 : 255;
      negros[i] = nuevo === 0 ? 1 : 0;
      const error = viejo - nuevo;
      if (x + 1 < ancho) brillo[i + 1] = (brillo[i + 1] ?? 0) + (error * 7) / 16;
      if (y + 1 < alto) {
        if (x > 0) brillo[i + ancho - 1] = (brillo[i + ancho - 1] ?? 0) + (error * 3) / 16;
        brillo[i + ancho] = (brillo[i + ancho] ?? 0) + (error * 5) / 16;
        if (x + 1 < ancho) brillo[i + ancho + 1] = (brillo[i + ancho + 1] ?? 0) + (error * 1) / 16;
      }
    }
  }
  return negros;
}

const ESC = '\x1B';

/**
 * Los comandos ESC/POS del logotipo, todos con bytes entre 0 y 127. `negros` es la imagen en puntos (1 = negro)
 * de `ancho × alto`; se centra dentro de `anchoFranja` y se parte en franjas de 7 filas.
 * Deja el avance de línea como estaba (`ESC 2`) al terminar.
 */
export function construirComandosLogo(negros: Uint8Array, ancho: number, alto: number, anchoFranja: number): string {
  const izquierda = Math.max(0, Math.floor((anchoFranja - ancho) / 2));
  const partes: string[] = [`${ESC}a\x00`, `${ESC}3\x08`];

  for (let fila0 = 0; fila0 < alto; fila0 += FILAS_POR_FRANJA) {
    const columnas = new Array<number>(anchoFranja).fill(0);
    for (let columna = 0; columna < ancho; columna += 1) {
      let byte = 0;
      for (let j = 0; j < FILAS_POR_FRANJA; j += 1) {
        const fila = fila0 + j;
        if (fila < alto && negros[fila * ancho + columna] === 1) byte |= 1 << (FILAS_POR_FRANJA - 1 - j); // bit 6 = fila de arriba
      }
      columnas[izquierda + columna] = byte;
    }
    // ESC * m nL nH d1...dk  (m = 1: 8 puntos de alto, densidad doble = la del papel)
    partes.push(`${ESC}*\x01`, String.fromCharCode(anchoFranja % 256, Math.floor(anchoFranja / 256)), String.fromCharCode(...columnas), '\n');
  }

  partes.push(`${ESC}2`);
  return partes.join('');
}

/** Atajo: de la imagen ya reducida al papel (puntos negros) a los comandos listos para la ticketera. */
export function construirLogoParaTicket(negros: Uint8Array, ancho: number, alto: number, puntosPapel: number): string {
  return construirComandosLogo(negros, ancho, alto, anchoDeFranja(puntosPapel));
}
