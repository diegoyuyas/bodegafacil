/**
 * Vende Fácil — Verificación de códigos de activación de Premium
 * ------------------------------------------------------------
 * Contraparte, del lado de la app, de scripts/activacion/generar-
 * codigo.mjs (que corre en la computadora del dueño). Acá solo se
 * VERIFICA: la app nunca tiene ni necesita la llave privada.
 */

import * as ed from '@noble/ed25519';
import {
  desempaquetarPayload,
  idsDispositivoIguales,
  LARGO_DEVICE_ID,
  LARGO_PAYLOAD,
  LARGO_TOTAL_CODIGO,
} from '@/core/activacion';
import { base32ABytes, bytesABase32, formatearEnBloques } from './base32';

/**
 * Llave pública del dueño de la app (Ed25519, 32 bytes en hex). A
 * propósito es pública: solo sirve para VERIFICAR códigos, nunca
 * para generarlos. La llave privada correspondiente vive únicamente
 * en la computadora del dueño — ver scripts/activacion/README.md.
 *
 * Si alguna vez se rota el par de llaves (ej. se sospecha que la
 * privada se filtró), hay que generar uno nuevo con
 * scripts/activacion/generar-llaves.mjs y actualizar este valor: los
 * códigos ya emitidos con la llave vieja dejan de servir.
 */
export const LLAVE_PUBLICA_HEX = 'e017fda1c029865e6a7f6ab426d43b965981ed5651f45b89ddda43be0ae4b538';

export function generarIdDispositivo(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(LARGO_DEVICE_ID));
}

export function idDispositivoATexto(id: Uint8Array): string {
  return formatearEnBloques(bytesABase32(id));
}

export function textoAIdDispositivo(texto: string): Uint8Array {
  return base32ABytes(texto);
}

/** Igual que `formatearEnBloques(bytesABase32(...))`, pero para el código completo (más largo). */
export function formatearCodigoParaMostrar(codigoBase32: string): string {
  return formatearEnBloques(codigoBase32, 5);
}

export type ResultadoCodigoActivacion =
  | { ok: true; diasPremium: number }
  | { ok: false; motivo: 'formato' | 'firma' | 'dispositivo' | 'expirado' };

/**
 * Verifica un código de activación pegado por el bodeguero:
 * 1. Decodifica el texto a bytes y separa payload + firma.
 * 2. Verifica la firma con la llave pública embebida arriba.
 * 3. Confirma que el deviceId del código coincide con el de este dispositivo.
 * 4. Confirma que todavía no venció el plazo para canjearlo.
 *
 * El chequeo de "código ya usado" se hace afuera (en PlanRepositorio),
 * porque necesita comparar contra la lista guardada en la base local
 * — este módulo no toca la base de datos.
 */
export async function verificarCodigoActivacion(
  codigoTexto: string,
  deviceIdActual: Uint8Array,
  hoyIso: string,
): Promise<ResultadoCodigoActivacion> {
  const bytes = base32ABytes(codigoTexto);
  if (bytes.length !== LARGO_TOTAL_CODIGO) return { ok: false, motivo: 'formato' };

  const payloadBytes = bytes.slice(0, LARGO_PAYLOAD);
  const firma = bytes.slice(LARGO_PAYLOAD);
  const payload = desempaquetarPayload(payloadBytes);
  if (!payload) return { ok: false, motivo: 'formato' };

  let firmaValida = false;
  try {
    firmaValida = await ed.verifyAsync(firma, payloadBytes, LLAVE_PUBLICA_HEX);
  } catch {
    firmaValida = false;
  }
  if (!firmaValida) return { ok: false, motivo: 'firma' };

  if (!idsDispositivoIguales(payload.deviceId, deviceIdActual)) {
    return { ok: false, motivo: 'dispositivo' };
  }
  if (payload.expiraEn < hoyIso) {
    return { ok: false, motivo: 'expirado' };
  }
  return { ok: true, diasPremium: payload.diasPremium };
}

/** Hash corto (no reversible) del código, para guardar "ya se usó" sin guardar el código en texto plano. */
export async function hashCodigoActivacion(codigoTexto: string): Promise<string> {
  const bytes = base32ABytes(codigoTexto);
  const buffer = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
