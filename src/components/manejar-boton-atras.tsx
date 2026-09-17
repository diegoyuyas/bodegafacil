'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * Botón físico "Atrás" de Android, dentro del APK: por defecto,
 * Capacitor sale de la app apenas no queda historial en el WebView —
 * lo cual, para una PWA de una sola página con navegación por rutas
 * (como esta), casi siempre se siente como "un toque y ya me sacó".
 *
 * Acá se intercepta ese evento: si el WebView todavía puede retroceder
 * (`canGoBack`, viene del propio plugin y refleja el historial de
 * navegación real de la app — cuántas pantallas visitadas hacia
 * atrás quedan), se hace un "atrás" normal de navegador
 * (`window.history.back()`), que Next.js entiende y cambia de
 * pantalla. Solo cuando ya no queda ninguna pantalla previa (típico:
 * está en Inicio, la primera que se abrió) se deja que Android
 * minimice la app, como cualquier otra.
 *
 * No hace nada en navegador/PWA (`Capacitor.isNativePlatform()` es
 * false ahí) — el botón atrás del navegador ya funciona como se
 * espera sin tocar nada.
 */
export function ManejarBotonAtras() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });

    return () => {
      listener.then((manejador) => manejador.remove());
    };
  }, []);

  return null;
}
