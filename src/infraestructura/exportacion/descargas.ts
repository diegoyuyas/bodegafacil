/**
 * Efectos de lado para "descargar" un archivo (respaldo, CSV, Excel).
 * La lógica de formato vive en `src/core/exportacion.ts` y no sabe
 * nada de esto — así se puede probar sin DOM.
 *
 * En un navegador normal (o la PWA instalada), un <a download> con un
 * blob dispara la descarga real de siempre. PERO dentro del APK
 * (WebView de Capacitor) eso no hace nada — no hay gestor de
 * descargas ahí adentro, el clic se pierde en silencio. Por eso: si
 * `Capacitor.isNativePlatform()` dice que estamos dentro de la app
 * empaquetada, en vez de eso se escribe el archivo en el
 * almacenamiento privado de la app y se abre la hoja nativa
 * "Compartir" de Android, para que el bodeguero elija dónde guardarlo
 * (Drive, WhatsApp, Archivos, correo...) — mismo espíritu con el que
 * ya se reparte el propio .apk.
 */

import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function descargarTexto(nombreArchivo: string, contenido: string): Promise<void> {
  // El BOM (\uFEFF) hace que Excel abra el CSV reconociendo acentos y "ñ".
  const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8;' });
  await disparaDescarga(blob, nombreArchivo);
}

export async function descargarBinario(nombreArchivo: string, datos: Uint8Array): Promise<void> {
  const blob = new Blob([datos], { type: 'application/octet-stream' });
  await disparaDescarga(blob, nombreArchivo);
}

export async function descargarExcel(nombreArchivo: string, datos: Uint8Array): Promise<void> {
  const blob = new Blob([datos], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await disparaDescarga(blob, nombreArchivo);
}

async function disparaDescarga(blob: Blob, nombreArchivo: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await descargarDentroDelApp(blob, nombreArchivo);
    return;
  }

  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

async function descargarDentroDelApp(blob: Blob, nombreArchivo: string): Promise<void> {
  const base64 = await blobABase64(blob);
  const archivoEscrito = await Filesystem.writeFile({
    path: nombreArchivo,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({ title: nombreArchivo, url: archivoEscrito.uri });
}

/** `Filesystem.writeFile` espera solo la parte de datos de un data URL, sin el prefijo "data:...;base64,". */
function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onloadend = () => {
      const resultado = lector.result as string;
      resolve(resultado.slice(resultado.indexOf(',') + 1));
    };
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(blob);
  });
}

const CARPETA_BACKUP_AUTOMATICO = 'VendeFacil';

/**
 * Guarda un archivo binario SIN interacción del usuario — usado por el
 * Backup Automático (Más > Configuración > Configurar Backup
 * Automático). A diferencia de `descargarBinario` (que en el APK abre
 * la hoja "Compartir" para que el bodeguero elija destino cada vez),
 * acá se escribe directo en una carpeta fija (`Documents/VendeFacil`)
 * con permiso de almacenamiento — se sobrescribe si ya existía un
 * archivo con el mismo nombre.
 *
 * En navegador/PWA instalada NO existe forma de escribir en disco sin
 * que el usuario interactúe con un diálogo (sandbox de seguridad del
 * navegador): ahí se cae al mismo `<a download>` de siempre, así que
 * el resultado indica `silencioso: false` para que quien llama sepa
 * que sí se disparó algo visible.
 */
export async function guardarBinarioLocalSilencioso(
  nombreArchivo: string,
  datos: Uint8Array,
): Promise<{ silencioso: boolean; ruta: string }> {
  if (!Capacitor.isNativePlatform()) {
    await descargarBinario(nombreArchivo, datos);
    return { silencioso: false, ruta: nombreArchivo };
  }

  const permisoActual = await Filesystem.checkPermissions();
  if (permisoActual.publicStorage !== 'granted') {
    const permisoPedido = await Filesystem.requestPermissions();
    if (permisoPedido.publicStorage !== 'granted') {
      throw new Error('No se pudo guardar: falta el permiso de almacenamiento del teléfono.');
    }
  }

  const blob = new Blob([datos], { type: 'application/octet-stream' });
  const base64 = await blobABase64(blob);
  const archivoEscrito = await Filesystem.writeFile({
    path: `${CARPETA_BACKUP_AUTOMATICO}/${nombreArchivo}`,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
  return { silencioso: true, ruta: archivoEscrito.uri };
}

/** Lee un <input type="file"> como bytes, para restaurar un respaldo. */
export function leerArchivoComoBytes(archivo: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(new Uint8Array(lector.result as ArrayBuffer));
    lector.onerror = () => reject(lector.error);
    lector.readAsArrayBuffer(archivo);
  });
}
