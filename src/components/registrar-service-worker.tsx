'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker que permite que Bodega Fácil funcione
 * instalada y sin conexión (principio "offline-first", sección 2
 * del documento maestro). No renderiza nada visible.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('No se pudo registrar el service worker:', error);
      });
    });
  }, []);

  return null;
}
