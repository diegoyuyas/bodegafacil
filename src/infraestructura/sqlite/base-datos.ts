import type { Database } from 'sql.js';
import { obtenerMotorSqlJs } from './motor';
import { ESQUEMA_SQL } from './esquema-sql.generado';

export interface OpcionesBaseDatosLocal {
  /** Dónde buscar el .wasm de sql.js (distinto en navegador vs. Node). */
  localizarArchivo?: (archivo: string) => string;
  /** Bytes de una base de datos ya existente (ej. cargada de IndexedDB). */
  datosPrevios?: Uint8Array | null;
}

/**
 * Envoltorio delgado sobre sql.js. Nada de lógica de negocio aquí:
 * solo ejecutar SQL, consultar y exportar bytes para persistir.
 */
export class BaseDatosLocal {
  private constructor(private readonly db: Database) {}

  static async crear(opciones: OpcionesBaseDatosLocal = {}): Promise<BaseDatosLocal> {
    const SQL = await obtenerMotorSqlJs(opciones.localizarArchivo);
    const db = opciones.datosPrevios ? new SQL.Database(opciones.datosPrevios) : new SQL.Database();

    const instancia = new BaseDatosLocal(db);
    instancia.ejecutar('PRAGMA foreign_keys = ON;');

    if (!opciones.datosPrevios) {
      instancia.ejecutar(ESQUEMA_SQL);
    }

    return instancia;
  }

  ejecutar(sql: string, parametros: unknown[] = []): void {
    if (parametros.length === 0) {
      // Sin params: permite ejecutar scripts con varias sentencias
      // separadas por ";" (como el esquema completo).
      this.db.run(sql);
    } else {
      this.db.run(sql, parametros as (string | number | null)[]);
    }
  }

  consultar<FilaSql = Record<string, unknown>>(
    sql: string,
    parametros: unknown[] = [],
  ): FilaSql[] {
    const sentencia = this.db.prepare(sql);
    try {
      sentencia.bind(parametros as (string | number | null)[]);
      const filas: FilaSql[] = [];
      while (sentencia.step()) {
        filas.push(sentencia.getAsObject() as FilaSql);
      }
      return filas;
    } finally {
      sentencia.free();
    }
  }

  /** Ejecuta `fn` dentro de una transacción; revierte todo si algo lanza. */
  transaccion<T>(fn: () => T): T {
    this.ejecutar('BEGIN');
    try {
      const resultado = fn();
      this.ejecutar('COMMIT');
      return resultado;
    } catch (error) {
      this.ejecutar('ROLLBACK');
      throw error;
    }
  }

  /** Serializa la base de datos completa para guardarla (IndexedDB, archivo, etc.). */
  exportar(): Uint8Array {
    return this.db.export();
  }

  ultimoIdInsertado(): number {
    const fila = this.consultar<{ id: number }>('SELECT last_insert_rowid() as id')[0];
    if (!fila) {
      throw new Error('No se pudo obtener el último id insertado.');
    }
    return fila.id;
  }
}
