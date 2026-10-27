/**
 * Simula el caso real del usuario: una base de datos que ya existía ANTES de
 * que se agregaran las migraciones (0001 a la última), como la que ya tienes
 * corriendo en el celular o un respaldo viejo que se restaura.
 *
 * Cómo arma la base "antigua": parte del esquema ACTUAL (database/esquema.sql)
 * y le QUITA todo lo que agregaron las migraciones (columnas, índices y tablas
 * nuevas). Así la prueba no se queda vieja cada vez que se agrega una migración:
 * solo hay que sumar a las listas de abajo lo que esa migración agregue.
 *
 * Luego la abre como lo hace la app (con datosPrevios), y confirma que:
 *  - la migración la actualiza sola sin perder ningún dato,
 *  - al terminar tiene EXACTAMENTE las mismas tablas y columnas que una base nueva
 *    (esto avisa si el esquema y las migraciones se desincronizan),
 *  - correr las migraciones otra vez sobre una base ya migrada no falla.
 *
 * Uso: npx tsx scripts/probar-migracion.ts
 */
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { ESQUEMA_SQL } from '../src/infraestructura/sqlite/esquema-sql.generado';
import { obtenerMotorSqlJs } from '../src/infraestructura/sqlite/motor';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { ClienteRepositorioSqlite } from '../src/infraestructura/sqlite/cliente.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { UsuarioRepositorioSqlite } from '../src/infraestructura/sqlite/usuario.repositorio';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

/** Índices que agregaron las migraciones (hay que quitarlos antes que su columna). */
const INDICES_DE_MIGRACIONES = ['idx_cliente_documento'];

/** Tablas que crearon las migraciones. */
const TABLAS_DE_MIGRACIONES = ['producto_historial', 'bitacora_anulacion_pago', 'usuario', 'actividad_usuario']; // 0009, 0010, 0017, 0022

/** Columnas que agregaron las migraciones, por tabla. */
const COLUMNAS_DE_MIGRACIONES: Record<string, string[]> = {
  cliente: ['documento'], // 0001
  proveedor: ['ruc'], // 0002
  compra: ['proveedor_nombre_libre', 'comprobante', 'metodo_pago', 'motivo_anulacion', 'usuario_id', 'anulada_por', 'fecha_anulacion', 'modificada_por', 'fecha_modificacion'], // 0002, 0006, 0019, 0026-0029
  producto: ['controla_stock', 'tipo', 'alias'], // 0003, 0014, 0016
  venta: ['telefono_whatsapp', 'comprobante_pago_ruta', 'cliente_nombre_libre', 'usuario_id', 'anulada_por', 'fecha_anulacion'], // 0004, 0005, 0015, 0018, 0024-0025
  movimiento_caja: ['compra_id', 'cliente_id', 'clase', 'abono_id', 'pago_anulado', 'usuario_id'], // 0007, 0011, 0012, 0020
  pago_deuda: ['foto_ruta', 'abono_id', 'anulado', 'motivo_anulacion', 'fecha_anulacion', 'usuario_id', 'anulado_por'], // 0008, 0010, 0021, 0030
  detalle_venta: ['descripcion'], // 0013
  detalle_compra: ['descripcion'], // 0013
};

const localizarArchivo = () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

function columnasPorTabla(bd: BaseDatosLocal): Record<string, string[]> {
  const tablas = bd.consultar<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const resultado: Record<string, string[]> = {};
  for (const { name } of tablas) {
    resultado[name] = bd
      .consultar<{ name: string }>(`PRAGMA table_info(${name})`)
      .map((c) => c.name)
      .sort();
  }
  return resultado;
}

async function main() {
  const SQL = await obtenerMotorSqlJs(localizarArchivo);

  // 1. Base ANTIGUA: el esquema actual sin nada de lo que agregaron las migraciones.
  const dbVieja = new SQL.Database();
  dbVieja.run(ESQUEMA_SQL);
  for (const indice of INDICES_DE_MIGRACIONES) dbVieja.run(`DROP INDEX IF EXISTS ${indice}`);
  for (const tabla of TABLAS_DE_MIGRACIONES) dbVieja.run(`DROP TABLE IF EXISTS ${tabla}`);
  for (const [tabla, columnas] of Object.entries(COLUMNAS_DE_MIGRACIONES)) {
    for (const columna of columnas) dbVieja.run(`ALTER TABLE ${tabla} DROP COLUMN ${columna}`);
  }

  // Datos de antes de las migraciones (un poco de todo, para ver que nada se pierde).
  dbVieja.run('INSERT INTO cliente (nombre, telefono, saldo_pendiente) VALUES (?, ?, ?)', ['Mauro Vásquez', '999888777', 25.5]);
  dbVieja.run('INSERT INTO producto (nombre, precio_venta, costo, stock_actual) VALUES (?, ?, ?, ?)', ['Producto viejo', 5, 3, 10]);
  dbVieja.run('INSERT INTO proveedor (nombre, telefono) VALUES (?, ?)', ['Proveedor viejo', '999111222']);
  dbVieja.run('INSERT INTO compra (proveedor_id, total) VALUES (1, 50)');
  dbVieja.run("INSERT INTO venta (cliente_id, metodo_pago, subtotal, total) VALUES (1, 'fiado', 10, 10)");
  dbVieja.run(
    'INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal, ganancia_linea) VALUES (1, 1, 2, 5, 3, 10, 4)',
  );
  dbVieja.run("INSERT INTO movimiento_caja (tipo, monto, concepto, metodo_pago, saldo_resultante) VALUES ('ingreso', 10, 'Venta #1', 'efectivo', 10)");
  dbVieja.run("INSERT INTO movimiento_caja (tipo, monto, concepto, metodo_pago, saldo_resultante) VALUES ('egreso', 10, 'Anulación de venta #1', 'efectivo', 0)");
  const bytesViejos = dbVieja.export();
  dbVieja.close();

  // Comprobación de que de verdad es "antigua": nada de lo nuevo existe todavía.
  const dbControl = new SQL.Database(bytesViejos);
  const columnasProducto = (dbControl.exec('PRAGMA table_info(producto)')[0]?.values ?? []).map((f) => String(f[1]));
  const tablasAntes = (dbControl.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values ?? []).map((f) => String(f[0]));
  dbControl.close();
  afirmar(!columnasProducto.includes('alias') && !columnasProducto.includes('tipo'), 'La base de partida es antigua (sin alias ni tipo en producto)');
  afirmar(!tablasAntes.includes('producto_historial'), 'La base de partida es antigua (sin producto_historial)');

  // 2. Abrirla como lo hace la app (con datosPrevios) -> dispara aplicarMigraciones() sola.
  const bd = await BaseDatosLocal.crear({ localizarArchivo, datosPrevios: bytesViejos });
  const clientes = new ClienteRepositorioSqlite(bd, new ConfiguracionRepositorioSqlite(bd));
  const productos = new ProductoRepositorioSqlite(bd);

  // 3. Nada se perdió.
  const clienteExistente = clientes.listarActivos()[0];
  afirmar(clienteExistente?.nombre === 'Mauro Vásquez', 'El cliente que ya existía sigue ahí y su nombre no se corrompió');
  afirmar(clienteExistente?.saldoPendiente === 25.5, 'Su saldo pendiente no se corrompió');
  afirmar(clienteExistente?.documento === null, 'Su documento es null (no lo tenía) y no revienta');

  const productoViejo = productos.listarActivos()[0];
  afirmar(productos.listarActivos().length === 1, 'El producto que ya existía también sigue ahí');
  afirmar(productoViejo?.alias === null, 'Su alias es null (no lo tenía) y no revienta');
  afirmar(productoViejo?.tipo === 'venta_compra', "Su tipo queda en 'venta_compra' (valor por defecto)");
  afirmar(productoViejo?.controlaStock === true, 'Sigue controlando stock (valor por defecto)');
  afirmar(productoViejo?.stockActual === 10, 'Su stock no cambió');

  const proveedor = bd.consultar<{ nombre: string; ruc: string | null }>('SELECT nombre, ruc FROM proveedor WHERE id = 1')[0];
  afirmar(proveedor?.nombre === 'Proveedor viejo' && proveedor.ruc === null, 'El proveedor viejo sigue ahí con RUC null');

  const compra = bd.consultar<{ total: number; comprobante: string | null; metodo_pago: string | null }>(
    'SELECT total, comprobante, metodo_pago FROM compra WHERE id = 1',
  )[0];
  afirmar(compra?.total === 50 && compra.comprobante === null && compra.metodo_pago === null, 'La compra vieja sigue ahí con las columnas nuevas en null');

  const venta = bd.consultar<{ total: number; cliente_nombre_libre: string | null; telefono_whatsapp: string | null }>(
    'SELECT total, cliente_nombre_libre, telefono_whatsapp FROM venta WHERE id = 1',
  )[0];
  afirmar(venta?.total === 10 && venta.cliente_nombre_libre === null && venta.telefono_whatsapp === null, 'La venta vieja sigue ahí con las columnas nuevas en null');
  afirmar(
    bd.consultar<{ usuario_id: number | null }>('SELECT usuario_id FROM venta WHERE id = 1')[0]?.usuario_id === null &&
      bd.consultar<{ usuario_id: number | null }>('SELECT usuario_id FROM movimiento_caja WHERE id = 1')[0]?.usuario_id === null,
    'Lo hecho antes del control de usuarios queda sin usuario (no se inventa quién fue)',
  );

  const detalle = bd.consultar<{ cantidad: number; descripcion: string | null }>('SELECT cantidad, descripcion FROM detalle_venta WHERE id = 1')[0];
  afirmar(detalle?.cantidad === 2 && detalle.descripcion === null, 'El detalle de la venta vieja sigue ahí');

  const caja = bd.consultar<{ concepto: string; clase: string }>('SELECT concepto, clase FROM movimiento_caja ORDER BY id');
  afirmar(caja[0]?.clase === 'normal', "Un movimiento de caja normal queda como 'normal'");
  afirmar(caja[1]?.clase === 'anulacion', "Un movimiento viejo de anulación se reclasifica como 'anulacion' (migración 0011)");

  // 4. Tras migrar, debe tener EXACTAMENTE lo mismo que una base nueva.
  const bdNueva = await BaseDatosLocal.crear({ localizarArchivo });
  const migrada = columnasPorTabla(bd);
  const nueva = columnasPorTabla(bdNueva);
  afirmar(
    JSON.stringify(Object.keys(migrada)) === JSON.stringify(Object.keys(nueva)),
    `La base migrada tiene las mismas ${Object.keys(nueva).length} tablas que una base nueva`,
  );
  for (const tabla of Object.keys(nueva)) {
    const iguales = JSON.stringify(migrada[tabla]) === JSON.stringify(nueva[tabla]);
    afirmar(iguales, `La tabla ${tabla} tiene las mismas columnas que en una base nueva`);
  }

  // 5. Lo nuevo ya funciona sobre la base migrada.
  const clienteNuevo = clientes.crear('Diego Carrasco', '123456789101234');
  afirmar(clienteNuevo.documento === '123456789101234', 'Tras migrar, ya se puede crear un cliente con documento');
  const productoNuevo = productos.crear({
    nombre: 'Cobertura',
    precioVenta: 12,
    costo: 8,
    stockActual: 5,
    stockMinimo: 1,
    controlaStock: true,
    unidadMedida: 'unidad',
    alias: 'cobertura, bitter',
  });
  afirmar(productoNuevo.alias === 'COBERTURA,BITTER', 'Tras migrar, ya se puede guardar un producto con alias');
  const usuarios = new UsuarioRepositorioSqlite(bd, new ConfiguracionRepositorioSqlite(bd));
  afirmar(!usuarios.hayUsuarios(), 'Tras migrar, la base antigua queda SIN usuarios (la app entra normal, sin pedir acceso)');
  const { usuario: admin } = await usuarios.crearPrimerAdministrador({ nombre: 'Diego', clave: 'Admin.2024' });
  afirmar(admin.rol === 'administrador', 'Tras migrar, ya se puede crear el primer administrador');

  // 6. Volver a correr las migraciones sobre la base YA migrada no debe explotar (pasa cada vez que se abre la app).
  const bdOtraVez = await BaseDatosLocal.crear({ localizarArchivo, datosPrevios: bd.exportar() });
  const clientesOtraVez = new ClienteRepositorioSqlite(bdOtraVez, new ConfiguracionRepositorioSqlite(bdOtraVez));
  const productosOtraVez = new ProductoRepositorioSqlite(bdOtraVez);
  afirmar(clientesOtraVez.listarActivos().length === 2, 'Correr las migraciones de nuevo no falla ni duplica clientes');
  afirmar(productosOtraVez.listarActivos().length === 2, 'Correr las migraciones de nuevo no falla ni duplica productos');
  afirmar(productosOtraVez.obtenerPorId(productoNuevo.id).alias === 'COBERTURA,BITTER', 'Los alias sobreviven a cerrar y abrir la app');
  const usuariosOtraVez = new UsuarioRepositorioSqlite(bdOtraVez, new ConfiguracionRepositorioSqlite(bdOtraVez));
  afirmar(usuariosOtraVez.listarTodos().length === 1 && usuariosOtraVez.controlActivadoEnConfiguracion(), 'Los usuarios y el control sobreviven a cerrar y abrir la app (y a un respaldo)');
  afirmar((await usuariosOtraVez.verificarAcceso(admin.id, 'Admin.2024')).ok, 'La contraseña del administrador sigue funcionando tras cerrar y abrir');

  console.log('\n🎉 La migración de bases de datos existentes funciona sin perder datos.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
