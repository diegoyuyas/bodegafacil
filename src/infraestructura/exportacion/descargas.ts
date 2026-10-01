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

/** Guardar ticket como... (Más > Nueva venta): comparte la imagen del comprobante — nunca se guarda sola, sin interacción. */
export async function descargarImagen(nombreArchivo: string, datos: Uint8Array): Promise<void> {
  const blob = new Blob([datos], { type: 'image/png' });
  await disparaDescarga(blob, nombreArchivo);
}

/**
 * Límite de espera para escribir el archivo antes de avisar el error
 * al usuario, en vez de dejar el botón "cargando" pegado para
 * siempre si `Filesystem.writeFile` se cuelga en algún dispositivo.
 */
const LIMITE_ESPERA_ESCRITURA_MS = 15000;

function conLimiteDeTiempo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(
      () => reject(new Error('La operación tardó demasiado. Intenta de nuevo.')),
      ms,
    );
    promesa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (error) => {
        clearTimeout(temporizador);
        reject(error);
      },
    );
  });
}

async function disparaDescarga(blob: Blob, nombreArchivo: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await conLimiteDeTiempo(descargarDentroDelApp(blob, nombreArchivo), LIMITE_ESPERA_ESCRITURA_MS);
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
  // OJO: no se espera (`await`) a que el usuario termine de elegir
  // algo en la hoja "Compartir" — esa hoja la maneja el sistema
  // operativo por su cuenta y puede tardar bastante (o el bodeguero
  // puede minimizar la app un rato antes de elegir). Si se esperara
  // aquí, el botón que llamó a esta función seguiría mostrándose
  // "ocupado" todo ese tiempo — y si por lo que sea la hoja no llega
  // a abrirse en el dispositivo, se quedaría así para siempre. Una
  // vez que el archivo ya está escrito, la función se da por
  // terminada: el share se dispara aparte, sin bloquear el botón.
  Share.share({ title: nombreArchivo, url: archivoEscrito.uri }).catch(() => {
    // Si el bodeguero cierra la hoja "Compartir" sin elegir nada,
    // el plugin rechaza la promesa — no es un error real que haya
    // que mostrar, el archivo ya se generó correctamente.
  });
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
