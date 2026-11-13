/**
 * Prueba de la Etapa 3 de Venta Entero/Fracción: vender productos por fracciones (1 caja y 8 galletas), el control de
 * stock, el guardado en dos líneas, la anulación, el interruptor apagado y la revisión del código de Nueva venta.
 *
 * Uso: npx tsx scripts/probar-venta-fraccion.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import { CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar } from '../src/core/configuracion';
import { ErrorDeNegocio } from '../src/core/reglas-negocio';
import type { Producto } from '../src/core/tipos';
import {
  aUnidadesBase,
  construirDetallesDeLinea,
  construirVentaFraccion,
  procesarEscrituraFraccion,
  subtotalDeLineaFraccion,
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

interface FilaDetalle {
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  costo_unitario: number;
  subtotal: number;
  ganancia_linea: number;
  descripcion: string | null;
  unidad: string | null;
  factor_stock: number;
}
interface FilaMovimiento {
  tipo: string;
  cantidad: number;
  motivo: string;
  stock_resultante: number;
}

async function main() {
  const bd = await BaseDatosLocal.crear({ localizarArchivo });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);

  const detalles = (ventaId: number) =>
    bd.consultar<FilaDetalle>(
      'SELECT producto_id, cantidad, precio_unitario, costo_unitario, subtotal, ganancia_linea, descripcion, unidad, factor_stock FROM detalle_venta WHERE venta_id = ? ORDER BY id',
      [ventaId],
    );
  const movimientos = (ventaId: number) =>
    bd.consultar<FilaMovimiento>('SELECT tipo, cantidad, motivo, stock_resultante FROM movimiento_inventario WHERE venta_id = ? ORDER BY id', [ventaId]);
  const stockDe = (id: number) => productos.obtenerPorId(id).stockActual;

  // Galleta: caja de 12 a S/ 20, unidad a S/ 2, costo S/ 14 la caja. 248 unidades = 20 cajas y 8 unidades.
  const galleta = productos.crear({
    nombre: 'Galleta Soda', precioVenta: 20, costo: 14, stockActual: 248, stockMinimo: 24, controlaStock: true, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Caja', unidadFraccion: 'Unidad', factorFraccion: 12, precioFraccion: 2,
  });
  const arroz = productos.crear({
    nombre: 'Arroz', precioVenta: 8, costo: 6, stockActual: 5000, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Kg', unidadFraccion: 'Gramo', factorFraccion: 1000, precioFraccion: 0.008,
  });
  const gaseosa = productos.crear({ nombre: 'Inca Kola', precioVenta: 3, costo: 2, stockActual: 20, stockMinimo: 5, controlaStock: true, unidadMedida: 'unidad' });
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(true));

  // ---- Funciones puras: escribir en las dos casillas
  const galletaCfg = { unidadEntera: 'Caja', unidadFraccion: 'Unidad', factor: 12 };
  const e1 = procesarEscrituraFraccion(galletaCfg, 12, 248, 'sueltas', '8');
  afirmar(e1.cantidad === 20 && e1.texto === '8' && e1.aviso === null, '[1] caja, escribo [8] unidades → 20 unidades en total');
  const e2 = procesarEscrituraFraccion(galletaCfg, 20, 248, 'sueltas', '12');
  afirmar(e2.cantidad === 24 && e2.texto === '0', '[1] caja y [12] unidades se reconvierte a [2] cajas y [0] unidades');
  const e3 = procesarEscrituraFraccion(galletaCfg, 20, 248, 'sueltas', '30');
  afirmar(e3.cantidad === 42 && e3.texto === '6', '[1] caja y [30] unidades pasan a [2] cajas y [6] unidades');
  const e4 = procesarEscrituraFraccion(galletaCfg, 12, 248, 'sueltas', '');
  afirmar(e4.cantidad === 12 && e4.texto === '' && e4.aviso === null, 'Borrar las unidades para escribir otro número deja la casilla vacía y las cajas intactas');
  const e5 = procesarEscrituraFraccion(galletaCfg, 12, 248, 'enteros', '');
  afirmar(e5.cantidad === 0 && e5.texto === '' && e5.aviso === null, 'Borrar las cajas cuando no hay unidades deja la línea en [0] [0] (sin aviso, se está escribiendo)');
  const e6 = procesarEscrituraFraccion(galletaCfg, 12, 248, 'enteros', '0');
  afirmar(e6.cantidad === 0 && e6.aviso === 'Pon al menos 1 en alguna casilla.' && e6.texto === '0', 'Escribir 0 en las cajas sin unidades deja [0] [0] y avisa «Pon al menos 1 en alguna casilla.»');
  const e7 = procesarEscrituraFraccion(galletaCfg, 12, 248, 'enteros', '99');
  afirmar(e7.cantidad === 248 && e7.aviso === 'Solo hay 20 cajas y 8 unidades en stock.' && e7.texto === '20', 'Pedir más que el stock lo deja en el stock y avisa «Solo hay 20 cajas y 8 unidades en stock.»');
  const e8 = procesarEscrituraFraccion(galletaCfg, 12, Infinity, 'enteros', '4x5');
  afirmar(e8.cantidad === 540 && e8.texto === '45', 'Las letras se descartan (solo números) y sin control de stock no hay tope');
  const e9 = procesarEscrituraFraccion(galletaCfg, 12, 248, 'enteros', '007');
  afirmar(e9.cantidad === 84 && e9.texto === '7', 'Los ceros de adelante se quitan');
  afirmar(subtotalDeLineaFraccion({ ...galletaCfg, precioEntero: 20, precioFraccion: 2, costoEntero: 14 }, 20) === 36, 'Subtotal de 1 caja y 8 unidades = S/ 36.00 (20 + 8 × 2)');

  // ---- Funciones puras: detalles de una línea
  const dEntero = construirDetallesDeLinea(productos.obtenerPorId(gaseosa.id), { productoId: gaseosa.id, cantidad: 2 }, true);
  afirmar(dEntero.length === 1 && dEntero[0]?.unidad === null && dEntero[0]?.factorStock === 1 && dEntero[0]?.subtotal === 6, 'Un producto Entero genera una sola línea, sin unidad y con factor 1 (como siempre)');
  const dFrac = construirDetallesDeLinea(galleta, { productoId: galleta.id, cantidad: aUnidadesBase(1, 8, 12), precioUnitario: 999 }, true);
  afirmar(dFrac.length === 2 && dFrac[0]?.precioUnitario === 20 && dFrac[1]?.precioUnitario === 2, 'En una venta por fracciones se cobra el precio de la lista aunque llegue otro (no se edita)');
  const calculada = construirVentaFraccion(
    [{ productoId: gaseosa.id, cantidad: 1 }, { productoId: galleta.id, cantidad: 20 }, { productoId: arroz.id, cantidad: 250 }],
    (id) => productos.obtenerPorId(id),
    true,
  );
  afirmar(calculada.detalles.length === 4 && JSON.stringify(calculada.origen) === '[0,1,1,2]', 'Una venta mezclada arma 4 detalles y recuerda de qué línea sale cada uno');
  afirmar(calculada.total === 41 && calculada.gananciaEstimada === 1 + 6 + 6.67 + 0.5, 'Total S/ 41.00 (3 + 20 + 16 + 2) y ganancia 14.17');
  afirmar(mensajeDe(() => construirVentaFraccion([], (id) => productos.obtenerPorId(id), true)) === 'Una venta debe tener al menos un producto.', 'Una venta sin productos se rechaza');
  afirmar(mensajeDe(() => construirDetallesDeLinea(galleta, { productoId: galleta.id, cantidad: 2.5 }, true))?.includes('número entero') === true, 'Una cantidad con decimales en un producto por fracciones se rechaza');
  const sinStock = mensajeDe(() => construirDetallesDeLinea(galleta, { productoId: galleta.id, cantidad: 300 }, true));
  afirmar(sinStock === 'Stock insuficiente de "GALLETA SODA". Disponible: 20 cajas y 8 unidades, pedido: 25 cajas.', 'Sin stock suficiente dice cuántas cajas y unidades hay');

  // ---- Venta real: 1 caja y 8 galletas
  const venta1 = ventas.registrarVenta({
    lineas: [{ productoId: galleta.id, cantidad: aUnidadesBase(1, 8, 12), descripcion: 'Para la fiesta' }],
    metodoPago: 'efectivo',
  });
  const d1 = detalles(venta1.id);
  afirmar(venta1.total === 36 && d1.length === 2, '1 caja y 8 galletas: total S/ 36.00 guardado en 2 líneas');
  afirmar(d1[0]?.unidad === 'Caja' && d1[0]?.cantidad === 1 && d1[0]?.precio_unitario === 20 && d1[0]?.subtotal === 20 && d1[0]?.factor_stock === 12, 'Línea 1: 1 Caja × S/ 20.00 (mueve 12 unidades de stock)');
  afirmar(d1[1]?.unidad === 'Unidad' && d1[1]?.cantidad === 8 && d1[1]?.precio_unitario === 2 && d1[1]?.subtotal === 16 && d1[1]?.factor_stock === 1, 'Línea 2: 8 Unidad × S/ 2.00 (mueve 1 unidad de stock cada una)');
  afirmar(d1[0]?.ganancia_linea === 6 && d1[1]?.ganancia_linea === 6.67 && venta1.gananciaEstimada === 12.67, 'Ganancia: S/ 6.00 la caja y S/ 6.67 las 8 unidades (total 12.67)');
  afirmar(d1[0]?.descripcion === 'Para la fiesta' && d1[1]?.descripcion === null, 'La nota queda solo en la primera línea');
  afirmar(stockDe(galleta.id) === 228, 'El stock baja 20 unidades: 248 → 228 (19 cajas)');
  const m1 = movimientos(venta1.id);
  afirmar(m1.length === 2 && m1[0]?.cantidad === 12 && m1[0]?.stock_resultante === 236 && m1[1]?.cantidad === 8 && m1[1]?.stock_resultante === 228 && m1.every((m) => m.tipo === 'salida' && m.motivo === 'venta'), 'El Kardex anota una salida de 12 y otra de 8 (stock 236 y 228)');

  // ---- [1] caja y [12] galletas = 2 cajas
  const venta2 = ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: procesarEscrituraFraccion(galletaCfg, 12, 228, 'sueltas', '12').cantidad ?? 0 }], metodoPago: 'yape' });
  const d2 = detalles(venta2.id);
  afirmar(venta2.total === 40 && d2.length === 1 && d2[0]?.cantidad === 2 && d2[0]?.unidad === 'Caja', '[1] y [12] se vende como 2 cajas = S/ 40.00 en una sola línea');
  afirmar(stockDe(galleta.id) === 204, 'El stock baja 24: 228 → 204');

  // ---- Solo galletas sueltas con cajas cerradas (la caja se abre sola)
  const venta3 = ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: 5 }], metodoPago: 'efectivo' });
  afirmar(venta3.total === 10 && detalles(venta3.id).length === 1 && detalles(venta3.id)[0]?.unidad === 'Unidad' && stockDe(galleta.id) === 199, '5 galletas sueltas = S/ 10.00 y el stock baja 5 (199)');

  // ---- Kg y gramos
  const venta4 = ventas.registrarVenta({ lineas: [{ productoId: arroz.id, cantidad: aUnidadesBase(2, 500, 1000) }], metodoPago: 'efectivo' });
  const d4 = detalles(venta4.id);
  afirmar(venta4.total === 20 && d4.length === 2 && d4[0]?.unidad === 'Kg' && d4[0]?.subtotal === 16 && d4[1]?.unidad === 'Gramo' && d4[1]?.subtotal === 4, '2 kg y 500 g de arroz = S/ 16.00 + S/ 4.00 = S/ 20.00');
  afirmar(stockDe(arroz.id) === 2500, 'El stock de arroz baja 2500 gramos (5000 → 2500)');

  // ---- Una venta con varios productos y un producto normal
  const ventaMixta = ventas.registrarVenta({
    lineas: [{ productoId: gaseosa.id, cantidad: 2, precioUnitario: 3.5 }, { productoId: galleta.id, cantidad: 12 }],
    metodoPago: 'efectivo',
  });
  const dm = detalles(ventaMixta.id);
  afirmar(ventaMixta.total === 27 && dm.length === 2 && dm[0]?.unidad === null && dm[0]?.precio_unitario === 3.5 && dm[1]?.unidad === 'Caja', 'Mezclar un producto normal (con precio editado) y uno por fracciones funciona: S/ 7.00 + S/ 20.00');
  afirmar(stockDe(gaseosa.id) === 18 && stockDe(galleta.id) === 187, 'Cada producto descuenta su stock en su unidad (18 y 187)');

  // ---- Sin stock suficiente: no se guarda nada
  const ventasAntes = bd.consultar<{ n: number }>('SELECT COUNT(*) AS n FROM venta')[0]?.n ?? 0;
  const stockAntes = stockDe(galleta.id);
  const rechazo = mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: gaseosa.id, cantidad: 1 }, { productoId: galleta.id, cantidad: 500 }], metodoPago: 'efectivo' }));
  afirmar(rechazo?.includes('Stock insuficiente de "GALLETA SODA"') === true, 'Vender más de lo que hay se rechaza con un mensaje claro');
  afirmar((bd.consultar<{ n: number }>('SELECT COUNT(*) AS n FROM venta')[0]?.n ?? 0) === ventasAntes && stockDe(galleta.id) === stockAntes && stockDe(gaseosa.id) === 18, 'Lo rechazado no dejó nada a medias (ni venta ni stock)');
  afirmar(mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: 0 }], metodoPago: 'efectivo' })) !== null, 'Una cantidad en 0 se rechaza');

  // ---- Anular: el stock vuelve
  ventas.anularVenta(venta1.id, 'se equivocó');
  afirmar(stockDe(galleta.id) === 207, 'Anular «1 caja y 8 unidades» devuelve 20 unidades: 187 → 207');
  const ma = movimientos(venta1.id).filter((m) => m.motivo === 'anulacion');
  afirmar(
    ma.length === 2 && ma.every((m) => m.tipo === 'entrada') && ma[0]?.cantidad === 12 && ma[0]?.stock_resultante === 199 && ma[1]?.cantidad === 8 && ma[1]?.stock_resultante === 207,
    'El Kardex anota las dos entradas de la anulación (12 y 8, stock 199 y 207)',
  );
  ventas.anularVenta(venta4.id);
  afirmar(stockDe(arroz.id) === 5000, 'Anular 2 kg y 500 g de arroz devuelve 2500 gramos (stock 5000)');
  ventas.anularVenta(ventaMixta.id);
  afirmar(stockDe(gaseosa.id) === 20 && stockDe(galleta.id) === 219, 'Anular una venta mezclada devuelve cada producto en su unidad (20 y 219)');
  afirmar(mensajeDe(() => ventas.anularVenta(venta1.id))?.includes('ya estaba anulada') === true && stockDe(galleta.id) === 219, 'Anular dos veces se rechaza y no devuelve stock otra vez');

  // ---- Interruptor apagado: el producto por fracciones se vende solo en enteros
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(false));
  const stockOff = stockDe(galleta.id);
  const ventaOff = ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: 2 }], metodoPago: 'efectivo' });
  const dOff = detalles(ventaOff.id);
  afirmar(ventaOff.total === 40 && dOff.length === 1 && dOff[0]?.unidad === 'Caja' && dOff[0]?.cantidad === 2 && dOff[0]?.factor_stock === 12, 'Con el interruptor apagado, 2 cajas = S/ 40.00 en una línea (mueve 12 de stock cada una)');
  afirmar(stockDe(galleta.id) === stockOff - 24, 'Y el stock baja 24 unidades (2 cajas de 12)');
  afirmar(mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: 1.5 }], metodoPago: 'efectivo' }))?.includes('cajas completas') === true, 'Apagado, no se puede vender una cantidad con decimales de cajas');
  const sinStockOff = mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: 100 }], metodoPago: 'efectivo' }));
  afirmar(sinStockOff === 'Stock insuficiente de "GALLETA SODA". Disponible: 16 cajas y 3 unidades, solicitado: 100 cajas.', 'Apagado, pedir más cajas de las que hay avisa cuántas hay («16 cajas y 3 unidades»)');
  const ventaOffPrecio = ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: 1, precioUnitario: 18 }], metodoPago: 'efectivo' });
  afirmar(ventaOffPrecio.total === 18 && detalles(ventaOffPrecio.id)[0]?.precio_unitario === 18, 'Apagado, el precio editable de la caja sigue funcionando (S/ 18.00)');
  ventas.anularVenta(ventaOff.id);
  ventas.anularVenta(ventaOffPrecio.id);
  afirmar(stockDe(galleta.id) === stockOff, 'Anular las ventas hechas con el interruptor apagado devuelve las cajas ×12 (stock como al inicio)');
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(true));

  // ---- Anular después de apagar el interruptor: devuelve lo que se descontó
  const ventaAntesDeApagar = ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: aUnidadesBase(1, 8, 12) }], metodoPago: 'efectivo' });
  configuracionApagar();
  ventas.anularVenta(ventaAntesDeApagar.id);
  afirmar(stockDe(galleta.id) === stockOff, 'Una venta hecha por fracciones se anula bien aunque después se apague el interruptor');
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(true));

  function configuracionApagar() {
    configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(false));
  }

  // ---- Datos de fracción incompletos: no se vende (para no descuadrar el stock)
  bd.ejecutar('UPDATE producto SET factor_fraccion = NULL WHERE id = ?', [galleta.id]);
  const incompleto = mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: galleta.id, cantidad: 12 }], metodoPago: 'efectivo' }));
  afirmar(incompleto?.includes('datos de fracción') === true && incompleto.includes('incompletos') && stockDe(galleta.id) === stockOff, 'Un producto por fracciones con sus datos incompletos no se vende y no toca el stock');
  bd.ejecutar('UPDATE producto SET factor_fraccion = 12 WHERE id = ?', [galleta.id]);

  // ---- Un producto sin control de stock
  const servicio = productos.crear({
    nombre: 'Sin control', precioVenta: 20, costo: 14, stockActual: 0, stockMinimo: 0, controlaStock: false, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Caja', unidadFraccion: 'Unidad', factorFraccion: 12, precioFraccion: 2,
  });
  const ventaSinControl = ventas.registrarVenta({ lineas: [{ productoId: servicio.id, cantidad: 30 }], metodoPago: 'efectivo' });
  afirmar(ventaSinControl.total === 52 && detalles(ventaSinControl.id).length === 2 && stockDe(servicio.id) === 0, 'Sin control de stock vende sin tope (2 cajas y 6 unidades = S/ 52.00) y el stock sigue en 0');

  // ---- Listados
  const paraVoz = productos.listarActivosParaVenta().map((p: Producto) => p.id);
  const paraVenta = productos.listarActivosParaVentaConFracciones().map((p: Producto) => p.id);
  afirmar(!paraVoz.includes(galleta.id) && !paraVoz.includes(arroz.id) && paraVoz.includes(gaseosa.id), 'La venta por voz sigue sin ofrecer los productos por fracciones');
  afirmar(paraVenta.includes(galleta.id) && paraVenta.includes(arroz.id) && paraVenta.includes(gaseosa.id), 'Nueva venta sí ofrece todos (los de fracciones y los normales)');

  // ---- Revisión del código de Nueva venta
  const pagina = leer('src', 'app', 'ventas', 'nueva', 'page.tsx');
  afirmar(pagina.includes('listarActivosParaVentaConFracciones()') && !pagina.includes('listarActivosParaVenta()'), 'Nueva venta pide la lista con productos por fracciones');
  afirmar(pagina.includes('construirVentaFraccion(') && !pagina.includes('construirVenta('), 'El carrito calcula con las reglas de fracciones');
  afirmar(pagina.includes("casillaFraccion(linea, linea.fraccion, 'enteros')") && pagina.includes("casillaFraccion(linea, linea.fraccion, 'sueltas')"), 'Un producto por fracciones muestra dos casillas (cajas y unidades)');
  afirmar(pagina.includes('procesarEscrituraFraccion(config, linea.cantidad, linea.stockDisponible, campo, textoTipeado)'), 'Las casillas usan la regla que junta, reconvierte y limita por stock');
  afirmar(leer('src', 'core', 'venta-fraccion.ts').includes('precioUnitario: opciones.precioEditable && !l.fraccion ? l.precioVenta : undefined'), 'El precio editable no se manda en las líneas por fracciones');
  afirmar(pagina.includes('const puedeEditarPrecio = precioEditable && !linea.fraccion;'), 'Las líneas por fracciones no ofrecen editar precio ni subtotal');
  afirmar(pagina.includes('textoCantidadFraccion(linea.cantidad, linea.fraccion)'), 'La pantalla «Confirmar venta» dice «1 caja y 8 unidades»');
  afirmar(pagina.includes('disponibleParaVenta(producto, ventaFraccionActiva)'), 'El buscador marca «Sin stock» según la unidad con que se vende');
  afirmar(pagina.includes('{!hayFraccion && '), 'La barra inferior no suma cajas con unidades sueltas');
  afirmar(pagina.includes('configuracion ? textoCantidadFraccion(producto.stockActual, configuracion) : undefined'), 'La notificación de stock bajo habla en cajas y unidades');
  const notificaciones = leer('src', 'infraestructura', 'notificaciones', 'notificaciones-navegador.ts');
  afirmar(notificaciones.includes('cantidadTexto?: string') && notificaciones.includes('quedan ${cantidadTexto ?? stockActual}'), 'La notificación acepta el stock como texto');

  console.log('\n🎉 Venta por fracciones (Etapa 3) funciona.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
