import type { CajaRepositorio, FiadoRepositorio } from '@/core/repositorios';
import { ErrorDeNegocio, calcularDeudaNueva, redondear } from '@/core/reglas-negocio';
import type { Cliente, DeudaPendienteDetalle, FotoPagoFiado, MetodoPagoSinFiado } from '@/core/tipos';
import type { BaseDatosLocal } from './base-datos';
import { mapearCliente, type FilaCliente } from './mapeadores';
import { ahoraLocalSql } from '@/core/tiempo';

/** Fila cruda de deuda_cliente, con las líneas de la venta resueltas aparte. */
function mapearDeudaConLineas(
  bd: BaseDatosLocal,
  d: { venta_id: number | null; fecha: string; monto: number; saldo_pendiente: number },
): DeudaPendienteDetalle {
  return {
    ventaId: d.venta_id,
    fecha: d.fecha,
    montoOriginal: d.monto,
    saldoPendiente: d.saldo_pendiente,
    lineas: d.venta_id
      ? bd.consultar<{ producto: string; cantidad: number }>(
          `SELECT p.nombre AS producto, dv.cantidad AS cantidad
           FROM detalle_venta dv
           JOIN producto p ON p.id = dv.producto_id
           WHERE dv.venta_id = ?
           ORDER BY dv.id`,
          [d.venta_id],
        )
      : [],
  };
}

export class FiadoRepositorioSqlite implements FiadoRepositorio {
  constructor(
    private readonly bd: BaseDatosLocal,
    private readonly caja: CajaRepositorio,
  ) {}

  listarClientesConDeuda(desde?: string, hasta?: string): Cliente[] {
    if (!desde && !hasta) {
      return this.bd
        .consultar<FilaCliente>(
          `SELECT * FROM cliente
           WHERE activo = 1 AND saldo_pendiente > 0
           ORDER BY saldo_pendiente DESC`,
        )
        .map(mapearCliente);
    }

    // Con rango de fechas: clientes que generaron al menos un fiado en
    // ese período (para exportar). El saldo mostrado sigue siendo el
    // saldo pendiente actual, no el de ese momento — es el dato útil
    // para saber a quién cobrarle hoy.
    const condicionesFecha: string[] = [];
    const parametros: string[] = [];
    if (desde) {
      condicionesFecha.push('substr(d.fecha, 1, 10) >= ?');
      parametros.push(desde);
    }
    if (hasta) {
      condicionesFecha.push('substr(d.fecha, 1, 10) <= ?');
      parametros.push(hasta);
    }

    return this.bd
      .consultar<FilaCliente>(
        `SELECT DISTINCT c.* FROM cliente c
         JOIN deuda_cliente d ON d.cliente_id = c.id
         WHERE c.activo = 1 AND ${condicionesFecha.join(' AND ')}
         ORDER BY c.saldo_pendiente DESC`,
        parametros,
      )
      .map(mapearCliente);
  }

  listarClientesConHistorialFiado(desde?: string, hasta?: string): Cliente[] {
    const condicionesFecha: string[] = [];
    const parametros: string[] = [];
    if (desde) {
      condicionesFecha.push('substr(d.fecha, 1, 10) >= ?');
      parametros.push(desde);
    }
    if (hasta) {
      condicionesFecha.push('substr(d.fecha, 1, 10) <= ?');
      parametros.push(hasta);
    }
    const clausula = condicionesFecha.length ? `AND ${condicionesFecha.join(' AND ')}` : '';

    return this.bd
      .consultar<FilaCliente>(
        `SELECT DISTINCT c.* FROM cliente c
         JOIN deuda_cliente d ON d.cliente_id = c.id
         WHERE c.activo = 1 ${clausula}
         ORDER BY c.saldo_pendiente DESC, c.nombre ASC`,
        parametros,
      )
      .map(mapearCliente);
  }

  /**
   * Registra un abono/pago de un cliente: reduce su deuda y, como el
   * dinero sí entra a la bodega en ese momento, también genera un
   * ingreso de caja (a diferencia de la venta al fiado original, que
   * no toca caja hasta que se cobra).
   *
   * El abono se REPARTE entre las deudas del cliente de la más antigua
   * a la más reciente (FIFO): cada venta al fiado lleva su propio
   * saldo y cada porción cobrada queda registrada en `pago_deuda`
   * apuntando a la deuda que pagó. Así se sabe exactamente cuánto
   * falta de cada venta (y cuánto se cobró de ella si hay que
   * anularla), aunque el cliente tenga varios fiados abiertos.
   *
   * `fotoRuta` (Yape/Plin, opcional) se guarda en CADA fila de
   * pago_deuda que generó este abono — si se reparte entre 2 ventas,
   * la misma foto queda visible desde cualquiera de las dos.
   */
  registrarPago(
    clienteId: number,
    monto: number,
    metodoPago: MetodoPagoSinFiado,
    fotoRuta?: string | null,
  ): void {
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
      const ahora = ahoraLocalSql();

      const deudas = this.bd.consultar<{
        id: number;
        venta_id: number | null;
        monto: number;
        saldo_pendiente: number;
      }>(
        `SELECT id, venta_id, monto, saldo_pendiente FROM deuda_cliente
         WHERE cliente_id = ? AND saldo_pendiente > 0
         ORDER BY fecha ASC, id ASC`,
        [clienteId],
      );

      let restante = monto;
      const ventasCobradas: number[] = [];
      for (const deuda of deudas) {
        if (restante <= 0) break;
        const aplicado = redondear(Math.min(restante, deuda.saldo_pendiente));
        const saldoDeuda = redondear(deuda.saldo_pendiente - aplicado);

        this.bd.ejecutar(
          `INSERT INTO pago_deuda (cliente_id, deuda_id, monto, metodo_pago, foto_ruta, fecha)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [clienteId, deuda.id, aplicado, metodoPago, fotoRuta || null, ahora],
        );
        this.bd.ejecutar(`UPDATE deuda_cliente SET saldo_pendiente = ?, estado = ? WHERE id = ?`, [
          saldoDeuda,
          saldoDeuda <= 0 ? 'pagada' : 'pagada_parcial',
          deuda.id,
        ]);
        if (deuda.venta_id) ventasCobradas.push(deuda.venta_id);
        restante = redondear(restante - aplicado);
      }

      // Por seguridad: si por datos muy antiguos el saldo del cliente era
      // mayor que la suma de sus deudas, lo que sobra se guarda igual (sin
      // deuda asociada) para no perder nunca el registro del dinero cobrado.
      if (restante > 0) {
        this.bd.ejecutar(
          `INSERT INTO pago_deuda (cliente_id, deuda_id, monto, metodo_pago, foto_ruta, fecha)
           VALUES (?, NULL, ?, ?, ?, ?)`,
          [clienteId, restante, metodoPago, fotoRuta || null, ahora],
        );
      }

      this.bd.ejecutar(
        `UPDATE cliente SET saldo_pendiente = ?, fecha_ultimo_pago = ? WHERE id = ?`,
        [saldoNuevo, ahora, clienteId],
      );

      const concepto =
        ventasCobradas.length > 0
          ? `Pago de deuda — ${ventasCobradas.map((id) => `V-${id}`).join(', ')}`
          : `Pago de deuda — ${clienteId}`;
      this.caja.registrarIngreso(monto, concepto, metodoPago, { clienteId });
    });
  }

  listarDeudasPendientesDetalladas(clienteId: number): DeudaPendienteDetalle[] {
    const deudas = this.bd.consultar<{
      venta_id: number | null;
      fecha: string;
      monto: number;
      saldo_pendiente: number;
    }>(
      `SELECT venta_id, fecha, monto, saldo_pendiente FROM deuda_cliente
       WHERE cliente_id = ? AND saldo_pendiente > 0
       ORDER BY fecha ASC, id ASC`,
      [clienteId],
    );
    return deudas.map((d) => mapearDeudaConLineas(this.bd, d));
  }

  listarHistorialFiado(clienteId: number): DeudaPendienteDetalle[] {
    const deudas = this.bd.consultar<{
      venta_id: number | null;
      fecha: string;
      monto: number;
      saldo_pendiente: number;
    }>(
      `SELECT venta_id, fecha, monto, saldo_pendiente FROM deuda_cliente
       WHERE cliente_id = ?
       ORDER BY fecha DESC, id DESC`,
      [clienteId],
    );
    return deudas.map((d) => mapearDeudaConLineas(this.bd, d));
  }

  listarFotosPagosFiado(desde: string, hasta: string): FotoPagoFiado[] {
    return this.bd.consultar<{
      id: number;
      venta_id: number;
      foto_ruta: string;
      fecha: string;
    }>(
      `SELECT pd.id AS id, dc.venta_id AS venta_id, pd.foto_ruta AS foto_ruta, pd.fecha AS fecha
       FROM pago_deuda pd
       JOIN deuda_cliente dc ON dc.id = pd.deuda_id
       WHERE dc.venta_id IS NOT NULL
         AND pd.foto_ruta IS NOT NULL
         AND substr(pd.fecha, 1, 10) >= ? AND substr(pd.fecha, 1, 10) <= ?
       ORDER BY pd.fecha ASC`,
      [desde, hasta],
    ).map((f) => ({
      pagoDeudaId: f.id,
      ventaId: f.venta_id,
      fotoRuta: f.foto_ruta,
      fecha: f.fecha,
    }));
  }

  actualizarFotoPago(pagoDeudaId: number, fotoRuta: string): void {
    this.bd.ejecutar('UPDATE pago_deuda SET foto_ruta = ? WHERE id = ?', [fotoRuta, pagoDeudaId]);
  }
}
