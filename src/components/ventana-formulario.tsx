'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Ventana emergente (pop-up) centrada para los formularios de "Nuevo ...".
 * Se dibuja en <body> y cierra con el botón ✕, con "Cancelar" (lo pone cada
 * pantalla) o con el botón físico "Atrás" de Android. No cierra al tocar fuera,
 * para no perder lo escrito por accidente.
 */
export function VentanaFormulario({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const cerrar = (e: Event) => {
      e.preventDefault();
      onCerrar();
    };
    window.addEventListener('vendefacil:atras', cerrar);
    return () => window.removeEventListener('vendefacil:atras', cerrar);
  }, [onCerrar]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-label={titulo}
        className="max-h-[88dvh] w-full max-w-app overflow-y-auto rounded-2xl bg-white p-5 shadow-lg"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-bodega-oscuro">{titulo}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-xl leading-none text-tinta/50">
            ✕
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Etiqueta en negrita que va arriba de cada campo del formulario. */
export function EtiquetaCampo({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-sm font-bold text-tinta">{children}</label>;
}
