/**
 * Vende Fácil — Ejecutar Backup Automático (lógica compartida)
 * ------------------------------------------------------------
 * Extraído de `components/revisar-backup-automatico.tsx` para que el
 * mismo código sirva tanto a la revisión automática al abrir la app
 * como al botón "Probar backup automático ahora" (Más > Configuración
 * > Backup Automático), que lo fuerza sin importar la hora/frecuencia
 * configurada — útil para probar varias veces en un mismo día, algo
 * que ya no genera archivos duplicados gracias a que el nombre trae
 * fecha Y hora (dd-mm-aaaa-hhmmss).
 */

import type { ContenedorRepositorios } from '@/infraestructura/sqlite/contenedor';
import {
  CLAVE_BACKUP_AUTO_ULTIMA_FECHA,
  nombreArchivoBackupAutomatico,
} from '@/core/backup-automatico';
import { obtenerNombreTienda, CLAVE_NOMBRE_TIENDA } from '@/core/configuracion';
import { horaLocalCompacta, hoyLocalSql } from '@/core/tiempo';
import { guardarBinarioLocalSilencioso } from '@/infraestructura/exportacion/descargas';
import { mostrarNotificacionBackupAutomaticoFallido } from '@/infraestructura/notificaciones/notificaciones-navegador';

export async function ejecutarBackupAutomaticoAhora(
  contenedor: ContenedorRepositorios,
  nombreConfigurado: string,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const nombreArchivo = nombreArchivoBackupAutomatico(nombreConfigurado, hoyLocalSql(), horaLocalCompacta());

  try {
    const bytes = contenedor.exportarRespaldoCompleto();
    const { ruta } = await guardarBinarioLocalSilencioso(nombreArchivo, bytes);
    contenedor.respaldos.registrar('automatico', 'completado', ruta, bytes.length);
    contenedor.configuracion.establecerValor(CLAVE_BACKUP_AUTO_ULTIMA_FECHA, hoyLocalSql());
    await contenedor.persistir();
    return { ok: true };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'error desconocido';
    contenedor.respaldos.registrar('automatico', 'fallido', null, null);
    await contenedor.persistir();
    const nombreTienda = obtenerNombreTienda(contenedor.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA));
    mostrarNotificacionBackupAutomaticoFallido(mensaje, nombreTienda);
    return { ok: false, mensaje };
  }
}
