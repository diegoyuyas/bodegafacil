import type { ReactNode } from 'react';

/** Título de sección dentro de una pantalla, con una línea de ayuda opcional debajo. */
export function TituloSeccion({
  children,
  detalle,
  className = '',
}: {
  children: ReactNode;
  detalle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="text-sm font-bold text-bodega-oscuro">{children}</h2>
      {detalle && <p className="mt-0.5 text-xs text-tinta-suave">{detalle}</p>}
    </div>
  );
}
