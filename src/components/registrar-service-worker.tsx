'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker que permite que Vende Fácil funcione
 * instalada y sin conexión (principio "offline-first", sección 2
 * del documento maestro). No renderiza nada visible.
 *
 * Solo se registra en producción (`next build && next start`). En
 * desarrollo (`next dev`) el service worker cachea los archivos de
 * `/_next/static/`, y como esos nombres no cambian en cada guardado
 * como sí pasa en producción, terminas ejecutando JS viejo en el
 * navegador aunque el servidor ya mande el HTML actualizado — eso
 * provoca errores de "hydration" y la sensación de que los cambios
 * "no se aplican".
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      // Por si ya quedó uno registrado de una sesión anterior: lo
      // quitamos para que el navegador vuelva a pedirle todo al
      // servidor de desarrollo en vez de servir JS viejo desde caché.
      navigator.serviceWorker.getRegistrations().then((registros) => {
        registros.forEach((registro) => registro.unregister());
      });
      return;
    }

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('No se pudo registrar el service worker:', error);
      });
    });
  }, []);

  return null;
}
