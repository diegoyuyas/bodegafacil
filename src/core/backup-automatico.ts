/**
 * Vende Fácil — Backup Automático (Más > Configuración > Configurar Backup Automático)
 * ------------------------------------------------------------
 * No hay backend ni proceso en segundo plano real (la app es una PWA
 * offline-first, sin servidor): "automático" acá significa que, al
 * ABRIR la app, se revisa si tocaba backup según la hora y frecuencia
 * configuradas, y si ya se pasó la hora sin hacerse hoy, se ejecuta en
 * ese momento (ver `components/revisar-backup-automatico.tsx`). Si el
 * bodeguero no abre la app ese día, ese día no hay backup — para eso
 * está la notificación de aviso.
 *
 * Todo lo de acá es lógica PURA (sin DOM ni SQLite), igual que
 * `core/plan.ts` / `core/configuracion.ts`.
 */

import { diferenciaEnDiasSql } from './tiempo';

export const CLAVE_BACKUP_AUTO_ACTIVO = 'backup_automatico_activo';
export const CLAVE_BACKUP_AUTO_NOMBRE = 'backup_automatico_nombre';
export const CLAVE_BACKUP_AUTO_HORA = 'backup_automatico_hora';
export const CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS = 'backup_automatico_frecuencia_dias';
export const CLAVE_BACKUP_AUTO_DESTINO = 'backup_automatico_destino';
/** Última fecha 'YYYY-MM-DD' en que el backup automático terminó bien (local o subido a Drive). */
export const CLAVE_BACKUP_AUTO_ULTIMA_FECHA = 'backup_automatico_ultima_fecha';

export type DestinoBackupAutomatico = 'local' | 'drive';

export const HORA_BACKUP_PREDETERMINADA = '03:00';
export const FRECUENCIA_BACKUP_MINIMA_DIAS = 1;
export const FRECUENCIA_BACKUP_MAXIMA_DIAS = 90;

export interface ConfigBackupAutomatico {
  activo: boolean;
  /** Nombre configurado por el bodeguero; puede venir vacío (se usa el predeterminado). */
  nombreArchivo: string;
  /** 'HH:MM' en hora local. */
  hora: string;
  frecuenciaDias: number;
  destino: DestinoBackupAutomatico;
  /** 'YYYY-MM-DD' de la última vez que se completó, o null si nunca corrió. */
  ultimaFecha: string | null;
}

function fechaDdMmAaaa(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split('-');
  return `${dia}-${mes}-${anio}`;
}

/** Nombre por defecto: "respaldo-vende-facil-dd-mm-aaaa". Si el bodeguero configuró uno propio, se usa tal cual. */
export function nombreArchivoBackupAutomatico(nombreConfigurado: string, fechaIso: string): string {
  const limpio = nombreConfigurado.trim();
  const base = limpio || `respaldo-vende-facil-${fechaDdMmAaaa(fechaIso)}`;
  return base.toLowerCase().endsWith('.sqlite') ? base : `${base}.sqlite`;
}

export function frecuenciaBackupValida(dias: number): boolean {
  return (
    Number.isInteger(dias) && dias >= FRECUENCIA_BACKUP_MINIMA_DIAS && dias <= FRECUENCIA_BACKUP_MAXIMA_DIAS
  );
}

/**
 * ¿Toca ejecutar el backup automático ahora mismo? `hoyIso`
 * ('YYYY-MM-DD') y `horaActualHHmm` ('HH:MM') son la fecha/hora local
 * del dispositivo en este instante (ver `core/tiempo.ts`).
 */
export function tocaEjecutarBackupAutomatico(
  config: ConfigBackupAutomatico,
  hoyIso: string,
  horaActualHHmm: string,
): boolean {
  if (!config.activo) return false;
  if (horaActualHHmm < config.hora) return false; // todavía no llega la hora configurada de hoy
  if (!config.ultimaFecha) return true; // nunca se ejecutó
  if (config.ultimaFecha >= hoyIso) return false; // ya se ejecutó hoy (o el reloj del equipo retrocedió)
  return diferenciaEnDiasSql(config.ultimaFecha, hoyIso) >= config.frecuenciaDias;
}
