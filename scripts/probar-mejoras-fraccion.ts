/**
 * Prueba de las mejoras de Venta Entero/Fracción: precio exacto del gramo, escribir [0] [1], subtotal editable en productos
 * por fracciones, monto mínimo de 0.10 en TODA venta y ticket de una línea por producto por fracciones.
 *
 * Uso: npx tsx scripts/probar-mejoras-fraccion.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import { CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar } from '../src/core/configuracion';
import { ErrorDeNegocio, MONTO_MINIMO_VENTA, redondear, validarMontoMinimoVenta } from '../src/core/reglas-negocio';
import {
  aUnidadesBase,
  construirLineasVentaFraccion,
  precioFraccionSugerido,
  procesarEscrituraFraccion,
  repartirSubtotalFraccion,
  subtotalDeLineaFraccion,
  type ConfiguracionFraccion,
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

async function main() {
  // ---- 1. El precio del gramo ya no se redondea de más
  afirmar(precioFraccionSugerido(4.5, 1000) === 0.0045, 'Kg a S/ 4.50 → el gramo vale S/ 0.0045 (antes salía 0.005)');
  afirmar(precioFraccionSugerido(0.5, 1000) === 0.0005 && precioFraccionSugerido(7, 1000) === 0.007 && precioFraccionSugerido(0.4, 1000) === 0.0004, 'Kg a S/ 0.50 → 0.0005; a S/ 7.00 → 0.007; a S/ 0.40 → 0.0004');
  afirmar(precioFraccionSugerido(20, 12) === 1.67 && precioFraccionSugerido(100, 1000) === 0.1 && precioFraccionSugerido(24, 12) === 2, 'La galleta sigue en 2 decimales (S/ 20 ÷ 12 = 1.67) y S/ 0.10 el gramo no cambia');
  const manzana: ConfiguracionFraccion = { unidadEntera: 'Kg', unidadFraccion: 'Gramo', factor: 1000, precioEntero: 4.5, precioFraccion: precioFraccionSugerido(4.5, 1000), costoEntero: 3 };
  afirmar(subtotalDeLineaFraccion(manzana, aUnidadesBase(1, 900, 1000)) === 8.55, 'Manzana [1] kg y [900] g = S/ 8.55 (antes S/ 9.00)');
  afirmar(subtotalDeLineaFraccion(manzana, aUnidadesBase(0, 250, 1000)) === 1.13 && subtotalDeLineaFraccion(manzana, aUnidadesBase(2, 0, 1000)) === 9, 'Manzana: 250 g = S/ 1.13 y 2 kg = S/ 9.00');

  // ---- 2. [0] [1]: se puede escribir en cualquier orden
  const galleta = { unidadEntera: 'Caja', unidadFraccion: 'Unidad', factor: 12 };
  const a1 = procesarEscrituraFraccion(galleta, 12, 248, 'enteros', '0');
  afirmar(a1.cantidad === 0 && a1.texto === '0' && a1.aviso === 'Pon al menos 1 en alguna casilla.', '[1] [0] → escribo 0 en Cajas: queda [0] [0] y avisa «Pon al menos 1 en alguna casilla.»');
  const a2 = procesarEscrituraFraccion(galleta, a1.cantidad ?? -1, 248, 'sueltas', '1');
  afirmar(a2.cantidad === 1 && a2.aviso === null && a2.texto === '1', 'Luego escribo 1 en Unidades: queda [0] [1] (1 galleta)');
  const b1 = procesarEscrituraFraccion(galleta, 12, 248, 'sueltas', '1');
  const b2 = procesarEscrituraFraccion(galleta, b1.cantidad ?? -1, 248, 'enteros', '0');
  afirmar(b1.cantidad === 13 && b2.cantidad === 1, 'En el otro orden también: [1] [1] y luego 0 en Cajas deja [0] [1]');
  afirmar(procesarEscrituraFraccion(galleta, 0, 248, 'enteros', '').cantidad === 0, 'Dejar las dos casillas vacías mientras se escribe también deja la cantidad en 0');
  const m1 = procesarEscrituraFraccion({ unidadEntera: 'Kg', unidadFraccion: 'Gramo', factor: 1000 }, 0, 20000, 'sueltas', '0001');
  afirmar(m1.cantidad === 1 && m1.texto === '1', 'Manzana: escribir [0] [0001] es 1 gramo');

  // ---- 3. Repartir un subtotal editado
  const lineasConSubtotal = (config: ConfiguracionFraccion, base: number, subtotal: number) => {
    const precios = repartirSubtotalFraccion(config, base, subtotal);
    return construirLineasVentaFraccion({ ...config, ...precios }, base);
  };
  const suma = (lineas: { subtotal: number }[]) => redondear(lineas.reduce((s, l) => s + l.subtotal, 0));
  const l8 = lineasConSubtotal(manzana, aUnidadesBase(1, 900, 1000), 8);
  afirmar(l8.length === 2 && suma(l8) === 8 && l8[0]?.subtotal === 4.21 && l8[1]?.subtotal === 3.79, 'Manzana [1] [900] de S/ 8.55 a S/ 8.00: 1 kg a S/ 4.21 + 900 g a S/ 3.79 = S/ 8.00 exacto');
  afirmar(lineasConSubtotal(manzana, aUnidadesBase(3, 0, 1000), 12).length === 1 && suma(lineasConSubtotal(manzana, aUnidadesBase(3, 0, 1000), 12)) === 12, 'Solo kg: 3 kg a S/ 12.00 → el precio es 12 ÷ 3 = 4.00');
  afirmar(suma(lineasConSubtotal(manzana, aUnidadesBase(0, 700, 1000), 3.33)) === 3.33, 'Solo gramos: 700 g a S/ 3.33 suma justo 3.33');
  afirmar(suma(lineasConSubtotal(manzana, aUnidadesBase(1, 900, 1000), 0.01)) === 0.01 && suma(lineasConSubtotal(manzana, aUnidadesBase(1, 900, 1000), 0)) === 0, 'Un subtotal muy chico (0.01) o 0 también se reparte sin descuadrar');
  afirmar(suma(lineasConSubtotal(manzana, aUnidadesBase(1, 900, 1000), 20)) === 20, 'Un subtotal mayor al de la lista (S/ 20.00) también suma justo');
  const galletaCfg: ConfiguracionFraccion = { ...galleta, precioEntero: 20, precioFraccion: 2, costoEntero: 14 };
  afirmar(suma(lineasConSubtotal(galletaCfg, aUnidadesBase(2, 5, 12), 45)) === 45 && suma(lineasConSubtotal(galletaCfg, aUnidadesBase(2, 5, 12), 45.5)) === 45.5, 'Galleta [2] [5] a S/ 45.00 y a S/ 45.50: suma justo');
  const gratis: ConfiguracionFraccion = { ...galletaCfg, precioEntero: 0, precioFraccion: 0 };
  afirmar(suma(lineasConSubtotal(gratis, aUnidadesBase(1, 3, 12), 5)) === 5, 'Aunque el precio de lista sea 0, el subtotal escrito se cobra completo');
  // Prueba masiva: nunca descuadra
  let semilla = 12345;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
  let casos = 0;
  for (let n = 0; n < 4000; n++) {
    const factor = [2, 3, 6, 10, 12, 24, 100, 1000][Math.floor(azar() * 8)] ?? 12;
    const enteros = Math.floor(azar() * 12);
    const sueltas = Math.floor(azar() * factor);
    if (enteros === 0 && sueltas === 0) continue;
    const precioEntero = redondear(azar() * 50);
    const config: ConfiguracionFraccion = { unidadEntera: 'Caja', unidadFraccion: 'Unidad', factor, precioEntero, precioFraccion: precioFraccionSugerido(precioEntero, factor), costoEntero: redondear(precioEntero * 0.6) };
    const deseado = redondear(azar() * 200);
    const obtenido = suma(lineasConSubtotal(config, aUnidadesBase(enteros, sueltas, factor), deseado));
    if (obtenido !== deseado) throw new Error(`❌ Falló: factor ${factor}, [${enteros}][${sueltas}], lista ${precioEntero}: quise ${deseado} y salió ${obtenido}`);
    casos++;
  }
  afirmar(casos > 3000, `Prueba masiva: ${casos} subtotales editados al azar suman exactamente lo escrito`);

  // ---- 4. Monto mínimo 0.10 en toda venta
  afirmar(MONTO_MINIMO_VENTA === 0.1 && mensajeDe(() => validarMontoMinimoVenta(0.1)) === null && mensajeDe(() => validarMontoMinimoVenta(0.09)) === 'El monto total de la venta debe ser de 0.10 o más.' && mensajeDe(() => validarMontoMinimoVenta(0)) !== null, 'La regla: 0.10 sí se puede; 0.09 y 0.00 no («El monto total de la venta debe ser de 0.10 o más.»)');

  const bd = await BaseDatosLocal.crear({ localizarArchivo });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(true));
  const producto = productos.crear({
    nombre: 'Manzana', precioVenta: 4.5, costo: 3, stockActual: 20000, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Kg', unidadFraccion: 'Gramo', factorFraccion: 1000, precioFraccion: 0.0045,
  });
  const galletas = productos.crear({
    nombre: 'Galleta', precioVenta: 20, costo: 14, stockActual: 248, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Caja', unidadFraccion: 'Unidad', factorFraccion: 12, precioFraccion: 2,
  });
  const dulce = productos.crear({ nombre: 'Caramelo', precioVenta: 0.05, costo: 0.02, stockActual: 100, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad' });
  const pan = productos.crear({ nombre: 'Pan', precioVenta: 0.5, costo: 0.3, stockActual: 100, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad' });
  const ventasHechas = () => bd.consultar<{ n: number }>('SELECT COUNT(*) AS n FROM venta')[0]?.n ?? 0;
  const stock = (id: number) => productos.obtenerPorId(id).stockActual;

  const v0 = ventasHechas();
  const uno = mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 1 }], metodoPago: 'efectivo' }));
  afirmar(uno === 'El monto total de la venta debe ser de 0.10 o más.' && ventasHechas() === v0 && stock(producto.id) === 20000, '1 gramo de manzana (S/ 0.0045 = S/ 0.00): se rechaza y no se guarda nada ni se toca el stock');
  const g21 = mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 21 }], metodoPago: 'efectivo' }));
  const v22 = ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 22 }], metodoPago: 'efectivo' });
  afirmar(g21 !== null && v22.total === 0.1 && stock(producto.id) === 19978, '21 g (S/ 0.09) se rechazan y 22 g (S/ 0.10) se cobran: el mínimo en la manzana son 22 gramos');
  // Producto normal: con el subtotal editado a 0.01 también
  const normalBajo = mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: pan.id, cantidad: 1, precioUnitario: 0.01 }], metodoPago: 'efectivo' }));
  afirmar(normalBajo === 'El monto total de la venta debe ser de 0.10 o más.' && stock(pan.id) === 100, 'Un producto normal con el subtotal editado a S/ 0.01 también se rechaza');
  const dulces = ventas.registrarVenta({ lineas: [{ productoId: dulce.id, cantidad: 2 }], metodoPago: 'efectivo' });
  afirmar(dulces.total === 0.1 && stock(dulce.id) === 98, 'Dos caramelos de S/ 0.05 = S/ 0.10 se cobran (el mínimo es del total, no de cada producto)');
  const unSoloDulce = mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: dulce.id, cantidad: 1 }], metodoPago: 'efectivo' }));
  afirmar(unSoloDulce !== null && stock(dulce.id) === 98, 'Un solo caramelo de S/ 0.05 se rechaza');
  const mezcla = ventas.registrarVenta({ lineas: [{ productoId: pan.id, cantidad: 1, precioUnitario: 0.01 }, { productoId: galletas.id, cantidad: 12 }], metodoPago: 'efectivo' });
  afirmar(mezcla.total === 20.01, 'Una línea chica no molesta si el total de la venta llega a S/ 0.10 (S/ 0.01 + S/ 20.00)');
  afirmar(mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: pan.id, cantidad: 1, precioUnitario: 0 }], metodoPago: 'efectivo' })) !== null, 'Una venta de S/ 0.00 también se rechaza');

  // ---- 5. Subtotal editado en la venta real (manzana [1] kg y [900] g)
  const sinEditar = ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: aUnidadesBase(1, 900, 1000) }], metodoPago: 'efectivo' });
  afirmar(sinEditar.total === 8.55, 'Sin editar, la manzana [1] [900] cobra S/ 8.55 (antes S/ 9.00)');
  const stockAntes = stock(producto.id);
  const editada = ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: aUnidadesBase(1, 900, 1000), subtotalEditado: 8 }], metodoPago: 'efectivo' });
  const filas = bd.consultar<{ cantidad: number; precio_unitario: number; subtotal: number; ganancia_linea: number; unidad: string }>('SELECT cantidad, precio_unitario, subtotal, ganancia_linea, unidad FROM detalle_venta WHERE venta_id = ? ORDER BY id', [editada.id]);
  afirmar(editada.total === 8 && filas.length === 2 && redondear(filas.reduce((s, f) => s + f.subtotal, 0)) === 8, 'Con el subtotal editado a S/ 8.00 la venta cobra justo S/ 8.00 en 2 líneas (kg y gramos)');
  afirmar(filas[0]?.unidad === 'Kg' && filas[0]?.subtotal === 4.21 && filas[1]?.unidad === 'Gramo' && filas[1]?.subtotal === 3.79, '1 kg a S/ 4.21 y 900 g a S/ 3.79 (reparto en proporción)');
  afirmar(editada.gananciaEstimada === 2.3 && stockAntes - stock(producto.id) === 1900, 'La ganancia es lo cobrado menos el costo (S/ 2.30) y el stock baja 1900 gramos como siempre');
  afirmar(productos.obtenerPorId(producto.id).precioVenta === 4.5 && productos.obtenerPorId(producto.id).precioFraccion === 0.0045, 'Los precios de la lista de la manzana no cambian');
  const soloKg = ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 3000, subtotalEditado: 12 }], metodoPago: 'efectivo' });
  afirmar(soloKg.total === 12, 'Solo kg: 3 kg a S/ 12.00 (en vez de S/ 13.50)');
  ventas.anularVenta(editada.id);
  afirmar(stock(producto.id) === stockAntes - 3000, 'Anular la venta editada devuelve los 1900 gramos');
  afirmar(mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 1000, subtotalEditado: -2 }], metodoPago: 'efectivo' }))?.includes('negativo') === true, 'Un subtotal negativo se rechaza');
  const editadaBaja = mensajeDe(() => ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 1000, subtotalEditado: 0.05 }], metodoPago: 'efectivo' }));
  afirmar(editadaBaja === 'El monto total de la venta debe ser de 0.10 o más.', 'Un subtotal editado a S/ 0.05 en un producto por fracciones también se rechaza (mínimo 0.10)');
  const conOtro = ventas.registrarVenta({ lineas: [{ productoId: producto.id, cantidad: 1000, subtotalEditado: 0.05 }, { productoId: pan.id, cantidad: 1 }], metodoPago: 'efectivo' });
  afirmar(conOtro.total === 0.55, 'El mismo subtotal de S/ 0.05 junto a otro producto (S/ 0.50) sí pasa: el total es S/ 0.55');

  // ---- 6. Revisión del código de Nueva venta
  const pagina = leer('src', 'app', 'ventas', 'nueva', 'page.tsx');
  afirmar(leer('src', 'core', 'venta-fraccion.ts').includes('subtotalEditado: opciones.precioEditable && l.fraccion ? l.subtotalEditado : undefined'), 'La función que arma las líneas manda el subtotal editado de las líneas por fracciones');
  afirmar(pagina.includes('const puedeEditarSubtotal = precioEditable;') && pagina.includes('{puedeEditarSubtotal ? ('), 'El monto de una línea por fracciones se puede tocar con «Precio editable al vender»');
  afirmar(pagina.includes('if (linea.fraccion) {') && pagina.includes('subtotalEditado: redondear(subtotal)'), 'Al aplicar el subtotal de una línea por fracciones se guarda en la línea');
  afirmar(pagina.includes('{ ...l, cantidad, subtotalEditado: undefined }') && pagina.includes('subtotalEditado: undefined } : l,'), 'Si se cambia la cantidad, el subtotal editado se borra y vuelve el precio de lista');
  afirmar(pagina.includes('{errorCalculo && <p className="mt-2 text-sm text-alerta">{errorCalculo}</p>}'), 'El aviso del monto mínimo se muestra bajo el carrito, igual que los demás avisos');
  afirmar(leer('src', 'core', 'venta-fraccion.ts').includes('validarMontoMinimoVenta(subtotal);'), 'El mínimo de 0.10 se revisa al armar toda venta (pantalla y base de datos usan lo mismo)');

  console.log('\n🎉 Las mejoras de Venta Entero/Fracción funcionan.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
