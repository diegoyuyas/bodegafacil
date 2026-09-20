/**
 * Vende Fácil — Comprobante de venta (impresora Bluetooth + imagen para WhatsApp)
 * ------------------------------------------------------------
 * Función pura: sin DOM, sin Capacitor — solo texto. Arma primero una
 * lista de líneas "neutra" (`construirLineasComprobante`, con
 * alineación/negrita como datos, no como bytes de impresora), y dos
 * consumidores la convierten a lo que necesitan:
 *  - `construirTextoComprobante` → texto ESC/POS real para la
 *    ticketera Bluetooth (ver infraestructura/impresora-bluetooth/).
 *  - `infraestructura/comprobante-imagen/generar-imagen.ts` → un PNG
 *    para compartir por WhatsApp (Guardar ticket como...), con un
 *    ancho más cómodo de leer en pantalla.
 *
 * Dos decisiones técnicas tomadas sin poder probar en una impresora
 * física real (ver README del proyecto):
 * 1. Ancho fijo de 32 caracteres para la impresora — estándar de
 *    ticketeras de 58mm. El formato de ejemplo original estaba
 *    pensado para papel más ancho, así que cada producto se imprime
 *    en 2 renglones para que quepa. La imagen para WhatsApp SÍ usa un
 *    ancho más generoso (ver `ANCHO_IMAGEN` en el renderer de imagen).
 * 2. `normalizarParaImpresora` saca tildes, ñ, ¿ y ¡ antes de mandar a
 *    la impresora (no a la imagen): el plugin manda el texto como
 *    UTF-8 crudo, pero la mayoría de ticketeras económicas usan una
 *    página de códigos de un solo byte — con tildes se arriesga a
 *    imprimir símbolos corruptos. La imagen no tiene ese problema
 *    (es texto renderizado, no bytes a un dispositivo), así que ahí
 *    sí se muestran las tildes normalmente.
 */

import { redondear } from './reglas-negocio';

export const ANCHO_TICKET = 32;

const REEMPLAZOS_EXTRA: Record<string, string> = { '¿': '', '¡': '', '°': 'o' };

/** Saca tildes/ñ (vía descomposición Unicode) y unos pocos símbolos sueltos — solo para la impresora térmica. */
export function normalizarParaImpresora(texto: string): string {
  let limpio = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [de, a] of Object.entries(REEMPLAZOS_EXTRA)) limpio = limpio.split(de).join(a);
  return limpio;
}

export function centrarTexto(texto: string, ancho: number): string {
  if (texto.length >= ancho) return texto.slice(0, ancho);
  const relleno = ancho - texto.length;
  const izquierda = Math.floor(relleno / 2);
  return ' '.repeat(izquierda) + texto + ' '.repeat(relleno - izquierda);
}

export function lineaSeparadora(ancho: number): string {
  return '-'.repeat(ancho);
}

/** Dos textos en la misma línea: uno pegado a la izquierda, otro pegado a la derecha. */
export function columnas(izquierda: string, derecha: string, ancho: number): string {
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

export const ETIQUETAS_METODO_PAGO_TICKET: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
};

function monto(valor: number, simbolo: string): string {
  return `${simbolo} ${valor.toFixed(2)}`;
}

/** OP. GRAVADA + IGV (18%), calculados hacia atrás desde el total (los precios ya incluyen IGV). */
export function calcularDesgloseIgv(total: number): { opGravada: number; igv: number } {
  const opGravada = redondear(total / 1.18);
  return { opGravada, igv: redondear(total - opGravada) };
}

export interface LineaTexto {
  texto: string;
  alineacion: 'izquierda' | 'centro';
  negrita?: boolean;
  /** Solo la usa la impresora (letra más grande); la imagen ignora esto y usa su propio tamaño de fuente por línea. */
  grande?: boolean;
}

/** Envuelve por palabras si no entra en `ancho` — para nombre de tienda, ubicación, leyenda o nombres de cliente largos. */
function envolverTexto(texto: string, ancho: number): string[] {
  if (texto.length <= ancho) return [texto];
  const palabras = texto.split(' ');
  const envueltas: string[] = [];
  let actual = '';
  for (const palabra of palabras) {
    const candidato = actual ? `${actual} ${palabra}` : palabra;
    if (candidato.length > ancho && actual) {
      envueltas.push(actual);
      actual = palabra;
    } else {
      actual = candidato;
    }
  }
  if (actual) envueltas.push(actual);
  return envueltas;
}

/**
 * Arma el comprobante como una lista de líneas "neutras" — el dato de
 * qué va centrado/negrita, no los bytes para lograrlo. `ancho` es en
 * caracteres (monoespaciado), distinto según quién la consuma. Los
 * textos largos (nombre de tienda, ubicación, leyenda, cliente) se
 * envuelven en varias líneas en vez de cortarse.
 */
export function construirLineasComprobante(datos: DatosComprobante, ancho: number): LineaTexto[] {
  const s = datos.simboloMoneda;
  const lineas: LineaTexto[] = [];
  const c = (texto: string, extra: Partial<LineaTexto> = {}) => {
    // Una línea "grande" (el nombre de la tienda) se dibuja en una
    // fuente más ancha que el resto del ticket — si se envuelve al
    // mismo número de caracteres que el resto, puede terminar bastante
    // más ancha visualmente que los separadores. Se envuelve más corta
    // a propósito, para que no se vea más ancha que el resto del ticket.
    const anchoEfectivo = extra.grande ? Math.round(ancho * 0.7) : ancho;
    for (const sub of envolverTexto(texto, anchoEfectivo)) lineas.push({ texto: sub, alineacion: 'centro', ...extra });
  };
  const i = (texto: string, extra: Partial<LineaTexto> = {}) => {
    for (const sub of envolverTexto(texto, ancho)) lineas.push({ texto: sub, alineacion: 'izquierda', ...extra });
  };

  c(datos.tienda.nombre, { negrita: true, grande: true });
  if (datos.tienda.documento) c(datos.tienda.documento);
  if (datos.tienda.ubicacion) c(datos.tienda.ubicacion);
  c('');

  c('COMPROBANTE DE VENTA', { negrita: true });
  c(datos.numeroComprobante, { negrita: true });
  i(lineaSeparadora(ancho));

  i(`Fecha: ${datos.fecha}  Hora: ${datos.hora}`);
  const documentoCliente = datos.clienteDocumento ? ` / DNI: ${datos.clienteDocumento}` : '';
  i(`Cliente: ${datos.clienteNombre}${documentoCliente}`);
  i(lineaSeparadora(ancho));

  for (const linea of datos.lineas) {
    i(`${linea.cantidad} ${linea.descripcion}`);
    i(columnas(`  ${monto(linea.precioUnitario, s)} c/u`, monto(linea.subtotal, s), ancho));
  }
  i(lineaSeparadora(ancho));

  const { opGravada, igv } = calcularDesgloseIgv(datos.total);
  i(columnas('OP. GRAVADA:', monto(opGravada, s), ancho));
  i(columnas('IGV (18%):', monto(igv, s), ancho));
  i(columnas('IMPORTE TOTAL:', monto(datos.total, s), ancho), { negrita: true });
  i(lineaSeparadora(ancho));

  const etiquetaPago = ETIQUETAS_METODO_PAGO_TICKET[datos.metodoPago] ?? datos.metodoPago;
  i(`Forma de pago: ${etiquetaPago}`);
  // La app no guarda el efectivo recibido ni el vuelto de una venta
  // (no es un dato que exista hoy en ningún lado) — se restata el
  // monto pagado por el método elegido, igual que en el formato
  // pedido ("Efectivo: S/ 48.50"); en Fiado no aplica, no se pagó nada.
  if (datos.metodoPago !== 'fiado') {
    i(columnas(`${etiquetaPago}:`, monto(datos.total, s), ancho));
  }
  i(lineaSeparadora(ancho));

  c('Representacion impresa de la');
  c('Boleta de Venta.');
  c('');
  c('Gracias por su compra!', { negrita: true });
  if (datos.tienda.contacto) c(datos.tienda.contacto);
  if (datos.tienda.leyenda) c(datos.tienda.leyenda);

  return lineas;
}

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

/** Texto ESC/POS real para mandar al socket Bluetooth de la impresora. */
export function construirTextoComprobante(datos: DatosComprobante): string {
  const partes: string[] = [INICIALIZAR];

  for (const linea of construirLineasComprobante(datos, ANCHO_TICKET)) {
    partes.push(linea.alineacion === 'centro' ? CENTRAR : IZQUIERDA);
    if (linea.negrita) partes.push(NEGRITA_ON);
    if (linea.grande) partes.push(TEXTO_GRANDE);
    partes.push(linea.texto, '\n');
    if (linea.grande) partes.push(TEXTO_NORMAL);
    if (linea.negrita) partes.push(NEGRITA_OFF);
  }

  partes.push('\n\n\n', CORTAR_PAPEL);
  return normalizarParaImpresora(partes.join(''));
}
