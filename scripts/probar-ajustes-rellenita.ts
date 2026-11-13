/**
 * Prueba de dos ajustes reportados con el producto «Rellenita» (caja de 24 unidades a S/ 20.00):
 * 1) en «Precio por Unidad» no se podía borrar para escribir 1: volvía solo a 0.83;
 * 2) el subtotal editado a S/ 1.00 se veía en pantalla, pero la venta se guardaba con 0.83.
 *
 * Uso: npx tsx scripts/probar-ajustes-rellenita.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import { CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar } from '../src/core/configuracion';
import {
  alEscribirPrecioFraccion,
  alSalirPrecioFraccion,
  lineasDeVentaDesdeCarrito,
  precioFraccionSugerido,
  textoPrecioFraccion,
  type PrecioFraccionEstado,
} from '../src/core/venta-fraccion';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const localizarArchivo = () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const leer = (...ruta: string[]) => readFileSync(path.join(__dirname, '..', ...ruta), 'utf-8');

/** Lo que se ve en la casilla del precio: el escrito si es manual; si no, el que se calcula solo (igual que el hook). */
const verEnCasilla = (estado: PrecioFraccionEstado, sugerido: number) => (estado.manual ? estado.texto : textoPrecioFraccion(sugerido));

async function main() {
  // ---- 1. «Precio por Unidad»: se puede borrar y escribir 1
  const sugerido = precioFraccionSugerido(20, 24);
  afirmar(sugerido === 0.83, 'Rellenita: la caja de S/ 20.00 ÷ 24 sugiere S/ 0.83 la unidad');
  let estado: PrecioFraccionEstado = { texto: textoPrecioFraccion(sugerido), manual: false };
  afirmar(verEnCasilla(estado, sugerido) === '0.83', 'Al crear el producto la casilla muestra 0.83 (automático)');
  estado = alEscribirPrecioFraccion('0.8'); // borra el 3
  estado = alEscribirPrecioFraccion('0.'); // borra el 8
  estado = alEscribirPrecioFraccion('0'); // borra el punto
  afirmar(estado.manual && verEnCasilla(estado, sugerido) === '0', 'Borrando de a un dígito se ve «0» y no vuelve 0.83 (la captura del problema)');
  estado = alEscribirPrecioFraccion('');
  afirmar(estado.manual && estado.texto === '' && verEnCasilla(estado, sugerido) === '', 'Borrar todo deja la casilla VACÍA: ya no se recalcula sola mientras se escribe');
  estado = alEscribirPrecioFraccion('1');
  afirmar(estado.texto === '1' && estado.manual && verEnCasilla(estado, sugerido) === '1', 'Escribir 1 queda «1» (antes volvía a 0.83)');
  afirmar(alSalirPrecioFraccion(estado).manual === true && alSalirPrecioFraccion(estado).texto === '1', 'Al salir de la casilla con un 1, se queda en 1');
  const vacio = alSalirPrecioFraccion(alEscribirPrecioFraccion(''));
  afirmar(!vacio.manual && verEnCasilla(vacio, sugerido) === '0.83', 'Si sale de la casilla sin escribir nada, vuelve el precio automático (0.83)');
  afirmar(alEscribirPrecioFraccion('1,5').texto === '1.5' && alEscribirPrecioFraccion('01').texto === '1' && alEscribirPrecioFraccion('0.0045').texto === '0.0045' && alEscribirPrecioFraccion('a1').texto === '1', 'La casilla acepta coma, quita ceros de adelante, deja escribir 0.0045 y descarta letras');
  const gancho = leer('src', 'hooks', 'usar-formulario-fraccion.ts');
  afirmar(gancho.includes('alEscribirPrecioFraccion(texto)') && gancho.includes('terminarPrecioFraccion') && gancho.includes('alSalirPrecioFraccion('), 'El formulario de producto usa estas reglas');
  const productosPagina = leer('src', 'app', 'productos', 'page.tsx');
  afirmar((productosPagina.match(/onTerminar=\{fraccion(Nuevo|Edit)\.terminarPrecioFraccion\}/g) ?? []).length === 2, 'Nuevo y Editar producto avisan al salir de la casilla del precio');
  afirmar(leer('src', 'components', 'campos-fraccion.tsx').includes('onBlur={onTerminar}'), 'La casilla del precio avisa al salir');

  // ---- 2. El subtotal editado se guarda como se ve
  const bd = await BaseDatosLocal.crear({ localizarArchivo });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  configuracion.establecerValor(CLAVE_VENTA_ENTERO_FRACCION, valorParaGuardar(true));
  const rellenita = productos.crear({
    nombre: 'Rellenita', precioVenta: 20, costo: 14, stockActual: 240, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad',
    formaVenta: 'fraccion', unidadEntera: 'Caja', unidadFraccion: 'Unidad', factorFraccion: 24, precioFraccion: 0.83,
  });
  const gaseosa = productos.crear({ nombre: 'Inca Kola', precioVenta: 3, costo: 2, stockActual: 20, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad' });
  const fraccion = { unidadEntera: 'Caja', unidadFraccion: 'Unidad', factor: 24 };

  // Lo que hizo el usuario: 1 unidad de Rellenita y el subtotal editado a S/ 1.00
  const carrito = [{ productoId: rellenita.id, cantidad: 1, precioVenta: 20, descripcion: '', fraccion, subtotalEditado: 1 }];
  const entrada = lineasDeVentaDesdeCarrito(carrito, { precioEditable: true, descripcionActiva: false });
  afirmar(entrada[0]?.subtotalEditado === 1 && entrada[0]?.precioUnitario === undefined, 'Las líneas que se mandan a guardar llevan el subtotal editado (S/ 1.00)');
  const venta = ventas.registrarVenta({ lineas: entrada, metodoPago: 'efectivo' });
  const lineas = bd.consultar<{ cantidad: number; precio_unitario: number; subtotal: number; unidad: string }>('SELECT cantidad, precio_unitario, subtotal, unidad FROM detalle_venta WHERE venta_id = ?', [venta.id]);
  afirmar(venta.total === 1 && lineas.length === 1 && lineas[0]?.unidad === 'Unidad' && lineas[0]?.cantidad === 1 && lineas[0]?.precio_unitario === 1 && lineas[0]?.subtotal === 1, '1 unidad de Rellenita con el subtotal en S/ 1.00 se guarda por S/ 1.00 (antes se guardaba por S/ 0.83)');
  afirmar(productos.obtenerPorId(rellenita.id).stockActual === 239 && productos.obtenerPorId(rellenita.id).precioFraccion === 0.83, 'El stock baja 1 unidad y el precio de la lista de Rellenita no cambia (0.83)');
  // Sin editar
  const sinEditar = ventas.registrarVenta({ lineas: lineasDeVentaDesdeCarrito([{ ...carrito[0]!, subtotalEditado: undefined }], { precioEditable: true, descripcionActiva: false }), metodoPago: 'efectivo' });
  afirmar(sinEditar.total === 0.83, 'Sin editar el subtotal, la unidad cobra el precio de la lista (S/ 0.83)');
  // Otros casos: más unidades, cajas, mezcla con un producto normal con su precio editado, y el ajuste desactivado
  const tres = ventas.registrarVenta({ lineas: lineasDeVentaDesdeCarrito([{ ...carrito[0]!, cantidad: 3, subtotalEditado: 3 }], { precioEditable: true, descripcionActiva: false }), metodoPago: 'efectivo' });
  afirmar(tres.total === 3, '3 unidades con el subtotal en S/ 3.00 se guardan por S/ 3.00');
  const cajaYUnidad = ventas.registrarVenta({ lineas: lineasDeVentaDesdeCarrito([{ ...carrito[0]!, cantidad: 25, subtotalEditado: 20.5 }], { precioEditable: true, descripcionActiva: false }), metodoPago: 'efectivo' });
  afirmar(cajaYUnidad.total === 20.5, '1 caja y 1 unidad con el subtotal en S/ 20.50 se guardan por S/ 20.50');
  const mezcla = ventas.registrarVenta({
    lineas: lineasDeVentaDesdeCarrito(
      [{ ...carrito[0]!, subtotalEditado: 1 }, { productoId: gaseosa.id, cantidad: 2, precioVenta: 2.5, descripcion: 'fría' }],
      { precioEditable: true, descripcionActiva: true },
    ),
    metodoPago: 'efectivo',
  });
  afirmar(mezcla.total === 6, 'Una venta con Rellenita editada (S/ 1.00) y gaseosas con su precio editado (2 × S/ 2.50) cobra S/ 6.00');
  const sinPermiso = lineasDeVentaDesdeCarrito(carrito, { precioEditable: false, descripcionActiva: false });
  afirmar(sinPermiso[0]?.subtotalEditado === undefined, 'Con «Precio editable al vender» apagado no se manda ningún subtotal editado');
  const notas = lineasDeVentaDesdeCarrito([{ productoId: gaseosa.id, cantidad: 1, precioVenta: 3, descripcion: 'fría' }], { precioEditable: false, descripcionActiva: true });
  const sinNotas = lineasDeVentaDesdeCarrito([{ productoId: gaseosa.id, cantidad: 1, precioVenta: 3, descripcion: 'fría' }], { precioEditable: false, descripcionActiva: false });
  afirmar(notas[0]?.descripcion === 'fría' && sinNotas[0]?.descripcion === null, 'Las notas se mandan solo si están activadas');

  // ---- La pantalla: un solo camino para calcular y guardar, y sin el mensaje que no se entendía
  const pagina = leer('src', 'app', 'ventas', 'nueva', 'page.tsx');
  afirmar((pagina.match(/lineasDeVentaDesdeCarrito\(carrito, \{ precioEditable, descripcionActiva \}\)/g) ?? []).length === 2, 'Nueva venta usa la misma función para calcular lo que ves y para guardar lo que cobras');
  afirmar(!pagina.includes('Subtotal editado ·') && !pagina.includes('si cambias la cantidad vuelve'), 'Se quitó el mensaje «Subtotal editado, si cambias la cantidad vuelve el precio de lista»');
  afirmar(pagina.includes('Toca el monto para cambiarlo'), 'Queda solo el aviso de siempre: «Toca el monto para cambiarlo»');

  console.log('\n🎉 Los dos ajustes de Rellenita funcionan.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
