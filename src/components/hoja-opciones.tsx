'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { mostrarBarraInferior } from '@/core/navegacion';
import { usarCapaAtras } from '@/hooks/usar-capa-atras';
import { usarEscribiendo } from '@/hooks/usar-escribiendo';

/**
 * Pop-up desde abajo con un título y unas pocas opciones (hijos). Igual que el detalle de un pedido: va en un
 * portal sobre <body>, se apoya SOBRE la barra inferior (esta sigue a la vista), se cierra tocando fuera, con la ✕
 * o con el botón «Atrás» de Android (que no cambia de pantalla). En pantallas sin barra inferior (p. ej. Fiados), o
 * mientras se escribe (la barra se oculta con el teclado), llega hasta el borde de abajo.
 */
export function HojaOpciones({
  titulo,
  subtitulo,
  onCerrar,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  usarCapaAtras(true, onCerrar);
  const pathname = usePathname();
  const escribiendo = usarEscribiendo();
  const conBarra = mostrarBarraInferior(pathname) && !escribiendo;
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;

  return createPortal(
    <div
      className={`fixed inset-x-0 top-0 z-40 flex items-end justify-center bg-black/40 ${
        conBarra ? 'bottom-[calc(4rem+var(--area-segura-abajo)+var(--desfase-viewport-abajo,0px))]' : 'bottom-0'
      }`}
      onClick={onCerrar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="flex max-h-full w-full max-w-app flex-col rounded-t-2xl bg-papel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold text-bodega-oscuro">{titulo}</h2>
            {subtitulo && <p className="truncate text-xs text-tinta-suave">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="shrink-0 text-2xl leading-none text-tinta-suave">
            ✕
          </button>
        </div>
        <div className="space-y-2 overflow-y-auto px-5 pb-4 pt-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
