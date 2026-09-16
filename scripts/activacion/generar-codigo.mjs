// Genera un código de activación de Premium firmado, para mandarlo
// por WhatsApp a una tienda. Corre en la computadora del dueño de la
// app — nunca en el celular/PC de la bodega.
//
// Uso:
//   export VENDE_FACIL_LLAVE_PRIVADA=<la llave privada de generar-llaves.mjs>
//   node scripts/activacion/generar-codigo.mjs --dias 30 --dispositivo "XXXXX-XXXXX-XXX" [--vence-en-dias 7]
//
// También se puede pasar la llave privada como flag en vez de
// variable de entorno: --clave-privada <hex>  (menos recomendable:
// queda en el historial de la terminal).
//
// --dispositivo es el "ID de este dispositivo" que el bodeguero ve en
// Más > (5 taps en el título de Inicio) > Panel de administrador, y
// te manda por WhatsApp antes de pedir el código.
//
// --vence-en-dias (opcional, default 7) es cuántos días tiene el
// BODEGUERO para pegar el código antes de que deje de servir — no
// tiene que ver con la duración del Premium (eso es --dias).

import * as ed from '@noble/ed25519';

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const EPOCA_BASE_MS = Date.UTC(2025, 0, 1);

function bytesABase32(bytes) {
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
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

const INDICE = Object.fromEntries([...ALFABETO].map((c, i) => [c, i]));

function base32ABytes(texto) {
  const limpio = texto
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  const bytes = [];
  let bits = 0;
  let valor = 0;
  for (const char of limpio) {
    const indice = INDICE[char];
    if (indice === undefined) continue;
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

function formatearEnBloques(texto, tamañoBloque = 5) {
  const bloques = [];
  for (let i = 0; i < texto.length; i += tamañoBloque) bloques.push(texto.slice(i, i + tamañoBloque));
  return bloques.join('-');
}

function diaEpocaDesdeFecha(fechaIso) {
  const [año, mes, dia] = fechaIso.split('-').map(Number);
  return Math.round((Date.UTC(año, mes - 1, dia) - EPOCA_BASE_MS) / 86_400_000);
}

function sumarDias(dias) {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

// --- Leer argumentos ---
const args = process.argv.slice(2);
function obtenerFlag(nombre) {
  const i = args.indexOf(`--${nombre}`);
  return i === -1 ? null : args[i + 1];
}

const diasTexto = obtenerFlag('dias');
const dispositivoTexto = obtenerFlag('dispositivo');
const venceEnDiasTexto = obtenerFlag('vence-en-dias') ?? '7';
const llavePrivadaHex = obtenerFlag('clave-privada') ?? process.env.VENDE_FACIL_LLAVE_PRIVADA;

if (!diasTexto || !dispositivoTexto) {
  console.error('Uso: node scripts/activacion/generar-codigo.mjs --dias 30 --dispositivo "<ID del dispositivo>"');
  process.exit(1);
}
if (!llavePrivadaHex) {
  console.error(
    'Falta la llave privada. Pásala con --clave-privada <hex> o expórtala primero:\n' +
      '  export VENDE_FACIL_LLAVE_PRIVADA=<hex>\n' +
      '(la obtienes corriendo scripts/activacion/generar-llaves.mjs una sola vez)',
  );
  process.exit(1);
}

const dias = Number(diasTexto);
if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
  console.error('--dias debe ser un número entero entre 1 y 365.');
  process.exit(1);
}
const venceEnDias = Number(venceEnDiasTexto);
if (!Number.isInteger(venceEnDias) || venceEnDias < 1) {
  console.error('--vence-en-dias debe ser un número entero positivo.');
  process.exit(1);
}

const deviceIdBytes = base32ABytes(dispositivoTexto);
if (deviceIdBytes.length !== 8) {
  console.error(
    `El ID de dispositivo "${dispositivoTexto}" no decodificó a 8 bytes (dio ${deviceIdBytes.length}). ` +
      'Revisa que lo hayas copiado completo, tal como aparece en el panel de administrador.',
  );
  process.exit(1);
}

// --- Empaquetar el payload: version(1) + dias(2) + diaEpocaExpira(2) + deviceId(8) = 13 bytes ---
const payload = new Uint8Array(13);
const vista = new DataView(payload.buffer);
payload[0] = 1; // versión
vista.setUint16(1, dias, false);
vista.setUint16(3, diaEpocaDesdeFecha(sumarDias(venceEnDias)), false);
payload.set(deviceIdBytes, 5);

const llavePrivada = Uint8Array.from(Buffer.from(llavePrivadaHex, 'hex'));
const firma = await ed.signAsync(payload, llavePrivada);

const codigoCompleto = new Uint8Array(payload.length + firma.length);
codigoCompleto.set(payload, 0);
codigoCompleto.set(firma, payload.length);

const codigoTexto = formatearEnBloques(bytesABase32(codigoCompleto));

console.log('');
console.log(`Código de activación (${dias} días de Premium, válido para canjear hasta ${sumarDias(venceEnDias)}):`);
console.log('');
console.log(codigoTexto);
console.log('');
