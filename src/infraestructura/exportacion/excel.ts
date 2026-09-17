/**
 * Vende Fácil — Generación del binario .xlsx
 * ------------------------------------------------------------
 * Único lugar del proyecto que depende de la librería `xlsx`
 * (SheetJS). Recibe el formato neutral `HojaExcel` (definido en
 * `src/core/exportacion.ts`, sin dependencias) y arma el libro real.
 * Todo ocurre en el navegador — no hay backend ni subida intermedia.
 */

import * as XLSX from 'xlsx';
import type { HojaExcel } from '@/core/exportacion';

export function generarLibroExcel(hojas: HojaExcel[]): Uint8Array {
  const libro = XLSX.utils.book_new();

  for (const hoja of hojas) {
    const datos = [hoja.encabezados, ...hoja.filas];
    const worksheet = XLSX.utils.aoa_to_sheet(datos);
    // Excel no acepta nombres de pestaña de más de 31 caracteres.
    XLSX.utils.book_append_sheet(libro, worksheet, hoja.nombre.slice(0, 31));
  }

  const buffer = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(buffer);
}

/**
 * Lee la primera pestaña de un .xlsx como filas crudas (arreglo de
 * arreglos, una celda = un valor), para la importación masiva de
 * productos (Más > Importar Productos). No interpreta nada — eso lo
 * hace `core/importacion-productos.ts`, que no depende de esta librería.
 */
export function leerFilasExcel(bytes: Uint8Array): unknown[][] {
  const libro = XLSX.read(bytes, { type: 'array' });
  const nombreHoja = libro.SheetNames[0];
  if (!nombreHoja) return [];
  const hoja = libro.Sheets[nombreHoja];
  if (!hoja) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: '' });
}
