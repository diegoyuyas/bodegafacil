'use client';

import type { Usuario } from '@/core/usuarios';
import { PuertaClave, type PropsPuertaClave } from './puerta-clave';

/**
 * Pide la contraseña de un ADMINISTRADOR (varios recuadros si hay más de uno). Sirve para entrar a
 * pantallas de administrador y para que un administrador AUTORICE una acción puntual a un usuario
 * estándar. Es `PuertaClave` con solo administradores.
 */
export function PuertaAdministrador({
  administradores,
  ...resto
}: Omit<PropsPuertaClave, 'usuarios' | 'preguntaSeleccion'> & { administradores: Usuario[] }) {
  return <PuertaClave {...resto} usuarios={administradores} preguntaSeleccion="¿Qué administrador eres?" />;
}
