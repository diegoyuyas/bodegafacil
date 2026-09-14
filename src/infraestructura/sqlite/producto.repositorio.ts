import type { DatosActualizarProducto, DatosNuevoProducto, ProductoRepositorio } from '@/core/repositorios';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import type { Producto } from '@/core/tipos';
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
    return this.bd
      .consultar<FilaProducto>(
        `SELECT * FROM producto
         WHERE activo = 1 AND nombre LIKE ?
         ORDER BY nombre LIMIT 20`,
        [`%${texto}%`],
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
}
