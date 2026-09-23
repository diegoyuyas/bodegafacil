/**
 * Vende Fácil — Generar un código de activación de Premium (local)
 * ------------------------------------------------------------
 * Contraparte, corriendo dentro de la app en vez de en la laptop, de
 * scripts/activacion/generar-codigo.mjs. Usa exactamente el mismo
 * formato de payload (core/activacion.ts) y el mismo esquema de firma
 * (Ed25519), así que un código generado acá funciona igual de bien.
 *
 * Requiere la llave privada del dueño de la app (ver
 * infraestructura/seguridad/llave-privada-local.ts) — sin ella, esta
 * función no puede generar nada válido.
 */

import * as ed from '@noble/ed25519';
import { empaquetarPayload, type PayloadCodigoActivacion } from '@/core/activacion';
import { bytesABase32, formatearEnBloques, base32ABytes } from './base32';
import { sumarDiasLocalSql } from '@/core/tiempo';

export type ResultadoGenerarCodigo =
  | { ok: true; codigo: string; venceEn: string }
  | { ok: false; mensaje: string };

function hexABytes(hex: string): Uint8Array | null {
  const limpio = hex.trim().replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]+$/.test(limpio) || limpio.length % 2 !== 0) return null;
  const bytes = new Uint8Array(limpio.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(limpio.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function generarCodigoActivacion(
  llavePrivadaHex: string,
  dispositivoTexto: string,
  diasPremium: number,
  venceEnDias: number,
): Promise<ResultadoGenerarCodigo> {
  const llavePrivada = hexABytes(llavePrivadaHex);
  if (!llavePrivada || llavePrivada.length !== 32) {
    return { ok: false, mensaje: 'La llave privada guardada no es válida. Quítala y vuelve a pegarla.' };
  }

  const deviceId = base32ABytes(dispositivoTexto);
  if (deviceId.length !== 8) {
    return {
      ok: false,
      mensaje: `El ID "${dispositivoTexto}" no decodificó a 8 bytes (dio ${deviceId.length}). Revisa que lo hayas copiado completo.`,
    };
  }

  const venceEn = sumarDiasLocalSql(venceEnDias);
  const payload: PayloadCodigoActivacion = { diasPremium, deviceId, expiraEn: venceEn };
  const payloadBytes = empaquetarPayload(payload);

  let firma: Uint8Array;
  try {
    firma = await ed.signAsync(payloadBytes, llavePrivada);
  } catch (e) {
    return { ok: false, mensaje: 'No se pudo firmar el código: ' + (e instanceof Error ? e.message : 'error desconocido') };
  }

  const codigoCompleto = new Uint8Array(payloadBytes.length + firma.length);
  codigoCompleto.set(payloadBytes, 0);
  codigoCompleto.set(firma, payloadBytes.length);

  return { ok: true, codigo: formatearEnBloques(bytesABase32(codigoCompleto)), venceEn };
}
