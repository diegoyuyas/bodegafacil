/**
 * Prueba de la Etapa 5 de Venta Entero/Fracción: comprar productos por fracciones (cajas, unidades sueltas y costo por
 * caja), el stock, la caja, el costo del producto, modificar y anular compras, y la revisión del código de las pantallas.
 *
 * Uso: npx tsx scripts/probar-compra-fraccion.ts
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
import { ErrorDeNegocio } from '../src/core/reglas-negocio';
import type { Producto } from '../src/core/tipos';
import {
  aUnidadesBase,
  armarLineasDeCompra,
  cantidadBaseDesdeCasillas,
  colapsarLineasDeCompra,
  importeCompraFraccion,
  subtotalCompraFraccion,
  textoStockDeProducto,
} from '../src/core/venta-fraccion';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

function mensajeDe(accion: () => void): string | null {
  try {
    accion();
    return null;
  } catch (e) {
    return e instanceof ErrorDeNegocio ? e.message : `OTRO ERROR: ${String(e)}`;
  }
}

const localizarArchivo = () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const leer = (...ruta: string[]) => readFileSync(path.join(__dirname, '..', ...ruta), 'utf-8');

interface FilaDetalle { cantidad: number; costo_unitario: number; subtotal: number; descripcion: string | null; unidad: string | null; factor_stock: number }
interface FilaMovimiento { tipo: string; cantidad: number; motivo: string; stock_resultante: number }

async function main() {
  const bd = await BaseDatosLocal.crear({ localizarArchivo });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  const compras = new CompraRepositorioSqlite(bd, productos, caja);
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(true));

  const detalles = (compraId: number) =>
    bd.consultar<FilaDetalle>('SELECT cantidad, costo_unitario, subtotal, descripcion, unidad, factor_stock FROM detalle_compra WHERE compra_id = ? ORDER BY id', [compraId]);
  const movimientos = (compraId: number) =>
    bd.consultar<FilaMovimiento>('SELECT tipo, cantidad, motivo, stock_resultante FROM movimiento_inventario WHERE compra_id = ? ORDER BY id', [compraId]);
  const producto = (id: number): Producto => productos.obtenerPorId(id);

  const galleta = productos.crear({
    nombre: 'Galleta Soda', precioVenta: 20, costo: 12, stockActual: 0, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Caja', unidadFraccion: 'Unidad', factorFraccion: 12, precioFraccion: 2,
  });
  const arroz = productos.crear({
    nombre: 'Arroz', precioVenta: 8, costo: 5, stockActual: 0, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Kg', unidadFraccion: 'Gramo', factorFraccion: 1000, precioFraccion: 0.008,
  });
  const gaseosa = productos.crear({ nombre: 'Inca Kola', precioVenta: 3, costo: 2, stockActual: 10, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad' });
  const insumo = productos.crear({ nombre: 'Bolsas', precioVenta: 0, costo: 5, stockActual: 0, stockMinimo: 0, controlaStock: false, unidadMedida: 'unidad', tipo: 'insumo' });
  const obtener = (id: number) => productos.obtenerPorId(id);

  // ---- Funciones puras: armar las líneas de una compra
  const armadas = armarLineasDeCompra([{ productoId: galleta.id, cantidad: 66, costoUnitario: 15, descripcion: 'Oferta' }], obtener);
  afirmar(armadas.length === 2 && armadas[0]?.unidad === 'Caja' && armadas[0]?.cantidad === 5 && armadas[0]?.costoUnitario === 15 && armadas[0]?.factorStock === 12, '66 unidades a S/ 15 la caja = línea 1: 5 Caja × S/ 15.00 (mueve 12 de stock)');
  afirmar(armadas[1]?.unidad === 'Unidad' && armadas[1]?.cantidad === 6 && armadas[1]?.costoUnitario === 1.25 && armadas[1]?.factorStock === 1, 'Línea 2: 6 Unidad × S/ 1.25 (la caja ÷ 12)');
  afirmar(armadas.every((l) => l.costoProducto === 15) && armadas[0]?.descripcion === 'Oferta' && armadas[1]?.descripcion === null, 'El costo del producto queda en el de la caja (S/ 15.00) y la nota va solo en la primera línea');
  afirmar(armarLineasDeCompra([{ productoId: galleta.id, cantidad: 60, costoUnitario: 15 }], obtener).length === 1, '60 unidades son 5 cajas justas: una sola línea');
  const soloSueltas = armarLineasDeCompra([{ productoId: galleta.id, cantidad: 6, costoUnitario: 14 }], obtener);
  afirmar(soloSueltas.length === 1 && soloSueltas[0]?.unidad === 'Unidad' && soloSueltas[0]?.costoProducto === 14, 'Solo unidades sueltas: una línea, y el costo del producto sigue siendo el de la caja (S/ 14.00)');
  const mezcla = armarLineasDeCompra([{ productoId: gaseosa.id, cantidad: 3, costoUnitario: 2 }, { productoId: galleta.id, cantidad: 12, costoUnitario: 15 }, { productoId: insumo.id, cantidad: 1, costoUnitario: 9 }], obtener);
  afirmar(mezcla.length === 3 && JSON.stringify(mezcla.map((l) => l.origen)) === '[0,1,2]' && mezcla[0]?.unidad === null && mezcla[0]?.factorStock === 1 && mezcla[0]?.costoProducto === 2, 'Los productos normales y los insumos pasan como siempre (sin unidad, factor 1)');
  afirmar(mensajeDe(() => armarLineasDeCompra([{ productoId: galleta.id, cantidad: 2.5, costoUnitario: 15 }], obtener))?.includes('número entero') === true && mensajeDe(() => armarLineasDeCompra([{ productoId: galleta.id, cantidad: 0, costoUnitario: 15 }], obtener)) !== null, 'Una cantidad con decimales o en 0 se rechaza');
  afirmar(mensajeDe(() => armarLineasDeCompra([{ productoId: galleta.id, cantidad: 12, costoUnitario: -1 }], obtener))?.includes('negativo') === true, 'Un costo negativo se rechaza');
  afirmar(subtotalCompraFraccion({ unidadEntera: 'Caja', unidadFraccion: 'Unidad', factor: 12 }, 14, 18) === 21 && importeCompraFraccion({ unidadEntera: 'Caja', unidadFraccion: 'Unidad', factor: 12 }, 14, 0) === 0, 'Subtotal en pantalla: 1 caja y 6 unidades a S/ 14 la caja = S/ 21.00; con 0 unidades, 0');

  // ---- Funciones puras: volver a juntar las líneas (Modificar)
  const fila = (c: Partial<Parameters<typeof colapsarLineasDeCompra>[0][number]> & { productoId: number }) => ({ cantidad: 1, costoUnitario: 0, descripcion: null, unidad: null, factorStock: 1, ...c });
  const colapsadas = colapsarLineasDeCompra(
    [fila({ productoId: gaseosa.id, cantidad: 3, costoUnitario: 2 }), fila({ productoId: galleta.id, cantidad: 5, costoUnitario: 15, unidad: 'Caja', factorStock: 12, descripcion: 'Oferta' }), fila({ productoId: galleta.id, cantidad: 6, costoUnitario: 1.25, unidad: 'Unidad' })],
    () => 12,
  );
  afirmar(colapsadas.length === 2 && colapsadas[1]?.cantidad === 66 && colapsadas[1]?.costoUnitario === 15 && colapsadas[1]?.descripcion === 'Oferta' && colapsadas[0]?.cantidad === 3, 'Las líneas de cajas y de unidades vuelven a ser una: 66 unidades a S/ 15 la caja (y el producto normal igual)');
  const soloUnidad = colapsarLineasDeCompra([fila({ productoId: galleta.id, cantidad: 6, costoUnitario: 1.166667, unidad: 'Unidad' })], () => 12);
  afirmar(soloUnidad[0]?.cantidad === 6 && soloUnidad[0]?.costoUnitario === 14, 'Solo unidades: el costo de la caja se recupera exacto (1.166667 × 12 = S/ 14.00, sin ruido)');
  const soloGramos = colapsarLineasDeCompra([fila({ productoId: arroz.id, cantidad: 500, costoUnitario: 0.0065, unidad: 'Gramo' })], () => 1000);
  afirmar(soloGramos[0]?.cantidad === 500 && soloGramos[0]?.costoUnitario === 6.5, 'Gramos: 500 g a S/ 0.0065 = S/ 6.50 el kg');
  afirmar(cantidadBaseDesdeCasillas(12, 12, 'sueltas', 12) === 24, 'Casillas: [1] caja y [12] unidades pasan a 24 unidades (2 cajas)');
  afirmar(cantidadBaseDesdeCasillas(12, 18, 'enteros', 3) === 42 && cantidadBaseDesdeCasillas(12, 18, 'sueltas', 0) === 12, 'Casillas: con 1 caja y 6 unidades, escribir 3 cajas da 42 y escribir 0 unidades da 12');
  afirmar(cantidadBaseDesdeCasillas(12, 18, 'enteros', 2.9) === 30 && cantidadBaseDesdeCasillas(12, 18, 'enteros', -4) === 6 && cantidadBaseDesdeCasillas(12, 18, 'enteros', Number.NaN) === 6, 'Casillas: los decimales se descartan y lo negativo o vacío vale 0');

  // ---- Compra real: 5 cajas
  const c1 = compras.registrarCompra({ lineas: [{ productoId: galleta.id, cantidad: aUnidadesBase(5, 0, 12), costoUnitario: 15 }], metodoPago: 'efectivo' });
  const d1 = detalles(c1.id);
  afirmar(c1.total === 75 && d1.length === 1 && d1[0]?.unidad === 'Caja' && d1[0]?.cantidad === 5 && d1[0]?.factor_stock === 12 && d1[0]?.subtotal === 75, '5 cajas a S/ 15.00 = S/ 75.00 en una línea (mueve 12 de stock cada una)');
  afirmar(producto(galleta.id).stockActual === 60 && producto(galleta.id).costo === 15, 'El stock sube 60 unidades y el costo de la caja queda en S/ 15.00');
  const m1 = movimientos(c1.id);
  afirmar(m1.length === 1 && m1[0]?.tipo === 'entrada' && m1[0]?.cantidad === 60 && m1[0]?.stock_resultante === 60 && m1[0]?.motivo === 'compra', 'El Kardex anota una entrada de 60 unidades');

  // ---- 1 caja y 6 unidades sueltas
  const c2 = compras.registrarCompra({ lineas: [{ productoId: galleta.id, cantidad: aUnidadesBase(1, 6, 12), costoUnitario: 14 }], metodoPago: 'yape' });
  const d2 = detalles(c2.id);
  afirmar(c2.total === 21 && d2.length === 2 && d2[0]?.subtotal === 14 && d2[1]?.unidad === 'Unidad' && d2[1]?.cantidad === 6 && d2[1]?.subtotal === 7, '1 caja y 6 unidades a S/ 14.00 la caja = S/ 14.00 + S/ 7.00 = S/ 21.00 en 2 líneas');
  afirmar(producto(galleta.id).stockActual === 78 && producto(galleta.id).costo === 14, 'El stock sube 18 (78) y el costo del producto queda en S/ 14.00 (el de la caja, no el de la unidad)');
  const m2 = movimientos(c2.id);
  afirmar(m2.length === 2 && m2[0]?.cantidad === 12 && m2[0]?.stock_resultante === 72 && m2[1]?.cantidad === 6 && m2[1]?.stock_resultante === 78, 'El Kardex anota una entrada de 12 y otra de 6');

  // ---- Solo unidades sueltas: el costo del producto no se vuelve el de la unidad
  const c3 = compras.registrarCompra({ lineas: [{ productoId: galleta.id, cantidad: 6, costoUnitario: 16.5 }], metodoPago: 'efectivo' });
  afirmar(c3.total === 8.25 && producto(galleta.id).costo === 16.5 && producto(galleta.id).stockActual === 84, 'Comprar solo 6 unidades con la caja a S/ 16.50: total S/ 8.25, costo de la caja S/ 16.50, stock 84');

  // ---- Kg y gramos
  const c4 = compras.registrarCompra({ lineas: [{ productoId: arroz.id, cantidad: aUnidadesBase(25, 500, 1000), costoUnitario: 6 }], metodoPago: 'efectivo' });
  const d4 = detalles(c4.id);
  afirmar(c4.total === 153 && d4.length === 2 && d4[0]?.unidad === 'Kg' && d4[0]?.subtotal === 150 && d4[1]?.unidad === 'Gramo' && d4[1]?.subtotal === 3, '25 kg y 500 g de arroz a S/ 6.00 el kg = S/ 150.00 + S/ 3.00 = S/ 153.00');
  afirmar(producto(arroz.id).stockActual === 25500 && producto(arroz.id).costo === 6, 'El arroz queda con 25500 gramos y el kg a S/ 6.00');

  // ---- Mezcla con un producto normal y un insumo
  const c5 = compras.registrarCompra({
    lineas: [{ productoId: gaseosa.id, cantidad: 5, costoUnitario: 2.2 }, { productoId: insumo.id, cantidad: 7, costoUnitario: 9 }, { productoId: galleta.id, cantidad: 12, costoUnitario: 15 }],
    metodoPago: 'efectivo',
  });
  const d5 = detalles(c5.id);
  afirmar(c5.total === 35 && d5.length === 3 && d5[0]?.unidad === null && d5[0]?.factor_stock === 1 && d5[1]?.cantidad === 1 && d5[1]?.unidad === null, 'Una compra mezclada guarda el producto normal y el insumo como siempre y la caja con su unidad (S/ 11 + S/ 9 + S/ 15)');
  afirmar(producto(gaseosa.id).stockActual === 15 && producto(galleta.id).stockActual === 96, 'Cada producto sube su stock en su unidad (15 y 96)');

  // ---- Anular
  const stockAntes = producto(galleta.id).stockActual;
  compras.anularCompra(c2.id, 'error de digitación');
  afirmar(producto(galleta.id).stockActual === stockAntes - 18, 'Anular «1 caja y 6 unidades» retira 18 unidades del stock');
  const ma = movimientos(c2.id).filter((m) => m.motivo === 'anulacion');
  afirmar(ma.length === 2 && ma.every((m) => m.tipo === 'salida') && ma[0]?.cantidad === 12 && ma[1]?.cantidad === 6, 'El Kardex anota las dos salidas de la anulación (12 y 6)');
  afirmar(mensajeDe(() => compras.anularCompra(c2.id))?.includes('ya estaba anulada') === true && producto(galleta.id).stockActual === stockAntes - 18, 'Anular dos veces se rechaza y no retira stock otra vez');
  compras.anularCompra(c4.id);
  afirmar(producto(arroz.id).stockActual === 0, 'Anular 25 kg y 500 g retira 25500 gramos');

  // ---- Anular cuando ya se vendió parte: se rechaza y no deja nada a medias
  const c6 = compras.registrarCompra({ lineas: [{ productoId: arroz.id, cantidad: aUnidadesBase(2, 0, 1000), costoUnitario: 6 }], metodoPago: 'efectivo' });
  ventas.registrarVenta({ lineas: [{ productoId: arroz.id, cantidad: 1500 }], metodoPago: 'efectivo' });
  const rechazoAnular = mensajeDe(() => compras.anularCompra(c6.id));
  afirmar(rechazoAnular !== null && producto(arroz.id).stockActual === 500 && compras.listarRecientes().find((c) => c.id === c6.id)?.estado === 'recibida', 'No se puede anular una compra de la que ya se vendió parte: el stock (500) y la compra quedan intactos');

  // ---- Modificar
  const c7 = compras.registrarCompra({ lineas: [{ productoId: galleta.id, cantidad: aUnidadesBase(5, 0, 12), costoUnitario: 15, descripcion: 'Lote A' }], metodoPago: 'efectivo' });
  const stock7 = producto(galleta.id).stockActual;
  const editar = compras.obtenerParaEditar(c7.id);
  afirmar(editar.lineas.length === 1 && editar.lineas[0]?.cantidad === 60 && editar.lineas[0]?.costoUnitario === 15 && editar.lineas[0]?.descripcion === 'Lote A', 'Al abrir Modificar la compra vuelve en una sola línea: 60 unidades a S/ 15.00 la caja');
  const movs7 = bd.consultar<{ n: number }>('SELECT COUNT(*) AS n FROM movimiento_inventario')[0]?.n ?? 0;
  compras.modificarCompra(c7.id, { metodoPago: 'efectivo', comprobante: 'F001-1', lineas: editar.lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, costoUnitario: l.costoUnitario, descripcion: 'Lote B' })) });
  afirmar(producto(galleta.id).stockActual === stock7 && (bd.consultar<{ n: number }>('SELECT COUNT(*) AS n FROM movimiento_inventario')[0]?.n ?? 0) === movs7, 'Guardar sin cambiar cantidades ni costos no toca el stock ni el Kardex (solo la nota y el comprobante)');
  afirmar(detalles(c7.id)[0]?.descripcion === 'Lote B', 'La nota nueva se guarda');
  const c7b = compras.modificarCompra(c7.id, { metodoPago: 'efectivo', lineas: [{ productoId: galleta.id, cantidad: aUnidadesBase(6, 3, 12), costoUnitario: 15 }] });
  const d7 = detalles(c7.id);
  afirmar(c7b.total === 93.75 && d7.length === 2 && d7[0]?.cantidad === 6 && d7[1]?.cantidad === 3, 'Modificar a 6 cajas y 3 unidades: total S/ 93.75 (90 + 3.75) en 2 líneas');
  afirmar(producto(galleta.id).stockActual === stock7 - 60 + 75, 'El stock queda como si la compra hubiera sido así desde el principio (−60 + 75)');
  const editar2 = compras.obtenerParaEditar(c7.id);
  afirmar(editar2.lineas.length === 1 && editar2.lineas[0]?.cantidad === 75 && editar2.lineas[0]?.costoUnitario === 15, 'Volver a abrirla da 75 unidades a S/ 15.00 la caja');
  // Con ventas posteriores, no se puede bajar de lo que ya salió
  ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: producto(galleta.id).stockActual - 10 }], metodoPago: 'efectivo' });
  const rechazoModificar = mensajeDe(() => compras.modificarCompra(c7.id, { metodoPago: 'efectivo', lineas: [{ productoId: galleta.id, cantidad: 24, costoUnitario: 15 }] }));
  afirmar(rechazoModificar?.includes('ya salieron') === true && rechazoModificar.includes('cajas y') && rechazoModificar.includes('La cantidad mínima es'), 'Si ya se vendió parte, el mensaje dice cuánto salió en cajas y unidades');
  afirmar(producto(galleta.id).stockActual === 10 && detalles(c7.id).length === 2, 'Lo rechazado no cambió nada (stock 10 y 2 líneas)');

  // ---- Los productos normales siguen igual
  const c8 = compras.registrarCompra({ lineas: [{ productoId: gaseosa.id, cantidad: 4, costoUnitario: 2.5 }], metodoPago: 'efectivo' });
  afirmar(detalles(c8.id)[0]?.unidad === null && detalles(c8.id)[0]?.factor_stock === 1 && producto(gaseosa.id).stockActual === 19, 'Una compra de un producto normal guarda su línea sin unidad y con factor 1 (stock 19)');
  compras.anularCompra(c8.id);
  afirmar(producto(gaseosa.id).stockActual === 15, 'Y se anula como siempre (stock 15)');

  // ---- Texto de stock
  afirmar(textoStockDeProducto({ ...producto(arroz.id), stockActual: 1250 }) === '1 kg y 250 gramos' && textoStockDeProducto(producto(gaseosa.id)) === '15', 'El stock se lee «1 kg y 250 gramos» en un producto por fracciones y como siempre en los demás');

  // ---- Revisión del código de las pantallas
  for (const [nombre, ruta] of [['Nueva compra', ['src', 'app', 'compras', 'nueva', 'page.tsx']], ['Modificar compra', ['src', 'app', 'compras', 'editar', 'page.tsx']]] as const) {
    const pagina = leer(...ruta);
    afirmar(pagina.includes('<CantidadCompraFraccion') && pagina.includes("actualizarLinea(linea.productoId, 'cantidad', cantidadBase)"), `${nombre}: un producto por fracciones muestra sus casillas de cajas y unidades`);
    afirmar(pagina.includes('importeLinea(l)') && pagina.includes('importeLinea(linea)') && !pagina.includes('l.cantidad * l.costoUnitario, 0'), `${nombre}: el total suma el importe real de cada línea (cajas y unidades)`);
    afirmar(pagina.includes('Costo por ${linea.fraccion.unidadEntera}') && pagina.includes('Cada {textoUnidad(linea.fraccion.unidadFraccion, 1)} sale a'), `${nombre}: pide el costo por caja y dice cuánto sale cada unidad`);
    afirmar(pagina.includes('textoStockDeProducto(producto)'), `${nombre}: el buscador muestra el stock en cajas y unidades`);
  }
  const editarPagina = leer('src', 'app', 'compras', 'editar', 'page.tsx');
  afirmar(editarPagina.includes('l.cantidad % configuracion.factor === 0'), 'Modificar: con el interruptor apagado se escribe en cajas, salvo que la compra ya tenga unidades sueltas');
  const componente = leer('src', 'components', 'cantidad-compra-fraccion.tsx');
  afirmar(componente.includes('procesarEscrituraFraccion(fraccion,') && componente.includes('onCambiar={(cajas) => onCambiar(cajas * fraccion.factor)}') && componente.includes('Cantidad ({textoUnidad(fraccion.unidadEntera, 2)})'), 'La casilla única en cajas y las dos casillas usan la regla que junta y separa');

  console.log('\n🎉 Compras por fracciones (Etapa 5) funciona.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
