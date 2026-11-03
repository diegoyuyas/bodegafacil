/**
 * Vende Fácil — Apariencia: claro, oscuro o automático (lógica pura)
 * ------------------------------------------------------------
 * La preferencia se guarda en el propio celular (no en la base de datos): es de ESTE aparato y debe
 * aplicarse antes de que la app dibuje su primera pantalla, para que no haya un destello blanco.
 * «Automático» sigue el modo claro/oscuro del teléfono. Sin UI: se prueba con `tsx`.
 */

export type Apariencia = 'claro' | 'oscuro' | 'auto';

/** Clave en el almacenamiento del navegador/WebView (localStorage). */
export const CLAVE_APARIENCIA = 'vf_apariencia';

export const OPCIONES_APARIENCIA: { valor: Apariencia; etiqueta: string }[] = [
  { valor: 'claro', etiqueta: 'Claro' },
  { valor: 'oscuro', etiqueta: 'Oscuro' },
  { valor: 'auto', etiqueta: 'Automático' },
];

/** Sin valor guardado (o uno desconocido) la app se ve CLARA, como siempre. */
export function leerApariencia(valor: string | null | undefined): Apariencia {
  return valor === 'oscuro' || valor === 'auto' || valor === 'claro' ? valor : 'claro';
}

/** ¿Se debe dibujar la app en oscuro? `sistemaOscuro` es lo que dice el teléfono. */
export function esOscuroEfectivo(apariencia: Apariencia, sistemaOscuro: boolean): boolean {
  if (apariencia === 'oscuro') return true;
  if (apariencia === 'auto') return sistemaOscuro;
  return false;
}

/**
 * Se ejecuta en el `<head>`, antes de que se pinte nada, y deja puesta la clase `dark` en `<html>` si
 * corresponde. Si algo falla (almacenamiento bloqueado…) la app simplemente se ve clara.
 */
export const SCRIPT_APARIENCIA_INICIAL = `(function(){try{var a=localStorage.getItem('${CLAVE_APARIENCIA}');var o=a==='oscuro'||(a==='auto'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(o)document.documentElement.classList.add('dark');}catch(e){}})();`;
