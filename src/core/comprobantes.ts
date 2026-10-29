/**
 * Vende Fácil — Series y comprobantes (Nota de venta, Boleta, Factura)
 * ------------------------------------------------------------
 * Lógica PURA (sin base de datos). Las series son NO electrónicas: no hay envío a SUNAT.
 *
 *  - Sin series creadas (o sin Premium) solo se emiten notas de venta (correlativo `V-N`).
 *  - Con series, por defecto aparece Boleta. La Factura exige un cliente registrado con RUC válido.
 *  - La SERIE tiene 3 o 4 caracteres (letras y números). El NÚMERO tiene 7 u 8 dígitos.
 *  - Cada serie lleva su propio correlativo y se muestra como `SERIE-NÚMERO` (ej. `B001-0000123`).
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

/** Como se escribe en el ticket: «BOLETA B001-0000123». */
export const TITULO_COMPROBANTE: Record<TipoComprobante, string> = {
  nota_venta: 'NOTA DE VENTA',
  boleta: 'BOLETA',
  factura: 'FACTURA',
};

export const LARGOS_SERIE_PERMITIDOS: readonly number[] = [3, 4];
export const DIGITOS_NUMERO_PERMITIDOS: readonly number[] = [7, 8];
export const LARGO_SERIE_PREDETERMINADO = 4;
export const DIGITOS_NUMERO_PREDETERMINADO = 7;

/** Lee el largo de serie guardado en configuración (3 o 4); si falta o es raro, el predeterminado. */
export function largoSerieDeConfiguracion(valorGuardado: string | null): number {
  const n = Number(valorGuardado);
  return LARGOS_SERIE_PERMITIDOS.includes(n) ? n : LARGO_SERIE_PREDETERMINADO;
}

/** Lee los dígitos del número guardados en configuración (7 u 8); si falta o es raro, el predeterminado. */
export function digitosNumeroDeConfiguracion(valorGuardado: string | null): number {
  const n = Number(valorGuardado);
  return DIGITOS_NUMERO_PERMITIDOS.includes(n) ? n : DIGITOS_NUMERO_PREDETERMINADO;
}

export interface SerieComprobante {
  id: number;
  tipo: TipoSerie;
  /** En mayúsculas, 3 o 4 caracteres (ej. `B001`). */
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
  return texto.trim().toUpperCase();
}

/** Devuelve la serie normalizada (mayúsculas) o lanza un mensaje claro. */
export function validarSerie(texto: string): string {
  const serie = normalizarSerie(texto);
  if (!/^[A-Z0-9]{3,4}$/.test(serie)) {
    throw new ErrorDeNegocio('La serie debe tener 3 o 4 caracteres, solo letras y números (ejemplo: B001).');
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

/** Una serie de ejemplo para quien empieza: B001 / F001 (o B01 / F01 si la serie es de 3 caracteres). */
export function sugerirSerie(tipo: TipoSerie, largo: number): string {
  const letra = tipo === 'boleta' ? 'B' : 'F';
  return `${letra}${'0'.repeat(Math.max(largo - 2, 1))}1`;
}

/** Para una serie NUEVA: además de ser válida, tiene que tener el largo elegido (3 o 4). */
export function validarSerieNueva(texto: string, largo: number, tipo: TipoSerie): string {
  const serie = validarSerie(texto);
  if (serie.length !== largo) {
    throw new ErrorDeNegocio(`La serie debe tener ${largo} caracteres (por ejemplo ${sugerirSerie(tipo, largo)}).`);
  }
  return serie;
}

/** El ejemplo en vivo de las pantallas: `B001-0000001`, o null mientras lo escrito todavía no sea válido. */
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

/** `B001-0000123` */
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

/** El número tal como se muestra: `B001-0000123` o `V-12`. */
export function textoComprobante(datos: DatosTextoComprobante): string {
  if (datos.tipo === 'nota_venta' || !datos.serie || datos.numero === null) {
    return `V-${datos.ventaId}`;
  }
  return formatearComprobante(datos.serie, datos.numero, datos.digitos ?? DIGITOS_NUMERO_PREDETERMINADO);
}

/** El título completo del documento: «BOLETA B001-0000123», «NOTA DE VENTA V-12». */
export function tituloComprobante(datos: DatosTextoComprobante): string {
  return `${TITULO_COMPROBANTE[tipoEfectivo(datos)]} ${textoComprobante(datos)}`;
}

/** Para listas y reportes: «Boleta B001-0000123», «Factura F001-0000045», «Nota de venta V-12». */
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
