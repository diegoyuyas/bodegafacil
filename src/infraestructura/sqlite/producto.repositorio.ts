import type { DatosActualizarProducto, DatosNuevoProducto, ProductoRepositorio } from '@/core/repositorios';
import { ErrorDeNegocio, calcularStockNuevo, validarAlias } from '@/core/reglas-negocio';
import type { RegistroActividad } from '@/core/actividad';
import { aMayusculas, partirAlias, unirAlias } from '@/core/texto';
import type {
  CampoHistorialProducto,
  FormaVenta,
  HistorialProductoItem,
  MovimientoInventarioItem,
  Producto,
} from '@/core/tipos';
import { buscarUnidad, textoUnidad } from '@/core/unidades';
import {
  configuracionFraccionDeProducto,
  convertirAEntero,
  convertirAFracciones,
  textoCantidadFraccion,
  validarConfiguracionFraccion,
} from '@/core/venta-fraccion';
import { ahoraLocalSql } from '@/core/tiempo';
import type { BaseDatosLocal } from './base-datos';
import { mapearMovimientoInventario, mapearProducto, type FilaMovimientoInventario, type FilaProducto } from './mapeadores';

export class ProductoRepositorioSqlite implements ProductoRepositorio {
  constructor(
    private readonly bd: BaseDatosLocal,
    private readonly actividad?: RegistroActividad,
  ) {}

  listarActivos(): Producto[] {
    return this.bd
      .consultar<FilaProducto>('SELECT * FROM producto WHERE activo = 1 ORDER BY nombre')
      .map(mapearProducto);
  }

  listarActivosParaVenta(): Producto[] {
    return this.bd
      .consultar<FilaProducto>(
        // Sin los productos por fracciones: este listado lo usa la venta por voz, que todavía no sabe pedir cajas o unidades.
        "SELECT * FROM producto WHERE activo = 1 AND tipo = 'venta_compra' AND forma_venta = 'entero' ORDER BY nombre",
      )
      .map(mapearProducto);
  }

  listarActivosParaVentaConFracciones(): Producto[] {
    return this.bd
      .consultar<FilaProducto>("SELECT * FROM producto WHERE activo = 1 AND tipo = 'venta_compra' ORDER BY nombre")
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
         WHERE activo = 1 AND tipo = 'venta_compra' AND forma_venta = 'entero' AND (nombre LIKE ? OR CAST(precio_venta AS TEXT) LIKE ?)
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

    const esInsumo = datos.tipo === 'insumo';
    if (esInsumo && datos.costo < 0) {
      throw new ErrorDeNegocio('El costo no puede ser negativo.');
    }
    // Un insumo no se vende, así que nunca lleva alias ni forma de venta por fracciones.
    const alias = esInsumo ? null : this.prepararAlias(datos.alias);
    const fraccion = esInsumo ? null : this.prepararFraccion(datos);

    return this.bd.transaccion(() => {
      // Un insumo nunca lleva stock ni precio de venta: solo sirve para registrar compras.
      const controlaStock = esInsumo ? false : datos.controlaStock;
      const precioVenta = esInsumo ? 0 : datos.precioVenta;
      const stockInicial = controlaStock ? datos.stockActual : 0;
      const stockMinimoInicial = controlaStock ? datos.stockMinimo : 0;
      // Por fracciones, el stock se lleva en la unidad más pequeña y siempre como número entero.
      if (fraccion && controlaStock) {
        this.exigirEnteroFraccion(stockInicial, 'El stock inicial', fraccion.unidadFraccion);
        this.exigirEnteroFraccion(stockMinimoInicial, 'El stock mínimo', fraccion.unidadFraccion);
      }

      this.bd.ejecutar(
        `INSERT INTO producto
           (nombre, categoria_id, codigo, precio_venta, costo, stock_actual, stock_minimo, controla_stock, unidad_medida, tipo, alias,
            forma_venta, unidad_entera, unidad_fraccion, factor_fraccion, precio_fraccion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          nombreNormalizado,
          datos.categoriaId ?? null,
          datos.codigo ?? null,
          precioVenta,
          datos.costo,
          stockInicial,
          stockMinimoInicial,
          controlaStock ? 1 : 0,
          datos.unidadMedida,
          esInsumo ? 'insumo' : 'venta_compra',
          alias,
          fraccion ? 'fraccion' : 'entero',
          fraccion?.unidadEntera ?? null,
          fraccion?.unidadFraccion ?? null,
          fraccion?.factor ?? null,
          fraccion?.precioFraccion ?? null,
        ],
      );
      const id = this.bd.ultimoIdInsertado();

      // Deja en la bitácora con qué valores se registró, para tener un
      // punto de partida con el que comparar cambios futuros.
      this.registrarHistorial(id, 'nombre', null, nombreNormalizado);
      this.registrarHistorial(id, 'precio_venta', null, String(precioVenta));
      this.registrarHistorial(id, 'costo', null, String(datos.costo));
      this.registrarHistorial(id, 'stock', null, String(stockInicial));
      this.registrarHistorial(id, 'stock_minimo', null, String(stockMinimoInicial));
      this.actividad?.registrar({ accion: 'producto_creado', entidad: 'producto', entidadId: id, detalle: nombreNormalizado, permiso: 'gestionar_productos' });

      return this.obtenerPorId(id);
    });
  }

  /**
   * Valida y normaliza los datos de fracción. Devuelve null si el producto se vende en enteros (lo normal).
   * Las unidades se guardan con el nombre de la lista ("Caja"), aunque lleguen en minúsculas.
   */
  private prepararFraccion(datos: {
    formaVenta?: FormaVenta;
    unidadEntera?: string | null;
    unidadFraccion?: string | null;
    factorFraccion?: number | null;
    precioFraccion?: number | null;
  }): { unidadEntera: string; unidadFraccion: string; factor: number; precioFraccion: number } | null {
    if (datos.formaVenta !== 'fraccion') return null;
    validarConfiguracionFraccion({
      unidadEntera: datos.unidadEntera,
      unidadFraccion: datos.unidadFraccion,
      factor: datos.factorFraccion,
      precioFraccion: datos.precioFraccion,
    });
    return {
      unidadEntera: buscarUnidad(datos.unidadEntera)?.nombre ?? '',
      unidadFraccion: buscarUnidad(datos.unidadFraccion)?.nombre ?? '',
      factor: Number(datos.factorFraccion),
      precioFraccion: Number(datos.precioFraccion),
    };
  }

  /** En un producto por fracciones el stock se cuenta en unidades enteras de la fracción (sin decimales). */
  private exigirEnteroFraccion(valor: number, etiqueta: string, unidadFraccion: string): void {
    if (!Number.isInteger(valor) || valor < 0) {
      throw new ErrorDeNegocio(`${etiqueta} debe ser un número entero de ${textoUnidad(unidadFraccion, 2)}.`);
    }
  }

  /**
   * ¿Se puede cambiar la forma de venta (Entero ↔ Fracciones)? Solo si el producto no tiene ventas ni compras (sus
   * líneas guardan el stock que movieron en la unidad de entonces). Para volver de Fracciones a Entero tampoco puede
   * tener ajustes de stock. Los datos de ventas y compras antiguos se podrán convertir en una etapa posterior.
   */
  puedeCambiarFormaVenta(id: number): boolean {
    const producto = this.obtenerPorId(id);
    if (this.contarFilas('detalle_venta', id) > 0 || this.contarFilas('detalle_compra', id) > 0) return false;
    if (producto.formaVenta === 'fraccion' && this.contarFilas('movimiento_inventario', id) > 0) return false;
    return true;
  }

  private contarFilas(tabla: 'detalle_venta' | 'detalle_compra' | 'movimiento_inventario', productoId: number): number {
    const fila = this.bd.consultar<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tabla} WHERE producto_id = ?`, [productoId])[0];
    return fila?.n ?? 0;
  }

  /** Parte, normaliza (MAYÚSCULAS, sin repetidos) y valida los alias; devuelve el texto a guardar. */
  private prepararAlias(texto: string | null | undefined): string | null {
    const lista = partirAlias(texto);
    validarAlias(lista);
    return unirAlias(lista);
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

    const tipoNuevo = datos.tipo ?? actual.tipo;
    const esInsumo = tipoNuevo === 'insumo';
    // Alias: si no se indica, o es un insumo, se conserva lo que ya había (nunca se pierde por accidente).
    const aliasNuevo = esInsumo || datos.alias === undefined ? actual.alias : this.prepararAlias(datos.alias);
    // Un producto de Venta y Compra solo puede pasar a Insumo si no tiene stock:
    // si no, ese stock quedaría "colgado" sin forma de venderse ni de ajustarse.
    if (esInsumo && actual.tipo !== 'insumo' && actual.stockActual !== 0) {
      throw new ErrorDeNegocio(
        `No se puede pasar "${actual.nombre}" a Insumo: todavía tiene stock (${actual.stockActual}). Primero déjalo en 0 con un Ajuste.`,
      );
    }

    // Forma de venta. Si no se indica, se conserva la actual; un insumo siempre es Entero. Los datos de fracción que
    // no lleguen se toman de los guardados (así editar solo el precio no obliga a mandar todo otra vez).
    const formaNueva: FormaVenta = esInsumo ? 'entero' : (datos.formaVenta ?? actual.formaVenta);
    const cambiaForma = formaNueva !== actual.formaVenta;
    const fraccion =
      formaNueva === 'fraccion'
        ? this.prepararFraccion({
            formaVenta: 'fraccion',
            unidadEntera: datos.unidadEntera ?? actual.unidadEntera,
            unidadFraccion: datos.unidadFraccion ?? actual.unidadFraccion,
            factorFraccion: datos.factorFraccion ?? actual.factorFraccion,
            precioFraccion: datos.precioFraccion ?? actual.precioFraccion,
          })
        : null;
    if (cambiaForma && !esInsumo && !this.puedeCambiarFormaVenta(id)) {
      throw new ErrorDeNegocio(
        formaNueva === 'fraccion'
          ? `"${actual.nombre}" ya tiene ventas o compras registradas: por ahora no se puede cambiar a venta por fracciones.`
          : `"${actual.nombre}" ya tiene ventas, compras o ajustes de stock registrados: por ahora no se puede volver a Entero.`,
      );
    }

    return this.bd.transaccion(() => {
      const controlaStock = esInsumo ? false : datos.controlaStock;
      const precioVentaNuevo = esInsumo ? 0 : datos.precioVenta;

      // Stock y stock mínimo. Al CAMBIAR de forma se convierten solos (20 cajas → 240 unidades) y lo que venga en
      // datos.stockMinimo se ignora; si no cambia la forma, el stock no se toca desde acá (eso es el Ajuste).
      let stockNuevo = controlaStock ? actual.stockActual : 0;
      let stockMinimoNuevo = controlaStock ? datos.stockMinimo : 0;
      let motivoCambioForma: string | undefined;
      if (controlaStock && cambiaForma && fraccion) {
        const convertido = convertirAFracciones(actual.stockActual, actual.stockMinimo, fraccion.factor);
        stockNuevo = convertido.stock;
        stockMinimoNuevo = convertido.minimo;
        motivoCambioForma = `Cambió a venta por fracciones: el stock pasó de ${textoUnidad(fraccion.unidadEntera, 2)} a ${textoUnidad(fraccion.unidadFraccion, 2)} (1 ${textoUnidad(fraccion.unidadEntera, 1)} = ${fraccion.factor})`;
      } else if (controlaStock && cambiaForma && !esInsumo) {
        const configuracionActual = configuracionFraccionDeProducto(actual, true);
        if (configuracionActual) {
          const convertido = convertirAEntero(actual.stockActual, actual.stockMinimo, configuracionActual);
          stockNuevo = convertido.stock;
          stockMinimoNuevo = convertido.minimo;
          motivoCambioForma = `Volvió a venta por enteros: el stock pasó de ${textoUnidad(configuracionActual.unidadFraccion, 2)} a ${textoUnidad(configuracionActual.unidadEntera, 2)}`;
        }
      } else if (fraccion && controlaStock) {
        this.exigirEnteroFraccion(stockMinimoNuevo, 'El stock mínimo', fraccion.unidadFraccion);
      }

      this.bd.ejecutar(
        `UPDATE producto
           SET nombre = ?, categoria_id = ?, codigo = ?, precio_venta = ?, costo = ?,
               stock_minimo = ?, controla_stock = ?, unidad_medida = ?, activo = ?, tipo = ?, alias = ?,
               forma_venta = ?, unidad_entera = ?, unidad_fraccion = ?, factor_fraccion = ?, precio_fraccion = ?,
               actualizado_en = datetime('now')
         WHERE id = ?`,
        [
          nombreNormalizado,
          datos.categoriaId ?? null,
          datos.codigo ?? null,
          precioVentaNuevo,
          datos.costo,
          stockMinimoNuevo,
          controlaStock ? 1 : 0,
          datos.unidadMedida,
          datos.activo ? 1 : 0,
          tipoNuevo,
          aliasNuevo,
          fraccion ? 'fraccion' : 'entero',
          fraccion?.unidadEntera ?? null,
          fraccion?.unidadFraccion ?? null,
          fraccion?.factor ?? null,
          fraccion?.precioFraccion ?? null,
          id,
        ],
      );
      // Si se desactivó el control de stock, el stock actual también vuelve a 0
      // (no tiene sentido dejar un número "colgado" que ya no se usa para nada).
      if (!controlaStock || stockNuevo !== actual.stockActual) {
        this.actualizarStock(id, stockNuevo);
      }
      // Los ajustes de stock que ya tenía (Kardex) se pasan a la unidad más pequeña, para que sigan cuadrando.
      if (cambiaForma && fraccion) {
        this.bd.ejecutar(
          `UPDATE movimiento_inventario SET cantidad = ROUND(cantidad * ?), stock_resultante = ROUND(stock_resultante * ?) WHERE producto_id = ?`,
          [fraccion.factor, fraccion.factor, id],
        );
      }

      // Bitácora: solo se deja constancia de lo que REALMENTE cambió.
      if (actual.nombre !== nombreNormalizado) {
        this.registrarHistorial(id, 'nombre', actual.nombre, nombreNormalizado);
      }
      if (actual.precioVenta !== precioVentaNuevo) {
        this.registrarHistorial(id, 'precio_venta', String(actual.precioVenta), String(precioVentaNuevo));
      }
      if (actual.costo !== datos.costo) {
        this.registrarHistorial(id, 'costo', String(actual.costo), String(datos.costo));
      }
      if (actual.stockMinimo !== stockMinimoNuevo) {
        this.registrarHistorial(id, 'stock_minimo', String(actual.stockMinimo), String(stockMinimoNuevo));
      }
      if (actual.stockActual !== stockNuevo) {
        this.registrarHistorial(id, 'stock', String(actual.stockActual), String(stockNuevo), motivoCambioForma);
      }
      this.actividad?.registrar({
        accion: 'producto_modificado',
        entidad: 'producto',
        entidadId: id,
        detalle: cambiaForma ? `${nombreNormalizado} (ahora se vende ${formaNueva === 'fraccion' ? 'por fracciones' : 'por enteros'})` : nombreNormalizado,
        permiso: 'gestionar_productos',
      });

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
      if (producto.tipo === 'insumo') {
        throw new ErrorDeNegocio(`"${producto.nombre}" es un insumo: no registra stock, no se puede ajustar.`);
      }
      // Por fracciones el stock se cuenta en la unidad más pequeña: el ajuste también va en números enteros.
      const configuracionFraccion = configuracionFraccionDeProducto(producto, true);
      if (configuracionFraccion && !Number.isInteger(delta)) {
        throw new ErrorDeNegocio(`En este producto el ajuste debe ser en números enteros de ${textoUnidad(configuracionFraccion.unidadFraccion, 2)}.`);
      }
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
      this.actividad?.registrar({
        accion: 'stock_ajustado',
        entidad: 'producto',
        entidadId: id,
        detalle: `${producto.nombre} (${delta > 0 ? '+' : '-'}${configuracionFraccion ? textoCantidadFraccion(Math.abs(delta), configuracionFraccion) : Math.abs(delta)})`,
        permiso: 'gestionar_productos',
      });
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
        `SELECT m.id AS id, m.fecha_hora AS fecha_hora, m.tipo AS tipo, m.cantidad AS cantidad,
                m.motivo AS motivo, m.stock_resultante AS stock_resultante,
                CASE WHEN m.venta_id IS NOT NULL THEN 'V-' || m.venta_id
                     WHEN m.compra_id IS NOT NULL THEN 'C-' || m.compra_id
                END AS documento,
                CASE WHEN m.venta_id IS NOT NULL
                       THEN COALESCE(NULLIF(TRIM(cli.nombre), ''), NULLIF(TRIM(v.cliente_nombre_libre), ''), 'Cliente Eventual')
                     WHEN m.compra_id IS NOT NULL
                       THEN COALESCE(NULLIF(TRIM(prov.nombre), ''), NULLIF(TRIM(co.proveedor_nombre_libre), ''))
                END AS tercero
         FROM movimiento_inventario m
         LEFT JOIN venta v ON v.id = m.venta_id
         LEFT JOIN cliente cli ON cli.id = v.cliente_id
         LEFT JOIN compra co ON co.id = m.compra_id
         LEFT JOIN proveedor prov ON prov.id = co.proveedor_id
         WHERE m.producto_id = ? AND date(m.fecha_hora) BETWEEN ? AND ?
         ORDER BY m.fecha_hora ASC, m.id ASC`,
        [productoId, desde, hasta],
      )
      .map(mapearMovimientoInventario);
  }
}
