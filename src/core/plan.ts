/**
 * Vende Fácil — Plan Free / Premium
 * ------------------------------------------------------------
 * No hay backend ni Play Store todavía: el dueño de la app instala
 * cada APK a mano, tienda por tienda, y activa Premium localmente
 * desde un panel de administrador oculto (protegido por PIN). Este
 * módulo es la lógica pura: a partir de una fecha de vencimiento
 * guardada, calcula si el plan efectivo es "gratis" o "premium".
 *
 * La "degradación silenciosa" no requiere ningún código especial:
 * como el estado se recalcula cada vez a partir de la fecha, basta
 * con que hoy sea posterior al vencimiento para que vuelva a ser
 * "gratis" solo, sin avisos ni bloqueos.
 */

import { diferenciaEnDiasSql } from './tiempo';

export const LIMITE_VENTAS_PLAN_GRATIS = 100;
export const DURACIONES_PREMIUM_DIAS = [30, 90, 365] as const;
export type DuracionPremiumDias = (typeof DURACIONES_PREMIUM_DIAS)[number];
export const DIAS_PREMIUM_MINIMO = 1;
export const DIAS_PREMIUM_MAXIMO = 365;

/** Claves de configuracion_app usadas por el plan (evita strings sueltos repetidos). */
export const CLAVE_PLAN_VENCE_EN = 'plan_vence_en';
export const CLAVE_ADMIN_PIN_HASH = 'admin_pin_hash';

export interface EstadoPlan {
  tipo: 'gratis' | 'premium';
  /** Solo tiene valor cuando tipo === 'premium'. */
  diasRestantes: number | null;
  /** Fecha 'YYYY-MM-DD' hasta la que dura el Premium activo, si lo hay. */
  venceEn: string | null;
}

/**
 * `venceEnIso` es lo que hay guardado en configuracion_app (o null si
 * nunca se activó Premium, o si se desactivó a mano). `hoyIso` es la
 * fecha local de hoy (ver core/tiempo.ts) — se recibe como parámetro
 * en vez de calcularla acá para que esta función siga siendo pura y
 * fácil de probar.
 */
export function calcularEstadoPlan(venceEnIso: string | null, hoyIso: string): EstadoPlan {
  if (!venceEnIso || venceEnIso < hoyIso) {
    return { tipo: 'gratis', diasRestantes: null, venceEn: null };
  }
  return {
    tipo: 'premium',
    diasRestantes: diferenciaEnDiasSql(hoyIso, venceEnIso),
    venceEn: venceEnIso,
  };
}
