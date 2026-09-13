import type { CajaRepositorio } from '@/core/repositorios';
import { calcularSaldoCaja } from '@/core/reglas-negocio';
import type { MetodoPagoSinFiado, MovimientoCaja } from '@/core/tipos';
import type { BaseDatosLocal } from './base-datos';
import { mapearMovimientoCaja, type FilaMovimientoCaja } from './mapeadores';

export class CajaRepositorioSqlite implements CajaRepositorio {
  constructor(private readonly bd: BaseDatosLocal) {}

  obtenerSaldoActual(): number {
    const fila = this.bd.consultar<{ saldo_resultante: number }>(
      'SELECT saldo_resultante FROM movimiento_caja ORDER BY id DESC LIMIT 1',
    )[0];
    return fila?.saldo_resultante ?? 0;
  }

  registrarIngreso(
    monto: number,
    concepto: string,
    metodoPago: MetodoPagoSinFiado,
    ventaId: number | null = null,
  ): void {
    const saldoNuevo = calcularSaldoCaja(this.obtenerSaldoActual(), monto, 0);
    this.bd.ejecutar(
      `INSERT INTO movimiento_caja (tipo, monto, concepto, metodo_pago, venta_id, saldo_resultante)
       VALUES ('ingreso', ?, ?, ?, ?, ?)`,
      [monto, concepto, metodoPago, ventaId, saldoNuevo],
    );
  }

  registrarEgreso(monto: number, concepto: string, metodoPago: MetodoPagoSinFiado): void {
    const saldoNuevo = calcularSaldoCaja(this.obtenerSaldoActual(), 0, monto);
    this.bd.ejecutar(
      `INSERT INTO movimiento_caja (tipo, monto, concepto, metodo_pago, saldo_resultante)
       VALUES ('egreso', ?, ?, ?, ?)`,
      [monto, concepto, metodoPago, saldoNuevo],
    );
  }

  listarMovimientosDeHoy(): MovimientoCaja[] {
    return this.bd
      .consultar<FilaMovimientoCaja>(
        `SELECT * FROM movimiento_caja
         WHERE date(fecha_hora) = date('now')
         ORDER BY id DESC`,
      )
      .map(mapearMovimientoCaja);
  }
}
