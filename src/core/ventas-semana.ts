/**
 * Vende Fácil — Ventas de los últimos 7 días y producto más vendido del día (lógica pura)
 * ------------------------------------------------------------
 * Para el gráfico de Inicio. Agrupa por día de calendario LOCAL (las ventas se guardan con la hora
 * local del celular, 'YYYY-MM-DD HH:MM:SS'), así que el día no se corre por zona horaria. Los días sin
 * ventas aparecen con 0 (no se saltan) y las ventas anuladas no cuentan, igual que el total de Inicio.
 * Sin UI ni base de datos: se prueba con `tsx`.
 */
import { formatearMonto } from './moneda';
import { redondear } from './reglas-negocio';
import { nombreDiaSemanaCorto, sumarDias } from './fiados-compromiso';

export const DIAS_DEL_GRAFICO = 7;

export interface DiaVentas {
  /** 'YYYY-MM-DD'. */
  fecha: string;
  /** 'hoy' para el día de hoy; si no, 'lun', 'mar'… */
  etiqueta: string;
  total: number;
  numeroVentas: number;
  esHoy: boolean;
}

/** Los últimos `dias` días terminando en `hoy`, del más viejo al más nuevo, con 0 en los días sin ventas. */
export function ventasUltimosDias(
  ventas: { fechaHora: string; total: number; anulada: boolean }[],
  hoy: string,
  dias: number = DIAS_DEL_GRAFICO,
): DiaVentas[] {
  const lista: DiaVentas[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const fecha = sumarDias(hoy, -i);
    lista.push({ fecha, etiqueta: i === 0 ? 'hoy' : nombreDiaSemanaCorto(fecha), total: 0, numeroVentas: 0, esHoy: i === 0 });
  }
  const porFecha = new Map(lista.map((d) => [d.fecha, d]));
  for (const venta of ventas) {
    if (venta.anulada) continue;
    const dia = porFecha.get(venta.fechaHora.slice(0, 10));
    if (!dia) continue;
    dia.total += venta.total;
    dia.numeroVentas += 1;
  }
  for (const d of lista) d.total = redondear(d.total);
  return lista;
}

export function totalDeLosDias(dias: DiaVentas[]): number {
  return redondear(dias.reduce((suma, d) => suma + d.total, 0));
}

/** El día con más ventas (null si ninguno vendió). En un empate gana el más reciente. */
export function mejorDia(dias: DiaVentas[]): DiaVentas | null {
  let mejor: DiaVentas | null = null;
  for (const d of dias) {
    if (d.total > 0 && (mejor === null || d.total >= mejor.total)) mejor = d;
  }
  return mejor;
}

/** Monto compacto para poner sobre cada barra: 85, 245, 1.2k, 12k. */
export function montoCorto(monto: number): string {
  const n = Math.round(monto);
  if (n < 1000) return String(n);
  const miles = n / 1000;
  return miles < 10 ? `${(Math.round(miles * 10) / 10).toString()}k` : `${Math.round(miles)}k`;
}

/** Altura (0 a 1) de cada barra respecto al día más alto. Un día con ventas nunca queda invisible (mínimo 4 %). */
export function alturaRelativa(total: number, maximo: number): number {
  if (!(total > 0) || !(maximo > 0)) return 0;
  return Math.max(0.04, Math.min(1, total / maximo));
}

/** Descripción del gráfico para lectores de pantalla. */
export function descripcionDelGrafico(dias: DiaVentas[], simboloMoneda: string): string {
  const total = totalDeLosDias(dias);
  if (total === 0) return 'Ventas de los últimos 7 días: todavía no hay ventas.';
  const mejor = mejorDia(dias);
  const hoy = dias.find((d) => d.esHoy);
  const partes = [`Ventas de los últimos ${dias.length} días: ${formatearMonto(total, simboloMoneda)} en total`];
  if (hoy) partes.push(`hoy ${formatearMonto(hoy.total, simboloMoneda)}`);
  if (mejor) partes.push(`mejor día ${mejor.esHoy ? 'hoy' : mejor.etiqueta} con ${formatearMonto(mejor.total, simboloMoneda)}`);
  return `${partes.join(', ')}.`;
}

export interface ProductoMasVendido {
  producto: string;
  cantidad: number;
  ingreso: number;
}

/**
 * El producto del que más unidades se vendieron. Empate: gana el que más dinero dejó; si aún empatan,
 * el nombre que va primero alfabéticamente (para que el resultado no cambie de un momento a otro).
 */
export function productoMasVendido(
  lineas: { producto: string; cantidad: number; precioUnitario?: number }[],
): ProductoMasVendido | null {
  const porProducto = new Map<string, ProductoMasVendido>();
  for (const l of lineas) {
    if (!(l.cantidad > 0)) continue;
    const actual = porProducto.get(l.producto) ?? { producto: l.producto, cantidad: 0, ingreso: 0 };
    actual.cantidad += l.cantidad;
    actual.ingreso += l.cantidad * (l.precioUnitario ?? 0);
    porProducto.set(l.producto, actual);
  }
  let mejor: ProductoMasVendido | null = null;
  for (const p of porProducto.values()) {
    p.cantidad = redondear(p.cantidad);
    p.ingreso = redondear(p.ingreso);
    if (
      mejor === null ||
      p.cantidad > mejor.cantidad ||
      (p.cantidad === mejor.cantidad && p.ingreso > mejor.ingreso) ||
      (p.cantidad === mejor.cantidad && p.ingreso === mejor.ingreso && p.producto.localeCompare(mejor.producto, 'es') < 0)
    ) {
      mejor = p;
    }
  }
  return mejor;
}

/** 12 → «12», 1.5 → «1.5», 0.25 → «0.25» (sin ceros de más). */
export function textoCantidad(cantidad: number): string {
  return String(redondear(cantidad));
}
