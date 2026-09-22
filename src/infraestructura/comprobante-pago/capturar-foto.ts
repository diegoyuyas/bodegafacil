/**
 * Vende Fácil — Foto del comprobante de pago (Yape/Plin, Premium, opcional)
 * ------------------------------------------------------------
 * El bodeguero elige cada vez si toma una foto nueva con la cámara o
 * elige una ya existente de su galería (ej. una captura de pantalla
 * de la notificación de pago) — no hay una única forma "correcta",
 * depende de cómo trabaje cada bodega (un celular para todo, o uno
 * aparte que recibe los Yape/Plin).
 *
 * Solo se guarda la URI del archivo (un texto cortito) en la venta —
 * la foto en sí vive como archivo aparte (JPEG, comprimido al 80% de
 * calidad), nunca dentro de la base de datos SQLite. Guardarla ahí
 * infla la base y hace cada vez más lento guardar cualquier venta,
 * ya que la base entera se reserializa completa en cada guardado (ver
 * `core/backup-automatico.ts` para la misma explicación aplicada al
 * respaldo). Las fotos que devuelve `takePhoto`/`chooseFromGallery`
 * ya quedan en almacenamiento permanente del propio dispositivo por
 * defecto — la URI sigue siendo válida aunque se cierre y reabra la
 * app, sin que haga falta copiar el archivo a mano.
 */
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

const MENSAJE_SOLO_APK =
  'Adjuntar foto del pago solo funciona dentro de la app instalada en el celular, no en el navegador.';
const CALIDAD_JPEG = 80;

export type OrigenFotoComprobante = 'camara' | 'galeria';

function esCancelacion(e: unknown): boolean {
  const mensaje = e instanceof Error ? e.message.toLowerCase() : '';
  return mensaje.includes('cancel');
}

/**
 * Devuelve la URI del archivo guardado, o `null` si el bodeguero
 * canceló (no es un error — simplemente no pasó nada).
 */
export async function capturarFotoComprobantePago(origen: OrigenFotoComprobante): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) throw new Error(MENSAJE_SOLO_APK);

  try {
    if (origen === 'camara') {
      const resultado = await Camera.takePhoto({ quality: CALIDAD_JPEG });
      return resultado.uri ?? null;
    }
    const resultado = await Camera.chooseFromGallery({});
    return resultado.results[0]?.uri ?? null;
  } catch (e) {
    if (esCancelacion(e)) return null;
    throw e;
  }
}
