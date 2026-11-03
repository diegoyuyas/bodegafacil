/**
 * Prueba de contraste de la paleta (Etapa V1 y modo oscuro): lee las variables de color de
 * `src/app/globals.css` (bloque `:root` = modo claro, bloque `.dark` = modo oscuro) y comprueba que los
 * textos cumplan 4.5:1 (nivel AA de accesibilidad) sobre los fondos donde se usan, y 3:1 en elementos
 * gráficos (barras, íconos).
 *
 * Uso: npx tsx scripts/probar-contraste.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

type Rgb = [number, number, number];

const css = readFileSync(path.join(__dirname, '../src/app/globals.css'), 'utf8');

/** Contenido de un bloque `selector { ... }` (sin llaves anidadas). */
function bloque(selector: string): string {
  const inicio = css.indexOf(`${selector} {`);
  if (inicio < 0) throw new Error(`❌ No se encontró el bloque ${selector} en globals.css`);
  return css.slice(inicio, css.indexOf('\n}', inicio));
}

function leerVariables(textoBloque: string): Record<string, Rgb> {
  const vars: Record<string, Rgb> = {};
  for (const m of textoBloque.matchAll(/--([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+);/g)) {
    vars[m[1] as string] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return vars;
}

const BLANCO: Rgb = [255, 255, 255];

/** Color con transparencia `alfa` (0 a 1) puesto sobre `fondo`, como hace `bg-ok/5`. */
function mezclar(frente: Rgb, fondo: Rgb, alfa: number): Rgb {
  return frente.map((c, i) => Math.round(alfa * c + (1 - alfa) * (fondo[i] ?? 0))) as Rgb;
}
function luminancia([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contraste(a: Rgb, b: Rgb): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}
function exigir(modo: string, texto: string, sobre: string, ct: Rgb, fondo: Rgb, minimo = 4.5): void {
  const r = contraste(ct, fondo);
  afirmar(r >= minimo, `[${modo}] ${texto} sobre ${sobre}: ${r.toFixed(2)}:1 (mínimo ${minimo}:1)`);
}

const claro = leerVariables(bloque(':root'));
const oscuro = leerVariables(bloque('.dark'));

// Todas las variables de color del modo claro deben tener su versión oscura (si no, ese color quedaría claro por error).
const NOMBRES_QUE_CAMBIAN = Object.keys(claro).filter((n) => n !== 'area-segura-abajo');
for (const nombre of NOMBRES_QUE_CAMBIAN) {
  const iguales = (claro[nombre] as Rgb).join() === (oscuro[nombre] as Rgb | undefined)?.join();
  const puedeQuedarIgual = ['acento', 'ok', 'alerta'].includes(nombre); // rellenos que se mantienen
  afirmar(oscuro[nombre] !== undefined && (!iguales || puedeQuedarIgual), `El modo oscuro define --${nombre}${puedeQuedarIgual ? ' (relleno que puede quedar igual)' : ' con un valor propio'}`);
}

function verificar(modo: string, v: Record<string, Rgb>, esOscuro: boolean): void {
  const g = (n: string) => v[n] as Rgb;
  const papel = g('papel');
  const superficie = g('superficie');

  exigir(modo, 'Texto principal (tinta)', 'papel', g('tinta'), papel);
  exigir(modo, 'Texto principal (tinta)', 'campos y ventanas', g('tinta'), superficie);
  exigir(modo, 'Texto secundario (tinta-suave)', 'papel', g('tinta-suave'), papel);
  exigir(modo, 'Texto secundario (tinta-suave)', 'campos y ventanas', g('tinta-suave'), superficie);
  exigir(modo, 'Texto secundario (tinta-suave)', 'turquesa claro', g('tinta-suave'), g('bodega-claro'));
  exigir(modo, 'Texto tinta al 70 %', 'papel', mezclar(g('tinta'), papel, 0.7), papel);

  exigir(modo, 'Turquesa oscuro (títulos)', 'papel', g('bodega-oscuro'), papel);
  exigir(modo, 'Turquesa oscuro (títulos)', 'turquesa claro', g('bodega-oscuro'), g('bodega-claro'));
  exigir(modo, 'Turquesa como texto (text-bodega)', 'papel', g('bodega-texto'), papel);
  exigir(modo, 'Turquesa como texto (text-bodega)', 'campos y ventanas', g('bodega-texto'), superficie);

  const dorado = g('acento-oscuro');
  exigir(modo, 'Dorado de texto (acento-oscuro)', 'papel', dorado, papel);
  exigir(modo, 'Dorado de texto (acento-oscuro)', 'campos y ventanas', dorado, superficie);
  exigir(modo, 'Dorado de texto (acento-oscuro)', 'fondo dorado suave (bg-acento/10)', dorado, mezclar(g('acento'), papel, 0.1));

  exigir(modo, 'Verde como texto (text-ok)', 'papel', g('ok-texto'), papel);
  exigir(modo, 'Verde como texto (text-ok)', 'fondo verde suave (bg-ok/5)', g('ok-texto'), mezclar(g('ok'), papel, 0.05));
  exigir(modo, 'Rojo como texto (text-alerta)', 'papel', g('alerta-texto'), papel);
  exigir(modo, 'Rojo como texto (text-alerta)', 'fondo rojo suave (bg-alerta/5)', g('alerta-texto'), mezclar(g('alerta'), papel, 0.05));

  exigir(modo, 'Texto blanco', 'botón principal (bodega)', BLANCO, g('bodega'));
  exigir(modo, 'Texto blanco', 'botón rojo (alerta)', BLANCO, g('alerta'));
  exigir(modo, 'Texto blanco', 'aviso verde (ok)', BLANCO, g('ok'));
  exigir(modo, 'Texto blanco', 'botón turquesa presionado', BLANCO, g('bodega-presionado'));

  // Elementos gráficos (no texto) necesitan 3:1.
  exigir(modo, 'Borde y relleno turquesa (bodega)', 'papel', g('bodega'), papel, 3);
  if (esOscuro) {
    exigir(modo, 'Barras suaves del gráfico (turquesa claro al 55 %)', 'papel', mezclar(g('bodega-texto'), papel, 0.55), papel, 3);
    exigir(modo, 'Barras de hoy del gráfico', 'papel', g('bodega-texto'), papel, 3);
  } else {
    exigir(modo, 'Barras suaves del gráfico (turquesa al 70 %)', 'papel', mezclar(g('bodega'), papel, 0.7), papel, 3);
    exigir(modo, 'Barras de hoy del gráfico (bodega)', 'papel', g('bodega'), papel, 3);
    exigir(modo, 'Texto tinta', 'relleno dorado (insignias Premium)', g('tinta'), g('acento'));
  }
}

verificar('claro', claro, false);
verificar('oscuro', oscuro, true);

// El fondo oscuro debe ser realmente oscuro y el texto claro (por si alguien cambia un valor por error).
afirmar(luminancia(oscuro['papel'] as Rgb) < 0.05 && luminancia(oscuro['tinta'] as Rgb) > 0.6, 'En modo oscuro el fondo es oscuro y el texto es claro');
afirmar(luminancia(claro['papel'] as Rgb) > 0.8 && luminancia(claro['tinta'] as Rgb) < 0.05, 'En modo claro el fondo es claro y el texto es oscuro');

console.log('🎉 La paleta cumple el contraste mínimo en modo claro y en modo oscuro.');
