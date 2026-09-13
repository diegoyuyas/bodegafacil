/**
 * sql.js mantiene la base de datos en memoria; esto la serializa a
 * IndexedDB para que sobreviva a cerrar la pestaña o el teléfono
 * (principio offline-first / autonomía, sección 2 del documento maestro).
 * No se usa ninguna librería externa: IndexedDB nativo alcanza para
 * guardar un solo blob binario bajo una clave fija.
 */

const NOMBRE_BASE_INDEXEDDB = 'bodega-facil';
const VERSION_BASE_INDEXEDDB = 1;
const NOMBRE_ALMACEN = 'sqlite';

function abrirIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(NOMBRE_BASE_INDEXEDDB, VERSION_BASE_INDEXEDDB);
    solicitud.onupgradeneeded = () => {
      solicitud.result.createObjectStore(NOMBRE_ALMACEN);
    };
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

export async function guardarBinario(clave: string, datos: Uint8Array): Promise<void> {
  const db = await abrirIndexedDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(NOMBRE_ALMACEN, 'readwrite');
      tx.objectStore(NOMBRE_ALMACEN).put(datos, clave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function cargarBinario(clave: string): Promise<Uint8Array | null> {
  const db = await abrirIndexedDb();
  try {
    const resultado = await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction(NOMBRE_ALMACEN, 'readonly');
      const solicitud = tx.objectStore(NOMBRE_ALMACEN).get(clave);
      solicitud.onsuccess = () => resolve((solicitud.result as Uint8Array | undefined) ?? null);
      solicitud.onerror = () => reject(solicitud.error);
    });
    return resultado;
  } finally {
    db.close();
  }
}
