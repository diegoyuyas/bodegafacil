/**
 * Vende Fácil — Impresión Bluetooth (Más > Configuración de Impresoras)
 * ------------------------------------------------------------
 * Envoltorio delgado sobre `@kduma-autoid/capacitor-bluetooth-printer`
 * (Bluetooth clásico/SPP — el protocolo que usan las ticketeras
 * Xprinter recomendadas). El plugin solo lista dispositivos ya
 * EMPAREJADOS por el sistema operativo — la ticketera se empareja una
 * vez desde Ajustes > Bluetooth del propio Android, como cualquier
 * otro accesorio, antes de usarla acá.
 *
 * Nota de compatibilidad: el plugin está publicado para Capacitor 6.x
 * como peer dependency; este proyecto usa Capacitor 8. Se instaló con
 * --legacy-peer-deps porque el puente JS↔nativo de Capacitor no
 * cambió de forma incompatible entre esas versiones para plugins tan
 * simples como este (usa la API nativa de Android BluetoothSocket sin
 * nada exótico) — pero no se pudo probar en una impresora física real
 * antes de entregarlo.
 *
 * Nota de permisos: en Android 12+ hace falta el permiso en tiempo de
 * ejecución BLUETOOTH_CONNECT (ya declarado en AndroidManifest.xml),
 * pero este plugin no lo pide solo — si el teléfono no lo concedió
 * antes por otro medio, `listarImpresorasEmparejadas` o `imprimirEn`
 * van a fallar. En ese caso, se le pide al bodeguero activarlo a mano
 * en Ajustes > Apps > Vende Fácil > Permisos > Dispositivos cercanos.
 */

import { Capacitor } from '@capacitor/core';
import { BluetoothPrinter, type BluetoothDevice } from '@kduma-autoid/capacitor-bluetooth-printer';

const MENSAJE_SOLO_APK = 'La impresión Bluetooth solo funciona dentro de la app instalada en el celular, no en el navegador.';

export type { BluetoothDevice };

export async function listarImpresorasEmparejadas(): Promise<BluetoothDevice[]> {
  if (!Capacitor.isNativePlatform()) throw new Error(MENSAJE_SOLO_APK);
  const { devices } = await BluetoothPrinter.list();
  return devices;
}

/** Conecta, manda el texto ya armado (ver `core/comprobante-impresion.ts`) y desconecta. */
export async function imprimirEn(direccionMac: string, texto: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) throw new Error(MENSAJE_SOLO_APK);
  await BluetoothPrinter.connectAndPrint({ address: direccionMac, data: texto });
}
