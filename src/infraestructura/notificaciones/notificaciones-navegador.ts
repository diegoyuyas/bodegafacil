/**
 * Vende Fácil — Notificaciones de stock bajo
 * ------------------------------------------------------------
 * No hay backend ni push notifications: esto es una notificación
 * LOCAL, disparada desde el propio cliente cuando una venta deja a un
 * producto por debajo (o en) su stock mínimo. Dos caminos según dónde
 * corre la app:
 *
 * - Dentro del APK (WebView de Capacitor): el WebView NO tiene la Web
 *   Notification API conectada de verdad con Android — pedir permiso
 *   ahí nunca llega a mostrarle nada al sistema operativo (por eso no
 *   aparecía ni en Ajustes > Apps > Permisos). Se usa en su lugar el
 *   plugin nativo `@capacitor/local-notifications`, que sí gestiona
 *   el permiso real de Android (POST_NOTIFICATIONS en Android 13+) y
 *   dispara una notificación real del sistema.
 * - En navegador/PWA instalada: se sigue usando la Web Notification
 *   API de siempre, con `ServiceWorkerRegistration.showNotification()`
 *   como camino principal (Chrome Android bloquea `new
 *   Notification(...)` directo).
 */

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

function soportaNotificacionesWeb(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function soportaNotificaciones(): boolean {
  return Capacitor.isNativePlatform() || soportaNotificacionesWeb();
}

/**
 * Pide permiso. Si ya se había respondido antes (concedido o
 * rechazado), no se vuelve a preguntar — esta función solo devuelve
 * lo que ya había.
 */
export async function solicitarPermisoNotificaciones(): Promise<'granted' | 'denied'> {
  if (Capacitor.isNativePlatform()) {
    const actual = await LocalNotifications.checkPermissions();
    if (actual.display === 'granted') return 'granted';
    const pedido = await LocalNotifications.requestPermissions();
    return pedido.display === 'granted' ? 'granted' : 'denied';
  }

  if (!soportaNotificacionesWeb()) return 'denied';
  if (Notification.permission !== 'default') {
    return Notification.permission === 'granted' ? 'granted' : 'denied';
  }
  const resultado = await Notification.requestPermission();
  return resultado === 'granted' ? 'granted' : 'denied';
}

interface OpcionesNotificacion {
  titulo: string;
  cuerpo: string;
  /** Fijo por producto: así la alerta de "stock bajo" y la de "se agotó" del mismo producto se reemplazan entre sí en vez de acumularse, pero productos distintos no se pisan. */
  tag: string;
}

async function mostrarNotificacion({ titulo, cuerpo, tag }: OpcionesNotificacion): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const permiso = await LocalNotifications.checkPermissions();
      if (permiso.display !== 'granted') return;
      await LocalNotifications.schedule({
        notifications: [{ id: idNumericoDesdeTag(tag), title: titulo, body: cuerpo }],
      });
    } catch {
      // Se omite en silencio: la alerta visual en "Alertas" de Inicio sigue avisando.
    }
    return;
  }

  if (!soportaNotificacionesWeb() || Notification.permission !== 'granted') return;
  try {
    if ('serviceWorker' in navigator) {
      const registro = await navigator.serviceWorker.getRegistration();
      if (registro) {
        await registro.showNotification(titulo, { body: cuerpo, icon: '/icon.svg', tag });
        return;
      }
    }
    new Notification(titulo, { body: cuerpo, icon: '/icon.svg', tag });
  } catch {
    // Idem: se omite en silencio.
  }
}

/**
 * `LocalNotifications.schedule` pide un id numérico por notificación.
 * Se deriva uno estable a partir del `tag` (mismo producto → mismo
 * id), así una alerta nueva de ese producto reemplaza a la anterior
 * en vez de acumularse — mismo comportamiento que el `tag` cumplía en
 * la Web Notification API.
 */
function idNumericoDesdeTag(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2147483647;
}

/** Alerta de que un producto quedó por debajo de su stock mínimo (pero aún no en 0). */
export function mostrarNotificacionStockBajoProducto(
  nombreProducto: string,
  stockActual: number,
  nombreTienda: string,
): void {
  void mostrarNotificacion({
    titulo: nombreTienda,
    cuerpo: `${nombreProducto}: quedan ${stockActual}, por debajo del stock mínimo.`,
    tag: `venta-facil-stock-bajo-${nombreProducto}`,
  });
}

/** Alerta final: el producto se quedó sin stock (0). */
export function mostrarNotificacionSinStock(nombreProducto: string, nombreTienda: string): void {
  void mostrarNotificacion({
    titulo: nombreTienda,
    cuerpo: `${nombreProducto} se quedó sin stock.`,
    tag: `venta-facil-stock-bajo-${nombreProducto}`,
  });
}

/** El Backup Automático (local o a Drive) no se pudo completar. */
export function mostrarNotificacionBackupAutomaticoFallido(motivo: string, nombreTienda: string): void {
  void mostrarNotificacion({
    titulo: nombreTienda,
    cuerpo: `No se pudo completar el backup automático: ${motivo}`,
    tag: 'venta-facil-backup-automatico',
  });
}
