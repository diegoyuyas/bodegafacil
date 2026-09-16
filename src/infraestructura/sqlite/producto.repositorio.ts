import type { DatosActualizarProducto, DatosNuevoProducto, ProductoRepositorio } from '@/core/repositorios';
import { ErrorDeNegocio, calcularStockNuevo } from '@/core/reglas-negocio';
import type { Producto } from '@/core/tipos';
import { ahoraLocalSql } from '@/core/tiempo';
import type { BaseDatosLocal } from './base-datos';
import { mapearProducto, type FilaProducto } from './mapeadores';

export class ProductoRepositorioSqlite implements ProductoRepositorio {
  constructor(private readonly bd: BaseDatosLocal) {}

  listarActivos(): Producto[] {
    return this.bd
      .consultar<FilaProducto>('SELECT * FROM producto WHERE activo = 1 ORDER BY nombre')
      .map(mapearProducto);
  }

  listarTodos(): Producto[] {
    return this.bd
      .consultar<FilaProducto>('SELECT * FROM producto ORDER BY nombre')
      .map(mapearProducto);
  }

  buscarPorNombre(texto: string): Producto[] {
    const patron = `%${texto.trim()}%`;
    return this.bd
      .consultar<FilaProducto>(
        `SELECT * FROM producto
         WHERE activo = 1 AND (nombre LIKE ? OR CAST(precio_venta AS TEXT) LIKE ?)
         ORDER BY nombre LIMIT 20`,
        [patron, patron],
      )
      .map(mapearProducto);
  }

  obtenerPorId(id: number): Producto {
    const fila = this.bd.consultar<FilaProducto>('SELECT * FROM producto WHERE id = ?', [id])[0];
    if (!fila) {
      throw new ErrorDeNegocio(`El producto ${id} no existe.`);
    }
    return mapearProducto(fila);
  }

  crear(datos: DatosNuevoProducto): Producto {
    this.bd.ejecutar(
      `INSERT INTO producto
         (nombre, categoria_id, codigo, precio_venta, costo, stock_actual, stock_minimo, unidad_medida)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        datos.nombre,
        datos.categoriaId ?? null,
        datos.codigo ?? null,
        datos.precioVenta,
        datos.costo,
        datos.stockActual,
        datos.stockMinimo,
        datos.unidadMedida,
      ],
    );
    return this.obtenerPorId(this.bd.ultimoIdInsertado());
  }

  actualizarStock(id: number, nuevoStock: number): void {
    this.bd.ejecutar(
      `UPDATE producto SET stock_actual = ?, actualizado_en = datetime('now') WHERE id = ?`,
      [nuevoStock, id],
    );
  }

  actualizar(id: number, datos: DatosActualizarProducto): Producto {
    this.obtenerPorId(id); // valida que exista
    if (!datos.nombre.trim()) {
      throw new ErrorDeNegocio('El nombre del producto es obligatorio.');
    }
    if (datos.precioVenta < 0 || datos.costo < 0 || datos.stockMinimo < 0) {
      throw new ErrorDeNegocio('Los montos y el stock mínimo no pueden ser negativos.');
    }

    this.bd.ejecutar(
      `UPDATE producto
         SET nombre = ?, categoria_id = ?, codigo = ?, precio_venta = ?, costo = ?,
             stock_minimo = ?, unidad_medida = ?, activo = ?, actualizado_en = datetime('now')
       WHERE id = ?`,
      [
        datos.nombre.trim(),
        datos.categoriaId ?? null,
        datos.codigo ?? null,
        datos.precioVenta,
        datos.costo,
        datos.stockMinimo,
        datos.unidadMedida,
        datos.activo ? 1 : 0,
        id,
      ],
    );
    return this.obtenerPorId(id);
  }

  ajustarStock(id: number, delta: number, motivo: string): Producto {
    if (!Number.isFinite(delta) || delta === 0) {
      throw new ErrorDeNegocio('El ajuste debe ser distinto de cero.');
    }
    if (!motivo.trim()) {
      throw new ErrorDeNegocio('Indica un motivo para el ajuste de stock.');
    }

    return this.bd.transaccion(() => {
      const producto = this.obtenerPorId(id);
      const stockNuevo = calcularStockNuevo(
        producto.stockActual,
        delta > 0 ? delta : 0,
        delta < 0 ? -delta : 0,
      );
      this.actualizarStock(id, stockNuevo);
      this.bd.ejecutar(
        `INSERT INTO movimiento_inventario
           (producto_id, tipo, cantidad, motivo, stock_resultante, fecha_hora)
         VALUES (?, 'ajuste', ?, ?, ?, ?)`,
        [id, delta, motivo.trim(), stockNuevo, ahoraLocalSql()],
      );
      return this.obtenerPorId(id);
    });
  }
}
