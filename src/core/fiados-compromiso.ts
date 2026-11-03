/**
 * Vende Fácil — Fecha de compromiso de pago de Fiados (lógica pura)
 * ------------------------------------------------------------
 * «Me paga el viernes»: atajos de fecha, validación, texto de la etiqueta y cuándo un compromiso
 * se considera vencido. Todas las fechas son 'YYYY-MM-DD' en hora local del celular (el «hoy» lo
 * pone quien llama, normalmente `hoyLocalSql()`), así que no dependen de la zona horaria.
 * Sin UI ni base de datos: se prueba con `tsx`.
 */
import type { FilaFiado } from './fiados-resumen';

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MAXIMO_DIAS_ADELANTE = 365;
const VIERNES = 5;

function aUtc(fecha: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(anio, mes - 1, dia);
  const d = new Date(t);
  // Descarta fechas que no existen (31/02 se «corregiría» a marzo).
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return t;
}

function deUtc(t: number): string {
  const d = new Date(t);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

export function esFechaValida(fecha: string): boolean {
  return aUtc(fecha) !== null;
}

/** Suma (o resta) días de calendario a una fecha 'YYYY-MM-DD'. */
export function sumarDias(fecha: string, dias: number): string {
  const t = aUtc(fecha);
  if (t === null) return fecha;
  return deUtc(t + dias * 86_400_000);
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  const a = aUtc(desde);
  const b = aUtc(hasta);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** 'vie 07/11' (día de la semana y día/mes), igual en cualquier celular. */
export function etiquetaFechaCorta(fecha: string): string {
  const t = aUtc(fecha);
  if (t === null) return fecha;
  const d = new Date(t);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${DIAS_SEMANA[d.getUTCDay()]} ${dd}/${mm}`;
}

/** 'lun', 'mar'… de una fecha 'YYYY-MM-DD' (igual en cualquier celular). */
export function nombreDiaSemanaCorto(fecha: string): string {
  const t = aUtc(fecha);
  return t === null ? '' : (DIAS_SEMANA[new Date(t).getUTCDay()] ?? '');
}

export interface AtajoCompromiso {
  id: 'hoy' | 'manana' | 'viernes' | 'en7dias';
  etiqueta: string;
  fecha: string;
}

/**
 * Atajos de «Me paga el…»: hoy, mañana, el próximo viernes y en 7 días. Si dos atajos caen el mismo
 * día (por ejemplo, el viernes es mañana) se muestra solo el primero.
 */
export function atajosCompromiso(hoy: string): AtajoCompromiso[] {
  const t = aUtc(hoy);
  if (t === null) return [];
  const diaSemana = new Date(t).getUTCDay();
  const hastaViernes = ((VIERNES - diaSemana + 7) % 7) || 7; // el próximo viernes, nunca el de hoy
  const todos: AtajoCompromiso[] = [
    { id: 'hoy', etiqueta: 'Hoy', fecha: hoy },
    { id: 'manana', etiqueta: 'Mañana', fecha: sumarDias(hoy, 1) },
    { id: 'viernes', etiqueta: 'Viernes', fecha: sumarDias(hoy, hastaViernes) },
    { id: 'en7dias', etiqueta: 'En 7 días', fecha: sumarDias(hoy, 7) },
  ];
  const vistas = new Set<string>();
  return todos.filter((a) => (vistas.has(a.fecha) ? false : (vistas.add(a.fecha), true)));
}

/** Mensaje de error de la fecha elegida, o null si sirve. */
export function validarFechaCompromiso(fecha: string, hoy: string): string | null {
  if (!esFechaValida(fecha)) return 'Elige una fecha válida.';
  const dias = diasEntre(hoy, fecha);
  if (dias < 0) return 'La fecha no puede ser anterior a hoy.';
  if (dias > MAXIMO_DIAS_ADELANTE) return 'Elige una fecha dentro del próximo año.';
  return null;
}

export type EstadoCompromiso = 'ninguno' | 'pendiente' | 'hoy' | 'vencido';

/** `vencido` es solo cuando la fecha ya pasó: el mismo día del compromiso todavía no se pasó. */
export function estadoCompromiso(fechaCompromiso: string | null, hoy: string): EstadoCompromiso {
  if (!fechaCompromiso || !esFechaValida(fechaCompromiso) || !esFechaValida(hoy)) return 'ninguno';
  const dias = diasEntre(hoy, fechaCompromiso);
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'hoy';
  return 'pendiente';
}

/** Texto de la etiqueta de la lista: «Pagará hoy», «Pagará mañana», «Pagará el vie 07/11», «Se pasó el compromiso · vie 07/11». */
export function textoCompromiso(fechaCompromiso: string | null, hoy: string): string {
  const estado = estadoCompromiso(fechaCompromiso, hoy);
  if (estado === 'ninguno' || !fechaCompromiso) return '';
  if (estado === 'vencido') return `Se pasó el compromiso · ${etiquetaFechaCorta(fechaCompromiso)}`;
  if (estado === 'hoy') return 'Pagará hoy';
  if (diasEntre(hoy, fechaCompromiso) === 1) return 'Pagará mañana';
  return `Pagará el ${etiquetaFechaCorta(fechaCompromiso)}`;
}

/**
 * Un compromiso solo cuenta mientras el cliente siga debiendo: si ya no debe nada se ignora
 * (la base también lo borra al saldar la deuda; esto protege los datos antiguos).
 */
export function compromisoVigente(fecha: string | null, saldoPendiente: number): string | null {
  return saldoPendiente > 0 ? fecha : null;
}

export function tieneCompromisoVencido(fila: FilaFiado, hoy: string): boolean {
  return estadoCompromiso(compromisoVigente(fila.cliente.fechaCompromiso, fila.cliente.saldoPendiente), hoy) === 'vencido';
}

export function filtrarCompromisosVencidos(filas: FilaFiado[], hoy: string): FilaFiado[] {
  return filas.filter((f) => tieneCompromisoVencido(f, hoy));
}
