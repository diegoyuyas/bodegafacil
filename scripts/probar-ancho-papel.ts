/**
 * Prueba del ancho de papel de la ticketera (58 mm, 80 mm u otro): lectura de la configuración,
 * sugerencia por el nombre de la impresora, el ticket armado a 32/48/otro caracteres y el ticket de prueba.
 *
 * Uso: npx tsx scripts/probar-ancho-papel.ts
 */
import {
  CARACTERES_POR_PAPEL,
  etiquetaAnchoImpresora,
  leerAnchoImpresora,
  normalizarCaracteresPorLinea,
  papelSugeridoPorNombre,
} from '../src/core/impresora';
import { construirTextoComprobante, type DatosComprobante } from '../src/core/comprobante-impresion';
import { construirMarcoDeAncho, construirReglaDeAncho, construirTextoPrueba } from '../src/core/comprobante-prueba';

function afirmar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`❌ Falló: ${mensaje}`);
  console.log(`✅ ${mensaje}`);
}

// ---- Configuración
afirmar(CARACTERES_POR_PAPEL['58'] === 32 && CARACTERES_POR_PAPEL['80'] === 48, '58 mm = 32 caracteres por línea y 80 mm = 48');
afirmar(leerAnchoImpresora(null, null).papel === '58' && leerAnchoImpresora(null, null).caracteres === 32, 'Sin nada guardado: 58 mm / 32 caracteres (como siempre)');
afirmar(leerAnchoImpresora('58', null).caracteres === 32 && leerAnchoImpresora('80', null).caracteres === 48, 'Se leen 58 mm y 80 mm');
afirmar(leerAnchoImpresora('otro', '42').papel === 'otro' && leerAnchoImpresora('otro', '42').caracteres === 42, '«Otro» usa los caracteres guardados (42)');
afirmar(
  ['otro'].every((p) => leerAnchoImpresora(p, null).papel === '58' && leerAnchoImpresora(p, '99').papel === '58' && leerAnchoImpresora(p, 'abc').papel === '58' && leerAnchoImpresora(p, '20').papel === '58'),
  '«Otro» con caracteres vacíos, raros o fuera de rango vuelve a 58 mm (nunca se rompe el ticket)',
);
afirmar(leerAnchoImpresora('cualquier cosa', '40').papel === '58', 'Un valor de papel desconocido se trata como 58 mm');
afirmar(
  normalizarCaracteresPorLinea('32') === 32 && normalizarCaracteresPorLinea(48) === 48 && normalizarCaracteresPorLinea(' 40 ') === 40 &&
    normalizarCaracteresPorLinea('31') === null && normalizarCaracteresPorLinea('49') === null && normalizarCaracteresPorLinea('') === null && normalizarCaracteresPorLinea('4.5') === null && normalizarCaracteresPorLinea(null) === null,
  'Caracteres por línea: enteros entre 32 y 48 (lo demás se rechaza)',
);
afirmar(
  etiquetaAnchoImpresora({ papel: '58', caracteres: 32 }) === '58 mm' && etiquetaAnchoImpresora({ papel: '80', caracteres: 48 }) === '80 mm' && etiquetaAnchoImpresora({ papel: 'otro', caracteres: 40 }) === 'Otro (40 caracteres)',
  'Etiquetas: «58 mm», «80 mm» y «Otro (40 caracteres)»',
);

// ---- Sugerencia por nombre
afirmar(papelSugeridoPorNombre('XP-58IIH') === '58' && papelSugeridoPorNombre('Printer 58mm') === '58' && papelSugeridoPorNombre('BT-58') === '58', 'El nombre dice 58 → se sugiere 58 mm');
afirmar(papelSugeridoPorNombre('MPT-80') === '80' && papelSugeridoPorNombre('XP-80C') === '80' && papelSugeridoPorNombre('POS80') === '80', 'El nombre dice 80 → se sugiere 80 mm');
afirmar(
  papelSugeridoPorNombre('BlueTooth Printer') === null && papelSugeridoPorNombre('PT-210') === null && papelSugeridoPorNombre('POS-5805') === null && papelSugeridoPorNombre('RPP300') === null && papelSugeridoPorNombre('XP-58/80') === null && papelSugeridoPorNombre('') === null && papelSugeridoPorNombre(null) === null,
  'Si el nombre no lo dice (o dice los dos, o tiene el número dentro de otro), no se sugiere nada',
);

// ---- Ticket al ancho elegido
const datos: DatosComprobante = {
  numeroComprobante: '001-0000007',
  referenciaPedido: 'V-12',
  fecha: '29/10/2026',
  hora: '10:30',
  nombreVendedor: 'Diego Carrasco Rodriguez',
  clienteNombre: 'Empresa de Servicios Generales Los Andes SAC',
  clienteDocumento: '20100070970',
  etiquetaDocumentoCliente: 'RUC',
  lineas: [
    { descripcion: 'Gaseosa Inca Kola 1.5 litros', cantidad: 2, precioUnitario: 7.5, subtotal: 15, nota: 'bien fria' },
    { descripcion: 'Pan', cantidad: 10, precioUnitario: 0.3, subtotal: 3 },
  ],
  total: 18,
  metodoPago: 'efectivo',
  simboloMoneda: 'S/',
  tienda: { nombre: 'Bodega Don Pepe', documento: 'RUC 10123456781', ubicacion: 'Av. Los Olivos 123, Lima', contacto: '999 888 777', leyenda: null },
};
const quitarControl = (t: string) =>
  t.replace(/\x1B@/g, '').replace(/\x1B[aE][\x00\x01]/g, '').replace(/\x1D![\x00\x11]/g, '').replace(/\x1DV\x00/g, '');
const lineasDe = (ancho?: number) => quitarControl(ancho === undefined ? construirTextoComprobante(datos) : construirTextoComprobante(datos, ancho)).split('\n');

afirmar(construirTextoComprobante(datos) === construirTextoComprobante(datos, 32), 'Sin indicar el ancho el ticket sale igual que siempre (32 caracteres)');

for (const ancho of [32, 40, 48]) {
  const lineas = lineasDe(ancho);
  afirmar(lineas.every((l) => l.length <= ancho), `A ${ancho} caracteres ninguna línea del ticket se pasa del ancho`);
  afirmar(lineas.filter((l) => /^-+$/.test(l)).length >= 5 && lineas.filter((l) => /^-+$/.test(l)).every((l) => l.length === ancho), `A ${ancho} caracteres los separadores ocupan justo el ancho`);
}
const a48 = lineasDe(48);
afirmar(a48.includes('Documento interno, sin valor tributario') && a48.includes('DOCUMENTO INTERNO') && a48.includes('001-0000007'), 'A 48 caracteres la leyenda cabe en una sola línea y el encabezado sigue igual');
const a32 = lineasDe(32);
afirmar(a32.includes('Documento interno,') && a32.includes('sin valor tributario'), 'A 32 caracteres la leyenda se parte en dos líneas');
const lineasDelCliente = (l: string[]) => {
  const i = l.findIndex((x) => x.startsWith('Cliente:'));
  return l.slice(i, l.findIndex((x, k) => k > i && /^-+$/.test(x))).length;
};
afirmar(lineasDelCliente(a48) < lineasDelCliente(a32), 'A 48 caracteres el nombre del cliente largo ocupa menos líneas que a 32');
afirmar(a48.length < a32.length, 'El ticket de 80 mm queda más corto que el de 58 mm (más caracteres por línea)');

// ---- Ticket de prueba
afirmar(construirReglaDeAncho(12) === '123456789012' && construirReglaDeAncho(32).length === 32 && construirReglaDeAncho(48).length === 48, 'La regla de la prueba mide justo el ancho (1234567890…)');
afirmar(construirMarcoDeAncho(32) === `|${'='.repeat(30)}|` && construirMarcoDeAncho(48).length === 48, 'El marco de la prueba tiene una barra | en cada borde y mide justo el ancho');
for (const [ancho, etiqueta] of [[32, '58 mm'], [48, '80 mm'], [40, 'Otro (40 caracteres)']] as const) {
  const prueba = quitarControl(construirTextoPrueba('Bodega Don Pepe', ancho, etiqueta)).split('\n');
  afirmar(
    prueba.includes(construirReglaDeAncho(ancho)) && prueba.includes(construirMarcoDeAncho(ancho)) && prueba.includes(`Papel: ${etiqueta}`) && prueba.includes(`Caracteres por linea: ${ancho}`),
    `Ticket de prueba a ${ancho}: trae la regla, el marco, el papel («${etiqueta}») y los caracteres por línea`,
  );
  afirmar(prueba.every((l) => l.length <= ancho), `Ticket de prueba a ${ancho}: ninguna línea se pasa del ancho`);
}
afirmar(construirTextoPrueba('Tienda') === construirTextoPrueba('Tienda', 32, '58 mm'), 'La prueba sin indicar el ancho sigue siendo la de 58 mm');

console.log('\n🎉 Ancho del papel (58 mm, 80 mm y otro): la lógica funciona.');
