/**
 * Vende Fácil — Cobro rápido de fiados (lógica pura)
 * ------------------------------------------------------------
 * Atajos de monto ("Cobrar todo", "Pagar la mitad"), validación del monto escrito y el
 * texto de confirmación tras cobrar. Sin UI ni base de datos: se prueba con `tsx`.
 * El registro del pago (caja, reparto entre deudas, anulación) sigue siendo el de siempre:
 * `FiadoRepositorio.registrarPago`.
 */
import { formatearMonto } from './moneda';
import { redondear } from './reglas-negocio';

/** "Cobrar todo": el monto es exactamente lo que debe. */
export function montoCobrarTodo(saldo: number): number {
  return saldo > 0 ? redondear(saldo) : 0;
}

/**
 * "Pagar la mitad": la mitad de la deuda a 2 decimales. Nunca es 0 ni pasa de lo que debe
 * (con 0.01 de deuda, la mitad es 0.01).
 */
export function montoPagarMitad(saldo: number): number {
  if (!(saldo > 0)) return 0;
  return Math.min(redondear(saldo), Math.max(0.01, redondear(saldo / 2)));
}

/** Monto como se escribe en el campo ("12.50"), para rellenarlo con un atajo. */
export function textoMontoCampo(monto: number): string {
  return monto > 0 ? monto.toFixed(2) : '';
}

/**
 * Mensaje de error del monto escrito, o null si es válido.
 * Campo vacío = null (el botón ya está desactivado, no hace falta regañar).
 */
export function validarMontoPago(textoMonto: string, saldo: number, simbolo: string): string | null {
  if (textoMonto.trim() === '') return null;
  const monto = Number(textoMonto);
  if (!Number.isFinite(monto) || monto <= 0) return 'Escribe un monto mayor a 0.';
  if (redondear(monto) > redondear(saldo)) {
    return `No puede ser más de lo que debe (${formatearMonto(saldo, simbolo)}).`;
  }
  return null;
}

export interface ResultadoPago {
  saldoNuevo: number;
  saldado: boolean;
  /** Texto corto para mostrar tras cobrar. */
  texto: string;
}

/** Qué le queda al cliente después de pagar `pagado`. */
export function describirResultadoPago(saldoAntes: number, pagado: number, simbolo: string): ResultadoPago {
  const saldoNuevo = Math.max(0, redondear(saldoAntes - pagado));
  const saldado = saldoNuevo <= 0;
  return {
    saldoNuevo,
    saldado,
    texto: saldado ? 'Deuda pagada ✓' : `Quedó debiendo ${formatearMonto(saldoNuevo, simbolo)}`,
  };
}
