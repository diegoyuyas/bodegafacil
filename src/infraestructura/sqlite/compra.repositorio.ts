import type {
  CajaRepositorio,
  CompraRepositorio,
  ProductoRepositorio,
  RegistrarCompraInput,
} from '@/core/repositorios';
import { ErrorDeNegocio, calcularStockNuevo, redondear } from '@/core/reglas-negocio';
import type { Compra } from '@/core/tipos';
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

    return this.bd.transaccion(() => {
      const total = redondear(
        input.lineas.reduce((suma, l) => suma + l.cantidad * l.costoUnitario, 0),
      );

      this.bd.ejecutar(
        `INSERT INTO compra (proveedor_id, total, estado) VALUES (?, ?, 'recibida')`,
        [input.proveedorId ?? null, total],
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

  private obtenerPorId(id: number): Compra {
    const fila = this.bd.consultar<FilaCompra>('SELECT * FROM compra WHERE id = ?', [id])[0];
    if (!fila) {
      throw new ErrorDeNegocio(`La compra ${id} no existe.`);
    }
    return mapearCompra(fila);
  }
}
