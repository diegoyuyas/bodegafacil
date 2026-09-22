/**
 * Vende Fácil — Enlace de WhatsApp
 * ------------------------------------------------------------
 * No existe una API gratuita para enviar mensajes automáticamente:
 * lo único disponible sin costo es abrir WhatsApp con el mensaje ya
 * escrito, para que el usuario (la bodega) lo revise y lo envíe con
 * un toque. `wa.me` exige el número en formato internacional sin "+"
 * ni espacios — el teléfono se guarda en la app como el número local
 * (sin prefijo de país), así que acá se le antepone el prefijo que
 * la tienda eligió en Más > Configuración (ver core/paises.ts).
 */

/**
 * Normaliza el teléfono guardado a formato internacional para wa.me,
 * anteponiendo el prefijo del país configurado. Si el número ya
 * venía con ese prefijo delante (por si se guardó así alguna vez), no
 * lo duplica.
 */
export function normalizarTelefono(telefono: string, prefijoPais: string): string {
  const soloDigitos = telefono.replace(/\D/g, '');
  if (soloDigitos.startsWith(prefijoPais)) {
    return soloDigitos;
  }
  return `${prefijoPais}${soloDigitos}`;
}

export function construirEnlaceWhatsApp(telefono: string, mensaje: string, prefijoPais: string): string {
  const numero = normalizarTelefono(telefono, prefijoPais);
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** Enlace que abre directamente el chat con ese número, sin mensaje escrito. */
export function construirEnlaceChatWhatsApp(telefono: string, prefijoPais: string): string {
  return `https://wa.me/${normalizarTelefono(telefono, prefijoPais)}`;
}
