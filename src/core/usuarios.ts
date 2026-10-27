/**
 * Vende Fácil — Usuarios (control de usuarios, solo Premium)
 * ------------------------------------------------------------
 * Lógica PURA: tipos, validaciones de nombre y contraseña, reglas del
 * bloqueo por intentos fallidos y mensajes. La lectura/escritura real vive
 * en `UsuarioRepositorio` (infraestructura/sqlite/usuario.repositorio.ts).
 *
 * Dos roles: Administrador (puede todo, y puede haber varios) y Estándar
 * (solo lo que dice core/permisos.ts).
 */

import { ErrorDeNegocio } from './reglas-negocio';
import { normalizarParaBusqueda } from './texto';

export type RolUsuario = 'administrador' | 'estandar';

export const ROLES_USUARIO: { valor: RolUsuario; etiqueta: string }[] = [
  { valor: 'administrador', etiqueta: 'Administrador' },
  { valor: 'estandar', etiqueta: 'Estándar' },
];

export function etiquetaDeRol(rol: RolUsuario): string {
  return ROLES_USUARIO.find((r) => r.valor === rol)?.etiqueta ?? rol;
}

/** Un usuario tal como lo ve la app. La contraseña (ni su hash) nunca sale del repositorio. */
export interface Usuario {
  id: number;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
  ultimoAcceso: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

// ------------------------------------------------------------
// Nombre de usuario (es lo que se ve en el recuadro de acceso: "Diego")
// ------------------------------------------------------------

export const MINIMO_CARACTERES_NOMBRE = 2;
export const MAXIMO_CARACTERES_NOMBRE = 20;
const PATRON_NOMBRE = /^[\p{L}\p{M}\p{N}]+(?:[ ._-][\p{L}\p{M}\p{N}]+)*$/u;

/**
 * Deja el nombre listo para guardar: sin espacios sobrantes y con la primera letra en
 * mayúscula ("diego" → "Diego"). Lanza ErrorDeNegocio si no es válido.
 */
export function validarNombreUsuario(nombre: string): string {
  const limpio = nombre.replace(/\s+/g, ' ').trim();
  if (limpio.length < MINIMO_CARACTERES_NOMBRE || limpio.length > MAXIMO_CARACTERES_NOMBRE) {
    throw new ErrorDeNegocio(
      `El nombre de usuario debe tener entre ${MINIMO_CARACTERES_NOMBRE} y ${MAXIMO_CARACTERES_NOMBRE} caracteres.`,
    );
  }
  if (!PATRON_NOMBRE.test(limpio)) {
    throw new ErrorDeNegocio('El nombre de usuario solo puede tener letras, números y, entre palabras, espacio, punto, guion o guion bajo.');
  }
  return limpio.charAt(0).toLocaleUpperCase('es') + limpio.slice(1);
}

/** Forma comparable del nombre (sin tildes ni mayúsculas): "José" y "jose" son el mismo usuario. */
export function claveDeNombre(nombre: string): string {
  return normalizarParaBusqueda(nombre);
}

/** La letra grande del recuadro de acceso. */
export function inicialDeUsuario(nombre: string): string {
  const primera = nombre.trim().charAt(0);
  return primera === '' ? '?' : primera.toLocaleUpperCase('es');
}

/** Número estable de 0 a `total - 1` para darle a cada usuario siempre el mismo color. */
export function indiceDeColorDeUsuario(nombre: string, total: number): number {
  let suma = 0;
  for (const caracter of claveDeNombre(nombre)) suma = (suma * 31 + (caracter.codePointAt(0) ?? 0)) % 1_000_003;
  return suma % Math.max(1, total);
}

// ------------------------------------------------------------
// Contraseña
// ------------------------------------------------------------

export const MINIMO_CARACTERES_CLAVE = 4;
export const MAXIMO_CARACTERES_CLAVE = 32;
/** Letras (con tildes y ñ), números y signos de puntuación o símbolos (. , # * $ _ & ...). Sin espacios. */
const PATRON_CLAVE = /^[\p{L}\p{M}\p{N}\p{P}\p{S}]+$/u;

/** Lanza ErrorDeNegocio si la contraseña no es válida. */
export function validarClave(clave: string): void {
  if (clave.length < MINIMO_CARACTERES_CLAVE) {
    throw new ErrorDeNegocio(`La contraseña debe tener al menos ${MINIMO_CARACTERES_CLAVE} caracteres.`);
  }
  if (clave.length > MAXIMO_CARACTERES_CLAVE) {
    throw new ErrorDeNegocio(`La contraseña no puede tener más de ${MAXIMO_CARACTERES_CLAVE} caracteres.`);
  }
  if (!PATRON_CLAVE.test(clave)) {
    throw new ErrorDeNegocio('La contraseña solo puede tener letras, números y signos como . , # * $ _ & (sin espacios).');
  }
}

// ------------------------------------------------------------
// Bloqueo por intentos fallidos
// ------------------------------------------------------------

/** Cada tantos intentos fallidos seguidos se bloquea el acceso un rato. */
export const INTENTOS_ANTES_DE_BLOQUEAR = 5;
export const SEGUNDOS_BLOQUEO_BASE = 30;
export const SEGUNDOS_BLOQUEO_MAXIMO = 300;

/**
 * Cuántos segundos hay que esperar tras este total de intentos fallidos seguidos.
 * 0 mientras no se llegue a un múltiplo de 5; luego 30 s, 60 s, 120 s... hasta 5 minutos.
 */
export function segundosDeBloqueo(intentosFallidos: number): number {
  if (intentosFallidos <= 0 || intentosFallidos % INTENTOS_ANTES_DE_BLOQUEAR !== 0) return 0;
  const vuelta = intentosFallidos / INTENTOS_ANTES_DE_BLOQUEAR;
  return Math.min(SEGUNDOS_BLOQUEO_MAXIMO, SEGUNDOS_BLOQUEO_BASE * 2 ** (vuelta - 1));
}

export type ResultadoAcceso =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: 'clave_incorrecta'; intentosRestantes: number }
  | { ok: false; motivo: 'bloqueado'; segundosEspera: number }
  | { ok: false; motivo: 'inactivo' | 'no_es_administrador' };

/** Texto para mostrar cuando un acceso (o una autorización) no salió bien. */
export function mensajeDeAccesoFallido(resultado: Exclude<ResultadoAcceso, { ok: true }>): string {
  switch (resultado.motivo) {
    case 'clave_incorrecta':
      return resultado.intentosRestantes === 1
        ? 'Contraseña incorrecta. Te queda 1 intento antes del bloqueo.'
        : `Contraseña incorrecta. Te quedan ${resultado.intentosRestantes} intentos antes del bloqueo.`;
    case 'bloqueado':
      return `Demasiados intentos. Espera ${resultado.segundosEspera} ${resultado.segundosEspera === 1 ? 'segundo' : 'segundos'} para volver a intentar.`;
    case 'inactivo':
      return 'Este usuario está desactivado.';
    case 'no_es_administrador':
      return 'Este usuario no es administrador.';
  }
}

// ------------------------------------------------------------
// Acceso a la app
// ------------------------------------------------------------

/** Minutos en segundo plano antes de volver a pedir acceso. */
export const MINUTOS_REBLOQUEO_POR_DEFECTO = 5;

/**
 * ¿Hay que volver a pedir acceso después de estar en segundo plano? Sí si pasó el tiempo, o si
 * el reloj retrocedió (no se puede confiar en el tiempo transcurrido: por seguridad se pide).
 */
export function debeBloquearPorSegundoPlano(milisegundosEnSegundoPlano: number, minutos = MINUTOS_REBLOQUEO_POR_DEFECTO): boolean {
  return milisegundosEnSegundoPlano < 0 || milisegundosEnSegundoPlano >= minutos * 60_000;
}
