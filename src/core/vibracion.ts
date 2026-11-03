/**
 * Vende Fácil — Vibración corta al cobrar o guardar (lógica pura)
 * ------------------------------------------------------------
 * Solo se decide cuándo y cómo vibrar; vibrar de verdad lo hace `infraestructura/vibracion`.
 * Es una opción de Configuración > Configuración de venta, y viene ACTIVADA hasta que se apague.
 */

export const CLAVE_VIBRACION = 'vibracion_activa';

export type TipoVibracion = 'guardar' | 'cobrar';

/** Milisegundos: guardar = un toque corto; cobrar = dos toques cortos (se siente distinto). */
export const PATRONES_VIBRACION: Record<TipoVibracion, number | number[]> = {
  guardar: 35,
  cobrar: [40, 60, 40],
};

/** Sin valor guardado (nunca se tocó la opción) la vibración está activada. */
export function vibracionActiva(valorGuardado: string | null): boolean {
  if (valorGuardado === null) return true;
  return valorGuardado === '1' || valorGuardado.toLowerCase() === 'true';
}
