// @types/sql.js solo declara el módulo 'sql.js' (el import principal).
// Usamos a propósito el subpath 'sql.js/dist/sql-wasm.js' para evitar
// el build "browser" del paquete (ver el comentario en motor.ts), así
// que aquí reexportamos los mismos tipos para ese subpath.
declare module 'sql.js/dist/sql-wasm.js' {
  import initSqlJs, { type SqlJsStatic, type Database, type Statement } from 'sql.js';
  export default initSqlJs;
  export type { SqlJsStatic, Database, Statement };
}
