import type { CajaRepositorio, FiadoRepositorio } from '@/core/repositorios';
import { ErrorDeNegocio, calcularDeudaNueva } from '@/core/reglas-negocio';
import type { Cliente, MetodoPagoSinFiado } from '@/core/tipos';
import type { BaseDatosLocal } from './base-datos';
import { mapearCliente, type FilaCliente } from './mapeadores';

export class FiadoRepositorioSqlite implements FiadoRepositorio {
  constructor(
    private readonly bd: BaseDatosLocal,
    private readonly caja: CajaRepositorio,
  ) {}

  listarClientesConDeuda(): Cliente[] {
    return this.bd
      .consultar<FilaCliente>(
        `SELECT * FROM cliente
         WHERE activo = 1 AND saldo_pendiente > 0
         ORDER BY saldo_pendiente DESC`,
      )
      .map(mapearCliente);
  }

  /**
   * Registra un abono/pago de un cliente: reduce su deuda y, como el
   * dinero sí entra a la bodega en ese momento, también genera un
   * ingreso de caja (a diferencia de la venta al fiado original, que
   * no toca caja hasta que se cobra).
   */
  registrarPago(clienteId: number, monto: number, metodoPago: MetodoPagoSinFiado): void {
    this.bd.transaccion(() => {
      const fila = this.bd.consultar<{ saldo_pendiente: number }>(
        'SELECT saldo_pendiente FROM cliente WHERE id = ?',
        [clienteId],
      )[0];
      if (!fila) {
        throw new ErrorDeNegocio(`El cliente ${clienteId} no existe.`);
      }
      if (monto > fila.saldo_pendiente) {
        throw new ErrorDeNegocio(
          `El pago (${monto}) no puede ser mayor a la deuda pendiente (${fila.saldo_pendiente}).`,
        );
      }

      const saldoNuevo = calcularDeudaNueva(fila.saldo_pendiente, 0, monto);

      this.bd.ejecutar(
        `INSERT INTO pago_deuda (cliente_id, monto, metodo_pago) VALUES (?, ?, ?)`,
        [clienteId, monto, metodoPago],
      );
      this.bd.ejecutar(
        `UPDATE cliente SET saldo_pendiente = ?, fecha_ultimo_pago = datetime('now') WHERE id = ?`,
        [saldoNuevo, clienteId],
      );

      this.caja.registrarIngreso(monto, `Pago de deuda — ${clienteId}`, metodoPago);
    });
  }
}
