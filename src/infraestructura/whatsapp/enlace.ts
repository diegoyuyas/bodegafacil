/**
 * Bodega Fácil — Enlace de WhatsApp
 * ------------------------------------------------------------
 * No existe una API gratuita para enviar mensajes automáticamente:
 * lo único disponible sin costo es abrir WhatsApp con el mensaje ya
 * escrito, para que el usuario (la bodega) lo revise y lo envíe con
 * un toque. `wa.me` exige el número en formato internacional sin "+"
 * ni espacios — el teléfono se guarda en la app como 9 dígitos, sin
 * el +51 delante (ej. "988636130"), así que acá se le antepone el
 * código de país de Perú.
 */

const CODIGO_PAIS_PERU = '51';

/**
 * Normaliza el teléfono guardado a formato internacional para wa.me.
 * Soporta el caso esperado (9 dígitos, sin +51) y, por si acaso,
 * números ya guardados con el código de país o con separadores.
 */
export function normalizarTelefonoPeru(telefono: string): string {
  const soloDigitos = telefono.replace(/\D/g, '');

  if (soloDigitos.length === 9) {
    return `${CODIGO_PAIS_PERU}${soloDigitos}`;
  }
  if (soloDigitos.startsWith(CODIGO_PAIS_PERU) && soloDigitos.length === 11) {
    return soloDigitos;
  }
  // Caso raro (número mal guardado): se envía tal cual, sin adivinar más.
  return soloDigitos;
}

export function construirEnlaceWhatsApp(telefono: string, mensaje: string): string {
  const numero = normalizarTelefonoPeru(telefono);
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
