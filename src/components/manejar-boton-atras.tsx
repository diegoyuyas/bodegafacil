'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * Rutas donde subir un nivel (quitarle el último segmento a la URL)
 * NO da la pantalla "padre" correcta, porque esa ruta intermedia no
 * existe como pantalla propia. Hoy solo pasa con Ventas: no hay
 * ningún `/ventas` a secas, solo `/ventas/nueva` — su padre lógico es
 * Inicio, no "/ventas".
 */
const PADRES_ESPECIALES: Record<string, string> = {
  '/ventas/nueva': '/',
};

/**
 * Calcula la pantalla "padre" de `pathname` según la estructura de
 * carpetas de `src/app` (no según el historial de navegación real).
 * Por ejemplo: /mas/configuracion/pin → /mas/configuracion → /mas → /
 * (Inicio) → null (ya no hay padre, ahí se minimiza la app).
 */
function calcularRutaPadre(pathname: string): string | null {
  if (pathname === '/') return null;
  if (PADRES_ESPECIALES[pathname]) return PADRES_ESPECIALES[pathname];

  const segmentos = pathname.split('/').filter(Boolean);
  segmentos.pop();
  return segmentos.length === 0 ? '/' : '/' + segmentos.join('/');
}

/**
 * Botón físico "Atrás" de Android, dentro del APK.
 *
 * A propósito NO usa el historial real del navegador
 * (`window.history.back()`, como antes): ese historial recuerda CADA
 * pantalla que se visitó, en el orden en que se visitó, así que ir a
 * Más > Reportes, volver, ir a Más > Clientes, volver, ir a Más >
 * Configuración, hacía que el botón atrás desandara los 3 saltos uno
 * por uno — no lo que el usuario espera del botón atrás de Android.
 *
 * En cambio, cada toque calcula la pantalla "padre" a partir de la
 * URL actual (ver `calcularRutaPadre`) y navega ahí con `replace`
 * (no `push`, para no seguir amontonando historial): así, sin
 * importar por dónde se haya paseado antes, el botón atrás siempre
 * sube un nivel en la jerarquía de la app — de cualquier pantalla
 * dentro de Más, a Más; de Más, a Inicio; de Inicio, minimiza.
 *
 * No hace nada en navegador/PWA (`Capacitor.isNativePlatform()` es
 * false ahí) — el botón atrás del navegador ya funciona como se
 * espera sin tocar nada.
 */
export function ManejarBotonAtras() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = App.addListener('backButton', () => {
      const rutaPadre = calcularRutaPadre(pathname);
      if (rutaPadre) {
        router.replace(rutaPadre);
      } else {
        App.exitApp();
      }
    });

    return () => {
      listener.then((manejador) => manejador.remove());
    };
  }, [pathname, router]);

  return null;
}
