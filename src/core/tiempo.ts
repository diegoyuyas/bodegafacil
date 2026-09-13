/**
 * Bodega Fácil — Fecha y hora local
 * ------------------------------------------------------------
 * SQLite (`datetime('now')`, `date('now')`) trabaja en UTC por
 * defecto. Perú está en UTC-5 sin horario de verano: una venta hecha
 * a las 7pm hora Lima ya es "mañana" en UTC, así que filtrar "ventas
 * de hoy" con `date('now')` agrupa mal las ventas de la tarde/noche.
 *
 * La solución: nunca le pedimos la fecha a SQLite. Se calcula aquí,
 * en JavaScript, usando los getters locales de `Date` (que sí reflejan
 * la hora del dispositivo), y se pasa como parámetro explícito a cada
 * INSERT/WHERE. Esto también significa que la app no depende de nada
 * especial: usa la fecha y hora del celular automáticamente.
 */

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD HH:MM:SS' en hora local — para columnas fecha_hora. */
export function ahoraLocalSql(fecha: Date = new Date()): string {
  return (
    `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())} ` +
    `${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}:${dosDigitos(fecha.getSeconds())}`
  );
}

/** 'YYYY-MM-DD' en hora local — para comparar "es de hoy". */
export function hoyLocalSql(fecha: Date = new Date()): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}
