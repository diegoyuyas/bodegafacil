import type { DatosActualizarProveedor, ProveedorRepositorio } from '@/core/repositorios';
import { ErrorDeNegocio, validarCelular, validarRuc } from '@/core/reglas-negocio';
import type { Proveedor } from '@/core/tipos';
import type { BaseDatosLocal } from './base-datos';
import { mapearProveedor, type FilaProveedor } from './mapeadores';

const COLUMNAS = 'id, nombre, ruc, telefono, activo';

export class ProveedorRepositorioSqlite implements ProveedorRepositorio {
  constructor(private readonly bd: BaseDatosLocal) {}

  listarActivos(): Proveedor[] {
    return this.bd
      .consultar<FilaProveedor>(`SELECT ${COLUMNAS} FROM proveedor WHERE activo = 1 ORDER BY nombre`)
      .map(mapearProveedor);
  }

  listarTodos(): Proveedor[] {
    return this.bd
      .consultar<FilaProveedor>(`SELECT ${COLUMNAS} FROM proveedor ORDER BY nombre`)
      .map(mapearProveedor);
  }

  buscarPorTexto(texto: string): Proveedor[] {
    const patron = `%${texto.trim()}%`;
    return this.bd
      .consultar<FilaProveedor>(
        `SELECT ${COLUMNAS} FROM proveedor
         WHERE activo = 1 AND (nombre LIKE ? OR ruc LIKE ? OR telefono LIKE ?)
         ORDER BY nombre LIMIT 20`,
        [patron, patron, patron],
      )
      .map(mapearProveedor);
  }

  obtenerPorId(id: number): Proveedor {
    const fila = this.bd.consultar<FilaProveedor>(
      `SELECT ${COLUMNAS} FROM proveedor WHERE id = ?`,
      [id],
    )[0];
    if (!fila) {
      throw new ErrorDeNegocio(`El proveedor ${id} no existe.`);
    }
    return mapearProveedor(fila);
  }

  crear(nombre: string, ruc: string | null = null, telefono: string | null = null): Proveedor {
    if (!nombre.trim()) {
      throw new ErrorDeNegocio('El nombre del proveedor es obligatorio.');
    }
    if (ruc) validarRuc(ruc);
    if (telefono) validarCelular(telefono);

    this.bd.ejecutar('INSERT INTO proveedor (nombre, ruc, telefono) VALUES (?, ?, ?)', [
      nombre.trim(),
      ruc || null,
      telefono || null,
    ]);
    return this.obtenerPorId(this.bd.ultimoIdInsertado());
  }

  actualizar(id: number, datos: DatosActualizarProveedor): Proveedor {
    this.obtenerPorId(id); // valida que exista
    if (!datos.nombre.trim()) {
      throw new ErrorDeNegocio('El nombre del proveedor es obligatorio.');
    }
    const ruc = datos.ruc?.trim() || null;
    const telefono = datos.telefono?.trim() || null;
    if (ruc) validarRuc(ruc);
    if (telefono) validarCelular(telefono);

    this.bd.ejecutar(
      'UPDATE proveedor SET nombre = ?, ruc = ?, telefono = ?, activo = ? WHERE id = ?',
      [datos.nombre.trim(), ruc, telefono, datos.activo ? 1 : 0, id],
    );
    return this.obtenerPorId(id);
  }
}
