import type { CajaRepositorio, ProductoRepositorio, VentaRepositorio } from '@/core/repositorios';
import {
  ErrorDeNegocio,
  calcularDeudaNueva,
  calcularStockNuevo,
  construirVenta,
} from '@/core/reglas-negocio';
import type { RegistrarVentaInput, ResumenDia, Venta } from '@/core/tipos';
import type { FilaVentaDetallada } from '@/core/exportacion';
import type { BaseDatosLocal } from './base-datos';
import { mapearVenta, type FilaVenta } from './mapeadores';

export class VentaRepositorioSqlite implements VentaRepositorio {
  constructor(
    private readonly bd: BaseDatosLocal,
    private readonly productos: ProductoRepositorio,
    private readonly caja: CajaRepositorio,
  ) {}

  /**
   * Registra una venta completa: valida stock y calcula montos (reglas
   * de negocio puras), guarda venta + detalle, actualiza stock con
   * trazabilidad (movimiento_inventario), y según el método de pago
   * genera un ingreso de caja o una deuda de cliente. Todo en una sola
   * transacción: si algo falla, no queda nada a medias.
   */
  registrarVenta(input: RegistrarVentaInput): Venta {
    return this.bd.transaccion(() => {
      if (input.metodoPago === 'fiado' && !input.clienteId) {
        throw new ErrorDeNegocio('Una venta al fiado necesita un cliente.');
      }

      const calculada = construirVenta(input.lineas, (id) => this.productos.obtenerPorId(id));

      this.bd.ejecutar(
        `INSERT INTO venta (cliente_id, metodo_pago, subtotal, total, ganancia_estimada)
         VALUES (?, ?, ?, ?, ?)`,
        [
          input.clienteId ?? null,
          input.metodoPago,
          calculada.subtotal,
          calculada.total,
          calculada.gananciaEstimada,
        ],
      );
      const ventaId = this.bd.ultimoIdInsertado();

      for (const detalle of calculada.detalles) {
        this.bd.ejecutar(
          `INSERT INTO detalle_venta
             (venta_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal, ganancia_linea)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            ventaId,
            detalle.productoId,
            detalle.cantidad,
            detalle.precioUnitario,
            detalle.costoUnitario,
            detalle.subtotal,
            detalle.gananciaLinea,
          ],
        );

        const producto = this.productos.obtenerPorId(detalle.productoId);
        const stockNuevo = calcularStockNuevo(producto.stockActual, 0, detalle.cantidad);
        this.productos.actualizarStock(producto.id, stockNuevo);

        this.bd.ejecutar(
          `INSERT INTO movimiento_inventario
             (producto_id, tipo, cantidad, motivo, venta_id, stock_resultante)
           VALUES (?, 'salida', ?, 'venta', ?, ?)`,
          [detalle.productoId, detalle.cantidad, ventaId, stockNuevo],
        );
      }

      if (input.metodoPago === 'fiado') {
        this.registrarFiado(input.clienteId as number, calculada.total, ventaId);
      } else {
        this.caja.registrarIngreso(calculada.total, `Venta #${ventaId}`, input.metodoPago, ventaId);
      }

      return this.obtenerPorId(ventaId);
    });
  }

  obtenerPorId(id: number): Venta {
    const fila = this.bd.consultar<FilaVenta>('SELECT * FROM venta WHERE id = ?', [id])[0];
    if (!fila) {
      throw new ErrorDeNegocio(`La venta ${id} no existe.`);
    }
    return mapearVenta(fila);
  }

  listarDeHoy(): Venta[] {
    return this.bd
      .consultar<FilaVenta>(
        `SELECT * FROM venta
         WHERE anulada = 0 AND date(fecha_hora) = date('now')
         ORDER BY fecha_hora DESC`,
      )
      .map(mapearVenta);
  }

  resumenDelDia(fechaIso?: string): ResumenDia {
    const filtroFecha = fechaIso ? 'date(fecha_hora) = ?' : "date(fecha_hora) = date('now')";
    const parametrosFecha = fechaIso ? [fechaIso] : [];

    const totales = this.bd.consultar<{
      total_ventas: number | null;
      ganancia_estimada: number | null;
      numero_ventas: number;
    }>(
      `SELECT
         COALESCE(SUM(total), 0) AS total_ventas,
         COALESCE(SUM(ganancia_estimada), 0) AS ganancia_estimada,
         COUNT(*) AS numero_ventas
       FROM venta
       WHERE anulada = 0 AND ${filtroFecha}`,
      parametrosFecha,
    )[0] ?? { total_ventas: 0, ganancia_estimada: 0, numero_ventas: 0 };

    const porMetodo = this.bd.consultar<{ metodo_pago: Venta['metodoPago']; monto: number }>(
      `SELECT metodo_pago, COALESCE(SUM(total), 0) AS monto
       FROM venta
       WHERE anulada = 0 AND ${filtroFecha}
       GROUP BY metodo_pago`,
      parametrosFecha,
    );

    const stockBajo = this.bd.consultar<{ total: number }>(
      `SELECT COUNT(*) AS total FROM producto WHERE activo = 1 AND stock_actual <= stock_minimo`,
    )[0] ?? { total: 0 };

    const porCobrar = this.bd.consultar<{ total: number | null }>(
      `SELECT COALESCE(SUM(saldo_pendiente), 0) AS total FROM cliente WHERE activo = 1`,
    )[0] ?? { total: 0 };

    return {
      fecha: fechaIso ?? new Date().toISOString().slice(0, 10),
      totalVentas: totales.total_ventas ?? 0,
      gananciaEstimada: totales.ganancia_estimada ?? 0,
      numeroVentas: totales.numero_ventas,
      porMetodoPago: porMetodo.map((fila) => ({ metodo: fila.metodo_pago, monto: fila.monto })),
      productosStockBajo: stockBajo.total,
      totalPorCobrar: porCobrar.total ?? 0,
    };
  }

  listarDetalleParaExportar(): FilaVentaDetallada[] {
    return this.bd
      .consultar<{
        fecha_hora: string;
        producto: string;
        cantidad: number;
        precio_unitario: number;
        subtotal: number;
        metodo_pago: string;
        cliente: string | null;
      }>(
        `SELECT
           v.fecha_hora AS fecha_hora,
           p.nombre AS producto,
           dv.cantidad AS cantidad,
           dv.precio_unitario AS precio_unitario,
           dv.subtotal AS subtotal,
           v.metodo_pago AS metodo_pago,
           c.nombre AS cliente
         FROM detalle_venta dv
         JOIN venta v ON v.id = dv.venta_id
         JOIN producto p ON p.id = dv.producto_id
         LEFT JOIN cliente c ON c.id = v.cliente_id
         WHERE v.anulada = 0
         ORDER BY v.fecha_hora DESC`,
      )
      .map((fila) => ({
        fecha: fila.fecha_hora,
        producto: fila.producto,
        cantidad: fila.cantidad,
        precioUnitario: fila.precio_unitario,
        subtotal: fila.subtotal,
        metodoPago: fila.metodo_pago,
        cliente: fila.cliente,
      }));
  }

  private registrarFiado(clienteId: number, monto: number, ventaId: number): void {
    const filaCliente = this.bd.consultar<{ saldo_pendiente: number }>(
      'SELECT saldo_pendiente FROM cliente WHERE id = ?',
      [clienteId],
    )[0];
    if (!filaCliente) {
      throw new ErrorDeNegocio(`El cliente ${clienteId} no existe.`);
    }

    const deudaAnterior = filaCliente.saldo_pendiente;
    const deudaNueva = calcularDeudaNueva(deudaAnterior, monto, 0);

    this.bd.ejecutar(
      `INSERT INTO deuda_cliente (cliente_id, venta_id, monto, saldo_pendiente, estado)
       VALUES (?, ?, ?, ?, 'pendiente')`,
      [clienteId, ventaId, monto, monto],
    );
    this.bd.ejecutar(`UPDATE cliente SET saldo_pendiente = ? WHERE id = ?`, [deudaNueva, clienteId]);
  }
}
