/**
 * Efectos de lado del navegador para descargar archivos. La lógica de
 * formato (CSV, etc.) vive en `src/core/exportacion.ts` y no sabe nada
 * de esto — así se puede probar sin DOM.
 */

export function descargarTexto(nombreArchivo: string, contenido: string): void {
  // El BOM (\uFEFF) hace que Excel abra el CSV reconociendo acentos y "ñ".
  const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8;' });
  disparaDescarga(blob, nombreArchivo);
}

export function descargarBinario(nombreArchivo: string, datos: Uint8Array): void {
  const blob = new Blob([datos], { type: 'application/octet-stream' });
  disparaDescarga(blob, nombreArchivo);
}

function disparaDescarga(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
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
