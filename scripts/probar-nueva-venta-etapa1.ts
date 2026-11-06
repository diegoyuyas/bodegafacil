/**
 * Prueba de la Etapa 1 de Nueva venta: botón largo «Revisar y cobrar» con letras grandes y barra fija, y línea de
 * producto simplificada (el precio y la nota se editan tras un toque). Revisión del código fuente (el aspecto real
 * solo se ve en el celular).
 *
 * Uso: npx tsx scripts/probar-nueva-venta-etapa1.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const raiz = path.join(__dirname, '..');
const pagina = readFileSync(path.join(raiz, 'src/app/ventas/nueva/page.tsx'), 'utf8').replace(/\r\n/g, '\n');

// ---- Botón largo y barra fija
const iBarra = pagina.indexOf('{/* Acción principal */}');
const barra = pagina.slice(iBarra);
afirmar(barra.includes('fixed inset-x-0 bottom-0') && barra.includes('border-t border-linea bg-papel'), 'La barra de abajo sigue fija');
afirmar(barra.includes('h-[60px] w-full') && barra.includes('rounded-full bg-bodega text-white'), 'El botón sigue siendo largo y redondeado, ahora más alto (60 px)');
afirmar(barra.includes('text-lg font-bold">Revisar y cobrar</span>') && barra.includes('text-[22px] font-extrabold">{formatearMonto(calculoValido.total, simboloMoneda)}'), '«Revisar y cobrar» va en letra grande y el monto aún más grande');
afirmar(barra.includes("setEtapa('revisando')"), 'El botón sigue llevando a la vista previa (la revisión se mantiene)');
afirmar(barra.includes("carrito.length === 1 ? 'producto' : 'productos'") && barra.includes('textoCantidad(totalUnidades)') && barra.includes("totalUnidades === 1 ? 'unidad' : 'unidades'"), 'Sobre el botón: «N productos · N unidades»');
afirmar(pagina.includes('const totalUnidades = carrito.reduce((suma, l) => suma + l.cantidad, 0);'), 'Las unidades suman las cantidades del carrito');
afirmar(pagina.includes('pb-[calc(10rem+var(--area-segura-abajo))]'), 'Queda espacio abajo para que la barra más alta no tape lo último de la pantalla');

// ---- Línea de producto
const iLista = pagina.indexOf('{carrito.map((linea) => {');
const iFinLista = pagina.indexOf('{errorCalculo &&', iLista);
const linea = pagina.slice(iLista, iFinLista);
afirmar(linea.includes('text-lg font-bold text-tinta">{linea.nombre}') && linea.includes('c/u</p>'), 'La línea muestra el nombre grande y el precio por unidad');
afirmar((linea.match(/h-11 w-11/g) ?? []).length >= 3, '−, + y ✕ miden 44 px (fáciles de tocar)');
afirmar(linea.includes('h-11 w-14') && linea.includes("aria-label={`Cantidad de ${linea.nombre}`}") && linea.includes('escribirCantidad(linea, e.target.value)'), 'La cantidad se sigue pudiendo escribir a mano');
afirmar(linea.includes('text-xl font-extrabold text-tinta') && linea.includes('linea.precioVenta * linea.cantidad'), 'El subtotal de la línea va a la derecha, en grande');
const iSubtotal = linea.indexOf('linea.precioVenta * linea.cantidad');
const iEditar = linea.indexOf('Editar precio o nota');
afirmar(iEditar > iSubtotal, 'Debajo del subtotal queda el enlace «Editar precio o nota»');
afirmar(linea.includes('(precioEditable || descripcionActiva) &&'), 'El enlace solo aparece si «Precio editable al vender» o «Descripción» están activos');
afirmar(linea.includes('setLineaEditandoId(editando ? null : linea.productoId)') && linea.includes('{editando && ('), 'El precio y la nota quedan ocultos hasta tocar el enlace');
const iPanel = linea.indexOf('{editando && (');
const panel = linea.slice(iPanel);
afirmar(panel.includes('{precioEditable && (') && panel.includes('cambiarPrecioLinea(linea.productoId') && panel.includes('{descripcionActiva && (') && panel.includes('cambiarDescripcion(linea.productoId'), 'Al abrirlo se puede editar el precio y la descripción, igual que antes');
afirmar(panel.includes('h-10 w-full rounded-lg border border-linea px-3 text-sm') && !panel.includes('mt-1.5 h-8 w-full'), 'La descripción ocupa todo el ancho (ya no se corta «Descripción (opciona…»)');
afirmar(linea.includes("!editando && linea.descripcion.trim() !== ''"), 'Si la línea ya tiene nota, se ve escrita aunque el panel esté cerrado');
afirmar(!linea.slice(0, iEditar).includes('type="number"'), 'El campo de precio ya no está siempre visible en la línea');

// ---- Lo demás no se tocó
afirmar(pagina.includes("construirVenta(") && pagina.includes('precioUnitario: precioEditable ? l.precioVenta : undefined,'), 'El cálculo y el precio por línea siguen igual');
afirmar(pagina.includes('Método de pago') && pagina.includes("'(opcional)'") && pagina.includes('Buscar o escribir el nombre del cliente'), 'Forma de pago y cliente siguen donde estaban');

console.log('🎉 Todas las pruebas de la Etapa 1 de Nueva venta pasaron.');
