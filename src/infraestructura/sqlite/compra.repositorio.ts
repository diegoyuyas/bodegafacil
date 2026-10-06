import type {
  CajaRepositorio,
  CompraRepositorio,
  LineaCompraEntrada,
  ProductoRepositorio,
  RegistrarCompraInput,
} from '@/core/repositorios';
import { ErrorDeNegocio, calcularStockNuevo, redondear, validarComprobante } from '@/core/reglas-negocio';
import { ahoraLocalSql } from '@/core/tiempo';
import type { Compra, CompraListaItem, HistorialCostoItem, MetodoPagoSinFiado } from '@/core/tipos';
import type { FilaCompraDetallada } from '@/core/exportacion';
import type { BaseDatosLocal } from './base-datos';
import { mapearCompra, type FilaCompra } from './mapeadores';

export class CompraRepositorioSqlite implements CompraRepositorio {
  constructor(
    private readonly bd: BaseDatosLocal,
    private readonly productos: ProductoRepositorio,
    private readonly caja: CajaRepositorio,
  ) {}

  registrarCompra(input: RegistrarCompraInput): Compra {
    if (input.lineas.length === 0) {
      throw new ErrorDeNegocio('Una compra debe tener al menos un producto.');
    }
    if (input.comprobante) {
      validarComprobante(input.comprobante);
    }

    return this.bd.transaccion(() => {
      const total = redondear(
        input.lineas.reduce((suma, l) => suma + l.cantidad * l.costoUnitario, 0),
      );

      this.bd.ejecutar(
        `INSERT INTO compra (fecha, proveedor_id, proveedor_nombre_libre, comprobante, total, estado, metodo_pago)
         VALUES (?, ?, ?, ?, ?, 'recibida', ?)`,
        [
          ahoraLocalSql(),
          input.proveedorId ?? null,
          input.proveedorId ? null : input.proveedorNombreLibre || null,
          input.comprobante || null,
          total,
          input.metodoPago,
        ],
      );
      const compraId = this.bd.ultimoIdInsertado();

      for (const linea of input.lineas) {
        this.aplicarLineaDeCompra(compraId, linea, 'compra');
      }

      this.caja.registrarEgreso(total, `Compra C-${compraId}`, input.metodoPago, { compraId });

      return this.obtenerPorId(compraId);
    });
  }

  listarRecientes(limite = 20): Compra[] {
    return this.bd
      .consultar<FilaCompra>('SELECT * FROM compra ORDER BY id DESC LIMIT ?', [limite])
      .map(mapearCompra);
  }

  /**
   * Listado para Más > Compras y para el reporte (Premium). `desde`/
   * `hasta` ('YYYY-MM-DD') son opcionales — sin ellos trae todo el
   * historial. `productos` trae los nombres de línea de esa compra
   * separados por coma, solo para poder buscar por producto en el
   * listado sin tener que hacer una consulta aparte por cada fila.
   */
  listarPorRango(desde?: string, hasta?: string): CompraListaItem[] {
    const condicionesFecha: string[] = [];
    const parametros: string[] = [];
    if (desde) {
      condicionesFecha.push('substr(c.fecha, 1, 10) >= ?');
      parametros.push(desde);
    }
    if (hasta) {
      condicionesFecha.push('substr(c.fecha, 1, 10) <= ?');
      parametros.push(hasta);
    }
    const clausulaFecha = condicionesFecha.length ? ` WHERE ${condicionesFecha.join(' AND ')}` : '';

    return this.bd
      .consultar<{
        id: number;
        fecha: string;
        proveedor_nombre_libre: string | null;
        proveedor_nombre_guardado: string | null;
        comprobante: string | null;
        total: number;
        estado: Compra['estado'];
        metodo_pago: MetodoPagoSinFiado | null;
        productos: string | null;
      }>(
        `SELECT c.id AS id, c.fecha AS fecha,
                c.proveedor_nombre_libre AS proveedor_nombre_libre,
                pv.nombre AS proveedor_nombre_guardado,
                c.comprobante AS comprobante, c.total AS total, c.estado AS estado,
                c.metodo_pago AS metodo_pago,
                (SELECT GROUP_CONCAT(p.nombre, ', ') FROM detalle_compra dc
                   JOIN producto p ON p.id = dc.producto_id
                  WHERE dc.compra_id = c.id) AS productos
         FROM compra c
         LEFT JOIN proveedor pv ON pv.id = c.proveedor_id
         ${clausulaFecha}
         ORDER BY c.id DESC`,
        parametros,
      )
      .map((fila) => ({
        id: fila.id,
        fecha: fila.fecha,
        proveedorNombre: fila.proveedor_nombre_guardado ?? fila.proveedor_nombre_libre,
        comprobante: fila.comprobante,
        total: fila.total,
        estado: fila.estado,
        metodoPago: fila.metodo_pago,
        productos: fila.productos ?? '',
      }));
  }

  listarDetalleParaExportar(desde?: string, hasta?: string): FilaCompraDetallada[] {
    const condicionesFecha: string[] = [];
    const parametros: string[] = [];
    if (desde) {
      condicionesFecha.push('substr(c.fecha, 1, 10) >= ?');
      parametros.push(desde);
    }
    if (hasta) {
      condicionesFecha.push('substr(c.fecha, 1, 10) <= ?');
      parametros.push(hasta);
    }
    const clausulaFecha = condicionesFecha.length ? ` AND ${condicionesFecha.join(' AND ')}` : '';

    return this.bd
      .consultar<{
        id: number;
        fecha: string;
        proveedor_nombre_libre: string | null;
        proveedor_nombre_guardado: string | null;
        producto: string;
        cantidad: number;
        costo_unitario: number;
        subtotal: number;
        total_compra: number;
        comprobante: string | null;
        estado: Compra['estado'];
      }>(
        `SELECT
           c.id AS id,
           c.fecha AS fecha,
           c.proveedor_nombre_libre AS proveedor_nombre_libre,
           pv.nombre AS proveedor_nombre_guardado,
           p.nombre AS producto,
           dc.cantidad AS cantidad,
           dc.costo_unitario AS costo_unitario,
           dc.subtotal AS subtotal,
           c.total AS total_compra,
           c.comprobante AS comprobante,
           c.estado AS estado
         FROM detalle_compra dc
         JOIN compra c ON c.id = dc.compra_id
         JOIN producto p ON p.id = dc.producto_id
         LEFT JOIN proveedor pv ON pv.id = c.proveedor_id
         WHERE 1 = 1${clausulaFecha}
         ORDER BY c.fecha DESC`,
        parametros,
      )
      .map((fila) => ({
        compra: `C-${fila.id}`,
        fecha: fila.fecha,
        proveedor: fila.proveedor_nombre_guardado ?? fila.proveedor_nombre_libre ?? 'Sin especificar',
        producto: fila.producto,
        cantidad: fila.cantidad,
        precioUnitario: fila.costo_unitario,
        subtotal: fila.subtotal,
        totalCompra: fila.total_compra,
        comprobante: fila.comprobante,
        estado: fila.estado,
      }));
  }

  listarHistorialCostos(productoId: number, desde?: string, hasta?: string): HistorialCostoItem[] {
    const condicionesFecha: string[] = [];
    const parametros: (string | number)[] = [productoId];
    if (desde) {
      condicionesFecha.push('substr(c.fecha, 1, 10) >= ?');
      parametros.push(desde);
    }
    if (hasta) {
      condicionesFecha.push('substr(c.fecha, 1, 10) <= ?');
      parametros.push(hasta);
    }
    const clausulaFecha = condicionesFecha.length ? ` AND ${condicionesFecha.join(' AND ')}` : '';

    return this.bd
      .consultar<{
        compra_id: number;
        fecha: string;
        costo_unitario: number;
        cantidad: number;
        proveedor_nombre_libre: string | null;
        proveedor_nombre_guardado: string | null;
      }>(
        `SELECT
           dc.compra_id AS compra_id,
           c.fecha AS fecha,
           dc.costo_unitario AS costo_unitario,
           dc.cantidad AS cantidad,
           c.proveedor_nombre_libre AS proveedor_nombre_libre,
           pv.nombre AS proveedor_nombre_guardado
         FROM detalle_compra dc
         JOIN compra c ON c.id = dc.compra_id
         LEFT JOIN proveedor pv ON pv.id = c.proveedor_id
         WHERE dc.producto_id = ? AND c.estado != 'anulada'${clausulaFecha}
         ORDER BY c.fecha DESC`,
        parametros,
      )
      .map((fila) => ({
        fecha: fila.fecha,
        costoUnitario: fila.costo_unitario,
        cantidad: fila.cantidad,
        proveedorNombre: fila.proveedor_nombre_guardado ?? fila.proveedor_nombre_libre,
        compraId: fila.compra_id,
      }));
  }

  /** Compra completa + sus líneas (con nombre de producto), para precargar el formulario de Modificar. */
  obtenerParaEditar(id: number): {
    compra: Compra;
    lineas: (LineaCompraEntrada & { nombreProducto: string })[];
  } {
    const compra = this.obtenerPorId(id);
    const lineas = this.bd.consultar<{
      producto_id: number;
      cantidad: number;
      costo_unitario: number;
      nombre: string;
    }>(
      `SELECT dc.producto_id AS producto_id, dc.cantidad AS cantidad,
              dc.costo_unitario AS costo_unitario, p.nombre AS nombre
         FROM detalle_compra dc
         JOIN producto p ON p.id = dc.producto_id
        WHERE dc.compra_id = ?
        ORDER BY dc.id`,
      [id],
    );
    return {
      compra,
      lineas: lineas.map((l) => ({
        productoId: l.producto_id,
        cantidad: l.cantidad,
        costoUnitario: l.costo_unitario,
        nombreProducto: l.nombre,
      })),
    };
  }

  /**
   * Reemplaza proveedor, comprobante, método de pago y líneas de una
   * compra ya registrada: primero retira de stock exactamente lo que
   * esa compra había hecho entrar y revierte su efecto en caja (mismo
   * total y método originales), y recién ahí vuelve a aplicar todo
   * con los datos nuevos — así el stock y la caja quedan como si la
   * compra se hubiera registrado así desde el principio. Conserva el
   * mismo correlativo (id) y la fecha original.
   */
  modificarCompra(id: number, input: RegistrarCompraInput): Compra {
    if (input.lineas.length === 0) {
      throw new ErrorDeNegocio('Una compra debe tener al menos un producto.');
    }
    if (input.comprobante) {
      validarComprobante(input.comprobante);
    }

    return this.bd.transaccion(() => {
      const actual = this.obtenerPorId(id);
      if (actual.estado === 'anulada') {
        throw new ErrorDeNegocio(`La compra C-${id} está anulada; no se puede modificar.`);
      }

      const lineasAnteriores = this.bd.consultar<{ producto_id: number; cantidad: number }>(
        'SELECT producto_id, cantidad FROM detalle_compra WHERE compra_id = ?',
        [id],
      );

      // Se valida el stock FINAL de cada producto (stock actual − lo que esta compra
      // había metido + lo que meterá ahora), no el paso intermedio de "retirar todo
      // y volver a meter": si ya se vendió parte, retirar todo da negativo aunque el
      // resultado final sea correcto (ej. compra 500, vendí 2 → modificar a 450 es válido).
      const anteriorPorProducto = new Map<number, number>();
      for (const l of lineasAnteriores) {
        anteriorPorProducto.set(l.producto_id, redondear((anteriorPorProducto.get(l.producto_id) ?? 0) + l.cantidad));
      }
      const nuevoPorProducto = new Map<number, number>();
      for (const l of input.lineas) {
        nuevoPorProducto.set(l.productoId, redondear((nuevoPorProducto.get(l.productoId) ?? 0) + l.cantidad));
      }
      const idsProductos = new Set<number>([
        ...Array.from(anteriorPorProducto.keys()),
        ...Array.from(nuevoPorProducto.keys()),
      ]);
      Array.from(idsProductos).forEach((productoId) => {
        const producto = this.productos.obtenerPorId(productoId);
        const anterior = anteriorPorProducto.get(productoId) ?? 0;
        const nuevo = nuevoPorProducto.get(productoId) ?? 0;
        const stockFinal = redondear(producto.stockActual - anterior + nuevo);
        if (stockFinal < 0) {
          const minimo = redondear(anterior - producto.stockActual);
          throw new ErrorDeNegocio(
            `No se puede modificar: de "${producto.nombre}" ya salieron ${minimo} unidades de las que entraron en esta compra. La cantidad mínima es ${minimo}.`,
          );
        }
      });

      // Orden: primero entran las líneas nuevas y después salen las anteriores, así el
      // stock nunca pasa por un valor negativo intermedio (ni en el Kardex).
      const idsDetalleAnterior = this.bd
        .consultar<{ id: number }>('SELECT id FROM detalle_compra WHERE compra_id = ?', [id])
        .map((f) => f.id);

      const total = redondear(
        input.lineas.reduce((suma, l) => suma + l.cantidad * l.costoUnitario, 0),
      );
      for (const linea of input.lineas) {
        this.aplicarLineaDeCompra(id, linea, 'modificacion');
      }
      for (const linea of lineasAnteriores) {
        this.revertirLineaDeCompra(id, linea.producto_id, linea.cantidad, 'modificacion');
      }
      for (const detalleId of idsDetalleAnterior) {
        this.bd.ejecutar('DELETE FROM detalle_compra WHERE id = ?', [detalleId]);
      }

      // Caja: UN solo movimiento por la diferencia (en vez de devolver todo y volver a
      // cobrar). Si cambió la forma de pago, se pasa el total de una a la otra.
      // El método antiguo puede faltar en compras muy viejas: se asume efectivo.
      const metodoAnterior = actual.metodoPago ?? 'efectivo';
      const etiqueta = `Ajuste de compra C-${id}`;
      const referencia = { compraId: id, clase: 'ajuste' as const };
      if (metodoAnterior === input.metodoPago) {
        const diferencia = redondear(total - actual.total);
        const detalle = `${etiqueta}: de ${actual.total.toFixed(2)} a ${total.toFixed(2)}`;
        if (diferencia > 0) this.caja.registrarEgreso(diferencia, detalle, input.metodoPago, referencia);
        else if (diferencia < 0) this.caja.registrarIngreso(-diferencia, detalle, input.metodoPago, referencia);
      } else {
        const detalle = `${etiqueta}: cambio de forma de pago`;
        this.caja.registrarIngreso(actual.total, detalle, metodoAnterior, referencia);
        this.caja.registrarEgreso(total, detalle, input.metodoPago, referencia);
      }

      this.bd.ejecutar(
        `UPDATE compra
            SET proveedor_id = ?, proveedor_nombre_libre = ?, comprobante = ?, total = ?, metodo_pago = ?
          WHERE id = ?`,
        [
          input.proveedorId ?? null,
          input.proveedorId ? null : input.proveedorNombreLibre || null,
          input.comprobante || null,
          total,
          input.metodoPago,
          id,
        ],
      );

      return this.obtenerPorId(id);
    });
  }

  /**
   * Anula una compra: retira de stock lo que había entrado (falla con
   * un mensaje claro si ya no queda stock suficiente porque se vendió
   * después), revierte el egreso de caja, y la marca como anulada. No
   * se borra nada — misma idea que `anularVenta`.
   */
  anularCompra(id: number, motivo?: string): void {
    this.bd.transaccion(() => {
      const compra = this.obtenerPorId(id);
      if (compra.estado === 'anulada') {
        throw new ErrorDeNegocio(`La compra C-${id} ya estaba anulada.`);
      }

      const lineas = this.bd.consultar<{ producto_id: number; cantidad: number }>(
        'SELECT producto_id, cantidad FROM detalle_compra WHERE compra_id = ?',
        [id],
      );
      for (const linea of lineas) {
        this.revertirLineaDeCompra(id, linea.producto_id, linea.cantidad, 'anulacion');
      }

      this.caja.registrarIngreso(
      compra.total,
      `Anulación de compra C-${id}`,
      compra.metodoPago ?? 'efectivo',
      { compraId: id, clase: 'anulacion' },
    );

      this.bd.ejecutar('UPDATE compra SET estado = ?, motivo_anulacion = ? WHERE id = ?', [
        'anulada',
        motivo ?? 'Anulada desde Más > Compras',
        id,
      ]);
    });
  }

  /** Entra stock por una línea de compra (nueva o al reaplicar una modificación) y deja trazabilidad en movimiento_inventario. */
  private aplicarLineaDeCompra(compraId: number, linea: LineaCompraEntrada, motivo: 'compra' | 'modificacion'): void {
    const subtotal = redondear(linea.cantidad * linea.costoUnitario);

    this.bd.ejecutar(
      `INSERT INTO detalle_compra (compra_id, producto_id, cantidad, costo_unitario, subtotal)
       VALUES (?, ?, ?, ?, ?)`,
      [compraId, linea.productoId, linea.cantidad, linea.costoUnitario, subtotal],
    );

    const producto = this.productos.obtenerPorId(linea.productoId);
    const stockNuevo = calcularStockNuevo(producto.stockActual, linea.cantidad, 0);
    this.productos.actualizarStock(producto.id, stockNuevo);
    // El costo puede cambiar de una compra a otra; se actualiza para
    // que la ganancia de las próximas ventas sea correcta.
    this.bd.ejecutar('UPDATE producto SET costo = ? WHERE id = ?', [linea.costoUnitario, producto.id]);

    this.bd.ejecutar(
      `INSERT INTO movimiento_inventario
         (producto_id, tipo, cantidad, motivo, compra_id, stock_resultante, fecha_hora)
       VALUES (?, 'entrada', ?, ?, ?, ?, ?)`,
      [linea.productoId, linea.cantidad, motivo, compraId, stockNuevo, ahoraLocalSql()],
    );
  }

  /** Retira de stock lo que una línea de compra había hecho entrar (al anular o antes de reaplicar una modificación). */
  private revertirLineaDeCompra(
    compraId: number,
    productoId: number,
    cantidad: number,
    motivo: 'anulacion' | 'modificacion',
  ): void {
    const producto = this.productos.obtenerPorId(productoId);
    const stockNuevo = calcularStockNuevo(producto.stockActual, 0, cantidad);
    this.productos.actualizarStock(producto.id, stockNuevo);
    this.bd.ejecutar(
      `INSERT INTO movimiento_inventario
         (producto_id, tipo, cantidad, motivo, compra_id, stock_resultante, fecha_hora)
       VALUES (?, 'salida', ?, ?, ?, ?, ?)`,
      [productoId, cantidad, motivo, compraId, stockNuevo, ahoraLocalSql()],
    );
  }

  private obtenerPorId(id: number): Compra {
    const fila = this.bd.consultar<FilaCompra>('SELECT * FROM compra WHERE id = ?', [id])[0];
    if (!fila) {
      throw new ErrorDeNegocio(`La compra ${id} no existe.`);
    }
    return mapearCompra(fila);
  }
}
