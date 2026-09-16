import type {
  CajaRepositorio,
  CompraRepositorio,
  ProductoRepositorio,
  RegistrarCompraInput,
} from '@/core/repositorios';
import { ErrorDeNegocio, calcularStockNuevo, redondear, validarComprobante } from '@/core/reglas-negocio';
import type { Compra, CompraListaItem, HistorialCostoItem } from '@/core/tipos';
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
        `INSERT INTO compra (proveedor_id, proveedor_nombre_libre, comprobante, total, estado)
         VALUES (?, ?, ?, ?, 'recibida')`,
        [
          input.proveedorId ?? null,
          input.proveedorId ? null : input.proveedorNombreLibre || null,
          input.comprobante || null,
          total,
        ],
      );
      const compraId = this.bd.ultimoIdInsertado();

      for (const linea of input.lineas) {
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
        this.bd.ejecutar('UPDATE producto SET costo = ? WHERE id = ?', [
          linea.costoUnitario,
          producto.id,
        ]);

        this.bd.ejecutar(
          `INSERT INTO movimiento_inventario
             (producto_id, tipo, cantidad, motivo, compra_id, stock_resultante)
           VALUES (?, 'entrada', ?, 'compra', ?, ?)`,
          [linea.productoId, linea.cantidad, compraId, stockNuevo],
        );
      }

      this.caja.registrarEgreso(total, `Compra #${compraId}`, input.metodoPago);

      return this.obtenerPorId(compraId);
    });
  }

  listarRecientes(limite = 20): Compra[] {
    return this.bd
      .consultar<FilaCompra>('SELECT * FROM compra ORDER BY id DESC LIMIT ?', [limite])
      .map(mapearCompra);
  }

  listarPorRango(desde: string, hasta: string): CompraListaItem[] {
    return this.bd
      .consultar<{
        id: number;
        fecha: string;
        proveedor_nombre_libre: string | null;
        proveedor_nombre_guardado: string | null;
        comprobante: string | null;
        total: number;
        estado: Compra['estado'];
      }>(
        `SELECT c.id AS id, c.fecha AS fecha,
                c.proveedor_nombre_libre AS proveedor_nombre_libre,
                pv.nombre AS proveedor_nombre_guardado,
                c.comprobante AS comprobante, c.total AS total, c.estado AS estado
         FROM compra c
         LEFT JOIN proveedor pv ON pv.id = c.proveedor_id
         WHERE substr(c.fecha, 1, 10) >= ? AND substr(c.fecha, 1, 10) <= ?
         ORDER BY c.fecha DESC`,
        [desde, hasta],
      )
      .map((fila) => ({
        id: fila.id,
        fecha: fila.fecha,
        proveedorNombre: fila.proveedor_nombre_guardado ?? fila.proveedor_nombre_libre,
        comprobante: fila.comprobante,
        total: fila.total,
        estado: fila.estado,
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

  private obtenerPorId(id: number): Compra {
    const fila = this.bd.consultar<FilaCompra>('SELECT * FROM compra WHERE id = ?', [id])[0];
    if (!fila) {
      throw new ErrorDeNegocio(`La compra ${id} no existe.`);
    }
    return mapearCompra(fila);
  }
}
