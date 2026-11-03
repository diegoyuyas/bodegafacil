/**
 * Prueba de la apariencia (claro / oscuro / automático): las reglas, el script que se ejecuta antes de la
 * primera pintura (corrido de verdad con un navegador simulado) y que la paleta oscura exista en globals.css.
 *
 * Uso: npx tsx scripts/probar-apariencia.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { CLAVE_APARIENCIA, OPCIONES_APARIENCIA, SCRIPT_APARIENCIA_INICIAL, esOscuroEfectivo, leerApariencia } from '../src/core/apariencia';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

// ---- Reglas
afirmar(leerApariencia(null) === 'claro' && leerApariencia(undefined) === 'claro' && leerApariencia('') === 'claro', 'Sin preferencia guardada la app se ve CLARA (como siempre)');
afirmar(leerApariencia('oscuro') === 'oscuro' && leerApariencia('auto') === 'auto' && leerApariencia('claro') === 'claro', 'Se leen las tres opciones guardadas');
afirmar(leerApariencia('azul') === 'claro' && leerApariencia('OSCURO') === 'claro', 'Un valor desconocido o mal escrito cae a claro (no rompe)');
afirmar(OPCIONES_APARIENCIA.map((o) => o.etiqueta).join(',') === 'Claro,Oscuro,Automático', 'Las opciones son Claro, Oscuro y Automático');
afirmar(esOscuroEfectivo('claro', true) === false && esOscuroEfectivo('claro', false) === false, 'Claro: siempre claro, aunque el teléfono esté en oscuro');
afirmar(esOscuroEfectivo('oscuro', false) === true && esOscuroEfectivo('oscuro', true) === true, 'Oscuro: siempre oscuro, aunque el teléfono esté en claro');
afirmar(esOscuroEfectivo('auto', true) === true && esOscuroEfectivo('auto', false) === false, 'Automático: sigue al teléfono');

// ---- El script del <head>, ejecutado con un navegador simulado
function correrScript(opciones: { guardado?: string | null; sistemaOscuro?: boolean; almacenamientoRoto?: boolean; sinMatchMedia?: boolean }): boolean {
  const clases = new Set<string>();
  const window: Record<string, unknown> = {};
  if (!opciones.sinMatchMedia) window.matchMedia = () => ({ matches: opciones.sistemaOscuro === true });
  const contexto = {
    window,
    document: { documentElement: { classList: { add: (c: string) => clases.add(c) } } },
    localStorage: {
      getItem: (clave: string) => {
        if (opciones.almacenamientoRoto) throw new Error('almacenamiento bloqueado');
        return clave === CLAVE_APARIENCIA ? (opciones.guardado ?? null) : null;
      },
    },
  };
  vm.runInNewContext(SCRIPT_APARIENCIA_INICIAL, contexto);
  return clases.has('dark');
}
afirmar(correrScript({ guardado: 'oscuro' }) === true, 'Script: «oscuro» guardado → pone la clase dark antes de pintar');
afirmar(correrScript({ guardado: 'claro', sistemaOscuro: true }) === false, 'Script: «claro» guardado → no pone dark (aunque el teléfono esté oscuro)');
afirmar(correrScript({ guardado: 'auto', sistemaOscuro: true }) === true, 'Script: «automático» con el teléfono en oscuro → dark');
afirmar(correrScript({ guardado: 'auto', sistemaOscuro: false }) === false, 'Script: «automático» con el teléfono en claro → sin dark');
afirmar(correrScript({ guardado: null, sistemaOscuro: true }) === false, 'Script: sin preferencia guardada → claro, aunque el teléfono esté oscuro');
afirmar(correrScript({ almacenamientoRoto: true }) === false, 'Script: si el almacenamiento falla, no rompe y la app queda clara');
afirmar(correrScript({ guardado: 'auto', sinMatchMedia: true }) === false, 'Script: sin detector de modo del teléfono, «automático» queda claro y no rompe');
afirmar(correrScript({ guardado: 'oscuro', sinMatchMedia: true }) === true, 'Script: «oscuro» no necesita detectar el modo del teléfono');

// ---- La paleta oscura y su conexión
const leer = (ruta: string) => readFileSync(path.join(__dirname, '..', ruta), 'utf8');
const css = leer('src/app/globals.css');
const layout = leer('src/app/layout.tsx');
afirmar(/\.dark\s*\{[^}]*--papel:/.test(css) && /\.dark\s*\{[^}]*color-scheme:\s*dark/.test(css), 'globals.css define la paleta oscura (--papel…) y color-scheme: dark');
for (const regla of ['.dark .bg-white', '.dark .text-bodega', '.dark .text-ok', '.dark .text-alerta']) {
  afirmar(css.includes(regla), `globals.css ajusta ${regla} para el modo oscuro`);
}
afirmar(layout.includes('SCRIPT_APARIENCIA_INICIAL') && layout.includes('<ProveedorApariencia>') && layout.includes('suppressHydrationWarning'), 'El layout pone el script antes de pintar, el proveedor y suppressHydrationWarning');

console.log('🎉 Todas las pruebas de Apariencia pasaron.');
