import type { ClienteRepositorio } from '@/core/repositorios';
import { ErrorDeNegocio } from '@/core/reglas-negocio';
import type { Cliente } from '@/core/tipos';
import type { BaseDatosLocal } from './base-datos';
import { mapearCliente, type FilaCliente } from './mapeadores';

export class ClienteRepositorioSqlite implements ClienteRepositorio {
  constructor(private readonly bd: BaseDatosLocal) {}

  listarActivos(): Cliente[] {
    return this.bd
      .consultar<FilaCliente>('SELECT * FROM cliente WHERE activo = 1 ORDER BY nombre')
      .map(mapearCliente);
  }

  obtenerPorId(id: number): Cliente {
    const fila = this.bd.consultar<FilaCliente>('SELECT * FROM cliente WHERE id = ?', [id])[0];
    if (!fila) {
      throw new ErrorDeNegocio(`El cliente ${id} no existe.`);
    }
    return mapearCliente(fila);
  }

  crear(nombre: string, telefono: string | null = null): Cliente {
    this.bd.ejecutar('INSERT INTO cliente (nombre, telefono) VALUES (?, ?)', [nombre, telefono]);
    return this.obtenerPorId(this.bd.ultimoIdInsertado());
  }
}
