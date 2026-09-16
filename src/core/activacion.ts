/**
 * Vende Fácil — Empaquetado de códigos de activación de Premium
 * ------------------------------------------------------------
 * No hay servidor: el dueño de la app genera estos códigos desde su
 * propia computadora (ver scripts/activacion/) y los manda por
 * WhatsApp. Cada código trae, firmado con Ed25519, los días de
 * Premium a otorgar, hasta qué fecha es válido para canjearse, y el
 * ID del dispositivo al que está atado (para que copiar el mismo
 * texto en otra tienda no funcione).
 *
 * Este módulo SOLO empaqueta/desempaqueta los bytes del payload (es
 * dominio puro, sin criptografía ni dependencias externas — así se
 * puede probar sin librerías). Firmar y verificar la firma vive en
 * infraestructura/seguridad/activacion.ts, que sí depende de
 * @noble/ed25519.
 *
 * Formato del payload (13 bytes, antes de la firma):
 *   byte 0:     versión (1)
 *   bytes 1-2:  días de Premium, uint16 big-endian (0-65535, de sobra para 1-365)
 *   bytes 3-4:  día de vencimiento del CÓDIGO (no del Premium), como
 *               días desde EPOCA_BASE, uint16 big-endian
 *   bytes 5-12: ID del dispositivo (8 bytes crudos)
 * A esto se le pega la firma Ed25519 (64 bytes) → 77 bytes totales,
 * que se muestran como texto en Base32 Crockford (ver
 * infraestructura/seguridad/base32.ts).
 */

export const VERSION_PAYLOAD = 1;
export const LARGO_DEVICE_ID = 8;
export const LARGO_PAYLOAD = 1 + 2 + 2 + LARGO_DEVICE_ID;
export const LARGO_FIRMA = 64;
export const LARGO_TOTAL_CODIGO = LARGO_PAYLOAD + LARGO_FIRMA;

/** Fecha base para no gastar bytes guardando el año completo (uint16 de días alcanza para ~179 años desde acá). */
const EPOCA_BASE_MS = Date.UTC(2025, 0, 1);

export function diaEpocaDesdeFecha(fechaIso: string): number {
  const [año = 2025, mes = 1, dia = 1] = fechaIso.split('-').map(Number);
  return Math.round((Date.UTC(año, mes - 1, dia) - EPOCA_BASE_MS) / 86_400_000);
}

export function fechaDesdeDiaEpoca(diaEpoca: number): string {
  const fecha = new Date(EPOCA_BASE_MS + diaEpoca * 86_400_000);
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(
    fecha.getUTCDate(),
  ).padStart(2, '0')}`;
}

export interface PayloadCodigoActivacion {
  diasPremium: number;
  /** 8 bytes crudos. */
  deviceId: Uint8Array;
  /** 'YYYY-MM-DD' — último día en que este código se puede canjear. */
  expiraEn: string;
}

export function empaquetarPayload(payload: PayloadCodigoActivacion): Uint8Array {
  const bytes = new Uint8Array(LARGO_PAYLOAD);
  const vista = new DataView(bytes.buffer);
  bytes[0] = VERSION_PAYLOAD;
  vista.setUint16(1, payload.diasPremium, false);
  vista.setUint16(3, diaEpocaDesdeFecha(payload.expiraEn), false);
  bytes.set(payload.deviceId.subarray(0, LARGO_DEVICE_ID), 5);
  return bytes;
}

export function desempaquetarPayload(bytes: Uint8Array): PayloadCodigoActivacion | null {
  if (bytes.length !== LARGO_PAYLOAD) return null;
  if (bytes[0] !== VERSION_PAYLOAD) return null;
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    diasPremium: vista.getUint16(1, false),
    expiraEn: fechaDesdeDiaEpoca(vista.getUint16(3, false)),
    deviceId: bytes.slice(5, 5 + LARGO_DEVICE_ID),
  };
}

export function idsDispositivoIguales(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.every((byte, i) => byte === b[i]);
}

/** Claves de configuracion_app usadas por la activación por código. */
export const CLAVE_DEVICE_ID = 'device_id';
export const CLAVE_CODIGOS_ACTIVACION_USADOS = 'codigos_activacion_usados';
/** No guardar más de esto: alcanza de sobra y evita que la lista crezca sin límite. */
export const MAXIMO_CODIGOS_USADOS_GUARDADOS = 50;
