/**
 * Prueba de las casillas de Compras (cantidad, costo, kg, gramos, cajas, unidades): se puede borrar todo y escribir de nuevo,
 * sin que quede un 0 pegado adelante («01», «02.5»).
 *
 * Uso: npx tsx scripts/probar-casillas-compra.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { limpiarDecimalEscrito, limpiarEnteroEscrito, numeroDeCasilla } from '../src/core/texto';
import { procesarEscrituraFraccion } from '../src/core/venta-fraccion';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}
const leer = (...ruta: string[]) => readFileSync(path.join(__dirname, '..', ...ruta), 'utf-8');

/** Lo que muestra y lo que vale una casilla después de que el usuario escribe (igual que CasillaNumero). */
function escribir(decimales: boolean, tipeado: string): { se_ve: string; vale: number } {
  const limpio = decimales ? limpiarDecimalEscrito(tipeado) : limpiarEnteroEscrito(tipeado);
  return { se_ve: limpio, vale: numeroDeCasilla(limpio) };
}

// ---- La situación de la captura: borro el 1 y escribo otro número
afirmar(escribir(true, '').se_ve === '' && escribir(true, '').vale === 0, 'Borrar todo deja la casilla VACÍA (no un 0 pegado) y vale 0 para los cálculos');
afirmar(escribir(true, '1').se_ve === '1' && escribir(true, '1').vale === 1, 'Después de borrar, escribir 1 se ve «1» (antes quedaba «01»)');
afirmar(escribir(true, '2.5').se_ve === '2.5' && escribir(true, '2.5').vale === 2.5, 'Escribir 2.5 se ve «2.5» (antes «02.5»)');
afirmar(escribir(true, '01').se_ve === '1' && escribir(true, '02.5').se_ve === '2.5' && escribir(true, '007').se_ve === '7', 'Si queda un cero de adelante («01», «02.5», «007») se quita solo');
afirmar(escribir(true, '0').se_ve === '0' && escribir(true, '0.').se_ve === '0.' && escribir(true, '0.5').se_ve === '0.5' && escribir(true, '0.5').vale === 0.5, 'El 0 solo, «0.» y «0.5» se respetan (para escribir decimales)');
afirmar(escribir(true, '.').vale === 0 && escribir(true, '.5').vale === 0.5 && escribir(true, '0.').vale === 0, 'Un punto solo o «0.» valen 0 mientras se escribe; «.5» vale 0.5');
afirmar(escribir(true, '1,5').se_ve === '1.5' && escribir(true, '1.2.3').se_ve === '1.23' && escribir(true, 'abc').se_ve === '' && escribir(true, '2a.5').se_ve === '2.5', 'La coma vale como punto, no se admite un segundo punto y las letras se descartan');
afirmar(escribir(false, '').se_ve === '' && escribir(false, '007').se_ve === '7' && escribir(false, '1a2').se_ve === '12' && escribir(false, '2.5').se_ve === '25' && escribir(false, '0').se_ve === '0', 'Casillas de enteros (cajas, kg, gramos): solo dígitos, sin ceros de más');
afirmar(numeroDeCasilla('') === 0 && numeroDeCasilla(' ') === 0 && numeroDeCasilla('12') === 12 && numeroDeCasilla('x') === 0, 'El número de una casilla vacía o inválida es 0');

// ---- Kg y gramos de la manzana: escribir [1] kg y [900] g borrando y tecleando
const manzana = { unidadEntera: 'Kg', unidadFraccion: 'Gramo', factor: 1000 };
let base = 1000; // al agregar: 1 kg
const gramos = (tipeado: string) => {
  const r = procesarEscrituraFraccion(manzana, base, Infinity, 'sueltas', tipeado);
  base = r.cantidad ?? base;
  return r;
};
const g0 = gramos('');
afirmar(g0.texto === '' && base === 1000, 'Gramos: borrar el 0 deja la casilla vacía y el kilo intacto');
const g1 = gramos('9');
const g2 = gramos('90');
const g3 = gramos('900');
afirmar(g1.texto === '9' && g2.texto === '90' && g3.texto === '900' && base === 1900, 'Gramos: escribiendo 9, 90 y 900 se ve exactamente eso (sin «0900») y la cantidad es 1 kg y 900 g');
const g4 = gramos('1000');
afirmar(g4.texto === '0' && base === 2000, 'Gramos: si escribo 1000, pasa solo a 2 kg y la casilla de gramos queda en 0');
const kilos = (tipeado: string) => {
  const r = procesarEscrituraFraccion(manzana, base, Infinity, 'enteros', tipeado);
  base = r.cantidad ?? base;
  return r;
};
base = 1900;
const k0 = kilos('');
const k1 = kilos('3');
afirmar(k0.texto === '' && k1.texto === '3' && base === 3900, 'Kg: borrar y escribir 3 se ve «3» y la cantidad es 3 kg y 900 g');
base = 1000;
const k2 = kilos('0');
afirmar(k2.cantidad === 0 && k2.texto === '0', 'Kg: escribir 0 sin gramos deja la cantidad en 0 (al guardar se pedirá al menos 1)');

// ---- Revisión del código: las casillas de Compras ya no son de tipo número
for (const [nombre, ruta] of [['Nueva compra', ['src', 'app', 'compras', 'nueva', 'page.tsx']], ['Modificar compra', ['src', 'app', 'compras', 'editar', 'page.tsx']], ['Cajas/Kg y unidades/gramos', ['src', 'components', 'cantidad-compra-fraccion.tsx']], ['La casilla de números', ['src', 'components', 'casilla-numero.tsx']]] as const) {
  afirmar(!leer(...ruta).includes('type="number"'), `${nombre}: ya no usa casillas de tipo número`);
}
for (const [nombre, ruta] of [['Nueva compra', ['src', 'app', 'compras', 'nueva', 'page.tsx']], ['Modificar compra', ['src', 'app', 'compras', 'editar', 'page.tsx']]] as const) {
  const pagina = leer(...ruta);
  afirmar(
    pagina.includes("onCambiar={(numero) => actualizarLinea(linea.productoId, 'cantidad', numero)}") &&
      pagina.includes("onCambiar={(numero) => actualizarLinea(linea.productoId, 'costoUnitario', numero)}") &&
      (pagina.match(/<CasillaNumero/g) ?? []).length === 2,
    `${nombre}: la cantidad y el costo usan la casilla que deja borrar todo`,
  );
}
const casilla = leer('src', 'components', 'casilla-numero.tsx');
afirmar(casilla.includes('value={borrador ?? String(valor)}') && casilla.includes('onBlur={() => setBorrador(null)}') && casilla.includes('onFocus={(e) => e.target.select()}') && casilla.includes("inputMode={decimales ? 'decimal' : 'numeric'}"), 'La casilla muestra lo escrito, se limpia al salir, selecciona todo al tocarla y abre el teclado numérico');
const fracc = leer('src', 'components', 'cantidad-compra-fraccion.tsx');
afirmar(fracc.includes('value={borrador?.campo === campo ? borrador.texto : String(partes[campo])}') && fracc.includes('procesarEscrituraFraccion(fraccion,'), 'Las casillas de cajas/kg y unidades/gramos también muestran lo escrito y juntan 12 unidades en 1 caja');

console.log('\n🎉 Las casillas de Compras dejan borrar y escribir sin ceros pegados.');
