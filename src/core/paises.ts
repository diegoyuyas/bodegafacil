/**
 * Vende Fácil — Prefijo de país del teléfono del cliente
 * ------------------------------------------------------------
 * Sirve para armar el enlace de WhatsApp del aviso de fiado (ver
 * infraestructura/whatsapp/enlace.ts) sin asumir que la tienda está
 * en Perú. El teléfono del cliente se sigue guardando tal cual lo
 * escribe el bodeguero (solo el número local, sin el prefijo) — el
 * prefijo se elige una sola vez por tienda acá, y se antepone recién
 * al armar el enlace o al mostrarlo en pantalla.
 */

export const CLAVE_PREFIJO_PAIS = 'prefijo_pais';

export interface PaisPrefijo {
  /** Código telefónico sin "+", ej. '51'. */
  prefijo: string;
  nombre: string;
}

export const PAISES_AMERICA: PaisPrefijo[] = [
  { prefijo: '51', nombre: 'Perú' },
  { prefijo: '52', nombre: 'México' },
  { prefijo: '54', nombre: 'Argentina' },
  { prefijo: '55', nombre: 'Brasil' },
  { prefijo: '56', nombre: 'Chile' },
  { prefijo: '57', nombre: 'Colombia' },
  { prefijo: '58', nombre: 'Venezuela' },
  { prefijo: '502', nombre: 'Guatemala' },
  { prefijo: '503', nombre: 'El Salvador' },
  { prefijo: '504', nombre: 'Honduras' },
  { prefijo: '505', nombre: 'Nicaragua' },
  { prefijo: '506', nombre: 'Costa Rica' },
  { prefijo: '507', nombre: 'Panamá' },
  { prefijo: '591', nombre: 'Bolivia' },
  { prefijo: '593', nombre: 'Ecuador' },
  { prefijo: '595', nombre: 'Paraguay' },
  { prefijo: '598', nombre: 'Uruguay' },
  { prefijo: '1', nombre: 'Estados Unidos / Canadá' },
];

export const PREFIJO_PAIS_PREDETERMINADO = '51';

/** El prefijo guardado si es uno válido de la lista; si no, Perú (el comportamiento de siempre). */
export function obtenerPrefijoPais(valorGuardado: string | null): string {
  if (valorGuardado && PAISES_AMERICA.some((p) => p.prefijo === valorGuardado)) {
    return valorGuardado;
  }
  return PREFIJO_PAIS_PREDETERMINADO;
}

/** Nombre del país para ese prefijo, para mostrar junto al selector. */
export function nombrePais(prefijo: string): string {
  return PAISES_AMERICA.find((p) => p.prefijo === prefijo)?.nombre ?? 'Perú';
}
