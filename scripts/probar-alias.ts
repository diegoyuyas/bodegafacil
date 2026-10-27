/**
 * Prueba de la Configuración de Venta + Alias de productos (Etapas 1 a 3).
 * Cubre: migración desde una base/respaldo ANTIGUO (sin la columna alias), guardado y
 * validación de alias, que no se pierdan al editar, Excel de productos con y sin la
 * columna Alias, que el CSV siga igual y que el modo venta por voz exija Premium.
 *
 * Uso: npx tsx scripts/probar-alias.ts
 */
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { ESQUEMA_SQL } from '../src/infraestructura/sqlite/esquema-sql.generado';
import { obtenerMotorSqlJs } from '../src/infraestructura/sqlite/motor';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { construirHojaProductos, exportarProductosACsv } from '../src/core/exportacion';
import {
  construirPlantillaImportarProductos,
  filaEstaVacia,
  marcarDuplicados,
  parsearFilaImportacion,
} from '../src/core/importacion-productos';
import { generarLibroExcel, leerFilasExcel } from '../src/infraestructura/exportacion/excel';
import { modoVentaVozDisponible } from '../src/core/configuracion';
import { productosConMismoAlias } from '../src/core/reglas-negocio';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

function lanza(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const localizarArchivo = () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

async function main() {
  // 1. Base ANTIGUA = el esquema actual SIN la columna alias (como la de un usuario que ya tenía la app,
  //    o un respaldo viejo que se restaura).
  const esquemaViejo = ESQUEMA_SQL.split(/\r?\n/)
    .filter((linea) => !/^\s+alias\s+TEXT/.test(linea))
    .join('\n');
  afirmar(!/alias\s+TEXT/.test(esquemaViejo), 'Se armó una base antigua sin la columna alias');

  const SQL = await obtenerMotorSqlJs(localizarArchivo);
  const dbVieja = new SQL.Database();
  dbVieja.run(esquemaViejo);
  dbVieja.run('INSERT INTO producto (nombre, precio_venta, costo, stock_actual) VALUES (?, ?, ?, ?)', ['PRODUCTO VIEJO', 5, 3, 10]);
  const bytesViejos = dbVieja.export();
  dbVieja.close();

  // 2. Abrirla como lo hace la app / la restauración de respaldo: la migración agrega la columna sola.
  const bd = await BaseDatosLocal.crear({ localizarArchivo, datosPrevios: bytesViejos });
  const productos = new ProductoRepositorioSqlite(bd);
  const viejo = productos.listarTodos()[0];
  afirmar(viejo?.nombre === 'PRODUCTO VIEJO' && viejo.stockActual === 10, 'El producto antiguo sigue intacto tras migrar');
  afirmar(viejo?.alias === null, 'Su alias es null (no tenía) y no revienta');

  // 3. Alias en un producto nuevo: se normalizan, quedan en MAYÚSCULAS y sin repetidos.
  const cobertura = productos.crear({
    nombre: 'Cobertura de chocolate',
    precioVenta: 12,
    costo: 8,
    stockActual: 5,
    stockMinimo: 1,
    controlaStock: true,
    unidadMedida: 'unidad',
    alias: ' cobertura, Bítter ,, winter, COBERTURA, caja ',
  });
  afirmar(cobertura.alias === 'COBERTURA,BÍTTER,WINTER,CAJA', `Alias normalizado y guardado (obtenido: ${cobertura.alias})`);

  const sinAlias = productos.crear({
    nombre: 'Sin alias',
    precioVenta: 1,
    costo: 0,
    stockActual: 0,
    stockMinimo: 0,
    controlaStock: false,
    unidadMedida: 'unidad',
  });
  afirmar(sinAlias.alias === null, 'El alias es opcional: un producto se guarda sin alias');

  // 4. Validaciones.
  const base = { nombre: 'X', precioVenta: 1, costo: 0, stockActual: 0, stockMinimo: 0, controlaStock: false, unidadMedida: 'unidad' };
  afirmar(lanza(() => productos.crear({ ...base, nombre: 'P1', alias: 'yape' })) !== null, 'Una palabra reservada (yape) se rechaza');
  afirmar(lanza(() => productos.crear({ ...base, nombre: 'P2', alias: 'media docena' })) !== null, 'Una cantidad en palabras se rechaza');
  afirmar(lanza(() => productos.crear({ ...base, nombre: 'P3', alias: 'a$b' })) !== null, 'Un alias con símbolos se rechaza');
  afirmar(lanza(() => productos.crear({ ...base, nombre: 'P4', alias: 'x'.repeat(31) })) !== null, 'Un alias de más de 30 caracteres se rechaza');
  afirmar(
    lanza(() => productos.crear({ ...base, nombre: 'P5', alias: Array.from({ length: 11 }, (_, i) => `ALIAS ${i}`).join(',') })) !== null,
    'Más de 10 alias se rechaza',
  );
  afirmar(productos.listarTodos().length === 3, 'Los rechazados no dejaron productos a medias');

  // 5. Alias repetido en otro producto: NO se bloquea (solo avisa en pantalla).
  const otro = productos.crear({ ...base, nombre: 'Otro con bitter', alias: 'bitter' });
  afirmar(otro.alias === 'BITTER', 'Un alias repetido en otro producto NO se bloquea');
  afirmar(
    productosConMismoAlias('bítter', productos.listarTodos(), otro.id).map((p) => p.id).join() === String(cobertura.id),
    'El aviso encuentra al otro producto (sin importar tildes ni mayúsculas)',
  );

  // 6. Editar: sin indicar alias se conservan; con null se borran; con texto se reemplazan.
  const datosEdicion = (alias?: string | null) => ({
    nombre: cobertura.nombre,
    precioVenta: cobertura.precioVenta,
    costo: cobertura.costo,
    stockMinimo: cobertura.stockMinimo,
    controlaStock: true,
    unidadMedida: cobertura.unidadMedida,
    activo: true,
    ...(alias === undefined ? {} : { alias }),
  });
  afirmar(productos.actualizar(cobertura.id, datosEdicion()).alias === 'COBERTURA,BÍTTER,WINTER,CAJA', 'Editar con el modo voz en OFF (sin mandar alias) NO borra los alias');
  afirmar(productos.actualizar(cobertura.id, datosEdicion('nuevo, otro')).alias === 'NUEVO,OTRO', 'Editar reemplaza los alias');
  afirmar(productos.actualizar(cobertura.id, datosEdicion(null)).alias === null, 'Dejar el campo vacío borra los alias');
  productos.actualizar(cobertura.id, datosEdicion('cobertura, winter'));

  // 7. Insumo: nunca lleva alias.
  const insumo = productos.crear({ ...base, nombre: 'Harina insumo', tipo: 'insumo', alias: 'harina' });
  afirmar(insumo.alias === null, 'Un insumo no guarda alias');

  // 8. Persistir y reabrir (como al cerrar y abrir la app); volver a migrar no falla ni duplica.
  const bdOtraVez = await BaseDatosLocal.crear({ localizarArchivo, datosPrevios: bd.exportar() });
  const productos2 = new ProductoRepositorioSqlite(bdOtraVez);
  afirmar(productos2.obtenerPorId(cobertura.id).alias === 'COBERTURA,WINTER', 'Los alias sobreviven a cerrar y abrir (y a un respaldo)');
  afirmar(productos2.listarTodos().length === 5, 'Migrar de nuevo una base ya migrada no duplica ni pierde productos');

  // 9. Excel de productos: columna Alias al exportar.
  const hoja = construirHojaProductos(productos2.listarTodos());
  const colAlias = hoja.encabezados.indexOf('Alias');
  afirmar(colAlias === hoja.encabezados.length - 1, 'El Excel de productos tiene la columna Alias al final');
  const filaCobertura = hoja.filas.find((f) => f[0] === 'COBERTURA DE CHOCOLATE');
  afirmar(filaCobertura?.[colAlias] === 'COBERTURA, WINTER', 'El Excel exporta los alias separados por coma y espacio');
  afirmar(hoja.filas.find((f) => f[0] === 'SIN ALIAS')?.[colAlias] === '', 'Un producto sin alias sale con la celda vacía');

  // 10. El CSV simple NO cambia.
  const csv = exportarProductosACsv(productos2.listarTodos());
  afirmar(
    csv.split('\r\n')[0] === 'Nombre,Precio de venta,Costo,Stock actual,Stock mínimo,Unidad',
    'El CSV de productos queda igual (sin columna Alias)',
  );

  // 11. Importar Excel: con columna Alias, y un Excel ANTIGUO sin ella.
  const plantilla = construirPlantillaImportarProductos();
  afirmar(plantilla.encabezados.includes('alias') && plantilla.filas.every((f) => f.length === plantilla.encabezados.length), 'La plantilla de importación trae la columna alias');

  function importarDesdeExcel(encabezados: string[], filas: unknown[][]) {
    const bytes = generarLibroExcel([{ nombre: 'Productos', encabezados, filas: filas as never }]);
    const leidas = leerFilasExcel(bytes).slice(1);
    const procesadas = leidas.flatMap((valores, i) => (filaEstaVacia(valores) ? [] : [parsearFilaImportacion(valores, i + 2)]));
    return marcarDuplicados(procesadas, new Set());
  }

  const conAlias = importarDesdeExcel(
    ['nombre_producto', 'precio_venta', 'costo', 'stock_inicial', 'stock_minimo', 'control_stock', 'alias'],
    [
      ['Gaseosa', 4, 2, 10, 2, 'SI', 'cola, gaseosa amarilla'],
      ['Pan', 0.3, 0.2, '', '', 'SI', ''],
      ['Mal alias', 1, 0, '', '', 'SI', 'efectivo'],
    ],
  );
  afirmar(conAlias[0]?.datos?.alias === 'COLA,GASEOSA AMARILLA', 'Importar: el alias del Excel se normaliza');
  afirmar(conAlias[1]?.datos !== null && conAlias[1]?.datos?.alias === null, 'Importar: alias vacío no es error');
  afirmar(conAlias[2]?.datos === null && (conAlias[2]?.errores.length ?? 0) > 0, 'Importar: un alias inválido marca error solo en esa fila');

  const sinColumna = importarDesdeExcel(
    ['nombre_producto', 'precio_venta', 'costo', 'stock_inicial', 'stock_minimo', 'control_stock'],
    [['Galleta', 1, 0.5, 20, 5, 'SI']],
  );
  afirmar(sinColumna[0]?.datos !== null && sinColumna[0]?.datos?.alias === null, 'Importar: un Excel antiguo SIN la columna alias sigue funcionando');

  const creado = productos2.crear(conAlias[0]!.datos!);
  afirmar(creado.alias === 'COLA,GASEOSA AMARILLA', 'Lo importado se guarda con su alias');

  // 12. Modo venta por voz: clave en ON Y plan Premium.
  afirmar(modoVentaVozDisponible('1', true) === true, 'Modo voz: ON + Premium = disponible');
  afirmar(modoVentaVozDisponible('1', false) === false, 'Modo voz: ON pero plan Free = NO disponible (el campo Alias no se ve)');
  afirmar(modoVentaVozDisponible('0', true) === false && modoVentaVozDisponible(null, true) === false, 'Modo voz: OFF o sin configurar = NO disponible');

  console.log('\n🎉 Configuración de Venta y Alias funcionan de punta a punta.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
