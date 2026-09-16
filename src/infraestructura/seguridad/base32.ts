/**
 * Base32 estilo Crockford — alfabeto sin I/L/O/U, para que al copiar
 * o dictar un código por WhatsApp no se confunda con 1/0. Se usa para
 * mostrar bytes crudos (ID de dispositivo, códigos de activación
 * firmados) como texto plano.
 *
 * `base32ABytes` es tolerante al pegar: ignora espacios/guiones,
 * pasa todo a mayúsculas, y corrige las confusiones típicas (O→0,
 * I/L→1) antes de decodificar.
 */

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const INDICE: Record<string, number> = {};
for (let i = 0; i < ALFABETO.length; i++) {
  INDICE[ALFABETO[i] as string] = i;
}

export function bytesABase32(bytes: Uint8Array): string {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    salida += ALFABETO[(valor << (5 - bits)) & 31];
  }
  return salida;
}

export function base32ABytes(texto: string): Uint8Array {
  const limpio = texto
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');

  const bytes: number[] = [];
  let bits = 0;
  let valor = 0;
  for (const char of limpio) {
    const indice = INDICE[char];
    if (indice === undefined) continue; // caracter fuera del alfabeto (ej. una "U" mal tecleada): se ignora
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/** Junta el texto en bloques separados por guion, más fácil de leer y copiar. */
export function formatearEnBloques(texto: string, tamañoBloque = 5): string {
  const bloques: string[] = [];
  for (let i = 0; i < texto.length; i += tamañoBloque) {
    bloques.push(texto.slice(i, i + tamañoBloque));
  }
  return bloques.join('-');
}
