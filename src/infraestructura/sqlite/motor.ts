// Importamos el subpath explícito (no 'sql.js' a secas) a propósito:
// el paquete resuelve la condición "browser" de su package.json hacia
// dist/sql-wasm-browser.js, que ubica el .wasm vía `import.meta.url`.
// Eso se rompe con el empaquetado de Next.js/webpack (la URL termina
// apuntando a un chunk interno, no al archivo real), lo que produce
// "Aborted(both async and sync fetching of the wasm failed)". El
// build dist/sql-wasm.js, en cambio, respeta el `locateFile` que le
// pasamos y funciona igual de bien en Node que en el navegador.
import initSqlJs, { type SqlJsStatic } from 'sql.js/dist/sql-wasm.js';

let promesaSqlJs: Promise<SqlJsStatic> | null = null;

/**
 * Carga el motor de sql.js (WASM) una sola vez por proceso/pestaña.
 * `localizarArchivo` decide dónde buscar el .wasm: en el navegador es
 * `/sql-wasm.wasm` (servido desde /public); en Node (scripts/tests) es
 * la ruta dentro de node_modules.
 */
export function obtenerMotorSqlJs(
  localizarArchivo?: (archivo: string) => string,
): Promise<SqlJsStatic> {
  if (!promesaSqlJs) {
    promesaSqlJs = initSqlJs(localizarArchivo ? { locateFile: localizarArchivo } : undefined);
  }
  return promesaSqlJs;
}
