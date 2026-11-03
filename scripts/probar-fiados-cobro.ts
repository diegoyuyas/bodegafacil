/**
 * Prueba del cobro rápido de Fiados (Etapa F2): atajos de monto, validación, resultado del pago
 * y mensaje de WhatsApp del pago. Lógica pura: no necesita base de datos ni celular.
 *
 * Uso: npx tsx scripts/probar-fiados-cobro.ts
 */
import {
  describirResultadoPago,
  montoCobrarTodo,
  montoPagarMitad,
  textoMontoCampo,
  validarMontoPago,
} from '../src/core/fiados-cobro';
import { construirMensajeDeuda, construirMensajePago } from '../src/core/whatsapp';
import type { Cliente } from '../src/core/tipos';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

function cliente(nombre: string, saldo: number): Cliente {
  return { id: 1, nombre, documento: null, telefono: '987654321', direccion: null, saldoPendiente: saldo, fechaUltimoPago: null, ultimoRecordatorioEn: null, fechaCompromiso: null, activo: true, creadoEn: '2026-01-01 08:00:00' };
}

// ---- Atajos de monto
afirmar(montoCobrarTodo(12.5) === 12.5 && montoCobrarTodo(0.3) === 0.3, 'Cobrar todo = exactamente la deuda');
afirmar(montoCobrarTodo(0) === 0 && montoCobrarTodo(-5) === 0, 'Sin deuda: no hay nada que cobrar (0)');
afirmar(montoPagarMitad(12.5) === 6.25, 'La mitad de 12.50 es 6.25');
afirmar(montoPagarMitad(10) === 5, 'La mitad de 10 es 5');
afirmar(montoPagarMitad(0.01) === 0.01, 'Con 0.01 de deuda la mitad es 0.01 (nunca 0)');
afirmar(montoPagarMitad(0.03) <= 0.03 && montoPagarMitad(0.03) > 0, 'Con 0.03 la mitad es positiva y no pasa de la deuda');
afirmar(montoPagarMitad(99.99) <= 99.99 && montoPagarMitad(99.99) === 50, 'La mitad de 99.99 se redondea a 50.00 sin pasar de la deuda');
afirmar(montoPagarMitad(10.01) <= 10.01 && montoPagarMitad(0) === 0, 'La mitad nunca supera la deuda y sin deuda es 0');
afirmar(textoMontoCampo(6.25) === '6.25' && textoMontoCampo(5) === '5.00' && textoMontoCampo(0) === '', 'Texto del campo: 2 decimales, vacío si es 0');

// ---- Validación del monto escrito
afirmar(validarMontoPago('', 20, 'S/') === null, 'Campo vacío: sin mensaje (el botón ya está desactivado)');
afirmar(validarMontoPago('10', 20, 'S/') === null && validarMontoPago('20', 20, 'S/') === null, 'Monto válido (parcial o igual a la deuda): sin error');
afirmar(validarMontoPago('0', 20, 'S/') === 'Escribe un monto mayor a 0.', 'Monto 0 no es válido');
afirmar(validarMontoPago('-5', 20, 'S/') === 'Escribe un monto mayor a 0.' && validarMontoPago('abc', 20, 'S/') === 'Escribe un monto mayor a 0.', 'Monto negativo o con letras no es válido');
afirmar(validarMontoPago('20.01', 20, 'S/') === 'No puede ser más de lo que debe (S/ 20.00).', 'Más de lo que debe: avisa con el monto exacto');
afirmar(validarMontoPago('20.004', 20, 'S/') === null, 'Una diferencia menor a un céntimo se redondea (no bloquea)');
afirmar(validarMontoPago('5', 4.5, 'MX$') === 'No puede ser más de lo que debe (MX$ 4.50).', 'Usa el símbolo de moneda configurado');

// ---- Resultado del pago
const parcial = describirResultadoPago(32.5, 20, 'S/');
afirmar(parcial.saldoNuevo === 12.5 && !parcial.saldado && parcial.texto === 'Quedó debiendo S/ 12.50', 'Pago parcial: «Quedó debiendo S/ 12.50»');
const total = describirResultadoPago(20, 20, 'S/');
afirmar(total.saldoNuevo === 0 && total.saldado && total.texto === 'Deuda pagada ✓', 'Pago total: «Deuda pagada ✓»');
afirmar(describirResultadoPago(0.3, 0.1, 'S/').saldoNuevo === 0.2, 'Sin errores de decimales (0.3 − 0.1 = 0.20)');
afirmar(describirResultadoPago(10, 10.004, 'S/').saldoNuevo === 0, 'El saldo nunca queda negativo');

// ---- Mensaje de WhatsApp del pago
const ana = cliente('Ana', 0);
const mParcial = construirMensajePago(ana, { fecha: '2026-10-30 18:45:10', monto: 20, metodoPago: 'yape', saldoNuevo: 12.5 }, 'S/');
afirmar(mParcial.includes('Hola Ana') && mParcial.includes('Recibimos tu pago'), 'Mensaje: saludo con el nombre y confirmación');
afirmar(mParcial.includes('30/10/2026'), 'Mensaje: fecha del pago en formato local (dd/mm/aaaa)');
afirmar(mParcial.includes('Pagaste: S/ 20.00') && mParcial.includes('Método de pago: Yape'), 'Mensaje: monto pagado y método con su nombre');
afirmar(mParcial.includes('Te queda por pagar: S/ 12.50') && !mParcial.includes('Ya no tienes deuda'), 'Mensaje de pago parcial: muestra lo que queda');
const mTotal = construirMensajePago(ana, { fecha: '2026-10-30 18:45:10', monto: 12.5, metodoPago: 'efectivo', saldoNuevo: 0 }, 'S/');
afirmar(mTotal.includes('Ya no tienes deuda pendiente') && !mTotal.includes('Te queda por pagar') && mTotal.includes('Efectivo'), 'Mensaje de pago total: «Ya no tienes deuda pendiente»');
afirmar(construirMensajePago(ana, { fecha: '2026-10-30 08:00:00', monto: 5, metodoPago: 'otro', saldoNuevo: 1 }, 'US$').includes('US$ 5.00'), 'Mensaje: símbolo de moneda configurado y método desconocido sin romper');

// ---- Lo que ya existía sigue igual
const deuda = construirMensajeDeuda(cliente('Beto', 30), [{ ventaId: 7, fecha: '2026-10-01 09:00:00', montoOriginal: 30, saldoPendiente: 30, lineas: [{ producto: 'Arroz', cantidad: 2 }] }], 'S/');
afirmar(deuda.includes('01/10/2026') && deuda.includes('V-7') && deuda.includes('Total pendiente: S/ 30.00'), 'El recordatorio de deuda de siempre sigue funcionando (fecha con espacio, sin romperse)');

console.log('🎉 Todas las pruebas de Fiados F2 pasaron.');
