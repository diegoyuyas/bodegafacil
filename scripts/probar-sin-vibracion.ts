/**
 * Prueba de que la vibración se quitó por completo: sin interruptor en Configuración de Venta, sin llamadas en
 * las pantallas, sin archivos propios y sin el plugin @capacitor/haptics.
 *
 * Uso: npx tsx scripts/probar-sin-vibracion.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const raiz = path.join(__dirname, '..');
const leer = (ruta: string) => readFileSync(path.join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');

afirmar(!existsSync(path.join(raiz, 'src/core/vibracion.ts')) && !existsSync(path.join(raiz, 'src/infraestructura/vibracion/vibrar.ts')), 'Ya no existen src/core/vibracion.ts ni src/infraestructura/vibracion/vibrar.ts (bórralos si aún están)');
afirmar(!existsSync(path.join(raiz, 'scripts/probar-vibracion.ts')), 'Ya no existe scripts/probar-vibracion.ts (bórralo si aún está)');

// Ningún archivo de src menciona la vibración
const archivos: string[] = [];
function recorrer(carpeta: string) {
  for (const nombre of readdirSync(carpeta)) {
    const ruta = path.join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta);
    else if (/\.(ts|tsx)$/.test(nombre)) archivos.push(ruta);
  }
}
recorrer(path.join(raiz, 'src'));
const conVibracion = archivos.filter((a) => /vibrar|vibracion|VIBRACION|Vibrar/.test(readFileSync(a, 'utf8')));
afirmar(conVibracion.length === 0, `Ningún archivo de src menciona la vibración${conVibracion.length ? ` (quedan: ${conVibracion.map((a) => path.relative(raiz, a)).join(', ')})` : ''}`);

const paquete = JSON.parse(leer('package.json')) as { dependencies: Record<string, string> };
afirmar(!('@capacitor/haptics' in paquete.dependencies), 'package.json ya no tiene @capacitor/haptics');

const config = leer('src/app/mas/configuracion/configuracion-venta/page.tsx');
afirmar(!config.includes('Vibrar al cobrar o guardar') && config.includes('Precio editable al vender') && config.includes('Notificación de stock bajo'), 'Configuración de Venta ya no tiene «Vibrar al cobrar o guardar» y conserva las demás opciones');

const avisos = leer('src/components/proveedor-avisos.tsx');
afirmar(avisos.includes('avisar: (texto: string, opciones?: OpcionesAviso) => void;') && avisos.includes('const valor = useMemo(() => ({ avisar }), [avisar]);'), 'Los avisos («Venta guardada ✓», etc.) siguen funcionando igual');
afirmar(leer('src/app/ventas/nueva/page.tsx').includes('setEtapa(\'guardada\')') && leer('src/app/fiados/page.tsx').includes('setPagoReciente({'), 'Guardar una venta y cobrar un fiado siguen igual, solo que sin vibrar');

console.log('🎉 Todas las pruebas de «sin vibración» pasaron.');
