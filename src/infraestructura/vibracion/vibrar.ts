import { Capacitor } from '@capacitor/core';
import { PATRONES_VIBRACION, type TipoVibracion } from '@/core/vibracion';

/**
 * Vibración corta al cobrar o guardar. Solo en la app instalada de Android (APK): en el navegador
 * y en iPhone no hace nada. Nunca lanza errores: si el celular no puede vibrar, simplemente no vibra.
 * Necesita el permiso VIBRATE de AndroidManifest.xml.
 */
export function vibrar(tipo: TipoVibracion, activa: boolean): void {
  if (!activa) return;
  try {
    if (Capacitor.getPlatform() !== 'android') return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(PATRONES_VIBRACION[tipo]);
  } catch {
    /* sin vibración: no pasa nada */
  }
}
