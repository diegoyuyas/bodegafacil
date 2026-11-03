/**
 * Prueba del botón flotante «Nueva venta» de Inicio: forma, colores (contraste), posición fija sobre la barra
 * inferior, que viva en el layout raíz (fuera de la pantalla animada, para que «fixed» sea de verdad fijo),
 * halo que pulsa cada 2 s sin parpadeo, «reducir movimiento», espacio para que no tape la lista, y que el botón
 * ancho de antes ya no exista. Revisa el código fuente (la imagen real solo se ve en el celular).
 *
 * Uso: npx tsx scripts/probar-fab-nueva-venta.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const raiz = path.join(__dirname, '..');
const leer = (ruta: string) => readFileSync(path.join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');
const inicio = leer('src/app/page.tsx');
const css = leer('src/app/globals.css');
const componente = leer('src/components/acciones-flotantes-inicio.tsx');
const layout = leer('src/app/layout.tsx');

// ---- El botón flotante
const iFab = componente.indexOf('Botón flotante «Nueva venta»');
afirmar(iFab > 0, 'Existe el botón flotante «Nueva venta»');
const fab = componente.slice(iFab);

// ---- Dónde vive: en el layout raíz, no dentro de la pantalla
afirmar(layout.includes('<AccionesFlotantesInicio />') && layout.indexOf('<AccionesFlotantesInicio />') > layout.indexOf('<BarraInferior />'), 'Se dibuja en el layout raíz, junto a la barra inferior (fuera de la pantalla con animación)');
afirmar(!inicio.includes('fab-halo') && !inicio.includes('href="/ventas/nueva"') && !inicio.includes('href="/ventas/voz"'), 'Inicio ya no dibuja el botón flotante ni el de voz dentro de la pantalla');
afirmar(componente.includes("normalizarRuta(pathname) !== '/'") && componente.includes('usarEscribiendo'), 'Solo aparece en Inicio y se oculta mientras se escribe (teclado abierto)');
afirmar(fab.includes('var(--desfase-viewport-abajo,0px)') && fab.includes('var(--area-segura-abajo)'), 'Su posición suma el área segura de Android y el ajuste al borde visible');
afirmar(fab.includes('href="/ventas/nueva"') && fab.includes('aria-label="Nueva venta"'), 'Al tocarlo abre la pantalla de Nueva venta (y tiene nombre para lectores de pantalla)');
afirmar(fab.includes('h-[72px] w-[72px]') && fab.includes('rounded-full'), 'Es un círculo de 72 px');
afirmar(fab.includes('flex-col') && fab.includes('M12 5v14M5 12h14') && fab.indexOf('<svg') < fab.indexOf('leading-[1.05]'), 'Lleva el «+» arriba y debajo el texto (columna: ícono y luego letras)');
afirmar(/Nueva\s*<br \/>\s*Venta/.test(fab) && fab.includes('text-[11px]') && fab.includes('font-extrabold'), 'El texto va en dos líneas, pequeño y en negrita');
afirmar(fab.includes('bg-[#4ADE80]') && fab.includes('text-[#14532D]'), 'Verde claro #4ADE80 con texto e ícono en verde oscuro #14532D');
afirmar(fab.includes('fixed') && fab.includes('bottom-[calc(5rem+var(--area-segura-abajo)') && fab.includes('justify-end'), 'Está fijo, abajo a la derecha, 16 px sobre la barra (4 rem de barra + 1 rem) y sobre el área segura de Android');
afirmar(fab.includes('max-w-app') && fab.includes('pointer-events-none') && fab.includes('pointer-events-auto'), 'Sigue el ancho de la app y solo el círculo recibe toques (no bloquea lo que hay detrás)');
afirmar(fab.includes('z-30') && leer('src/components/detalle-venta-sheet.tsx').includes('z-50'), 'Queda por encima del contenido (z-30, como la barra) y por debajo de los pop-ups (z-50)');
afirmar(fab.includes('fab-halo') && fab.includes('aria-hidden="true"') && fab.indexOf('fab-halo') < fab.indexOf('href="/ventas/nueva"'), 'El halo va detrás del botón y se oculta a lectores de pantalla');

// ---- Contraste del texto sobre el verde (nivel AA = 4.5:1)
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r as number) + 0.7152 * lin(g as number) + 0.0722 * lin(b as number);
}
const [claro, oscuro] = [luminancia('#4ADE80'), luminancia('#14532D')].sort((a, b) => b - a) as [number, number];
const contraste = (claro + 0.05) / (oscuro + 0.05);
afirmar(contraste >= 4.5, `Contraste del texto #14532D sobre #4ADE80: ${contraste.toFixed(2)}:1 (mínimo 4.5:1)`);

// ---- El halo
afirmar(/\.fab-halo\s*\{[^}]*animation:\s*fab-pulso\s+2s\s+ease-out\s+infinite/.test(css), 'El halo se repite sin parar cada 2 segundos con una curva suave (ease-out)');
const keyframes = css.slice(css.indexOf('@keyframes fab-pulso'), css.indexOf('@media', css.indexOf('@keyframes fab-pulso')));
afirmar(/0%\s*\{[^}]*scale\(1\)[^}]*opacity:\s*0\.55/.test(keyframes), 'El halo empieza del tamaño del botón y translúcido (55 %)');
afirmar(/70%,\s*100%\s*\{[^}]*scale\(1\.4\)[^}]*opacity:\s*0/.test(keyframes), 'Crece hasta 1.4 veces (cabe en el margen de 16 px: no se sale de la pantalla) y se desvanece del todo antes de repetir');
afirmar(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.fab-halo\s*\{[^}]*animation:\s*none/.test(css), 'Con «reducir movimiento» el halo no se anima');

// ---- Espacio y botón ancho
const main = inicio.match(/<main className="([^"]+)"/)?.[1] ?? '';
afirmar(main.includes('pb-[calc(10.5rem+var(--area-segura-abajo))]'), 'El contenido tiene espacio abajo (10.5 rem) para que el botón no tape el último elemento');
afirmar(!/h-14 flex-1 items-center justify-center rounded-full bg-bodega/.test(inicio) && !inicio.includes('>\n          Nueva venta\n        </Link>'), 'El botón ancho «Nueva venta» del final ya no existe');
afirmar(componente.includes('href="/ventas/voz"') && componente.includes('{modoVoz && (') && componente.includes('modoVentaVozDisponible'), 'El botón de «Nueva Venta por Voz» se conserva (solo si está disponible la venta por voz)');
afirmar(componente.includes('pr-[7rem]'), 'El botón de voz deja libre el lugar del botón flotante');
afirmar((inicio.match(/"\/ventas\/nueva"/g) ?? []).length === 1, 'En Inicio queda un solo enlace a Nueva venta: el estado vacío «Hacer una venta»');

console.log('🎉 Todas las pruebas del botón flotante «Nueva venta» pasaron.');
