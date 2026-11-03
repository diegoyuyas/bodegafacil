/**
 * Prueba del resumen, la antigüedad y el orden de la pantalla de Fiados (Etapa F1).
 * Lógica pura: no necesita base de datos ni celular.
 *
 * Uso: npx tsx scripts/probar-fiados-resumen.ts
 */
import {
  calcularResumenFiados,
  construirFilasFiado,
  estaVencido,
  filtrarSoloVencidos,
  nivelAntiguedad,
  ordenarFilasFiado,
  textoAntiguedad,
} from '../src/core/fiados-resumen';
import type { Cliente, DeudaClienteItem } from '../src/core/tipos';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

function cliente(id: number, nombre: string, saldo: number, ultimoPago: string | null = null): Cliente {
  return { id, nombre, documento: null, telefono: null, direccion: null, saldoPendiente: saldo, fechaUltimoPago: ultimoPago, ultimoRecordatorioEn: null, fechaCompromiso: null, activo: true, creadoEn: '2026-01-01 08:00:00' };
}

function item(clienteId: number, total: number, dias: number, vencido = 0): DeudaClienteItem {
  return { clienteId, nombre: `c${clienteId}`, telefono: null, deuda0a7: 0, deuda8a30: total - vencido, deuda31omas: vencido, total, cantidadDeudas: 1, diasMasAntigua: dias };
}

// ---- Niveles y textos (dorado = 15, rojo/vencido = más de 30)
afirmar(nivelAntiguedad(0) === 'normal' && nivelAntiguedad(14) === 'normal', '0 a 14 días: normal (gris)');
afirmar(nivelAntiguedad(15) === 'aviso' && nivelAntiguedad(30) === 'aviso', '15 a 30 días: aviso (dorado)');
afirmar(nivelAntiguedad(31) === 'vencido' && nivelAntiguedad(120) === 'vencido', 'Más de 30 días (31+): vencido (rojo)');
afirmar(nivelAntiguedad(null) === 'normal', 'Sin dato de antigüedad: normal');
afirmar(textoAntiguedad(0) === 'Hoy' && textoAntiguedad(1) === 'Ayer' && textoAntiguedad(3) === 'Hace 3 días', 'Textos: Hoy, Ayer, Hace N días');
afirmar(textoAntiguedad(20) === 'Hace 20 días', 'Dorado muestra los días exactos');
afirmar(textoAntiguedad(45) === 'Hace 45 días · Vencido', 'Vencido añade la palabra (no depende solo del color)');
afirmar(textoAntiguedad(null) === '', 'Sin dato: sin etiqueta');

// ---- Datos de ejemplo
const ana = cliente(1, 'Ana', 50, '2026-10-28 10:00:00'); // deuda de 2 días
const beto = cliente(2, 'Beto', 120.5, '2026-09-01 09:00:00'); // 10 días y 40 días (parte vencida)
const carla = cliente(3, 'Carla', 30); // 20 días, nunca pagó
const dino = cliente(4, 'Dino', 0, '2026-10-29 18:00:00'); // ya pagó todo
const eva = cliente(5, 'Eva', 80, '2026-10-20 12:00:00'); // sin datos de antigüedad (saldo antiguo sin deuda asociada)

const antiguedad: DeudaClienteItem[] = [
  item(1, 50, 2),
  item(2, 120.5, 40, 100),
  item(3, 30, 20),
  item(9, 999, 90, 999), // cliente que no está en la lista: no debe contar
];
const deudores = [ana, beto, carla, eva];

// ---- Resumen
const resumen = calcularResumenFiados(deudores, antiguedad);
afirmar(resumen.totalPorCobrar === 280.5, 'Total por cobrar = suma de saldos de quienes deben (50 + 120.50 + 30 + 80)');
afirmar(resumen.clientesQueDeben === 4, 'Clientes que deben = 4');
afirmar(resumen.montoVencido === 100 && resumen.clientesVencidos === 1, 'Monto vencido = solo la parte de más de 30 días (100) de 1 cliente');
afirmar(calcularResumenFiados([ana, dino], antiguedad).clientesQueDeben === 1, 'Un cliente con saldo 0 no cuenta como deudor');
afirmar(calcularResumenFiados([], []).totalPorCobrar === 0 && calcularResumenFiados([], []).clientesQueDeben === 0, 'Sin deudores: todo en cero (estado «Nadie te debe»)');
afirmar(calcularResumenFiados([cliente(7, 'X', 0.1), cliente(8, 'Y', 0.2)], []).totalPorCobrar === 0.3, 'El total se redondea a 2 decimales (0.1 + 0.2 = 0.30)');
afirmar(calcularResumenFiados(deudores, [item(2, 120.5, 31, 120.5)]).montoVencido === 120.5, 'Una deuda de 31 días ya cuenta como vencida');
afirmar(calcularResumenFiados(deudores, [item(2, 120.5, 30, 0)]).montoVencido === 0, 'Una deuda de exactamente 30 días todavía no cuenta como vencida');

// ---- Filas
const filas = construirFilasFiado([ana, beto, carla, dino, eva], antiguedad);
afirmar(filas.length === 5, 'Una fila por cliente de la lista');
afirmar(filas[1]?.diasMasAntigua === 40 && filas[1]?.montoVencido === 100, 'Beto: deuda más antigua 40 días, 100 vencidos');
afirmar(filas[3]?.diasMasAntigua === null, 'Dino (pagó todo): sin antigüedad');
afirmar(filas[4]?.diasMasAntigua === null, 'Eva (sin deudas abiertas en el detalle): sin etiqueta, pero sigue en la lista');
afirmar(filas.filter(estaVencido).length === 1 && filtrarSoloVencidos(filas)[0]?.cliente.id === 2, '«Solo vencidos» deja únicamente a Beto');

// ---- Orden
const nombres = (orden: Parameters<typeof ordenarFilasFiado>[1]) => ordenarFilasFiado(filas, orden).map((f) => f.cliente.nombre).join(',');
afirmar(nombres('mayor_deuda') === 'Beto,Eva,Ana,Carla,Dino', 'Mayor deuda: Beto, Eva, Ana, Carla y al final quien ya pagó');
afirmar(nombres('mas_antiguos') === 'Beto,Carla,Ana,Eva,Dino', 'Más antiguos: 40, 20, 2 días; sin antigüedad al final (Eva con más deuda que Dino)');
afirmar(nombres('pagaron_hace_poco') === 'Dino,Ana,Eva,Beto,Carla', 'Pagaron hace poco: del pago más reciente al más viejo; quien nunca pagó al final');
const copiaAntes = filas.map((f) => f.cliente.id).join(',');
ordenarFilasFiado(filas, 'mas_antiguos');
afirmar(filas.map((f) => f.cliente.id).join(',') === copiaAntes, 'Ordenar no modifica la lista original');

// ---- Empates
const empate = construirFilasFiado([cliente(10, 'Zoe', 40), cliente(11, 'Abel', 40), cliente(12, 'Mía', 90)], [item(10, 40, 5), item(11, 40, 5), item(12, 90, 5)]);
afirmar(ordenarFilasFiado(empate, 'mas_antiguos').map((f) => f.cliente.nombre).join(',') === 'Mía,Abel,Zoe', 'Empate de días: gana la mayor deuda y luego el nombre');
afirmar(ordenarFilasFiado([], 'mayor_deuda').length === 0, 'Lista vacía no falla');

console.log('🎉 Todas las pruebas de Fiados F1 pasaron.');
