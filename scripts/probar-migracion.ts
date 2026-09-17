/**
 * Simula el caso real del usuario: una base de datos que ya existía
 * ANTES de agregar el campo `documento` (como la que ya tienes
 * corriendo). Crea una base con el esquema viejo (sin `documento`),
 * le mete datos, la recarga (como hace la app al abrir), y confirma
 * que la migración la actualiza sola sin perder nada.
 */
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { ClienteRepositorioSqlite } from '../src/infraestructura/sqlite/cliente.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const ESQUEMA_VIEJO_CLIENTE = `
CREATE TABLE cliente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT,
  direccion TEXT,
  saldo_pendiente REAL NOT NULL DEFAULT 0,
  fecha_ultimo_pago TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE producto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  categoria_id INTEGER,
  codigo TEXT,
  precio_venta REAL NOT NULL,
  costo REAL NOT NULL,
  stock_actual REAL NOT NULL DEFAULT 0,
  stock_minimo REAL NOT NULL DEFAULT 0,
  unidad_medida TEXT NOT NULL DEFAULT 'unidad',
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE proveedor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  direccion TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor_id INTEGER REFERENCES proveedor(id) ON DELETE SET NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now')),
  total REAL NOT NULL,
  estado TEXT NOT NULL DEFAULT 'recibida',
  nota TEXT
);
CREATE TABLE configuracion_app (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`;

async function main() {
  const localizarArchivo = () =>
    path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

  // 1. Simular la base "vieja": creamos sql.js a mano, sin pasar por
  //    esquema.sql, para que quede exactamente como estaba antes.
  const initSqlJs = (await import('sql.js/dist/sql-wasm.js')).default;
  const SQL = await initSqlJs({ locateFile: localizarArchivo });
  const dbVieja = new SQL.Database();
  dbVieja.run(ESQUEMA_VIEJO_CLIENTE);
  dbVieja.run('INSERT INTO cliente (nombre, telefono, saldo_pendiente) VALUES (?, ?, ?)', [
    'Mauro Vásquez',
    '999888777',
    25.5,
  ]);
  dbVieja.run('INSERT INTO producto (nombre, precio_venta, costo) VALUES (?, ?, ?)', [
    'Producto viejo',
    5,
    3,
  ]);
  dbVieja.run('INSERT INTO proveedor (nombre, telefono) VALUES (?, ?)', ['Proveedor viejo', '999111222']);
  dbVieja.run('INSERT INTO compra (proveedor_id, total) VALUES (1, 50)');
  const bytesViejos = dbVieja.export();
  dbVieja.close();

  // 2. Cargarla como lo hace la app real (con datosPrevios) -> debe
  //    disparar aplicarMigraciones() automáticamente.
  const bd = await BaseDatosLocal.crear({ localizarArchivo, datosPrevios: bytesViejos });

  const clientes = new ClienteRepositorioSqlite(bd, new ConfiguracionRepositorioSqlite(bd));
  const productos = new ProductoRepositorioSqlite(bd);

  const clienteExistente = clientes.listarActivos()[0];
  afirmar(!!clienteExistente, 'El cliente que ya existía antes de la migración sigue ahí');
  afirmar(clienteExistente?.nombre === 'Mauro Vásquez', 'Su nombre no se corrompió');
  afirmar(clienteExistente?.saldoPendiente === 25.5, 'Su saldo pendiente no se corrompió');
  afirmar(clienteExistente?.documento === null, 'Su documento es null (no lo tenía) y no revienta');

  afirmar(productos.listarActivos().length === 1, 'El producto que ya existía también sigue ahí');

  // El proveedor y la compra viejos (sin ruc/comprobante) deben seguir
  // ahí, y ya se les puede leer las columnas nuevas (en null).
  const filaProveedorVieja = bd.consultar<{ nombre: string; ruc: string | null }>(
    'SELECT nombre, ruc FROM proveedor WHERE id = 1',
  )[0];
  afirmar(filaProveedorVieja?.nombre === 'Proveedor viejo', 'El proveedor que ya existía sigue ahí');
  afirmar(filaProveedorVieja?.ruc === null, 'Su RUC es null (no existía la columna) y no revienta');

  const filaCompraVieja = bd.consultar<{ total: number; comprobante: string | null }>(
    'SELECT total, comprobante FROM compra WHERE id = 1',
  )[0];
  afirmar(filaCompraVieja?.total === 50, 'La compra que ya existía sigue ahí');
  afirmar(filaCompraVieja?.comprobante === null, 'Su comprobante es null y no revienta');

  // 3. Ahora sí debe poder crear un cliente CON documento, usando el
  //    índice único que la migración acaba de agregar.
  const clienteNuevo = clientes.crear('Diego Carrasco', '123456789101234');
  afirmar(clienteNuevo.documento === '123456789101234', 'Tras migrar, ya se puede crear con documento');

  // 4. Volver a correr las migraciones sobre la base YA migrada no
  //    debe explotar (es lo que pasa cada vez que se abre la app).
  const bdOtraVez = await BaseDatosLocal.crear({ localizarArchivo, datosPrevios: bd.exportar() });
  const clientesOtraVez = new ClienteRepositorioSqlite(bdOtraVez, new ConfiguracionRepositorioSqlite(bdOtraVez));
  afirmar(
    clientesOtraVez.listarActivos().length === 2,
    'Correr las migraciones de nuevo sobre una base ya migrada no falla ni duplica nada',
  );

  console.log('\n🎉 La migración de bases de datos existentes funciona sin perder datos.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
