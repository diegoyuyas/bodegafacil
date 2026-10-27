'use client';

import { indiceDeColorDeUsuario, inicialDeUsuario, type Usuario } from '@/core/usuarios';

/** Colores de los recuadros: cada usuario siempre tiene el mismo. */
export const COLORES_USUARIO = ['#0F6B7A', '#B7791F', '#7C3AED', '#BE123C', '#047857', '#1D4ED8', '#C2410C', '#4D7C0F'];

export function colorDeUsuario(nombre: string): string {
  return COLORES_USUARIO[indiceDeColorDeUsuario(nombre, COLORES_USUARIO.length)] ?? '#0F6B7A';
}

/**
 * Recuadro de usuario: un cuadrado de color con la inicial en grande y, debajo, el nombre.
 *   [ D ]
 *   Diego
 * Se usa en la pantalla de acceso y al elegir qué administrador autoriza.
 */
export function RecuadroUsuario({
  usuario,
  seleccionado,
  onClick,
  pequeno,
}: {
  usuario: Pick<Usuario, 'nombre'>;
  seleccionado?: boolean;
  onClick?: () => void;
  pequeno?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Usuario ${usuario.nombre}`}
      aria-pressed={seleccionado}
      className="flex w-full flex-col items-center gap-2 active:opacity-80"
    >
      <span
        style={{ backgroundColor: colorDeUsuario(usuario.nombre) }}
        className={`flex aspect-square w-full items-center justify-center rounded-3xl font-extrabold leading-none text-white shadow-sm ${
          pequeno ? 'text-5xl' : 'text-7xl'
        } ${seleccionado ? 'ring-4 ring-bodega ring-offset-2' : ''}`}
      >
        {inicialDeUsuario(usuario.nombre)}
      </span>
      <span className="w-full truncate text-center text-sm font-bold text-tinta">{usuario.nombre}</span>
    </button>
  );
}
