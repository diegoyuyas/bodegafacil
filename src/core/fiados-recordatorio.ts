/**
 * Vende Fácil — Recordatorios de cobro de Fiados (lógica pura)
 * ------------------------------------------------------------
 * "Recordado hace 2 días" (para no insistir de más) y validación del teléfono que se agrega al
 * momento cuando un cliente no tiene. Sin UI ni base de datos: se prueba con `tsx`.
 * El texto del mensaje de WhatsApp es fijo (ver `construirMensajeDeuda` en whatsapp.ts).
 */
import { diferenciaEnDiasSql } from './tiempo';

/**
 * Texto bajo el cliente: «Recordado hoy», «Recordado ayer», «Recordado hace 3 días».
 * `ultimo` es 'YYYY-MM-DD HH:MM:SS' (hora local) o null si nunca se le recordó; `hoy` es 'YYYY-MM-DD'.
 */
export function textoRecordado(ultimo: string | null, hoy: string): string {
  if (!ultimo || !/^\d{4}-\d{2}-\d{2}/.test(ultimo)) return '';
  const dias = Math.max(0, diferenciaEnDiasSql(ultimo.slice(0, 10), hoy));
  if (dias === 0) return 'Recordado hoy';
  if (dias === 1) return 'Recordado ayer';
  return `Recordado hace ${dias} días`;
}

export interface TelefonoIngresado {
  /** Solo dígitos, listo para guardar; null si hay error. */
  telefono: string | null;
  error: string | null;
}

/**
 * Valida el teléfono escrito a mano: se aceptan espacios, guiones, paréntesis y un «+» al inicio,
 * y se guardan solo los dígitos (entre 6 y 12, igual que en Proveedores).
 */
export function normalizarTelefonoIngresado(texto: string): TelefonoIngresado {
  const limpio = texto.trim().replace(/^\+/, '').replace(/[\s\-().]/g, '');
  if (limpio === '') return { telefono: null, error: 'Escribe el teléfono.' };
  if (/\D/.test(limpio)) return { telefono: null, error: 'Solo números, sin letras.' };
  if (limpio.length < 6 || limpio.length > 12) return { telefono: null, error: 'Debe tener entre 6 y 12 dígitos.' };
  return { telefono: limpio, error: null };
}
