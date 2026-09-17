/**
 * Vende Fácil — Tipo de moneda (Más > Configuración > Tipo de moneda)
 * ------------------------------------------------------------
 * Función Free: el símbolo elegido acá reemplaza el "S/" que antes
 * estaba escrito a mano en cada pantalla de la app. Todo sigue
 * siendo el mismo número — esto solo cambia cómo se muestra.
 */

export const CLAVE_MONEDA = 'moneda';

export interface OpcionMoneda {
  codigo: string;
  simbolo: string;
  etiqueta: string;
}

export const MONEDAS_DISPONIBLES: OpcionMoneda[] = [
  { codigo: 'PEN', simbolo: 'S/', etiqueta: 'S/ (Soles)' },
  { codigo: 'MXN', simbolo: 'MX$', etiqueta: 'MX$ (Pesos mexicanos)' },
  { codigo: 'USD', simbolo: 'US$', etiqueta: 'US$ (Dólares)' },
  { codigo: 'OTRO', simbolo: '$', etiqueta: 'Otro ($)' },
];

export const MONEDA_PREDETERMINADA: OpcionMoneda = MONEDAS_DISPONIBLES[0]!;

/** El código de moneda guardado si es uno válido; si no, Soles (el comportamiento de siempre). */
export function obtenerMoneda(valorGuardado: string | null): OpcionMoneda {
  return MONEDAS_DISPONIBLES.find((m) => m.codigo === valorGuardado) ?? MONEDA_PREDETERMINADA;
}

/** El símbolo guardado listo para mostrar, ej. "S/", "MX$", "US$", "$". */
export function obtenerSimboloMoneda(valorGuardado: string | null): string {
  return obtenerMoneda(valorGuardado).simbolo;
}

/** Mismo formato que antes ("S/ 12.50"), pero con el símbolo que corresponda. */
export function formatearMonto(monto: number, simbolo: string): string {
  return `${simbolo} ${monto.toFixed(2)}`;
}
