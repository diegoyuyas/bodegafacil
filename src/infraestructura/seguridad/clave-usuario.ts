/**
 * Protección de contraseñas de usuario (y de la clave de recuperación).
 * ------------------------------------------------------------
 * Nunca se guarda la contraseña: se guarda su "huella" PBKDF2-SHA256 con una sal
 * propia de cada usuario (dos usuarios con la misma contraseña tienen huellas
 * distintas) y muchas iteraciones, que hacen lento adivinarla por fuerza bruta.
 * Usa Web Crypto (`crypto.subtle`), igual que hash.ts: disponible en el celular,
 * en el navegador y en Node, sin importar el módulo 'crypto' de Node.
 */

export interface ClaveProtegida {
  /** Huella en hexadecimal. */
  hash: string;
  /** Sal aleatoria en hexadecimal. */
  sal: string;
  iteraciones: number;
}

/** Más iteraciones = más seguro pero más lento. 100 000 tarda una fracción de segundo en un celular. */
export const ITERACIONES_POR_DEFECTO = 100_000;

function aHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function deHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function derivar(clave: string, sal: Uint8Array, iteraciones: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal as BufferSource, iterations: iteraciones },
    material,
    256,
  );
  return aHex(new Uint8Array(bits));
}

/** Compara dos textos en tiempo constante (no revela cuántas letras acertó). */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

export async function protegerClave(clave: string, iteraciones = ITERACIONES_POR_DEFECTO): Promise<ClaveProtegida> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derivar(clave, sal, iteraciones), sal: aHex(sal), iteraciones };
}

export async function claveCoincide(clave: string, protegida: ClaveProtegida): Promise<boolean> {
  const hash = await derivar(clave, deHex(protegida.sal), protegida.iteraciones);
  return iguales(hash, protegida.hash);
}

// ------------------------------------------------------------
// Clave de recuperación (por si se olvida la contraseña del administrador)
// ------------------------------------------------------------

/** Sin 0/O ni 1/I: se anota en papel y no debe confundirse. 32 símbolos = reparto parejo con un byte. */
const ALFABETO_RECUPERACION = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Una clave nueva con el formato XXXX-XXXX-XXXX (60 bits de azar). */
export function generarClaveRecuperacion(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const letras = Array.from(bytes, (byte) => ALFABETO_RECUPERACION.charAt(byte % ALFABETO_RECUPERACION.length));
  return [letras.slice(0, 4), letras.slice(4, 8), letras.slice(8, 12)].map((grupo) => grupo.join('')).join('-');
}

/** Quita guiones y espacios y pasa a mayúsculas, para que se pueda escribir sin cuidado. */
export function normalizarClaveRecuperacion(texto: string): string {
  return texto.replace(/[\s-]+/g, '').toLocaleUpperCase('es');
}
