import type { ClienteRepositorio } from '@/core/repositorios';
import { ErrorDeNegocio, validarDocumentoIdentidad } from '@/core/reglas-negocio';
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

  buscarPorTexto(texto: string): Cliente[] {
    const patron = `%${texto.trim()}%`;
    return this.bd
      .consultar<FilaCliente>(
        `SELECT * FROM cliente
         WHERE activo = 1 AND (nombre LIKE ? OR documento LIKE ?)
         ORDER BY nombre LIMIT 20`,
        [patron, patron],
      )
      .map(mapearCliente);
  }

  obtenerPorId(id: number): Cliente {
    const fila = this.bd.consultar<FilaCliente>('SELECT * FROM cliente WHERE id = ?', [id])[0];
    if (!fila) {
      throw new ErrorDeNegocio(`El cliente ${id} no existe.`);
    }
    return mapearCliente(fila);
  }

  crear(nombre: string, documento: string, telefono: string | null = null): Cliente {
    if (!nombre.trim()) {
      throw new ErrorDeNegocio('El nombre del cliente es obligatorio.');
    }
    validarDocumentoIdentidad(documento);

    const existente = this.bd.consultar<{ id: number }>(
      'SELECT id FROM cliente WHERE documento = ?',
      [documento],
    )[0];
    if (existente) {
      throw new ErrorDeNegocio(`Ya existe un cliente con el documento ${documento}.`);
    }

    this.bd.ejecutar('INSERT INTO cliente (nombre, documento, telefono) VALUES (?, ?, ?)', [
      nombre.trim(),
      documento,
      telefono,
    ]);
    return this.obtenerPorId(this.bd.ultimoIdInsertado());
  }
}
