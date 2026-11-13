/**
 * Prueba de los cambios del gráfico de ventas de Inicio: selector «Últimos 7 días» / «Ventas por mes», rectángulo alrededor
 * del gráfico, mensaje flotante con los pedidos al tocar una barra, montos con 2 decimales que no se pasan a la barra vecina
 * y fuera «Producto más vendido».
 *
 * Uso: npx tsx scripts/probar-grafico-inicio.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BaseDatosLocal } from '../src/infraestructura/sqlite/base-datos';
import { CajaRepositorioSqlite } from '../src/infraestructura/sqlite/caja.repositorio';
import { ConfiguracionRepositorioSqlite } from '../src/infraestructura/sqlite/configuracion.repositorio';
import { ProductoRepositorioSqlite } from '../src/infraestructura/sqlite/producto.repositorio';
import { VentaRepositorioSqlite } from '../src/infraestructura/sqlite/venta.repositorio';
import {
  GRAFICO_ALTO_MAXIMO_BARRA,
  GRAFICO_ANCHO,
  GRAFICO_ZONA_MENSAJE,
  calcularDisposicionGrafico,
  descripcionDelGrafico,
  montoGrafico,
  montosEnVertical,
  posicionMensajePedidos,
  textoPedidos,
  ventasPorMes,
  type DiaVentas,
} from '../src/core/ventas-semana';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}
const localizarArchivo = () => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const leer = (...ruta: string[]) => readFileSync(path.join(__dirname, '..', ...ruta), 'utf-8');

async function main() {
  // ---- Montos con 2 decimales y pedidos
  afirmar(montoGrafico(0) === '0.00' && montoGrafico(85.4) === '85.40' && montoGrafico(1234.5) === '1234.50' && montoGrafico(12345.678) === '12345.68' && montoGrafico(0.005) === '0.01', 'Los montos del gráfico llevan siempre 2 decimales («85.40», «1234.50», «12345.68»)');
  afirmar(textoPedidos(1) === '1 pedido' && textoPedidos(0) === '0 pedidos' && textoPedidos(12) === '12 pedidos', 'El mensaje dice «1 pedido», «0 pedidos», «12 pedidos»');

  // ---- Ventas por mes (año actual)
  const meses = ventasPorMes(
    [{ mes: '2026-03', total: 200.005, numeroVentas: 4 }, { mes: '2026-11', total: 55.5, numeroVentas: 2 }, { mes: '2025-12', total: 999, numeroVentas: 9 }],
    '2026-11-10',
  );
  afirmar(meses.length === 12 && meses[0]?.etiqueta === 'ene' && meses[11]?.etiqueta === 'dic' && meses[2]?.nombre === 'marzo' && meses[8]?.nombre === 'septiembre', 'Ventas por mes: 12 barras de enero a diciembre (ene… dic) con su nombre completo');
  afirmar(meses[2]?.total === 200.01 && meses[2]?.numeroVentas === 4 && meses[10]?.total === 55.5 && meses[10]?.numeroVentas === 2, 'Cada mes trae su total (a 2 decimales) y su cantidad de pedidos');
  afirmar(meses.filter((m) => m.total === 0).length === 10 && meses.every((m) => m.fecha.startsWith('2026-')), 'Los meses sin ventas quedan en 0 y lo de otro año no entra');
  afirmar(meses.filter((m) => m.esHoy).length === 1 && meses[10]?.esHoy === true, 'Se marca el mes actual (noviembre)');
  afirmar(ventasPorMes([], '2026-01-31').every((m) => m.total === 0 && m.numeroVentas === 0) && ventasPorMes([], '2026-01-31')[0]?.esHoy === true, 'Sin ventas: 12 barras en 0, con enero como mes actual');

  // ---- Descripción para lectores de pantalla
  afirmar(descripcionDelGrafico(meses, 'S/', 'meses') === 'Ventas por mes de 2026: S/ 255.51 en total, mejor mes marzo con S/ 200.01.', 'Descripción accesible por mes: total y mejor mes');
  afirmar(descripcionDelGrafico(ventasPorMes([], '2026-05-01'), 'S/', 'meses') === 'Ventas por mes: todavía no hay ventas.', 'Descripción accesible por mes sin ventas');

  // ---- Los montos no se pasan a la barra vecina
  const barras = (n: number, total: number): DiaVentas[] => Array.from({ length: n }, (_, i) => ({ fecha: `x${i}`, etiqueta: String(i), total, numeroVentas: 1, esHoy: false }));
  const d7 = calcularDisposicionGrafico(barras(7, 85.4));
  afirmar(!d7.montosVerticales && d7.anchoBarra === 32, 'Últimos 7 días con montos cortos («85.40»): se escriben en horizontal');
  afirmar(!calcularDisposicionGrafico(barras(7, 1234.5)).montosVerticales && calcularDisposicionGrafico(barras(7, 12345.6)).montosVerticales, 'Últimos 7 días: «1234.50» cabe en horizontal; «12345.60» ya no y se escribe de pie');
  const d12 = calcularDisposicionGrafico(barras(12, 1234.5));
  afirmar(d12.montosVerticales && d12.anchoBarra === 20 && d12.alto > d7.alto, 'Ventas por mes con montos de 4 cifras: se escriben de pie (rotados) y el gráfico es más alto');
  afirmar(montosEnVertical(['0.50'], 26.2) === false && montosEnVertical(['10.00'], 26.2) === true, 'Con 12 barras caben 4 caracteres en horizontal, pero «10.00» no');
  // Prueba masiva: ningún monto se pasa de su casilla y todo cabe dentro del gráfico
  let semilla = 987;
  const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
  let revisados = 0;
  for (const n of [7, 12]) {
    for (let k = 0; k < 600; k++) {
      const potencia = 10 ** Math.floor(azar() * 8);
      const lista = barras(n, 0).map((b) => ({ ...b, total: Math.round(azar() * potencia * 100) / 100 }));
      const disp = calcularDisposicionGrafico(lista);
      const mayor = Math.max(0, ...lista.map((b) => (b.total > 0 ? montoGrafico(b.total).length : 0)));
      const anchoHorizontal = mayor * disp.tamanoMonto * 0.6;
      if (!disp.montosVerticales && anchoHorizontal > disp.casilla - 2) throw new Error(`❌ Falló: ${n} barras, monto de ${mayor} caracteres se pasa de su casilla`);
      if (disp.montosVerticales && disp.tamanoMonto > disp.casilla) throw new Error(`❌ Falló: ${n} barras, el monto de pie no cabe en la casilla`);
      // La barra más alta con su monto no entra en la franja del mensaje flotante
      if (disp.baseY - GRAFICO_ALTO_MAXIMO_BARRA - disp.altoMonto < GRAFICO_ZONA_MENSAJE - 0.001) throw new Error('❌ Falló: el monto de la barra más alta invade la franja del mensaje');
      // Todas las barras caben a lo ancho del gráfico
      if (6 + (n - 1) * disp.casilla + disp.anchoBarra > GRAFICO_ANCHO) throw new Error('❌ Falló: las barras se salen del gráfico');
      revisados++;
    }
  }
  afirmar(revisados === 1200, `Prueba masiva: en ${revisados} gráficos al azar (montos de 0.01 a 99 millones) ningún monto se pasa de su barra ni invade el mensaje`);

  // ---- El mensaje flotante queda dentro del gráfico
  const centroIzq = 6 + 20 / 2;
  const centroDer = 6 + 11 * 26.18 + 20 / 2;
  const izq = posicionMensajePedidos(centroIzq, '12 pedidos');
  const der = posicionMensajePedidos(centroDer, '12 pedidos');
  const medio = posicionMensajePedidos(160, '3 pedidos');
  afirmar(izq.x >= 2 && der.x + der.ancho <= GRAFICO_ANCHO - 2 && medio.x >= 2 && medio.x + medio.ancho <= GRAFICO_ANCHO - 2, 'El mensaje de pedidos no se sale del gráfico, ni en la barra del borde izquierdo ni en la del derecho');
  afirmar(izq.punta >= izq.x + 10 && der.punta <= der.x + der.ancho - 10 && Math.abs(medio.punta - 160) < 0.001, 'La puntita del mensaje apunta a su barra (o lo más cerca que se puede en los bordes)');

  // ---- Totales por mes en una base real
  const bd = await BaseDatosLocal.crear({ localizarArchivo });
  const configuracion = new ConfiguracionRepositorioSqlite(bd);
  const productos = new ProductoRepositorioSqlite(bd);
  const caja = new CajaRepositorioSqlite(bd);
  const ventas = new VentaRepositorioSqlite(bd, productos, caja, configuracion);
  const pan = productos.crear({ nombre: 'Pan', precioVenta: 5, costo: 3, stockActual: 1000, stockMinimo: 0, controlaStock: true, unidadMedida: 'unidad' });
  const vender = (fecha: string, cantidad: number) => {
    const venta = ventas.registrarVenta({ lineas: [{ productoId: pan.id, cantidad }], metodoPago: 'efectivo' });
    bd.ejecutar('UPDATE venta SET fecha_hora = ? WHERE id = ?', [`${fecha} 10:00:00`, venta.id]);
    return venta;
  };
  vender('2026-03-02', 2); // 10.00
  vender('2026-03-15', 3); // 15.00
  const anulada = vender('2026-03-20', 10); // 50.00, se anula
  ventas.anularVenta(anulada.id);
  vender('2026-04-01', 1); // 5.00
  vender('2025-12-31', 4); // otro año
  const totales = ventas.totalesPorMes('2026');
  const marzo = totales.find((t) => t.mes === '2026-03');
  afirmar(totales.length === 2 && marzo?.total === 25 && marzo.numeroVentas === 2, 'Marzo: S/ 25.00 en 2 pedidos (la venta anulada de S/ 50.00 no cuenta)');
  afirmar(totales.find((t) => t.mes === '2026-04')?.total === 5 && !totales.some((t) => t.mes.startsWith('2025')), 'Abril: S/ 5.00 y las ventas de otro año no aparecen');
  afirmar(ventas.totalesPorMes('2024').length === 0, 'Un año sin ventas devuelve vacío');
  const barrasMeses = ventasPorMes(totales, '2026-04-10');
  afirmar(barrasMeses[2]?.numeroVentas === 2 && barrasMeses[3]?.numeroVentas === 1 && barrasMeses[3]?.esHoy === true && barrasMeses[0]?.numeroVentas === 0, 'Al tocar marzo diría «2 pedidos», abril «1 pedido» y enero «0 pedidos»');

  // ---- Revisión del código de Inicio y del gráfico
  const inicio = leer('src', 'app', 'page.tsx');
  afirmar(inicio.includes('<option value="dias">Últimos 7 días</option>') && inicio.includes('<option value="meses">Ventas por mes</option>') && inicio.includes('aria-label="Periodo del gráfico de ventas"'), 'Inicio: lista pequeña con «Últimos 7 días» y «Ventas por mes»');
  afirmar(inicio.includes("setVistaGrafico(e.target.value === 'meses' ? 'meses' : 'dias')") && inicio.includes("(vistaGrafico === 'dias' ? diasSemana : mesesAnio)"), 'Inicio: el gráfico cambia según lo elegido');
  afirmar(inicio.includes('<div className="mt-3 rounded-xl border border-linea p-3">') && inicio.includes('<GraficoVentas key={vistaGrafico}'), 'Inicio: el gráfico desplegado va encerrado en un rectángulo');
  afirmar(inicio.includes('contenedor.ventas.totalesPorMes(hoy.slice(0, 4))'), 'Inicio: los meses son los del año actual');
  afirmar(!inicio.includes('Más vendido hoy') && !inicio.includes('productoMasVendido') && !inicio.includes('masVendidoHoy') && !inicio.includes('obtenerLineas'), 'Inicio: se quitó «Producto más vendido» (y su consulta)');
  const grafico = leer('src', 'components', 'grafico-ventas.tsx');
  afirmar(grafico.includes('textoPedidos(elegida.numeroVentas)') && grafico.includes('<MensajePedidos') && grafico.includes('pointerEvents="none"'), 'Gráfico: al tocar una barra sale el mensaje flotante con los pedidos');
  afirmar(grafico.includes("setSeleccion((actual) => (actual === i ? null : i))") && grafico.includes('onClick={() => setSeleccion(null)}'), 'Gráfico: tocar otra vez la barra o fuera del gráfico cierra el mensaje');
  afirmar(grafico.includes('rotate(-90 ${centro} ${y - 4})') && grafico.includes('d.montosVerticales'), 'Gráfico: los montos largos se escriben de pie');
  afirmar(grafico.includes('{monto}') && !grafico.includes('montoCorto'), 'Gráfico: usa los montos con 2 decimales (ya no los abreviados «1.2k»)');
  afirmar(leer('src', 'core', 'repositorios.ts').includes('totalesPorMes(anio: string)'), 'El repositorio de ventas ofrece los totales por mes');

  console.log('\n🎉 El gráfico de ventas de Inicio funciona.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
