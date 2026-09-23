/**
 * Vende Fácil — Llave privada de activación, guardada en ESTE celular
 * ------------------------------------------------------------
 * Para poder generar códigos de activación de Premium (para otras
 * tiendas) directo desde el Panel de administrador, sin depender de
 * la laptop. Ver también scripts/activacion/README.md — el lado
 * "laptop" de este mismo mecanismo.
 *
 * A propósito NO se guarda en `configuracion_app` (la base SQLite):
 * esa base es justo lo que Backup Automático, "Respaldo y
 * exportación" y "Subir a Google Drive" empaquetan y mueven fuera del
 * celular — meter la llave privada ahí la filtraría a cualquier
 * backup o subida. Se usa `localStorage` en cambio, que esas
 * funciones nunca tocan.
 *
 * Nota aparte, ya conocida: como `android:allowBackup="true"` sigue
 * activo (ver AndroidManifest.xml), el propio sistema de Android
 * puede incluir igual este almacenamiento en su backup automático a
 * la cuenta de Google del celular — eso es un mecanismo del sistema
 * operativo, no de la app, y no hay forma de excluirlo desde acá sin
 * desactivar `allowBackup` del todo (ver conversación aparte sobre
 * ese tema).
 */

const CLAVE_STORAGE = 'vf_llave_privada_activacion';

export function obtenerLlavePrivadaGuardada(): string | null {
  try {
    return localStorage.getItem(CLAVE_STORAGE);
  } catch {
    return null;
  }
}

export function guardarLlavePrivada(llaveHex: string): boolean {
  try {
    localStorage.setItem(CLAVE_STORAGE, llaveHex);
    return true;
  } catch {
    return false;
  }
}

export function borrarLlavePrivada(): void {
  try {
    localStorage.removeItem(CLAVE_STORAGE);
  } catch {
    // Nada que hacer: si localStorage no está disponible, tampoco había nada guardado.
  }
}
