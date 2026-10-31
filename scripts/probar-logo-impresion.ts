/**
 * Prueba del logotipo en la ticketera (Etapa 2): blanco y negro, franjas ESC/POS con bytes de 7 bits,
 * centrado, anchos de papel y cómo queda dentro del ticket. (La impresión real se comprueba en tu ticketera.)
 *
 * Uso: npx tsx scripts/probar-logo-impresion.ts
 */
import {
  FILAS_POR_FRANJA,
  aMonocromo,
  anchoDeFranja,
  construirComandosLogo,
  construirLogoParaTicket,
  dimensionesParaPapel,
  estiloLogoImpresion,
  filasParaAlto,
  logoEnTicketActivo,
  puntosDePapel,
} from '../src/core/logo-impresion';
import { construirTextoComprobante, type DatosComprobante } from '../src/core/comprobante-impresion';
import { construirTextoPruebaLogo } from '../src/core/comprobante-prueba';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

// ---- Configuración y papel
afirmar(logoEnTicketActivo(null) && logoEnTicketActivo('1') && !logoEnTicketActivo('0'), 'Imprimir el logotipo en la ticketera viene ACTIVADO y solo «0» lo apaga');
afirmar(estiloLogoImpresion(null) === 'nitido' && estiloLogoImpresion('sombras') === 'sombras' && estiloLogoImpresion('raro') === 'nitido', 'Estilo: «nítido» por defecto; «sombras» solo si se eligió');
afirmar(
  puntosDePapel({ papel: '58', caracteres: 32 }) === 384 && puntosDePapel({ papel: '80', caracteres: 48 }) === 576 && puntosDePapel({ papel: 'otro', caracteres: 42 }) === 504 && puntosDePapel({ papel: 'otro', caracteres: 40 }) === 480,
  'Puntos de papel: 58 mm = 384, 80 mm = 576, otro = caracteres × 12',
);
afirmar(anchoDeFranja(384) === 376 && anchoDeFranja(576) === 576, 'Ancho de franja: 58 mm → 376 y 80 mm → 576 (el byte nL queda menor a 128)');
afirmar([384, 576, 504, 480, 400, 300, 256, 128].every((p) => anchoDeFranja(p) % 256 < 128 && anchoDeFranja(p) % 8 === 0 && anchoDeFranja(p) <= p), 'Cualquier ancho de franja es múltiplo de 8, cabe en el papel y viaja en 7 bits');
afirmar(JSON.stringify(dimensionesParaPapel(384, 160, 376)) === '{"ancho":376,"alto":157}', 'Un logotipo de 384 × 160 en papel de 58 mm se ajusta a 376 de ancho conservando la proporción');
afirmar(JSON.stringify(dimensionesParaPapel(200, 100, 576)) === '{"ancho":200,"alto":100}', 'Un logotipo chico no se agranda en papel de 80 mm');
afirmar(filasParaAlto(160) === 140 && filasParaAlto(8) === 7 && filasParaAlto(1) === 1, 'Cada 8 puntos de papel son 7 filas de imagen (compensa la franja)');

// ---- Blanco y negro
const px = (...rgba: number[]) => rgba;
afirmar(
  JSON.stringify(Array.from(aMonocromo([...px(0, 0, 0, 255), ...px(255, 255, 255, 255), ...px(200, 30, 30, 255), ...px(250, 250, 120, 255)], 4, 1, 'nitido'))) === '[1,0,1,0]',
  'Nítido: negro y colores oscuros → negro; blanco y colores claros (amarillo) → blanco',
);
afirmar(aMonocromo([0, 0, 0, 0], 1, 1, 'nitido')[0] === 0, 'Lo transparente se trata como blanco (no sale una mancha negra en el papel)');
afirmar(aMonocromo([0, 0, 0, 40], 1, 1, 'nitido')[0] === 0, 'Un negro casi transparente también queda blanco');
const gris = new Array(40 * 40).fill(0).flatMap(() => [128, 128, 128, 255]);
const sombras = Array.from(aMonocromo(gris, 40, 40, 'sombras')).reduce((a, b) => a + b, 0);
afirmar(sombras > 40 * 40 * 0.4 && sombras < 40 * 40 * 0.6, 'Con sombras, un gris medio se reparte en cerca de la mitad de puntos negros');
afirmar(Array.from(aMonocromo(gris, 40, 40, 'nitido')).every((v) => v === 1) === true || Array.from(aMonocromo(gris, 40, 40, 'nitido')).every((v) => v === 0), 'Nítido: un gris liso sale todo de un solo color (sin puntos sueltos)');

// ---- Comandos ESC/POS: bytes de 7 bits y estructura
function matrizAleatoria(ancho: number, alto: number, semilla = 7): Uint8Array {
  let s = semilla;
  const m = new Uint8Array(ancho * alto);
  for (let i = 0; i < m.length; i += 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    m[i] = (s >> 16) % 2;
  }
  return m;
}
/** Lee los comandos y devuelve la imagen que imprimirían (franjas de 7 filas × anchoFranja columnas). */
function decodificar(comandos: string): { anchoFranja: number; filas: number[][] } {
  let i = 0;
  const esperar = (texto: string) => {
    if (comandos.slice(i, i + texto.length) !== texto) throw new Error(`Se esperaba ${JSON.stringify(texto)} en la posición ${i}`);
    i += texto.length;
  };
  esperar('\x1Ba\x00');
  esperar('\x1B3\x08');
  const filas: number[][] = [];
  let anchoFranja = 0;
  while (comandos.startsWith('\x1B*\x01', i)) {
    i += 3;
    anchoFranja = comandos.charCodeAt(i) + comandos.charCodeAt(i + 1) * 256;
    i += 2;
    const columnas = Array.from({ length: anchoFranja }, (_, k) => comandos.charCodeAt(i + k));
    i += anchoFranja;
    esperar('\n');
    for (let j = 0; j < FILAS_POR_FRANJA; j += 1) filas.push(columnas.map((byte) => (byte >> (FILAS_POR_FRANJA - 1 - j)) & 1));
  }
  esperar('\x1B2');
  if (i !== comandos.length) throw new Error('Sobran datos al final de los comandos');
  return { anchoFranja, filas };
}

const ANCHO = 200;
const ALTO = 50;
const imagen = matrizAleatoria(ANCHO, ALTO);
const comandos = construirComandosLogo(imagen, ANCHO, ALTO, 376);
afirmar(Array.from(comandos).every((c) => c.charCodeAt(0) < 128), 'TODOS los bytes del logotipo son menores a 128 (viajan igual en UTF-8 o en cualquier codificación)');
const decodificado = decodificar(comandos);
afirmar(decodificado.anchoFranja === 376 && decodificado.filas.length === Math.ceil(ALTO / FILAS_POR_FRANJA) * FILAS_POR_FRANJA, 'Las franjas son de 376 puntos y de 7 filas cada una (51 → 56 filas con relleno)');
const izquierda = (376 - ANCHO) / 2;
let identica = true;
for (let y = 0; y < decodificado.filas.length; y += 1) {
  for (let x = 0; x < 376; x += 1) {
    const esperado = y < ALTO && x >= izquierda && x < izquierda + ANCHO ? imagen[y * ANCHO + (x - izquierda)] : 0;
    if (decodificado.filas[y]![x] !== esperado) identica = false;
  }
}
afirmar(identica, 'Al leer los comandos de vuelta sale exactamente la imagen original, centrada y con blanco a los lados y abajo');
afirmar(comandos.startsWith('\x1Ba\x00\x1B3\x08\x1B*\x01') && comandos.endsWith('\x1B2'), 'Empieza fijando avance de 8 puntos (franjas pegadas) y termina devolviendo el avance normal');
afirmar(comandos.split('\x1B*\x01').length - 1 === Math.ceil(ALTO / FILAS_POR_FRANJA), 'Hay una franja por cada 7 filas de imagen');

const negra = new Uint8Array(10 * 7).fill(1);
const dec = decodificar(construirComandosLogo(negra, 10, 7, 16));
afirmar(dec.filas.length === 7 && dec.filas.every((f, y) => f.slice(3, 13).every((v) => v === 1) && f.slice(0, 3).every((v) => v === 0) && f.slice(13).every((v) => v === 0)), 'Un bloque negro de 10 × 7 sale centrado (3 puntos de blanco a la izquierda y 3 a la derecha)');
const primeraFila = construirComandosLogo(new Uint8Array([1, 0, 0, 0, 0, 0, 0]), 1, 7, 8);
afirmar(primeraFila.charCodeAt('\x1Ba\x00\x1B3\x08\x1B*\x01\x08\x00'.length + 3) === 0x40, 'La fila de arriba de la imagen es el bit 6 (0x40) y el bit 7 queda siempre en blanco');
const ultimaFila = construirComandosLogo(new Uint8Array([0, 0, 0, 0, 0, 0, 1]), 1, 7, 8);
afirmar(ultimaFila.charCodeAt('\x1Ba\x00\x1B3\x08\x1B*\x01\x08\x00'.length + 3) === 0x01, 'La fila 7 de la imagen es el bit 0 (0x01)');
const ancho80 = construirLogoParaTicket(imagen, ANCHO, ALTO, 576);
afirmar(decodificar(ancho80).anchoFranja === 576 && ancho80.includes('\x1B*\x01\x40\x02'), 'En papel de 80 mm la franja es de 576 puntos (nL = 64, nH = 2)');
afirmar(construirLogoParaTicket(imagen, ANCHO, ALTO, 384).includes('\x1B*\x01\x78\x01') && decodificar(construirLogoParaTicket(imagen, ANCHO, ALTO, 384)).anchoFranja === 376, 'En papel de 58 mm la franja es de 376 puntos (nL = 120, nH = 1)');

const grande = construirComandosLogo(matrizAleatoria(376, 140, 3), 376, 140, 376);
afirmar(grande.length < 10_000, 'Un logotipo de 58 mm completo pesa menos de 10 KB de datos (se manda rápido)');

// ---- Dentro del ticket
const datos: DatosComprobante = {
  numeroComprobante: '001-0000007',
  fecha: '29/10/2026',
  hora: '10:30',
  nombreVendedor: null,
  clienteNombre: 'Cliente Eventual',
  clienteDocumento: null,
  lineas: [{ descripcion: 'Pan', cantidad: 2, precioUnitario: 0.5, subtotal: 1 }],
  total: 1,
  metodoPago: 'efectivo',
  simboloMoneda: 'S/',
  tienda: { nombre: 'Bodega Don Pepe', documento: null, ubicacion: null, contacto: null, leyenda: null },
};
const sinLogo = construirTextoComprobante(datos, 32);
const conLogo = construirTextoComprobante({ ...datos, logoParaImpresion: comandos }, 32);
afirmar(conLogo === `\x1B@${comandos}${sinLogo.slice(2)}`, 'El logotipo va justo después de inicializar la impresora y antes del encabezado, sin alterar el resto del ticket');
afirmar(conLogo.includes(comandos), 'La normalización del texto no cambia ni un byte del logotipo');
afirmar(construirTextoComprobante({ ...datos, logoParaImpresion: null }, 32) === sinLogo && construirTextoComprobante({ ...datos, logoParaImpresion: undefined }, 32) === sinLogo, 'Sin logotipo el ticket sale idéntico a antes');
afirmar(Array.from(construirTextoComprobante({ ...datos, logoParaImpresion: comandos }, 48)).every((c) => c.charCodeAt(0) < 128), 'El ticket completo con logotipo solo trae bytes de 0 a 127');

const prueba = construirTextoPruebaLogo(comandos);
afirmar(prueba.startsWith(`\x1B@${comandos}`) && prueba.includes('Prueba de logotipo') && prueba.endsWith('\x1DV\x00') && Array.from(prueba).every((c) => c.charCodeAt(0) < 128), 'El ticket de prueba del logotipo trae el logotipo, un texto corto y corta el papel');

console.log('\n🎉 Logotipo en la ticketera (Etapa 2): la lógica funciona.');
