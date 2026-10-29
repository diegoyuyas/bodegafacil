import type { ContenedorRepositorios } from '@/infraestructura/sqlite/contenedor';
import {
  CLAVE_BACKUP_AUTO_ACTIVO,
  CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS,
  CLAVE_BACKUP_AUTO_HORA,
  CLAVE_BACKUP_AUTO_NOMBRE,
  CLAVE_BACKUP_AUTO_PREGUNTAR_DESTINO,
  CLAVE_BACKUP_AUTO_ULTIMA_FECHA,
  HORA_BACKUP_PREDETERMINADA,
  preguntarDestinoActivo,
  type ConfigBackupAutomatico,
} from '@/core/backup-automatico';

/** La configuración del Backup Automático tal como está guardada. */
export function leerConfigBackupAutomatico(contenedor: ContenedorRepositorios): ConfigBackupAutomatico {
  const c = contenedor.configuracion;
  return {
    activo: c.obtenerValor(CLAVE_BACKUP_AUTO_ACTIVO) === '1',
    nombreArchivo: c.obtenerValor(CLAVE_BACKUP_AUTO_NOMBRE) ?? '',
    hora: c.obtenerValor(CLAVE_BACKUP_AUTO_HORA) ?? HORA_BACKUP_PREDETERMINADA,
    frecuenciaDias: Number(c.obtenerValor(CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS) ?? '1'),
    ultimaFecha: c.obtenerValor(CLAVE_BACKUP_AUTO_ULTIMA_FECHA),
  };
}

/** ¿Está activo «Preguntar dónde guardar» (abrir la pantalla de compartir tras el backup)? */
export function leerPreguntarDestino(contenedor: ContenedorRepositorios): boolean {
  return preguntarDestinoActivo(contenedor.configuracion.obtenerValor(CLAVE_BACKUP_AUTO_PREGUNTAR_DESTINO));
}
