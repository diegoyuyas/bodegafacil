/**
 * Vende Fácil — Comprobante de venta impreso (ESC/POS, ticketeras Bluetooth)
 * ------------------------------------------------------------
 * Arma el texto que se manda tal cual al socket Bluetooth de la
 * impresora (ver `infraestructura/impresora-bluetooth/impresora.ts`).
 * Función pura: sin DOM, sin Capacitor — solo texto.
 *
 * Dos decisiones técnicas importantes, tomadas sin poder probar en
 * una impresora física real (ver README del proyecto):
 *
 * 1. Ancho fijo de 32 caracteres por línea — es el estándar para
 *    ticketeras de 58mm (las que se recomendaron: Xprinter P103 /
 *    XP-58IIH). El formato de ejemplo que se pidió está pensado para
 *    un papel más ancho (columnas CANT/DESCRIPCIÓN/P.UNIT/TOTAL en
 *    una sola línea no entran en 32 caracteres con nombres de
 *    producto reales) — acá cada línea de producto se partió en 2
 *    renglones para que quepa igual.
 * 2. `normalizarParaImpresora` saca tildes, ñ, ¿ y ¡ antes de imprimir.
 *    El plugin manda el texto como UTF-8 crudo, pero la mayoría de
 *    ticketeras económicas usan una página de códigos de un solo byte
 *    (no UTF-8) — con tildes se arriesga a imprimir símbolos
 *    corruptos. Sin tildes, se ve bien en cualquier modelo.
 */

import { redondear } from './reglas-negocio';

export const ANCHO_TICKET = 32;

const ESC = '\x1B';
const GS = '\x1D';

const INICIALIZAR = `${ESC}@`;
const NEGRITA_ON = `${ESC}E\x01`;
const NEGRITA_OFF = `${ESC}E\x00`;
const CENTRAR = `${ESC}a\x01`;
const IZQUIERDA = `${ESC}a\x00`;
const TEXTO_GRANDE = `${GS}!\x11`;
const TEXTO_NORMAL = `${GS}!\x00`;
/** Corte de papel — en ticketeras sin cuchilla (la mayoría de las portátiles) el comando simplemente no hace nada. */
const CORTAR_PAPEL = `${GS}V\x00`;

const REEMPLAZOS_EXTRA: Record<string, string> = { '¿': '', '¡': '', '°': 'o' };

/** Saca tildes/ñ (vía descomposición Unicode) y unos pocos símbolos sueltos que no todas las ticketeras tienen. */
export function normalizarParaImpresora(texto: string): string {
  let limpio = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [de, a] of Object.entries(REEMPLAZOS_EXTRA)) limpio = limpio.split(de).join(a);
  return limpio;
}

function centrarTexto(texto: string, ancho = ANCHO_TICKET): string {
  if (texto.length >= ancho) return texto.slice(0, ancho);
  const relleno = ancho - texto.length;
  const izquierda = Math.floor(relleno / 2);
  return ' '.repeat(izquierda) + texto + ' '.repeat(relleno - izquierda);
}

function lineaSeparadora(ancho = ANCHO_TICKET): string {
  return '-'.repeat(ancho);
}

/** Dos textos en la misma línea: uno pegado a la izquierda, otro pegado a la derecha. */
function columnas(izquierda: string, derecha: string, ancho = ANCHO_TICKET): string {
  const espacio = Math.max(1, ancho - izquierda.length - derecha.length);
  return izquierda.slice(0, ancho - derecha.length - 1) + ' '.repeat(espacio) + derecha;
}

export interface LineaComprobante {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface DatosComprobante {
  numeroComprobante: string;
  fecha: string;
  hora: string;
  clienteNombre: string;
  clienteDocumento: string | null;
  lineas: LineaComprobante[];
  total: number;
  metodoPago: string;
  simboloMoneda: string;
  tienda: {
    nombre: string;
    documento: string | null;
    ubicacion: string | null;
    contacto: string | null;
    leyenda: string | null;
  };
}

const ETIQUETAS_METODO_PAGO_TICKET: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
};

function monto(valor: number, simbolo: string): string {
  return `${simbolo} ${valor.toFixed(2)}`;
}

export function construirTextoComprobante(datos: DatosComprobante): string {
  const s = datos.simboloMoneda;
  const renglones: string[] = [];

  renglones.push(INICIALIZAR, CENTRAR, NEGRITA_ON, TEXTO_GRANDE, datos.tienda.nombre, '\n', TEXTO_NORMAL);
  if (datos.tienda.documento) renglones.push(datos.tienda.documento, '\n');
  if (datos.tienda.ubicacion) renglones.push(datos.tienda.ubicacion, '\n');
  renglones.push(NEGRITA_OFF, '\n');

  renglones.push(NEGRITA_ON, 'COMPROBANTE DE VENTA', '\n', datos.numeroComprobante, '\n', NEGRITA_OFF);
  renglones.push(IZQUIERDA);
  renglones.push(lineaSeparadora(), '\n');

  renglones.push(`Fecha: ${datos.fecha}  Hora: ${datos.hora}`, '\n');
  const documentoCliente = datos.clienteDocumento ? ` / DNI: ${datos.clienteDocumento}` : '';
  renglones.push(`Cliente: ${datos.clienteNombre}${documentoCliente}`, '\n');
  renglones.push(lineaSeparadora(), '\n');

  for (const linea of datos.lineas) {
    renglones.push(`${linea.cantidad} ${linea.descripcion}`, '\n');
    renglones.push(
      columnas(`  ${monto(linea.precioUnitario, s)} c/u`, monto(linea.subtotal, s)),
      '\n',
    );
  }
  renglones.push(lineaSeparadora(), '\n');

  const opGravada = redondear(datos.total / 1.18);
  const igv = redondear(datos.total - opGravada);
  renglones.push(columnas('OP. GRAVADA:', monto(opGravada, s)), '\n');
  renglones.push(columnas('IGV (18%):', monto(igv, s)), '\n');
  renglones.push(NEGRITA_ON, columnas('IMPORTE TOTAL:', monto(datos.total, s)), '\n', NEGRITA_OFF);
  renglones.push(lineaSeparadora(), '\n');

  renglones.push(
    `Forma de pago: ${ETIQUETAS_METODO_PAGO_TICKET[datos.metodoPago] ?? datos.metodoPago}`,
    '\n',
  );
  // La app no guarda el efectivo recibido ni el vuelto de una venta
  // (no es un dato que exista hoy en ningún lado) — se restata el
  // monto pagado por el método elegido, igual que en el formato
  // pedido ("Efectivo: S/ 48.50"); en Fiado no aplica, no se pagó nada.
  if (datos.metodoPago !== 'fiado') {
    renglones.push(
      columnas(`${ETIQUETAS_METODO_PAGO_TICKET[datos.metodoPago] ?? datos.metodoPago}:`, monto(datos.total, s)),
      '\n',
    );
  }
  renglones.push(lineaSeparadora(), '\n');

  renglones.push(CENTRAR);
  renglones.push('Representacion impresa de la', '\n', 'Boleta de Venta.', '\n\n');
  renglones.push(NEGRITA_ON, 'Gracias por su compra!', NEGRITA_OFF, '\n');
  if (datos.tienda.contacto) renglones.push(datos.tienda.contacto, '\n');
  if (datos.tienda.leyenda) renglones.push(datos.tienda.leyenda, '\n');

  renglones.push('\n\n\n', CORTAR_PAPEL);

  return normalizarParaImpresora(renglones.join(''));
}
