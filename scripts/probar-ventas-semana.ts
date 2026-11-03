/**
 * Prueba del gráfico de ventas de los últimos 7 días y del producto más vendido (Etapa V4b):
 * agrupación por día, días sin ventas, anuladas, cambio de mes/año, empates y textos.
 * Lógica pura: no necesita celular.
 *
 * Uso: npx tsx scripts/probar-ventas-semana.ts
 */
import {
  alturaRelativa,
  descripcionDelGrafico,
  mejorDia,
  montoCorto,
  productoMasVendido,
  textoCantidad,
  totalDeLosDias,
  ventasUltimosDias,
} from '../src/core/ventas-semana';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const hoy = '2026-10-31'; // sábado
const v = (fechaHora: string, total: number, anulada = false) => ({ fechaHora, total, anulada });

// ---- Los 7 días
const vacio = ventasUltimosDias([], hoy);
afirmar(vacio.length === 7, 'Siempre hay 7 días');
afirmar(vacio.map((d) => d.fecha).join(',') === '2026-10-25,2026-10-26,2026-10-27,2026-10-28,2026-10-29,2026-10-30,2026-10-31', 'Del más viejo (hace 6 días) al más nuevo (hoy)');
afirmar(vacio.map((d) => d.etiqueta).join(',') === 'dom,lun,mar,mié,jue,vie,hoy', 'Etiquetas: día de la semana y «hoy» al final');
afirmar(vacio.every((d) => d.total === 0 && d.numeroVentas === 0) && vacio.filter((d) => d.esHoy).length === 1, 'Sin ventas: todo en 0 y solo uno es «hoy»');

const dias = ventasUltimosDias(
  [
    v('2026-10-31 09:15:00', 40),
    v('2026-10-31 18:40:10', 25.5),
    v('2026-10-31 19:00:00', 100, true), // anulada: no cuenta
    v('2026-10-29 12:00:00', 80),
    v('2026-10-25 00:00:01', 10), // primer día de la ventana
    v('2026-10-24 23:59:59', 999), // fuera de la ventana (hace 7 días)
    v('2026-11-01 00:00:00', 999), // futuro (reloj cambiado): fuera
  ],
  hoy,
);
const total = (fecha: string) => dias.find((d) => d.fecha === fecha)?.total;
afirmar(total('2026-10-31') === 65.5 && dias[6]?.numeroVentas === 2, 'Hoy suma sus ventas (40 + 25.50) y cuenta 2, sin la anulada');
afirmar(total('2026-10-29') === 80 && total('2026-10-25') === 10, 'Otros días suman sus ventas (también el primero de la ventana)');
afirmar(total('2026-10-30') === 0 && total('2026-10-28') === 0 && total('2026-10-27') === 0, 'Los días sin ventas quedan en 0 (no se saltan)');
afirmar(totalDeLosDias(dias) === 155.5 && !dias.some((d) => d.total >= 999), 'Lo de fuera de la ventana (hace 7 días y el futuro) no se cuenta');
afirmar(ventasUltimosDias([v('2026-10-31 10:00:00', 0.1), v('2026-10-31 10:05:00', 0.2)], hoy)[6]?.total === 0.3, 'El total del día se redondea (0.1 + 0.2 = 0.30)');

// ---- Cambio de mes y año; año bisiesto
const enero = ventasUltimosDias([v('2026-12-31 22:00:00', 30), v('2027-01-02 08:00:00', 50)], '2027-01-02');
afirmar(enero.map((d) => d.fecha).join(',') === '2026-12-27,2026-12-28,2026-12-29,2026-12-30,2026-12-31,2027-01-01,2027-01-02', 'Cambio de año: la ventana cruza del 27/12 al 02/01');
afirmar(enero[4]?.total === 30 && enero[6]?.total === 50, 'Cambio de año: cada venta cae en su día');
afirmar(ventasUltimosDias([], '2028-03-02').map((d) => d.fecha).slice(0, 3).join(',') === '2028-02-25,2028-02-26,2028-02-27', 'Año bisiesto: febrero tiene 29 días');
afirmar(ventasUltimosDias([], hoy, 3).length === 3, 'Se puede pedir otra cantidad de días');

// ---- Zona horaria: se agrupa por el día local escrito en la venta, sin convertir
afirmar(ventasUltimosDias([v('2026-10-31 23:59:59', 20), v('2026-10-30 00:00:00', 5)], hoy).filter((d) => d.total > 0).map((d) => `${d.fecha}:${d.total}`).join('|') === '2026-10-30:5|2026-10-31:20', 'Zona horaria: 23:59 cuenta en su día y 00:00 en el siguiente (sin correrse)');

// ---- Mejor día, alturas y textos
afirmar(mejorDia(dias)?.fecha === '2026-10-29', 'Mejor día: el de mayor venta');
afirmar(mejorDia(vacio) === null, 'Sin ventas no hay mejor día');
afirmar(mejorDia([{ fecha: 'a', etiqueta: 'lun', total: 50, numeroVentas: 1, esHoy: false }, { fecha: 'b', etiqueta: 'hoy', total: 50, numeroVentas: 1, esHoy: true }])?.etiqueta === 'hoy', 'Empate de mejor día: gana el más reciente');
afirmar(alturaRelativa(80, 80) === 1 && alturaRelativa(40, 80) === 0.5, 'Altura: el día más alto llena la barra y la mitad es la mitad');
afirmar(alturaRelativa(0, 80) === 0 && alturaRelativa(5, 0) === 0, 'Altura: sin ventas es 0 (y sin máximo no divide entre cero)');
afirmar(alturaRelativa(1, 1000) === 0.04, 'Altura: un día con muy pocas ventas sigue siendo visible (mínimo 4 %)');
afirmar(montoCorto(0) === '0' && montoCorto(85.4) === '85' && montoCorto(245.6) === '246' && montoCorto(999.4) === '999', 'Monto corto: menos de mil va entero');
afirmar(montoCorto(1000) === '1k' && montoCorto(1234) === '1.2k' && montoCorto(9950) === '10k' && montoCorto(12400) === '12k', 'Monto corto: miles con «k»');
afirmar(descripcionDelGrafico(vacio, 'S/') === 'Ventas de los últimos 7 días: todavía no hay ventas.', 'Descripción accesible sin ventas');
afirmar(descripcionDelGrafico(dias, 'S/') === 'Ventas de los últimos 7 días: S/ 155.50 en total, hoy S/ 65.50, mejor día jue con S/ 80.00.', 'Descripción accesible con ventas (total, hoy y mejor día)');

// ---- Producto más vendido
const linea = (producto: string, cantidad: number, precioUnitario?: number) => ({ producto, cantidad, precioUnitario });
afirmar(productoMasVendido([]) === null, 'Sin ventas no hay producto más vendido');
const top = productoMasVendido([linea('Gaseosa', 2, 4), linea('Arroz', 1, 5), linea('Gaseosa', 3, 4), linea('Pan', 4, 0.5)]);
afirmar(top?.producto === 'Gaseosa' && top.cantidad === 5 && top.ingreso === 20, 'Suma las líneas del mismo producto (2 + 3 gaseosas = 5, S/ 20)');
afirmar(productoMasVendido([linea('Pan', 10, 0.5), linea('Arroz', 10, 5)])?.producto === 'Arroz', 'Empate en cantidad: gana el que dejó más dinero');
afirmar(productoMasVendido([linea('Pan', 10, 1), linea('Azúcar', 10, 1), linea('Leche', 10, 1)])?.producto === 'Azúcar', 'Empate total: gana el nombre que va primero (resultado estable)');
afirmar(productoMasVendido([linea('Pan', 10), linea('Arroz', 10)])?.producto === 'Arroz', 'Sin precios, un empate se resuelve por nombre y no falla');
afirmar(productoMasVendido([linea('Queso', 1.5, 20), linea('Queso', 0.25, 20), linea('Pan', 1, 0.5)])?.cantidad === 1.75, 'Cantidades con decimales (kg) se suman sin errores');
afirmar(productoMasVendido([linea('Pan', 0, 1), linea('Pan', -2, 1)]) === null, 'Cantidades en 0 o negativas se ignoran');
afirmar(textoCantidad(12) === '12' && textoCantidad(1.5) === '1.5' && textoCantidad(0.25) === '0.25' && textoCantidad(1.7500000001) === '1.75', 'Texto de cantidad sin ceros de más');

console.log('🎉 Todas las pruebas de V4b pasaron.');
