/**
 * Vende Fácil — Logotipo del negocio (Más > Configuración > Información del Negocio)
 * ------------------------------------------------------------
 * Lógica PURA (sin pantalla ni canvas). El logotipo se guarda como una imagen pequeña en texto (data URL) dentro de
 * la configuración de la base de datos: así VIAJA EN EL RESPALDO (una ruta de archivo se perdería al cambiar de
 * teléfono). Al subirlo se reduce a un máximo de 384 × 160 px, con fondo blanco (sin transparencia).
 *
 * Etapa 1: sale en la IMAGEN del ticket (la que se comparte). La impresión en la ticketera es otra etapa.
 */

import { ErrorDeNegocio } from './reglas-negocio';

/** La imagen reducida, como texto `data:image/png;base64,...`. */
export const CLAVE_LOGO_DATOS = 'tienda_logo';
/** '1' (predeterminado) o '0': mostrar el logotipo arriba en la imagen del ticket. */
export const CLAVE_LOGO_EN_IMAGEN = 'tienda_logo_en_imagen';

/** 384 puntos = el ancho de una ticketera de 58 mm; en 80 mm (576 puntos) queda centrado. */
export const LOGO_ANCHO_MAXIMO = 384;
export const LOGO_ALTO_MAXIMO = 160;
/** Archivo original más pesado que esto se rechaza (fotos de cámara de más de 10 MB). */
export const LOGO_ARCHIVO_MAXIMO_BYTES = 10 * 1024 * 1024;
/** Lo que se guarda (ya reducido) no debe pasar de esto, para no engordar la base ni el respaldo. */
export const LOGO_DATOS_MAXIMO_CARACTERES = 250_000;

export const FORMATOS_LOGO_PERMITIDOS: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

/** Revisa el archivo elegido ANTES de abrirlo. Lanza un mensaje claro si no sirve. */
export function validarArchivoLogo(tipoMime: string, bytes: number): void {
  if (!FORMATOS_LOGO_PERMITIDOS.includes(tipoMime.toLowerCase())) {
    throw new ErrorDeNegocio('Ese archivo no sirve como logotipo. Usa una imagen JPG, PNG o WebP (no SVG ni GIF).');
  }
  if (bytes <= 0) {
    throw new ErrorDeNegocio('Ese archivo está vacío.');
  }
  if (bytes > LOGO_ARCHIVO_MAXIMO_BYTES) {
    throw new ErrorDeNegocio('Esa imagen pesa demasiado (más de 10 MB). Elige una más liviana.');
  }
}

/**
 * Tamaño final del logotipo: cabe dentro de 384 × 160 conservando la proporción. Nunca se agranda una imagen
 * chica (se vería borrosa). Devuelve enteros de al menos 1 px.
 */
export function calcularTamanoLogo(ancho: number, alto: number): { ancho: number; alto: number } {
  if (!(ancho > 0) || !(alto > 0)) {
    throw new ErrorDeNegocio('No se pudo leer el tamaño de la imagen.');
  }
  const escala = Math.min(1, LOGO_ANCHO_MAXIMO / ancho, LOGO_ALTO_MAXIMO / alto);
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/** ¿Lo guardado es realmente un logotipo usable? (PNG o JPEG en texto, de tamaño razonable). */
export function esLogoValido(datos: string | null | undefined): datos is string {
  if (!datos || datos.length > LOGO_DATOS_MAXIMO_CARACTERES) return false;
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(datos);
}

/** El interruptor «Mostrar en la imagen del ticket» viene ACTIVADO si nunca se tocó (solo '0' lo apaga). */
export function logoEnImagenActivo(valorGuardado: string | null): boolean {
  return valorGuardado !== '0';
}

/**
 * Cómo se dibuja el logotipo arriba de la imagen del ticket: ocupa como mucho el ancho útil y 120 px de alto,
 * sin agrandarse, centrado. `anchoUtil` es el ancho del lienzo menos los márgenes.
 */
export function tamanoLogoEnImagen(
  anchoLogo: number,
  altoLogo: number,
  anchoUtil: number,
  altoMaximo = 120,
): { ancho: number; alto: number } {
  if (!(anchoLogo > 0) || !(altoLogo > 0) || !(anchoUtil > 0)) return { ancho: 0, alto: 0 };
  const escala = Math.min(1, anchoUtil / anchoLogo, altoMaximo / altoLogo);
  return { ancho: Math.round(anchoLogo * escala), alto: Math.round(altoLogo * escala) };
}
