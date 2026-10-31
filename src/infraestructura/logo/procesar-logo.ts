/**
 * Vende Fácil — Prepara el logotipo que elige el usuario (reduce, aplana el fondo y lo pasa a texto).
 * Necesita el navegador/WebView (canvas), por eso vive en infraestructura. La lógica de tamaños y validaciones
 * está en `core/logo.ts` y se prueba aparte.
 */

import {
  LOGO_DATOS_MAXIMO_CARACTERES,
  calcularTamanoLogo,
  validarArchivoLogo,
} from '@/core/logo';
import { ErrorDeNegocio } from '@/core/reglas-negocio';

interface ImagenAbierta {
  fuente: CanvasImageSource;
  ancho: number;
  alto: number;
  liberar: () => void;
}

/** Abre la imagen respetando la rotación de la cámara (fotos hechas con el celular de lado). */
async function abrirImagen(archivo: File): Promise<ImagenAbierta> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
      return { fuente: bitmap, ancho: bitmap.width, alto: bitmap.height, liberar: () => bitmap.close() };
    } catch {
      // Se prueba con el método clásico de abajo.
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ErrorDeNegocio('No se pudo abrir esa imagen. Prueba con otra (JPG o PNG).');
  }
}

/**
 * Devuelve el logotipo listo para guardar: máximo 384 × 160 px, fondo blanco (sin transparencia, que en papel
 * térmico saldría negra) y como texto `data:image/...`. PNG para que las letras queden nítidas; si pesa
 * demasiado (una foto), se guarda como JPEG.
 */
export async function procesarArchivoLogo(archivo: File): Promise<string> {
  validarArchivoLogo(archivo.type, archivo.size);
  const imagen = await abrirImagen(archivo);
  try {
    const { ancho, alto } = calcularTamanoLogo(imagen.ancho, imagen.alto);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new ErrorDeNegocio('Este dispositivo no puede preparar la imagen.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imagen.fuente, 0, 0, ancho, alto);

    let datos = lienzo.toDataURL('image/png');
    if (datos.length > LOGO_DATOS_MAXIMO_CARACTERES) datos = lienzo.toDataURL('image/jpeg', 0.85);
    if (datos.length > LOGO_DATOS_MAXIMO_CARACTERES) {
      throw new ErrorDeNegocio('Ese logotipo es muy detallado y pesa demasiado. Usa uno más simple (por ejemplo, sin fotos).');
    }
    return datos;
  } finally {
    imagen.liberar();
  }
}
