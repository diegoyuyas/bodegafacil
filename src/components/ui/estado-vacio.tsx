import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Estado vacío con acción: dice qué falta y ofrece crear lo primero con un botón
 * («Aún no tienes productos» → «Agregar el primero»). La acción puede ser un botón (`onAccion`)
 * o un enlace a otra pantalla (`hrefAccion`).
 */
export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  textoAccion,
  onAccion,
  hrefAccion,
}: {
  icono?: ReactNode;
  titulo: string;
  descripcion?: string;
  textoAccion?: string;
  onAccion?: () => void;
  hrefAccion?: string;
}) {
  const clases =
    'mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-bodega px-6 text-sm font-semibold text-white active:bg-bodega-oscuro';
  return (
    <div className="flex flex-col items-center border-y border-linea px-4 py-10 text-center">
      {icono && <div className="mb-3 text-bodega">{icono}</div>}
      <p className="text-base font-bold text-tinta">{titulo}</p>
      {descripcion && <p className="mt-1 text-sm text-tinta-suave">{descripcion}</p>}
      {textoAccion && hrefAccion && (
        <Link href={hrefAccion} className={clases}>
          {textoAccion}
        </Link>
      )}
      {textoAccion && !hrefAccion && onAccion && (
        <button type="button" onClick={onAccion} className={clases}>
          {textoAccion}
        </button>
      )}
    </div>
  );
}
