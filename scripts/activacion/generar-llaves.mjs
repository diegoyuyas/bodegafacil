// Genera un nuevo par de llaves Ed25519 para firmar códigos de
// activación de Premium. Se corre UNA VEZ (o cuando se quiera rotar
// las llaves, ej. si se sospecha que la privada se filtró).
//
// Uso:
//   node scripts/activacion/generar-llaves.mjs
//
// Qué hacer con lo que imprime:
//   - LLAVE PRIVADA: guárdala en un lugar seguro que NO sea este
//     repositorio (un gestor de contraseñas, o como variable de
//     entorno VENDE_FACIL_LLAVE_PRIVADA en tu propia computadora).
//     Es la única que puede generar códigos válidos — si se filtra,
//     cualquiera puede activar Premium gratis en cualquier tienda.
//   - LLAVE PUBLICA: pégala en
//     src/infraestructura/seguridad/activacion.ts (constante
//     LLAVE_PUBLICA_HEX) y vuelve a compilar la app. Esta sí va en el
//     código fuente — es pública a propósito, solo sirve para
//     VERIFICAR códigos, nunca para generarlos.
//
// Importante: si rotas las llaves, todos los códigos ya emitidos con
// el par anterior dejan de funcionar en cuanto actualices la app.

import * as ed from '@noble/ed25519';

function aHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const llavePrivada = ed.utils.randomPrivateKey();
const llavePublica = await ed.getPublicKeyAsync(llavePrivada);

console.log('');
console.log('=== Nuevo par de llaves para códigos de activación ===');
console.log('');
console.log('LLAVE PRIVADA (guárdala fuera del repo, nunca la subas a git):');
console.log(aHex(llavePrivada));
console.log('');
console.log('LLAVE PÚBLICA (pégala en src/infraestructura/seguridad/activacion.ts):');
console.log(aHex(llavePublica));
console.log('');
