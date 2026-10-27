'use client';

import Link from 'next/link';
import { mensajeSoloAdministrador, type Permiso } from '@/core/permisos';
import { usarSesion } from './sesion-usuario';

/**
 * Cierra una pantalla entera a quien no tiene el permiso (con el control de usuarios rigiendo).
 * Sin control de usuarios no hace nada: todo se ve como siempre. Se usa desde un `layout.tsx` de la ruta,
 * así protege también las subpantallas y las entradas directas.
 */
export function ProtegerPantalla({ permiso, children }: { permiso: Permiso; children: React.ReactNode }) {
  const { puede, cerrarSesion } = usarSesion();
  if (puede(permiso)) return <>{children}</>;
  return (
    <div className="mx-auto flex min-h-dvh max-w-app flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bodega-claro text-3xl" aria-hidden="true">
        🔒
      </div>
      <h1 className="text-lg font-extrabold text-tinta">Sin permiso</h1>
      <p className="text-sm text-tinta/70">{mensajeSoloAdministrador(permiso)}</p>
      <Link href="/mas" className="flex h-12 w-full items-center justify-center rounded-full bg-bodega text-base font-semibold text-white active:bg-bodega-oscuro">
        Volver a Más
      </Link>
      <button type="button" onClick={cerrarSesion} className="h-11 text-sm font-semibold text-bodega-oscuro">
        Cambiar usuario
      </button>
    </div>
  );
}
