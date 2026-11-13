/**
 * Prueba de la Etapa 6 de Venta Entero/Fracción: Inicio (más vendido), Reportes (más vendidos y ganancia por producto),
 * Kardex, historial de costos, las exportaciones a Excel y CSV, la importación de stock y la lista de productos.
 *
 * Uso: npx tsx scripts/probar-reportes-fraccion.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { CompraRepositorioSqlite } from '../src/infraestructura/sqlite/compra.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import { CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar } from '../src/core/configuracion';
import {
  construirHojaComprasDetallado,
  construirHojaGananciaProductos,
  construirHojaHistorialCostos,
  construirHojaKardex,
  construirHojaMasVendidos,
  construirHojaProductos,
  construirHojaVentas,
  exportarProductosACsv,
  exportarVentasACsv,
} from '../src/core/exportacion';
import { parsearFilaImportacionStock } from '../src/core/importacion-stock';
import { productoMasVendido } from '../src/core/ventas-semana';
import {
  aUnidadesBase,
  etiquetaUnidadProducto,
  nombreConCantidadEn,
  nombreConUnidad,
  resumenCantidadVendida,
  textoStockConUnidad,
} from '../src/core/venta-fraccion';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}
const cerca = (a: number, b: number, tolerancia = 0.011) => Math.abs(a - b) <= tolerancia;

const localizarArchivo = () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const leer = (...ruta: string[]) => readFileSync(path.join(__dirname, '..', ...ruta), 'utf-8');

async function main() {
  // ---- Funciones puras
  const cfgGalleta = { formaVenta: 'fraccion', unidadEntera: 'Caja', unidadFraccion: 'Unidad', factorFraccion: 12 };
  const r1 = resumenCantidadVendida(25, cfgGalleta);
  afirmar(r1.cantidad === 2.08 && r1.cantidadTexto === '2 cajas y 1 unidad' && r1.unidadEntera === 'Caja', '25 unidades vendidas = 2.08 cajas, «2 cajas y 1 unidad»');
  const r2 = resumenCantidadVendida(7, { formaVenta: 'entero', unidadEntera: null, unidadFraccion: null, factorFraccion: null });
  afirmar(r2.cantidad === 7 && r2.cantidadTexto === undefined && r2.unidadEntera === undefined, 'Un producto normal se cuenta como siempre');
  afirmar(resumenCantidadVendida(5, { ...cfgGalleta, factorFraccion: null }).cantidadTexto === undefined, 'Un producto por fracciones con datos incompletos se cuenta como normal (no revienta)');
  afirmar(nombreConUnidad('GALLETA', 'Caja') === 'GALLETA (Caja)' && nombreConUnidad('INCA KOLA', null) === 'INCA KOLA' && nombreConUnidad('INCA KOLA', undefined) === 'INCA KOLA', 'En Excel: «GALLETA (Caja)»; los normales igual');
  afirmar(nombreConCantidadEn('GALLETA', 'Caja') === 'GALLETA (en cajas)' && nombreConCantidadEn('INCA KOLA', null) === 'INCA KOLA', 'En Excel de reportes: «GALLETA (en cajas)»; los normales igual');

  // ---- Inicio: producto más vendido
  const fr = { unidadEntera: 'Caja', unidadFraccion: 'Unidad', factor: 12 };
  const lineasGalleta = [
    { producto: 'GALLETA SODA', cantidad: 1, precioUnitario: 20, factorStock: 12, fraccion: fr },
    { producto: 'GALLETA SODA', cantidad: 8, precioUnitario: 2, factorStock: 1, fraccion: fr },
  ];
  const mv1 = productoMasVendido([...lineasGalleta, { producto: 'INCA KOLA', cantidad: 3, precioUnitario: 3 }]);
  afirmar(mv1?.producto === 'INCA KOLA' && mv1.cantidad === 3 && mv1.cantidadTexto === undefined, 'Más vendido: 3 gaseosas le ganan a 1 caja y 8 unidades (1.67 cajas)');
  const mv2 = productoMasVendido([...lineasGalleta, { producto: 'GALLETA SODA', cantidad: 2, precioUnitario: 20, factorStock: 12, fraccion: fr }, { producto: 'INCA KOLA', cantidad: 3, precioUnitario: 3 }]);
  afirmar(mv2?.producto === 'GALLETA SODA' && mv2.cantidad === 3.67 && mv2.cantidadTexto === '3 cajas y 8 unidades' && mv2.ingreso === 76, 'Más vendido: con 3 cajas y 8 unidades gana la galleta, dice «3 cajas y 8 unidades» y deja S/ 76.00');
  const mv3 = productoMasVendido([{ producto: 'A', cantidad: 2, precioUnitario: 1 }, { producto: 'B', cantidad: 2, precioUnitario: 5 }]);
  afirmar(mv3?.producto === 'B' && mv3.cantidadTexto === undefined, 'Más vendido sin fracciones: igual que siempre (empate: el que más dinero dejó)');

  // ---- Base real
  const bd = await BaseDatosLocal.crear({ localizarArchivo });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  const compras = new CompraRepositorioSqlite(bd, productos, caja);
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(true));

  const galleta = productos.crear({
    nombre: 'Galleta Soda', precioVenta: 20, costo: 14, stockActual: 248, stockMinimo: 24, controlaStock: true, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Caja', unidadFraccion: 'Unidad', factorFraccion: 12, precioFraccion: 2,
  });
  const arroz = productos.crear({
    nombre: 'Arroz', precioVenta: 8, costo: 6, stockActual: 5000, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Kg', unidadFraccion: 'Gramo', factorFraccion: 1000, precioFraccion: 0.008,
  });
  const gaseosa = productos.crear({ nombre: 'Inca Kola', precioVenta: 3, costo: 2, stockActual: 20, stockMinimo: 5, controlaStock: true, unidadMedida: 'unidad' });

  ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: aUnidadesBase(1, 8, 12) }, { productoId: gaseosa.id, cantidad: 2 }], metodoPago: 'efectivo' });
  ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: 5 }, { productoId: arroz.id, cantidad: 250 }], metodoPago: 'efectivo' });
  const anulada = ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: 100 }], metodoPago: 'efectivo' });
  ventas.anularVenta(anulada.id);
  const hoy = new Date();
  const dia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const desde = dia(new Date(hoy.getTime() - 86_400_000));
  const hasta = dia(new Date(hoy.getTime() + 86_400_000));

  // ---- Reportes: más vendidos
  const masVendidos = ventas.listarProductosMasVendidos(desde, hasta);
  const mGalleta = masVendidos.find((i) => i.productoId === galleta.id);
  const mGaseosa = masVendidos.find((i) => i.productoId === gaseosa.id);
  const mArroz = masVendidos.find((i) => i.productoId === arroz.id);
  afirmar(mGalleta?.cantidadVendida === 2.08 && mGalleta.cantidadTexto === '2 cajas y 1 unidad' && mGalleta.unidadEntera === 'Caja', 'Más vendidos: la galleta suma 25 unidades = «2 cajas y 1 unidad» (2.08 cajas); la venta anulada no cuenta');
  afirmar(mGalleta?.totalVendido === 46 && cerca(mGalleta.gananciaTotal, 6 + 6.67 + 4.17, 0.02), 'Más vendidos: la galleta dejó S/ 46.00 y una ganancia de ≈ S/ 16.84 (caja 6.00 + 8 unidades 6.67 + 5 unidades 4.17)');
  afirmar(mGaseosa?.cantidadVendida === 2 && mGaseosa.cantidadTexto === undefined && mGaseosa.unidadEntera === null, 'Más vendidos: el producto normal sigue contando como siempre (2)');
  afirmar(mArroz?.cantidadVendida === 0.25 && mArroz.cantidadTexto === '250 gramos' && mArroz.unidadEntera === 'Kg', 'Más vendidos: 250 g de arroz = 0.25 kg, «250 gramos»');
  afirmar(masVendidos[0]?.productoId === galleta.id && masVendidos[1]?.productoId === gaseosa.id && masVendidos[2]?.productoId === arroz.id, 'Se ordenan por enteros equivalentes: galleta (2.08), gaseosa (2), arroz (0.25)');

  // ---- Reportes: ganancia por producto
  const ganancias = ventas.listarGananciaPorProducto(desde, hasta);
  const gGalleta = ganancias.find((i) => i.productoId === galleta.id);
  afirmar(gGalleta?.cantidadVendida === 2.08 && gGalleta.cantidadTexto === '2 cajas y 1 unidad' && gGalleta.totalVendido === 46, 'Ganancia por producto: la galleta también se cuenta en cajas y unidades');
  afirmar(gGalleta !== undefined && cerca(gGalleta.costoTotal, 14 + 13 * (14 / 12), 0.02) && cerca(gGalleta.gananciaTotal, 46 - gGalleta.costoTotal, 0.05), 'El costo suma la caja (S/ 14.00) y cada unidad a su costo (14 ÷ 12): ≈ S/ 29.17');
  afirmar(ganancias.find((i) => i.productoId === gaseosa.id)?.cantidadVendida === 2, 'Ganancia por producto: el producto normal igual que siempre');

  // ---- Exportaciones a Excel y CSV
  const hojaMas = construirHojaMasVendidos(masVendidos);
  afirmar(hojaMas.filas.some((f) => f[0] === 'Galleta Soda'.toUpperCase() + ' (en cajas)' && f[1] === 2.08) && hojaMas.filas.some((f) => f[0] === 'INCA KOLA' && f[1] === 2), 'Excel «Más vendidos»: «GALLETA SODA (en cajas)» con 2.08 y el normal sin cambios');
  const hojaGan = construirHojaGananciaProductos(ganancias);
  afirmar(hojaGan.filas.some((f) => f[0] === 'GALLETA SODA (en cajas)') && hojaGan.filas.some((f) => f[0] === 'ARROZ (en kg)'), 'Excel «Ganancia por producto»: «GALLETA SODA (en cajas)» y «ARROZ (en kg)»');
  const filasVenta = ventas.listarDetalleParaExportar(desde, hasta);
  const csvVentas = exportarVentasACsv(filasVenta);
  afirmar(csvVentas.includes('GALLETA SODA (Caja)') && csvVentas.includes('GALLETA SODA (Unidad)') && csvVentas.includes('ARROZ (Gramo)') && csvVentas.includes('INCA KOLA,'), 'CSV de ventas: cada línea dice su unidad («GALLETA SODA (Caja)», «(Unidad)», «ARROZ (Gramo)») y el normal igual');
  const hojaVentas = construirHojaVentas(filasVenta);
  afirmar(hojaVentas.filas.some((f) => f.includes('GALLETA SODA (Caja)')) && hojaVentas.filas.some((f) => f.includes('INCA KOLA')), 'Excel de ventas: también');
  compras.registrarCompra({ lineas: [{ productoId: galleta.id, cantidad: aUnidadesBase(5, 6, 12), costoUnitario: 15 }, { productoId: gaseosa.id, cantidad: 4, costoUnitario: 2 }], metodoPago: 'efectivo' });
  const hojaCompras = construirHojaComprasDetallado(compras.listarDetalleParaExportar(desde, hasta));
  afirmar(hojaCompras.filas.some((f) => f.includes('GALLETA SODA (Caja)')) && hojaCompras.filas.some((f) => f.includes('GALLETA SODA (Unidad)')) && hojaCompras.filas.some((f) => f.includes('INCA KOLA')), 'Excel de compras: «GALLETA SODA (Caja)» y «GALLETA SODA (Unidad)»; el normal igual');
  const listaProductos = productos.listarTodos();
  const csvProductos = exportarProductosACsv(listaProductos);
  afirmar(csvProductos.split('\r\n')[0] === 'Nombre,Precio de venta,Costo,Stock actual,Stock mínimo,Unidad', 'CSV de productos: los encabezados no cambian');
  afirmar(csvProductos.includes('Unidad (stock en unidades; precio y costo por Caja; 1 Caja = 12)'), 'CSV de productos: la columna Unidad explica cómo leer el stock de un producto por fracciones');
  afirmar(csvProductos.includes('INCA KOLA,3,') && csvProductos.includes(',unidad'), 'CSV de productos: el normal queda igual («unidad»)');
  const hojaProductos = construirHojaProductos(listaProductos);
  afirmar(hojaProductos.filas.some((f) => f[0] === 'ARROZ' && f[5] === 'Gramo (stock en gramos; precio y costo por Kg; 1 Kg = 1000)'), 'Excel de productos: «Gramo (stock en gramos; precio y costo por Kg; 1 Kg = 1000)»');
  afirmar(etiquetaUnidadProducto(gaseosa) === 'unidad', 'La etiqueta de unidad de un producto normal es la de siempre');

  // ---- Historial de costos y Kardex
  const historial = compras.listarHistorialCostos(galleta.id);
  afirmar(historial.length === 2 && historial.some((h) => h.unidad === 'Caja' && h.cantidad === 5 && h.costoUnitario === 15) && historial.some((h) => h.unidad === 'Unidad' && h.cantidad === 6 && h.costoUnitario === 1.25), 'Historial de costos: «5 cajas a S/ 15.00» y «6 unidades a S/ 1.25»');
  const hojaCostos = construirHojaHistorialCostos('GALLETA SODA', historial);
  afirmar(hojaCostos.encabezados.length === 6 && hojaCostos.encabezados[5] === 'Unidad' && hojaCostos.filas.every((f) => f.length === 6), 'Excel del historial: agrega la columna «Unidad» solo cuando hay líneas por fracciones');
  const historialNormal = compras.listarHistorialCostos(gaseosa.id);
  const hojaCostosNormal = construirHojaHistorialCostos('INCA KOLA', historialNormal);
  afirmar(hojaCostosNormal.encabezados.length === 5 && hojaCostosNormal.filas.every((f) => f.length === 5), 'Excel del historial de un producto normal: sin cambios (5 columnas)');
  const kardex = productos.listarMovimientosInventario(galleta.id, desde, hasta);
  const hojaKardex = construirHojaKardex('GALLETA SODA', kardex, 'Unidad');
  afirmar(hojaKardex.encabezados.length === 9 && hojaKardex.encabezados[8] === 'Unidad' && hojaKardex.filas.every((f) => f[8] === 'Unidad'), 'Excel del Kardex: la columna «Unidad» dice en qué se cuentan Entrada, Salida y Saldo');
  afirmar(construirHojaKardex('INCA KOLA', productos.listarMovimientosInventario(gaseosa.id, desde, hasta)).encabezados.length === 8, 'Excel del Kardex de un producto normal: sin cambios (8 columnas)');
  afirmar(kardex.some((m) => m.cantidad === 12) && kardex.some((m) => m.cantidad === 8), 'El Kardex de la galleta tiene salidas de 12 y de 8 unidades (las dos líneas de la venta)');

  // ---- Importar stock por Excel
  const lista = productos.listarActivos();
  const filaFraccion = parsearFilaImportacionStock(['Galleta Soda', 5], 2, lista);
  afirmar(filaFraccion.datos === null && filaFraccion.errores[0]?.includes('se vende por fracciones') === true && filaFraccion.errores[0].includes('Productos'), 'Importar stock: un producto por fracciones se rechaza y dice que se ajusta en Productos');
  const filaNormal = parsearFilaImportacionStock(['Inca Kola', 5], 3, lista);
  afirmar(filaNormal.datos?.cantidad === 5 && filaNormal.errores.length === 0, 'Importar stock: un producto normal se importa como siempre');

  // ---- Textos de stock
  afirmar(productos.obtenerPorId(galleta.id).stockActual === 289 && textoStockConUnidad(productos.obtenerPorId(galleta.id)) === '24 cajas y 1 unidad', 'El stock de la galleta (248 − 25 + 66 = 289 unidades) se lee «24 cajas y 1 unidad»');
  afirmar(textoStockConUnidad(productos.obtenerPorId(gaseosa.id)) === '22 unidad', 'El stock de un producto normal se lee como siempre («22 unidad»)');

  // ---- Revisión del código de las pantallas
  const reportes = leer('src', 'app', 'mas', 'reportes', 'page.tsx');
  afirmar(reportes.includes('{item.cantidadTexto ?? item.cantidadVendida} vendidas · ganancia') && reportes.includes('{item.cantidadTexto ?? item.cantidadVendida} vendidas · costo'), 'Reportes: «2 cajas y 1 unidad vendidas» en Más vendidos y en Ganancia por producto');
  afirmar(reportes.includes('sufijoUnidad(linea.unidad, linea.cantidad)'), 'Reportes: el detalle de ventas y de compras dice la unidad de cada línea');
  afirmar(reportes.includes('textoMov(m.stockResultante)') && reportes.includes('textoStockConUnidad(productoElegidoKardex)') && reportes.includes('configuracionKardex.unidadFraccion'), 'Reportes: el Kardex muestra entradas, salidas y saldo en cajas y unidades y exporta su unidad');
  afirmar(reportes.includes('por ${textoUnidad(item.unidad, 1)}'), 'Reportes: el historial de costos dice «por caja» o «por unidad»');
  const inicio = leer('src', 'app', 'page.tsx');
  afirmar(!inicio.includes('Más vendido hoy') && !inicio.includes('productoMasVendido') && !inicio.includes('masVendidoHoy'), 'Inicio: ya no muestra «Más vendido hoy» (se quitó a pedido del usuario)');
  afirmar(leer('src', 'app', 'fiados', 'page.tsx').includes('sufijoUnidad(l.unidad, l.cantidad)') && leer('src', 'core', 'estado-cuenta.ts').includes('sufijoUnidad(l.unidad, l.cantidad)'), 'Fiados y estado de cuenta: las líneas dicen su unidad');

  console.log('\n🎉 Reportes, Kardex, Inicio, Excel e importación (Etapa 6) funcionan con productos por fracciones.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
