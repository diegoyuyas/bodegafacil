'use client';

import { etiquetaDeRol, inicialDeUsuario } from '@/core/usuarios';
import { colorDeUsuario } from './recuadro-usuario';
import { usarSesion } from './sesion-usuario';

/** En Más: quién está usando la app y el botón "Cambiar usuario". Solo aparece con el control de usuarios rigiendo. */
export function TarjetaUsuarioActual() {
  const { controlVigente, usuario, cerrarSesion } = usarSesion();
  if (!controlVigente || !usuario) return null;
  return (
    <section aria-label="Usuario actual" className="mt-6 flex items-center gap-3 rounded-xl border border-linea p-3">
      <span
        style={{ backgroundColor: colorDeUsuario(usuario.nombre) }}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-extrabold text-white"
      >
        {inicialDeUsuario(usuario.nombre)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-tinta">{usuario.nombre}</p>
        <p className="text-xs text-tinta/60">{etiquetaDeRol(usuario.rol)}</p>
      </div>
      <button
        type="button"
        onClick={cerrarSesion}
        className="h-10 shrink-0 rounded-full border border-bodega px-4 text-sm font-semibold text-bodega-oscuro active:bg-bodega-claro"
      >
        Cambiar usuario
      </button>
    </section>
  );
}
