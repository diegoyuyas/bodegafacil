// Genera src/infraestructura/sqlite/esquema-sql.generado.ts a partir de
// database/esquema.sql. Se ejecuta con `npm run sync:esquema` cada vez
// que se edite el esquema, para no tener dos copias divergentes.
//
// ¿Por qué existe este paso? sql.js corre en el navegador y no puede
// leer archivos del disco (fs), así que el SQL debe empaquetarse como
// un string de JavaScript/TypeScript en el bundle.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rutaEsquema = path.join(raiz, 'database', 'esquema.sql');
const rutaSalida = path.join(
  raiz,
  'src',
  'infraestructura',
  'sqlite',
  'esquema-sql.generado.ts',
);

const contenidoSql = readFileSync(rutaEsquema, 'utf-8');

const salida = `// ⚠️ ARCHIVO GENERADO — no editar a mano.
// Fuente: database/esquema.sql
// Para regenerar después de editar el esquema: npm run sync:esquema

export const ESQUEMA_SQL = ${JSON.stringify(contenidoSql)};
`;

writeFileSync(rutaSalida, salida, 'utf-8');
console.log(`Esquema sincronizado -> ${path.relative(raiz, rutaSalida)}`);
