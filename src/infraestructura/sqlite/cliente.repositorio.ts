import type { ClienteRepositorio, ConfiguracionRepositorio, DatosActualizarCliente } from '@/core/repositorios';
import { ErrorDeNegocio, validarDocumentoIdentidad } from '@/core/reglas-negocio';
import { CLAVE_MONEDA, formatearMonto, obtenerSimboloMoneda } from '@/core/moneda';
import type { Cliente } from '@/core/tipos';
import type { BaseDatosLocal } from './base-datos';
import { mapearCliente, type FilaCliente } from './mapeadores';

export class ClienteRepositorioSqlite implements ClienteRepositorio {
  constructor(
    private readonly bd: BaseDatosLocal,
    private readonly configuracion: ConfiguracionRepositorio,
  ) {}

  listarActivos(): Cliente[] {
    return this.bd
      .consultar<FilaCliente>('SELECT * FROM cliente WHERE activo = 1 ORDER BY nombre')
      .map(mapearCliente);
  }

  listarTodos(): Cliente[] {
    return this.bd
      .consultar<FilaCliente>('SELECT * FROM cliente ORDER BY nombre')
      .map(mapearCliente);
  }

  buscarPorTexto(texto: string): Cliente[] {
    const patron = `%${texto.trim()}%`;
    return this.bd
      .consultar<FilaCliente>(
        `SELECT * FROM cliente
         WHERE activo = 1 AND (nombre LIKE ? OR documento LIKE ? OR telefono LIKE ?)
         ORDER BY nombre LIMIT 20`,
        [patron, patron, patron],
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

  actualizar(id: number, datos: DatosActualizarCliente): Cliente {
    const actual = this.obtenerPorId(id); // valida que exista
    if (!datos.nombre.trim()) {
      throw new ErrorDeNegocio('El nombre del cliente es obligatorio.');
    }
    if (!datos.activo && actual.saldoPendiente > 0) {
      const simbolo = obtenerSimboloMoneda(this.configuracion.obtenerValor(CLAVE_MONEDA));
      throw new ErrorDeNegocio(
        `No se puede inactivar a ${actual.nombre}: tiene una deuda pendiente de ${formatearMonto(actual.saldoPendiente, simbolo)}.`,
      );
    }
    const documento = datos.documento.trim();
    validarDocumentoIdentidad(documento);

    const duplicado = this.bd.consultar<{ id: number }>(
      'SELECT id FROM cliente WHERE documento = ? AND id != ?',
      [documento, id],
    )[0];
    if (duplicado) {
      throw new ErrorDeNegocio(`Ya existe un cliente con el documento ${documento}.`);
    }

    this.bd.ejecutar(
      'UPDATE cliente SET nombre = ?, documento = ?, telefono = ?, activo = ? WHERE id = ?',
      [datos.nombre.trim(), documento, datos.telefono?.trim() || null, datos.activo ? 1 : 0, id],
    );
    return this.obtenerPorId(id);
  }
}
