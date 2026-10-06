import type { CajaRepositorio, FiadoRepositorio } from '@/core/repositorios';
import { ErrorDeNegocio, calcularDeudaNueva, redondear } from '@/core/reglas-negocio';
import type {
  Cliente,
  DeudaPendienteDetalle,
  FotoPagoFiado,
  MetodoPagoSinFiado,
  PagoFiado,
  RegistroBitacoraAnulacionPago,
} from '@/core/tipos';
import type { BaseDatosLocal } from './base-datos';
import { mapearCliente, type FilaCliente } from './mapeadores';
import { ahoraLocalSql } from '@/core/tiempo';

/**
 * Clave que identifica un abono completo. Los pagos nuevos traen `abono_id`;
 * los antiguos (sin él) se agrupan por cliente + fecha/hora exacta + método,
 * que es como se guardaron (todas las porciones de un abono comparten la
 * misma hora).
 */
function claveDeAbono(f: { abono_id: number | null; fecha: string; metodo_pago: string }): string {
  return f.abono_id !== null && f.abono_id !== undefined ? `a${f.abono_id}` : `h|${f.fecha}|${f.metodo_pago}`;
}

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

      // Todas las porciones de este abono comparten el mismo abono_id (para poder anularlo completo).
      const abonoId =
        (this.bd.consultar<{ siguiente: number }>(
          'SELECT COALESCE(MAX(abono_id), 0) + 1 AS siguiente FROM pago_deuda',
        )[0]?.siguiente) ?? 1;

      let restante = monto;
      const ventasCobradas: number[] = [];
      for (const deuda of deudas) {
        if (restante <= 0) break;
        const aplicado = redondear(Math.min(restante, deuda.saldo_pendiente));
        const saldoDeuda = redondear(deuda.saldo_pendiente - aplicado);

        this.bd.ejecutar(
          `INSERT INTO pago_deuda (cliente_id, deuda_id, monto, metodo_pago, foto_ruta, fecha, abono_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [clienteId, deuda.id, aplicado, metodoPago, fotoRuta || null, ahora, abonoId],
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
          `INSERT INTO pago_deuda (cliente_id, deuda_id, monto, metodo_pago, foto_ruta, fecha, abono_id)
           VALUES (?, NULL, ?, ?, ?, ?, ?)`,
          [clienteId, restante, metodoPago, fotoRuta || null, ahora, abonoId],
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
      this.caja.registrarIngreso(monto, concepto, metodoPago, { clienteId, abonoId });
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
         AND pd.anulado = 0
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

  listarPagosDeCliente(clienteId: number): PagoFiado[] {
    const filas = this.bd.consultar<{
      abono_id: number | null;
      monto: number;
      metodo_pago: MetodoPagoSinFiado;
      foto_ruta: string | null;
      fecha: string;
      anulado: number;
      motivo_anulacion: string | null;
      fecha_anulacion: string | null;
      venta_id: number | null;
    }>(
      `SELECT pd.abono_id AS abono_id, pd.monto AS monto, pd.metodo_pago AS metodo_pago,
              pd.foto_ruta AS foto_ruta, pd.fecha AS fecha, pd.anulado AS anulado,
              pd.motivo_anulacion AS motivo_anulacion, pd.fecha_anulacion AS fecha_anulacion,
              dc.venta_id AS venta_id
       FROM pago_deuda pd
       LEFT JOIN deuda_cliente dc ON dc.id = pd.deuda_id
       WHERE pd.cliente_id = ?
       ORDER BY pd.fecha DESC, pd.id DESC`,
      [clienteId],
    );

    const porClave = new Map<string, PagoFiado>();
    for (const f of filas) {
      const clave = claveDeAbono(f);
      const existente = porClave.get(clave);
      if (existente) {
        existente.monto = redondear(existente.monto + f.monto);
        if (f.venta_id && !existente.ventas.includes(f.venta_id)) existente.ventas.push(f.venta_id);
        if (!existente.fotoRuta && f.foto_ruta) existente.fotoRuta = f.foto_ruta;
      } else {
        porClave.set(clave, {
          clave,
          clienteId,
          fecha: f.fecha,
          monto: f.monto,
          metodoPago: f.metodo_pago,
          fotoRuta: f.foto_ruta,
          ventas: f.venta_id ? [f.venta_id] : [],
          anulado: f.anulado === 1,
          motivoAnulacion: f.motivo_anulacion,
          fechaAnulacion: f.fecha_anulacion,
        });
      }
    }
    return Array.from(porClave.values());
  }

  anularPago(clienteId: number, clave: string, motivo: string): void {
    const motivoLimpio = motivo.trim();
    if (!motivoLimpio) {
      throw new ErrorDeNegocio('Escribe el motivo de la anulación.');
    }

    this.bd.transaccion(() => {
      const cliente = this.bd.consultar<{ nombre: string; saldo_pendiente: number }>(
        'SELECT nombre, saldo_pendiente FROM cliente WHERE id = ?',
        [clienteId],
      )[0];
      if (!cliente) {
        throw new ErrorDeNegocio(`El cliente ${clienteId} no existe.`);
      }

      const vigentes = this.bd.consultar<{
        id: number;
        deuda_id: number | null;
        monto: number;
        metodo_pago: MetodoPagoSinFiado;
        fecha: string;
        abono_id: number | null;
      }>(
        `SELECT id, deuda_id, monto, metodo_pago, fecha, abono_id
         FROM pago_deuda WHERE cliente_id = ? AND anulado = 0`,
        [clienteId],
      );
      const filas = vigentes.filter((f) => claveDeAbono(f) === clave);
      const primera = filas[0];
      if (!primera) {
        throw new ErrorDeNegocio('Ese pago no existe o ya fue anulado.');
      }

      // Cuánto se le devuelve a cada deuda.
      const porDeuda = new Map<number, number>();
      let sinDeuda = 0;
      for (const f of filas) {
        if (f.deuda_id === null) sinDeuda = redondear(sinDeuda + f.monto);
        else porDeuda.set(f.deuda_id, redondear((porDeuda.get(f.deuda_id) ?? 0) + f.monto));
      }

      const detalle: string[] = [];
      const ventasAfectadas: number[] = [];
      for (const [deudaId, montoPagado] of Array.from(porDeuda.entries())) {
        const deuda = this.bd.consultar<{
          venta_id: number | null;
          monto: number;
          saldo_pendiente: number;
        }>('SELECT venta_id, monto, saldo_pendiente FROM deuda_cliente WHERE id = ?', [deudaId])[0];
        if (!deuda) continue; // la deuda ya no existe: solo queda el ajuste de saldo y caja

        if (deuda.venta_id) {
          const venta = this.bd.consultar<{ anulada: number }>('SELECT anulada FROM venta WHERE id = ?', [
            deuda.venta_id,
          ])[0];
          if (venta?.anulada === 1) {
            throw new ErrorDeNegocio(
              `No se puede anular este pago: la venta V-${deuda.venta_id} ya fue anulada.`,
            );
          }
          ventasAfectadas.push(deuda.venta_id);
        }

        const saldoNuevo = Math.min(deuda.monto, redondear(deuda.saldo_pendiente + montoPagado));
        this.bd.ejecutar('UPDATE deuda_cliente SET saldo_pendiente = ?, estado = ? WHERE id = ?', [
          saldoNuevo,
          saldoNuevo >= deuda.monto ? 'pendiente' : 'pagada_parcial',
          deudaId,
        ]);
        detalle.push(`${deuda.venta_id ? `V-${deuda.venta_id}` : 'Deuda'} +${montoPagado.toFixed(2)}`);
      }
      if (sinDeuda > 0) detalle.push(`Sin venta asociada +${sinDeuda.toFixed(2)}`);

      const total = redondear(filas.reduce((suma, f) => suma + f.monto, 0));
      const metodo = primera.metodo_pago;
      const fechaPago = primera.fecha;
      const ahora = ahoraLocalSql();

      // El pago no se borra: se marca como anulado (conserva incluso la foto).
      for (const f of filas) {
        this.bd.ejecutar(
          'UPDATE pago_deuda SET anulado = 1, motivo_anulacion = ?, fecha_anulacion = ? WHERE id = ?',
          [motivoLimpio, ahora, f.id],
        );
      }

      this.bd.ejecutar(
        `UPDATE cliente
         SET saldo_pendiente = ?,
             fecha_ultimo_pago = (SELECT MAX(fecha) FROM pago_deuda WHERE cliente_id = ? AND anulado = 0)
         WHERE id = ?`,
        [redondear(cliente.saldo_pendiente + total), clienteId, clienteId],
      );

      const concepto =
        ventasAfectadas.length > 0
          ? `Anulación pago de deuda — ${ventasAfectadas.map((id) => `V-${id}`).join(', ')}`
          : `Anulación pago de deuda — ${clienteId}`;
      this.caja.registrarEgreso(total, concepto, metodo, { clienteId, clase: 'anulacion' });

      // Marca el cobro original en Caja como "Anulado". Los pagos nuevos se enlazan por
      // abono_id; los antiguos, por cliente + forma de pago + monto + minuto del pago.
      if (primera.abono_id !== null && primera.abono_id !== undefined) {
        this.bd.ejecutar('UPDATE movimiento_caja SET pago_anulado = 1 WHERE abono_id = ? AND tipo = ?', [
          primera.abono_id,
          'ingreso',
        ]);
      } else {
        this.bd.ejecutar(
          `UPDATE movimiento_caja SET pago_anulado = 1 WHERE id = (
             SELECT MAX(id) FROM movimiento_caja
             WHERE tipo = 'ingreso' AND clase = 'normal' AND pago_anulado = 0
               AND cliente_id = ? AND metodo_pago = ? AND ABS(monto - ?) < 0.005
               AND concepto LIKE 'Pago de deuda%'
               AND substr(fecha_hora, 1, 16) = substr(?, 1, 16))`,
          [clienteId, metodo, total, fechaPago],
        );
      }

      this.bd.ejecutar(
        `INSERT INTO bitacora_anulacion_pago
           (cliente_id, cliente_nombre, monto, metodo_pago, fecha_pago, motivo, detalle, fecha_anulacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [clienteId, cliente.nombre, total, metodo, fechaPago, motivoLimpio, detalle.join('; '), ahora],
      );
    });
  }

  listarBitacoraAnulaciones(desde: string, hasta: string): RegistroBitacoraAnulacionPago[] {
    return this.bd
      .consultar<{
        id: number;
        cliente_id: number | null;
        cliente_nombre: string;
        monto: number;
        metodo_pago: string;
        fecha_pago: string;
        motivo: string;
        detalle: string;
        fecha_anulacion: string;
      }>(
        `SELECT id, cliente_id, cliente_nombre, monto, metodo_pago, fecha_pago, motivo, detalle, fecha_anulacion
         FROM bitacora_anulacion_pago
         WHERE substr(fecha_anulacion, 1, 10) >= ? AND substr(fecha_anulacion, 1, 10) <= ?
         ORDER BY fecha_anulacion DESC, id DESC`,
        [desde, hasta],
      )
      .map((f) => ({
        id: f.id,
        clienteId: f.cliente_id,
        clienteNombre: f.cliente_nombre,
        monto: f.monto,
        metodoPago: f.metodo_pago,
        fechaPago: f.fecha_pago,
        motivo: f.motivo,
        detalle: f.detalle,
        fechaAnulacion: f.fecha_anulacion,
      }));
  }

  actualizarFotoPago(pagoDeudaId: number, fotoRuta: string): void {
    this.bd.ejecutar('UPDATE pago_deuda SET foto_ruta = ? WHERE id = ?', [fotoRuta, pagoDeudaId]);
  }
}
