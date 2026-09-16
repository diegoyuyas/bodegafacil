/**
 * Vende Fácil — Notificaciones del navegador
 * ------------------------------------------------------------
 * No hay backend ni push notifications: esto es una notificación
 * LOCAL, disparada desde el propio cliente cuando la app detecta
 * que una venta dejó a un producto por debajo (o en) su stock
 * mínimo. Usa la Notification API estándar del navegador, la misma
 * que ya sostiene el resto de la PWA (offline-first, sin servidor).
 */

export function soportaNotificaciones(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permisoNotificaciones(): NotificationPermission | null {
  return soportaNotificaciones() ? Notification.permission : null;
}

/**
 * Pide permiso al navegador. Si el usuario ya respondió antes
 * (granted o denied), el navegador no vuelve a preguntar y esta
 * función solo devuelve lo que ya había.
 */
export async function solicitarPermisoNotificaciones(): Promise<NotificationPermission> {
  if (!soportaNotificaciones()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

interface OpcionesNotificacion {
  titulo: string;
  cuerpo: string;
  /** Fijo por producto: así la alerta de "stock bajo" y la de "se agotó" del mismo producto se reemplazan entre sí en vez de acumularse, pero productos distintos no se pisan. */
  tag: string;
}

/**
 * Muestra una notificación del sistema. Camino principal:
 * `ServiceWorkerRegistration.showNotification()`, que es obligatorio
 * en Chrome Android (y funciona igual en desktop y en iOS instalado
 * como PWA) — Chrome Android lanza TypeError "Illegal constructor" si
 * se intenta `new Notification(...)` directo. Si no hay service worker
 * activo (ej. `npm run dev`, donde el SW no se registra a propósito),
 * cae al constructor directo como respaldo. En iOS Safari sin "Agregar
 * a inicio", la API de Notification ni siquiera existe — eso ya lo
 * cubre `soportaNotificaciones()` antes de llegar aquí.
 */
async function mostrarNotificacion({ titulo, cuerpo, tag }: OpcionesNotificacion): Promise<void> {
  if (!soportaNotificaciones() || Notification.permission !== 'granted') return;

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
    // Si ninguno de los dos caminos funcionó, se omite en silencio: la
    // alerta visual en la sección "Alertas" de Inicio sigue avisando.
  }
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
