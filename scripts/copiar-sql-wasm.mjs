// Copia el motor de sql.js (WASM) a /public para que el navegador pueda
// cargarlo en tiempo de ejecución (sql.js no puede quedar solo en
// node_modules porque el cliente lo pide por HTTP, no por import).
// Se ejecuta automáticamente en `npm install` (script "postinstall").

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const origen = path.join(raiz, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const carpetaDestino = path.join(raiz, 'public');
const destino = path.join(carpetaDestino, 'sql-wasm.wasm');

if (!existsSync(origen)) {
  console.warn('[postinstall] No se encontró sql-wasm.wasm en node_modules; ¿está instalado sql.js?');
  process.exit(0);
}

if (!existsSync(carpetaDestino)) {
  mkdirSync(carpetaDestino, { recursive: true });
}

copyFileSync(origen, destino);
console.log('[postinstall] sql-wasm.wasm copiado a /public');
