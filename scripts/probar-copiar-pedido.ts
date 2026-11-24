/**
 * Prueba de «Copiar pedido»: qué se copia (productos y cantidades, sin cliente ni forma de pago), cómo se ajusta al
 * stock y a Venta Entero/Fracción, y que el botón y la conexión Pedidos → Nueva venta estén en el código.
 *
 * Uso: npx tsx scripts/probar-copiar-pedido.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cantidadParaCarrito, itemsParaCopiar, textoAvisoCopia } from '../src/core/copiar-pedido';
import type { LineaVentaResumen } from '../src/core/tipos';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}
const leer = (ruta: string) => readFileSync(path.join(__dirname, '..', ruta), 'utf8');

const linea = (productoId: number | undefined, producto: string, cantidad: number, factorStock?: number): LineaVentaResumen =>
  ({ productoId, producto, cantidad, precioUnitario: 1, factorStock }) as LineaVentaResumen;

// ---- itemsParaCopiar
const items = itemsParaCopiar([linea(1, 'INCA KOLA 500ML', 2), linea(2, 'GALLETAS', 1, 12), linea(2, 'GALLETAS', 8, 1), linea(undefined, 'ANTIGUO', 3)]);
afirmar(items.length === 2, 'Un producto por fila y una línea sin producto (dato antiguo) se salta');
const [primero, segundo] = items;
if (!primero || !segundo) throw new Error('❌ Falló: se esperaban 2 productos copiados');
afirmar(primero.productoId === 1 && primero.cantidadBase === 2, 'Producto normal: misma cantidad');
afirmar(segundo.cantidadBase === 20, 'Producto por fracciones: 1 caja de 12 + 8 sueltas = 20 unidades');
afirmar(JSON.stringify(Object.keys(primero).sort()) === '["cantidadBase","nombre","productoId"]', 'Solo se copian producto y cantidad (nada de cliente, pago, precio ni nota)');
afirmar(itemsParaCopiar([]).length === 0, 'Pedido sin líneas: nada que copiar');

// ---- cantidadParaCarrito
const normal = { formaVenta: 'entero', unidadEntera: null, unidadFraccion: null, factorFraccion: null, precioFraccion: null, precioVenta: 3, costo: 2, controlaStock: true, stockActual: 5 } as const;
afirmar(cantidadParaCarrito(2, normal, false)?.cantidad === 2, 'Producto normal con stock: se copia la cantidad');
const corto = cantidadParaCarrito(9, normal, false);
afirmar(corto?.cantidad === 5 && corto.recortada, 'Pide más que el stock: se baja a lo disponible y se marca como ajustada');
afirmar(cantidadParaCarrito(1, { ...normal, stockActual: 0 }, false) === null, 'Sin stock: no se copia');
afirmar(cantidadParaCarrito(40, { ...normal, controlaStock: false, stockActual: 0 }, false)?.cantidad === 40, 'Sin control de stock: se copia todo');

const caja = { formaVenta: 'fraccion', unidadEntera: 'Caja', unidadFraccion: 'Unidad', factorFraccion: 12, precioFraccion: 0.5, precioVenta: 5, costo: 4, controlaStock: true, stockActual: 100 } as const;
const enFraccion = cantidadParaCarrito(20, caja, true);
afirmar(enFraccion?.cantidad === 20 && enFraccion.configuracion !== null, 'Fracciones activas: 20 unidades, en la unidad más pequeña');
const enCajas = cantidadParaCarrito(30, caja, false);
afirmar(enCajas?.cantidad === 2 && enCajas.disponible === 8, 'Fracciones apagadas: 30 unidades = 2 cajas completas (stock 100 = 8 cajas)');
afirmar(cantidadParaCarrito(8, caja, false) === null, 'Fracciones apagadas y menos de una caja: no se copia');

// ---- textoAvisoCopia
afirmar(textoAvisoCopia('V-1', 1, [], []) === 'Se copiaron 1 producto del pedido V-1.', 'Aviso simple (singular)');
const aviso = textoAvisoCopia('V-7', 2, ['A'], ['B']);
afirmar(aviso.includes('2 productos') && aviso.includes('A') && aviso.includes('B'), 'Aviso con productos omitidos y ajustados');

// ---- Código fuente
const hoja = leer('src/components/detalle-venta-sheet.tsx');
const pedidos = leer('src/app/pedidos/page.tsx');
const nueva = leer('src/app/ventas/nueva/page.tsx');
const almacen = leer('src/infraestructura/copiar-pedido/almacen.ts');
afirmar(hoja.includes('onCopiar: () => void;') && hoja.includes('onClick={onCopiar}'), 'El detalle del pedido tiene el botón «Copiar»');
afirmar(pedidos.includes('onCopiar={() => copiarPedido(ventaDetalle)}') && pedidos.includes("router.push('/ventas/nueva')") && pedidos.includes('guardarPedidoACopiar('), 'Pedidos guarda los productos y abre Nueva venta');
const iCopiar = pedidos.indexOf('function copiarPedido');
const cuerpoCopiar = pedidos.slice(iCopiar, pedidos.indexOf('function abrirMenuTicket', iCopiar));
afirmar(!cuerpoCopiar.includes('clienteNombre') && !cuerpoCopiar.includes('metodoPago') && !cuerpoCopiar.includes('anularVenta'), 'Copiar no lleva cliente ni forma de pago, y no toca el pedido original');
afirmar(nueva.includes('tomarPedidoACopiar()') && nueva.includes('setCarrito(lineas)') && nueva.includes("useState<MetodoPago>('efectivo')"), 'Nueva venta arma el carrito con lo copiado y sigue en Efectivo');
afirmar(almacen.includes('sessionStorage.removeItem(CLAVE)'), 'Lo copiado se usa una sola vez');
console.log('\nTodo OK');
