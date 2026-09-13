import type { ProveedorRepositorio } from '@/core/repositorios';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import type { Proveedor } from '@/core/tipos';
import type { BaseDatosLocal } from './base-datos';
import { mapearProveedor, type FilaProveedor } from './mapeadores';

export class ProveedorRepositorioSqlite implements ProveedorRepositorio {
  constructor(private readonly bd: BaseDatosLocal) {}

  listarActivos(): Proveedor[] {
    return this.bd
      .consultar<FilaProveedor>('SELECT * FROM proveedor WHERE activo = 1 ORDER BY nombre')
      .map(mapearProveedor);
  }

  obtenerPorId(id: number): Proveedor {
    const fila = this.bd.consultar<FilaProveedor>('SELECT * FROM proveedor WHERE id = ?', [id])[0];
    if (!fila) {
      throw new ErrorDeNegocio(`El proveedor ${id} no existe.`);
    }
    return mapearProveedor(fila);
  }

  crear(nombre: string, telefono: string | null = null): Proveedor {
    this.bd.ejecutar('INSERT INTO proveedor (nombre, telefono) VALUES (?, ?)', [nombre, telefono]);
    return this.obtenerPorId(this.bd.ultimoIdInsertado());
  }
}
