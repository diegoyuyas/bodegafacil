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
 * Siempre guarda una copia en el almacenamiento del teléfono. No hay
 * integración con Google Drive (se descartó: exige autorizar con un toque
 * y mantener un proyecto de Google). En su lugar, y si el interruptor
 * "Preguntar dónde guardar" está activo, después de generar el backup se
 * abre la pantalla de compartir de Android para que el bodeguero lo guarde
 * en Drive u otro lugar; si la cierra, la copia local ya quedó guardada.
 *
 * A la hora configurada la app también programa una notificación local
 * (recordatorio): al tocarla se abre la app y se genera el backup.
 * Abrir la app pasada la hora hace lo mismo, sin necesidad del aviso.
 *
 * Todo lo de acá es lógica PURA (sin DOM ni SQLite), igual que
 * `core/plan.ts` / `core/configuracion.ts`.
 */

import { diferenciaEnDiasSql } from './tiempo';

export const CLAVE_BACKUP_AUTO_ACTIVO = 'backup_automatico_activo';
export const CLAVE_BACKUP_AUTO_NOMBRE = 'backup_automatico_nombre';
export const CLAVE_BACKUP_AUTO_HORA = 'backup_automatico_hora';
export const CLAVE_BACKUP_AUTO_FRECUENCIA_DIAS = 'backup_automatico_frecuencia_dias';
/** Última fecha 'YYYY-MM-DD' en que el backup automático terminó bien. */
export const CLAVE_BACKUP_AUTO_ULTIMA_FECHA = 'backup_automatico_ultima_fecha';
/** '1' (predeterminado) o '0': abrir la pantalla de compartir después de generar el backup. */
export const CLAVE_BACKUP_AUTO_PREGUNTAR_DESTINO = 'backup_automatico_preguntar_destino';

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
  /** 'YYYY-MM-DD' de la última vez que se completó, o null si nunca corrió. */
  ultimaFecha: string | null;
}

function fechaDdMmAaaa(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split('-');
  return `${dia}-${mes}-${anio}`;
}

/**
 * Nombre por defecto de cualquier respaldo (manual o automático), sin
 * extensión: "dd-mm-aaaa-hhmmss-respaldo-vende-facil". Empieza por la fecha
 * y la hora para que se vea al instante a qué día corresponde cada archivo
 * y los respaldos se ordenen cronológicamente por nombre. La hora va sin
 * separadores y siempre está presente, para que dos respaldos del mismo día
 * — por ejemplo uno automático y otro manual — nunca se pisen entre sí.
 */
export function nombreRespaldoPorDefecto(fechaIso: string, horaCompacta: string): string {
  return `${fechaDdMmAaaa(fechaIso)}-${horaCompacta}-respaldo-vende-facil`;
}

/**
 * Nombre del backup automático: el configurado por el bodeguero tal cual
 * (sin agregarle nada) o, si lo dejó vacío, el por defecto de arriba.
 */
export function nombreArchivoBackupAutomatico(
  nombreConfigurado: string,
  fechaIso: string,
  horaCompacta: string,
): string {
  const limpio = nombreConfigurado.trim();
  const base = limpio || nombreRespaldoPorDefecto(fechaIso, horaCompacta);
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

/** El interruptor «Preguntar dónde guardar» viene ACTIVADO si nunca se tocó (solo '0' lo apaga). */
export function preguntarDestinoActivo(valorGuardado: string | null): boolean {
  return valorGuardado !== '0';
}

/** Suma (o resta) días a una fecha 'YYYY-MM-DD' sin depender de la zona horaria del equipo. */
export function sumarDiasAFechaIso(fechaIso: string, dias: number): string {
  const [anio = 0, mes = 1, dia = 1] = fechaIso.split('-').map(Number);
  const f = new Date(Date.UTC(anio, mes - 1, dia + dias));
  const dd = String(f.getUTCDate()).padStart(2, '0');
  const mm = String(f.getUTCMonth() + 1).padStart(2, '0');
  return `${f.getUTCFullYear()}-${mm}-${dd}`;
}

export interface AvisoBackupProgramado {
  /** 'YYYY-MM-DD' (fecha local). */
  fecha: string;
  /** 'HH:MM' (hora local configurada para el backup). */
  hora: string;
}

/**
 * ¿Cuándo debe sonar el próximo recordatorio de backup? null si no corresponde ninguno (backup apagado).
 *  - Se toma la fecha en que toca el backup: la última fecha + la frecuencia (o hoy si nunca se hizo o ya está atrasado).
 *  - Si esa fecha es hoy y la hora configurada ya pasó, el aviso queda para mañana (hoy ya no sonaría:
 *    si el backup está atrasado, se hace al abrir la app).
 *  - Si ya se hizo hoy, el próximo aviso es el de la fecha que corresponda más adelante (nunca el de hoy).
 */
export function calcularProximoAviso(
  config: ConfigBackupAutomatico,
  hoyIso: string,
  horaActualHHmm: string,
): AvisoBackupProgramado | null {
  if (!config.activo) return null;
  let fecha = config.ultimaFecha ? sumarDiasAFechaIso(config.ultimaFecha, config.frecuenciaDias) : hoyIso;
  if (fecha < hoyIso) fecha = hoyIso;
  if (fecha === hoyIso && horaActualHHmm >= config.hora) fecha = sumarDiasAFechaIso(hoyIso, 1);
  return { fecha, hora: config.hora };
}

/** Al tocar el aviso: generar el backup, salvo que el de hoy ya se haya hecho (entonces solo se informa). */
export function accionAlTocarAviso(config: ConfigBackupAutomatico, hoyIso: string): 'generar' | 'ya_hecho' | 'ninguna' {
  if (!config.activo) return 'ninguna';
  if (config.ultimaFecha && config.ultimaFecha >= hoyIso) return 'ya_hecho';
  return 'generar';
}

/**
 * Con la pantalla de compartir activa, el backup espera si la persona está en medio de una venta:
 * la hoja de compartir saltaría encima del cobro. Sale de «Nueva venta» y se hace.
 */
export function debeEsperarPorVenta(rutaActual: string): boolean {
  return rutaActual === '/ventas' || rutaActual.startsWith('/ventas/');
}
