/**
 * Prueba de la Etapa 2 de Nueva venta: editar el subtotal de una línea recalcula el precio por unidad de esa venta
 * (sin descuentos, sin cambiar el precio del producto). Lógica pura + revisión del código fuente.
 *
 * Uso: npx tsx scripts/probar-subtotal-linea.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { calcularPrecioDesdeSubtotal, textoPrecioUnitario } from '../src/core/precio-por-subtotal';
import { calcularGananciaLinea, calcularSubtotalLinea, redondear } from '../src/core/reglas-negocio';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

// ---- El caso de la panadería
const pan = calcularPrecioDesdeSubtotal(1, 6);
afirmar(pan === 0.1667, '6 panes a S/ 1.00 → precio por unidad 0.1667');
afirmar(calcularSubtotalLinea(pan ?? 0, 6) === 1, 'Con ese precio, 6 panes cuestan exactamente S/ 1.00 (con 2 decimales saldría 1.02)');
afirmar(Math.round(0.17 * 6 * 100) / 100 === 1.02, 'Confirmado: redondear a 2 decimales (0.17) daría S/ 1.02, por eso se usan más decimales');
afirmar(calcularPrecioDesdeSubtotal(1.2, 6) === 0.2, 'Si cuadra con 2 decimales, se queda en 2: S/ 1.20 ÷ 6 = 0.20');
afirmar(calcularPrecioDesdeSubtotal(1, 3) === 0.3333 && calcularSubtotalLinea(0.3333, 3) === 1, '3 por S/ 1.00 → 0.3333 y cobra S/ 1.00');
afirmar(calcularPrecioDesdeSubtotal(1, 7) === 0.1429 && calcularSubtotalLinea(0.1429, 7) === 1, '7 por S/ 1.00 → 0.1429 y cobra S/ 1.00');
afirmar(calcularPrecioDesdeSubtotal(10, 1) === 10, 'Una sola unidad: el precio es el subtotal');
afirmar(calcularPrecioDesdeSubtotal(0, 5) === 0, 'Subtotal 0 (regalo) → precio 0');
afirmar(calcularPrecioDesdeSubtotal(1.5, 0.5) === 3, 'Cantidades con decimales (0.5 kg por S/ 1.50) → S/ 3.00 el kilo');

// ---- Datos inválidos
afirmar(calcularPrecioDesdeSubtotal(-1, 6) === null && calcularPrecioDesdeSubtotal(1, 0) === null && calcularPrecioDesdeSubtotal(Number.NaN, 6) === null && calcularPrecioDesdeSubtotal(1, -2) === null, 'Subtotal negativo, cantidad 0 o datos que no son número → null');

// ---- Siempre cuadra: probamos miles de combinaciones
let revisadas = 0;
for (let cantidad = 1; cantidad <= 500; cantidad++) {
  for (let centavos = 0; centavos <= 20000; centavos += 37) {
    const subtotal = centavos / 100;
    const precio = calcularPrecioDesdeSubtotal(subtotal, cantidad);
    if (precio === null || calcularSubtotalLinea(precio, cantidad) !== redondear(subtotal)) {
      throw new Error(`❌ Falló: ${cantidad} unidades por S/ ${subtotal} → precio ${precio} no cuadra`);
    }
    revisadas++;
  }
}
console.log(`✅ En ${revisadas} combinaciones (1 a 500 unidades, hasta S/ 200), cantidad × precio da exactamente el subtotal escrito`);

// ---- Cómo se muestra el precio
afirmar(textoPrecioUnitario(0.1667) === '0.1667' && textoPrecioUnitario(0.2) === '0.20' && textoPrecioUnitario(0.17) === '0.17' && textoPrecioUnitario(3) === '3.00' && textoPrecioUnitario(0.165) === '0.165', 'El precio se muestra con 2 decimales y hasta 4 solo si hacen falta');

// ---- La ganancia queda exacta
afirmar(calcularGananciaLinea(0.1667, 0.1, 6) === 0.4, 'Ganancia de 6 panes a S/ 1.00 con costo 0.10 = S/ 0.40 (antes redondeaba por unidad y daba 0.42)');
afirmar(calcularGananciaLinea(2.5, 1.5, 4) === 4 && calcularGananciaLinea(10, 7.5, 1) === 2.5 && calcularGananciaLinea(3, 5, 2) === -4, 'La ganancia con precios normales no cambia (incluida una pérdida)');

// ---- Código
const raiz = path.join(__dirname, '..');
const leer = (ruta: string) => readFileSync(path.join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const pagina = leer('src/app/ventas/nueva/page.tsx');
afirmar(pagina.includes('{precioEditable ? (\n                      <button\n                        type="button"\n                        onClick={() => abrirEdicionSubtotal(linea)}') && pagina.includes('border-dashed border-bodega'), 'El subtotal de la línea es un botón (borde punteado y lápiz) solo con «Precio editable al vender»');
afirmar(pagina.includes('Toca el monto para cambiarlo') && pagina.includes('{precioEditable && <p'), 'Con el ajuste activo se avisa «Toca el monto para cambiarlo»');
afirmar(pagina.includes('titulo="Editar subtotal"') && pagina.includes('Subtotal de la línea') && pagina.includes('Precio por unidad en esta venta:') && pagina.includes('no cambia'), 'El pop-up muestra «Editar subtotal», el campo y el nuevo precio por unidad, y avisa que el precio del producto no cambia');
afirmar(pagina.includes('>\n                Cancelar\n              </button>') && pagina.includes('onClick={aplicarSubtotal}') && pagina.includes('disabled={precioDelSubtotal === null}'), 'Tiene Cancelar y Aplicar (Aplicar no funciona con un monto inválido)');
const iAplicar = pagina.indexOf('function aplicarSubtotal()');
const aplicar = pagina.slice(iAplicar, pagina.indexOf('function quitarProducto', iAplicar));
afirmar(aplicar.includes('calcularPrecioDesdeSubtotal(Number(editandoSubtotal.texto), linea.cantidad)') && aplicar.includes('precioVenta: precio') && !aplicar.includes('contenedor.productos'), 'Aplicar solo cambia el precio de esa línea en el carrito: no toca el producto en la lista');
afirmar(pagina.includes("if (e.key === 'Enter') aplicarSubtotal();"), 'Enter en el campo también aplica');
afirmar(pagina.includes('precioUnitario: precioEditable ? l.precioVenta : undefined,'), 'El precio de la línea sigue llegando al cálculo y se guarda en la venta');
afirmar(leer('src/components/hoja-opciones.tsx').includes('usarCapaAtras(true, onCerrar)'), '«Atrás» de Android cierra el pop-up de subtotal sin salir de Nueva venta');

console.log('🎉 Todas las pruebas de la Etapa 2 de Nueva venta pasaron.');
