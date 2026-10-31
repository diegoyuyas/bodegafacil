/**
 * Vende Fácil — Series y comprobantes (Nota de venta, Boleta, Factura)
 * ------------------------------------------------------------
 * Lógica PURA (sin base de datos). Las series son NO electrónicas: no hay envío a SUNAT.
 *
 *  - Sin series creadas (o sin Premium) solo se emiten notas de venta (correlativo `V-N`).
 *  - Con series, por defecto aparece Boleta. La Factura exige un cliente registrado con RUC válido.
 *  - La SERIE son exactamente 3 NÚMEROS (001, 002...): sin letras, para que nunca se confunda con las series
 *    alfanuméricas (F001, B001, E001...) que SUNAT usa en los comprobantes ELECTRÓNICOS. El NÚMERO tiene 7 u 8 dígitos.
 *  - Cada serie lleva su propio correlativo y se muestra como `SERIE-NÚMERO` (ej. `001-0000123`).
 *  - Todo lo que imprime la app es un DOCUMENTO INTERNO, sin valor tributario.
 */

import { ErrorDeNegocio } from './reglas-negocio';

export type TipoComprobante = 'nota_venta' | 'boleta' | 'factura';
/** Los tipos que llevan serie (la nota de venta no). */
export type TipoSerie = 'boleta' | 'factura';

export const TIPOS_SERIE: readonly TipoSerie[] = ['boleta', 'factura'];

export const ETIQUETA_COMPROBANTE: Record<TipoComprobante, string> = {
  nota_venta: 'Nota de venta',
  boleta: 'Boleta',
  factura: 'Factura',
};

/** Encabezado de todo ticket (nota de venta, boleta o factura): la app no emite comprobantes con valor tributario. */
export const TITULO_DOCUMENTO_INTERNO = 'DOCUMENTO INTERNO';
/** Última línea de todo ticket. */
export const LEYENDA_DOCUMENTO_INTERNO = 'Documento interno, sin valor tributario';

/** La serie son siempre 3 números. */
export const LARGO_SERIE = 3;
export const DIGITOS_NUMERO_PERMITIDOS: readonly number[] = [7, 8];
export const DIGITOS_NUMERO_PREDETERMINADO = 7;

/** Lee los dígitos del número guardados en configuración (7 u 8); si falta o es raro, el predeterminado. */
export function digitosNumeroDeConfiguracion(valorGuardado: string | null): number {
  const n = Number(valorGuardado);
  return DIGITOS_NUMERO_PERMITIDOS.includes(n) ? n : DIGITOS_NUMERO_PREDETERMINADO;
}

export interface SerieComprobante {
  id: number;
  tipo: TipoSerie;
  /** 3 números (ej. `001`). Las series antiguas con letras quedan desactivadas y sin poder usarse. */
  serie: string;
  /** 7 u 8. Queda guardado en la serie al crearla: cambiar los valores por defecto no altera los ya emitidos. */
  digitosNumero: number;
  /** El próximo número que se va a emitir con esta serie. */
  siguienteNumero: number;
  activo: boolean;
  /** La que se usa cuando el usuario no tiene una asignada. Hay a lo más una activa por tipo. */
  predeterminada: boolean;
  creadoEn: string;
  actualizadoEn: string;
}

// ------------------------------------------------------------
// Serie y número
// ------------------------------------------------------------

export function normalizarSerie(texto: string): string {
  return texto.trim();
}

/** ¿Es una serie permitida hoy? Exactamente 3 números (001). */
export function esSerieValida(texto: string): boolean {
  return /^\d{3}$/.test(texto);
}

/** Devuelve la serie (3 números) o lanza un mensaje claro. */
export function validarSerie(texto: string): string {
  const serie = normalizarSerie(texto);
  if (!esSerieValida(serie)) {
    throw new ErrorDeNegocio('La serie debe ser de 3 números, sin letras (ejemplo: 001).');
  }
  return serie;
}

export function validarDigitosNumero(digitos: number): number {
  if (!DIGITOS_NUMERO_PERMITIDOS.includes(digitos)) {
    throw new ErrorDeNegocio('El número del comprobante debe tener 7 u 8 dígitos.');
  }
  return digitos;
}

/** El número más alto que cabe con esa cantidad de dígitos (7 → 9 999 999). */
export function numeroMaximo(digitos: number): number {
  return 10 ** digitos - 1;
}

export function validarSiguienteNumero(numero: number, digitos: number): number {
  if (!Number.isInteger(numero) || numero < 1) {
    throw new ErrorDeNegocio('El siguiente número debe ser un número entero desde el 1.');
  }
  if (numero > numeroMaximo(digitos)) {
    throw new ErrorDeNegocio(`El número es muy grande: con ${digitos} dígitos el máximo es ${numeroMaximo(digitos)}.`);
  }
  return numero;
}

/** La primera serie libre desde la 001 (001, 002, 003...): la que se propone al crear una serie nueva. */
export function sugerirSerie(existentes: readonly string[]): string {
  const usadas = new Set(existentes);
  for (let n = 1; n <= 999; n += 1) {
    const serie = String(n).padStart(LARGO_SERIE, '0');
    if (!usadas.has(serie)) return serie;
  }
  return '001';
}

/** El ejemplo en vivo de las pantallas: `001-0000001`, o null mientras lo escrito todavía no sea válido. */
export function ejemploComprobante(serie: string, digitos: number, numero: number): string | null {
  try {
    const s = validarSerie(serie);
    validarDigitosNumero(digitos);
    validarSiguienteNumero(numero, digitos);
    return formatearComprobante(s, numero, digitos);
  } catch {
    return null;
  }
}

export function formatearNumero(numero: number, digitos: number): string {
  return String(numero).padStart(digitos, '0');
}

/** `001-0000123` */
export function formatearComprobante(serie: string, numero: number, digitos: number): string {
  return `${serie}-${formatearNumero(numero, digitos)}`;
}

export interface DatosTextoComprobante {
  tipo: TipoComprobante;
  serie: string | null;
  numero: number | null;
  /** Para la nota de venta (y las ventas anteriores a las series): el correlativo de siempre, `V-N`. */
  ventaId: number;
  /** Dígitos de la serie. Si no se conocen se usa el predeterminado (solo pasa con datos incompletos). */
  digitos?: number | null;
}

/** Una boleta/factura sin serie o sin número (dato incompleto) se trata como lo que se muestra: nota de venta. */
function tipoEfectivo(datos: DatosTextoComprobante): TipoComprobante {
  return datos.tipo !== 'nota_venta' && datos.serie && datos.numero !== null ? datos.tipo : 'nota_venta';
}

/** El número tal como se muestra: `001-0000123` o `V-12`. */
export function textoComprobante(datos: DatosTextoComprobante): string {
  if (datos.tipo === 'nota_venta' || !datos.serie || datos.numero === null) {
    return `V-${datos.ventaId}`;
  }
  return formatearComprobante(datos.serie, datos.numero, datos.digitos ?? DIGITOS_NUMERO_PREDETERMINADO);
}

/** Para listas y reportes: «Boleta 001-0000123», «Factura 002-0000045», «Nota de venta V-12». */
export function comprobanteConTipo(datos: DatosTextoComprobante): string {
  return `${ETIQUETA_COMPROBANTE[tipoEfectivo(datos)]} ${textoComprobante(datos)}`;
}

// ------------------------------------------------------------
// RUC (para la Factura)
// ------------------------------------------------------------

const PREFIJOS_RUC_VALIDOS: readonly string[] = ['10', '15', '16', '17', '20'];
const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** RUC de 11 dígitos, con prefijo 10, 15, 16, 17 o 20 y dígito verificador correcto (módulo 11). */
export function esRucValido(texto: string | null | undefined): boolean {
  const ruc = (texto ?? '').trim();
  if (!/^\d{11}$/.test(ruc)) return false;
  if (!PREFIJOS_RUC_VALIDOS.includes(ruc.slice(0, 2))) return false;
  let suma = 0;
  for (let i = 0; i < 10; i += 1) suma += (PESOS_RUC[i] ?? 0) * Number(ruc[i]);
  const digitoVerificador = (11 - (suma % 11)) % 10;
  return digitoVerificador === Number(ruc[10]);
}

/** La Factura necesita un cliente registrado cuyo documento sea un RUC válido. */
export function validarClienteParaFactura(clienteId: number | null | undefined, documento: string | null | undefined): void {
  if (!clienteId) {
    throw new ErrorDeNegocio('Para emitir una factura elige un cliente registrado que tenga RUC.');
  }
  if (!documento?.trim()) {
    throw new ErrorDeNegocio('Este cliente no tiene RUC. Agrégalo en sus datos para poder emitir una factura.');
  }
  if (!esRucValido(documento)) {
    throw new ErrorDeNegocio('El RUC de este cliente no es válido: debe tener 11 dígitos y empezar con 10, 15, 16, 17 o 20.');
  }
}

// ------------------------------------------------------------
// Qué comprobantes se pueden emitir
// ------------------------------------------------------------

/**
 * ÚNICO punto que decide si las series están disponibles: es una función Premium.
 * Si el Premium vence, la función se suspende (solo notas de venta) y las series se conservan.
 */
export function seriesDisponibles(esPremium: boolean): boolean {
  return esPremium;
}

/**
 * Tipos que se pueden elegir al vender, en el orden del selector.
 * Sin Premium o sin series activas: solo nota de venta.
 */
export function comprobantesDisponibles(esPremium: boolean, series: readonly SerieComprobante[]): TipoComprobante[] {
  const tipos: TipoComprobante[] = ['nota_venta'];
  if (!seriesDisponibles(esPremium)) return tipos;
  for (const tipo of TIPOS_SERIE) {
    if (series.some((s) => s.activo && s.tipo === tipo)) tipos.push(tipo);
  }
  return tipos;
}

/** Boleta si hay; si no, nota de venta (la Factura nunca es el valor por defecto: pide cliente con RUC). */
export function comprobantePorDefecto(disponibles: readonly TipoComprobante[]): TipoComprobante {
  return disponibles.includes('boleta') ? 'boleta' : 'nota_venta';
}

/**
 * Qué serie usar para un tipo: la asignada al usuario (si sigue activa), si no la predeterminada
 * del tipo y, como último recurso, la activa más antigua. null si no hay ninguna activa.
 */
export function elegirSerie(
  tipo: TipoSerie,
  series: readonly SerieComprobante[],
  asignadaId: number | null,
): SerieComprobante | null {
  const activas = series.filter((s) => s.activo && s.tipo === tipo).sort((a, b) => a.id - b.id);
  if (activas.length === 0) return null;
  const asignada = asignadaId === null ? undefined : activas.find((s) => s.id === asignadaId);
  return asignada ?? activas.find((s) => s.predeterminada) ?? activas[0] ?? null;
}
