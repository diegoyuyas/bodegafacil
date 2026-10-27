/**
 * Prueba del analizador de la venta por voz (src/core/venta-voz.ts).
 * Uso: npx tsx scripts/probar-venta-voz.ts
 */
import { indexarProductos, interpretarFrase, interpretarRespuestaSiNo, type AccionVoz } from '../src/core/venta-voz';
import type { Producto } from '../src/core/tipos';

let id = 0;
function prod(nombre: string, alias: string | null = null, precio = 5): Producto {
  id += 1;
  return {
    id, nombre, categoriaId: null, codigo: null, precioVenta: precio, costo: 1, stockActual: 50, stockMinimo: 1,
    controlaStock: true, tipo: 'venta_compra', unidadMedida: 'unidad', alias, activo: true, creadoEn: '', actualizadoEn: '',
  };
}

const indice = indexarProductos([
  prod('HAMBURGUESA', 'HAMBURGUESA SIMPLE,HAMBURGESA'),
  prod('INCA KOLA 500 ML', 'INKA COLA,GASEOSA INKA COLA'),
  prod('COCA COLA 500 ML', 'COCA'),
  prod('OCTAVO DE POLLO A LA BRASA (1/8 POLLO A LA BRASA)'),
  prod('CUARTO DE POLLO A LA BRASA (1/4 POLLO A LA BRASA)'),
  prod('COBERTURA DE CHOCOLATE', 'COBERTURA,BITTER,WINTER,CAJA'),
  prod('CHOCOLATE BITTER 70%', 'BITTER'),
  prod('HUEVOS', 'HUEVO'),
  prod('PAN', 'PANES'),
  prod('LECHE GLORIA', 'LECHE'),
  prod('7 UP 500 ML', 'SEVEN UP'),
]);

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

const nombres = (a: AccionVoz) => (a.tipo === 'agregar' ? a.candidatos.map((c) => c.producto.nombre).join(' | ') : '');
function resumen(acciones: AccionVoz[]): string {
  return acciones
    .map((a) => {
      switch (a.tipo) {
        case 'agregar': return `${a.cantidad}x ${a.candidatos[0]?.producto.nombre}${a.seguro ? '' : ' (?)'}`;
        case 'no_encontrado': return `${a.cantidad}x NO[${a.texto}]`;
        case 'metodo_pago': return `pago:${a.metodo}`;
        case 'cliente': return `cliente:${a.texto}`;
        default: return a.tipo;
      }
    })
    .join(' ; ');
}
function probar(frase: string, esperado: string) {
  const obtenido = resumen(interpretarFrase(frase, indice));
  afirmar(obtenido === esperado, `«${frase}» → ${obtenido}${obtenido === esperado ? '' : `   (esperado: ${esperado})`}`);
}

// El ejemplo real del dueño: cantidad primero, luego el producto.
probar(
  'una hamburguesa dos gaseosa inka cola un octavo de pollo a la brasa guardar venta',
  '1x HAMBURGUESA ; 2x INCA KOLA 500 ML ; 1x OCTAVO DE POLLO A LA BRASA (1/8 POLLO A LA BRASA) ; guardar',
);
probar('Una hamburguesa, dos gaseosa Inka Cola, un octavo de pollo a la brasa', '1x HAMBURGUESA ; 2x INCA KOLA 500 ML ; 1x OCTAVO DE POLLO A LA BRASA (1/8 POLLO A LA BRASA)');
probar('2 hamburguesas 3 inca cola', '2x HAMBURGUESA ; 3x INCA KOLA 500 ML');
probar('dos gaesosa inka cola', '2x INCA KOLA 500 ML');
// Número dentro del nombre del producto: no es una cantidad.
probar('dos inca kola 500 ml', '2x INCA KOLA 500 ML');
probar('tres 7 up', '3x 7 UP 500 ML');
probar('media docena de huevos', '6x HUEVOS');
probar('una docena de huevos', '12x HUEVOS');
probar('treinta y cinco panes', '35x PAN');
probar('dos panes y tres leches', '2x PAN ; 3x LECHE GLORIA');
// Plurales, pronunciación.
probar('dos hamburgesas', '2x HAMBURGUESA');
probar('cuatro cocas', '4x COCA COLA 500 ML');
// Pagos y cliente.
probar('dos hamburguesas pago yape', '2x HAMBURGUESA ; pago:yape');
probar('una leche en efectivo guardar venta', '1x LECHE GLORIA ; pago:efectivo ; guardar');
probar('una leche al fiado cliente juan perez guardar venta', '1x LECHE GLORIA ; pago:fiado ; cliente:juan perez ; guardar');
probar('cliente maria lopez dos panes', 'cliente:maria lopez ; 2x PAN');
// Comandos.
probar('borrar último', 'borrar_ultimo');
probar('cancelar venta', 'cancelar');
probar('guarda la venta', 'guardar');
// Ambigüedad: "bitter" lo tienen dos productos → hay que elegir tocando.
const ambiguo = interpretarFrase('dos bitter', indice)[0] as AccionVoz;
afirmar(ambiguo?.tipo === 'agregar' && !ambiguo.seguro && ambiguo.candidatos.length === 2, `«dos bitter» pide elegir entre: ${nombres(ambiguo)}`);
// "pollo a la brasa" solo: ¿octavo o cuarto?
const pollo = interpretarFrase('un pollo a la brasa', indice)[0] as AccionVoz;
afirmar(pollo?.tipo === 'agregar' && !pollo.seguro, `«un pollo a la brasa» pide elegir entre: ${nombres(pollo)}`);
// Producto que no existe.
probar('dos zapatillas', '2x NO[zapatillas]');
probar('una hamburguesa dos tornillo raro tres panes', '1x HAMBURGUESA ; 2x NO[tornillo raro] ; 3x PAN');
// Una coincidencia débil (cosa ≈ coca) NUNCA se agrega sola: pide confirmar tocando.
const debil = interpretarFrase('dos cosa', indice)[0] as AccionVoz;
afirmar(debil?.tipo !== 'agregar' || !debil.seguro, '«dos cosa» (parecido a «coca») no se agrega sin preguntar');
// Basura / vacío.
afirmar(interpretarFrase('', indice).length === 0, 'Una frase vacía no genera acciones');
afirmar(interpretarFrase('eh bueno', indice).every((a) => a.tipo === 'no_encontrado'), 'Palabras sueltas no inventan productos');
// Confirmación.
afirmar(interpretarRespuestaSiNo('sí') === 'si' && interpretarRespuestaSiNo('confirmar') === 'si', '«sí» / «confirmar» confirman');
afirmar(interpretarRespuestaSiNo('no') === 'no' && interpretarRespuestaSiNo('seguir') === 'no', '«no» / «seguir» vuelven');
afirmar(interpretarRespuestaSiNo('hola') === null, 'Otra cosa no confirma ni cancela');

// Rendimiento: 400 productos y una frase larga.
const grande = indexarProductos(Array.from({ length: 400 }, (_, i) => prod(`PRODUCTO NUMERO ${i} MARCA ${i % 17}`, `ALIAS${i}`)));
const t0 = Date.now();
interpretarFrase('una hamburguesa dos gaseosa inka cola un octavo de pollo a la brasa tres panes cuatro leches cinco huevos yape guardar venta', grande);
const ms = Date.now() - t0;
afirmar(ms < 1500, `Frase larga con 400 productos se analiza en ${ms} ms`);
console.log('\n🎉 El analizador de venta por voz funciona.');
