import type { DatosActualizarProducto, DatosNuevoProducto, ProductoRepositorio } from '@/core/repositorios';
import { ErrorDeNegocio, calcularStockNuevo } from '@/core/reglas-negocio';
import { aMayusculas } from '@/core/texto';
import type {
  CampoHistorialProducto,
  HistorialProductoItem,
  MovimientoInventarioItem,
  Producto,
} from '@/core/tipos';
import { ahoraLocalSql } from '@/core/tiempo';
import type { BaseDatosLocal } from './base-datos';
import { mapearMovimientoInventario, mapearProducto, type FilaMovimientoInventario, type FilaProducto } from './mapeadores';

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
    const nombreNormalizado = aMayusculas(datos.nombre);
    if (this.existeNombre(nombreNormalizado)) {
      throw new ErrorDeNegocio(`Ya existe un producto llamado "${nombreNormalizado}".`);
    }

    return this.bd.transaccion(() => {
      const stockInicial = datos.controlaStock ? datos.stockActual : 0;
      const stockMinimoInicial = datos.controlaStock ? datos.stockMinimo : 0;

      this.bd.ejecutar(
        `INSERT INTO producto
           (nombre, categoria_id, codigo, precio_venta, costo, stock_actual, stock_minimo, controla_stock, unidad_medida)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nombreNormalizado,
          datos.categoriaId ?? null,
          datos.codigo ?? null,
          datos.precioVenta,
          datos.costo,
          stockInicial,
          stockMinimoInicial,
          datos.controlaStock ? 1 : 0,
          datos.unidadMedida,
        ],
      );
      const id = this.bd.ultimoIdInsertado();

      // Deja en la bitácora con qué valores se registró, para tener un
      // punto de partida con el que comparar cambios futuros.
      this.registrarHistorial(id, 'nombre', null, nombreNormalizado);
      this.registrarHistorial(id, 'precio_venta', null, String(datos.precioVenta));
      this.registrarHistorial(id, 'costo', null, String(datos.costo));
      this.registrarHistorial(id, 'stock', null, String(stockInicial));
      this.registrarHistorial(id, 'stock_minimo', null, String(stockMinimoInicial));

      return this.obtenerPorId(id);
    });
  }

  actualizarStock(id: number, nuevoStock: number): void {
    this.bd.ejecutar(
      `UPDATE producto SET stock_actual = ?, actualizado_en = datetime('now') WHERE id = ?`,
      [nuevoStock, id],
    );
  }

  actualizar(id: number, datos: DatosActualizarProducto): Producto {
    const actual = this.obtenerPorId(id); // valida que exista
    if (!datos.nombre.trim()) {
      throw new ErrorDeNegocio('El nombre del producto es obligatorio.');
    }
    if (datos.precioVenta < 0 || datos.costo < 0 || datos.stockMinimo < 0) {
      throw new ErrorDeNegocio('Los montos y el stock mínimo no pueden ser negativos.');
    }
    const nombreNormalizado = aMayusculas(datos.nombre);
    if (this.existeNombre(nombreNormalizado, id)) {
      throw new ErrorDeNegocio(`Ya existe un producto llamado "${nombreNormalizado}".`);
    }

    return this.bd.transaccion(() => {
      const stockMinimoNuevo = datos.controlaStock ? datos.stockMinimo : 0;

      this.bd.ejecutar(
        `UPDATE producto
           SET nombre = ?, categoria_id = ?, codigo = ?, precio_venta = ?, costo = ?,
               stock_minimo = ?, controla_stock = ?, unidad_medida = ?, activo = ?, actualizado_en = datetime('now')
         WHERE id = ?`,
        [
          nombreNormalizado,
          datos.categoriaId ?? null,
          datos.codigo ?? null,
          datos.precioVenta,
          datos.costo,
          stockMinimoNuevo,
          datos.controlaStock ? 1 : 0,
          datos.unidadMedida,
          datos.activo ? 1 : 0,
          id,
        ],
      );
      // Si se desactivó el control de stock, el stock actual también vuelve a 0
      // (no tiene sentido dejar un número "colgado" que ya no se usa para nada).
      const stockNuevo = datos.controlaStock ? actual.stockActual : 0;
      if (!datos.controlaStock) {
        this.actualizarStock(id, 0);
      }

      // Bitácora: solo se deja constancia de lo que REALMENTE cambió.
      if (actual.nombre !== nombreNormalizado) {
        this.registrarHistorial(id, 'nombre', actual.nombre, nombreNormalizado);
      }
      if (actual.precioVenta !== datos.precioVenta) {
        this.registrarHistorial(id, 'precio_venta', String(actual.precioVenta), String(datos.precioVenta));
      }
      if (actual.costo !== datos.costo) {
        this.registrarHistorial(id, 'costo', String(actual.costo), String(datos.costo));
      }
      if (actual.stockMinimo !== stockMinimoNuevo) {
        this.registrarHistorial(id, 'stock_minimo', String(actual.stockMinimo), String(stockMinimoNuevo));
      }
      if (actual.stockActual !== stockNuevo) {
        this.registrarHistorial(id, 'stock', String(actual.stockActual), String(stockNuevo));
      }

      return this.obtenerPorId(id);
    });
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
      this.registrarHistorial(id, 'stock', String(producto.stockActual), String(stockNuevo), motivo.trim());
      return this.obtenerPorId(id);
    });
  }

  listarHistorial(productoId: number): HistorialProductoItem[] {
    return this.bd
      .consultar<{
        campo: CampoHistorialProducto;
        valor_anterior: string | null;
        valor_nuevo: string;
        motivo: string | null;
        fecha: string;
      }>(
        `SELECT campo, valor_anterior, valor_nuevo, motivo, fecha FROM producto_historial
         WHERE producto_id = ?
         ORDER BY fecha DESC, id DESC`,
        [productoId],
      )
      .map((f) => ({
        campo: f.campo,
        valorAnterior: f.valor_anterior,
        valorNuevo: f.valor_nuevo,
        motivo: f.motivo,
        fecha: f.fecha,
      }));
  }

  private registrarHistorial(
    productoId: number,
    campo: CampoHistorialProducto,
    valorAnterior: string | null,
    valorNuevo: string,
    motivo?: string,
  ): void {
    this.bd.ejecutar(
      `INSERT INTO producto_historial (producto_id, campo, valor_anterior, valor_nuevo, motivo, fecha)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [productoId, campo, valorAnterior, valorNuevo, motivo ?? null, ahoraLocalSql()],
    );
  }

  /**
   * No se permiten 2 productos con el mismo nombre (comparación exacta
   * tras `aMayusculas`, que ya es como se guardan todos). `idAExcluir`
   * es el propio producto al editar, para no chocar contra sí mismo.
   */
  private existeNombre(nombreNormalizado: string, idAExcluir?: number): boolean {
    const filas = this.bd.consultar<{ id: number }>('SELECT id FROM producto WHERE nombre = ?', [
      nombreNormalizado,
    ]);
    return filas.some((fila) => fila.id !== idAExcluir);
  }

  listarMovimientosInventario(productoId: number, desde: string, hasta: string): MovimientoInventarioItem[] {
    return this.bd
      .consultar<FilaMovimientoInventario>(
        `SELECT * FROM movimiento_inventario
         WHERE producto_id = ? AND date(fecha_hora) BETWEEN ? AND ?
         ORDER BY fecha_hora ASC, id ASC`,
        [productoId, desde, hasta],
      )
      .map(mapearMovimientoInventario);
  }
}
