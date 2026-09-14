/**
 * Hash de un texto usando SHA-256 vía Web Crypto (`crypto.subtle`),
 * disponible tanto en navegadores como en Node 20+, sin necesidad de
 * importar el módulo 'crypto' de Node (que ya nos dio dolores de
 * cabeza con el empaquetado de webpack — ver next.config.js). Se usa
 * para guardar el PIN del panel de administrador sin dejarlo en texto
 * plano en la base de datos.
 */
export async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const buffer = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
