/**
 * Vende Fácil — Imagen del comprobante (Más > Guardar ticket como...)
 * ------------------------------------------------------------
 * Dibuja el comprobante en un <canvas> y devuelve un PNG — se genera
 * al momento, nunca se guarda en la base de datos ni en disco por su
 * cuenta (eso lo decide el bodeguero al compartirlo, ver
 * `compartir-imagen.ts`). PNG en vez de PDF: no hace falta ninguna
 * librería nueva (Canvas ya viene en cualquier WebView), se genera en
 * milisegundos, y WhatsApp lo muestra directo en el chat en vez de
 * como archivo adjunto aparte.
 */

import { construirLineasComprobante, type DatosComprobante } from '@/core/comprobante-impresion';

const ANCHO_CARACTERES = 40;
const TAMANO_FUENTE = 15;
const TAMANO_FUENTE_GRANDE = 20;
const ALTO_LINEA = 21;
const MARGEN = 20;
const FUENTE = 'Courier New, monospace';

export async function generarImagenComprobante(datos: DatosComprobante): Promise<Blob> {
  const lineas = construirLineasComprobante(datos, ANCHO_CARACTERES);

  const medicion = document.createElement('canvas').getContext('2d');
  if (!medicion) throw new Error('Este dispositivo no puede generar la imagen del comprobante.');
  // El ancho del lienzo se mide con la fuente NORMAL — es la que
  // define el ancho real de los separadores y el detalle del pedido.
  // Si se midiera con la fuente grande/negrita (el nombre de la
  // tienda), el lienzo queda más ancho de lo que ese contenido
  // realmente ocupa, dejando un espacio en blanco a la derecha y
  // corriendo todo lo centrado hacia la izquierda del centro real.
  medicion.font = `${TAMANO_FUENTE}px ${FUENTE}`;
  const anchoCaracter = medicion.measureText('0').width;

  const anchoLienzo = Math.ceil(anchoCaracter * ANCHO_CARACTERES) + MARGEN * 2;
  const altoLienzo = lineas.length * ALTO_LINEA + MARGEN * 2;

  const lienzo = document.createElement('canvas');
  lienzo.width = anchoLienzo;
  lienzo.height = altoLienzo;
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('Este dispositivo no puede generar la imagen del comprobante.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, anchoLienzo, altoLienzo);
  ctx.fillStyle = '#111111';
  ctx.textBaseline = 'top';

  let y = MARGEN;
  for (const linea of lineas) {
    const tamano = linea.grande ? TAMANO_FUENTE_GRANDE : TAMANO_FUENTE;
    ctx.font = `${linea.negrita ? 'bold ' : ''}${tamano}px ${FUENTE}`;
    const anchoTexto = ctx.measureText(linea.texto).width;
    const x = linea.alineacion === 'centro' ? Math.max(MARGEN, (anchoLienzo - anchoTexto) / 2) : MARGEN;
    ctx.fillText(linea.texto, x, y);
    y += ALTO_LINEA;
  }

  return canvasABlobSincrono(lienzo);
}

/**
 * Convierte el <canvas> a PNG de forma SÍNCRONA con `toDataURL()`, en
 * vez de `canvas.toBlob()`. Se probó que `toBlob()` puede demorar
 * varios segundos (hasta ~15) en disparar su callback la primera vez
 * que se genera un ticket después de estar un rato sin tocar la
 * pantalla — Chrome/el WebView de Android agenda ese callback junto
 * al siguiente dibujo de pantalla, y sin ningún toque reciente ese
 * dibujo se retrasa. `toDataURL()` no tiene ese problema: se resuelve
 * en el mismo hilo, al instante, sin depender de que llegue un nuevo
 * frame.
 */
function canvasABlobSincrono(lienzo: HTMLCanvasElement): Blob {
  const dataUrl = lienzo.toDataURL('image/png');
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'image/png' });
}
