'use client';

import { useEffect, useRef } from 'react';
import { pilaCapasAtras } from '@/core/capas-atras';

let escuchando = false;

/** Una sola escucha para toda la app: con un pop-up abierto, «Atrás» lo cierra y no cambia de pantalla. */
function escucharAtras() {
  if (escuchando || typeof window === 'undefined') return;
  escuchando = true;
  window.addEventListener('vendefacil:atras', (evento) => {
    if (pilaCapasAtras.cerrarUltima()) evento.preventDefault();
  });
}

/**
 * Úsalo en cada pop-up: mientras `abierta` sea true, el botón «Atrás» de Android lo cierra (llamando a `onCerrar`)
 * en lugar de subir de pantalla. Con varios pop-ups abiertos, cierra de a uno, el de más arriba primero.
 */
export function usarCapaAtras(abierta: boolean, onCerrar: () => void) {
  const cerrarRef = useRef(onCerrar);
  useEffect(() => {
    cerrarRef.current = onCerrar;
  });

  useEffect(() => {
    if (!abierta) return;
    escucharAtras();
    const id = pilaCapasAtras.abrir(() => cerrarRef.current());
    return () => pilaCapasAtras.quitar(id);
  }, [abierta]);
}
