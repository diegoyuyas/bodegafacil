'use client';

import { useEffect, useState } from 'react';
import { obtenerContenedor } from '@/infraestructura/sqlite/contenedor';

/**
 * Splash de arranque — logo + crédito, visible mientras se prepara la
 * base de datos local (sql.js/WASM) por primera vez.
 *
 * No usa un `setTimeout` fijo: espera lo que tarde más entre una
 * duración mínima (para que el logo no "parpadee" en equipos rápidos)
 * y que el contenedor de datos esté realmente listo. Así, en un celular
 * viejo donde sql.js tarda más de 3 s en inicializar, el splash se
 * queda el tiempo que haga falta en vez de mostrar la app a medio
 * cargar.
 *
 * Si la base falla al iniciar, igual dejamos de esperar (no bloqueamos
 * el splash para siempre): cada pantalla ya sabe mostrar su propio
 * mensaje de error vía `usarContenedor()`.
 */

const DURACION_MINIMA_MS = 3000;
const DURACION_TRANSICION_MS = 400;

export function PantallaSplash({ children }: { children: React.ReactNode }) {
  const [listoParaOcultar, setListoParaOcultar] = useState(false);
  const [splashMontado, setSplashMontado] = useState(true);

  useEffect(() => {
    let activo = true;

    const esperaMinima = new Promise<void>((resolve) => {
      setTimeout(resolve, DURACION_MINIMA_MS);
    });
    const esperaBaseDeDatos = obtenerContenedor().catch(() => undefined);

    Promise.all([esperaMinima, esperaBaseDeDatos]).then(() => {
      if (activo) setListoParaOcultar(true);
    });

    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    if (!listoParaOcultar) return;
    const temporizador = setTimeout(() => setSplashMontado(false), DURACION_TRANSICION_MS);
    return () => clearTimeout(temporizador);
  }, [listoParaOcultar]);

  return (
    <>
      {children}
      {splashMontado && (
        <div
          aria-hidden={listoParaOcultar}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-papel"
          style={{
            transition: `opacity ${DURACION_TRANSICION_MS}ms ease`,
            opacity: listoParaOcultar ? 0 : 1,
            pointerEvents: listoParaOcultar ? 'none' : 'auto',
          }}
        >
          <img
            src="/logo-vende-facil.png"
            alt="Vende Fácil"
            width={512}
            height={512}
            className="h-36 w-36"
          />

          <div className="mt-8 flex gap-1.5" aria-hidden="true">
            <span className="pantalla-splash-punto" style={{ animationDelay: '0ms' }} />
            <span className="pantalla-splash-punto" style={{ animationDelay: '150ms' }} />
            <span className="pantalla-splash-punto" style={{ animationDelay: '300ms' }} />
          </div>

          <p className="absolute bottom-8 text-xs text-tinta/50">
            Desarrollado por ITECT
          </p>
        </div>
      )}
    </>
  );
}
