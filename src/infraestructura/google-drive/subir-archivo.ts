/**
 * Vende Fácil — Subida a Google Drive
 * ------------------------------------------------------------
 * Sube el .xlsx ya generado (ver `infraestructura/exportacion/excel.ts`)
 * directamente al Drive personal del usuario autenticado, usando una
 * subida "multipart" simple contra la API REST de Drive v3. No pasa
 * por ningún servidor de Vende Fácil — el navegador habla directo
 * con Google.
 */

const URL_SUBIDA_DRIVE = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface ArchivoSubido {
  id: string;
  /** Enlace para abrir el archivo directamente en Google Sheets/Drive. */
  enlaceWeb: string;
}

/**
 * Arma el cuerpo multipart/related a mano (metadata JSON + bytes del
 * archivo) porque no hay SDK de Google cargado — solo `fetch`.
 */
function construirCuerpoMultipart(
  nombreArchivo: string,
  datos: Uint8Array,
  mimeType: string,
): { cuerpo: Blob; limite: string } {
  const limite = 'vende_facil_' + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name: nombreArchivo, mimeType });

  const partes: BlobPart[] = [
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${limite}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    datos,
    `\r\n--${limite}--`,
  ];

  return { cuerpo: new Blob(partes), limite };
}

/**
 * `mimeType` por defecto es el del Excel (uso original: Exportar a
 * Drive); el Backup Automático a Drive pasa `application/x-sqlite3`
 * para subir el `.sqlite` tal cual, sin que Drive lo confunda con una
 * hoja de cálculo.
 */
export async function subirArchivoADrive(
  accessToken: string,
  nombreArchivo: string,
  datos: Uint8Array,
  mimeType: string = MIME_XLSX,
): Promise<ArchivoSubido> {
  const { cuerpo, limite } = construirCuerpoMultipart(nombreArchivo, datos, mimeType);

  const respuesta = await fetch(URL_SUBIDA_DRIVE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${limite}`,
    },
    body: cuerpo,
  });

  if (!respuesta.ok) {
    const texto = await respuesta.text().catch(() => '');
    throw new Error(`Google Drive rechazó la subida (${respuesta.status}). ${texto}`.trim());
  }

  const json = (await respuesta.json()) as { id: string };
  return {
    id: json.id,
    enlaceWeb: `https://drive.google.com/file/d/${json.id}/view`,
  };
}
