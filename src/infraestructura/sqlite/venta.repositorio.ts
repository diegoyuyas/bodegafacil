import type { CajaRepositorio, ConfiguracionRepositorio, ProductoRepositorio, VentaRepositorio } from '@/core/repositorios';
import {
  ErrorDeNegocio,
  calcularDeudaNueva,
  calcularStockNuevo,
  construirVenta,
  redondear,
} from '@/core/reglas-negocio';
import { calcularEstadoPlan, CLAVE_PLAN_VENCE_EN, LIMITE_VENTAS_PLAN_GRATIS } from '@/core/plan';
import type {
  LineaVentaMensaje,
  LineaVentaResumen,
  ProductoMasVendidoItem,
  RegistrarVentaInput,
  ResumenDia,
  Venta,
  VentaListaItem,
  VentaReimpresionItem,
} from '@/core/tipos';
import type { FilaVentaDetallada } from '@/core/exportacion';
import { ahoraLocalSql, hoyLocalSql } from '@/core/tiempo';
import type { BaseDatosLocal } from './base-datos';
import { mapearVenta, type FilaVenta } from './mapeadores';

export class VentaRepositorioSqlite implements VentaRepositorio {
  constructor(
    private readonly bd: BaseDatosLocal,
    private readonly productos: ProductoRepositorio,
    private readonly caja: CajaRepositorio,
    private readonly configuracion: ConfiguracionRepositorio,
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

      const estadoPlan = calcularEstadoPlan(this.configuracion.obtenerValor(CLAVE_PLAN_VENCE_EN), hoyLocalSql());
      if (estadoPlan.tipo === 'gratis' && this.contarTotalHistorico() >= LIMITE_VENTAS_PLAN_GRATIS) {
        throw new ErrorDeNegocio(
          `Llegaste al límite de ${LIMITE_VENTAS_PLAN_GRATIS} pedidos del Plan Gratis. Activa Premium para seguir vendiendo.`,
        );
      }

      const calculada = construirVenta(input.lineas, (id) => this.productos.obtenerPorId(id));

      this.bd.ejecutar(
        `INSERT INTO venta (fecha_hora, cliente_id, metodo_pago, subtotal, total, ganancia_estimada, telefono_whatsapp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          ahoraLocalSql(),
          input.clienteId ?? null,
          input.metodoPago,
          calculada.subtotal,
          calculada.total,
          calculada.gananciaEstimada,
          input.telefonoWhatsapp ?? null,
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
        if (producto.controlaStock) {
          const stockNuevo = calcularStockNuevo(producto.stockActual, 0, detalle.cantidad);
          this.productos.actualizarStock(producto.id, stockNuevo);

          this.bd.ejecutar(
            `INSERT INTO movimiento_inventario
               (producto_id, tipo, cantidad, motivo, venta_id, stock_resultante)
             VALUES (?, 'salida', ?, 'venta', ?, ?)`,
            [detalle.productoId, detalle.cantidad, ventaId, stockNuevo],
          );
        }
      }

      if (input.metodoPago === 'fiado') {
        this.registrarFiado(input.clienteId as number, calculada.total, ventaId);
      } else {
        this.caja.registrarIngreso(calculada.total, `Venta V-${ventaId}`, input.metodoPago, ventaId);
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
         WHERE anulada = 0 AND substr(fecha_hora, 1, 10) = ?
         ORDER BY fecha_hora DESC`,
        [hoyLocalSql()],
      )
      .map(mapearVenta);
  }

  listarDeHoyConDetalle(): VentaListaItem[] {
    return this.bd
      .consultar<{
        id: number;
        fecha_hora: string;
        metodo_pago: Venta['metodoPago'];
        total: number;
        cliente: string | null;
        anulada: number;
      }>(
        `SELECT v.id AS id, v.fecha_hora AS fecha_hora, v.metodo_pago AS metodo_pago,
                v.total AS total, c.nombre AS cliente, v.anulada AS anulada
         FROM venta v
         LEFT JOIN cliente c ON c.id = v.cliente_id
         WHERE substr(v.fecha_hora, 1, 10) = ?
         ORDER BY v.id DESC`,
        [hoyLocalSql()],
      )
      .map((fila) => ({
        id: fila.id,
        fechaHora: fila.fecha_hora,
        metodoPago: fila.metodo_pago,
        total: fila.total,
        clienteNombre: fila.cliente,
        anulada: fila.anulada === 1,
      }));
  }

  buscarParaReimprimir(desde: string, hasta: string, texto: string): VentaReimpresionItem[] {
    const textoLimpio = texto.trim();
    return this.bd
      .consultar<{
        id: number;
        fecha_hora: string;
        metodo_pago: Venta['metodoPago'];
        total: number;
        cliente: string | null;
        documento: string | null;
        anulada: number;
      }>(
        `SELECT v.id AS id, v.fecha_hora AS fecha_hora, v.metodo_pago AS metodo_pago,
                v.total AS total, c.nombre AS cliente, c.documento AS documento, v.anulada AS anulada
         FROM venta v
         LEFT JOIN cliente c ON c.id = v.cliente_id
         WHERE date(v.fecha_hora) BETWEEN ? AND ?
           AND (
             ? = '' OR
             ('V-' || v.id) LIKE '%' || ? || '%' OR
             c.nombre LIKE '%' || ? || '%' OR
             c.documento LIKE '%' || ? || '%' OR
             CAST(v.total AS TEXT) LIKE '%' || ? || '%'
           )
         ORDER BY v.id DESC`,
        [desde, hasta, textoLimpio, textoLimpio, textoLimpio, textoLimpio, textoLimpio],
      )
      .map((fila) => ({
        id: fila.id,
        fechaHora: fila.fecha_hora,
        metodoPago: fila.metodo_pago,
        total: fila.total,
        clienteNombre: fila.cliente,
        clienteDocumento: fila.documento,
        anulada: fila.anulada === 1,
      }));
  }

  obtenerLineas(ventaId: number): LineaVentaResumen[] {
    return this.bd.consultar<LineaVentaResumen>(
      `SELECT p.nombre AS producto, dv.cantidad AS cantidad
       FROM detalle_venta dv
       JOIN producto p ON p.id = dv.producto_id
       WHERE dv.venta_id = ?
       ORDER BY dv.id`,
      [ventaId],
    );
  }

  /** Líneas con precio unitario y subtotal, para armar el mensaje de WhatsApp de una venta. */
  obtenerLineasParaMensaje(ventaId: number): LineaVentaMensaje[] {
    return this.bd
      .consultar<{
        producto: string;
        cantidad: number;
        precio_unitario: number;
        subtotal: number;
      }>(
        `SELECT p.nombre AS producto, dv.cantidad AS cantidad,
                dv.precio_unitario AS precio_unitario, dv.subtotal AS subtotal
         FROM detalle_venta dv
         JOIN producto p ON p.id = dv.producto_id
         WHERE dv.venta_id = ?
         ORDER BY dv.id`,
        [ventaId],
      )
      .map((fila) => ({
        producto: fila.producto,
        cantidad: fila.cantidad,
        precioUnitario: fila.precio_unitario,
        subtotal: fila.subtotal,
      }));
  }

  /**
   * Anula una venta: repone el stock vendido, revierte el efecto en
   * caja (si se pagó al contado) o reduce la deuda del cliente (si
   * fue al fiado), y marca la venta como anulada. No se borra nada —
   * queda trazabilidad completa, tal como una venta anulada real.
   */
  anularVenta(id: number, motivo?: string): void {
    this.bd.transaccion(() => {
      const venta = this.obtenerPorId(id);
      if (venta.anulada) {
        throw new ErrorDeNegocio(`La venta V-${id} ya estaba anulada.`);
      }

      const lineas = this.bd.consultar<{ producto_id: number; cantidad: number }>(
        'SELECT producto_id, cantidad FROM detalle_venta WHERE venta_id = ?',
        [id],
      );

      for (const linea of lineas) {
        const producto = this.productos.obtenerPorId(linea.producto_id);
        if (!producto.controlaStock) continue;
        const stockNuevo = calcularStockNuevo(producto.stockActual, linea.cantidad, 0);
        this.productos.actualizarStock(producto.id, stockNuevo);
        this.bd.ejecutar(
          `INSERT INTO movimiento_inventario
             (producto_id, tipo, cantidad, motivo, venta_id, stock_resultante)
           VALUES (?, 'entrada', ?, 'anulacion', ?, ?)`,
          [linea.producto_id, linea.cantidad, id, stockNuevo],
        );
      }

      if (venta.metodoPago === 'fiado') {
        if (venta.clienteId) {
          const filaCliente = this.bd.consultar<{ saldo_pendiente: number }>(
            'SELECT saldo_pendiente FROM cliente WHERE id = ?',
            [venta.clienteId],
          )[0];
          if (filaCliente) {
            const saldoNuevo = Math.max(0, redondear(filaCliente.saldo_pendiente - venta.total));
            this.bd.ejecutar('UPDATE cliente SET saldo_pendiente = ? WHERE id = ?', [
              saldoNuevo,
              venta.clienteId,
            ]);
          }
        }
      } else {
        this.caja.registrarEgreso(venta.total, `Anulación de V-${id}`, venta.metodoPago);
      }

      this.bd.ejecutar('UPDATE venta SET anulada = 1, motivo_anulacion = ? WHERE id = ?', [
        motivo ?? 'Anulada desde Inicio',
        id,
      ]);
    });
  }

  actualizarTelefonoWhatsapp(id: number, telefono: string): void {
    this.bd.ejecutar('UPDATE venta SET telefono_whatsapp = ? WHERE id = ?', [telefono, id]);
  }

  resumenDelDia(fechaIso?: string): ResumenDia {
    const fecha = fechaIso ?? hoyLocalSql();

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
       WHERE anulada = 0 AND substr(fecha_hora, 1, 10) = ?`,
      [fecha],
    )[0] ?? { total_ventas: 0, ganancia_estimada: 0, numero_ventas: 0 };

    const porMetodo = this.bd.consultar<{ metodo_pago: Venta['metodoPago']; monto: number }>(
      `SELECT metodo_pago, COALESCE(SUM(total), 0) AS monto
       FROM venta
       WHERE anulada = 0 AND substr(fecha_hora, 1, 10) = ?
       GROUP BY metodo_pago`,
      [fecha],
    );

    const stockBajo = this.bd.consultar<{ total: number }>(
      `SELECT COUNT(*) AS total FROM producto WHERE activo = 1 AND controla_stock = 1 AND stock_actual <= stock_minimo`,
    )[0] ?? { total: 0 };

    const porCobrar = this.bd.consultar<{ total: number | null }>(
      `SELECT COALESCE(SUM(saldo_pendiente), 0) AS total FROM cliente WHERE activo = 1`,
    )[0] ?? { total: 0 };

    return {
      fecha,
      totalVentas: totales.total_ventas ?? 0,
      gananciaEstimada: totales.ganancia_estimada ?? 0,
      numeroVentas: totales.numero_ventas,
      porMetodoPago: porMetodo.map((fila) => ({ metodo: fila.metodo_pago, monto: fila.monto })),
      productosStockBajo: stockBajo.total,
      totalPorCobrar: porCobrar.total ?? 0,
    };
  }

  contarTotalHistorico(): number {
    const fila = this.bd.consultar<{ total: number }>(
      'SELECT COUNT(*) AS total FROM venta WHERE anulada = 0',
    )[0];
    return fila?.total ?? 0;
  }

  listarDetalleParaExportar(desde?: string, hasta?: string): FilaVentaDetallada[] {
    const condicionesFecha: string[] = [];
    const parametros: string[] = [];
    if (desde) {
      condicionesFecha.push('substr(v.fecha_hora, 1, 10) >= ?');
      parametros.push(desde);
    }
    if (hasta) {
      condicionesFecha.push('substr(v.fecha_hora, 1, 10) <= ?');
      parametros.push(hasta);
    }
    const clausulaFecha = condicionesFecha.length ? ` AND ${condicionesFecha.join(' AND ')}` : '';

    return this.bd
      .consultar<{
        id: number;
        fecha_hora: string;
        producto: string;
        cantidad: number;
        precio_unitario: number;
        subtotal: number;
        metodo_pago: string;
        cliente: string | null;
      }>(
        `SELECT
           v.id AS id,
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
         WHERE v.anulada = 0${clausulaFecha}
         ORDER BY v.fecha_hora DESC`,
        parametros,
      )
      .map((fila) => ({
        pedido: `V-${fila.id}`,
        fecha: fila.fecha_hora,
        producto: fila.producto,
        cantidad: fila.cantidad,
        precioUnitario: fila.precio_unitario,
        subtotal: fila.subtotal,
        metodoPago: fila.metodo_pago,
        cliente: fila.cliente ?? 'Cliente Eventual',
      }));
  }

  listarProductosMasVendidos(
    desde: string,
    hasta: string,
    limite = 20,
  ): ProductoMasVendidoItem[] {
    return this.bd
      .consultar<{
        producto_id: number;
        nombre: string;
        cantidad_vendida: number;
        total_vendido: number;
        ganancia_total: number;
      }>(
        `SELECT
           p.id AS producto_id,
           p.nombre AS nombre,
           SUM(dv.cantidad) AS cantidad_vendida,
           SUM(dv.subtotal) AS total_vendido,
           SUM(dv.ganancia_linea) AS ganancia_total
         FROM detalle_venta dv
         JOIN venta v ON v.id = dv.venta_id
         JOIN producto p ON p.id = dv.producto_id
         WHERE v.anulada = 0
           AND substr(v.fecha_hora, 1, 10) >= ?
           AND substr(v.fecha_hora, 1, 10) <= ?
         GROUP BY p.id, p.nombre
         ORDER BY cantidad_vendida DESC
         LIMIT ?`,
        [desde, hasta, limite],
      )
      .map((fila) => ({
        productoId: fila.producto_id,
        nombre: fila.nombre,
        cantidadVendida: fila.cantidad_vendida,
        totalVendido: fila.total_vendido,
        gananciaTotal: fila.ganancia_total,
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
