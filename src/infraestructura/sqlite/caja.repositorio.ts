import type { CajaRepositorio } from '@/core/repositorios';
import { calcularSaldoCaja } from '@/core/reglas-negocio';
import type { MetodoPagoSinFiado, MovimientoCaja, ReferenciaCajaMovimiento } from '@/core/tipos';
import { ahoraLocalSql, hoyLocalSql } from '@/core/tiempo';
import type { BaseDatosLocal } from './base-datos';
import { mapearMovimientoCaja, type FilaMovimientoCaja } from './mapeadores';

// Compone a quién corresponde el movimiento, calculado en la misma consulta
// para no repetir la lógica entre listarMovimientosDeHoy/PorRango: cliente
// de la venta (ingreso por venta, egreso por anulación), cliente directo
// (cobro de fiado que no viene de una venta puntual), proveedor de la
// compra, o "Ajuste Manual" si el movimiento no tiene ninguno de los tres.
const SELECT_CON_REFERENCIA = `
  SELECT
    mc.id AS id, mc.tipo AS tipo, mc.monto AS monto, mc.concepto AS concepto,
    mc.metodo_pago AS metodo_pago, mc.venta_id AS venta_id,
    mc.saldo_resultante AS saldo_resultante, mc.fecha_hora AS fecha_hora, mc.clase AS clase, mc.compra_id AS compra_id,
    COALESCE((
      SELECT SUM(pd.monto)
      FROM pago_deuda pd
      JOIN deuda_cliente dc ON dc.id = pd.deuda_id
      JOIN venta vv ON vv.id = dc.venta_id
      WHERE mc.abono_id IS NOT NULL AND mc.tipo = 'ingreso'
        AND pd.abono_id = mc.abono_id AND pd.anulado = 0 AND vv.anulada = 1
        AND EXISTS (
          SELECT 1 FROM movimiento_caja d
          WHERE d.venta_id = vv.id AND d.clase = 'anulacion' AND d.concepto LIKE 'Devolución por anulación%'
        )
    ), 0) AS monto_anulado,
    CASE WHEN mc.clase != 'anulacion' AND (v.anulada = 1 OR co.estado = 'anulada' OR mc.pago_anulado = 1) THEN 1 ELSE 0 END AS anulado,
    CASE
      WHEN mc.venta_id IS NOT NULL THEN COALESCE(cli_v.nombre, 'Cliente eventual')
      WHEN mc.cliente_id IS NOT NULL THEN COALESCE(cli_d.nombre, 'Cliente eventual')
      WHEN mc.compra_id IS NOT NULL THEN COALESCE(prov.nombre, co.proveedor_nombre_libre, 'Proveedor eventual')
      ELSE 'Ajuste Manual'
    END AS referencia
  FROM movimiento_caja mc
  LEFT JOIN venta v ON v.id = mc.venta_id
  LEFT JOIN cliente cli_v ON cli_v.id = v.cliente_id
  LEFT JOIN cliente cli_d ON cli_d.id = mc.cliente_id
  LEFT JOIN compra co ON co.id = mc.compra_id
  LEFT JOIN proveedor prov ON prov.id = co.proveedor_id
`;

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
    referencia?: ReferenciaCajaMovimiento,
  ): void {
    const saldoNuevo = calcularSaldoCaja(this.obtenerSaldoActual(), monto, 0);
    this.bd.ejecutar(
      `INSERT INTO movimiento_caja
         (tipo, monto, concepto, metodo_pago, venta_id, compra_id, cliente_id, saldo_resultante, fecha_hora, clase, abono_id)
       VALUES ('ingreso', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        monto,
        concepto,
        metodoPago,
        referencia?.ventaId ?? null,
        referencia?.compraId ?? null,
        referencia?.clienteId ?? null,
        saldoNuevo,
        ahoraLocalSql(),
        referencia?.clase ?? 'normal',
        referencia?.abonoId ?? null,
      ],
    );
  }

  registrarEgreso(
    monto: number,
    concepto: string,
    metodoPago: MetodoPagoSinFiado,
    referencia?: ReferenciaCajaMovimiento,
  ): void {
    const saldoNuevo = calcularSaldoCaja(this.obtenerSaldoActual(), 0, monto);
    this.bd.ejecutar(
      `INSERT INTO movimiento_caja
         (tipo, monto, concepto, metodo_pago, venta_id, compra_id, cliente_id, saldo_resultante, fecha_hora, clase, abono_id)
       VALUES ('egreso', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        monto,
        concepto,
        metodoPago,
        referencia?.ventaId ?? null,
        referencia?.compraId ?? null,
        referencia?.clienteId ?? null,
        saldoNuevo,
        ahoraLocalSql(),
        referencia?.clase ?? 'normal',
        referencia?.abonoId ?? null,
      ],
    );
  }

  listarMovimientosDeHoy(): MovimientoCaja[] {
    return this.bd
      .consultar<FilaMovimientoCaja>(
        `${SELECT_CON_REFERENCIA}
         WHERE substr(mc.fecha_hora, 1, 10) = ?
         ORDER BY mc.id DESC`,
        [hoyLocalSql()],
      )
      .map(mapearMovimientoCaja);
  }

  listarMovimientosPorRango(desde: string, hasta: string): MovimientoCaja[] {
    return this.bd
      .consultar<FilaMovimientoCaja>(
        `${SELECT_CON_REFERENCIA}
         WHERE substr(mc.fecha_hora, 1, 10) >= ? AND substr(mc.fecha_hora, 1, 10) <= ?
         ORDER BY mc.fecha_hora DESC`,
        [desde, hasta],
      )
      .map(mapearMovimientoCaja);
  }
}
