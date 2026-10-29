/**
 * Vende Fácil — Aviso (notificación local) del Backup Automático
 * ------------------------------------------------------------
 * A la hora configurada la app programa una notificación local: «Es hora de tu backup». Al tocarla se abre
 * la app y se genera el backup (ver `components/revisar-backup-automatico.tsx`). No hay proceso en segundo
 * plano: la notificación la dispara el sistema (alarma de Android) aunque la app esté cerrada. Android puede
 * retrasarla unos minutos (ahorro de batería); si el usuario la descarta, el backup se hace al abrir la app.
 *
 * Solo en el APK. En el navegador no hay forma confiable de programar un aviso, y no se hace nada.
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { ContenedorRepositorios } from '@/infraestructura/sqlite/contenedor';
import { calcularProximoAviso } from '@/core/backup-automatico';
import { CLAVE_NOMBRE_TIENDA, obtenerNombreTienda } from '@/core/configuracion';
import { horaLocalHHmm, hoyLocalSql } from '@/core/tiempo';
import { leerConfigBackupAutomatico } from './config';

/** Id fijo: reprogramar reemplaza el aviso anterior en vez de acumularlos. */
export const ID_AVISO_BACKUP = 4172001;
/** Marca en `extra` para reconocer, al tocarla, que es la notificación del backup. */
export const ACCION_AVISO_BACKUP = 'backup-automatico';

/**
 * Deja programado (o quita) el aviso según la configuración y el Premium de ahora mismo.
 * Es seguro llamarla las veces que haga falta: al abrir la app, tras cada backup y al guardar la configuración.
 */
export async function reprogramarAvisoBackup(contenedor: ContenedorRepositorios): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ID_AVISO_BACKUP }] });

    if (contenedor.plan.obtenerEstado().tipo !== 'premium') return; // Backup Automático es Premium
    const proximo = calcularProximoAviso(leerConfigBackupAutomatico(contenedor), hoyLocalSql(), horaLocalHHmm());
    if (!proximo) return;

    const permiso = await LocalNotifications.checkPermissions();
    if (permiso.display !== 'granted') return;

    const [h = 0, m = 0] = proximo.hora.split(':').map(Number);
    const [anio = 0, mes = 1, dia = 1] = proximo.fecha.split('-').map(Number);
    const at = new Date(anio, mes - 1, dia, h, m, 0, 0); // hora LOCAL del teléfono

    const nombreTienda = obtenerNombreTienda(contenedor.configuracion.obtenerValor(CLAVE_NOMBRE_TIENDA));
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID_AVISO_BACKUP,
          title: nombreTienda,
          body: 'Es hora de tu backup. Toca para generarlo y guardarlo.',
          schedule: { at, allowWhileIdle: true },
          extra: { accion: ACCION_AVISO_BACKUP },
        },
      ],
    });
  } catch {
    // Sin aviso no pasa nada grave: el backup sigue haciéndose al abrir la app.
  }
}

/**
 * Avisa cuando el usuario toca la notificación del backup. Devuelve la función para dejar de escuchar.
 * OJO (trampa de Capacitor): aquí solo se devuelve una función normal, nunca el plugin ni su «handle».
 */
export async function escucharToqueAvisoBackup(alTocar: () => void): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  try {
    const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (evento) => {
      const extra = evento.notification.extra as { accion?: string } | undefined;
      if (extra?.accion === ACCION_AVISO_BACKUP) alTocar();
    });
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}
