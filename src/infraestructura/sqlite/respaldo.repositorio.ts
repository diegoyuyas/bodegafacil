import type { RespaldoRepositorio } from '@/core/repositorios';
import type { EstadoRespaldo, MetadatoRespaldo, TipoRespaldo } from '@/core/tipos';
import { ahoraLocalSql } from '@/core/tiempo';
import type { BaseDatosLocal } from './base-datos';
import { mapearMetadatoRespaldo, type FilaMetadatoRespaldo } from './mapeadores';

/**
 * `metadato_respaldo` ya existía en `esquema.sql` desde el principio
 * (sección "Configuración y respaldo"), pero nada la usaba todavía.
 * El Backup Automático es el primer consumidor: cada intento (haya
 * salido bien o mal) queda registrado acá, tanto para saber "cuándo
 * fue el último backup" en la pantalla de configuración como para que
 * `tocaEjecutarBackupAutomatico` (core/backup-automatico.ts) sepa si
 * ya tocaba uno nuevo.
 */
export class RespaldoRepositorioSqlite implements RespaldoRepositorio {
  constructor(private readonly bd: BaseDatosLocal) {}

  registrar(
    tipo: TipoRespaldo,
    estado: EstadoRespaldo,
    rutaArchivo: string | null,
    tamanoBytes: number | null,
  ): void {
    this.bd.ejecutar(
      `INSERT INTO metadato_respaldo (fecha_hora, tipo, ruta_archivo, tamano_bytes, estado)
       VALUES (?, ?, ?, ?, ?)`,
      [ahoraLocalSql(), tipo, rutaArchivo, tamanoBytes, estado],
    );
  }

  obtenerUltimoAutomaticoExitoso(): MetadatoRespaldo | null {
    const fila = this.bd.consultar<FilaMetadatoRespaldo>(
      `SELECT * FROM metadato_respaldo
       WHERE tipo = 'automatico' AND estado = 'completado'
       ORDER BY fecha_hora DESC LIMIT 1`,
    )[0];
    return fila ? mapearMetadatoRespaldo(fila) : null;
  }
}
